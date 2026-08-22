package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// A constraint the database refuses used to leave the handler with a raw
// error, which it answered as 500. That is the one status the client's
// outbox keeps retrying — a failing server is expected to recover — so the
// mutation stayed at the head of its queue and every later mutation for
// that trip stayed behind it. The push must answer 200 with the single
// mutation `rejected`, and the rest of the batch must still apply.
func TestPush_ConstraintViolation_RejectsOneMutationAndAppliesTheRest(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(
		`INSERT INTO trip_items (id, trip_id, name, quantity) VALUES ('item-1', ?, 'Socken', 2)`, trip); err != nil {
		t.Fatalf("seed: %v", err)
	}

	body := map[string]any{"mutations": []any{
		// A container another device deleted while this one was offline.
		mutation("item-1", "mut-1", "upsert",
			map[string]any{"container_id": "gone-container"}, "0000000002000-0000-bbbbbbbb"),
		// Ordinary traffic queued behind it — this is what used to be held
		// hostage by the 500.
		mutation("item-1", "mut-2", "upsert",
			map[string]any{"quantity": 5}, "0000000003000-0000-cccccccc"),
	}}
	resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, want 200 — a refused row must not fail the batch. body %s", resp.StatusCode, raw)
	}
	var out struct {
		Results []struct {
			MutationID string `json:"mutation_id"`
			Outcome    string `json:"outcome"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode push response: %v (%s)", err, raw)
	}
	if len(out.Results) != 2 {
		t.Fatalf("results = %+v, want two", out.Results)
	}
	if out.Results[0].Outcome != "rejected" {
		t.Errorf("first outcome = %q, want rejected", out.Results[0].Outcome)
	}
	if out.Results[1].Outcome != "applied" {
		t.Errorf("second outcome = %q, want applied — the mutation behind the refusal was dropped", out.Results[1].Outcome)
	}

	var qty int
	if err := st.DB().QueryRow(`SELECT quantity FROM trip_items WHERE id = 'item-1'`).Scan(&qty); err != nil {
		t.Fatal(err)
	}
	if qty != 5 {
		t.Errorf("quantity = %d, want 5", qty)
	}
}
