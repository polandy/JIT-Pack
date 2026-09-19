package store

import (
	"context"
	"database/sql"
	"testing"

	"jitpack/internal/sync"
)

// PruneMasterItem is FR-5.8's second half: a row taken off a packing list
// takes its inventory item along when nothing else uses it. The device asks
// because it cannot answer — in Server Mode it holds only the trips it has
// opened — so the server's answer must be the conservative one: a use found
// here keeps the item exactly as it was, never retired (ADR-065).

func seedLonelyItem(t *testing.T, s *Store, id string) {
	t.Helper()
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItems, id, "pi-"+id,
		map[string]any{"name": "Artikel " + id}, "0000000001000-0000-aaaaaaaa"))
}

func itemExists(t *testing.T, s *Store, id string) (exists, retired bool) {
	t.Helper()
	var marker sql.NullString
	err := s.db.QueryRowContext(context.Background(),
		`SELECT `+RetiredColumn+` FROM items WHERE id = ?`, id).Scan(&marker)
	if err == sql.ErrNoRows {
		return false, false
	}
	if err != nil {
		t.Fatalf("read item %s: %v", id, err)
	}
	return true, marker.Valid
}

func TestPruneMasterItem_NothingUsesIt_IsDeleted_FR5_8(t *testing.T) {
	s := openTestStore(t)
	seedLonelyItem(t, s, "it-lonely")

	res, err := s.PruneMasterItem(context.Background(), testUser, "it-lonely")
	if err != nil {
		t.Fatalf("PruneMasterItem: %v", err)
	}
	if !res.Pruned {
		t.Error("Pruned = false for an item nothing uses")
	}
	if res.Seq == 0 {
		t.Error("Seq = 0 — other devices would never learn the item is gone")
	}
	if exists, _ := itemExists(t, s, "it-lonely"); exists {
		t.Error("the item is still there")
	}
}

// The clause the endpoint exists for: FR-24.3 would answer a used item's
// delete by retiring it, which hides it from every inventory — on the word of
// a device that has not seen the trip still packing it.
func TestPruneMasterItem_StillUsed_IsKeptUntouchedAndNeverRetired_FR5_8(t *testing.T) {
	cases := []struct {
		name string
		seed func(t *testing.T, s *Store)
	}{
		{"a Vorlage position", func(t *testing.T, s *Store) {
			seedReferencedItem(t, s)
		}},
		{"a row on another trip", func(t *testing.T, s *Store) {
			seedLonelyItem(t, s, "it-1")
			row := upsert("ti-other", "pr-2", map[string]any{
				"trip_id": testTrip, "name": "Artikel it-1", "source_item_id": "it-1",
			}, "0000000001001-0000-aaaaaaaa")
			if _, err := s.ApplyMutation(context.Background(), testTrip, testUser, row); err != nil {
				t.Fatalf("seed trip row: %v", err)
			}
		}},
		{"another item bringing it as a companion", func(t *testing.T, s *Store) {
			seedLonelyItem(t, s, "it-1")
			seedLonelyItem(t, s, "it-main")
			applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItemDependencies, "dep-1", "pr-3",
				map[string]any{"item_id": "it-1", "depends_on_item_id": "it-main", "mode": "required"},
				"0000000001002-0000-aaaaaaaa"))
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := openTestStore(t)
			tc.seed(t, s)

			res, err := s.PruneMasterItem(context.Background(), testUser, "it-1")
			if err != nil {
				t.Fatalf("PruneMasterItem: %v", err)
			}
			if res.Pruned {
				t.Error("Pruned = true for an item something still uses")
			}
			if res.Seq != 0 {
				t.Errorf("Seq = %d — a kept item changed nothing and owes no feed entry", res.Seq)
			}
			exists, retired := itemExists(t, s, "it-1")
			if !exists {
				t.Fatal("the item was deleted")
			}
			if retired {
				t.Error("the item was retired — FR-24.3's answer, which hides it from the inventory")
			}
		})
	}
}

// The item's *own* companion list is part of it, not a use of it: it goes
// with it, the way FR-24.3's delete takes it. `depends_on_item_id` is the main
// item (FR-20.1), so this rule is it-1 bringing the battery.
func TestPruneMasterItem_ItsOwnCompanionRule_DoesNotKeepIt_FR5_8(t *testing.T) {
	s := openTestStore(t)
	seedLonelyItem(t, s, "it-1")
	seedLonelyItem(t, s, "it-battery")
	applyMaster(t, s, testUser, masterMut(sync.OpInsert, TableItemDependencies, "dep-1", "pr-4",
		map[string]any{"item_id": "it-battery", "depends_on_item_id": "it-1", "mode": "required"},
		"0000000001002-0000-aaaaaaaa"))

	res, err := s.PruneMasterItem(context.Background(), testUser, "it-1")
	if err != nil {
		t.Fatalf("PruneMasterItem: %v", err)
	}
	if !res.Pruned {
		t.Error("Pruned = false — the item's own rule kept it alive")
	}
	if exists, _ := itemExists(t, s, "it-battery"); !exists {
		t.Error("the companion went too — only the rule bringing it may")
	}
}

// Two devices can both let the same removal lapse; the second asks about an
// item the first already took. That is not an error the client could act on.
func TestPruneMasterItem_AlreadyGone_AnswersNotPruned_FR5_8(t *testing.T) {
	s := openTestStore(t)

	res, err := s.PruneMasterItem(context.Background(), testUser, "it-nowhere")
	if err != nil {
		t.Fatalf("PruneMasterItem: %v", err)
	}
	if res.Pruned || res.Seq != 0 {
		t.Errorf("result = %+v, want nothing pruned and nothing logged", res)
	}
}
