package api

// A failure that changes nothing for the caller is still a failure. The
// two places covered here answer the request correctly whatever happens —
// a JWKS refresh that fails keeps serving the cached keys, and a session
// cleanup that fails still ends the session for the client — so the only
// evidence either one ever produces is a log line. Each test asserts that
// line, because without it the failure is unobservable.

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"jitpack/internal/store"
)

// captureLogs redirects the default logger into a buffer for one test and
// restores it afterwards. No test in this package runs in parallel, so the
// swap is confined to the test that made it.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return &buf
}

// A JWKS endpoint that is down stays down for minutes. The tick reports
// the outage once and the recovery once — a line every five minutes is a
// drip that buries the moment the keys came back.
func TestJWKSRefreshTick_ReportsTheOutageOnceAndTheRecoveryOnce(t *testing.T) {
	logs := captureLogs(t)

	var failing atomic.Bool
	failing.Store(true)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if failing.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[]}`))
	}))
	t.Cleanup(srv.Close)

	p := &JWKSProvider{url: srv.URL, client: srv.Client()}

	p.refreshTick()
	if got := strings.Count(logs.String(), msgJWKSRefreshFailed); got != 1 {
		t.Fatalf("first failing tick logged %d warnings, want 1 — an unreachable IdP is invisible until logins fail", got)
	}

	p.refreshTick()
	if got := strings.Count(logs.String(), msgJWKSRefreshFailed); got != 1 {
		t.Errorf("the same outage logged %d times, want 1", got)
	}

	failing.Store(false)
	p.refreshTick()
	if got := strings.Count(logs.String(), msgJWKSRefreshRecovered); got != 1 {
		t.Errorf("recovery logged %d times, want 1", got)
	}

	p.refreshTick()
	if got := strings.Count(logs.String(), msgJWKSRefreshRecovered); got != 1 {
		t.Errorf("a healthy tick after the recovery logged again (%d), want silence", got)
	}
}

// A key the provider cannot parse is dropped from the set, and every token
// signed with it then fails as "unknown kid" — a message naming neither the
// cause nor the key. The drop says so itself.
func TestJWKSRefresh_NamesAKeyItCannotParse(t *testing.T) {
	logs := captureLogs(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[{"kty":"RSA","kid":"broken-key","alg":"RS256","n":"!!!not-base64!!!","e":"AQAB"}]}`))
	}))
	t.Cleanup(srv.Close)

	p := &JWKSProvider{url: srv.URL, client: srv.Client()}
	if err := p.refresh(); err != nil {
		t.Fatalf("refresh() = %v, want nil: one bad key must not discard the whole set", err)
	}

	if !strings.Contains(logs.String(), msgJWKSKeyUnparsable) {
		t.Errorf("dropping a key logged nothing; logs = %q", logs.String())
	}
	if !strings.Contains(logs.String(), "broken-key") {
		t.Errorf("the log does not name the dropped kid; logs = %q", logs.String())
	}
}

// The refusal has already been decided when the cleanup runs: the client is
// logged out either way, so a failed delete leaves a row that should be dead
// and no other trace.
func TestEndSession_ReportsACleanupItCouldNotDo(t *testing.T) {
	logs := captureLogs(t)

	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	s := &Server{store: st}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s.endSession(ctx, "some-refresh-hash", sessionEndIDPRejected)

	if !strings.Contains(logs.String(), msgSessionCleanupFailed) {
		t.Fatalf("a failed session delete logged nothing; logs = %q", logs.String())
	}
	if !strings.Contains(logs.String(), sessionEndIDPRejected) {
		t.Errorf("the log does not say which refusal the cleanup belonged to; logs = %q", logs.String())
	}
}

// The positive half: a cleanup that works says nothing, so the line above is
// evidence of a failure rather than of a code path having run.
func TestEndSession_IsSilentWhenTheCleanupSucceeds(t *testing.T) {
	logs := captureLogs(t)

	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	s := &Server{store: st}

	s.endSession(context.Background(), "some-refresh-hash", sessionEndDeactivated)

	if strings.Contains(logs.String(), msgSessionCleanupFailed) {
		t.Errorf("a successful cleanup logged a failure; logs = %q", logs.String())
	}
}
