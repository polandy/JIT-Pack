package api_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"jitpack/internal/api"
)

// ADR-109: an issuer that cannot be reached at startup — the reference
// deployment's reverse proxy restarting beside the server answers 404 —
// no longer stops the process. The server serves; the auth endpoints fail
// closed with 503 until ConnectOIDC has resolved discovery and the key
// set, retried with capped exponential backoff.

// syncBuffer is a log sink the request goroutines and the test may share.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

// count is how many logged lines carry msg.
func (b *syncBuffer) count(msg string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return strings.Count(b.buf.String(), msg)
}

func bufferLogger(b *syncBuffer) *slog.Logger {
	return slog.New(slog.NewTextHandler(b, nil))
}

// recordingWait is an OIDCConfig.RetryWait that sleeps not at all: it
// records each delay and runs step, which is where a test looks at the
// pending server and decides when the IdP comes back.
type recordingWait struct {
	delays []time.Duration
	step   func(n int)
}

func (r *recordingWait) wait(_ context.Context, d time.Duration) error {
	r.delays = append(r.delays, d)
	if r.step != nil {
		r.step(len(r.delays))
	}
	return nil
}

// assertLoginPending holds the fail-closed contract while the issuer is
// unresolved: the process is healthy, and every endpoint that needs the
// IdP answers 503 idp_unreachable rather than anything it could not
// verify — a refresh included, whose 503 is the status the client keeps
// its session through.
func assertLoginPending(t *testing.T, srvURL string) {
	t.Helper()
	if resp, raw := doJSON(t, http.MethodGet, srvURL+api.RouteHealth, "", nil); resp.StatusCode != http.StatusOK {
		t.Errorf("health = %d, want 200 while OIDC is pending (body %s)", resp.StatusCode, raw)
	}
	requests := []struct {
		method, path string
		body         any
	}{
		{http.MethodGet, "/api/v1/auth/config", nil},
		{http.MethodPost, "/api/v1/auth/token", map[string]any{
			"code": "abc", "code_verifier": "ver", "redirect_uri": "https://app/cb",
		}},
		{http.MethodPost, "/api/v1/auth/refresh", map[string]any{"refresh_token": "any"}},
	}
	for _, rq := range requests {
		resp, raw := doJSON(t, rq.method, srvURL+rq.path, "", rq.body)
		if resp.StatusCode != http.StatusServiceUnavailable {
			t.Errorf("%s %s = %d, want 503 while OIDC is pending (body %s)", rq.method, rq.path, resp.StatusCode, raw)
			continue
		}
		if got := errorCode(t, raw); got != string(api.ErrIDPUnreachable) {
			t.Errorf("%s %s code = %q, want %q", rq.method, rq.path, got, api.ErrIDPUnreachable)
		}
	}
}

func TestConnectOIDC_IssuerDownAtStartup_ServesThenOpensLoginOnceItAnswers_ADR109(t *testing.T) {
	idp := newFakeIDP(t)
	// What Traefik answers while the IdP's router is gone.
	idp.discoveryStatus = http.StatusNotFound
	logs := &syncBuffer{}
	var srvURL string
	rw := &recordingWait{step: func(n int) {
		assertLoginPending(t, srvURL)
		if n == 2 {
			idp.discoveryStatus = 0
		}
	}}
	srv, _, apiSrv := newUnconnectedBroker(t, idp, api.Options{Logger: bufferLogger(logs)}, rw.wait)
	srvURL = srv.URL

	assertLoginPending(t, srv.URL)
	if err := apiSrv.ConnectOIDC(t.Context()); err != nil {
		t.Fatalf("ConnectOIDC = %v, want nil once the issuer answers", err)
	}

	if want := []time.Duration{api.OIDCRetryFirst, 2 * api.OIDCRetryFirst}; !slices.Equal(rw.delays, want) {
		t.Errorf("retry delays = %v, want %v", rw.delays, want)
	}
	if got := logs.count(api.MsgOIDCConnectFailed); got != 2 {
		t.Errorf("%q logged %d times, want once per failed attempt (2)", api.MsgOIDCConnectFailed, got)
	}
	if got := logs.count(api.MsgOIDCConnected); got != 1 {
		t.Errorf("%q logged %d times, want once", api.MsgOIDCConnected, got)
	}
	// The full login, ID-token check included, now runs.
	if access, _ := login(t, srv.URL); access == "" {
		t.Error("login after the issuer came back issued no access token")
	}
}

func TestConnectOIDC_KeySetDownAtStartup_IsRetriedLikeDiscovery_ADR109(t *testing.T) {
	idp := newFakeIDP(t)
	idp.jwksStatus = http.StatusServiceUnavailable
	logs := &syncBuffer{}
	var srvURL string
	rw := &recordingWait{step: func(int) {
		assertLoginPending(t, srvURL)
		idp.jwksStatus = 0
	}}
	srv, _, apiSrv := newUnconnectedBroker(t, idp, api.Options{Logger: bufferLogger(logs)}, rw.wait)
	srvURL = srv.URL

	if err := apiSrv.ConnectOIDC(t.Context()); err != nil {
		t.Fatalf("ConnectOIDC = %v, want nil once the key set is served", err)
	}
	if len(rw.delays) != 1 {
		t.Errorf("waited %d times, want 1", len(rw.delays))
	}
	if got := logs.count(api.MsgOIDCConnectFailed); got != 1 {
		t.Errorf("%q logged %d times, want 1", api.MsgOIDCConnectFailed, got)
	}
	if access, _ := login(t, srv.URL); access == "" {
		t.Error("login after the key set came back issued no access token")
	}
}

func TestConnectOIDC_BackoffDoublesUpToTheCap_ADR109(t *testing.T) {
	idp := newFakeIDP(t)
	idp.discoveryStatus = http.StatusBadGateway
	// Enough failures to reach the cap and stay on it twice.
	var want []time.Duration
	for d := api.OIDCRetryFirst; ; d *= 2 {
		if d >= api.OIDCRetryMax {
			want = append(want, api.OIDCRetryMax, api.OIDCRetryMax)
			break
		}
		want = append(want, d)
	}
	rw := &recordingWait{step: func(n int) {
		if n == len(want) {
			idp.discoveryStatus = 0
		}
	}}
	_, _, apiSrv := newUnconnectedBroker(t, idp, api.Options{Logger: bufferLogger(&syncBuffer{})}, rw.wait)

	if err := apiSrv.ConnectOIDC(t.Context()); err != nil {
		t.Fatalf("ConnectOIDC = %v", err)
	}
	if !slices.Equal(rw.delays, want) {
		t.Errorf("retry delays = %v, want %v", rw.delays, want)
	}
}

// A document that answers and is wrong is the operator's mistake, not an
// outage: ConnectOIDC gives up at once instead of retrying it forever,
// and the login stays closed.
func TestConnectOIDC_MisconfiguredIssuerIsNotRetried_ADR109(t *testing.T) {
	tests := []struct {
		name  string
		steer func(*fakeIDP)
	}{
		{"issuer mismatch", func(idp *fakeIDP) { idp.discoveryIssuer = "https://somewhere-else.example.com" }},
		{"endpoint missing", func(idp *fakeIDP) { idp.discoveryOmit = "userinfo_endpoint" }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idp := newFakeIDP(t)
			tc.steer(idp)
			rw := &recordingWait{}
			srv, _, apiSrv := newUnconnectedBroker(t, idp, api.Options{Logger: bufferLogger(&syncBuffer{})}, rw.wait)

			err := apiSrv.ConnectOIDC(t.Context())
			if !errors.Is(err, api.ErrOIDCMisconfigured) {
				t.Fatalf("ConnectOIDC = %v, want ErrOIDCMisconfigured", err)
			}
			if len(rw.delays) != 0 {
				t.Errorf("waited %v before giving up, want no retry", rw.delays)
			}
			assertLoginPending(t, srv.URL)
		})
	}
}

// Shutdown during an outage: the wait ends with the context, ConnectOIDC
// returns its error, and nothing was installed on the way out.
func TestConnectOIDC_StopsWithItsContext_ADR109(t *testing.T) {
	idp := newFakeIDP(t)
	idp.discoveryStatus = http.StatusNotFound
	ctx, cancel := context.WithCancel(t.Context())
	// The production timer, not the recording one: the context is already
	// over when it is reached, so it returns without waiting.
	cancel()
	srv, _, apiSrv := newUnconnectedBroker(t, idp, api.Options{Logger: bufferLogger(&syncBuffer{})}, nil)

	if err := apiSrv.ConnectOIDC(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("ConnectOIDC = %v, want context.Canceled", err)
	}
	assertLoginPending(t, srv.URL)
}

// A restart while the IdP is down must not cost anyone their session: the
// refresh is refused with 503 before the session row is looked at, and
// the same token refreshes once the issuer is resolved.
func TestConnectOIDC_RefreshWhilePendingKeepsTheSession_ADR109(t *testing.T) {
	idp := newFakeIDP(t)
	before, st, _ := newBrokerParts(t, idp)
	_, refresh := login(t, before.URL)

	// The restarted server, on the same database, with the issuer down.
	idp.discoveryStatus = http.StatusNotFound
	rw := &recordingWait{step: func(int) { idp.discoveryStatus = 0 }}
	restarted := api.New(st, testSecret, api.Options{
		Logger: bufferLogger(&syncBuffer{}),
		OIDC: &api.OIDCConfig{
			Issuer: idp.srv.URL, ClientID: idp.clientID, ClientSecret: idp.clientSecret, RetryWait: rw.wait,
		},
	})
	after := httptest.NewServer(restarted.Handler())
	t.Cleanup(after.Close)

	resp, raw := doJSON(t, http.MethodPost, after.URL+"/api/v1/auth/refresh", "", map[string]any{"refresh_token": refresh})
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("refresh while pending = %d, want 503 (body %s)", resp.StatusCode, raw)
	}
	if err := restarted.ConnectOIDC(t.Context()); err != nil {
		t.Fatalf("ConnectOIDC: %v", err)
	}
	resp, raw = doJSON(t, http.MethodPost, after.URL+"/api/v1/auth/refresh", "", map[string]any{"refresh_token": refresh})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("refresh after connecting = %d, want 200 — the pending 503 must leave the session intact (body %s)",
			resp.StatusCode, raw)
	}
}
