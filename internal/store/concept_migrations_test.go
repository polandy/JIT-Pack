package store

import (
	"context"
	"database/sql"
	"testing"
)

// Migrations 018 and 019 pay the two schema debts the packing concept
// left open (CLAUDE.md "Not built yet", item 5):
//
//   - 018 drops travelers.profile — FR-25.9 was removed, and FR-2.5 lost
//     the Adult/Child type with it. A field nothing reads is a question
//     asked of the user for nothing.
//   - 019 adds trip_items.packed_by_user_id — FR-25.19 splits the
//     assignment ("Zugewiesen an", chosen deliberately, triggers the
//     FR-6.2 push) from the record of who actually packed the row.

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
func TestMigrate_DropsTravelerProfile_FR25_9(t *testing.T) {
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

// Dropping the column must not disturb the two foreign keys that point
// at travelers, or a trip's assignments and carriers silently detach.
func TestMigrate_DropProfile_KeepsInboundForeignKeys(t *testing.T) {
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
func TestMigrate_AddsPackingRecordColumn_FR25_19(t *testing.T) {
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

// The backfill is the only reason already-packed rows keep their
// FR-25.17 stamp: before 019 the packer column *was* the record.
func TestMigrate019_BackfillsRecordFromPackedRows_FR25_19(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close staged db: %v", err)
		}
	})

	// Stop one migration short of the split, then seed the old shape.
	if err := migrateTo(db, 18); err != nil {
		t.Fatalf("migrate to 018: %v", err)
	}
	seed := [][2]string{
		{"u-andy", "Andy"},
		{"u-sia", "Sia"},
	}
	for _, u := range seed {
		if _, err := db.Exec(
			`INSERT INTO users (id, oidc_subject, display_name) VALUES (?, ?, ?)`,
			u[0], "auth|"+u[0], u[1]); err != nil {
			t.Fatalf("seed user: %v", err)
		}
	}
	if _, err := db.Exec(`INSERT INTO trips (id, name, end_date) VALUES ('trip-1', 'Samedan', '2026-09-21')`); err != nil {
		t.Fatalf("seed trip: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO trip_items (id, trip_id, name, state, packer_user_id) VALUES
			('done',  'trip-1', 'Zelt',   'packed', 'u-andy'),
			('open',  'trip-1', 'Schuhe', 'open',   'u-sia')`); err != nil {
		t.Fatalf("seed trip_items: %v", err)
	}

	if err := migrateTo(db, 19); err != nil {
		t.Fatalf("migrate to 019: %v", err)
	}

	var record, assignment sql.NullString
	if err := db.QueryRow(
		`SELECT packed_by_user_id, packer_user_id FROM trip_items WHERE id = 'done'`,
	).Scan(&record, &assignment); err != nil {
		t.Fatalf("read packed row: %v", err)
	}
	if record.String != "u-andy" {
		t.Errorf("packed row lost its FR-25.17 stamp: record = %q, want u-andy", record.String)
	}
	if assignment.String != "u-andy" {
		t.Errorf("backfill must copy, not move: assignment = %q, want u-andy", assignment.String)
	}

	// An unpacked row was never a record — inventing one would claim
	// Sia packed something she has not packed.
	if err := db.QueryRow(
		`SELECT packed_by_user_id FROM trip_items WHERE id = 'open'`,
	).Scan(&record); err != nil {
		t.Fatalf("read open row: %v", err)
	}
	if record.Valid {
		t.Errorf("unpacked row got a fabricated packing record: %q", record.String)
	}
}

// FR-25.17: the record's *when*, added by 020. Nullable on purpose —
// rows packed before the migration have a packer and no known moment,
// and the screen states the packer alone rather than inventing a time.
func TestMigrate_AddsPackedAtColumn_FR25_17(t *testing.T) {
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
