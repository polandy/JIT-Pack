package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/store"
)

// FR-1.9 end to end: an inventory item may name the account it is normally
// assigned to, and the column round-trips through push and pull. The failure
// half matters as much: an id that is no account is refused per mutation (the
// FK), and the row beside it still lands — while an item with no assignee at
// all is the ordinary case and stays valid.
func TestMasterPush_ItemDefaultAssignee_RoundTripsAndRefusesUnknownAccount_FR1_9(t *testing.T) {
	srv := newTestServer(t)
	url := masterURL(srv)

	body := map[string]any{"mutations": []any{
		masterMutation("items", "item-mine", "ma-mine", "insert",
			map[string]any{"name": "Kamera", store.DefaultAssigneeColumn: userA},
			"0000000001000-0000-aaaaaaaa"),
		masterMutation("items", "item-ghost", "ma-ghost", "insert",
			map[string]any{"name": "Drohne", store.DefaultAssigneeColumn: "no-such-account"},
			"0000000001000-0001-aaaaaaaa"),
		masterMutation("items", "item-free", "ma-free", "insert",
			map[string]any{"name": "Zelt"},
			"0000000001000-0002-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, url, token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Results []struct {
			MutationID string `json:"mutation_id"`
			Outcome    string `json:"outcome"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode push: %v (%s)", err, raw)
	}
	want := []string{"applied", "rejected", "applied"}
	if len(out.Results) != len(want) {
		t.Fatalf("results = %+v, want %d", out.Results, len(want))
	}
	for i, w := range want {
		if out.Results[i].Outcome != w {
			t.Errorf("result %d (%s) = %s, want %s", i, out.Results[i].MutationID, out.Results[i].Outcome, w)
		}
	}

	resp, raw = doJSON(t, http.MethodGet, url+"?cursor=0", token(t, userA, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
	}
	var pull struct {
		Changes []struct {
			ID  string         `json:"id"`
			Row map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pull); err != nil {
		t.Fatalf("decode pull: %v (%s)", err, raw)
	}
	assignees := map[string]any{}
	for _, c := range pull.Changes {
		assignees[c.ID] = c.Row[store.DefaultAssigneeColumn]
		// A schema refusal is re-logged as an empty entry so the pushing
		// device drops its optimistic row; what must never arrive is data.
		if c.ID == "item-ghost" && len(c.Row) != 0 {
			t.Errorf("the refused row reached the feed with data: %+v", c.Row)
		}
	}
	if assignees["item-mine"] != userA {
		t.Errorf("item-mine assignee = %v, want %s", assignees["item-mine"], userA)
	}
	if assignees["item-free"] != nil {
		t.Errorf("item-free assignee = %v, want none — the assignment is optional", assignees["item-free"])
	}
}
