package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// Item-dependency sync tests (Addendum 3.20, FR-20.1): item_dependencies
// is a shared master-partition table like items — writable and visible
// to every authenticated user, cascaded when either endpoint item dies.

func seedDependencyItems(t *testing.T, s *Store) {
	t.Helper()
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-camera', 'Kamera')`)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-battery', 'Ersatzakku')`)
}

func TestApplyMasterMutation_ItemDependencyInsert(t *testing.T) {
	s := openTestStore(t)
	seedDependencyItems(t, s)

	res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, "item_dependencies", "dep-1", "dep-mm-1",
		map[string]any{
			"item_id": "item-battery", "depends_on_item_id": "item-camera",
			"mode": "required", "quantity_formula": "2",
		}, "0000000001000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("outcome = %q, want applied", res.Outcome)
	}

	var tripID any
	if err := s.db.QueryRow(`SELECT trip_id FROM change_log WHERE seq = ?`, res.Seq).Scan(&tripID); err != nil {
		t.Fatal(err)
	}
	if tripID != nil {
		t.Errorf("change_log.trip_id = %v, want NULL for master partition", tripID)
	}

	var mode, formula string
	err := s.db.QueryRow(`SELECT mode, quantity_formula FROM item_dependencies WHERE id = 'dep-1'`).Scan(&mode, &formula)
	if err != nil {
		t.Fatal(err)
	}
	if mode != "required" || formula != "2" {
		t.Errorf("persisted (mode, formula) = (%q, %q), want (required, 2)", mode, formula)
	}
}

func TestApplyMasterMutation_ItemDependencyConstraintsRejected(t *testing.T) {
	s := openTestStore(t)
	seedDependencyItems(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "item_dependencies", "dep-ok", "dep-cc-0",
		map[string]any{"item_id": "item-battery", "depends_on_item_id": "item-camera", "mode": "required"},
		"0000000001000-0000-aaaaaaaa"))

	tests := []struct {
		name   string
		fields map[string]any
	}{
		{"invalid mode", map[string]any{
			"item_id": "item-camera", "depends_on_item_id": "item-battery", "mode": "sometimes"}},
		{"self dependency", map[string]any{
			"item_id": "item-camera", "depends_on_item_id": "item-camera", "mode": "required"}},
		{"unknown item", map[string]any{
			"item_id": "item-battery", "depends_on_item_id": "item-ghost", "mode": "required"}},
		{"duplicate relation", map[string]any{
			"item_id": "item-battery", "depends_on_item_id": "item-camera", "mode": "suggested"}},
	}
	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := applyMaster(t, s, testUser, masterMut(sync.OpInsert, "item_dependencies",
				"dep-bad-"+tt.name, "dep-cc-"+string(rune('1'+i)), tt.fields, "0000000002000-0000-aaaaaaaa"))
			if res.Outcome != "rejected" {
				t.Errorf("outcome = %q, want rejected", res.Outcome)
			}
		})
	}
}

func TestApplyMasterMutation_ItemDeleteTombstonesDependencies(t *testing.T) {
	s := openTestStore(t)
	seedDependencyItems(t, s)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-charger', 'Ladegerät')`)
	// item-camera participates in both directions: battery depends on it,
	// and it depends on the charger.
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "item_dependencies", "dep-in", "dep-td-1",
		map[string]any{"item_id": "item-battery", "depends_on_item_id": "item-camera", "mode": "required"},
		"0000000001000-0000-aaaaaaaa"))
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "item_dependencies", "dep-out", "dep-td-2",
		map[string]any{"item_id": "item-camera", "depends_on_item_id": "item-charger", "mode": "suggested"},
		"0000000001001-0000-aaaaaaaa"))

	res := applyMaster(t, s, testUser, masterMut(sync.OpDelete, "items", "item-camera", "dep-td-3", nil,
		"0000000002000-0000-aaaaaaaa"))
	if res.Outcome != "applied" {
		t.Fatalf("outcome = %q, want applied", res.Outcome)
	}

	for _, id := range []string{"dep-in", "dep-out"} {
		var tombstones int
		err := s.db.QueryRow(`SELECT count(*) FROM change_log
			WHERE entity_table = 'item_dependencies' AND entity_id = ? AND deleted = 1 AND trip_id IS NULL`, id).Scan(&tombstones)
		if err != nil {
			t.Fatal(err)
		}
		if tombstones != 1 {
			t.Errorf("tombstones for %s = %d, want 1", id, tombstones)
		}
	}
	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM item_dependencies`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("surviving dependency rows = %d, want 0", n)
	}
}

func TestPullMaster_ItemDependenciesVisibleToAll(t *testing.T) {
	s := openTestStore(t)
	seedUserB(t, s)
	seedDependencyItems(t, s)
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, "item_dependencies", "dep-vis", "dep-pv-1",
		map[string]any{"item_id": "item-battery", "depends_on_item_id": "item-camera", "mode": "suggested"},
		"0000000001000-0000-aaaaaaaa"))

	page, err := s.PullMaster(context.Background(), testUserB, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range page.Changes {
		if c.Table == "item_dependencies" && c.ID == "dep-vis" {
			if c.Row["mode"] != "suggested" {
				t.Errorf("row mode = %v, want suggested", c.Row["mode"])
			}
			return
		}
	}
	t.Error("item_dependencies row not visible to another user")
}
