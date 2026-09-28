package api_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/linkpreview"
	"jitpack/internal/store"
)

// FR-29.16 at the HTTP edge. The fetch itself — and the refusal of this
// server's own network — is internal/linkpreview's; what is pinned here is
// who may ask, what they get back, and that an instance with previews off
// says so rather than fetching.

// fakePreviewer answers every URL with the same page, and records the ask.
type fakePreviewer struct {
	page  linkpreview.Page
	err   error
	asked []string
}

func (f *fakePreviewer) Fetch(_ context.Context, url string) (linkpreview.Page, error) {
	f.asked = append(f.asked, url)
	return f.page, f.err
}

func newPreviewServer(t *testing.T, previewer api.LinkPreviewer) *httptest.Server {
	t.Helper()
	st, err := store.OpenForTest(t.TempDir())
	if err != nil {
		t.Fatalf("store.OpenForTest: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	for _, q := range []string{
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-a', 'auth|a', 'Andy')`,
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-x', 'auth|x', 'Stranger')`,
		`INSERT INTO trips (id, name, year) VALUES ('trip-samedan', 'Samedan', 2026)`,
		`INSERT INTO trip_members (trip_id, user_id, role) VALUES ('trip-samedan', 'user-a', 'owner')`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	opts := api.Options{}
	if previewer != nil {
		opts.LinkPreviews = previewer
	}
	srv := httptest.NewServer(api.New(st, testSecret, opts).Handler())
	t.Cleanup(srv.Close)
	return srv
}

func previewURL(srv *httptest.Server) string {
	return srv.URL + "/api/v1/trips/" + trip + "/link-preview"
}

func TestLinkPreview_AMemberGetsWhatThePageSays_FR29_16(t *testing.T) {
	fake := &fakePreviewer{page: linkpreview.Page{
		Preview:   linkpreview.Preview{Title: "Oeschinensee", Description: "Ein Bergsee"},
		Image:     []byte("\xff\xd8\xff"),
		ImageType: "image/jpeg",
	}}
	srv := newPreviewServer(t, fake)

	resp, raw := doJSON(t, http.MethodPost, previewURL(srv), token(t, userA, testSecret),
		api.LinkPreviewRequest{URL: "https://www.oeschinensee.ch"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var got api.LinkPreviewResponse
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	image, _ := base64.StdEncoding.DecodeString(got.Image)
	if got.Title != "Oeschinensee" || got.Description != "Ein Bergsee" || string(image) != "\xff\xd8\xff" || got.ImageType != "image/jpeg" {
		t.Errorf("response = %+v, want the page's title, description and picture", got)
	}
	if len(fake.asked) != 1 || fake.asked[0] != "https://www.oeschinensee.ch" {
		t.Errorf("asked %v, want the one URL", fake.asked)
	}
}

// Only a member makes this server fetch: a stranger is refused before it
// reaches the network.
func TestLinkPreview_AStrangerCannotMakeTheServerFetch_FR29_16(t *testing.T) {
	fake := &fakePreviewer{}
	srv := newPreviewServer(t, fake)
	resp, _ := doJSON(t, http.MethodPost, previewURL(srv), token(t, "user-x", testSecret),
		api.LinkPreviewRequest{URL: "https://example.org"})
	if resp.StatusCode != http.StatusForbidden || len(fake.asked) != 0 {
		t.Errorf("status = %d after %d fetches, want 403 and none", resp.StatusCode, len(fake.asked))
	}
}

func TestLinkPreview_RefusalsSayWhy_FR29_16(t *testing.T) {
	cases := map[string]struct {
		err  error
		want int
		code api.ErrorCode
	}{
		"not a web link":     {linkpreview.ErrNotWebLink, http.StatusUnprocessableEntity, api.ErrValidation},
		"this server's own":  {linkpreview.ErrBlockedAddress, http.StatusUnprocessableEntity, api.ErrLinkUnreadable},
		"the page failed":    {linkpreview.ErrUnreadable, http.StatusUnprocessableEntity, api.ErrLinkUnreadable},
		"an unexpected fail": {errors.New("boom"), http.StatusInternalServerError, api.ErrInternal},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			srv := newPreviewServer(t, &fakePreviewer{err: tc.err})
			resp, raw := doJSON(t, http.MethodPost, previewURL(srv), token(t, userA, testSecret),
				api.LinkPreviewRequest{URL: "https://example.org"})
			var body api.APIError
			_ = json.Unmarshal(raw, &body)
			if resp.StatusCode != tc.want || body.Error.Code != tc.code {
				t.Errorf("status %d code %q, want %d %q", resp.StatusCode, body.Error.Code, tc.want, tc.code)
			}
		})
	}
}

// Off is an instance that fetches nothing, and the route says so.
func TestLinkPreview_OffIsSaidOnTheRoute_FR29_16(t *testing.T) {
	srv := newPreviewServer(t, nil)
	resp, raw := doJSON(t, http.MethodPost, previewURL(srv), token(t, userA, testSecret),
		api.LinkPreviewRequest{URL: "https://example.org"})
	var body api.APIError
	_ = json.Unmarshal(raw, &body)
	if resp.StatusCode != http.StatusNotImplemented || body.Error.Code != api.ErrNotConfigured {
		t.Errorf("status %d code %q, want 501 %q", resp.StatusCode, body.Error.Code, api.ErrNotConfigured)
	}
}
