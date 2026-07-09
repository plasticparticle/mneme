// Package config loads relay configuration from the environment.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL string
	ListenAddr  string
	SessionTTL  time.Duration
	CORSOrigins string // comma-separated allowed origins, or "*" to reflect any
	AdminToken  string // bearer token for /admin; empty disables the admin surface entirely
	Version     string // build identifier, set by main (not from the environment)
	UpdateCheck bool   // whether the admin surface may query GitHub for a newer release
	// RequireApproval gates new vaults behind operator approval. Off by default
	// (open trust-on-first-use). When on, a newly registered owner is 'pending'
	// and cannot authenticate until approved in /admin; owners already on the
	// relay are grandfathered to 'approved' by migration 0003, so turning this on
	// never locks out an existing user. See CLAUDE.md §3 / docs/API.md "Admin".
	RequireApproval bool
	S3              S3Config
	Backup          BackupConfig
}

// S3Config is consumed by the (not-yet-wired) media blob coordination — §10 step 5.
type S3Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
}

// BackupConfig governs operator backups (internal/backup). A backup is a single
// archive of every vault's opaque ciphertext blobs + media chunks — no keys, no
// plaintext — so it is exactly as sensitive as the relay's own storage. An empty
// Dir disables the scheduled worker and the dashboard's server-side backup actions
// (the `journald backup`/`restore` CLI subcommands still work with an explicit path).
type BackupConfig struct {
	Dir      string        // BACKUP_DIR; empty disables server-side backups
	Interval time.Duration // BACKUP_INTERVAL; cadence of the scheduled worker
	Keep     int           // BACKUP_KEEP; retained archives (newest first), 0 = keep all
}

// Load reads configuration from the environment, applying dev-friendly defaults.
func Load() Config {
	return Config{
		DatabaseURL: env("DATABASE_URL", "postgres://journal:journal_dev@localhost:5432/journal?sslmode=disable"),
		ListenAddr:  env("LISTEN_ADDR", ":8080"),
		SessionTTL:  envDuration("SESSION_TTL", 24*time.Hour),
		CORSOrigins: env("CORS_ORIGINS", "*"),
		AdminToken:  env("ADMIN_TOKEN", ""),
		// Version is stamped in by main via -ldflags; not an env value.
		UpdateCheck:     envBool("UPDATE_CHECK", true),
		RequireApproval: envBool("REQUIRE_APPROVAL", false),
		S3: S3Config{
			Endpoint:  env("S3_ENDPOINT", ""),
			AccessKey: env("S3_ACCESS_KEY", ""),
			SecretKey: env("S3_SECRET_KEY", ""),
			Bucket:    env("S3_BUCKET", ""),
		},
		Backup: BackupConfig{
			Dir:      env("BACKUP_DIR", ""),
			Interval: envDuration("BACKUP_INTERVAL", 24*time.Hour),
			Keep:     envInt("BACKUP_KEEP", 7),
		},
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envBool(key string, def bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "":
		return def
	case "0", "false", "off", "no":
		return false
	default:
		return true
	}
}
