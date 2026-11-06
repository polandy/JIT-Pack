package api

import (
	"context"
	"errors"
	"time"
)

// The backoff ConnectOIDC retries an unreachable issuer with: doubling
// from the first delay, capped. The first is short because the ordinary
// outage is a reverse proxy restarting beside this server — seconds
// (ADR-109); the cap keeps a longer one at one log line a minute.
const (
	oidcRetryFirst = time.Second
	oidcRetryMax   = time.Minute
)

// The two lines ConnectOIDC is judged by, named once because the tests
// assert against them (CODING_PRINCIPLES §4a).
const (
	msgOIDCConnectFailed = "OIDC login unavailable: the issuer could not be resolved; retrying"
	msgOIDCConnected     = "OIDC login ready"
)

// ConnectOIDC resolves the configured issuer — its discovery document,
// then its signing keys — and installs the login broker, retrying with
// capped exponential backoff while the issuer is unreachable (ADR-109).
// Until it returns nil, the auth endpoints answer 503: the server
// serves everything else meanwhile, and never a login it could not
// verify.
//
// Every failed attempt is logged, and the success once. It returns nil
// once the broker is installed (at once, if there is no OIDC to
// resolve or it already is), ctx's error when ctx ends first, and an
// ErrOIDCMisconfigured error for a document no retry can fix. The key
// set's background refresh stops with ctx.
func (s *Server) ConnectOIDC(ctx context.Context) error {
	cfg := s.oidcConfig
	if cfg == nil || s.oidc.Load() != nil {
		return nil
	}
	wait := cfg.RetryWait
	if wait == nil {
		wait = waitTimer
	}
	delay := oidcRetryFirst
	for attempt := 1; ; attempt++ {
		b, err := s.resolveBroker(*cfg)
		if err == nil {
			context.AfterFunc(ctx, b.jwks.Close)
			s.oidc.Store(b)
			s.logger.Info(msgOIDCConnected, "issuer", cfg.Issuer, "attempts", attempt)
			return nil
		}
		if errors.Is(err, ErrOIDCMisconfigured) {
			return err
		}
		s.logger.Warn(msgOIDCConnectFailed,
			"issuer", cfg.Issuer, "attempt", attempt, "retry_in", delay, "error", err)
		if err := wait(ctx, delay); err != nil {
			return err
		}
		delay = min(2*delay, oidcRetryMax)
	}
}

// resolveBroker is one attempt: discovery, then the key set it names.
// Both are retried together, since a key set without the discovery it
// came from is no broker.
func (s *Server) resolveBroker(cfg OIDCConfig) (*oidcBroker, error) {
	d, err := FetchDiscovery(cfg.Issuer)
	if err != nil {
		return nil, err
	}
	jwks, err := NewJWKSProvider(d.JWKSURI)
	if err != nil {
		return nil, err
	}
	jwks.SetLogger(s.logger)
	return newOIDCBroker(cfg, d, jwks), nil
}

// waitTimer waits d on a real timer, or until ctx ends.
func waitTimer(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
