// Command jitpackd is the JIT-Pack server binary. Configuration is
// entirely via environment variables (see Config).
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	var srv *api.Server
	if cfg.SingleUser {
		log.Printf("starting in single-user mode (user=%s)", cfg.LocalUserID)
		srv = api.NewSingleUser(st, cfg.LocalUserID)
	} else {
		log.Print("starting in multi-user mode")
		srv = api.New(st, []byte(cfg.JWTSecret))
	}

	httpSrv := &http.Server{
		Addr:         cfg.Listen,
		Handler:      srv.Handler(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown on SIGINT/SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("listening on %s", cfg.Listen)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	log.Print("shutting down…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
	log.Print("stopped")
}
