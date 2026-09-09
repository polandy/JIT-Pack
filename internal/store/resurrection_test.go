package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// A delete is a hard `DELETE` (persist), and the row's only remaining trace
// is its `change_log` tombstone. So a write that predates the delete met an
// empty table on arrival: `loadRow` reported `Exists: false`, and Merge's
// "nothing to compare against" branch applied every field it carried. The
// deleted row came back, with the values it had before it was deleted, and
// nothing about it looked wrong to anybody — the resurrection reached every
// other device as an ordinary change.
//
// The rule these tests state: **a write must be strictly newer than the
// tombstone to create the row again.** That is the same comparison the
// delete branch already makes in the other direction (`m.HLC > row.HLC`),
// read off the same clock.

// hlcAt spells the two clocks each case needs out of one format, so a test
// reads as "older than the delete" rather than as two long strings the
// reader has to compare character by character (Sync-API §3).
func hlcAt(millis string) sync.HLC { return sync.HLC(millis + "-0000-aaaaaaaa") }

const (
	hlcCreated = "0000000001000"
	hlcOffline = "0000000002000" // the offline edit, made before the delete
	hlcDeleted = "0000000003000"
	hlcAfter   = "0000000004000" // a deliberate re-creation, made after it
)

// The motivating case (Sync-API §6, NFR-4.2a): two devices, one item.
func TestApplyMasterMutation_AnUpsertOlderThanTheTombstone_DoesNotResurrectTheItem(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "item-zelt", "rs-1",
		map[string]any{"name": "Zelt"}, hlcCreated+"-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "item-zelt", "rs-2",
		nil, hlcDeleted+"-0000-aaaaaaaa"))

	// The other device was offline while the delete happened and pushes the
	// edit it made before it — a whole-row upsert, which is what the client
	// sends (invariant 4's optimistic rows carry every column).
	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItems, "item-zelt", "rs-3",
		map[string]any{"name": "Zelt (gross)"}, hlcOffline+"-0000-bbbbbbbb"))

	if res.Outcome != sync.OutcomeRejected {
		t.Fatalf("outcome = %q, want rejected — the stale upsert was applied", res.Outcome)
	}
	if res.Reason != ReasonRowDeleted {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonRowDeleted)
	}
	// The positive signal, and the whole point: the table is still empty.
	var count int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM items WHERE id = 'item-zelt'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("items rows = %d, want 0 — the deleted row came back", count)
	}
}

// The same rule on the other partition: the pipeline is shared, the feed the
// tombstone lives in is not, and a lookup that read the wrong feed would
// pass the test above and fail here.
func TestApplyMutation_AnUpsertOlderThanTheTombstone_DoesNotResurrectTheTripItem(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if _, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
		MutationID: "rt-1", Op: sync.OpInsert, Table: TableTripItems, ID: "ti-socken",
		Fields: map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 2},
		HLC:    hlcAt(hlcCreated),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
		MutationID: "rt-2", Op: sync.OpDelete, Table: TableTripItems, ID: "ti-socken",
		HLC: hlcAt(hlcDeleted),
	}); err != nil {
		t.Fatal(err)
	}

	res, err := s.ApplyMutation(ctx, testTrip, testUser, sync.Mutation{
		MutationID: "rt-3", Op: sync.OpUpsert, Table: TableTripItems, ID: "ti-socken",
		Fields: map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 2, "packed_count": 2},
		HLC:    hlcAt(hlcOffline),
	})
	if err != nil {
		t.Fatal(err)
	}

	if res.Outcome != sync.OutcomeRejected || res.Reason != ReasonRowDeleted {
		t.Fatalf("outcome/reason = %q/%q, want rejected/%s", res.Outcome, res.Reason, ReasonRowDeleted)
	}
	var count int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM trip_items WHERE id = 'ti-socken'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("trip_items rows = %d, want 0 — the deleted row came back", count)
	}
}

// The falsifier. Refusing *every* write that finds no row would satisfy both
// tests above and break the two paths that legitimately re-create a deleted
// id: FR-24.3's restore and the client's own undo, which re-insert the row
// they just removed under the same id with a fresh clock.
func TestApplyMasterMutation_AnInsertNewerThanTheTombstone_RecreatesTheRow(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "item-zelt", "un-1",
		map[string]any{"name": "Zelt"}, hlcCreated+"-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "item-zelt", "un-2",
		nil, hlcDeleted+"-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "item-zelt", "un-3",
		map[string]any{"name": "Zelt"}, hlcAfter+"-0000-aaaaaaaa"))

	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("outcome = %q, want applied — undo can no longer restore a row", res.Outcome)
	}
	var name string
	if err := s.db.QueryRowContext(ctx,
		`SELECT name FROM items WHERE id = 'item-zelt'`).Scan(&name); err != nil {
		t.Fatalf("the row was not re-created: %v", err)
	}
	if name != "Zelt" {
		t.Errorf("name = %q, want %q", name, "Zelt")
	}
}

// A refusal repairs the row it refused (ADR-031), and this one has no server
// row to re-deliver: the device that pushed the stale write is holding a
// phantom, and only a tombstone in its own feed drops it.
func TestPullMaster_AfterARefusedResurrection_OffersATombstoneForThePhantom(t *testing.T) {
	s := openTestStore(t)

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "item-zelt", "rp-1",
		map[string]any{"name": "Zelt"}, hlcCreated+"-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableItems, "item-zelt", "rp-2",
		nil, hlcDeleted+"-0000-aaaaaaaa"))

	// The pushing device has seen everything so far — including the delete.
	// It is its own optimistic copy that has to go, and a pull that offered
	// nothing would leave it there forever.
	caughtUp := pullMasterAfter(t, s, testUser, 0).NextCursor

	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableItems, "item-zelt", "rp-3",
		map[string]any{"name": "Zelt (gross)"}, hlcOffline+"-0000-bbbbbbbb"))

	page := pullMasterAfter(t, s, testUser, caughtUp)

	var repaired *Change
	for i, c := range page.Changes {
		if c.Table == TableItems && c.ID == "item-zelt" {
			repaired = &page.Changes[i]
		}
	}
	if repaired == nil {
		t.Fatalf("the refused resurrection was never re-logged: the pull after it offered %d changes, "+
			"so the device keeps an item the server does not have", len(page.Changes))
	}
	if !repaired.Deleted {
		t.Errorf("the repair is the snapshot of a row, want a tombstone for the phantom")
	}
}
