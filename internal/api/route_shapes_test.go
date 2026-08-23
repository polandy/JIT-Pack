package api_test

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

// NFR-4.14's third point: the path names the scope first, then the resource;
// the master partition's scope segment is "master"; an export names its format
// as the path's extension. See ADR-027 for what was traded for it.
//
// This file is about *routing* only — that each path is reachable, and that the
// shape it replaced is gone. What each handler answers is the subject of that
// handler's own test file, so a status is asserted here only where it is the
// cheapest way to say "this is routed".
func TestRouteShapes_ScopeFirst(t *testing.T) {
	srv := newTestServer(t)
	bearer := "Bearer " + token(t, userA, testSecret)

	for _, tc := range []struct {
		name, method, path string
	}{
		{"master pull", http.MethodGet, "/api/v1/master/sync?cursor=0"},
		{"master push", http.MethodPost, "/api/v1/master/sync"},
		{"trip pull", http.MethodGet, "/api/v1/trips/" + trip + "/sync?cursor=0"},
		{"trip push", http.MethodPost, "/api/v1/trips/" + trip + "/sync"},
		{"master conflicts", http.MethodGet, "/api/v1/master/conflicts"},
		{"master revert", http.MethodPost, "/api/v1/master/conflicts/nope/revert"},
		{"trip conflicts", http.MethodGet, "/api/v1/trips/" + trip + "/conflicts"},
		{"trip revert", http.MethodPost, "/api/v1/trips/" + trip + "/conflicts/nope/revert"},
		{"full export", http.MethodGet, "/api/v1/me/export.json"},
		{"trip CSV export", http.MethodGet, "/api/v1/trips/" + trip + "/export.csv"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if !routed(t, srv.URL+tc.path, tc.method, bearer) {
				t.Errorf("%s %s is not routed", tc.method, tc.path)
			}
		})
	}
}

// The old shapes are gone rather than aliased: a rename that leaves the previous
// path serving is not a rename, and a client still calling it would never learn.
func TestRouteShapes_PreviousPathsAreGone(t *testing.T) {
	srv := newTestServer(t)
	bearer := "Bearer " + token(t, userA, testSecret)

	for _, tc := range []struct {
		name, method, path string
	}{
		{"channel-first master pull", http.MethodGet, "/api/v1/sync/master"},
		{"channel-first master push", http.MethodPost, "/api/v1/sync/master"},
		{"channel-first trip pull", http.MethodGet, "/api/v1/sync/trips/" + trip},
		{"channel-first trip push", http.MethodPost, "/api/v1/sync/trips/" + trip},
		{"resource-first master conflicts", http.MethodGet, "/api/v1/conflicts/master"},
		{"resource-first master revert", http.MethodPost, "/api/v1/conflicts/master/nope/revert"},
		{"formatless full export", http.MethodGet, "/api/v1/export/full"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if routed(t, srv.URL+tc.path, tc.method, bearer) {
				t.Errorf("%s %s still serves — the old shape was aliased, not renamed", tc.method, tc.path)
			}
		})
	}
}

// routed distinguishes the two answers that both read as 404: the mux saying
// "no such path" (a plain-text body) and a handler saying "no such row" (the
// APIError envelope). Asserting on the status alone would call the revert
// routes unrouted while they are routed, and gone while they are still there.
func routed(t *testing.T, url, method, bearer string) bool {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(""))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", bearer)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		return true
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return strings.HasPrefix(strings.TrimSpace(string(body)), "{")
}
