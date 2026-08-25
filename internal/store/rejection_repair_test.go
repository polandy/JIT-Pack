package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// A refusal that is only announced leaves the device believing a lie.
//
// PR #198 gave every store-side refusal a reason and put it on screen. What
// it did not do is close the divergence underneath: the client renders the
// change optimistically, pushes it, the server refuses, and per P-5 the
// outbox drops the mutation — so the row on the device keeps saying what the
// server refused to say, and it keeps saying it forever. A plain pull cannot
// repair it, because the server row did not change: its `change_log` entry
// sits behind the client's cursor and is never offered again.
//
// The rule these tests state: **a refusal re-logs the row it refused**, with
// `deleted` read from the server's own row rather than from the mutation's
// op — so a refused delete re-delivers the snapshot and a refused insert
// delivers a tombstone for the phantom. The one refusal that re-logs nothing
// is `out_of_scope`, and the test below says why.

// pullAfter is the client's ordinary next pull of the trip partition.
func pullAfter(t *testing.T, s *Store, tripID string, cursor int64) PullPage {
	t.Helper()
	page, err := s.Pull(context.Background(), tripID, cursor, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	return page
}

// pullMasterAfter is the same for the master partition.
func pullMasterAfter(t *testing.T, s *Store, userID string, cursor int64) PullPage {
	t.Helper()
	page, err := s.PullMaster(context.Background(), userID, cursor, 100)
	if err != nil {
		t.Fatalf("PullMaster: %v", err)
	}
	return page
}

// The motivating case, end to end (Sync-API §5): a row the data still
// depends on cannot be deleted, the client has already removed it from the
// screen, and the next pull has to put it back. The example is a series a
// trip names — the Vorlage this test was written around moved onto FR-24.3's
// retire branch, where the repair below covers the same ground.
func TestPullMaster_AfterARefusedDelete_OffersTheRowAgain(t *testing.T) {
	s := openTestStore(t)

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripSeries, "ser-ferien", "rr-1",
		map[string]any{"name": "Ferien"}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, "trip-ferien", "rr-2",
		map[string]any{"name": "Engadin", "year": 2026, "series_id": "ser-ferien"},
		"0000000001001-0000-aaaaaaaa"))

	// The device is up to date: everything written so far is behind its
	// cursor, which is exactly the state that makes the divergence permanent.
	caughtUp := pullMasterAfter(t, s, testUser, 0).NextCursor

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTripSeries, "ser-ferien", "rr-3",
		nil, "0000000002000-0000-aaaaaaaa"))
	if res.Outcome != sync.OutcomeRejected || res.Reason != ReasonStillReferenced {
		t.Fatalf("outcome/reason = %q/%q, want rejected/%s", res.Outcome, res.Reason, ReasonStillReferenced)
	}

	page := pullMasterAfter(t, s, testUser, caughtUp)

	var repaired *Change
	for i, c := range page.Changes {
		if c.Table == TableTripSeries && c.ID == "ser-ferien" {
			repaired = &page.Changes[i]
		}
	}
	if repaired == nil {
		t.Fatalf("the refused delete was never re-logged: pull after the refusal offered %d changes, "+
			"so the device keeps a series the server still has", len(page.Changes))
	}
	if repaired.Deleted {
		t.Errorf("the repair is a tombstone, want the snapshot of a row that still exists")
	}
	if name, _ := repaired.Row["name"].(string); name != "Ferien" {
		t.Errorf("repaired row name = %q, want the server's own %q", name, "Ferien")
	}
}

// The asymmetry, stated: a refused *insert* has no server row to re-deliver,
// so the repair is a tombstone — and it is decided by what the server holds,
// never by the mutation's op.
func TestPullMaster_AfterARefusedInsert_OffersATombstoneForThePhantomRow(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)

	caughtUp := pullMasterAfter(t, s, testUserB, 0).NextCursor

	// FR-4.5: nobody grants themselves a role on a trip they are not in.
	res := applyMaster(t, s, testUserB, masterMut(sync.OpInsert, TableTripMembers, "mem-forged", "rr-4",
		map[string]any{"trip_id": testTrip, "user_id": testUserB, "role": RoleEditor},
		"0000000002000-0000-bbbbbbbb"))
	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}

	page := pullMasterAfter(t, s, testUserB, caughtUp)

	var repaired *Change
	for i, c := range page.Changes {
		if c.Table == TableTripMembers && c.ID == "mem-forged" {
			repaired = &page.Changes[i]
		}
	}
	if repaired == nil {
		t.Fatalf("the refused insert was never re-logged: the device keeps a row the server never had")
	}
	if !repaired.Deleted {
		t.Errorf("the repair carries a row, want a tombstone for a row the server does not have")
	}
}

// The trip partition's own refusals repair the same way. A quantity below
// what is already packed is a CHECK the schema refuses (§5), and the device
// that pushed it is the one showing the impossible number.
func TestPull_AfterARefusedTripMutation_OffersTheServersRowAgain(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seed := upsert("ti-check", "rr-5", map[string]any{
		"trip_id": testTrip, "name": "Socken", "quantity": 4, "packed_count": 4,
	}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatalf("seed trip item: %v", err)
	}
	caughtUp := pullAfter(t, s, testTrip, 0).NextCursor

	res, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("ti-check", "rr-6",
		map[string]any{"quantity": 1}, "0000000002000-0000-aaaaaaaa"))
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if res.Outcome != sync.OutcomeRejected || res.Reason != ReasonConstraintViolated {
		t.Fatalf("outcome/reason = %q/%q, want rejected/%s", res.Outcome, res.Reason, ReasonConstraintViolated)
	}

	page := pullAfter(t, s, testTrip, caughtUp)

	var repaired *Change
	for i, c := range page.Changes {
		if c.Table == TableTripItems && c.ID == "ti-check" {
			repaired = &page.Changes[i]
		}
	}
	if repaired == nil {
		t.Fatalf("the refused mutation was never re-logged: the device keeps a quantity the server refused")
	}
	if q, _ := repaired.Row["quantity"].(int64); q != 4 {
		t.Errorf("repaired quantity = %v, want the server's own 4", repaired.Row["quantity"])
	}
}

// The one refusal that must re-log nothing. `out_of_scope` means the row is
// not this partition's, so writing a `change_log` entry for it under this
// trip would hand the pusher the foreign row's whole snapshot — the exact
// leak `belongsToTrip` exists to prevent (P-3). The repair for this one is
// the client's, and it has everything it needs: a row it may not touch here
// is a row it must not keep here.
func TestPull_AfterAnOutOfScopeRefusal_OffersNothing(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Andere', 2026)`)
	foreign := upsert("ti-foreign", "rr-7", map[string]any{
		"trip_id": "trip-other", "name": "Fremde Zeile",
	}, "0000000001000-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(ctx, "trip-other", testUser, foreign); err != nil {
		t.Fatalf("seed foreign item: %v", err)
	}
	caughtUp := pullAfter(t, s, testTrip, 0).NextCursor

	res, err := s.ApplyMutation(ctx, testTrip, testUser, upsert("ti-foreign", "rr-8",
		map[string]any{"name": "Geklaut"}, "0000000002000-0000-aaaaaaaa"))
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if res.Reason != ReasonOutOfScope {
		t.Fatalf("reason = %q, want %q", res.Reason, ReasonOutOfScope)
	}

	page := pullAfter(t, s, testTrip, caughtUp)
	for _, c := range page.Changes {
		if c.ID == "ti-foreign" {
			t.Fatalf("the foreign row reached this trip's pull as %+v — the refusal leaked what it refused", c)
		}
	}
	if len(page.Changes) != 0 {
		t.Errorf("pull offered %d changes, want none", len(page.Changes))
	}
}

// P-5: a replay is answered from the memo and touches nothing — including
// the repair. Without this the boot replay of a parked mutation would append
// a repair entry per attempt, for a refusal that already happened once.
func TestApplyMasterMutation_ReplayingARefusedMutation_ReLogsNothingFurther(t *testing.T) {
	s := openTestStore(t)

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "tpl-once", "rr-9",
		map[string]any{"name": "Ferien", "kind": KindTemplate}, "0000000001000-0000-aaaaaaaa"))
	generated := upsert("ti-once", "rr-10", map[string]any{
		"trip_id": testTrip, "name": "Zahnbürste", "source_template_id": "tpl-once",
	}, "0000000001001-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(context.Background(), testTrip, testUser, generated); err != nil {
		t.Fatalf("seed trip item: %v", err)
	}

	refused := masterMut(sync.OpDelete, TableTemplates, "tpl-once", "rr-11", nil, "0000000002000-0000-aaaaaaaa")
	applyMaster(t, s, testUser, refused)
	afterFirst := pullMasterAfter(t, s, testUser, 0).NextCursor

	res := applyMaster(t, s, testUser, refused)

	if res.Outcome != sync.OutcomeDuplicate {
		t.Errorf("replay outcome = %q, want duplicate", res.Outcome)
	}
	page := pullMasterAfter(t, s, testUser, afterFirst)
	if len(page.Changes) != 0 {
		t.Errorf("the replay appended %d further change(s), want none", len(page.Changes))
	}
}

// Rendering the repair is what found this one. The client mirrors the
// server's cascade when it deletes a template — the positions go with it,
// optimistically — so re-logging the template alone put the Vorlage back on
// screen with none of its contents. The repair has to carry back everything
// the delete took, not only the row the mutation named. Since FR-24.3 the
// delete this Vorlage meets is a *retire* rather than a refusal, and the
// same debt is owed: a row that survives a delete the client already drew
// has to bring its children with it.
func TestPullMaster_AfterARetire_OffersTheChildrenTheClientMirroredAway(t *testing.T) {
	s := openTestStore(t)

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "grp-wash", "rc-1",
		map[string]any{"name": "Waschbeutel", "kind": KindGroup}, "0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "item-soap", "rc-1b",
		map[string]any{"name": "Seife"}, "0000000001000-0000-aaaaaaab"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplateItems, "pos-soap", "rc-2",
		map[string]any{"template_id": "grp-wash", "item_id": "item-soap", "quantity": 1},
		"0000000001001-0000-aaaaaaaa"))
	generated := upsert("ti-wash", "rc-3", map[string]any{
		"trip_id": testTrip, "name": "Seife", "source_template_id": "grp-wash",
	}, "0000000001002-0000-aaaaaaaa")
	if _, err := s.ApplyMutation(context.Background(), testTrip, testUser, generated); err != nil {
		t.Fatalf("seed trip item: %v", err)
	}
	caughtUp := pullMasterAfter(t, s, testUser, 0).NextCursor

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTemplates, "grp-wash", "rc-4",
		nil, "0000000002000-0000-aaaaaaaa"))
	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s), want the FR-24.3 retire", res.Reason)
	}

	page := pullMasterAfter(t, s, testUser, caughtUp)

	var position *Change
	for i, c := range page.Changes {
		if c.Table == TableTemplateItems && c.ID == "pos-soap" {
			position = &page.Changes[i]
		}
	}
	if position == nil {
		t.Fatalf("the group came back empty: the refusal re-logged the template and none of its %d positions", 1)
	}
	if position.Deleted {
		t.Errorf("the position came back as a tombstone, want the row the server still has")
	}
}
