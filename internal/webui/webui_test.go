package webui_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jitpack/internal/webui"
)

// The API surface the single container shares with the SPA, spelled the way
// cmd/jitpackd passes it: the versioned prefix plus the two paths that sit
// outside it (api.RouteWS, api.RouteHealth).
var apiPrefixes = []string{"/api/v1/", "/ws", "/health"}

const (
	indexBody = "<!doctype html><title>JIT-Pack</title>"
	assetBody = "export const x = 1"
)

// bundle writes a minimal Vite-shaped dist: the entry document, one
// content-hashed asset and the service worker beside it.
func bundle(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	write(t, root, "index.html", indexBody)
	write(t, filepath.Join(root, "assets"), "index-abc123.js", assetBody)
	write(t, root, "sw.js", "// worker")
	return root
}

func write(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// apiSpy answers every request it is handed, so a test can tell delegation
// from a static answer by the body alone.
func apiSpy() (http.Handler, *[]string) {
	var seen []string
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"api":true}`))
	}), &seen
}

func newHandler(t *testing.T, root string) (http.Handler, *[]string) {
	t.Helper()
	api, seen := apiSpy()
	h, err := webui.Handler(root, api, apiPrefixes...)
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}
	return h, seen
}

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

// The whole reason the two halves are one process: the API keeps answering
// its own paths, which is what makes the origin the same one (ADR-043).
func TestHandler_APIPathsStillReachTheAPI(t *testing.T) {
	h, seen := newHandler(t, bundle(t))

	for _, path := range []string{
		"/api/v1/master/sync",
		"/api/v1/trips/t1/sync",
		"/ws",
		"/health",
	} {
		t.Run(path, func(t *testing.T) {
			rec := get(t, h, path)
			if body := rec.Body.String(); !strings.Contains(body, `"api":true`) {
				t.Errorf("%s was answered by the file server, not the API: %q", path, body)
			}
		})
	}
	if len(*seen) != 4 {
		t.Errorf("the API saw %d of 4 requests: %v", len(*seen), *seen)
	}
}

// A write to a path the SPA appears to own is the API's 404, never a 200 with
// an HTML document in it — a client that gets HTML back from a POST reports a
// parse error rather than the wrong path it actually used.
func TestHandler_NonReadMethodsGoToTheAPI(t *testing.T) {
	h, _ := newHandler(t, bundle(t))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/trips", nil))

	if !strings.Contains(rec.Body.String(), `"api":true`) {
		t.Errorf("POST /trips was answered by the file server: %q", rec.Body.String())
	}
}

func TestHandler_ServesTheBundle(t *testing.T) {
	h, _ := newHandler(t, bundle(t))

	for _, tc := range []struct{ path, want string }{
		{"/", indexBody},
		{"/index.html", indexBody},
		{"/assets/index-abc123.js", assetBody},
		{"/sw.js", "// worker"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			rec := get(t, h, tc.path)
			if rec.Code != http.StatusOK {
				t.Fatalf("%s: status %d", tc.path, rec.Code)
			}
			if rec.Body.String() != tc.want {
				t.Errorf("%s served %q, want %q", tc.path, rec.Body.String(), tc.want)
			}
		})
	}
}

// createWebHistory's half of the deal: a deep link is a route, not a file, and
// a hard reload on one has to arrive at the app rather than at a 404.
func TestHandler_ClientRouteFallsBackToIndex(t *testing.T) {
	h, _ := newHandler(t, bundle(t))

	for _, path := range []string{"/trips", "/trips/t1/pack", "/settings", "/trips/"} {
		t.Run(path, func(t *testing.T) {
			rec := get(t, h, path)
			if rec.Code != http.StatusOK || rec.Body.String() != indexBody {
				t.Errorf("%s: status %d body %q — the history fallback did not answer",
					path, rec.Code, rec.Body.String())
			}
		})
	}
}

// The other half, and the one nginx's try_files gets wrong: a *file* that is
// not there must stay a 404. Handing index.html to a request for a script
// turns a missing asset into a syntax error somewhere else entirely.
func TestHandler_MissingFileIsNotTheApp(t *testing.T) {
	h, _ := newHandler(t, bundle(t))

	for _, path := range []string{"/assets/gone.js", "/missing.css", "/favicon.png"} {
		t.Run(path, func(t *testing.T) {
			rec := get(t, h, path)
			if rec.Code != http.StatusNotFound {
				t.Errorf("%s: status %d, want 404 (body %q)", path, rec.Code, rec.Body.String())
			}
		})
	}
}

// NFR-4.13's update policy needs the browser to notice a new index.html and a
// new sw.js; only the content-hashed bundles may be cached past a release.
func TestHandler_OnlyHashedAssetsAreCachedHard(t *testing.T) {
	h, _ := newHandler(t, bundle(t))

	for _, tc := range []struct{ path, want string }{
		{"/assets/index-abc123.js", "public, max-age=31536000, immutable"},
		{"/index.html", "no-cache"},
		{"/", "no-cache"},
		{"/sw.js", "no-cache"},
		// A directory path under /assets/ takes the history fallback, and
		// what it serves is index.html — which the URL alone would have
		// marked immutable.
		{"/assets/", "no-cache"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			if got := get(t, h, tc.path).Header().Get("Cache-Control"); got != tc.want {
				t.Errorf("%s: Cache-Control %q, want %q", tc.path, got, tc.want)
			}
		})
	}
}

// os.Root is what makes this true, and it is worth an assertion: the escape is
// the one bug a hand-rolled file server reliably ships with.
func TestHandler_CannotEscapeTheWebRoot(t *testing.T) {
	root := bundle(t)
	if err := os.WriteFile(filepath.Join(filepath.Dir(root), "secret.txt"), []byte("nope"), 0o644); err != nil {
		t.Fatal(err)
	}
	h, _ := newHandler(t, root)

	for _, path := range []string{"/../secret.txt", "/assets/../../secret.txt", "//../secret.txt"} {
		t.Run(path, func(t *testing.T) {
			rec := get(t, h, path)
			if strings.Contains(rec.Body.String(), "nope") {
				t.Errorf("%s escaped the web root", path)
			}
		})
	}
}

// A root without an index.html is a misconfiguration that must stop the
// process, not one that starts and serves a white page to the first person
// who opens a browser.
func TestHandler_RefusesARootWithNoIndex(t *testing.T) {
	api, _ := apiSpy()

	t.Run("empty directory", func(t *testing.T) {
		if _, err := webui.Handler(t.TempDir(), api, apiPrefixes...); err == nil {
			t.Error("a root with no index.html was accepted")
		}
	})
	t.Run("no directory", func(t *testing.T) {
		if _, err := webui.Handler(filepath.Join(t.TempDir(), "gone"), api, apiPrefixes...); err == nil {
			t.Error("a root that does not exist was accepted")
		}
	})
	// Without a prefix list every API path would be answered by the file
	// server — which is a 404 for the app and a silent outage for sync.
	t.Run("no API prefixes", func(t *testing.T) {
		if _, err := webui.Handler(bundle(t), api); err == nil {
			t.Error("an empty prefix list was accepted")
		}
	})
}
