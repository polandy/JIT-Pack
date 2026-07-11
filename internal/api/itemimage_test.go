package api_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"jitpack/internal/api"
	"jitpack/internal/store"
)

// Item-image endpoint tests (Addendum 3.22, FR-22). The GET is public
// like the avatar GET; PUT/DELETE need only authentication (FR-22.6),
// no trip role — items carry no trip association to check against.

func newItemImageServer(t *testing.T) (*httptest.Server, *store.Store, string) {
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
	if _, err := st.DB().Exec(`INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	srv := httptest.NewServer(api.NewSingleUser(st, localID).Handler())
	t.Cleanup(srv.Close)
	return srv, st, localID
}

func itemImageURL(srv *httptest.Server, itemID string) string {
	return srv.URL + "/api/v1/items/" + itemID + "/image"
}

func TestItemImage_UploadThenDownloadRoundTrips(t *testing.T) {
	srv, _, _ := newItemImageServer(t)
	jpeg := bytes.Repeat([]byte{0xFF, 0xD8, 0xFF}, 100)

	putResp := putBytes(t, itemImageURL(srv, "item-camera"), "", "image/jpeg", jpeg)
	if putResp.StatusCode != http.StatusOK {
		t.Fatalf("PUT status = %d", putResp.StatusCode)
	}

	getResp, err := http.Get(itemImageURL(srv, "item-camera"))
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
		t.Error("expected an ETag header for caching (FR-22 GET)")
	}
	var got bytes.Buffer
	if _, err := got.ReadFrom(getResp.Body); err != nil {
		t.Fatalf("read body: %v", err)
	}
	if !bytes.Equal(got.Bytes(), jpeg) {
		t.Error("downloaded item image bytes don't match the upload")
	}
}

func TestItemImage_GetWithoutUploadIsNotFound(t *testing.T) {
	srv, _, _ := newItemImageServer(t)

	resp, err := http.Get(itemImageURL(srv, "item-camera"))
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 for an item with no image", resp.StatusCode)
	}
}

func TestItemImage_OversizedUploadRejected(t *testing.T) {
	srv, _, _ := newItemImageServer(t)
	tooBig := bytes.Repeat([]byte{0xFF}, 200_000)

	resp := putBytes(t, itemImageURL(srv, "item-camera"), "", "image/jpeg", tooBig)
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422 for >150 KB (FR-22.4)", resp.StatusCode)
	}
}

func TestItemImage_WrongContentTypeRejected(t *testing.T) {
	srv, _, _ := newItemImageServer(t)

	resp := putBytes(t, itemImageURL(srv, "item-camera"), "", "image/png", []byte{0x89, 0x50, 0x4E, 0x47})
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422 for non-JPEG (FR-22.4)", resp.StatusCode)
	}
}

func TestItemImage_UploadToUnknownItemIsNotFound(t *testing.T) {
	srv, _, _ := newItemImageServer(t)

	resp := putBytes(t, itemImageURL(srv, "ghost"), "", "image/jpeg", []byte{0xFF, 0xD8, 0xFF})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 for an unknown item", resp.StatusCode)
	}
}

func TestItemImage_DeleteRemovesImage(t *testing.T) {
	srv, _, _ := newItemImageServer(t)
	jpeg := bytes.Repeat([]byte{0xFF, 0xD8, 0xFF}, 100)
	if resp := putBytes(t, itemImageURL(srv, "item-camera"), "", "image/jpeg", jpeg); resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT status = %d", resp.StatusCode)
	}

	req, _ := http.NewRequest(http.MethodDelete, itemImageURL(srv, "item-camera"), nil)
	delResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE: %v", err)
	}
	delResp.Body.Close()
	if delResp.StatusCode != http.StatusOK {
		t.Fatalf("DELETE status = %d", delResp.StatusCode)
	}

	getResp, err := http.Get(itemImageURL(srv, "item-camera"))
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	getResp.Body.Close()
	if getResp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 after delete", getResp.StatusCode)
	}
}
