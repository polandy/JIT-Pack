package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// Sync-API P-5: "the second push returns `duplicate` and appends nothing to
// the change log". The outcome half is covered by
// TestApplyMutation_DuplicateMutationID_ReturnsRecordedResult; this is the
// other half, which nothing asserted — a replay that re-logged the row
// would hand every other device a change it has already applied, on every
// boot, for as long as the mutation stays in an outbox that cannot drain.
func TestApplyMutation_ReplayAppendsNothingToTheChangeLog(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	m := sync.Mutation{
		MutationID: "mut-replay-ok", Op: sync.OpInsert, Table: TableTripItems, ID: "item-replay-ok",
		Fields: map[string]any{"trip_id": testTrip, "name": "Stirnlampe"},
		HLC:    sync.HLC("0000000005000-0000-aaaaaaaa"),
	}
	first, err := s.ApplyMutation(ctx, testTrip, testUser, m)
	if err != nil {
		t.Fatalf("first ApplyMutation: %v", err)
	}

	replay, err := s.ApplyMutation(ctx, testTrip, testUser, m)
	if err != nil {
		t.Fatalf("replay ApplyMutation: %v", err)
	}

	if replay.Seq != first.Seq {
		t.Errorf("replay seq = %d, want the recorded %d — the replay must return the first push's result",
			replay.Seq, first.Seq)
	}
	var rows int
	if err := s.db.QueryRow(
		`SELECT count(*) FROM change_log WHERE entity_id = ?`, "item-replay-ok").Scan(&rows); err != nil {
		t.Fatalf("count change_log: %v", err)
	}
	if rows != 1 {
		t.Errorf("change_log holds %d entries for the row, want 1", rows)
	}
}
