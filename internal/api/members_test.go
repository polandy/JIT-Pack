package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// trip_members over the master sync endpoints (FR-4.5/4.7) and the user
// directory backing the M3 sharing picker.

func TestListUsers_Directory(t *testing.T) {
	srv := newTestServer(t)

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/users", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Users []struct {
			UserID      string `json:"user_id"`
			DisplayName string `json:"display_name"`
		} `json:"users"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if len(out.Users) != 3 {
		t.Fatalf("users = %d, want 3", len(out.Users))
	}
	if out.Users[0].DisplayName != "Andy" || out.Users[1].DisplayName != "Sarah" || out.Users[2].DisplayName != "Stranger" {
		t.Errorf("directory order = %+v, want Andy, Sarah, Stranger", out.Users)
	}

	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/users", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("unauthenticated status = %d, want 401", resp.StatusCode)
	}
}

// End to end over HTTP: the owner shares a freshly created trip via a
// trip_members insert on the master partition; the new member pulls the
// trip plus roster and gains trip-partition access.
func TestMasterPush_ShareTripGrantsAccess(t *testing.T) {
	srv := newTestServer(t)
	masterURL := srv.URL + "/api/v1/sync/master"

	body := map[string]any{"mutations": []any{
		masterMutation("trips", "trip-shared", "sh-1", "insert",
			map[string]any{"name": "Geteilt", "end_date": "2026-09-01", "status": "planning"},
			"0000000001000-0000-aaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, masterURL, token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("create push status = %d, body %s", resp.StatusCode, raw)
	}

	// The stranger has no access yet.
	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/sync/trips/trip-shared?cursor=0",
		token(t, "user-x", testSecret), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("pre-share trip pull status = %d, want 403", resp.StatusCode)
	}

	body = map[string]any{"mutations": []any{
		masterMutation("trip_members", "mem-x", "sh-2", "insert",
			map[string]any{"trip_id": "trip-shared", "user_id": "user-x", "role": "editor"},
			"0000000002000-0000-aaaaaaaa"),
	}}
	resp, raw = doJSON(t, http.MethodPost, masterURL, token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("share push status = %d, body %s", resp.StatusCode, raw)
	}
	var pushOut struct {
		Results []struct {
			Outcome string `json:"outcome"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &pushOut); err != nil {
		t.Fatalf("decode push: %v (%s)", err, raw)
	}
	if len(pushOut.Results) != 1 || pushOut.Results[0].Outcome != "applied" {
		t.Fatalf("share results = %+v, want one applied", pushOut.Results)
	}

	// The new member's master pull now delivers the trip and the roster.
	resp, raw = doJSON(t, http.MethodGet, masterURL+"?cursor=0", token(t, "user-x", testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("member master pull status = %d, body %s", resp.StatusCode, raw)
	}
	var pullOut struct {
		Changes []struct {
			Table string         `json:"table"`
			ID    string         `json:"id"`
			Row   map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pullOut); err != nil {
		t.Fatalf("decode pull: %v (%s)", err, raw)
	}
	got := map[string]bool{}
	for _, c := range pullOut.Changes {
		got[c.Table+"/"+c.ID] = true
	}
	if !got["trips/trip-shared"] {
		t.Error("new member must pull the shared trip")
	}
	if !got["trip_members/mem-x"] {
		t.Error("new member must pull their membership row")
	}

	// …and trip-partition access works.
	resp, raw = doJSON(t, http.MethodGet, srv.URL+"/api/v1/sync/trips/trip-shared?cursor=0",
		token(t, "user-x", testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("post-share trip pull status = %d, body %s", resp.StatusCode, raw)
	}
}
