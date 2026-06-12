package store

import (
	"context"
	"time"
)

// Admin statistics. Two privacy rules govern everything in this file:
//
//  1. usage_daily aggregates carry NO owner_id — daily activity counters can
//     never be attributed to a vault, not even by the admin.
//  2. Per-vault figures expose only what the relay already stores as accepted
//     metadata (§3): record counts, ciphertext sizes, timestamps. Never content.

// AddUsage adds the given deltas to today's usage counters (UTC day boundary).
// Counts are accumulated in memory by the API layer and flushed in batches, so
// one HTTP request does not cost one extra DB write.
func (s *Store) AddUsage(ctx context.Context, counts map[string]int64) error {
	if len(counts) == 0 {
		return nil
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op

	for metric, n := range counts {
		if n == 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO usage_daily (day, metric, count)
			VALUES ((now() AT TIME ZONE 'utc')::date, $1, $2)
			ON CONFLICT (day, metric) DO UPDATE
				SET count = usage_daily.count + EXCLUDED.count`,
			metric, n); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// UsageDay is one day's worth of aggregate counters.
type UsageDay struct {
	Day    string // YYYY-MM-DD (UTC)
	Counts map[string]int64
}

// UsageHistory returns per-day counters for the last `days` days, oldest first.
func (s *Store) UsageHistory(ctx context.Context, days int) ([]UsageDay, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT day::text, metric, count
		FROM usage_daily
		WHERE day > (now() AT TIME ZONE 'utc')::date - $1::int
		ORDER BY day ASC`,
		days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []UsageDay
	for rows.Next() {
		var day, metric string
		var count int64
		if err := rows.Scan(&day, &metric, &count); err != nil {
			return nil, err
		}
		if len(out) == 0 || out[len(out)-1].Day != day {
			out = append(out, UsageDay{Day: day, Counts: map[string]int64{}})
		}
		out[len(out)-1].Counts[metric] = count
	}
	return out, rows.Err()
}

// VaultStats is the storage footprint of one vault (owner). The owner id is an
// opaque pubkey hash — pseudonymous by construction, never an identity.
type VaultStats struct {
	OwnerID      string
	CreatedAt    time.Time
	Devices      int64
	Records      int64 // live oplog rows (entries + templates — indistinguishable by design)
	RecordBytes  int64 // total ciphertext bytes, tombstones included (actual storage used)
	MediaObjects int64
	MediaBytes   int64
	LastActivity *time.Time // newest oplog write, nil for an empty vault
}

// ListVaultStats returns one row per vault, oldest vault first. Fine for the
// self-host scale this relay targets (hundreds of owners, §7).
func (s *Store) ListVaultStats(ctx context.Context) ([]VaultStats, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT o.owner_id,
		       o.created_at,
		       (SELECT count(*) FROM devices d WHERE d.owner_id = o.owner_id),
		       coalesce(e.records, 0),
		       coalesce(e.bytes, 0),
		       coalesce(m.objects, 0),
		       coalesce(m.bytes, 0),
		       e.last_activity
		FROM owners o
		LEFT JOIN (
			SELECT owner_id,
			       count(*) FILTER (WHERE NOT deleted) AS records,
			       sum(length(ciphertext))             AS bytes,
			       max(updated_at)                     AS last_activity
			FROM entry_blobs GROUP BY owner_id
		) e ON e.owner_id = o.owner_id
		LEFT JOIN (
			SELECT owner_id, count(*) AS objects, sum(bytes) AS bytes
			FROM media_blobs GROUP BY owner_id
		) m ON m.owner_id = o.owner_id
		ORDER BY o.created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []VaultStats
	for rows.Next() {
		var v VaultStats
		if err := rows.Scan(&v.OwnerID, &v.CreatedAt, &v.Devices, &v.Records,
			&v.RecordBytes, &v.MediaObjects, &v.MediaBytes, &v.LastActivity); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
