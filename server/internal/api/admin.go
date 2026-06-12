package api

import (
	"crypto/subtle"
	_ "embed"
	"net/http"
	"time"
)

// The admin surface shows only what the relay already stores as accepted
// metadata (§3): vault counts, ciphertext sizes, timestamps, and owner-less
// daily aggregates. It can never show content, identities, or per-vault
// activity history — the data for that does not exist server-side.
//
// Enabled only when ADMIN_TOKEN is set; otherwise every /admin path is a 404,
// indistinguishable from a route that does not exist.

//go:embed dashboard.html
var dashboardHTML []byte

// adminAuth gates an admin endpoint behind the configured token.
func (s *Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.AdminToken == "" {
			http.NotFound(w, r)
			return
		}
		token, ok := bearerToken(r)
		if !ok || subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.AdminToken)) != 1 {
			writeError(w, http.StatusUnauthorized, "invalid admin token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GET /admin — the dashboard page. Static HTML with no data baked in; the page
// itself asks for the token and fetches /admin/stats with it.
func (s *Server) handleAdminPage(w http.ResponseWriter, r *http.Request) {
	if s.cfg.AdminToken == "" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(dashboardHTML)
}

// vaultLabel truncates an opaque owner id for display. The full id is already
// pseudonymous (a pubkey hash); the prefix is just enough to track a vault's
// footprint over time without inviting cross-referencing.
func vaultLabel(ownerID string) string {
	if len(ownerID) > 8 {
		return ownerID[:8] + "…"
	}
	return ownerID
}

// GET /admin/stats — aggregate health/usage snapshot as JSON.
func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	vaults, err := s.store.ListVaultStats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "vault stats failed")
		return
	}
	daily, err := s.store.UsageHistory(r.Context(), 30)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "usage history failed")
		return
	}

	type vaultRow struct {
		Vault        string     `json:"vault"` // truncated opaque id, not an identity
		CreatedAt    time.Time  `json:"created_at"`
		Devices      int64      `json:"devices"`
		Records      int64      `json:"records"`
		RecordBytes  int64      `json:"record_bytes"`
		MediaObjects int64      `json:"media_objects"`
		MediaBytes   int64      `json:"media_bytes"`
		LastActivity *time.Time `json:"last_activity"`
	}
	type totals struct {
		Vaults       int64 `json:"vaults"`
		Devices      int64 `json:"devices"`
		Records      int64 `json:"records"`
		RecordBytes  int64 `json:"record_bytes"`
		MediaObjects int64 `json:"media_objects"`
		MediaBytes   int64 `json:"media_bytes"`
	}
	type dayRow struct {
		Day    string           `json:"day"`
		Counts map[string]int64 `json:"counts"`
	}

	var t totals
	rows := make([]vaultRow, 0, len(vaults))
	for _, v := range vaults {
		t.Vaults++
		t.Devices += v.Devices
		t.Records += v.Records
		t.RecordBytes += v.RecordBytes
		t.MediaObjects += v.MediaObjects
		t.MediaBytes += v.MediaBytes
		rows = append(rows, vaultRow{
			Vault:        vaultLabel(v.OwnerID),
			CreatedAt:    v.CreatedAt.UTC(),
			Devices:      v.Devices,
			Records:      v.Records,
			RecordBytes:  v.RecordBytes,
			MediaObjects: v.MediaObjects,
			MediaBytes:   v.MediaBytes,
			LastActivity: v.LastActivity,
		})
	}

	days := make([]dayRow, 0, len(daily))
	for _, d := range daily {
		days = append(days, dayRow{Day: d.Day, Counts: d.Counts})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"totals":  t,
		"vaults":  rows,
		"daily":   days,
		"runtime": s.metrics.runtime(),
	})
}
