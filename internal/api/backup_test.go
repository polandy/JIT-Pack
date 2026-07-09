package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// M17 profile: the client learns its own identity (needed for avatar and
// display-name endpoints, which are keyed by user id).
func TestMe_ReturnsIdentity(t *testing.T) {
	srv := newTestServer(t)

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body: %s", resp.StatusCode, raw)
	}
	var me struct {
		UserID      string `json:"user_id"`
		DisplayName string `json:"display_name"`
	}
	if err := json.Unmarshal(raw, &me); err != nil {
		t.Fatal(err)
	}
	if me.UserID != userA || me.DisplayName != "Andy" {
		t.Errorf("me = %+v, want user-a/Andy", me)
	}

	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("unauthenticated status = %d, want 401", resp.StatusCode)
	}
}

// NFR-4.5: per-trip CSV export, membership-enforced.
func TestExportTripCSV(t *testing.T) {
	srv := newTestServer(t)

	push := map[string]any{
		"client_hlc": "0000000001000-0000-aaaaaaaa",
		"mutations": []map[string]any{
			mutation("item-csv", "csv-1", "insert", map[string]any{
				"trip_id": trip, "name": "Socken", "category_name": "Kleidung",
				"quantity": 6, "packed_count": 2, "state": "partial", "mode": "pack",
			}, "0000000001000-0000-aaaaaaaa"),
		},
	}
	if resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), push); resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body: %s", resp.StatusCode, raw)
	}

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/trips/"+trip+"/export.csv",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body: %s", resp.StatusCode, raw)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("content-type = %q, want text/csv", ct)
	}
	body := string(raw)
	if !strings.Contains(body, "item,category,quantity,packed_count,mode,traveler,container") {
		t.Errorf("missing header row in:\n%s", body)
	}
	if !strings.Contains(body, "Socken,Kleidung,6,2,pack,,") {
		t.Errorf("missing item row in:\n%s", body)
	}

	resp, _ = doJSON(t, http.MethodGet, srv.URL+"/api/v1/trips/"+trip+"/export.csv",
		token(t, "user-x", testSecret), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("non-member status = %d, want 403", resp.StatusCode)
	}
}

// NFR-4.5: full JSON export, filtered to what the user can see.
func TestExportFull_VisibilityFiltered(t *testing.T) {
	srv := newTestServer(t)

	// user-b creates a private template — must not leak into user-a's export.
	push := map[string]any{
		"client_hlc": "0000000001000-0000-bbbbbbbb",
		"mutations": []map[string]any{
			{"mutation_id": "xf-1", "op": "insert", "table": "templates", "id": "tpl-priv",
				"fields": map[string]any{"name": "Privat", "is_published": 0},
				"hlc":    "0000000001000-0000-bbbbbbbb"},
			{"mutation_id": "xf-2", "op": "insert", "table": "items", "id": "item-shared",
				"fields": map[string]any{"name": "Socken", "unit": "pieces", "is_consumable": 0},
				"hlc":    "0000000001001-0000-bbbbbbbb"},
		},
	}
	if resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/sync/master",
		token(t, userB, testSecret), push); resp.StatusCode != http.StatusOK {
		t.Fatalf("master push status = %d, body: %s", resp.StatusCode, raw)
	}

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/export/full",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body: %s", resp.StatusCode, raw)
	}

	var export struct {
		Version int                         `json:"version"`
		Data    map[string][]map[string]any `json:"data"`
	}
	if err := json.Unmarshal(raw, &export); err != nil {
		t.Fatal(err)
	}
	if export.Version != 1 {
		t.Errorf("version = %d, want 1", export.Version)
	}

	names := func(table, col string) []string {
		var out []string
		for _, row := range export.Data[table] {
			if v, ok := row[col].(string); ok {
				out = append(out, v)
			}
		}
		return out
	}

	if got := names("trips", "id"); len(got) != 1 || got[0] != trip {
		t.Errorf("trips = %v, want [%s] (member trips only)", got, trip)
	}
	if got := names("items", "name"); len(got) != 1 || got[0] != "Socken" {
		t.Errorf("items = %v, want the shared inventory", got)
	}
	for _, tpl := range export.Data["templates"] {
		if tpl["id"] == "tpl-priv" {
			t.Error("foreign private template leaked into the export")
		}
	}
}
