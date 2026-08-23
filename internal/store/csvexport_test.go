package store_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
)

// NFR-4.5: the flat dump resolves traveler and container to *names*, because
// the file is read by a person in a spreadsheet and internal ids are noise.
func TestTripCSVRows_ResolvesTravelerAndContainerNames(t *testing.T) {
	st := openTestStore(t)
	for _, q := range []string{
		`INSERT INTO trips (id, name, year) VALUES ('t1', 'Samedan', 2026)`,
		`INSERT INTO travelers (id, trip_id, name) VALUES ('tr1', 't1', 'Andy')`,
		`INSERT INTO containers (id, trip_id, name) VALUES ('c1', 't1', 'Rucksack')`,
		`INSERT INTO trip_items (id, trip_id, name, category_name, quantity, packed_count, mode,
		                         assigned_traveler_id, container_id)
		 VALUES ('x1', 't1', 'Socken', 'Kleidung', 6, 2, 'pack', 'tr1', 'c1')`,
		// A row assigned to nobody must come back with empty names, not a
		// dropped line — a LEFT JOIN is the whole reason this is one query.
		`INSERT INTO trip_items (id, trip_id, name, quantity) VALUES ('x2', 't1', 'Apotheke', 1)`,
	} {
		if _, err := st.DB().Exec(q); err != nil {
			t.Fatalf("seed %q: %v", q, err)
		}
	}

	rows, err := st.TripCSVRows(context.Background(), "t1")
	if err != nil {
		t.Fatalf("TripCSVRows: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}
	// Ordered by name: Apotheke before Socken.
	if rows[0].Name != "Apotheke" || rows[0].Traveler != "" || rows[0].Container != "" {
		t.Errorf("unassigned row = %+v", rows[0])
	}
	got := rows[1]
	if got.Name != "Socken" || got.Category != "Kleidung" || got.Quantity != 6 || got.PackedCount != 2 {
		t.Errorf("row = %+v", got)
	}
	if got.Traveler != "Andy" || got.Container != "Rucksack" {
		t.Errorf("traveler/container = %q/%q, want Andy/Rucksack", got.Traveler, got.Container)
	}
}

// A trip that is not there is not an empty trip: the caller has to be able to
// tell "no rows" from "no such trip".
func TestTripCSVRows_UnknownTrip_IsNotAnEmptyList(t *testing.T) {
	st := openTestStore(t)
	_, err := st.TripCSVRows(context.Background(), "nope")
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("err = %v, want sql.ErrNoRows", err)
	}
}
