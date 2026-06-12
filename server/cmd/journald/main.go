// Command journald is the Mneme relay: a dumb, owner-scoped encrypted-blob store.
// It never sees plaintext, keys, or the mnemonic. See CLAUDE.md §1, §7.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/plasticparticle/mneme/server/internal/api"
	"github.com/plasticparticle/mneme/server/internal/blobs"
	"github.com/plasticparticle/mneme/server/internal/config"
	"github.com/plasticparticle/mneme/server/internal/reminders"
	"github.com/plasticparticle/mneme/server/internal/store"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("journald: %v", err)
	}
}

func run() error {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Connect + migrate (with a bounded startup window so a missing DB fails fast-ish).
	startCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	st, err := store.New(startCtx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	if err := st.Migrate(startCtx); err != nil {
		return err
	}
	log.Printf("migrations applied")

	bl, err := blobs.New(cfg.S3)
	if err != nil {
		return err
	}
	if _, disabled := bl.(blobs.Disabled); disabled {
		log.Printf("media storage disabled (S3_ENDPOINT not set)")
	}

	apiSrv := api.New(st, bl, cfg)

	// Background workers.
	go reminders.NewScheduler(st, reminders.LogDispatcher{}, time.Minute).Run(ctx)
	go purgeLoop(ctx, st)
	go apiSrv.RunUsageFlusher(ctx, 30*time.Second)

	if cfg.AdminToken != "" {
		log.Printf("admin dashboard enabled at /admin")
	}

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           apiSrv.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Serve until a signal arrives, then drain gracefully.
	serveErr := make(chan error, 1)
	go func() {
		log.Printf("listening on %s", cfg.ListenAddr)
		serveErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		log.Printf("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}

// purgeLoop periodically clears expired auth challenges and sessions.
func purgeLoop(ctx context.Context, st *store.Store) {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := st.PurgeExpired(ctx); err != nil {
				log.Printf("purge expired: %v", err)
			}
		}
	}
}
