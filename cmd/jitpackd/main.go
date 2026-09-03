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
	"jitpack/internal/webui"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	// Before the store is opened and before OIDC discovery, which exits the
	// process when the issuer is down — the one situation `token create` is
	// most needed in (FR-23.7).
	if len(os.Args) > 2 && os.Args[1] == cmdToken && os.Args[2] == "create" {
		if err := runTokenCreate(context.Background(), os.Args[3:], tokenEnv{
			cfg: cfg, stdout: os.Stdout, stdoutIsTerminal: isTerminal(os.Stdout),
		}); err != nil {
			log.Fatalf("%s create: %v", cmdToken, err)
		}
		return
	}

	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	// Every startup-time choice in one value, so the shape of a
	// configured instance is readable in one place (api.Options).
	opts := api.Options{
		Currency:    cfg.Currency,
		PushContact: cfg.PushContact,
		AdminEmails: cfg.AdminEmails,
	}
	if len(cfg.AdminEmails) > 0 {
		log.Printf("instance admins: %d address(es) (FR-23.1)", len(cfg.AdminEmails))
	}
	if cfg.Currency != "" {
		log.Printf("amounts are labelled %s (FR-21.9)", cfg.Currency)
	}

	var srv *api.Server
	if cfg.SingleUser {
		log.Printf("starting in single-user mode (user=%s)", cfg.LocalUserID)
		// The server attributes every request to this id; seed the row so
		// owner_id foreign keys (trips, memberships) resolve (FR-17.2).
		if err := st.EnsureLocalSingleUserID(context.Background(), cfg.LocalUserID); err != nil {
			log.Fatalf("seed local user: %v", err)
		}
		srv = api.NewSingleUser(st, cfg.LocalUserID, opts)
	} else {
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
			opts.OIDC = &api.OIDCConfig{
				Discovery:    d,
				ClientID:     cfg.OIDCClientID,
				ClientSecret: cfg.OIDCClientSecret,
				JWKS:         jwks,
			}
			log.Printf("starting in multi-user mode (OIDC broker: %s)", cfg.OIDCIssuer)
		} else {
			log.Print("starting in multi-user mode (externally minted session tokens)")
		}
		srv = api.New(st, []byte(cfg.SessionSecret), opts)
	}

	// The API first, then the client bundle around it when this process is
	// also the web server (ADR-043). A configured root that cannot be served
	// stops the process: an instance answering a white page hides the mistake
	// until someone opens a browser.
	handler := srv.Handler()
	if cfg.WebRoot != "" {
		handler, err = webui.Handler(cfg.WebRoot, handler, api.APIPrefix, api.RouteWS, api.RouteHealth)
		if err != nil {
			log.Fatalf("web ui: %v", err)
		}
		log.Printf("serving the client from %s", cfg.WebRoot)
	}

	httpSrv := &http.Server{
		Addr:         cfg.Listen,
		Handler:      handler,
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
