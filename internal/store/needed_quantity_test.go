package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// FR-9.6: *zu viel* stores the number used, at least one; no verdict is NULL
// rather than a zero that would read as *unnötig* (ADR-103).
func TestSchema_NeededQuantityIsAtLeastOne_FR9_6(t *testing.T) {
	s := openTestStore(t)
	insert := func(id string, needed any) error {
		_, err := s.db.Exec(
			`INSERT INTO trip_items (id, trip_id, name, quantity, packed_count, needed_quantity) VALUES (?, ?, 'Socken', 4, 4, ?)`,
			id, testTrip, needed)
		return err
	}
	if err := insert("ok-one", 1); err != nil {
		t.Errorf("a needed quantity of 1 was refused: %v", err)
	}
	if err := insert("ok-none", nil); err != nil {
		t.Errorf("a row without a verdict was refused: %v", err)
	}
	if err := insert("bad-zero", 0); err == nil {
		t.Error("a needed quantity of 0 was accepted — none used is *unnötig*, not *zu viel*")
	}
}

// FR-9.6: the number is the client's to write and to clear — setting another
// verdict clears it, so a NULL must land like any other field.
func TestApplyMutation_NeededQuantity_SetAndCleared_FR9_6(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, quantity, packed_count) VALUES ('ti-1', ?, 'Socken', 4, 4)`, testTrip)

	read := func() *int64 {
		t.Helper()
		var needed *int64
		if err := s.db.QueryRow(`SELECT needed_quantity FROM trip_items WHERE id = 'ti-1'`).Scan(&needed); err != nil {
			t.Fatalf("read row: %v", err)
		}
		return needed
	}
	apply := func(name string, fields map[string]any, hlc sync.HLC) {
		t.Helper()
		if res, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("ti-1", name, fields, hlc)); err != nil ||
			res.Outcome != sync.OutcomeApplied {
			t.Fatalf("%s: outcome %q reason %q err %v, want applied", name, res.Outcome, res.Reason, err)
		}
	}

	apply("fewer", map[string]any{"needed_quantity": 2}, "0000000002000-0000-aaaaaaaa")
	if got := read(); got == nil || *got != 2 {
		t.Fatalf("needed_quantity after the verdict = %v, want 2", got)
	}
	apply("unused", map[string]any{"needed_quantity": nil, "flag_unused": 1}, "0000000003000-0000-aaaaaaaa")
	if got := read(); got != nil {
		t.Errorf("needed_quantity after *unnötig* = %d, want NULL — a row carries one verdict", *got)
	}
}
