package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// Invariant 3 / FR-4.2: the server stamps every actor column itself, so a
// pusher can never name somebody else as a comment's author or as the
// holder of G-3's packing claim (FR-5.7). These cases push the forgery a
// real client never sends and read the stored row back through pull.

// pushOutcome pushes one mutation and returns the outcome the server
// recorded for it, so a case can assert a clean refusal instead of only
// the absence of a row.
func pushOutcome(t *testing.T, srv, user string, mut map[string]any) string {
	t.Helper()
	body := map[string]any{"mutations": []any{mut}}
	resp, raw := doJSON(t, http.MethodPost, srv+"/api/v1/trips/"+trip+"/sync", token(t, user, testSecret), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	var out struct {
		Results []struct {
			Outcome string `json:"outcome"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Results) != 1 {
		t.Fatalf("results = %+v, want exactly one", out.Results)
	}
	return out.Results[0].Outcome
}

// pullRow returns the synced state of one row, which is the only place a
// stamped column can be observed from outside.
func pullRow(t *testing.T, srv, user, table, id string) map[string]any {
	t.Helper()
	resp, raw := doJSON(t, http.MethodGet, srv+"/api/v1/trips/"+trip+"/sync?cursor=0",
		token(t, user, testSecret), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
	}
	var pull struct {
		Changes []struct {
			Table string         `json:"table"`
			ID    string         `json:"id"`
			Row   map[string]any `json:"row"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(raw, &pull); err != nil {
		t.Fatal(err)
	}
	for _, c := range pull.Changes {
		if c.Table == table && c.ID == id {
			return c.Row
		}
	}
	t.Fatalf("no %s row %q in pull", table, id)
	return nil
}

func TestStampActor_UpsertCannotForgeCommentAuthor(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "fa-1", "op": "insert", "table": "comments", "id": "com-forge",
		"fields": map[string]any{
			"trip_id": trip, "trip_item_id": nil, "body": "Ventil prüfen", "is_task": 0,
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	// user-b edits the comment and claims it was written by the stranger.
	pushOne(t, srv.URL, userB, map[string]any{
		"mutation_id": "fa-2", "op": "upsert", "table": "comments", "id": "com-forge",
		"fields": map[string]any{"author_id": "user-x", "body": "Ventil ist neu"},
		"hlc":    "0000000002000-0000-bbbbbbbb",
	})

	row := pullRow(t, srv.URL, userA, "comments", "com-forge")
	// The edit itself has to land — otherwise the authorship assertion
	// below would be green against a mutation that did nothing.
	if row["body"] != "Ventil ist neu" {
		t.Fatalf("body = %v, want the edit to have applied", row["body"])
	}
	if row["author_id"] != userA {
		t.Errorf("author_id = %v, want %s — an edit may never rewrite authorship", row["author_id"], userA)
	}
}

func TestStampActor_UpsertCreatingACommentIsRefusedRatherThanAttributed(t *testing.T) {
	srv := newTestServer(t)

	// No real client creates a comment by upsert; if one arrives it must
	// fail as a refusal the outbox can park, never as a forged author and
	// never as a 500 that wedges the partition.
	outcome := pushOutcome(t, srv.URL, userB, map[string]any{
		"mutation_id": "fa-3", "op": "upsert", "table": "comments", "id": "com-fresh",
		"fields": map[string]any{
			"trip_id": trip, "author_id": "user-x", "body": "Aus dem Nichts", "is_task": 0,
		},
		"hlc": "0000000001000-0000-bbbbbbbb",
	})
	if outcome != "rejected" {
		t.Errorf("outcome = %q, want rejected", outcome)
	}
}

func TestStampActor_ClaimHolderCannotBeForgedWithoutAState(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "cl-1", "op": "insert", "table": "trip_items", "id": "item-claim",
		"fields": map[string]any{"trip_id": trip, "name": "Zelt", "quantity": 1, "state": "open"},
		"hlc":    "0000000001000-0000-aaaaaaaa",
	})

	// A mutation carrying no state slips past the state switch entirely.
	pushOne(t, srv.URL, userB, map[string]any{
		"mutation_id": "cl-2", "op": "upsert", "table": "trip_items", "id": "item-claim",
		"fields": map[string]any{
			"name": "Zelt (gross)", "packing_now_by": userA,
			"packing_now_at": "2026-08-01T10:00:00Z",
		},
		"hlc": "0000000002000-0000-bbbbbbbb",
	})

	row := pullRow(t, srv.URL, userA, "trip_items", "item-claim")
	if row["name"] != "Zelt (gross)" {
		t.Fatalf("name = %v, want the rename to have applied", row["name"])
	}
	if row["packing_now_by"] != nil {
		t.Errorf("packing_now_by = %v, want nil — only a state change may name the holder (FR-5.7)", row["packing_now_by"])
	}
	if row["packing_now_at"] != nil {
		t.Errorf("packing_now_at = %v, want nil — a claim's clock without a claim is a claim", row["packing_now_at"])
	}
}

func TestStampActor_ClaimHolderCannotBeReassignedToTheForger(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "cl-3", "op": "insert", "table": "trip_items", "id": "item-held",
		"fields": map[string]any{
			"trip_id": trip, "name": "Schlafsack", "quantity": 1, "state": "packing_now",
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	// user-b takes the row without the FR-5.7 takeover endpoint.
	pushOne(t, srv.URL, userB, map[string]any{
		"mutation_id": "cl-4", "op": "upsert", "table": "trip_items", "id": "item-held",
		"fields": map[string]any{"name": "Schlafsack XL", "packing_now_by": userB},
		"hlc":    "0000000002000-0000-bbbbbbbb",
	})

	row := pullRow(t, srv.URL, userA, "trip_items", "item-held")
	if row["name"] != "Schlafsack XL" {
		t.Fatalf("name = %v, want the rename to have applied", row["name"])
	}
	if row["packing_now_by"] != userA {
		t.Errorf("packing_now_by = %v, want %s — a claim changes hands only through takeover (FR-5.7)",
			row["packing_now_by"], userA)
	}
}

func TestStampActor_PackingReleasesTheClaimWithoutTheClientSayingSo(t *testing.T) {
	srv := newTestServer(t)

	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "rel-1", "op": "insert", "table": "trip_items", "id": "item-rel",
		"fields": map[string]any{
			"trip_id": trip, "name": "Karte", "quantity": 1, "state": "packing_now",
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	// The claim is the state (FR-5.3), so leaving packing_now ends it —
	// the server may not depend on the client nulling the column.
	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "rel-2", "op": "upsert", "table": "trip_items", "id": "item-rel",
		"fields": map[string]any{"state": "packed", "packed_count": 1},
		"hlc":    "0000000002000-0000-aaaaaaaa",
	})

	row := pullRow(t, srv.URL, userA, "trip_items", "item-rel")
	if row["state"] != "packed" {
		t.Fatalf("state = %v, want packed", row["state"])
	}
	if row["packing_now_by"] != nil || row["packing_now_at"] != nil {
		t.Errorf("claim = (%v, %v), want cleared with the state it described",
			row["packing_now_by"], row["packing_now_at"])
	}
}

func TestStampActor_ClaimKeepsTheClientsTapTime(t *testing.T) {
	srv := newTestServer(t)

	const tapped = "2026-08-01T10:00:00Z"
	pushOne(t, srv.URL, userA, map[string]any{
		"mutation_id": "tap-1", "op": "insert", "table": "trip_items", "id": "item-tap",
		"fields": map[string]any{
			"trip_id": trip, "name": "Stirnlampe", "quantity": 1,
			"state": "packing_now", "packing_now_at": tapped,
		},
		"hlc": "0000000001000-0000-aaaaaaaa",
	})

	row := pullRow(t, srv.URL, userA, "trip_items", "item-tap")
	if row["packing_now_at"] != tapped {
		t.Errorf("packing_now_at = %v, want %q — a clock is not an identity claim", row["packing_now_at"], tapped)
	}
	if row["packing_now_by"] != userA {
		t.Errorf("packing_now_by = %v, want %s", row["packing_now_by"], userA)
	}
}
