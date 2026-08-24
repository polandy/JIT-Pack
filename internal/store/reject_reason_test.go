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

// The motivating case (FR-9.2): `trip_items.source_template_id` deliberately
// carries no ON DELETE clause, so a Vorlage that ever generated a trip item
// cannot be deleted — an archived trip must keep knowing where its rows came
// from. The refusal is correct; being unable to name it was the defect.
func TestApplyMasterMutation_DeletingATemplateATripItemStillNames_IsRefusedAsStillReferenced(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "tpl-ferien", "sr-1",
		map[string]any{"name": "Ferien", "kind": KindTemplate}, "0000000001000-0000-aaaaaaaa"))
	generated := upsert("ti-1", "sr-2", map[string]any{
		"trip_id": testTrip, "name": "Zahnbürste", "source_template_id": "tpl-ferien",
	}, "0000000001001-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, generated); err != nil {
		t.Fatalf("seed trip item: %v", err)
	}

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTemplates, "tpl-ferien", "sr-3",
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
	if err := s.db.QueryRowContext(ctx, `SELECT name FROM templates WHERE id = 'tpl-ferien'`).Scan(&name); err != nil {
		t.Fatalf("the template was deleted after a rejected delete: %v", err)
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
