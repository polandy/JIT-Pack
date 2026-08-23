package store

import (
	"context"
	"encoding/json"
	"testing"

	"jitpack/internal/sync"
)

// NFR-4.2a: the losing side of every LWW merge must be auditable per
// trip until the trip is archived (G-2 conflict log view).
func TestListConflicts_ReturnsLoggedConflicts(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seed := upsert("item-1", "lc-1", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5}, "0000000002000-0000-bbbbbbbb")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatal(err)
	}
	stale := upsert("item-1", "lc-2", map[string]any{"quantity": 9}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, stale); err != nil {
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
	mustExec(t, s, `INSERT INTO trips (id, name, year, start_date, end_date) VALUES ('trip-other', 'Other', 2026, '2026-07-01', '2026-07-05')`)

	seed := upsert("item-1", "sc-1", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5}, "0000000002000-0000-bbbbbbbb")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatal(err)
	}
	stale := upsert("item-1", "sc-2", map[string]any{"quantity": 9}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, stale); err != nil {
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

// NFR-4.2a covers the master partition too: a template renamed on two
// devices loses a field like any trip row, and the loser has to be
// auditable. Before ListMasterConflicts these rows were written with
// trip_id NULL and read by nothing.
func TestListMasterConflicts_ReturnsMasterPartitionLosers(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seed := masterMut(sync.OpUpsert, TableTemplates, "tpl-1", "mc-1",
		map[string]any{"owner_id": testUser, "name": "Ferien"}, "0000000002000-0000-bbbbbbbb")
	applyMaster(t, s, testUser, seed)
	stale := masterMut(sync.OpUpsert, TableTemplates, "tpl-1", "mc-2",
		map[string]any{"name": "Sommerferien"}, "0000000001000-0000-aaaaaaaa")
	applyMaster(t, s, testUser, stale)

	conflicts, err := s.ListMasterConflicts(ctx, testUser)
	if err != nil {
		t.Fatalf("ListMasterConflicts: %v", err)
	}

	if len(conflicts) != 1 {
		t.Fatalf("conflicts = %d, want 1", len(conflicts))
	}
	c := conflicts[0]
	if c.EntityTable != TableTemplates || c.EntityID != "tpl-1" || c.Field != "name" {
		t.Errorf("unexpected conflict %+v", c)
	}
	if c.LosingValue != `"Sommerferien"` || c.WinningValue != `"Ferien"` {
		t.Errorf("losing/winning = %q/%q", c.LosingValue, c.WinningValue)
	}
}

// The two partitions have two logs, and neither may show the other's
// rows: a master conflict is not a fact about any one trip, and a trip's
// log is what the G-2 sheet opens from inside that trip.
func TestListMasterConflicts_DoesNotMixThePartitions(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTemplates, "tpl-1", "mx-1",
		map[string]any{"owner_id": testUser, "name": "Ferien"}, "0000000002000-0000-bbbbbbbb"))
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTemplates, "tpl-1", "mx-2",
		map[string]any{"name": "Sommerferien"}, "0000000001000-0000-aaaaaaaa"))

	if _, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("item-1", "mx-3",
		map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5},
		"0000000002000-0000-bbbbbbbb")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("item-1", "mx-4",
		map[string]any{"quantity": 9}, "0000000001000-0000-aaaaaaaa")); err != nil {
		t.Fatal(err)
	}

	master, err := s.ListMasterConflicts(ctx, testUser)
	if err != nil {
		t.Fatal(err)
	}
	trip, err := s.ListConflicts(ctx, testTrip)
	if err != nil {
		t.Fatal(err)
	}

	// Both sides asserted: a master log that simply returned everything
	// would satisfy "the master conflict is reachable" on its own.
	if len(master) != 1 || master[0].EntityTable != TableTemplates {
		t.Errorf("master log = %+v, want the template conflict alone", master)
	}
	if len(trip) != 1 || trip[0].EntityTable != TableTripItems {
		t.Errorf("trip log = %+v, want the trip_items conflict alone", trip)
	}
}

// A conflict names an entity, and an entity the user may not see must not
// be named to them — the master log is per user for the same reason the
// master pull is (masterVisible).
func TestListMasterConflicts_HidesEntitiesTheUserCannotSee(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seedUserB(t, s)
	mustExec(t, s, `INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`, testTrip, testUser)

	// A conflict on the trip row itself: `trips` lives in the master
	// partition, so this is the case the gap was found on.
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTrips, testTrip, "mv-1",
		map[string]any{"name": "Samedan 2026"}, "0000000002000-0000-bbbbbbbb"))
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTrips, testTrip, "mv-2",
		map[string]any{"name": "Samedan Sommer"}, "0000000001000-0000-aaaaaaaa"))

	mine, err := s.ListMasterConflicts(ctx, testUser)
	if err != nil {
		t.Fatal(err)
	}
	theirs, err := s.ListMasterConflicts(ctx, testUserB)
	if err != nil {
		t.Fatal(err)
	}

	if len(mine) != 1 {
		t.Fatalf("the trip's member sees %d conflicts, want 1", len(mine))
	}
	if len(theirs) != 0 {
		t.Errorf("a non-member sees %+v, want nothing", theirs)
	}
}

// The types the two sides arrive in only meet here: a mutation's fields are
// decoded from the push envelope's JSON, the row's are read back from
// SQLite. A quantity of 5 is a float64 on one side and an int64 on the
// other, and comparing them as they come would call every carried-along
// field a conflict (NFR-4.2a).
func TestApplyMutation_UnchangedFieldsFromJSON_LogNoConflict(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	fieldsFromWire := func(t *testing.T, raw string) map[string]any {
		t.Helper()
		var fields map[string]any
		if err := json.Unmarshal([]byte(raw), &fields); err != nil {
			t.Fatalf("decode wire fields: %v", err)
		}
		return fields
	}

	seed := upsert("item-1", "nc-1",
		fieldsFromWire(t, `{"trip_id":"`+testTrip+`","name":"Socken","quantity":5}`),
		"0000000002000-0000-bbbbbbbb")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatal(err)
	}

	// An older push that really changes the quantity and carries the
	// unchanged name along: one conflict, not two.
	stale := upsert("item-1", "nc-2",
		fieldsFromWire(t, `{"name":"Socken","quantity":9}`),
		"0000000001000-0000-aaaaaaaa")
	res, err := s.ApplyMutation(ctx, testTrip, testUser, stale)
	if err != nil {
		t.Fatal(err)
	}
	if res.Outcome != sync.OutcomeMerged {
		t.Errorf("outcome = %q, want %q", res.Outcome, sync.OutcomeMerged)
	}

	conflicts, err := s.ListConflicts(ctx, testTrip)
	if err != nil {
		t.Fatalf("ListConflicts: %v", err)
	}
	if len(conflicts) != 1 {
		t.Fatalf("conflicts = %+v, want only the quantity", conflicts)
	}
	if conflicts[0].Field != "quantity" {
		t.Errorf("conflict field = %q, want quantity", conflicts[0].Field)
	}

	// An older push that changes nothing at all is applied, and the log
	// stays as it was.
	noop := upsert("item-1", "nc-3",
		fieldsFromWire(t, `{"name":"Socken","quantity":5}`),
		"0000000000500-0000-aaaaaaaa")
	res, err = s.ApplyMutation(ctx, testTrip, testUser, noop)
	if err != nil {
		t.Fatal(err)
	}
	if res.Outcome != sync.OutcomeApplied {
		t.Errorf("outcome = %q, want %q: nothing of it was overwritten", res.Outcome, sync.OutcomeApplied)
	}
	after, err := s.ListConflicts(ctx, testTrip)
	if err != nil {
		t.Fatalf("ListConflicts: %v", err)
	}
	if len(after) != 1 {
		t.Errorf("conflicts = %+v, want the one from before", after)
	}
}
