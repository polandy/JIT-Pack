package store

import (
	"context"
	"database/sql"
	"testing"
)

// The shape schema.sql owes the packing concept, asserted against a real
// database rather than read off the file:
//
//   - travelers has no profile — FR-25.9 was removed, and FR-2.5 lost the
//     Adult/Child type with it. A field nothing reads is a question asked
//     of the user for nothing.
//   - trip_items.packed_by_user_id sits beside packer_user_id — FR-25.19
//     splits the assignment ("Zugewiesen an", chosen deliberately, triggers
//     the FR-6.2 push) from the record of who actually packed the row.
//
// These were written as migration tests and outlived the migrations: what
// they check is the schema, and the schema is still there to check.

func columns(t *testing.T, db *sql.DB, table string) map[string]bool {
	t.Helper()
	rows, err := db.Query(`SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		t.Fatalf("table_info(%s): %v", table, err)
	}
	defer rows.Close()
	got := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan column: %v", err)
		}
		got[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate columns: %v", err)
	}
	return got
}

// FR-25.9/FR-2.5: the traveler type is gone from the schema entirely.
func TestSchema_TravelersHaveNoProfile_FR25_9(t *testing.T) {
	s := openTestStore(t)

	cols := columns(t, s.db, "travelers")
	if cols["profile"] {
		t.Error("travelers.profile still exists — FR-25.9 retired the traveler type")
	}
	for _, keep := range []string{"id", "trip_id", "name", "linked_user_id", "updated_hlc"} {
		if !cols[keep] {
			t.Errorf("travelers.%s lost with the dropped column", keep)
		}
	}
}

// The two foreign keys that point at travelers must hold, or a trip's assignments and carriers silently detach.
func TestSchema_TravelersKeepTheirInboundForeignKeys_FR25_9(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO travelers (id, trip_id, name) VALUES ('trav-1', ?, 'Andy')`,
		testTrip); err != nil {
		t.Fatalf("insert traveler: %v", err)
	}

	// A dangling traveler reference must still be refused.
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO trip_items (id, trip_id, name, assigned_traveler_id)
		 VALUES ('ti-x', ?, 'Zelt', 'nobody')`, testTrip)
	if err == nil {
		t.Error("trip_items.assigned_traveler_id no longer enforces its FK to travelers")
	}

	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO containers (id, trip_id, name, carrier_traveler_id)
		 VALUES ('cont-1', ?, 'Rucksack', 'trav-1')`, testTrip); err != nil {
		t.Fatalf("carrier FK broken after rebuild: %v", err)
	}
}

// A client that still sends the retired field is rejected rather than
// silently ignored — the whitelist is the contract.
func TestPush_TravelerProfile_IsNoLongerSyncable_FR25_9(t *testing.T) {
	if syncableColumns["travelers"]["profile"] {
		t.Fatal("travelers.profile still on the sync whitelist")
	}
}

// FR-25.19: the record column exists, is nullable, and is distinct from
// the assignment it was conflated with.
func TestSchema_PackingRecordSitsBesideTheAssignment_FR25_19(t *testing.T) {
	s := openTestStore(t)

	cols := columns(t, s.db, "trip_items")
	if !cols["packed_by_user_id"] {
		t.Fatal("trip_items.packed_by_user_id missing — FR-25.19 needs a record beside the assignment")
	}
	if !cols["packer_user_id"] {
		t.Error("trip_items.packer_user_id must stay — it is now the assignment")
	}

	// Nullable: an unpacked row records nobody.
	if _, err := s.db.Exec(
		`INSERT INTO trip_items (id, trip_id, name) VALUES ('ti-null', ?, 'Zelt')`,
		testTrip); err != nil {
		t.Fatalf("record column is not nullable: %v", err)
	}
}

// FR-25.17: the record's *when*. Nullable on purpose — a row can have a
// packer and no known moment, and the screen states the packer alone
// rather than inventing a time.
func TestSchema_PackedAtIsNullable_FR25_17(t *testing.T) {
	s := openTestStore(t)

	if !columns(t, s.db, "trip_items")["packed_at"] {
		t.Fatal("trip_items.packed_at missing — FR-25.17 needs the time beside the packer")
	}

	if _, err := s.db.Exec(
		`INSERT INTO trip_items (id, trip_id, name) VALUES ('ti-no-time', ?, 'Zelt')`,
		testTrip); err != nil {
		t.Fatalf("packed_at is not nullable: %v", err)
	}
}

// FR-2.1b: only the year is required. A trip planned before its dates
// exist must be storable, and the year must survive as the anchor M2
// sorts by.
func TestSchema_TripNeedsOnlyItsYear_FR2_1b(t *testing.T) {
	s := openTestStore(t)

	if !columns(t, s.db, "trips")["year"] {
		t.Fatal("trips.year missing — FR-2.1b makes it the one required temporal fact")
	}

	// A trip with no dates at all.
	if _, err := s.db.Exec(
		`INSERT INTO trips (id, name, year) VALUES ('t-year-only', 'Samedan 2027', 2027)`); err != nil {
		t.Fatalf("a trip with only a year was rejected: %v", err)
	}
	var duration sql.NullInt64
	if err := s.db.QueryRow(
		`SELECT duration_days FROM trips WHERE id = 't-year-only'`).Scan(&duration); err != nil {
		t.Fatalf("read duration: %v", err)
	}
	if duration.Valid {
		t.Errorf("a trip without dates has no duration, got %d", duration.Int64)
	}

	// The year is not optional in its turn.
	if _, err := s.db.Exec(
		`INSERT INTO trips (id, name) VALUES ('t-no-year', 'Irgendwann')`); err == nil {
		t.Error("a trip without a year was accepted")
	}

	// Dates still constrain each other where both are given.
	if _, err := s.db.Exec(
		`INSERT INTO trips (id, name, year, start_date, end_date)
		 VALUES ('t-backwards', 'Rückwärts', 2026, '2026-08-10', '2026-08-01')`); err == nil {
		t.Error("end before start was accepted")
	}
}
