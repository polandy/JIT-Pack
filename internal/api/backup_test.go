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

	// user-b creates a template and an item — both instance-wide master data
	// (FR-1.6 MVP), so both belong in user-a's export. The trip user-b is not
	// a member of is what the filter still has to keep out.
	push := map[string]any{
		"client_hlc": "0000000001000-0000-bbbbbbbb",
		"mutations": []map[string]any{
			{"mutation_id": "xf-1", "op": "insert", "table": "templates", "id": "tpl-bertas",
				"fields": map[string]any{"name": "Bertas Basis"},
				"hlc":    "0000000001000-0000-bbbbbbbb"},
			{"mutation_id": "xf-2", "op": "insert", "table": "items", "id": "item-shared",
				"fields": map[string]any{"name": "Socken"},
				"hlc":    "0000000001001-0000-bbbbbbbb"},
		},
	}
	if resp, raw := doJSON(t, http.MethodPost, masterURL(srv),
		token(t, userB, testSecret), push); resp.StatusCode != http.StatusOK {
		t.Fatalf("master push status = %d, body: %s", resp.StatusCode, raw)
	}

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me/export.json",
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
	if got := names("templates", "id"); len(got) != 1 || got[0] != "tpl-bertas" {
		t.Errorf("templates = %v, want [tpl-bertas] (shared instance-wide, FR-1.6 MVP)", got)
	}
}

// The {userID} in the path names the row that gets written, so it must be the
// caller's own. Both routes previously carried `authed` alone, which let any
// account overwrite any other account's avatar or display name (invariant 3).
func TestProfileWrites_RefuseAnotherUser(t *testing.T) {
	srv := newTestServer(t)

	t.Run("display name", func(t *testing.T) {
		resp, raw := doJSON(t, http.MethodPut, srv.URL+"/api/v1/users/"+userB+"/display-name",
			token(t, userA, testSecret), map[string]any{"display_name": "Hijacked"})
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("status = %d, want 403 (body %s)", resp.StatusCode, raw)
		}

		resp, raw = doJSON(t, http.MethodPut, srv.URL+"/api/v1/users/"+userA+"/display-name",
			token(t, userA, testSecret), map[string]any{"display_name": "Andy.P"})
		if resp.StatusCode != http.StatusOK {
			t.Errorf("own display name: status = %d, want 200 (body %s)", resp.StatusCode, raw)
		}
	})

	t.Run("avatar", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodPut,
			srv.URL+"/api/v1/users/"+userB+"/avatar", strings.NewReader("not-really-a-jpeg"))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+token(t, userA, testSecret))
		req.Header.Set("Content-Type", "image/jpeg")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()

		// 403 before the body is even read: authorization precedes validation,
		// so a rejected caller never reaches the JPEG check.
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("status = %d, want 403", resp.StatusCode)
		}
	})
}
