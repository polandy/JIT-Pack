package store

import (
	"testing"

	"jitpack/internal/sync"
)

// FR-5.10: finishing the packing is a decision somebody made at a moment,
// not a reading of the rows. Without a column for it, „packing is closed"
// could only be derived from „nothing is open" — and a row added afterwards
// (which is the whole point of leaving the list open) would silently revoke
// it.
func TestSchema_PackingClosedAtRecordsTheDecision_FR5_10(t *testing.T) {
	s := openTestStore(t)

	if !columns(t, s.db, "trips")["packing_closed_at"] {
		t.Fatal("trips.packing_closed_at missing — FR-5.10 needs somewhere to record the decision")
	}

	// Nullable: packing has not been finished on a fresh trip, and reopening
	// it writes the null back.
	if _, err := s.db.Exec(
		`INSERT INTO trips (id, name, year) VALUES ('trip-open', 'Samedan', 2026)`); err != nil {
		t.Fatalf("packing_closed_at is not nullable: %v", err)
	}
	if _, err := s.db.Exec(
		`INSERT INTO trips (id, name, year, packing_closed_at) VALUES ('trip-closed', 'Samedan', 2026, ?)`,
		"2026-09-20T18:40:00.000Z"); err != nil {
		t.Fatalf("packing_closed_at rejected a timestamp: %v", err)
	}
}

// The whitelist is the contract: a column no client may send is a column the
// feature does not have (Sync-API §5). The stamp is written on the device
// that closed the packing and has to reach the others.
func TestPush_PackingClosedAtIsSyncable_FR5_10(t *testing.T) {
	if !syncableColumns[TableTrips]["packing_closed_at"] {
		t.Fatal("trips.packing_closed_at is not on the sync whitelist — FR-5.10 is shared trip data")
	}
}

// NFR-4.2a: the stamp merges on its own. Closing the packing writes it and
// nothing else, so a status another device set meanwhile survives — and a
// push carrying only this field must be accepted rather than refused, since
// a refused mutation is one the outbox drops.
func TestApplyMasterMutation_PackingClosedAtIsWritableOnItsOwn_FR5_10(t *testing.T) {
	s := openTestStore(t)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, "trip-close", "pc-1",
		map[string]any{"name": "Samedan", "year": 2026, "status": "active"},
		"0000000001000-0000-aaaaaaaa"))

	closed := "2026-09-20T18:40:00.000Z"
	res := applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTrips, "trip-close", "pc-2",
		map[string]any{"packing_closed_at": closed}, "0000000002000-0000-aaaaaaaa"))
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("outcome = %q (reason %q), want applied — the stamp must not need a status beside it",
			res.Outcome, res.Reason)
	}

	var got, status string
	if err := s.db.QueryRow(
		`SELECT packing_closed_at, status FROM trips WHERE id = 'trip-close'`).Scan(&got, &status); err != nil {
		t.Fatalf("read row: %v", err)
	}
	if got != closed {
		t.Errorf("packing_closed_at = %q, want %q", got, closed)
	}
	if status != "active" {
		t.Errorf("status = %q — closing the packing must not touch the lifecycle", status)
	}

	// Reopening: the same single field, back to null.
	res = applyMaster(t, s, testUser, masterMut(sync.OpUpsert, TableTrips, "trip-close", "pc-3",
		map[string]any{"packing_closed_at": nil}, "0000000003000-0000-aaaaaaaa"))
	if res.Outcome != sync.OutcomeApplied {
		t.Fatalf("reopen outcome = %q (reason %q), want applied", res.Outcome, res.Reason)
	}
	var reopened *string
	if err := s.db.QueryRow(
		`SELECT packing_closed_at FROM trips WHERE id = 'trip-close'`).Scan(&reopened); err != nil {
		t.Fatalf("read reopened row: %v", err)
	}
	if reopened != nil {
		t.Errorf("packing_closed_at = %q after reopening, want NULL", *reopened)
	}
}
