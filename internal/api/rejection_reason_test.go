package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"jitpack/internal/store"
)

// Sync-API §5 declares an `error` beside a `rejected` outcome, and until
// this test it was written only for the two validation errors raised before
// the store is reached. Every refusal the store itself makes — authorization,
// a constraint, a delete the data still depends on — arrived as a bare
// `rejected`, so the client parked the mutation with nothing to tell anyone.
//
// The motivating case is FR-9.2's provenance: `trip_items.source_template_id`
// has no ON DELETE clause on purpose, so a Vorlage that ever generated a trip
// item can never be deleted. The user deletes the group in M7, the client
// removes it optimistically, the server keeps it, and the two diverge for
// good — which nothing on screen could say while the refusal was wordless.
func TestPush_RefusingToDeleteAReferencedTemplate_NamesTheReason(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(
		`INSERT INTO templates (id, name, kind, owner_id) VALUES ('tpl-ferien', 'Ferien', ?, ?)`,
		store.KindTemplate, userA); err != nil {
		t.Fatalf("seed template: %v", err)
	}
	if _, err := st.DB().Exec(
		`INSERT INTO trip_items (id, trip_id, name, source_template_id) VALUES ('ti-1', ?, 'Zahnbürste', 'tpl-ferien')`,
		trip); err != nil {
		t.Fatalf("seed trip item: %v", err)
	}

	body := map[string]any{"mutations": []any{
		map[string]any{
			"mutation_id": "mut-del", "op": "delete", "table": store.TableTemplates,
			"id": "tpl-ferien", "hlc": "0000000002000-0000-bbbbbbbb",
		},
		// The counter-signal: an ordinary mutation in the same batch must
		// come back with no reason at all, so "error is set" cannot be an
		// artefact of the field simply always being written.
		map[string]any{
			"mutation_id": "mut-ok", "op": "insert", "table": store.TableTemplates,
			"id": "tpl-frei", "fields": map[string]any{"name": "Frei", "kind": store.KindTemplate},
			"hlc": "0000000002001-0000-bbbbbbbb",
		},
	}}
	resp, raw := doJSON(t, http.MethodPost, masterURL(srv), token(t, userA, testSecret), body)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, want 200. body %s", resp.StatusCode, raw)
	}
	var out struct {
		Results []struct {
			Outcome string `json:"outcome"`
			Error   string `json:"error"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode push response: %v (%s)", err, raw)
	}
	if len(out.Results) != 2 || out.Results[0].Outcome != "rejected" {
		t.Fatalf("results = %+v, want the delete rejected", out.Results)
	}
	if got, want := out.Results[0].Error, string(store.ReasonStillReferenced); got != want {
		t.Errorf("error = %q, want %q — a refusal the client cannot name is a refusal it cannot show", got, want)
	}

	if out.Results[1].Error != "" {
		t.Errorf("applied result carries error = %q, want none", out.Results[1].Error)
	}

	// The positive signal the assertion is made against: the server really
	// did keep the row, so there is something to tell the user about.
	var rows int
	if err := st.DB().QueryRow(`SELECT count(*) FROM templates WHERE id = 'tpl-ferien'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Errorf("template rows = %d, want the delete refused", rows)
	}
}
