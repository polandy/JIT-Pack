package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// A read that *fails* is not a read that found nothing.
//
// Three GETs collapsed every error into 404: a disk or database fault read
// to the caller as "there is no photo here", "this user has no avatar",
// "no such trip" — and to the operator as nothing at all, since the error
// was not even logged. The distinction matters most for the two that serve
// the user's own content: a 404 invites the client to stop asking, and an
// avatar that answers 404 while the database is unreachable is a client
// that renders the fallback initials and never comes back.
//
// The seam is the database itself: closing the store mid-test makes every
// query fail with something that is emphatically not `sql.ErrNoRows`, which
// is the exact shape of the fault these handlers used to swallow.

func decodeErrorCode(t *testing.T, resp *http.Response) string {
	t.Helper()
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	return body.Error.Code
}

func TestGetItemImage_ADatabaseFaultIsNotAMissingImage(t *testing.T) {
	srv, st, _ := newItemImageServer(t)
	if err := st.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	resp, err := http.Get(itemImageURL(srv, "item-camera"))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500 — a failed read must not read as an absent image", resp.StatusCode)
	}
	if code := decodeErrorCode(t, resp); code != "internal" {
		t.Errorf("error code = %q, want %q", code, "internal")
	}
}

func TestGetAvatar_ADatabaseFaultIsNotAMissingAvatar(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if err := st.Close(); err != nil {
		t.Fatalf("close store: %v", err)
	}

	resp, err := http.Get(srv.URL + "/api/v1/users/user-a/avatar")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500 — a failed read must not read as an absent avatar", resp.StatusCode)
	}
	if code := decodeErrorCode(t, resp); code != "internal" {
		t.Errorf("error code = %q, want %q", code, "internal")
	}
}

func TestExportTripCSV_ADatabaseFaultIsNotAMissingTrip(t *testing.T) {
	srv, st := newTestServerWithStore(t)

	// Not the closed store the two cases above use: authorization reads the
	// database too, so closing it would answer 500 before the handler ran
	// and the case would pass without ever reaching it. Taking away exactly
	// the table the export reads leaves the session and the membership
	// intact, so the only thing that can fail is the read under test.
	if _, err := st.DB().Exec(`DROP TABLE trip_items`); err != nil {
		t.Fatalf("drop trip_items: %v", err)
	}

	req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/v1/trips/trip-samedan/export.csv", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token(t, "user-a", testSecret))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500 — a failed read must not read as an absent trip", resp.StatusCode)
	}
	if code := decodeErrorCode(t, resp); code != "internal" {
		t.Errorf("error code = %q, want %q", code, "internal")
	}
}
