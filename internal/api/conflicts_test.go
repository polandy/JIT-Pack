package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// G-2 conflict log view: members can read a trip's audited LWW losers.
func TestConflicts_MemberReadsLog(t *testing.T) {
	srv := newTestServer(t)

	// Produce one conflict: seed, then a stale write on the same field.
	push := func(mutID, hlc string, fields map[string]any) {
		body := map[string]any{"mutations": []any{
			mutation("item-c1", mutID, "upsert", fields, hlc),
		}}
		resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
		}
	}
	push("cf-1", "0000000002000-0000-bbbbbbbb", map[string]any{"trip_id": trip, "name": "Socken", "quantity": 5})
	push("cf-2", "0000000001000-0000-aaaaaaaa", map[string]any{"quantity": 9})

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/trips/"+trip+"/conflicts",
		token(t, userB, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Conflicts []struct {
			EntityTable  string `json:"entity_table"`
			EntityID     string `json:"entity_id"`
			Field        string `json:"field"`
			LosingValue  string `json:"losing_value"`
			WinningValue string `json:"winning_value"`
			ResolvedAt   string `json:"resolved_at"`
		} `json:"conflicts"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if len(out.Conflicts) != 1 {
		t.Fatalf("conflicts = %d, want 1", len(out.Conflicts))
	}
	c := out.Conflicts[0]
	if c.Field != "quantity" || c.LosingValue != "9" || c.WinningValue != "5" {
		t.Errorf("unexpected conflict %+v", c)
	}
}

func TestConflicts_NonMemberForbidden(t *testing.T) {
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodGet, srv.URL+"/api/v1/trips/"+trip+"/conflicts",
		token(t, "user-x", testSecret), nil)

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", resp.StatusCode)
	}
}

// NFR-4.2a: the master partition has losers too — a template or a trip's
// own fields merge there — and they were reachable through no endpoint.
func TestConflicts_MasterLogIsReadable(t *testing.T) {
	srv := newTestServer(t)

	push := func(mutID, hlc string, fields map[string]any) {
		body := map[string]any{"mutations": []any{
			mutation("tpl-mc", mutID, "upsert", fields, hlc),
		}}
		body["mutations"].([]any)[0].(map[string]any)["table"] = "templates"
		resp, raw := doJSON(t, http.MethodPost, srv.URL+"/api/v1/sync/master", token(t, userA, testSecret), body)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
		}
	}
	push("mcf-1", "0000000002000-0000-bbbbbbbb", map[string]any{"owner_id": userA, "name": "Ferien"})
	push("mcf-2", "0000000001000-0000-aaaaaaaa", map[string]any{"name": "Sommerferien"})

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/conflicts/master",
		token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Conflicts []struct {
			EntityTable  string `json:"entity_table"`
			EntityID     string `json:"entity_id"`
			Field        string `json:"field"`
			LosingValue  string `json:"losing_value"`
			WinningValue string `json:"winning_value"`
		} `json:"conflicts"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	if len(out.Conflicts) != 1 {
		t.Fatalf("conflicts = %d, want 1 (%s)", len(out.Conflicts), raw)
	}
	c := out.Conflicts[0]
	if c.EntityTable != "templates" || c.EntityID != "tpl-mc" || c.Field != "name" {
		t.Errorf("unexpected conflict %+v", c)
	}
	if c.LosingValue != `"Sommerferien"` || c.WinningValue != `"Ferien"` {
		t.Errorf("losing/winning = %q/%q", c.LosingValue, c.WinningValue)
	}
}

func TestConflicts_MasterLogRequiresAuth(t *testing.T) {
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodGet, srv.URL+"/api/v1/conflicts/master", "", nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", resp.StatusCode)
	}
}
