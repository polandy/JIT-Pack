package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/store"
)

// FR-24.15 end to end: a row that lost a merge names the survivor in
// merged_into_id, and the column round-trips through push and pull like any
// other item field. The failure half is the same shape as FR-1.9's assignee:
// an id that names no item is refused per mutation by the foreign key, and the
// rows beside it still land — the merge is a client-side rule (invariant 4),
// so the server's whole job here is to carry the column and to refuse a
// pointer into nothing.
func TestMasterPush_ItemMergedInto_RoundTripsAndRefusesUnknownItem_FR24_15(t *testing.T) {
	srv := newTestServer(t)
	url := masterURL(srv)

	body := map[string]any{"mutations": []any{
		masterMutation("items", "item-survivor", "mm-survivor", "insert",
			map[string]any{"name": "Stirnlampe"},
			"0000000001000-0000-aaaaaaaa"),
		masterMutation("items", "item-loser", "mm-loser", "insert",
			map[string]any{"name": "Stirnlampe Petzl", store.MergedIntoColumn: "item-survivor"},
			"0000000001000-0001-aaaaaaaa"),
		masterMutation("items", "item-ghost", "mm-ghost", "insert",
			map[string]any{"name": "Kopflampe", store.MergedIntoColumn: "no-such-item"},
			"0000000001000-0002-aaaaaaaa"),
		masterMutation("items", "item-plain", "mm-plain", "insert",
			map[string]any{"name": "Zelt"},
			"0000000001000-0003-aaaaaaaa"),
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
	want := []string{"applied", "applied", "rejected", "applied"}
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
	aliases := map[string]any{}
	for _, c := range pull.Changes {
		aliases[c.ID] = c.Row[store.MergedIntoColumn]
		// A schema refusal is re-logged as an empty entry so the pushing
		// device drops its optimistic row; what must never arrive is data.
		if c.ID == "item-ghost" && len(c.Row) != 0 {
			t.Errorf("the refused row reached the feed with data: %+v", c.Row)
		}
	}
	if aliases["item-loser"] != "item-survivor" {
		t.Errorf("item-loser merged_into = %v, want item-survivor", aliases["item-loser"])
	}
	if aliases["item-plain"] != nil {
		t.Errorf("item-plain merged_into = %v, want null", aliases["item-plain"])
	}
	if aliases["item-survivor"] != nil {
		t.Errorf("item-survivor merged_into = %v, want null", aliases["item-survivor"])
	}
}
