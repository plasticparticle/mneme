package api

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/plasticparticle/mneme/server/internal/blobs"
	"github.com/plasticparticle/mneme/server/internal/config"
	"github.com/plasticparticle/mneme/server/internal/store"
)

type Server struct {
	store *store.Store
	blobs blobs.Store
	cfg   config.Config
}

func New(st *store.Store, bl blobs.Store, cfg config.Config) *Server {
	if bl == nil {
		bl = blobs.Disabled{}
	}
	return &Server{store: st, blobs: bl, cfg: cfg}
}

// Routes builds the HTTP handler. Uses Go 1.22 method+pattern routing — no router dep.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// Public
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /readyz", s.handleReady)
	mux.HandleFunc("POST /v1/register", s.handleRegister)
	mux.HandleFunc("POST /v1/auth/challenge", s.handleChallenge)
	mux.HandleFunc("POST /v1/auth/verify", s.handleVerify)

	// Authenticated (owner-scoped)
	mux.Handle("POST /v1/sync/push", s.auth(http.HandlerFunc(s.handlePush)))
	mux.Handle("POST /v1/sync/pull", s.auth(http.HandlerFunc(s.handlePull)))
	mux.Handle("GET /v1/reminders", s.auth(http.HandlerFunc(s.handleListReminders)))
	mux.Handle("PUT /v1/reminders", s.auth(http.HandlerFunc(s.handlePutReminder)))
	mux.Handle("DELETE /v1/reminders/{id}", s.auth(http.HandlerFunc(s.handleDeleteReminder)))
	mux.Handle("PUT /v1/media/{id}/chunks/{n}", s.auth(http.HandlerFunc(s.handlePutMediaChunk)))
	mux.Handle("POST /v1/media/{id}/complete", s.auth(http.HandlerFunc(s.handleCompleteMedia)))
	mux.Handle("GET /v1/media/{id}", s.auth(http.HandlerFunc(s.handleGetMedia)))
	mux.Handle("GET /v1/media/{id}/chunks/{n}", s.auth(http.HandlerFunc(s.handleGetMediaChunk)))
	mux.Handle("DELETE /v1/media/{id}", s.auth(http.HandlerFunc(s.handleDeleteMedia)))
	mux.Handle("DELETE /v1/account", s.auth(http.HandlerFunc(s.handleDeleteAccount)))

	return s.cors(logging(mux))
}

// ── auth context ────────────────────────────────────────────────────────────

type ctxKey int

const principalKey ctxKey = iota

type principal struct {
	OwnerID  string
	DeviceID string
}

func principalOf(ctx context.Context) principal {
	p, _ := ctx.Value(principalKey).(principal)
	return p
}

// auth validates the Bearer session token and injects the owner/device principal.
// Tenant isolation lives here: every authenticated handler reads owner_id from the
// principal, never from the request body.
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		hash := sha256.Sum256([]byte(token))
		ownerID, deviceID, err := s.store.LookupSession(r.Context(), hash[:])
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or expired session")
			return
		}
		ctx := context.WithValue(r.Context(), principalKey, principal{OwnerID: ownerID, DeviceID: deviceID})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func bearerToken(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):]), true
	}
	return "", false
}

// ── helpers ─────────────────────────────────────────────────────────────────

// deriveID is the stable public identifier for a public key: base64url(sha256(pub)).
func deriveID(pub []byte) string {
	sum := sha256.Sum256(pub)
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		log.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}
