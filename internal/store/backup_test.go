package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// NFR-4.5 is a promise about everything the caller can see, and the export's
// hand-kept query list had fallen two tables behind the registry it mirrors:
// `item_dependencies` — the whole FR-20.1 graph — and `trip_members`, without
// which a restored trip has no roster and therefore no owner. Neither absence
// showed anywhere: the endpoint answered 200 with the other eighteen tables.
func TestExportFull_CarriesTheDependencyGraphAndTheRoster(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)

	// Andy's own trip: creating it makes him its Owner, which is the roster
	// row the backup owes.
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, "trip-andys", "bk-1",
		map[string]any{"name": "Engadin", "year": 2026}, "0000000001000-0000-aaaaaaaa"))
	// Berta's trip, which Andy is no member of, is the positive signal that
	// the roster is still filtered rather than merely present.
	applyMaster(t, s, testUserB, masterMut(sync.OpInsert, TableTrips, "trip-bertas", "bk-2",
		map[string]any{"name": "Wallis", "year": 2026}, "0000000001001-0000-bbbbbbbb"))

	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "item-tent", "bk-3",
		map[string]any{"name": "Zelt"}, "0000000002000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, "item-pegs", "bk-4",
		map[string]any{"name": "Heringe"}, "0000000002001-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItemDependencies, "dep-1", "bk-5",
		map[string]any{"item_id": "item-tent", "depends_on_item_id": "item-pegs", "mode": "required"},
		"0000000003000-0000-aaaaaaaa"))

	export, err := s.ExportFull(context.Background(), testUser)
	if err != nil {
		t.Fatalf("ExportFull: %v", err)
	}

	if got := len(export.Data[TableItemDependencies]); got != 1 {
		t.Errorf("export carries %d %s rows, want 1 — a restore without them loses every FR-20.1 relation",
			got, TableItemDependencies)
	}

	trips := map[string]bool{}
	for _, row := range export.Data[TableTripMembers] {
		id, _ := row["trip_id"].(string)
		trips[id] = true
	}
	if !trips["trip-andys"] {
		t.Errorf("export carries no roster row for the caller's own trip: %v", trips)
	}
	if trips["trip-bertas"] {
		t.Errorf("export leaks the roster of a trip the caller is no member of: %v", trips)
	}
}
