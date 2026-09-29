package api_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"jitpack/internal/store"
)

// Idea pictures at the HTTP edge (FR-29.5): the upload and the bytes are the
// trip's, so both sit behind its membership — unlike an item photo, which is
// instance-wide and public (FR-22.6).

func newIdeaImageServer(t *testing.T) (*httptest.Server, *store.Store) {
	t.Helper()
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(`INSERT INTO ideas (id, trip_id, author_id, title)
		VALUES ('idea-1', 'trip-samedan', 'user-a', 'Seerundgang')`); err != nil {
		t.Fatalf("seed idea: %v", err)
	}
	return srv, st
}

func ideaImageURL(srv *httptest.Server, ideaID, imageID string) string {
	return srv.URL + "/api/v1/trips/" + trip + "/ideas/" + ideaID + "/images/" + imageID
}

func getWithBearer(t *testing.T, url, bearer string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+bearer)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return resp, body
}

func TestIdeaImage_AMemberUploadsAndAnotherReads_FR29_5(t *testing.T) {
	srv, _ := newIdeaImageServer(t)
	jpeg := bytes.Repeat([]byte{0xFF, 0xD8, 0xFF}, 100)

	put := putBytes(t, ideaImageURL(srv, "idea-1", "ii-1"), token(t, userA, testSecret), "image/jpeg", jpeg)
	if put.StatusCode != http.StatusOK {
		t.Fatalf("PUT status = %d", put.StatusCode)
	}

	resp, body := getWithBearer(t, ideaImageURL(srv, "idea-1", "ii-1"), token(t, userB, testSecret))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET status = %d", resp.StatusCode)
	}
	if !bytes.Equal(body, jpeg) {
		t.Errorf("GET returned %d bytes, want %d", len(body), len(jpeg))
	}
	if ct := resp.Header.Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("Content-Type = %q, want image/jpeg", ct)
	}
	if resp.Header.Get("ETag") == "" {
		t.Error("no ETag — a device could not tell a picture it already holds")
	}
}

func TestIdeaImage_AStrangerNeitherUploadsNorReads_FR29_5(t *testing.T) {
	srv, _ := newIdeaImageServer(t)
	jpeg := []byte{0xFF, 0xD8, 0xFF}
	if put := putBytes(t, ideaImageURL(srv, "idea-1", "ii-1"), token(t, userA, testSecret), "image/jpeg", jpeg); put.StatusCode != http.StatusOK {
		t.Fatalf("seed PUT status = %d", put.StatusCode)
	}

	stranger := token(t, "user-x", testSecret)
	if put := putBytes(t, ideaImageURL(srv, "idea-1", "ii-2"), stranger, "image/jpeg", jpeg); put.StatusCode != http.StatusForbidden {
		t.Errorf("stranger PUT status = %d, want 403", put.StatusCode)
	}
	if resp, _ := getWithBearer(t, ideaImageURL(srv, "idea-1", "ii-1"), stranger); resp.StatusCode != http.StatusForbidden {
		t.Errorf("stranger GET status = %d, want 403", resp.StatusCode)
	}
}

func TestIdeaImage_RefusedUploads_FR29_5(t *testing.T) {
	srv, _ := newIdeaImageServer(t)
	bearer := token(t, userA, testSecret)
	for i, id := range []string{"ii-1", "ii-2", "ii-3", "ii-4"} {
		if put := putBytes(t, ideaImageURL(srv, "idea-1", id), bearer, "image/jpeg", []byte{0xFF, byte(i)}); put.StatusCode != http.StatusOK {
			t.Fatalf("PUT %s status = %d", id, put.StatusCode)
		}
	}
	cases := []struct {
		name, ideaID, contentType string
		body                      []byte
		want                      int
	}{
		{"a fifth picture", "idea-1", "image/jpeg", []byte{0xFF}, http.StatusUnprocessableEntity},
		{"not a JPEG", "idea-1", "image/png", []byte{0x89}, http.StatusUnprocessableEntity},
		{"over 500 KB", "idea-1", "image/jpeg", make([]byte, store.MaxIdeaImageBytes+1), http.StatusUnprocessableEntity},
		{"an idea that is not there", "idea-gone", "image/jpeg", []byte{0xFF}, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			put := putBytes(t, ideaImageURL(srv, tc.ideaID, "ii-new"), bearer, tc.contentType, tc.body)
			if put.StatusCode != tc.want {
				t.Errorf("status = %d, want %d", put.StatusCode, tc.want)
			}
		})
	}
}

func TestIdeaImage_GetOfAMissingPictureIs404_FR29_5(t *testing.T) {
	srv, _ := newIdeaImageServer(t)
	if resp, _ := getWithBearer(t, ideaImageURL(srv, "idea-1", "ii-none"), token(t, userA, testSecret)); resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}
