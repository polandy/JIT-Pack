package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// A mutation's HLC is a claim about ordering that the server took on trust.
// Lexicographic order *is* the merge rule (Sync-API §6, NFR-4.2a), so a
// value outside the format does not merely fail to parse: `"~"` sorts above
// every clock the protocol can generate, so the field it lands on can never
// be written again — by anyone, on any device, for good. It is a client
// value reaching a correctness decision, which invariant 3 says is never
// trusted, and it has to be refused before it is stored.

// decodeResults reads the per-mutation outcomes and reasons of a push.
func decodeResults(t *testing.T, raw []byte) []struct {
	MutationID string `json:"mutation_id"`
	Outcome    string `json:"outcome"`
	Error      string `json:"error"`
} {
	t.Helper()
	var out struct {
		Results []struct {
			MutationID string `json:"mutation_id"`
			Outcome    string `json:"outcome"`
			Error      string `json:"error"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode push response: %v (%s)", err, raw)
	}
	return out.Results
}

func TestPush_UnorderableHLC_RejectedAndLeavesTheRowWritable(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(
		`INSERT INTO trip_items (id, trip_id, name, quantity) VALUES ('item-1', ?, 'Socken', 2)`, trip); err != nil {
		t.Fatalf("seed: %v", err)
	}

	body := map[string]any{"mutations": []any{
		mutation("item-1", "mut-1", "upsert", map[string]any{"quantity": 99}, "~"),
		// The honest device that would have been locked out forever.
		mutation("item-1", "mut-2", "upsert", map[string]any{"quantity": 5},
			"0000000003000-0000-cccccccc"),
	}}
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, want 200 — a refused mutation must not fail the batch. body %s", resp.StatusCode, raw)
	}
	results := decodeResults(t, raw)
	if len(results) != 2 {
		t.Fatalf("results = %+v, want two", results)
	}
	if results[0].Outcome != "rejected" {
		t.Errorf("first outcome = %q, want rejected", results[0].Outcome)
	}
	if results[0].Error != "malformed_hlc" {
		t.Errorf("first reason = %q, want malformed_hlc", results[0].Error)
	}
	if results[1].Outcome != "applied" {
		t.Errorf("second outcome = %q, want applied", results[1].Outcome)
	}

	// The positive signal: the later, ordinary write reached the row, which
	// it could not have done if the unorderable clock had been stored.
	var qty int
	var hlc string
	if err := st.DB().QueryRow(
		`SELECT quantity, updated_hlc FROM trip_items WHERE id = 'item-1'`).Scan(&qty, &hlc); err != nil {
		t.Fatal(err)
	}
	if qty != 5 {
		t.Errorf("quantity = %d, want 5 — the row is unwritable", qty)
	}
	if hlc != "0000000003000-0000-cccccccc" {
		t.Errorf("updated_hlc = %q, want the honest device's clock", hlc)
	}
}

func TestMasterPush_UnorderableHLC_RejectedAndCreatesNoRow(t *testing.T) {
	srv, st := newTestServerWithStore(t)

	body := map[string]any{"mutations": []any{
		masterMutation("items", "item-m1", "mm-1", "insert",
			map[string]any{"name": "Stirnlampe"}, "9999999999999-0000-aaaaaaaaa"),
	}}
	resp, raw := doJSON(t, http.MethodPost, masterURL(srv), token(t, userA, testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	results := decodeResults(t, raw)
	if len(results) != 1 || results[0].Outcome != "rejected" || results[0].Error != "malformed_hlc" {
		t.Fatalf("results = %+v, want one rejected/malformed_hlc", results)
	}

	var rows int
	if err := st.DB().QueryRow(`SELECT count(*) FROM items WHERE id = 'item-m1'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Errorf("items rows = %d, want none — the refusal wrote the row anyway", rows)
	}
}

// The guard has to let the protocol through, or it is a refusal of every
// push rather than of a forged clock.
func TestPush_GeneratedHLC_StillApplies(t *testing.T) {
	srv, _ := newTestServerWithStore(t)

	body := map[string]any{"mutations": []any{
		mutation("item-2", "mut-3", "insert",
			map[string]any{"trip_id": trip, "name": "Zelt", "quantity": 1},
			"1783862400123-000f-a1b2c3d4"),
	}}
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	results := decodeResults(t, raw)
	if len(results) != 1 || results[0].Outcome != "applied" {
		t.Fatalf("results = %+v, want one applied", results)
	}
}
