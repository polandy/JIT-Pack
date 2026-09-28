package api

import (
	"context"
	"encoding/base64"
	"net/http"

	"jitpack/internal/linkpreview"
)

// LinkPreviewer reads what a page says about itself (FR-29.16). The
// production one is linkpreview.NewFetcher, which refuses this server's
// own network; a test hands in a fake.
type LinkPreviewer interface {
	Fetch(ctx context.Context, url string) (linkpreview.Page, error)
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
	if s.previews == nil {
		writeError(w, http.StatusNotImplemented, ErrNotConfigured, "link previews are off on this instance")
		return
	}
	var req LinkPreviewRequest
	if err := decodeJSON(w, r, maxJSONBodyBytes, &req); err != nil {
		writeDecodeError(w, err, "malformed link preview request")
		return
	}
	page, err := s.previews.Fetch(r.Context(), req.URL)
	if err != nil {
		if !answerFrom(w, linkPreviewRefusals, err) {
			writeError(w, http.StatusInternalServerError, ErrInternal, "link preview failed")
		}
		return
	}
	resp := LinkPreviewResponse{Title: page.Title, Description: page.Description}
	if len(page.Image) > 0 {
		resp.Image = base64.StdEncoding.EncodeToString(page.Image)
		resp.ImageType = page.ImageType
	}
	writeJSON(w, resp)
}
