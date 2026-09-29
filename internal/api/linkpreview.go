package api

import (
	"context"
	"encoding/base64"
	"log"
	"net/http"
	"net/url"
	"time"

	"jitpack/internal/linkpreview"
)

// LinkPreviewer reads what a page says about itself, and the picture it
// names (FR-29.16). The production one is linkpreview.NewFetcher, which
// refuses this server's own network; a test hands in a fake.
type LinkPreviewer interface {
	Fetch(ctx context.Context, url string) (linkpreview.Preview, error)
	FetchImage(ctx context.Context, url string) ([]byte, string, error)
}

// linkPreviewRefusals answers what the fetcher refuses. A blocked address
// reads like any unreadable page on purpose: which of a user's addresses
// this server can reach inside its own network is not the user's to probe.
var linkPreviewRefusals = []errorResponse{
	{linkpreview.ErrNotWebLink, http.StatusUnprocessableEntity, ErrValidation, "not a web link"},
	{linkpreview.ErrBlockedAddress, http.StatusUnprocessableEntity, ErrLinkUnreadable, "the page could not be read"},
	{linkpreview.ErrUnreadable, http.StatusUnprocessableEntity, ErrLinkUnreadable, "the page could not be read"},
}

// handleLinkPreview reads a pasted link's page for the idea sheet
// (FR-29.16). Behind the trip's membership so that only somebody on a trip
// can make this server fetch a page.
func (s *Server) handleLinkPreview(w http.ResponseWriter, r *http.Request) {
	req, ok := s.previewRequest(w, r)
	if !ok {
		return
	}
	started := s.now()
	page, err := s.previews.Fetch(r.Context(), req.URL)
	logPreview("page", req.URL, err, s.now().Sub(started))
	if err != nil {
		writePreviewError(w, err)
		return
	}
	writeJSON(w, LinkPreviewResponse{Title: page.Title, Description: page.Description, ImageURL: page.ImageURL})
}

// handleLinkPreviewImage reads the picture a preview named. The address
// comes back from the client, so it passes the same fence as the page's.
func (s *Server) handleLinkPreviewImage(w http.ResponseWriter, r *http.Request) {
	req, ok := s.previewRequest(w, r)
	if !ok {
		return
	}
	started := s.now()
	image, kind, err := s.previews.FetchImage(r.Context(), req.URL)
	logPreview("picture", req.URL, err, s.now().Sub(started))
	if err != nil {
		writePreviewError(w, err)
		return
	}
	writeJSON(w, LinkPreviewImageResponse{Image: base64.StdEncoding.EncodeToString(image), ImageType: kind})
}

// previewRequest refuses where previews are off and decodes the request.
func (s *Server) previewRequest(w http.ResponseWriter, r *http.Request) (LinkPreviewRequest, bool) {
	var req LinkPreviewRequest
	if s.previews == nil {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, "link previews are off on this instance")
		return req, false
	}
	if err := decodeJSON(w, r, maxJSONBodyBytes, &req); err != nil {
		writeDecodeError(w, err, "malformed link preview request")
		return req, false
	}
	return req, true
}

func writePreviewError(w http.ResponseWriter, err error) {
	if !answerFrom(w, linkPreviewRefusals, err) {
		writeError(w, http.StatusInternalServerError, ErrInternal, "link preview failed")
	}
}

// logPreview names the host only, never the path: an operator asking why a
// link did not fill in needs the site and the outcome, not what somebody
// was reading.
func logPreview(what, raw string, err error, took time.Duration) {
	host := "(no host)"
	if u, perr := url.Parse(raw); perr == nil && u.Hostname() != "" {
		host = u.Hostname()
	}
	outcome := "read"
	if err != nil {
		outcome = err.Error()
	}
	log.Printf("link preview %s %s: %s in %s", what, host, outcome, took.Round(100*time.Millisecond))
}
