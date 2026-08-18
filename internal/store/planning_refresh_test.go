package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// The FR-27.4 tables (migration 023) on the sync protocol: the registry and
// the applied-changes log travel the *master* partition and are trip-scoped,
// so every rule that guards `trips` has to guard them too — a non-member must
// neither write them nor see them. The ledger travels the trip partition.
//
// These are authorization and visibility paths, which CLAUDE.md requires
// covered on their failure side and not only their happy one: a leak here
// hands a stranger the shape of somebody's trip.

func sourceMut(op sync.Op, id, mutationID string, fields map[string]any, hlc string) sync.Mutation {
	return masterMut(op, TableTripTemplateSources, id, mutationID, fields, hlc)
}

func seedRefreshTrip(t *testing.T, s *Store, tripID string) {
	t.Helper()
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTrips, tripID, "pr-trip-"+tripID,
		map[string]any{"name": "Engadin", "year": 2026, "end_date": "2026-08-01", "status": "planning"},
		"0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTemplates, "grp-"+tripID, "pr-tpl-"+tripID,
		map[string]any{"name": "Makro", "kind": "group"},
		"0000000001001-0000-aaaaaaaa"))
}

func TestApplyMasterMutation_TripTemplateSourceRequiresMembership(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedRefreshTrip(t, s, "trip-src")

	fields := map[string]any{"trip_id": "trip-src", "template_id": "grp-trip-src"}

	// A stranger may not register what somebody else's trip follows.
	res := applyMaster(t, s, testUserB, sourceMut(sync.OpInsert, "src-1", "pr-1", fields,
		"0000000002000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("non-member insert outcome = %q, want rejected", res.Outcome)
	}

	// The trip's own member may: registering a source is a consequence of
	// ordinary editing, not administration (FR-27.4).
	res = applyMaster(t, s, testUser, sourceMut(sync.OpInsert, "src-2", "pr-2", fields,
		"0000000003000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("member insert outcome = %q, want applied", res.Outcome)
	}
}

func TestApplyMasterMutation_AppliedChangeRequiresMembership(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedRefreshTrip(t, s, "trip-log")

	fields := map[string]any{
		"trip_id":              "trip-log",
		"source_template_id":   "grp-trip-log",
		"source_template_name": "Makro",
		"kind":                 "added",
		"item_name":            "Stativ",
		"created_at":           "2026-08-18T10:00:00Z",
	}

	res := applyMaster(t, s, testUserB, masterMut(sync.OpInsert, TableTripAppliedChanges, "log-1", "pl-1",
		fields, "0000000002000-0000-bbbbbbbb"))
	if res.Outcome != "rejected" {
		t.Errorf("non-member log insert outcome = %q, want rejected", res.Outcome)
	}

	res = applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripAppliedChanges, "log-2", "pl-2",
		fields, "0000000003000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("member log insert outcome = %q, want applied", res.Outcome)
	}
}

func TestPullMaster_RefreshRowsInvisibleToNonMember(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedRefreshTrip(t, s, "trip-vis")

	applyMaster(t, s, testUser, sourceMut(sync.OpInsert, "src-vis", "pv-1",
		map[string]any{"trip_id": "trip-vis", "template_id": "grp-trip-vis"},
		"0000000004000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripAppliedChanges, "log-vis", "pv-2",
		map[string]any{
			"trip_id":              "trip-vis",
			"source_template_id":   "grp-trip-vis",
			"source_template_name": "Makro",
			"kind":                 "added",
			"item_name":            "Stativ",
			"created_at":           "2026-08-18T10:00:00Z",
		}, "0000000005000-0000-aaaaaaaa"))

	count := func(userID string) (sources, logs int) {
		t.Helper()
		page, err := s.PullMaster(context.Background(), userID, 0, 100)
		if err != nil {
			t.Fatalf("PullMaster(%s): %v", userID, err)
		}
		for _, c := range page.Changes {
			if c.Deleted {
				continue
			}
			switch c.Table {
			case TableTripTemplateSources:
				sources++
			case TableTripAppliedChanges:
				logs++
			}
		}
		return sources, logs
	}

	if gotSources, gotLogs := count(testUser); gotSources != 1 || gotLogs != 1 {
		t.Errorf("member sees %d sources / %d log rows, want 1 / 1", gotSources, gotLogs)
	}
	if gotSources, gotLogs := count(testUserB); gotSources != 0 || gotLogs != 0 {
		t.Errorf("non-member sees %d sources / %d log rows, want 0 / 0", gotSources, gotLogs)
	}
}

// A deleted template stops being a trip's source. Without the tombstone the
// client keeps re-resolving a group the server no longer has and reports its
// positions as removed on every open.
func TestApplyMasterMutation_DeletingTemplateTombstonesItsTripSources(t *testing.T) {
	s := openTestStore(t)
	seedRefreshTrip(t, s, "trip-casc")
	applyMaster(t, s, testUser, sourceMut(sync.OpInsert, "src-casc", "pc-1",
		map[string]any{"trip_id": "trip-casc", "template_id": "grp-trip-casc"},
		"0000000004000-0000-aaaaaaaa"))

	applyMaster(t, s, testUser, masterMut(sync.OpDelete, TableTemplates, "grp-trip-casc", "pc-2", nil,
		"0000000005000-0000-aaaaaaaa"))

	page, err := s.PullMaster(context.Background(), testUser, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	var tombstoned bool
	for _, c := range page.Changes {
		if c.Table == TableTripTemplateSources && c.ID == "src-casc" && c.Deleted {
			tombstoned = true
		}
	}
	if !tombstoned {
		t.Error("deleting the template did not tombstone the trip's source row")
	}
}

// The ledger is trip-partition state (P-3): pushing it at the master endpoint
// is a partition error, not a silent success into the wrong change feed.
func TestApplyMutation_LedgerBelongsToTheTripPartition(t *testing.T) {
	s := openTestStore(t)
	seedRefreshTrip(t, s, "trip-part")

	_, err := s.ApplyMasterMutation(context.Background(), testUser,
		masterMut(sync.OpInsert, TableTripGeneratedPositions, "led-1", "pp-1",
			map[string]any{"trip_id": "trip-part"}, "0000000004000-0000-aaaaaaaa"))
	if err == nil {
		t.Fatal("ledger accepted on the master partition, want ErrUnknownTable")
	}

	res, err := s.ApplyMutation(context.Background(), "trip-part",
		sync.Mutation{
			Op: sync.OpInsert, Table: TableTripGeneratedPositions, ID: "led-1", MutationID: "pp-2",
			HLC: "0000000005000-0000-aaaaaaaa",
			Fields: map[string]any{
				"trip_id": "trip-part", "trip_item_id": "ti-1",
				"source_template_id": "grp-trip-part", "source_item_id": "item-1",
				"traveler_id": "", "name": "Kamera", "quantity": 1,
				"mode": "pack", "late_packer": 0, "tasks": `["Akkus laden"]`,
			},
		})
	if err != nil {
		t.Fatalf("ledger on the trip partition: %v", err)
	}
	if res.Outcome != "applied" {
		t.Errorf("ledger outcome = %q, want applied", res.Outcome)
	}
}

// A restore that loses the ledger reads every existing row as a manual edit
// and every position as new — so the export has to carry all three tables.
func TestExportFull_CarriesThePlanningRefreshTables(t *testing.T) {
	s := openTestStore(t)
	seedRefreshTrip(t, s, "trip-exp")
	applyMaster(t, s, testUser, sourceMut(sync.OpInsert, "src-exp", "pe-1",
		map[string]any{"trip_id": "trip-exp", "template_id": "grp-trip-exp"},
		"0000000004000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableTripAppliedChanges, "log-exp", "pe-2",
		map[string]any{
			"trip_id":              "trip-exp",
			"source_template_id":   "grp-trip-exp",
			"source_template_name": "Makro",
			"kind":                 "added",
			"item_name":            "Stativ",
			"created_at":           "2026-08-18T10:00:00Z",
		}, "0000000005000-0000-aaaaaaaa"))
	if _, err := s.ApplyMutation(context.Background(), "trip-exp", sync.Mutation{
		Op: sync.OpInsert, Table: TableTripGeneratedPositions, ID: "led-exp", MutationID: "pe-3",
		HLC: "0000000006000-0000-aaaaaaaa",
		Fields: map[string]any{
			"trip_id": "trip-exp", "trip_item_id": "ti-1",
			"source_template_id": "grp-trip-exp", "source_item_id": "item-1",
			"traveler_id": "", "name": "Kamera", "quantity": 1,
			"mode": "pack", "late_packer": 0, "tasks": "[]",
		},
	}); err != nil {
		t.Fatal(err)
	}

	export, err := s.ExportFull(context.Background(), testUser)
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{
		TableTripTemplateSources, TableTripGeneratedPositions, TableTripAppliedChanges,
	} {
		if len(export.Data[table]) != 1 {
			t.Errorf("export carries %d %s rows, want 1", len(export.Data[table]), table)
		}
	}
}
