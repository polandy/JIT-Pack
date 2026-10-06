package store

import (
	"context"
	"errors"
	"testing"
	"time"

	"jitpack/internal/sync"
)

// Invariant 3 as one pipeline step: the server-owned columns are declared on
// tableSpecs, stripped from every mutation of either partition, and stamped
// back from the actor — on a push and on a conflict revert (NFR-4.2a) alike.

// forged is what a client puts into a server-owned column. It is not an
// instant either, so not even a column that may keep a client's tap time
// (FR-25.17) has a reason to keep it.
const forged = "forged-by-client"

// TestServerOwned_ColumnsAreSyncableAndStamped pins the registry's shape: a
// server-owned column must be one a push may carry, or its stamp could never
// be persisted, and a table that owns columns has a rule that writes them.
func TestServerOwned_ColumnsAreSyncableAndStamped_Invariant3(t *testing.T) {
	for table, spec := range tableSpecs {
		owned := spec.serverOwned
		if (len(owned.columns) == 0) != (owned.stamp == nil) {
			t.Errorf("%s: columns %v and stamp (nil %v) must come together", table, owned.columns, owned.stamp == nil)
		}
		for column := range owned.columns {
			if !spec.columns[column] {
				t.Errorf("%s.%s is server-owned but not a syncable column", table, column)
			}
		}
	}
}

// stampDrivers are the client-decided fields a stamp rule reads to decide its
// record. Each sweep case adds one of them, so every branch of every rule
// meets a forged value.
var stampDrivers = []map[string]any{
	{},
	{sync.FieldState: sync.StatePacked},
	{sync.FieldState: sync.StatePackingNow},
	{sync.FieldState: "open"},
	{columnTaskState: taskStateResolved},
	{columnTaskState: "open"},
	{columnBought: 1},
	{columnBought: 0},
	{columnBoughtFrom: "list-1"},
	{columnBoughtFrom: nil},
}

// TestServerOwned_NoForgedValueSurvives_Invariant3 is the sweep: for every
// table, op and driver, a mutation carrying a forged value in every
// server-owned column leaves the stamp step with none of them, and the step
// wrote no column the table does not declare as its own.
func TestServerOwned_NoForgedValueSurvives_Invariant3(t *testing.T) {
	now := Now(func() time.Time { return time.Date(2026, 7, 11, 8, 0, 0, 0, time.UTC) })
	for table, spec := range tableSpecs {
		for _, op := range []sync.Op{sync.OpInsert, sync.OpUpsert, sync.OpDelete} {
			for _, exists := range []bool{false, true} {
				for _, driver := range stampDrivers {
					m := sync.Mutation{Op: op, Table: table, ID: "row-1", Fields: map[string]any{}}
					for f, v := range driver {
						if spec.columns[f] {
							m.Fields[f] = v
						}
					}
					clientFields := map[string]bool{}
					for f := range m.Fields {
						clientFields[f] = true
					}
					for column := range spec.serverOwned.columns {
						m.Fields[column] = forged
					}

					stampServerOwned(&m, sync.Row{Exists: exists}, testUser, now)

					for f, v := range m.Fields {
						if v == forged {
							t.Errorf("%s %s (exists %v, %v): %s kept the client's %q", table, op, exists, driver, f, v)
						}
						if !clientFields[f] && !spec.serverOwned.columns[f] {
							t.Errorf("%s: the stamp wrote %s, which the table does not own", table, f)
						}
					}
				}
			}
		}
	}
}

// The master partition's creator columns are decided when the row comes into
// being. An editor of a shared template — or the owner of a series — sending
// owner_id later must not move it (FR-1.6, FR-13.2): the stamp step strips it
// from every op, not only the creating one.
func TestApplyMasterMutation_ForgedCreatorOnUpdateIsDropped_Invariant3(t *testing.T) {
	tests := []struct {
		table, column string
		fields        map[string]any
	}{
		{TableTemplates, columnOwnerID, map[string]any{"name": "Basis"}},
		{TableTripSeries, columnOwnerID, map[string]any{"name": "Sommerferien"}},
		{TableItems, columnCreatedBy, map[string]any{"name": "Zelt"}},
	}
	for _, tc := range tests {
		t.Run(tc.table, func(t *testing.T) {
			s := openTestStore(t)
			seedUserB(t, s)
			applyMaster(t, s, testUser, masterMut(sync.OpInsert, tc.table, "row-1", "c-1",
				tc.fields, "0000000001000-0000-aaaaaaaa"))

			res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, tc.table, "row-1", "c-2",
				map[string]any{tc.column: testUserB}, "0000000002000-0000-aaaaaaaa"))

			if res.Outcome == sync.OutcomeRejected {
				t.Fatalf("outcome = %q (%s); the forged column is dropped, not the push", res.Outcome, res.Reason)
			}
			var got string
			if err := s.db.QueryRow(`SELECT ` + tc.column + ` FROM ` + tc.table + ` WHERE id = 'row-1'`).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != testUser {
				t.Errorf("%s = %q, want the creator %q", tc.column, got, testUser)
			}
		})
	}
}

// The store stamps on its own — a push reaching ApplyMutation through any
// door gets the packer from the actor, not from the request.
func TestApplyMutation_StampsThePackerFromTheActor_FR25_19(t *testing.T) {
	s := openTestStore(t)
	m := upsert("item-1", "p-1", map[string]any{
		"trip_id": testTrip, "name": "Helm", sync.FieldState: sync.StatePacked, columnPackedBy: "user-sia",
	}, staleHLC)

	if _, err := s.ApplyMutation(context.Background(), testTrip, testUser, m); err != nil {
		t.Fatal(err)
	}

	if by := itemColumn(t, s, columnPackedBy); by != testUser {
		t.Errorf("packed_by_user_id = %v, want %q", by, testUser)
	}
}

// §6 rule 2 on a stamped push: packing_now against a packed row loses its
// state, and the claim and the erased packer must lose with it — not leave a
// packed row with a claim holder and no packer (FR-5.7, FR-25.19).
func TestApplyMutation_PackingNowOnPackedRow_LeavesTheRecordAlone_FR57(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	seed := upsert("item-1", "p-1", map[string]any{"trip_id": testTrip, "name": "Helm", sync.FieldState: sync.StatePacked}, winningHLC)
	if _, err := s.ApplyMutation(ctx, testTrip, testUser, seed); err != nil {
		t.Fatal(err)
	}
	lock := upsert("item-1", "p-2", map[string]any{sync.FieldState: sync.StatePackingNow}, sync.HLC("0000000009000-0000-dddddddd"))
	if res, err := s.ApplyMutation(ctx, testTrip, testUserSia, lock); err != nil {
		t.Fatal(err)
	} else if res.Outcome != sync.OutcomeMerged {
		t.Fatalf("outcome = %q (%s), want merged: rule 2 drops the state", res.Outcome, res.Reason)
	}

	if by := itemColumn(t, s, columnPackedBy); by != testUser {
		t.Errorf("packed_by_user_id = %v, want the packer %q kept", by, testUser)
	}
	if holder := itemColumn(t, s, columnPackingNowBy); holder != nil {
		t.Errorf("packing_now_by = %v, want no claim on a packed row", holder)
	}
}

// NFR-4.2a + invariant 3: a revert is a write, and the stamp step runs on it.
// Restoring a lost "packed" or "packing_now" must bring the record the state
// carries — the reverter as packer or claim holder — or the row names a claim
// nobody holds.
func TestRevertTripConflict_StateGroup_RestoresServerOwnedStamps_Invariant3(t *testing.T) {
	tests := []struct {
		state      string
		holder, at string
	}{
		{sync.StatePacked, columnPackedBy, columnPackedAt},
		{sync.StatePackingNow, columnPackingNowBy, columnPackingNowAt},
	}
	for _, tc := range tests {
		t.Run(tc.state, func(t *testing.T) {
			s := openPlannerStore(t)
			ctx := context.Background()
			seed := upsert("item-1", "r-1", map[string]any{
				"trip_id": testTrip, "name": "Helm", sync.FieldState: "open",
			}, sync.HLC("0000000001000-0000-aaaaaaaa"))
			skip := upsert("item-1", "r-2", map[string]any{sync.FieldState: "skipped"}, sync.HLC("0000000009000-0000-dddddddd"))
			stale := upsert("item-1", "r-3", map[string]any{sync.FieldState: tc.state}, sync.HLC("0000000005000-0000-cccccccc"))
			for _, m := range []sync.Mutation{seed, skip, stale} {
				if _, err := s.ApplyMutation(ctx, testTrip, testUser, m); err != nil {
					t.Fatal(err)
				}
			}

			if _, err := s.RevertTripConflict(ctx, testTrip, testUserSia, conflictIDForField(t, s, sync.FieldState)); err != nil {
				t.Fatalf("revert: %v", err)
			}

			if got := itemColumn(t, s, sync.FieldState); got != tc.state {
				t.Fatalf("state = %v, want %s restored", got, tc.state)
			}
			if got := itemColumn(t, s, tc.holder); got != testUserSia {
				t.Errorf("%s = %v, want the reverter %q", tc.holder, got, testUserSia)
			}
			if got := itemColumn(t, s, tc.at); got == nil {
				t.Errorf("%s is empty beside a restored %s", tc.at, tc.state)
			}
		})
	}
}

// The revert passes through the partition's scope as a push does: a vote is
// its voter's (FR-29.3), and a trip member who may read the vote's conflict
// may not flip it by restoring the losing value.
func TestRevertTripConflict_ForeignVoteIsForbidden_FR29_3(t *testing.T) {
	s := openPlannerStore(t)
	ctx := context.Background()
	vote := func(id string, v string, hlc sync.HLC, op sync.Op) sync.Mutation {
		return sync.Mutation{MutationID: id, Op: op, Table: TableIdeaVotes, ID: "vote-sia",
			Fields: map[string]any{"trip_id": testTrip, "idea_id": "idea-1", "vote": v}, HLC: hlc}
	}
	for _, m := range []sync.Mutation{
		vote("v-1", "up", sync.HLC("0000000001000-0000-bbbbbbbb"), sync.OpInsert),
		vote("v-2", "down", sync.HLC("0000000009000-0000-bbbbbbbb"), sync.OpUpsert),
		vote("v-3", "up", sync.HLC("0000000005000-0000-bbbbbbbb"), sync.OpUpsert),
	} {
		if _, err := s.ApplyMutation(ctx, testTrip, testUserSia, m); err != nil {
			t.Fatal(err)
		}
	}

	_, err := s.RevertTripConflict(ctx, testTrip, testUser, conflictIDForField(t, s, "vote"))

	if !errors.Is(err, ErrRevertForbidden) {
		t.Fatalf("err = %v, want ErrRevertForbidden", err)
	}
	var v string
	if err := s.db.QueryRow(`SELECT vote FROM idea_votes WHERE id = 'vote-sia'`).Scan(&v); err != nil {
		t.Fatal(err)
	}
	if v != "down" {
		t.Errorf("vote = %q, want Sia's own last word kept", v)
	}
}

// itemColumn reads one column of the trip_items row item-1.
func itemColumn(t *testing.T, s *Store, column string) any {
	t.Helper()
	var v any
	if err := s.db.QueryRow(`SELECT ` + column + ` FROM trip_items WHERE id = 'item-1'`).Scan(&v); err != nil {
		t.Fatalf("read %s: %v", column, err)
	}
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return v
}
