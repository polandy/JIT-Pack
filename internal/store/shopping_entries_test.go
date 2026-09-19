package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// FR-30.1: a shopping entry is its own row, not a trip item in a buy mode —
// "Milch" is on the shopping list without being on the packing list, and so
// counts towards no packing figure.
func TestSchema_ShoppingEntriesAreTheirOwnTable_FR30_1(t *testing.T) {
	s := openTestStore(t)

	for _, list := range []string{"buy_before", "buy_local"} {
		if _, err := s.db.Exec(
			`INSERT INTO shopping_entries (id, trip_id, name, list) VALUES (?, ?, 'Milch', ?)`,
			"se-"+list, testTrip, list); err != nil {
			t.Errorf("shopping_entries rejected list %q, which is one of the two shopping lists: %v", list, err)
		}
	}

	// `pack` is a packing mode, not a shopping list: an entry is on one of
	// the two lists or it is not an entry.
	if _, err := s.db.Exec(
		`INSERT INTO shopping_entries (id, trip_id, name, list) VALUES ('se-pack', ?, 'Zelt', 'pack')`,
		testTrip); err == nil {
		t.Error("shopping_entries accepted list 'pack' — a packing mode is not a shopping list")
	}

	var bought int
	if err := s.db.QueryRow(
		`SELECT bought FROM shopping_entries WHERE id = 'se-buy_local'`).Scan(&bought); err != nil {
		t.Fatalf("read entry: %v", err)
	}
	if bought != 0 {
		t.Errorf("a new entry has bought = %d, want 0", bought)
	}
	if _, err := s.db.Exec(
		`UPDATE shopping_entries SET bought = 2 WHERE id = 'se-buy_local'`); err == nil {
		t.Error("bought accepted 2 — it is a flag")
	}

	var items int
	if err := s.db.QueryRow(`SELECT count(*) FROM trip_items`).Scan(&items); err != nil {
		t.Fatalf("count trip items: %v", err)
	}
	if items != 0 {
		t.Errorf("writing shopping entries produced %d trip items, want 0", items)
	}
}

// FR-30.1 through the push path: the table travels the trip partition, and
// the entry's own fields merge like any other trip row's (NFR-4.2a).
func TestApplyMutation_ShoppingEntry_InsertThenBuy_FR30_1(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	add := sync.Mutation{
		MutationID: "m1", Op: sync.OpInsert, Table: TableShoppingEntries, ID: "se-1",
		Fields: map[string]any{"trip_id": testTrip, "name": "Milch", "list": "buy_local", "bought": 0},
		HLC:    sync.HLC("0000000001000-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, add); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("insert: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	buy := upsert("se-1", "m2", map[string]any{"bought": 1}, "0000000002000-0000-aaaaaaaa")
	buy.Table = TableShoppingEntries
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, buy); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("buy: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}

	var bought int
	var list string
	if err := s.db.QueryRow(
		`SELECT bought, list FROM shopping_entries WHERE id = 'se-1'`).Scan(&bought, &list); err != nil {
		t.Fatalf("read entry: %v", err)
	}
	if bought != 1 || list != "buy_local" {
		t.Errorf("entry = (bought %d, list %q), want (1, buy_local)", bought, list)
	}
}

// FR-30.1: the entries go with their trip. The trip partition's feed dies
// with the trip (change_log.trip_id cascades), so the schema's cascade is
// the whole server-side answer — the client mirrors it itself.
func TestSchema_DeletingATripTakesItsShoppingEntries_FR30_1(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO shopping_entries (id, trip_id, name) VALUES ('se-1', ?, 'Milch')`, testTrip)
	mustExec(t, s, `DELETE FROM trips WHERE id = ?`, testTrip)

	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM shopping_entries`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Errorf("%d shopping entries survived their trip, want 0", n)
	}
}
