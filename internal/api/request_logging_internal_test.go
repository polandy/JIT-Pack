package api

// ARCH-08b: a handler's log line must be tied to the request it ran
// inside. withLogging is what attaches method, route and request_id to
// every request regardless of mode; authed is the one place downstream
// that knows who is asking, and adds caller to the same logger rather
// than a second middleware repeating withLogging's work.

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// decodeLogLine parses the one JSON record a test's handler produced.
func decodeLogLine(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	var rec map[string]any
	line := bytes.TrimSpace(buf.Bytes())
	if err := json.Unmarshal(line, &rec); err != nil {
		t.Fatalf("decode log line: %v (raw: %s)", err, buf.String())
	}
	return rec
}

// A request reaching any route — authenticated or not — must carry a
// logger with method, the mux's own pattern as route (never the raw path,
// which could repeat a path parameter's value) and a request_id distinct
// from every other request.
func TestWithLogging_AttachesMethodRouteAndRequestID(t *testing.T) {
	var buf bytes.Buffer
	s := &Server{logger: slog.New(slog.NewJSONHandler(&buf, nil))}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /widgets/{id}", s.withLogging(func(w http.ResponseWriter, r *http.Request) {
		logger(r.Context()).Info("handled")
	}))

	req := httptest.NewRequest(http.MethodGet, "/widgets/42", nil)
	mux.ServeHTTP(httptest.NewRecorder(), req)

	rec := decodeLogLine(t, &buf)
	if rec["method"] != http.MethodGet {
		t.Errorf("method = %v, want %q", rec["method"], http.MethodGet)
	}
	if rec["route"] != "GET /widgets/{id}" {
		t.Errorf("route = %v, want the mux pattern %q, not the raw path", rec["route"], "GET /widgets/{id}")
	}
	reqID, _ := rec["request_id"].(string)
	if len(reqID) != 16 {
		t.Fatalf("request_id = %q, want 16 hex chars (8 random bytes)", reqID)
	}
	if _, err := hex.DecodeString(reqID); err != nil {
		t.Errorf("request_id %q is not hex: %v", reqID, err)
	}
}

// Two requests through the same route must not share a request_id — the
// whole point of generating it per request rather than once per route.
func TestWithLogging_RequestIDDiffersPerRequest(t *testing.T) {
	var buf1, buf2 bytes.Buffer
	s1 := &Server{logger: slog.New(slog.NewJSONHandler(&buf1, nil))}
	s2 := &Server{logger: s1.logger}

	handler := func(w http.ResponseWriter, r *http.Request) { logger(r.Context()).Info("handled") }
	mux1 := http.NewServeMux()
	mux1.HandleFunc("GET /widgets", s1.withLogging(handler))
	mux1.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/widgets", nil))
	id1 := decodeLogLine(t, &buf1)["request_id"]

	s2.logger = slog.New(slog.NewJSONHandler(&buf2, nil))
	mux2 := http.NewServeMux()
	mux2.HandleFunc("GET /widgets", s2.withLogging(handler))
	mux2.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/widgets", nil))
	id2 := decodeLogLine(t, &buf2)["request_id"]

	if id1 == id2 {
		t.Errorf("two requests got the same request_id %v", id1)
	}
}

// Once authed has run, the logger a handler reads also carries caller —
// the identity authed resolved — on top of what withLogging already put
// there, rather than a second, caller-less logger.
func TestAuthed_AddsCallerToTheRequestLogger(t *testing.T) {
	var buf bytes.Buffer
	s := &Server{
		logger:   slog.New(slog.NewJSONHandler(&buf, nil)),
		identity: singleUserIdentity{userID: "local-user"},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /me", s.withLogging(s.authed(func(w http.ResponseWriter, r *http.Request) {
		logger(r.Context()).Info("handled")
	})))

	mux.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/me", nil))

	rec := decodeLogLine(t, &buf)
	if rec["caller"] != "local-user" {
		t.Errorf("caller = %v, want %q", rec["caller"], "local-user")
	}
	if rec["method"] != http.MethodGet || rec["route"] != "GET /me" {
		t.Errorf("authed dropped what withLogging attached: %+v", rec)
	}
}

// A route an unauthenticated caller can reach still gets a logger — just
// without caller, since authed never ran to resolve one.
func TestWithLogging_UnauthenticatedRouteCarriesNoCaller(t *testing.T) {
	var buf bytes.Buffer
	s := &Server{logger: slog.New(slog.NewJSONHandler(&buf, nil))}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /instance/config", s.withLogging(func(w http.ResponseWriter, r *http.Request) {
		logger(r.Context()).Info("handled")
	}))

	mux.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/instance/config", nil))

	rec := decodeLogLine(t, &buf)
	if _, ok := rec["caller"]; ok {
		t.Errorf("an unauthenticated route's logger carries caller = %v, want absent", rec["caller"])
	}
	if rec["method"] != http.MethodGet || rec["route"] != "GET /instance/config" {
		t.Errorf("unexpected attributes on an unauthenticated route's logger: %+v", rec)
	}
}

// Outside any request — a background goroutine, or a test calling a
// method directly — logger falls back to slog.Default() rather than
// panicking on a context that never saw withLogging.
func TestLogger_FallsBackToDefaultOutsideARequest(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	logger(context.Background()).Info("background work")

	if !strings.Contains(buf.String(), "background work") {
		t.Errorf("logger(ctx) outside a request did not reach slog.Default(); got %q", buf.String())
	}
}
