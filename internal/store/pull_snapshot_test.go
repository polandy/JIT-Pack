package store

import (
	"context"
	"errors"
	"testing"

	"jitpack/internal/sync"
)

// Sync-API §3: "on every pull/push response the client advances
// last_seen_hlc to the maximum observed". The client implements exactly
// that (usePull.ts, useSyncOutbox.ts both read `row['updated_hlc']`), so
// the snapshot has to carry the row's clock or the rule is unreachable: a
// device whose wall clock lags would keep minting HLCs older than writes
// it has already seen, and lose its own later edits to them.

func TestPull_SnapshotCarriesUpdatedHLC_SoTheClientCanAdvanceItsClock(t *testing.T) {
	s := openTestStore(t)
	const stamped = sync.HLC("0000000001000-0000-aaaaaaaa")
	m := sync.Mutation{
		MutationID: "mut-hlc-trip", Op: sync.OpInsert, Table: TableTripItems, ID: "item-hlc",
		Fields: map[string]any{"trip_id": testTrip, "name": "Zahnbürste"},
		HLC:    stamped,
	}
	if _, err := s.ApplyMutation(context.Background(), testTrip, testUser, m); err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}

	page, err := s.Pull(context.Background(), testTrip, 0, 10)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}

	row := snapshotOf(t, page, TableTripItems, "item-hlc")
	if got := row[updatedHLCColumn]; got != string(stamped) {
		t.Errorf("snapshot %s = %v, want %q — the client's HLC-observe rule reads this field",
			updatedHLCColumn, got, stamped)
	}
}

func TestPullMaster_SnapshotCarriesUpdatedHLC_SoTheClientCanAdvanceItsClock(t *testing.T) {
	s := openTestStore(t)
	const stamped = sync.HLC("0000000002000-0000-bbbbbbbb")
	m := sync.Mutation{
		MutationID: "mut-hlc-master", Op: sync.OpInsert, Table: TableItems, ID: "master-hlc",
		Fields: map[string]any{"name": "Regenjacke"},
		HLC:    stamped,
	}
	if _, err := s.ApplyMasterMutation(context.Background(), testUser, m); err != nil {
		t.Fatalf("ApplyMasterMutation: %v", err)
	}

	page, err := s.PullMaster(context.Background(), testUser, 0, 50)
	if err != nil {
		t.Fatalf("PullMaster: %v", err)
	}

	row := snapshotOf(t, page, TableItems, "master-hlc")
	if got := row[updatedHLCColumn]; got != string(stamped) {
		t.Errorf("snapshot %s = %v, want %q — the client's HLC-observe rule reads this field",
			updatedHLCColumn, got, stamped)
	}
}

// The clock rides along as a field, but it must never become a field a
// client may write: P-4 says clients never merge, and a settable row clock
// would let one push backdate another device's write out of existence.
func TestPull_UpdatedHLCIsNotWritableByAClient(t *testing.T) {
	s := openTestStore(t)
	m := sync.Mutation{
		MutationID: "mut-hlc-forge", Op: sync.OpInsert, Table: TableTripItems, ID: "item-forge",
		Fields: map[string]any{
			"trip_id": testTrip, "name": "Karte",
			updatedHLCColumn: "9999999999999-0000-cccccccc",
		},
		HLC: sync.HLC("0000000003000-0000-aaaaaaaa"),
	}

	_, err := s.ApplyMutation(context.Background(), testTrip, testUser, m)

	if !errors.Is(err, ErrUnknownColumn) {
		t.Fatalf("ApplyMutation naming %s = %v, want %v — the push whitelist must refuse the column by name",
			updatedHLCColumn, err, ErrUnknownColumn)
	}
}

// snapshotOf returns the snapshot of one entity from a pull page, failing
// the test when the page does not carry it.
func snapshotOf(t *testing.T, page PullPage, table, id string) map[string]any {
	t.Helper()
	for _, c := range page.Changes {
		if c.Table == table && c.ID == id {
			if c.Row == nil {
				t.Fatalf("change for %s/%s carries no snapshot", table, id)
			}
			return c.Row
		}
	}
	t.Fatalf("pull page carries no change for %s/%s", table, id)
	return nil
}
