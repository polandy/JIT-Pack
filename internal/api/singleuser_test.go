package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// Addendum FR-17.2/FR-17.11: in Single-User Mode, auth and trip-membership
// checks are bypassed at the deployment level, never per-request.

func newSingleUserTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	localID, err := st.EnsureLocalSingleUser(context.Background())
	if err != nil {
		t.Fatalf("EnsureLocalSingleUser: %v", err)
	}
	if _, err := st.DB().Exec(
		`INSERT INTO trips (id, name, start_date, end_date) VALUES ('trip-samedan', 'Samedan 2026', '2026-07-10', '2026-07-20')`,
	); err != nil {
		t.Fatalf("seed trip: %v", err)
	}

	srv := httptest.NewServer(api.NewSingleUser(st, localID).Handler())
	t.Cleanup(srv.Close)
	return srv, localID
}

func TestSingleUserMode_PushPullWorkWithoutAnyToken(t *testing.T) {
	srv, _ := newSingleUserTestServer(t)
	body := map[string]any{"mutations": []any{
		mutation("item-1", "m1", "insert",
			map[string]any{"trip_id": trip, "name": "Sonnenbrille", "quantity": 1},
			"0000000001000-0000-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), "", body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}

	resp, raw = doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", "", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
	}
}

func TestSingleUserMode_AnyBearerTokenIsAlsoAccepted(t *testing.T) {
	// FR-17.11: the bypass is a deployment-time decision — the middleware
	// doesn't reject requests that happen to carry a token either.
	srv, _ := newSingleUserTestServer(t)

	resp, raw := doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", "some-arbitrary-string", nil)

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200, body %s", resp.StatusCode, raw)
	}
}

func TestSingleUserMode_MutationsAttributedToTheImplicitUser(t *testing.T) {
	srv, localID := newSingleUserTestServer(t)
	body := map[string]any{"mutations": []any{
		mutation("item-1", "m1", "insert",
			map[string]any{"trip_id": trip, "name": "Zelt", "quantity": 1, "packer_user_id": localID},
			"0000000001000-0000-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), "", body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
}

func TestNormalMode_StillRequiresAuth(t *testing.T) {
	// Regression guard: adding Single-User Mode must not weaken the
	// default OIDC path.
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodGet, pushURL(srv)+"?cursor=0", "", nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 in normal mode", resp.StatusCode)
	}
}

// --- Avatar & display name endpoints (Addendum FR-17.13, ADR-002) ---

func avatarURL(srv *httptest.Server, userID string) string {
	return srv.URL + "/api/v1/users/" + userID + "/avatar"
}

func displayNameURL(srv *httptest.Server, userID string) string {
	return srv.URL + "/api/v1/users/" + userID + "/display-name"
}

func putBytes(t *testing.T, url, bearer, contentType string, body []byte) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", contentType)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func TestAvatar_UploadThenDownloadRoundTrips(t *testing.T) {
	srv, localID := newSingleUserTestServer(t)
	jpeg := bytes.Repeat([]byte{0xFF, 0xD8, 0xFF}, 100)

	putResp := putBytes(t, avatarURL(srv, localID), "", "image/jpeg", jpeg)
	if putResp.StatusCode != http.StatusOK {
		t.Fatalf("PUT status = %d", putResp.StatusCode)
	}

	getResp, err := http.Get(avatarURL(srv, localID))
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("GET status = %d", getResp.StatusCode)
	}
	if ct := getResp.Header.Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("Content-Type = %q, want image/jpeg", ct)
	}
	if getResp.Header.Get("ETag") == "" {
		t.Error("expected an ETag header for caching")
	}
	var got bytes.Buffer
	got.ReadFrom(getResp.Body)
	if !bytes.Equal(got.Bytes(), jpeg) {
		t.Error("downloaded avatar bytes don't match the upload")
	}
}

func TestAvatar_GetWithoutUploadIsNotFound(t *testing.T) {
	srv, localID := newSingleUserTestServer(t)

	resp, err := http.Get(avatarURL(srv, localID))
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 for a user with no avatar", resp.StatusCode)
	}
}

func TestAvatar_OversizedUploadRejected(t *testing.T) {
	srv, localID := newSingleUserTestServer(t)
	tooBig := bytes.Repeat([]byte{0xFF}, 200_000)

	resp := putBytes(t, avatarURL(srv, localID), "", "image/jpeg", tooBig)

	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422", resp.StatusCode)
	}
}

func TestAvatar_WrongContentTypeRejected(t *testing.T) {
	srv, localID := newSingleUserTestServer(t)

	resp := putBytes(t, avatarURL(srv, localID), "", "image/png", []byte{0x89, 0x50, 0x4E, 0x47})

	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422", resp.StatusCode)
	}
}

func TestDisplayName_ValidUpdateRoundTrips(t *testing.T) {
	srv, localID := newSingleUserTestServer(t)

	resp, raw := doJSON(t, http.MethodPut, displayNameURL(srv, localID), "", map[string]string{"display_name": "Andy_99"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
}

func TestDisplayName_InvalidCharsetRejected(t *testing.T) {
	srv, localID := newSingleUserTestServer(t)

	resp, _ := doJSON(t, http.MethodPut, displayNameURL(srv, localID), "", map[string]string{"display_name": "Andy Pollari!"})

	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422", resp.StatusCode)
	}
}

func mustDecode(t *testing.T, raw []byte, v any) {
	t.Helper()
	if err := json.Unmarshal(raw, v); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
}
