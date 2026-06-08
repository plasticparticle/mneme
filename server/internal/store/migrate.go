package store

import (
	"context"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/plasticparticle/mneme/server/migrations"
)

// Migrate applies any not-yet-applied SQL migrations in version order. Forward-only:
// migrations are never edited in place, only added. Each file runs in its own
// transaction together with the bookkeeping insert, so a failure rolls back cleanly.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INT PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		return fmt.Errorf("ensure schema_migrations: %w", err)
	}

	files, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}
	sort.Strings(files)

	for _, name := range files {
		version, err := versionOf(name)
		if err != nil {
			return err
		}

		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)`, version).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %d: %w", version, err)
		}
		if exists {
			continue
		}

		body, err := migrations.FS.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit %s: %w", name, err)
		}
	}
	return nil
}

// versionOf parses the leading integer of a filename like "0001_init.sql".
func versionOf(name string) (int, error) {
	base := name
	if i := strings.IndexByte(base, '_'); i >= 0 {
		base = base[:i]
	} else {
		base = strings.TrimSuffix(base, ".sql")
	}
	v, err := strconv.Atoi(base)
	if err != nil {
		return 0, fmt.Errorf("migration %q has no leading version number: %w", name, err)
	}
	return v, nil
}
