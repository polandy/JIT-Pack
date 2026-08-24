package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// A foreign key cascade deletes child rows inside SQLite, where no change
// feed can see it. Every such cascade therefore has to be tombstoned
// explicitly, or the rows stay on every other device forever — the same
// defect the template cascade was built to avoid (Sync-API §4: a delete
// reaches clients as a tombstone, and nothing else does).

// Deleting a trip cascades three tables that travel the *master*
// partition, so their tombstones cannot ride the trip's own feed — that
// feed is deleted with the trip.
func TestApplyMasterMutation_DeletingATripTombstonesItsMasterPartitionChildren(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	mustExec(t, s, `INSERT INTO trip_members (id, trip_id, user_id, role) VALUES ('mem-owner', ?, ?, 'owner')`,
		testTrip, testUser)
	mustExec(t, s, `INSERT INTO templates (id, owner_id, name, kind) VALUES ('tpl-1', ?, 'Sommer', 'group')`, testUser)
	mustExec(t, s, `INSERT INTO trip_template_sources (id, trip_id, template_id) VALUES ('tts-1', ?, 'tpl-1')`, testTrip)
	mustExec(t, s, `INSERT INTO trip_applied_changes
	                (id, trip_id, source_template_id, source_template_name, kind, item_name)
	                VALUES ('tac-1', ?, 'tpl-1', 'Sommer', 'added', 'Sonnencreme')`, testTrip)

	// A cursor taken before the delete, so the assertions read only what
	// the delete itself produced.
	before, err := s.HeadSeqMaster(ctx)
	if err != nil {
		t.Fatalf("HeadSeqMaster: %v", err)
	}

	del := sync.Mutation{
		MutationID: "mut-del-trip", Op: sync.OpDelete, Table: TableTrips, ID: testTrip,
		HLC: sync.HLC("0000000009000-0000-aaaaaaaa"),
	}
	res, err := s.ApplyMasterMutation(ctx, testUser, del)
	if err != nil {
		t.Fatalf("ApplyMasterMutation: %v", err)
	}
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("outcome = %q, want applied", res.Outcome)
	}

	page, err := s.PullMaster(ctx, testUser, before, 50)
	if err != nil {
		t.Fatalf("PullMaster: %v", err)
	}
	for _, want := range []struct{ table, id string }{
		{TableTripMembers, "mem-owner"},
		{TableTripTemplateSources, "tts-1"},
		{TableTripAppliedChanges, "tac-1"},
	} {
		assertTombstoned(t, page, want.table, want.id)
	}
}

// Deleting a trip item cascades its comments (schema: comments.trip_item_id
// ON DELETE CASCADE). The trip partition had no cascade machinery at all,
// so those comments vanished server-side and stayed on every device.
func TestApplyMutation_DeletingATripItemTombstonesItsComments(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name) VALUES ('ti-1', ?, 'Zelt')`, testTrip)
	mustExec(t, s, `INSERT INTO comments (id, trip_id, trip_item_id, author_id, body)
	                VALUES ('cm-1', ?, 'ti-1', ?, 'Heringe prüfen')`, testTrip, testUser)

	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}

	del := sync.Mutation{
		MutationID: "mut-del-item", Op: sync.OpDelete, Table: TableTripItems, ID: "ti-1",
		HLC: sync.HLC("0000000009100-0000-aaaaaaaa"),
	}
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, del); err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	page, err := s.Pull(ctx, testTrip, before, 50)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	assertTombstoned(t, page, TableComments, "cm-1")
}

// Sync-API §5.1: "A delete of a row that no longer exists stays accepted …
// and it writes nothing." The change feed is the positive signal here — a
// spurious tombstone is work every device redoes on every retry.
func TestApplyMutation_DeleteOfAMissingRowWritesNoChangeLogEntry(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	before, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}

	del := sync.Mutation{
		MutationID: "mut-del-ghost", Op: sync.OpDelete, Table: TableTripItems, ID: "never-existed",
		HLC: sync.HLC("0000000009200-0000-aaaaaaaa"),
	}
	res, err := s.ApplyMutation(ctx, testTrip, testUser, del)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if res.Outcome != sync.OutcomeApplied {
		t.Errorf("outcome = %q, want applied — a delete of a gone row is not a failure", res.Outcome)
	}

	after, err := s.HeadSeq(ctx, testTrip)
	if err != nil {
		t.Fatalf("HeadSeq: %v", err)
	}
	if after != before {
		t.Errorf("change_log head moved %d → %d; deleting a row that never existed must write nothing", before, after)
	}
	if res.Seq != 0 {
		t.Errorf("result seq = %d, want 0 — nothing was written", res.Seq)
	}
}

// assertTombstoned fails unless the page carries a delete for the entity.
func assertTombstoned(t *testing.T, page PullPage, table, id string) {
	t.Helper()
	for _, c := range page.Changes {
		if c.Table == table && c.ID == id {
			if !c.Deleted {
				t.Errorf("change for %s/%s is not a tombstone", table, id)
			}
			return
		}
	}
	t.Errorf("no tombstone for %s/%s — the cascade deleted it without telling any client", table, id)
}
