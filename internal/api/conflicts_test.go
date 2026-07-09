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
