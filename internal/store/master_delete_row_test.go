package store

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"jitpack/internal/sync"
)

// DeleteMasterRow is the store half of the REST delete (ADR-038). It exists
// so a caller outside the app can delete a master row without minting a
// mutation id and an HLC of its own — and it deliberately routes through
// ApplyMasterMutation rather than reimplementing the decision, because
// FR-24.3's retire-or-remove rule must have exactly one implementation.

// The FR-24.3 branch a caller cannot see from the outcome alone: the row
// survives, so "applied" would read as "gone". The result says which it was.
func TestDeleteMasterRow_ReferencedItem_IsRetiredAndSaysSo_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedItem(t, s)

	res, err := s.DeleteMasterRow(ctx, testUser, TableItems, "it-1")
	if err != nil {
		t.Fatalf("DeleteMasterRow: %v", err)
	}
	if res.Outcome == sync.OutcomeRejected {
		t.Fatalf("outcome = rejected (%s) — FR-24.3 turns this refusal into a retire", res.Reason)
	}
	if !res.Retired {
		t.Error("Retired = false — the caller is told the row is gone while it is still there")
	}
	var retired sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT `+RetiredColumn+` FROM items WHERE id = 'it-1'`).Scan(&retired); err != nil {
		t.Fatalf("the referenced item was deleted outright: %v", err)
	}
	if !retired.Valid {
		t.Errorf("%s is NULL — the row survived without being marked retired", RetiredColumn)
	}
}

// The same distinction for a Vorlage: FR-9.2's provenance is what keeps it
// alive, and the answer has to name that rather than claim a deletion.
func TestDeleteMasterRow_ReferencedTemplate_IsRetiredAndSaysSo_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	seedReferencedTemplate(t, s)

	res, err := s.DeleteMasterRow(ctx, testUser, TableTemplates, "tpl-ferien")
	if err != nil {
		t.Fatalf("DeleteMasterRow: %v", err)
	}
	if !res.Retired {
		t.Error("Retired = false for a Vorlage a trip was generated from (FR-9.2)")
	}
}

// The other branch, and the reason Retired is not always true: a row nothing
// has ever pointed at leaves nothing behind.
func TestDeleteMasterRow_UnreferencedItem_IsRemovedAndNotRetired_FR24_3(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "it-lonely", "rd-1",
		map[string]any{"name": "Vertipper"}, "0000000001000-0000-aaaaaaaa"))

	res, err := s.DeleteMasterRow(ctx, testUser, TableItems, "it-lonely")
	if err != nil {
		t.Fatalf("DeleteMasterRow: %v", err)
	}
	if res.Retired {
		t.Error("Retired = true — nothing referenced this row, so it deletes physically")
	}
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM items WHERE id = 'it-lonely'`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Error("the row is still there")
	}
}

// A delete nobody can see is the defect this whole partition exists to
// avoid: without a change_log entry the row stays on every other device.
func TestDeleteMasterRow_AppendsAChangeLogEntry_SoOtherDevicesLearnOfIt(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTags, "tag-1", "rd-1",
		map[string]any{"name": "Sommer"}, "0000000001000-0000-aaaaaaaa"))

	res, err := s.DeleteMasterRow(ctx, testUser, TableTags, "tag-1")
	if err != nil {
		t.Fatalf("DeleteMasterRow: %v", err)
	}
	if res.Seq == 0 {
		t.Fatal("Seq = 0 — no change_log entry, so no device will ever hear about this delete")
	}
	var deleted int
	if err := s.db.QueryRowContext(ctx,
		`SELECT deleted FROM change_log WHERE seq = ?`, res.Seq).Scan(&deleted); err != nil {
		t.Fatalf("read change_log entry %d: %v", res.Seq, err)
	}
	if deleted != 1 {
		t.Error("the change_log entry is not a tombstone — a pull would resend the row as alive")
	}
}

// The trap applyRevert already pays for, in a second place: a device whose
// wall clock ran ahead leaves an HLC the server has never seen, and a delete
// that is not strictly newer is dropped by its own merge. Asserted against
// the row's clock rather than against wall time, so it holds on any machine.
func TestDeleteMasterRow_ClockRunsAheadOfARowFromTheFuture(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	// Year 2286 in ms: unreachable by the test machine's own clock, so a
	// pass cannot be an accident of when the suite runs.
	const fromTheFuture = "9999999999000-0000-bbbbbbbb"
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTags, "tag-ahead", "rd-1",
		map[string]any{"name": "Zukunft"}, fromTheFuture))

	if _, err := s.DeleteMasterRow(ctx, testUser, TableTags, "tag-ahead"); err != nil {
		t.Fatalf("DeleteMasterRow: %v", err)
	}
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM tags WHERE id = 'tag-ahead'`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Error("the row survived — the minted HLC lost to the row's own clock")
	}
}

// A REST caller gets 404 from this, so "gone" and "never existed" must not
// both answer applied: a script deleting a list twice would report success
// for ids it never had.
func TestDeleteMasterRow_UnknownID_IsErrMasterRowNotFound(t *testing.T) {
	s := openTestStore(t)

	_, err := s.DeleteMasterRow(context.Background(), testUser, TableItems, "it-never-existed")
	if !errors.Is(err, ErrMasterRowNotFound) {
		t.Errorf("err = %v, want ErrMasterRowNotFound", err)
	}
}

// The endpoint set is an allowlist, not "whatever is in the master
// partition": trips carry membership and travelers carry attributions, and
// neither is a cleanup a path parameter should be able to ask for.
func TestDeleteMasterRow_TableOutsideTheAllowlist_IsRefused(t *testing.T) {
	for _, table := range []string{TableTrips, TableTripMembers, TableTripSeries} {
		t.Run(table, func(t *testing.T) {
			s := openTestStore(t)
			_, err := s.DeleteMasterRow(context.Background(), testUser, table, "any-id")
			if !errors.Is(err, ErrMasterTableNotDeletable) {
				t.Errorf("err = %v, want ErrMasterTableNotDeletable", err)
			}
		})
	}
}

// Every table the endpoint offers must actually reach the FR-24.3 pipeline.
// A table added to the allowlist but missing from the partition would fail
// deep inside validate() as a 500 rather than as a refusal.
func TestDeleteMasterRow_EveryDeletableTableIsInTheMasterPartition(t *testing.T) {
	for table := range deletableMasterTables {
		if !masterPartitionTables[table] {
			t.Errorf("%s is deletable but not in the master partition — its delete cannot be applied", table)
		}
	}
}

// Why the REST delete has no still_referenced answer, pinned so it cannot rot
// into a silent 500: every allowlisted table is either one FR-24.3 governs —
// where a reference retires the row instead of refusing it — or one nothing
// can point at. Widening the allowlist to a table with blocking references
// that is not a lifecycle table needs the refusal path built first, and this
// is where that is noticed.
func TestDeletableTables_CannotBeRefusedAsStillReferenced_FR24_3(t *testing.T) {
	for table := range deletableMasterTables {
		if lifecycleTables[table] {
			continue
		}
		if refs := blockingReferences[table]; len(refs) > 0 {
			t.Errorf("%s is deletable, is not a lifecycle table, and %d reference(s) can block it — "+
				"its delete can be rejected, which the HTTP edge has no answer for", table, len(refs))
		}
	}
}
