package api

import (
	"context"
	"log"
	"sync"
	"time"
)

// Metric names persisted to usage_daily (owner-less aggregates by design):
//
//	requests        — client API requests (/v1/* only; health probes and /admin excluded)
//	requests_failed — /v1/* requests answered with a 4xx/5xx
//	records_created — new oplog rows (entries + templates — indistinguishable by design)
//	records_updated — LWW updates to existing rows
//	records_deleted — tombstones applied
//	media_uploaded  — newly finalized media objects (kind unknown — mime never reaches the relay)
//	media_bytes     — ciphertext bytes of newly finalized media
//	vaults_created  — new owners registered
//	vaults_deleted  — accounts wiped (mnemonic rotation)
const (
	metricRequests       = "requests"
	metricRequestsFailed = "requests_failed"
	metricRecordsCreated = "records_created"
	metricRecordsUpdated = "records_updated"
	metricRecordsDeleted = "records_deleted"
	metricMediaUploaded  = "media_uploaded"
	metricMediaBytes     = "media_bytes"
	metricVaultsCreated  = "vaults_created"
	metricVaultsDeleted  = "vaults_deleted"
)

// metrics buffers usage counters in memory between flushes and keeps
// process-lifetime runtime figures for the health view. Losing up to one flush
// interval of counters on a crash is an accepted trade for not writing to
// Postgres on every request.
type metrics struct {
	startedAt time.Time

	mu      sync.Mutex
	pending map[string]int64

	requests     int64
	failed4xx    int64
	failed5xx    int64
	totalLatency time.Duration
	maxLatency   time.Duration
}

func newMetrics() *metrics {
	return &metrics{startedAt: time.Now(), pending: map[string]int64{}}
}

// bump adds n to a pending daily counter.
func (m *metrics) bump(metric string, n int64) {
	if n == 0 {
		return
	}
	m.mu.Lock()
	m.pending[metric] += n
	m.mu.Unlock()
}

// observe records one served client API request.
func (m *metrics) observe(status int, d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pending[metricRequests]++
	m.requests++
	switch {
	case status >= 500:
		m.pending[metricRequestsFailed]++
		m.failed5xx++
	case status >= 400:
		m.pending[metricRequestsFailed]++
		m.failed4xx++
	}
	m.totalLatency += d
	if d > m.maxLatency {
		m.maxLatency = d
	}
}

// drain swaps out and returns the pending counters.
func (m *metrics) drain() map[string]int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.pending) == 0 {
		return nil
	}
	out := m.pending
	m.pending = map[string]int64{}
	return out
}

// restore folds counters back after a failed flush so they retry next interval.
func (m *metrics) restore(counts map[string]int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, v := range counts {
		m.pending[k] += v
	}
}

// runtimeStats is the since-process-start health snapshot for /admin/stats.
type runtimeStats struct {
	StartedAt     time.Time `json:"started_at"`
	UptimeSeconds int64     `json:"uptime_seconds"`
	Requests      int64     `json:"requests"`
	Failed4xx     int64     `json:"failed_4xx"`
	Failed5xx     int64     `json:"failed_5xx"`
	AvgLatencyMs  float64   `json:"avg_latency_ms"`
	MaxLatencyMs  float64   `json:"max_latency_ms"`
}

func (m *metrics) runtime() runtimeStats {
	m.mu.Lock()
	defer m.mu.Unlock()
	rs := runtimeStats{
		StartedAt:     m.startedAt.UTC(),
		UptimeSeconds: int64(time.Since(m.startedAt).Seconds()),
		Requests:      m.requests,
		Failed4xx:     m.failed4xx,
		Failed5xx:     m.failed5xx,
		MaxLatencyMs:  float64(m.maxLatency.Microseconds()) / 1000,
	}
	if m.requests > 0 {
		rs.AvgLatencyMs = float64(m.totalLatency.Microseconds()) / 1000 / float64(m.requests)
	}
	return rs
}

// FlushUsage persists the buffered counters into usage_daily.
func (s *Server) FlushUsage(ctx context.Context) {
	counts := s.metrics.drain()
	if counts == nil || s.store == nil {
		return
	}
	if err := s.store.AddUsage(ctx, counts); err != nil {
		log.Printf("usage flush: %v", err)
		s.metrics.restore(counts)
	}
}

// RunUsageFlusher periodically persists usage counters until ctx is cancelled,
// then performs one final flush so a graceful shutdown loses nothing.
func (s *Server) RunUsageFlusher(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			flushCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			s.FlushUsage(flushCtx)
			cancel()
			return
		case <-ticker.C:
			s.FlushUsage(ctx)
		}
	}
}
