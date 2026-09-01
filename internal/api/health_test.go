package api_test

import (
	"io"
	"net/http"
	"testing"

	"jitpack/internal/api"
)

// The liveness probe is a deployment contract, not an API: every shipped
// compose file gates the container on `wget --spider http://…/health`, and
// `docs/getting-started.md` tells the operator it answers 200 with an empty
// body. Nothing asserted any of that, so a status change or a rename would
// have surfaced as a container that never becomes healthy — at deploy time,
// on someone else's machine.
func TestHealth_AnswersUnauthenticatedWithAnEmptyBody(t *testing.T) {
	srv := newTestServer(t)

	// No Authorization header, deliberately: the healthcheck has no
	// credential to send, and in a multi-user instance every other route
	// refuses without one.
	resp, err := http.Get(srv.URL + api.RouteHealth)
	if err != nil {
		t.Fatalf("GET %s: %v", api.RouteHealth, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if len(body) != 0 {
		t.Errorf("body = %q, want empty", body)
	}
}

// The probe is a GET. A route registered without its method would answer
// anything, and the first thing to notice would be an unrelated 200.
func TestHealth_RefusesAMethodItDoesNotServe(t *testing.T) {
	srv := newTestServer(t)

	resp, err := http.Post(srv.URL+api.RouteHealth, "text/plain", http.NoBody)
	if err != nil {
		t.Fatalf("POST %s: %v", api.RouteHealth, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", resp.StatusCode, http.StatusMethodNotAllowed)
	}
}
