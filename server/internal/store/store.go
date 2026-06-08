// Package store is the Postgres data layer for the relay. It stores only opaque
// ciphertext and metadata, and every entry/reminder query is scoped by owner_id
// so a tenant can never reach another tenant's rows.
package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

// New opens a connection pool and verifies connectivity.
func New(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// Migrate applies pending migrations.
func (s *Store) Migrate(ctx context.Context) error { return Migrate(ctx, s.pool) }

// ── Owners & devices ────────────────────────────────────────────────────────

// RegisterOwnerDevice creates the owner if absent (trust-on-first-use) and binds
// the device to it. Idempotent: re-registering the same keys is a no-op.
func (s *Store) RegisterOwnerDevice(ctx context.Context, ownerID string, ownerPub []byte, deviceID string, devicePub []byte) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op

	if _, err := tx.Exec(ctx,
		`INSERT INTO owners (owner_id, owner_pubkey) VALUES ($1, $2) ON CONFLICT (owner_id) DO NOTHING`,
		ownerID, ownerPub); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO devices (device_id, owner_id, device_pubkey) VALUES ($1, $2, $3) ON CONFLICT (device_id) DO NOTHING`,
		deviceID, ownerID, devicePub); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

var ErrNotFound = errors.New("not found")

// DevicePubkey returns the owner_id and Ed25519 public key for a device.
func (s *Store) DevicePubkey(ctx context.Context, deviceID string) (ownerID string, pub []byte, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT owner_id, device_pubkey FROM devices WHERE device_id = $1`, deviceID).
		Scan(&ownerID, &pub)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrNotFound
	}
	return ownerID, pub, err
}

// ── Auth: challenges & sessions ─────────────────────────────────────────────

func (s *Store) SaveChallenge(ctx context.Context, deviceID string, challenge []byte, expires time.Time) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO auth_challenges (device_id, challenge, expires_at) VALUES ($1, $2, $3)`,
		deviceID, challenge, expires)
	return err
}

// ConsumeChallenge atomically deletes a still-valid challenge, returning true if
// it existed and had not expired (single-use).
func (s *Store) ConsumeChallenge(ctx context.Context, deviceID string, challenge []byte) (bool, error) {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM auth_challenges WHERE device_id = $1 AND challenge = $2 AND expires_at > now()`,
		deviceID, challenge)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (s *Store) CreateSession(ctx context.Context, tokenHash []byte, deviceID, ownerID string, expires time.Time) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (token_hash, device_id, owner_id, expires_at) VALUES ($1, $2, $3, $4)`,
		tokenHash, deviceID, ownerID, expires)
	return err
}

// LookupSession returns the owner/device for a valid, unexpired session token hash.
func (s *Store) LookupSession(ctx context.Context, tokenHash []byte) (ownerID, deviceID string, err error) {
	err = s.pool.QueryRow(ctx,
		`SELECT owner_id, device_id FROM sessions WHERE token_hash = $1 AND expires_at > now()`,
		tokenHash).Scan(&ownerID, &deviceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrNotFound
	}
	return ownerID, deviceID, err
}

// PurgeExpired removes stale challenges and sessions. Safe to call periodically.
func (s *Store) PurgeExpired(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM auth_challenges WHERE expires_at <= now()`); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	return err
}

// ── Sync: LWW oplog ─────────────────────────────────────────────────────────

type EntryBlob struct {
	EntryID    string
	LWWClock   int64
	Ciphertext []byte
	Deleted    bool
	Seq        int64
}

// PushEntry applies a single entry using last-write-wins on lww_clock. Returns
// applied=false when the incoming clock is not strictly newer than what's stored.
// The server never inspects ciphertext — only the clock decides.
func (s *Store) PushEntry(ctx context.Context, ownerID string, e EntryBlob) (applied bool, err error) {
	var seq int64
	err = s.pool.QueryRow(ctx, `
		INSERT INTO entry_blobs (owner_id, entry_id, lww_clock, ciphertext, deleted, seq, updated_at)
		VALUES ($1, $2, $3, $4, $5, nextval('entry_seq'), now())
		ON CONFLICT (owner_id, entry_id) DO UPDATE
			SET lww_clock  = EXCLUDED.lww_clock,
			    ciphertext = EXCLUDED.ciphertext,
			    deleted    = EXCLUDED.deleted,
			    seq        = nextval('entry_seq'),
			    updated_at = now()
			WHERE EXCLUDED.lww_clock > entry_blobs.lww_clock
		RETURNING seq`,
		ownerID, e.EntryID, e.LWWClock, e.Ciphertext, e.Deleted).Scan(&seq)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil // conflict, and incoming clock was not newer
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// PullEntries returns entries for an owner with seq strictly greater than `since`,
// ordered by seq, capped at `limit`. The caller derives the next cursor from the
// last returned Seq.
func (s *Store) PullEntries(ctx context.Context, ownerID string, since int64, limit int) ([]EntryBlob, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT entry_id, lww_clock, ciphertext, deleted, seq
		FROM entry_blobs
		WHERE owner_id = $1 AND seq > $2
		ORDER BY seq ASC
		LIMIT $3`,
		ownerID, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []EntryBlob
	for rows.Next() {
		var e EntryBlob
		if err := rows.Scan(&e.EntryID, &e.LWWClock, &e.Ciphertext, &e.Deleted, &e.Seq); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ── Reminders ───────────────────────────────────────────────────────────────

type Reminder struct {
	ReminderID string
	FireAt     time.Time
	Dispatched bool
}

func (s *Store) UpsertReminder(ctx context.Context, ownerID, reminderID string, fireAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO reminders (owner_id, reminder_id, fire_at, dispatched)
		VALUES ($1, $2, $3, false)
		ON CONFLICT (owner_id, reminder_id) DO UPDATE
			SET fire_at = EXCLUDED.fire_at, dispatched = false`,
		ownerID, reminderID, fireAt)
	return err
}

func (s *Store) ListReminders(ctx context.Context, ownerID string) ([]Reminder, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT reminder_id, fire_at, dispatched FROM reminders WHERE owner_id = $1 ORDER BY fire_at ASC`,
		ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Reminder
	for rows.Next() {
		var r Reminder
		if err := rows.Scan(&r.ReminderID, &r.FireAt, &r.Dispatched); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) DeleteReminder(ctx context.Context, ownerID, reminderID string) (bool, error) {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM reminders WHERE owner_id = $1 AND reminder_id = $2`, ownerID, reminderID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// DueReminder is one reminder ready to fire, with its owner.
type DueReminder struct {
	OwnerID    string
	ReminderID string
	FireAt     time.Time
}

// ClaimDueReminders marks up-to-`limit` due reminders dispatched and returns them.
// Atomic claim (UPDATE ... RETURNING) so concurrent schedulers don't double-fire.
func (s *Store) ClaimDueReminders(ctx context.Context, now time.Time, limit int) ([]DueReminder, error) {
	rows, err := s.pool.Query(ctx, `
		UPDATE reminders SET dispatched = true
		WHERE (owner_id, reminder_id) IN (
			SELECT owner_id, reminder_id FROM reminders
			WHERE NOT dispatched AND fire_at <= $1
			ORDER BY fire_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		RETURNING owner_id, reminder_id, fire_at`,
		now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DueReminder
	for rows.Next() {
		var d DueReminder
		if err := rows.Scan(&d.OwnerID, &d.ReminderID, &d.FireAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
