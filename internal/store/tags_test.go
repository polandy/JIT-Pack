package store

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"jitpack/internal/sync"
)

// Migration 022 unparks §3.24's first half: a master item carries a *set*
// of tags instead of a single category (FR-24.1), and the first of them is
// the primary tag the inventory groups by (FR-24.2). See ADR-014 for why
// the category is replaced rather than kept alongside.
//
// What deliberately does not move: trip_items.category_name. It was always
// a denormalised snapshot of one grouping key, and one grouping key is
// exactly what a generated trip row still needs — from here it holds the
// primary tag at generation time.

// tableExists reports whether a table is present in the schema.
func tableExists(t *testing.T, db *sql.DB, table string) bool {
	t.Helper()
	var n int
	if err := db.QueryRow(
		`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, table,
	).Scan(&n); err != nil {
		t.Fatalf("look up table %s: %v", table, err)
	}
	return n > 0
}

// FR-24.1: the single category is gone from the item and replaced by a
// join table, so an item can sit on several axes at once.
func TestMigrate_ItemCarriesTagSetNotOneCategory_FR24_1(t *testing.T) {
	s := openTestStore(t)

	if columns(t, s.db, "items")["category_id"] {
		t.Error("items.category_id still exists — FR-24.1 replaces the single category with tags")
	}
	if tableExists(t, s.db, "categories") {
		t.Error("categories survived the rename to tags — two names for one concept")
	}
	if !tableExists(t, s.db, "tags") {
		t.Fatal("tags table missing")
	}

	cols := columns(t, s.db, "item_tags")
	for _, want := range []string{"id", "item_id", "tag_id", "position", "updated_hlc"} {
		if !cols[want] {
			t.Errorf("item_tags.%s missing — position carries the FR-24.2 primary tag", want)
		}
	}
}

// FR-24.2: an item appears once in the grouped inventory, under its
// primary tag — which is the tag at position 0.
func TestMigrate_ItemTagsAreUniquePerPair_FR24_2(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO tags (id, name) VALUES ('tag-kleidung', 'Kleidung')`)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-socken', 'Socken')`)
	mustExec(t, s, `INSERT INTO item_tags (id, item_id, tag_id, position) VALUES ('it-1', 'item-socken', 'tag-kleidung', 0)`)

	_, err := s.db.Exec(
		`INSERT INTO item_tags (id, item_id, tag_id, position) VALUES ('it-2', 'item-socken', 'tag-kleidung', 1)`)
	if err == nil {
		t.Error("the same tag was assigned twice to one item — it would render twice in M10")
	}
}

// Deleting an item takes its assignments with it; deleting a tag
// unassigns it everywhere rather than orphaning rows the inventory
// would then group under a missing name.
func TestMigrate_ItemTagsCascade_FR24_1(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO tags (id, name) VALUES ('tag-tech', 'Technik')`)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-kabel', 'Kabel')`)
	mustExec(t, s, `INSERT INTO item_tags (id, item_id, tag_id, position) VALUES ('it-1', 'item-kabel', 'tag-tech', 0)`)

	mustExec(t, s, `DELETE FROM tags WHERE id = 'tag-tech'`)

	var n int
	if err := s.db.QueryRow(`SELECT count(*) FROM item_tags WHERE item_id = 'item-kabel'`).Scan(&n); err != nil {
		t.Fatalf("count assignments: %v", err)
	}
	if n != 0 {
		t.Errorf("assignment survived its tag: %d rows left", n)
	}
}

// FR-16.3: with the category gone, the name alone identifies an item. The
// constraint is what the retired UNIQUE(name, category_id) became, and it
// is the reason importing two "Adapter" rows is a decision rather than a
// silent merge.
func TestSchema_ItemNameIsUniqueOnItsOwn_FR16_3(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO items (id, name) VALUES ('item-a', 'Adapter')`)

	if _, err := s.db.Exec(`INSERT INTO items (id, name) VALUES ('item-b', 'Adapter')`); err == nil {
		t.Fatal("a second item with the same name was accepted")
	}
}

// --- Sync (Sync-API Spec §4) ---

// FR-24.1: the column the tags replaced is not merely unused, it is
// rejected. A client still sending it is told, not silently ignored.
func TestPush_ItemCategoryID_IsNoLongerSyncable_FR24_1(t *testing.T) {
	s := openTestStore(t)

	_, err := s.ApplyMasterMutation(context.Background(), testUser, masterMut(
		sync.OpUpsert, "items", "item-1", "m1",
		map[string]any{"name": "Socken", "category_id": "cat-1"}, "1-0-a"))
	// The *whitelist* must be what refuses it. Asserting merely "some
	// error" would also pass on the SQL error a missing column raises
	// later, which is a different guarantee — the push would then depend
	// on the schema rather than on the gate in front of it.
	if !errors.Is(err, ErrUnknownColumn) {
		t.Fatalf("items.category_id was not rejected by the whitelist (FR-24.1): err = %v", err)
	}
}

// The assignment is master data like the item and the tag it joins, so it
// travels on the master partition and is visible instance-wide (FR-1.6 MVP).
func TestPush_ItemTag_RoundTripsThroughMasterPartition_FR24_1(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, "tags", "tag-1", "m1",
		map[string]any{"name": "Kleidung", "sort_order": 1}, "1-0-a"))
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, "items", "item-1", "m2",
		map[string]any{"name": "Socken"}, "2-0-a"))
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, "item_tags", "it-1", "m3",
		map[string]any{"item_id": "item-1", "tag_id": "tag-1", "position": 0}, "3-0-a"))

	page, err := s.PullMaster(ctx, testUser, 0, 100)
	if err != nil {
		t.Fatalf("PullMaster: %v", err)
	}
	var sawTag, sawAssignment bool
	for _, c := range page.Changes {
		switch c.Table {
		case "tags":
			sawTag = true
		case "item_tags":
			sawAssignment = true
		}
	}
	if !sawTag {
		t.Error("tags did not reach the master feed")
	}
	if !sawAssignment {
		t.Error("item_tags did not reach the master feed — the tag would arrive unassigned")
	}
}

// A FK cascade deletes rows the server never announced. Both ends of
// item_tags cascade, so both must arrive at the client as tombstones —
// otherwise a device keeps grouping an item under a tag that is gone, or
// keeps an assignment to an item that is gone.
func TestDeleteTag_TombstonesItsAssignments_FR24_1(t *testing.T) {
	assertCascadeTombstone(t, "tags", "tag-1")
}

func TestDeleteItem_TombstonesItsTagAssignments_FR24_1(t *testing.T) {
	assertCascadeTombstone(t, "items", "item-1")
}

// assertCascadeTombstone deletes one end of an assignment and asserts the
// assignment itself was announced as deleted on the master feed.
func assertCascadeTombstone(t *testing.T, table, id string) {
	t.Helper()
	s := openTestStore(t)
	ctx := context.Background()

	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, "tags", "tag-1", "m1",
		map[string]any{"name": "Technik"}, "1-0-a"))
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, "items", "item-1", "m2",
		map[string]any{"name": "Kabel"}, "2-0-a"))
	applyMaster(t, s, testUser, masterMut(sync.OpUpsert, "item_tags", "it-1", "m3",
		map[string]any{"item_id": "item-1", "tag_id": "tag-1", "position": 0}, "3-0-a"))

	// Everything above is already synced; only what the delete produces
	// should appear after this cursor.
	before, err := s.PullMaster(ctx, testUser, 0, 100)
	if err != nil {
		t.Fatalf("PullMaster: %v", err)
	}
	applyMaster(t, s, testUser, masterMut(sync.OpDelete, table, id, "m4", nil, "4-0-a"))

	after, err := s.PullMaster(ctx, testUser, before.NextCursor, 100)
	if err != nil {
		t.Fatalf("PullMaster after delete: %v", err)
	}
	for _, c := range after.Changes {
		if c.Table == "item_tags" && c.ID == "it-1" && c.Deleted {
			return
		}
	}
	t.Errorf("deleting %s left the assignment un-tombstoned — the client keeps a row the server cascaded away", table)
}

// The whitelist is the gate: an unknown column on a syncable table is
// rejected before any SQL is built.
func TestPush_ItemTag_RejectsUnknownColumn(t *testing.T) {
	s := openTestStore(t)

	_, err := s.ApplyMasterMutation(context.Background(), testUser, masterMut(
		sync.OpUpsert, "item_tags", "it-1", "m1",
		map[string]any{"item_id": "item-1", "tag_id": "tag-1", "colour": "peach"}, "1-0-a"))
	if !errors.Is(err, ErrUnknownColumn) {
		t.Fatalf("an unknown column on item_tags reached the SQL layer instead of the gate: err = %v", err)
	}
}
