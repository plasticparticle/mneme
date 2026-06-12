// Package config loads relay configuration from the environment.
package config

import (
	"os"
	"time"
)

type Config struct {
	DatabaseURL string
	ListenAddr  string
	SessionTTL  time.Duration
	CORSOrigins string // comma-separated allowed origins, or "*" to reflect any
	AdminToken  string // bearer token for /admin; empty disables the admin surface entirely
	S3          S3Config
}

// S3Config is consumed by the (not-yet-wired) media blob coordination — §10 step 5.
type S3Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
}

// Load reads configuration from the environment, applying dev-friendly defaults.
func Load() Config {
	return Config{
		DatabaseURL: env("DATABASE_URL", "postgres://journal:journal_dev@localhost:5432/journal?sslmode=disable"),
		ListenAddr:  env("LISTEN_ADDR", ":8080"),
		SessionTTL:  envDuration("SESSION_TTL", 24*time.Hour),
		CORSOrigins: env("CORS_ORIGINS", "*"),
		AdminToken:  env("ADMIN_TOKEN", ""),
		S3: S3Config{
			Endpoint:  env("S3_ENDPOINT", ""),
			AccessKey: env("S3_ACCESS_KEY", ""),
			SecretKey: env("S3_SECRET_KEY", ""),
			Bucket:    env("S3_BUCKET", ""),
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
