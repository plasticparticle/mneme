package api

import (
	"net/http"
	"strings"
)

// cors wraps the handler with permissive-by-config CORS and answers preflight
// OPTIONS. No cookies are used (auth is a Bearer header), so reflecting the
// origin is safe. Configure allowed origins via CORS_ORIGINS ("*" reflects any).
func (s *Server) cors(next http.Handler) http.Handler {
	allowAny := strings.TrimSpace(s.cfg.CORSOrigins) == "*"
	allowed := map[string]bool{}
	if !allowAny {
		for _, o := range strings.Split(s.cfg.CORSOrigins, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowed[o] = true
			}
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (allowAny || allowed[origin]) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
