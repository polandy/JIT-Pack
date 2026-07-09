package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// M16 (FR-13.1/13.2): trip_series and destination_* join the master
// partition. Ownership follows the series chain: series by owner_id
// (stamped server-side), profiles via their series, checklist items via
// their profile's series.

func seedSeries(t *testing.T, s *Store) {
	t.Helper()
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trip_series", "ser-1", "ss-1",
		map[string]any{"name": "Samedan Sommer", "default_attributes": `{"season":"summer"}`},
		"0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "destination_profiles", "prof-1", "ss-2",
		map[string]any{"series_id": "ser-1", "notes": "Waschmaschine vorhanden"},
		"0000000001001-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "destination_checklist_items", "chk-1", "ss-3",
		map[string]any{"profile_id": "prof-1", "label": "Milch", "mode": "buy_local"},
		"0000000001002-0000-aaaaaaaa"))
}

func TestApplyMasterMutation_SeriesInsertStampsOwner(t *testing.T) {
	s := openTestStore(t)
	seedSeries(t, s)

	var owner string
	if err := s.db.QueryRow(`SELECT owner_id FROM trip_series WHERE id = 'ser-1'`).Scan(&owner); err != nil {
		t.Fatal(err)
	}
	if owner != testUser {
		t.Errorf("owner_id = %q, want %q (stamped server-side)", owner, testUser)
	}
	var notes string
	if err := s.db.QueryRow(`SELECT notes FROM destination_profiles WHERE id = 'prof-1'`).Scan(&notes); err != nil {
		t.Fatalf("profile insert by owner must apply: %v", err)
	}
	var label string
	if err := s.db.QueryRow(`SELECT label FROM destination_checklist_items WHERE id = 'chk-1'`).Scan(&label); err != nil {
		t.Fatalf("checklist insert by owner must apply: %v", err)
	}
}

func TestApplyMasterMutation_SeriesOwnershipEnforced(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedSeries(t, s)

	tests := []struct {
		name string
		m    sync.Mutation
	}{
		{"foreign series upsert", masterMut(sync.OpUpsert, "trip_series", "ser-1", "so-1",
			map[string]any{"name": "Gekapert"}, "0000000002000-0000-bbbbbbbb")},
		{"foreign series delete", masterMut(sync.OpDelete, "trip_series", "ser-1", "so-2", nil,
			"0000000002001-0000-bbbbbbbb")},
		{"foreign profile insert on foreign series", masterMut(sync.OpInsert, "destination_profiles", "prof-b", "so-3",
			map[string]any{"series_id": "ser-1", "notes": "hijack"}, "0000000002002-0000-bbbbbbbb")},
		{"foreign profile upsert", masterMut(sync.OpUpsert, "destination_profiles", "prof-1", "so-4",
			map[string]any{"notes": "hijack"}, "0000000002003-0000-bbbbbbbb")},
		{"foreign checklist insert", masterMut(sync.OpInsert, "destination_checklist_items", "chk-b", "so-5",
			map[string]any{"profile_id": "prof-1", "label": "hijack", "mode": "buy_local"},
			"0000000002004-0000-bbbbbbbb")},
		{"foreign checklist delete", masterMut(sync.OpDelete, "destination_checklist_items", "chk-1", "so-6", nil,
			"0000000002005-0000-bbbbbbbb")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := applyMaster(t, s, testUserB, tt.m)
			if res.Outcome != "rejected" {
				t.Errorf("outcome = %q, want rejected", res.Outcome)
			}
		})
	}
}

func TestPullMaster_SeriesVisibleOnlyToOwner(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedSeries(t, s)

	pull := func(userID string) map[string]bool {
		t.Helper()
		page, err := s.PullMaster(context.Background(), userID, 0, 100)
		if err != nil {
			t.Fatalf("PullMaster(%s): %v", userID, err)
		}
		got := map[string]bool{}
		for _, c := range page.Changes {
			got[c.Table+"/"+c.ID] = true
		}
		return got
	}

	gotA := pull(testUser)
	for _, id := range []string{"trip_series/ser-1", "destination_profiles/prof-1", "destination_checklist_items/chk-1"} {
		if !gotA[id] {
			t.Errorf("owner must see %s", id)
		}
	}
	gotB := pull(testUserB)
	for _, id := range []string{"trip_series/ser-1", "destination_profiles/prof-1", "destination_checklist_items/chk-1"} {
		if gotB[id] {
			t.Errorf("user B must not see %s", id)
		}
	}
}

// Deleting a series cascades its profile and the profile's checklist
// items (FKs); clients must learn about the whole cascade via tombstones.
func TestApplyMasterMutation_SeriesDeleteTombstonesCascade(t *testing.T) {
	s := openTestStore(t)
	seedSeries(t, s)

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, "trip_series", "ser-1", "sd-1", nil,
		"0000000003000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("owner series delete outcome = %q, want applied", res.Outcome)
	}

	for _, want := range []struct{ table, id string }{
		{"destination_profiles", "prof-1"},
		{"destination_checklist_items", "chk-1"},
	} {
		var n int
		err := s.db.QueryRow(`SELECT count(*) FROM change_log
			WHERE entity_table = ? AND entity_id = ? AND deleted = 1 AND trip_id IS NULL`,
			want.table, want.id).Scan(&n)
		if err != nil {
			t.Fatal(err)
		}
		if n != 1 {
			t.Errorf("%s/%s tombstones = %d, want 1", want.table, want.id, n)
		}
	}
}

// A series referenced by trips cannot be deleted (plain FK) — the client
// detaches trips first; the raw delete maps to rejected, not a 500.
func TestApplyMasterMutation_DeleteReferencedSeriesRejected(t *testing.T) {
	s := openTestStore(t)
	seedSeries(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "trips", "trip-ser", "sr-1",
		map[string]any{"name": "Engadin", "end_date": "2026-08-01", "series_id": "ser-1"},
		"0000000002000-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, "trip_series", "ser-1", "sr-2", nil,
		"0000000003000-0000-aaaaaaaa"))
	if res.Outcome != "rejected" {
		t.Errorf("outcome = %q, want rejected", res.Outcome)
	}
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM trip_series WHERE id = 'ser-1'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Error("series must survive the rejected delete")
	}
}
