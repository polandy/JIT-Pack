package store

import (
	"context"
	"strings"
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

// FR-30.4: a purchase carries who made it and when — on an entry, and on a
// packing row bought from a list, whose mode flip (FR-3.3) otherwise leaves
// no trace of the purchase at all. Nullable, because nothing is bought on a
// fresh row, and pushable, because the stamp travels the push path.
func TestSchema_APurchaseRecordsWhoAndWhen_FR30_4(t *testing.T) {
	s := openTestStore(t)
	for _, table := range []string{TableShoppingEntries, TableTripItems} {
		cols := columns(t, s.db, table)
		for _, col := range []string{"bought_at", "bought_by_user_id"} {
			if !cols[col] {
				t.Errorf("%s.%s missing", table, col)
			}
			if !syncableColumns[table][col] {
				t.Errorf("%s.%s is not pushable — the server's stamp could not be persisted", table, col)
			}
		}
	}
}

// FR-30.9: an entry's tag travels the push path like any field, is cleared by
// a null, and merges per field — tagging never touches the purchase.
func TestApplyMutation_ShoppingEntryTag_SetThenClear_FR30_9(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	add := sync.Mutation{
		MutationID: "m1", Op: sync.OpInsert, Table: TableShoppingEntries, ID: "se-1",
		Fields: map[string]any{
			"trip_id": testTrip, "name": "Milch", "list": "buy_local", "bought": 0, "tag": "Supermarkt",
		},
		HLC: sync.HLC("0000000001000-0000-aaaaaaaa"),
	}
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, add); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("insert: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	tagOf := func() (tag *string, bought int) {
		t.Helper()
		if err := s.db.QueryRow(
			`SELECT tag, bought FROM shopping_entries WHERE id = 'se-1'`).Scan(&tag, &bought); err != nil {
			t.Fatalf("read entry: %v", err)
		}
		return tag, bought
	}
	if tag, _ := tagOf(); tag == nil || *tag != "Supermarkt" {
		t.Fatalf("tag after insert = %v, want Supermarkt", tag)
	}

	buy := upsert("se-1", "m2", map[string]any{"bought": 1}, "0000000002000-0000-aaaaaaaa")
	buy.Table = TableShoppingEntries
	retag := upsert("se-1", "m3", map[string]any{"tag": "Bäcker"}, "0000000003000-0000-bbbbbbbb")
	retag.Table = TableShoppingEntries
	for _, m := range []sync.Mutation{buy, retag} {
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, m); err != nil || res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", m.MutationID, res.Outcome, res.Reason, err)
		}
	}
	if tag, bought := tagOf(); tag == nil || *tag != "Bäcker" || bought != 1 {
		t.Errorf("after a purchase and a retag = (%v, bought %d), want (Bäcker, 1): the fields merge apart", tag, bought)
	}

	clear := upsert("se-1", "m4", map[string]any{"tag": nil}, "0000000004000-0000-aaaaaaaa")
	clear.Table = TableShoppingEntries
	if res, err := s.ApplyMutation(ctx, testTrip, testUser, clear); err != nil || res.Outcome != sync.OutcomeApplied {
		t.Fatalf("clear: outcome %q reason %q err %v, want applied", res.Outcome, res.Reason, err)
	}
	if tag, _ := tagOf(); tag != nil {
		t.Errorf("tag after a null = %q, want NULL", *tag)
	}
}

// FR-30.9: the bound is enforced where the row lives, not only in the field —
// a blank or over-long tag is refused by the schema, which is what keeps a
// hand-made client from writing a heading nobody can read.
func TestSchema_ShoppingEntryTagIsOneToFortyCharacters_FR30_9(t *testing.T) {
	s := openTestStore(t)
	insert := func(id, tag string) error {
		_, err := s.db.Exec(
			`INSERT INTO shopping_entries (id, trip_id, name, tag) VALUES (?, ?, 'x', ?)`, id, testTrip, tag)
		return err
	}
	if err := insert("ok-40", strings.Repeat("a", 40)); err != nil {
		t.Errorf("a 40-character tag was refused: %v", err)
	}
	if err := insert("bad-41", strings.Repeat("a", 41)); err == nil {
		t.Error("a 41-character tag was accepted")
	}
	if err := insert("bad-blank", ""); err == nil {
		t.Error("an empty tag was accepted — none is NULL, not a tag named nothing")
	}
}
