package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// A refusal that says nothing is a refusal nobody can act on.
//
// `rejected` is the store's answer to five different situations — an
// authorization denial, a mutation aimed outside its partition, the FR-27.1
// two-level rule, an ordinary constraint failure, and a delete the rest of
// the database still depends on. Until this file they were one indivisible
// word on the wire, so the client parked the mutation with nothing to say
// and the user's screen kept a row the server had refused to drop.
//
// Each case below asserts the reason *and* a positive signal that the
// refusal actually happened: the row the mutation wanted to change is
// still, or not yet, what it was.

// The refusal's remaining ground, now that FR-24.3 has taken master items
// and Vorlagen onto the retire branch: a series a trip names. `trips.series_id`
// carries no ON DELETE clause, the refusal is correct, and being unable to
// name it was the defect this test was written for.
func TestApplyMasterMutation_DeletingASeriesATripStillNames_IsRefusedAsStillReferenced(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripSeries, "ser-sommer", "sr-1",
		map[string]any{"name": "Sommerferien"}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, "trip-sommer", "sr-2",
		map[string]any{"name": "Engadin", "year": 2026, "series_id": "ser-sommer"},
		"0000000001001-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTripSeries, "ser-sommer", "sr-3",
		nil, "0000000002000-0000-aaaaaaaa"))

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonStillReferenced {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonStillReferenced)
	}
	// The positive signal: the row is still there, which is the whole point
	// of the refusal and what the client's optimistic delete disagrees with.
	var name string
	if err := s.db.QueryRowContext(ctx, `SELECT name FROM trip_series WHERE id = 'ser-sommer'`).Scan(&name); err != nil {
		t.Fatalf("the series was deleted after a rejected delete: %v", err)
	}
}

// A delete nothing depends on is not a refusal at all — without this the
// reason above could be produced by refusing every delete.
func TestApplyMasterMutation_DeletingAnUnusedTemplate_Applies(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "tpl-loose", "un-1",
		map[string]any{"name": "Lose", "kind": KindTemplate}, "0000000001000-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTemplates, "tpl-loose", "un-2",
		nil, "0000000002000-0000-aaaaaaaa"))

	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%q), want the delete to apply", res.Reason)
	}
	if res.Reason != "" {
		t.Errorf("reason = %q, want none on a non-refusal", res.Reason)
	}
	var rows int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM templates WHERE id = 'tpl-loose'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Errorf("template rows = %d, want 0", rows)
	}
}

// FR-4.5: a non-member may not delete a trip. The reason separates "you may
// not" from "the data will not let you" — different sentences on screen.
func TestApplyMasterMutation_ANonMemberDeletingATrip_IsRefusedAsNotAuthorized(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seedUserB(t, s)

	res := applyMaster(t, s, testUserB, masterMut(sync.OpDelete, TableTrips, testTrip, "na-1",
		nil, "0000000002000-0000-bbbbbbbb"))

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonNotAuthorized {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonNotAuthorized)
	}
	var rows int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM trips WHERE id = ?`, testTrip).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Errorf("trip rows = %d, want the trip untouched", rows)
	}
}

// FR-27.6 (the scope switch PR #197 added): a Gruppe something includes may
// not be promoted. It is neither an authorization denial nor a constraint —
// it is a structural rule, and it gets its own sentence.
func TestApplyMasterMutation_PromotingAnIncludedGroup_IsRefusedAsTemplateScope(t *testing.T) {
	s := openTestStore(t)

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "tpl-parent", "ts-1",
		map[string]any{"name": "Ferien", "kind": KindTemplate}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "grp-child", "ts-2",
		map[string]any{"name": "Kulturbeutel", "kind": KindGroup}, "0000000001001-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplateIncludes, "inc-1", "ts-3",
		map[string]any{"template_id": "tpl-parent", "included_template_id": "grp-child"},
		"0000000001002-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTemplates, "grp-child", "ts-4",
		map[string]any{"kind": KindTemplate}, "0000000002000-0000-aaaaaaaa"))

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonTemplateScope {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonTemplateScope)
	}
	var kind string
	if err := s.db.QueryRowContext(context.Background(),
		`SELECT kind FROM templates WHERE id = 'grp-child'`).Scan(&kind); err != nil {
		t.Fatal(err)
	}
	if kind != KindGroup {
		t.Errorf("kind = %q, want it unchanged at %q", kind, KindGroup)
	}
}

// An ordinary constraint failure on the write itself — a foreign key whose
// parent is gone. Not a delete, so it must *not* read as still-referenced.
func TestApplyMutation_AnUpsertNamingAMissingParent_IsRefusedAsConstraintViolated(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seed := upsert("item-1", "cv-1", map[string]any{"trip_id": testTrip, "name": "Socken"},
		"0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := s.ApplyMutation(ctx, testTrip, testUser,
		upsert("item-1", "cv-2", map[string]any{"container_id": "gone-container"},
			"0000000002000-0000-bbbbbbbb"))
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonConstraintViolated {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonConstraintViolated)
	}
	var container any
	if err := s.db.QueryRowContext(ctx,
		`SELECT container_id FROM trip_items WHERE id = 'item-1'`).Scan(&container); err != nil {
		t.Fatal(err)
	}
	if container != nil {
		t.Errorf("container_id = %v, want it never written", container)
	}
}

// Sync-API P-3: a mutation naming another trip is refused by the endpoint
// it was pushed to, and that is a third kind of "no".
func TestApplyMutation_AMutationNamingAnotherTrip_IsRefusedAsOutOfScope(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Andere', 2027)`)

	res, err := s.ApplyMutation(ctx, testTrip, testUser,
		upsert("item-foreign", "os-1", map[string]any{"trip_id": "trip-other", "name": "Fremd"},
			"0000000002000-0000-bbbbbbbb"))
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonOutOfScope {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonOutOfScope)
	}
	var rows int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM trip_items WHERE id = 'item-foreign'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Errorf("trip_items rows = %d, want the foreign row never written", rows)
	}
}

// The trip partition has blocking references of its own, and the same
// pre-check answers for them: a traveler a row is assigned to, a container a
// row is packed into. Without a case here the trip-partition branch of the
// check was reached by nothing.
func TestApplyMutation_DeletingATravelerARowIsAssignedTo_IsRefusedAsStillReferenced(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name) VALUES ('trv-1', ?, 'Mia')`, testTrip)
	assigned := upsert("ti-1", "tr-1", map[string]any{
		"trip_id": testTrip, "name": "Schlafsack", "assigned_traveler_id": "trv-1",
	}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, assigned); err != nil {
		t.Fatalf("seed: %v", err)
	}

	res, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
		MutationID: "tr-2", Op: sync.OpDelete, Table: TableTravelers, ID: "trv-1",
		HLC: "0000000002000-0000-bbbbbbbb",
	})
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonStillReferenced {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonStillReferenced)
	}
	var rows int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM travelers WHERE id = 'trv-1'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Errorf("traveler rows = %d, want the delete refused", rows)
	}
}

// FR-10.3 pairs a container with another one, and a row may point at itself.
// Counting that pointer would refuse the delete SQLite is perfectly happy to
// make — the row and its own reference go together.
func TestApplyMutation_DeletingASelfPairedContainer_Applies(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO containers (id, trip_id, name) VALUES ('c-1', ?, 'Rucksack')`, testTrip)
	mustExec(t, s, `UPDATE containers SET paired_container_id = 'c-1' WHERE id = 'c-1'`)

	res, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
		MutationID: "sp-1", Op: sync.OpDelete, Table: TableContainers, ID: "c-1",
		HLC: "0000000002000-0000-bbbbbbbb",
	})
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%q), want the delete to apply", res.Reason)
	}
	var rows int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM containers WHERE id = 'c-1'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Errorf("container rows = %d, want 0", rows)
	}
}
