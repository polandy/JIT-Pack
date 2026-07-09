package store

import (
	"context"
	"testing"
)

// NFR-4.2a: the losing side of every LWW merge must be auditable per
// trip until the trip is archived (G-2 conflict log view).
func TestListConflicts_ReturnsLoggedConflicts(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seed := upsert("item-1", "lc-1", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5}, "0000000002000-0000-bbbbbbbb")
	if _, err := s.ApplyMutation(ctx, testTrip, seed); err != nil {
		t.Fatal(err)
	}
	stale := upsert("item-1", "lc-2", map[string]any{"quantity": 9}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, stale); err != nil {
		t.Fatal(err)
	}

	conflicts, err := s.ListConflicts(ctx, testTrip)
	if err != nil {
		t.Fatalf("ListConflicts: %v", err)
	}

	if len(conflicts) != 1 {
		t.Fatalf("conflicts = %d, want 1", len(conflicts))
	}
	c := conflicts[0]
	if c.EntityTable != "trip_items" || c.EntityID != "item-1" || c.Field != "quantity" {
		t.Errorf("unexpected conflict %+v", c)
	}
	if c.LosingValue != "9" || c.WinningValue != "5" {
		t.Errorf("losing/winning = %q/%q, want 9/5", c.LosingValue, c.WinningValue)
	}
	if c.ResolvedAt == "" {
		t.Error("resolved_at must be set")
	}
}

func TestListConflicts_EmptyTrip(t *testing.T) {
	s := openTestStore(t)

	conflicts, err := s.ListConflicts(context.Background(), testTrip)
	if err != nil {
		t.Fatalf("ListConflicts: %v", err)
	}
	if len(conflicts) != 0 {
		t.Errorf("conflicts = %d, want 0", len(conflicts))
	}
}

func TestListConflicts_ScopedToTrip(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, start_date, end_date) VALUES ('trip-other', 'Other', '2026-07-01', '2026-07-05')`)

	seed := upsert("item-1", "sc-1", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5}, "0000000002000-0000-bbbbbbbb")
	if _, err := s.ApplyMutation(ctx, testTrip, seed); err != nil {
		t.Fatal(err)
	}
	stale := upsert("item-1", "sc-2", map[string]any{"quantity": 9}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, stale); err != nil {
		t.Fatal(err)
	}

	conflicts, err := s.ListConflicts(ctx, "trip-other")
	if err != nil {
		t.Fatal(err)
	}
	if len(conflicts) != 0 {
		t.Errorf("other trip sees %d conflicts, want 0", len(conflicts))
	}
}
