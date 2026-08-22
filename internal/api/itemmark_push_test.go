package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"jitpack/internal/store"
)

// FR-28.9 end to end: the cap is not merely a function, it is *called* on the
// push path.
//
// Mutation-proved, and the proof corrected what this case is for: without the
// call site the row still never lands and the result is still `rejected` per
// mutation — the CHECK sees to that. What is lost is the **reason**. The
// store's constraint failure arrives with an empty `error`, so a client is
// told its mutation was refused and not why, on the one field where the
// answer is a single sentence. That empty string is what the assertion below
// is actually guarding.
func TestMasterPush_CapsTheMark_PerMutation_FR28_9(t *testing.T) {
	srv := newTestServer(t)
	url := srv.URL + "/api/v1/sync/master"

	body := map[string]any{"mutations": []any{
		masterMutation("items", "item-long", "mm-long", "insert",
			map[string]any{"name": "Ballast", store.MarkColumn: strings.Repeat("x", store.MarkMaxBytes+1)},
			"0000000001000-0000-aaaaaaaa"),
		masterMutation("items", "item-ok", "mm-ok", "insert",
			map[string]any{"name": "Zelt", store.MarkColumn: "⛺"},
			"0000000001000-0001-aaaaaaaa"),
	}}

	resp, raw := doJSON(t, http.MethodPost, url, token(t, userA, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Results []struct {
			MutationID string `json:"mutation_id"`
			Outcome    string `json:"outcome"`
			Error      string `json:"error"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode push: %v (%s)", err, raw)
	}
	if len(out.Results) != 2 {
		t.Fatalf("results = %+v, want two", out.Results)
	}
	if out.Results[0].Outcome != "rejected" || out.Results[0].Error == "" {
		t.Errorf("over-long mark = %+v, want rejected with a reason", out.Results[0])
	}
	// The positive half: the legal mark beside it is applied, which is what
	// "per mutation" means and what a batch-level CHECK failure would break.
	if out.Results[1].Outcome != "applied" {
		t.Errorf("legal mark = %+v, want applied", out.Results[1])
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
	marks := map[string]any{}
	for _, c := range pull.Changes {
		marks[c.ID] = c.Row[store.MarkColumn]
	}
	if _, present := marks["item-long"]; present {
		t.Error("the refused row reached the feed")
	}
	if marks["item-ok"] != "⛺" {
		t.Errorf("item-ok mark = %v, want the tent — FR-28.9 syncs it like a name", marks["item-ok"])
	}
}
