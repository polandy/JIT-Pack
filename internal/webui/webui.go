// Package webui serves the built single-page app from the same origin as the
// API, so one process — and one container — answers both (ADR-043).
//
// It is deliberately a wrapper rather than a set of routes on the API's mux:
// internal/api declares its paths in wire.go and generates the client's copy
// from them (NFR-4.14, ADR-027), and the SPA's files are not part of that
// contract. What the two halves share is only the prefix list below, which the
// caller passes in from the API's own declarations.
package webui

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path"
	"strings"
)

const (
	// indexFile is the SPA's entry document, and the answer to every
	// client-side route (createWebHistory) that names no file.
	indexFile = "index.html"

	// hashedAssetPrefix is where Vite emits content-hashed bundles. A new
	// build writes new names, so those may be cached hard; everything else
	// keeps its name across releases and must be revalidated — the service
	// worker's update policy (NFR-4.13) depends on the browser noticing a
	// new index.html and a new sw.js.
	hashedAssetDir = "assets/"

	cacheImmutable  = "public, max-age=31536000, immutable"
	cacheRevalidate = "no-cache"
)

// Handler serves the SPA built into root and delegates every request under one
// of apiPrefixes to api. A prefix matches the path itself and everything below
// it, so "/api/v1/" covers the versioned surface while "/ws" covers the socket.
//
// It fails when root holds no index.html: an instance that starts and then
// answers a white page hides the mistake until someone opens a browser, and
// the whole point of one container is that the two halves ship together.
func Handler(root string, api http.Handler, apiPrefixes ...string) (http.Handler, error) {
	if len(apiPrefixes) == 0 {
		return nil, errors.New("web root: no API prefixes given, which would serve the SPA over the whole API")
	}
	dir, err := os.OpenRoot(root)
	if err != nil {
		return nil, fmt.Errorf("web root: %w", err)
	}
	if _, err := dir.Stat(indexFile); err != nil {
		dir.Close()
		return nil, fmt.Errorf("web root %s holds no %s — point JITPACK_WEB_ROOT at a built client bundle: %w",
			root, indexFile, err)
	}
	return &handler{dir: dir, api: api, prefixes: apiPrefixes}, nil
}

type handler struct {
	dir      *os.Root
	api      http.Handler
	prefixes []string
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// The API answers on its own paths, and it answers with every method.
	// Anything else that is not a plain read is the API's too — a POST to a
	// path the SPA owns is a 404 from the mux, not an index.html with a 200.
	if h.isAPI(r.URL.Path) || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
		h.api.ServeHTTP(w, r)
		return
	}

	name := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if name == "." {
		name = indexFile
	}

	if h.serveFile(w, r, name) {
		return
	}

	// A path naming a file that is not there is a 404, not the app: only a
	// client-side *route* earns the history fallback, and a route names no
	// file — no extension, or a trailing slash. Answering /assets/missing.js
	// with index.html would hand the browser HTML where it asked for a
	// script, and the failure would surface as a syntax error rather than as
	// the missing file it is.
	if !isClientRoute(r.URL.Path) {
		http.NotFound(w, r)
		return
	}
	if !h.serveFile(w, r, indexFile) {
		http.NotFound(w, r)
	}
}

// isClientRoute reports whether a path that matched no file should be answered
// with the app rather than with a 404.
func isClientRoute(urlPath string) bool {
	return strings.HasSuffix(urlPath, "/") || path.Ext(path.Base(urlPath)) == ""
}

// serveFile answers from the bundle and reports whether it did. A directory is
// not a file: the bundle has no index-per-directory, so it takes the fallback.
func (h *handler) serveFile(w http.ResponseWriter, r *http.Request, name string) bool {
	f, err := h.dir.Open(name)
	if err != nil {
		return false
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		return false
	}
	// Keyed to the file actually served, not to the URL: the history
	// fallback can answer a path under /assets/ with index.html, and that
	// document must never be cached hard.
	w.Header().Set("Cache-Control", cacheControlFor(name))
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
	return true
}

func cacheControlFor(name string) string {
	if strings.HasPrefix(name, hashedAssetDir) {
		return cacheImmutable
	}
	return cacheRevalidate
}

func (h *handler) isAPI(urlPath string) bool {
	for _, p := range h.prefixes {
		p = strings.TrimSuffix(p, "/")
		if urlPath == p || strings.HasPrefix(urlPath, p+"/") {
			return true
		}
	}
	return false
}
