package api_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/linkpreview"
	"jitpack/internal/store"
)

// FR-29.16 at the HTTP edge. The fetch itself — and the refusal of this
// server's own network — is internal/linkpreview's; what is pinned here is
// who may ask, what they get back, and that an instance with previews off
// says so rather than fetching.

// fakePreviewer answers every URL with the same page and picture, and
// records the asks.
type fakePreviewer struct {
	page      linkpreview.Preview
	image     []byte
	imageType string
	err       error
	asked     []string
}

func (f *fakePreviewer) Fetch(_ context.Context, url string) (linkpreview.Preview, error) {
	f.asked = append(f.asked, url)
	return f.page, f.err
}

func (f *fakePreviewer) FetchImage(_ context.Context, url string) ([]byte, string, error) {
	f.asked = append(f.asked, url)
	return f.image, f.imageType, f.err
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
	fake := &fakePreviewer{page: linkpreview.Preview{
		Title: "Oeschinensee", Description: "Ein Bergsee", ImageURL: "https://www.oeschinensee.ch/see.jpg",
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
	if got.Title != "Oeschinensee" || got.Description != "Ein Bergsee" || got.ImageURL != "https://www.oeschinensee.ch/see.jpg" {
		t.Errorf("response = %+v, want the page's title, description and picture's address", got)
	}
	if len(fake.asked) != 1 || fake.asked[0] != "https://www.oeschinensee.ch" {
		t.Errorf("asked %v, want the one URL", fake.asked)
	}
}

// FR-29.18: the page's links come with its words, and a page without any
// answers an empty list rather than null, so a client reads one shape.
func TestLinkPreview_CarriesThePagesLinks_FR29_18(t *testing.T) {
	trip := "https://www.sbb.ch/en/trip?tripId=3HA.a.b"
	cases := []struct {
		name  string
		links []string
		want  string
	}{
		{"a share page", []string{trip}, `"links":["` + trip + `"]`},
		{"a page without links", nil, `"links":[]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := newPreviewServer(t, &fakePreviewer{page: linkpreview.Preview{Links: tc.links}})
			resp, raw := doJSON(t, http.MethodPost, previewURL(srv), token(t, userA, testSecret),
				api.LinkPreviewRequest{URL: "https://a.sbbmobile.ch/s/73oNRti7"})
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
			}
			if !strings.Contains(string(raw), tc.want) {
				t.Errorf("body %s, want %s", raw, tc.want)
			}
		})
	}
}

func TestLinkPreviewImage_AMemberGetsThePicture_FR29_16(t *testing.T) {
	fake := &fakePreviewer{image: []byte("\xff\xd8\xff"), imageType: "image/jpeg"}
	srv := newPreviewServer(t, fake)

	resp, raw := doJSON(t, http.MethodPost, previewURL(srv)+"/image", token(t, userA, testSecret),
		api.LinkPreviewRequest{URL: "https://www.oeschinensee.ch/see.jpg"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var got api.LinkPreviewImageResponse
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	image, _ := base64.StdEncoding.DecodeString(got.Image)
	if string(image) != "\xff\xd8\xff" || got.ImageType != "image/jpeg" {
		t.Errorf("response = %+v, want the picture", got)
	}
}

// Only a member makes this server fetch: a stranger is refused before it
// reaches the network.
func TestLinkPreview_AStrangerCannotMakeTheServerFetch_FR29_16(t *testing.T) {
	for _, route := range []string{"", "/image"} {
		fake := &fakePreviewer{}
		srv := newPreviewServer(t, fake)
		resp, _ := doJSON(t, http.MethodPost, previewURL(srv)+route, token(t, "user-x", testSecret),
			api.LinkPreviewRequest{URL: "https://example.org"})
		if resp.StatusCode != http.StatusForbidden || len(fake.asked) != 0 {
			t.Errorf("%q: status = %d after %d fetches, want 403 and none", route, resp.StatusCode, len(fake.asked))
		}
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
		for _, route := range []string{"", "/image"} {
			t.Run(name+route, func(t *testing.T) {
				srv := newPreviewServer(t, &fakePreviewer{err: tc.err})
				resp, raw := doJSON(t, http.MethodPost, previewURL(srv)+route, token(t, userA, testSecret),
					api.LinkPreviewRequest{URL: "https://example.org"})
				var body api.APIError
				_ = json.Unmarshal(raw, &body)
				if resp.StatusCode != tc.want || body.Error.Code != tc.code {
					t.Errorf("status %d code %q, want %d %q", resp.StatusCode, body.Error.Code, tc.want, tc.code)
				}
			})
		}
	}
}

// Off is an instance that fetches nothing, and the route says so.
func TestLinkPreview_OffIsSaidOnTheRoute_FR29_16(t *testing.T) {
	srv := newPreviewServer(t, nil)
	for _, route := range []string{"", "/image"} {
		resp, raw := doJSON(t, http.MethodPost, previewURL(srv)+route, token(t, userA, testSecret),
			api.LinkPreviewRequest{URL: "https://example.org"})
		var body api.APIError
		_ = json.Unmarshal(raw, &body)
		if resp.StatusCode != http.StatusNotImplemented || body.Error.Code != api.ErrNotConfigured {
			t.Errorf("%q: status %d code %q, want 501 %q", route, resp.StatusCode, body.Error.Code, api.ErrNotConfigured)
		}
	}
}
