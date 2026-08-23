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
		// The server attributes every request to this id; seed the row so
		// owner_id foreign keys (trips, memberships) resolve (FR-17.2).
		if err := st.EnsureLocalSingleUserID(context.Background(), cfg.LocalUserID); err != nil {
			log.Fatalf("seed local user: %v", err)
		}
		srv = api.NewSingleUser(st, cfg.LocalUserID)
	} else {
		srv = api.New(st, []byte(cfg.SessionSecret))
		if cfg.OIDCIssuer != "" {
			// One configured endpoint, everything else discovered —
			// authorize/token/userinfo for the broker, jwks_uri for the
			// ID-token check (ADR-007).
			d, err := api.FetchDiscovery(cfg.OIDCIssuer)
			if err != nil {
				log.Fatalf("oidc discovery: %v", err)
			}
			jwks, err := api.NewJWKSProvider(d.JWKSURI)
			if err != nil {
				log.Fatalf("jwks: %v", err)
			}
			defer jwks.Close()
			srv.EnableOIDC(d, cfg.OIDCClientID, cfg.OIDCClientSecret, jwks)
			log.Printf("starting in multi-user mode (OIDC broker: %s)", cfg.OIDCIssuer)
		} else {
			log.Print("starting in multi-user mode (externally minted session tokens)")
		}
	}
	// Sync-API §7: zero means unset, and the API layer's own default
	// stands — SetLockTimeout ignores it.
	srv.SetLockTimeout(cfg.LockTimeout)
	if cfg.PushContact != "" {
		srv.SetPushContact(cfg.PushContact)
	}
	if len(cfg.AdminEmails) > 0 {
		log.Printf("instance admins: %d address(es) (FR-23.1)", len(cfg.AdminEmails))
		srv.SetAdminEmails(cfg.AdminEmails)
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
