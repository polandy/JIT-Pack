package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// FR-25.11j: buying a BUY_BEFORE row changes its mode (FR-3.3), so the row
// leaves the shopping side entirely. Without a record of the list it left,
// "show done" cannot find it again and the purchase is irreversible.
func TestSchema_BoughtFromRecordsWhichListARowLeft_FR25_11j(t *testing.T) {
	s := openTestStore(t)

	if !columns(t, s.db, "trip_items")["bought_from"] {
		t.Fatal("trip_items.bought_from missing — FR-25.11j needs the list the row was bought from")
	}

	// Nullable: nothing has been bought on a fresh row, and — the offline
	// lens — a NOT NULL would refuse an ordinary single-field mutation.
	if _, err := s.db.Exec(
		`INSERT INTO trip_items (id, trip_id, name) VALUES ('ti-nothing-bought', ?, 'Zelt')`,
		testTrip); err != nil {
		t.Fatalf("bought_from is not nullable: %v", err)
	}

	for _, mode := range []string{"buy_before", "buy_local"} {
		if _, err := s.db.Exec(
			`INSERT INTO trip_items (id, trip_id, name, bought_from) VALUES (?, ?, 'Sonnencreme', ?)`,
			"ti-"+mode, testTrip, mode); err != nil {
			t.Errorf("bought_from rejected %q, which is a list a row can be bought from: %v", mode, err)
		}
	}

	// The vocabulary is `mode`'s, and nothing else gets in.
	if _, err := s.db.Exec(
		`INSERT INTO trip_items (id, trip_id, name, bought_from) VALUES ('ti-bogus', ?, 'Ballast', 'sold')`,
		testTrip); err == nil {
		t.Error("bought_from accepted a value outside mode's vocabulary")
	}
}

// FR-25.11j with NFR-4.2a: `bought_from` and `mode` merge independently, so
// the column has to be writable on its own. A constraint coupling the two
// would refuse a legitimate single-field mutation, and a rejected mutation
// is dropped from the outbox — the user's change lost with it.
func TestApplyMutation_BoughtFromIsWritableOnItsOwn_FR25_11j(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seed := upsert("item-1", "mut-1", map[string]any{
		"trip_id": testTrip, "name": "Sonnencreme", "mode": "buy_before",
	}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	only := upsert("item-1", "mut-2", map[string]any{"bought_from": "buy_before"}, "0000000002000-0000-aaaaaaaa")
	res, err := s.ApplyMutation(ctx, testTrip, testUser, only)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("outcome = %q (reason %q), want applied — bought_from must not need mode beside it",
			res.Outcome, res.Reason)
	}

	var got, mode string
	if err := s.db.QueryRow(
		`SELECT bought_from, mode FROM trip_items WHERE id = 'item-1'`).Scan(&got, &mode); err != nil {
		t.Fatalf("read row: %v", err)
	}
	if got != "buy_before" {
		t.Errorf("bought_from = %q, want buy_before", got)
	}
	if mode != "buy_before" {
		t.Errorf("mode = %q — the single-field write must not have touched it", mode)
	}
}

// The whitelist is the contract: a column no client may send is a column the
// feature does not have (Sync-API §5).
func TestPush_BoughtFromIsSyncable_FR25_11j(t *testing.T) {
	if !syncableColumns[TableTripItems]["bought_from"] {
		t.Fatal("trip_items.bought_from is not on the sync whitelist — FR-25.11j is shared trip data")
	}
}

// Failure path: a value outside the vocabulary is refused with the reason
// that says so, not with a 500 that wedges the pushing device's outbox.
func TestApplyMutation_BoughtFromOutsideTheVocabulary_IsRejectedWithItsReason_FR25_11j(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seed := upsert("item-1", "mut-1", map[string]any{"trip_id": testTrip, "name": "Sonnencreme"},
		"0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	bogus := upsert("item-1", "mut-2", map[string]any{"bought_from": "sold"}, "0000000002000-0000-aaaaaaaa")
	res, err := s.ApplyMutation(ctx, testTrip, testUser, bogus)
	if err != nil {
		t.Fatalf("ApplyMutation returned an error instead of a refusal: %v", err)
	}
	if res.Outcome != sync.OutcomeRejected {
		t.Errorf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonConstraintViolated {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonConstraintViolated)
	}
}
