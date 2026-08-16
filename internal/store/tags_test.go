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

// migrateWithSeed stages a database one migration short of 022, runs seed
// against the old shape, then applies 022. It exists so the backfill is
// asserted against real rows rather than against the DDL.
func migrateWithSeed(t *testing.T, seed func(db *sql.DB)) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close staged db: %v", err)
		}
	})
	if err := migrateTo(db, 21); err != nil {
		t.Fatalf("migrate to 021: %v", err)
	}
	seed(db)
	if err := migrateTo(db, 22); err != nil {
		t.Fatalf("migrate to 022: %v", err)
	}
	return db
}

// The category an item already had is not thrown away — it becomes that
// item's primary tag, so the inventory groups exactly as it did before.
func TestMigrate022_OldCategoryBecomesThePrimaryTag_FR24_1(t *testing.T) {
	db := migrateWithSeed(t, func(db *sql.DB) {
		if _, err := db.Exec(`
			INSERT INTO categories (id, name, sort_order) VALUES ('cat-kleidung', 'Kleidung', 3);
			INSERT INTO items (id, name, category_id) VALUES ('item-shirt', 'Icebreaker', 'cat-kleidung');
			INSERT INTO items (id, name) VALUES ('item-lose', 'Ohne Kategorie')`); err != nil {
			t.Fatalf("seed pre-022 rows: %v", err)
		}
	})

	var tagName string
	var position int
	if err := db.QueryRow(`
		SELECT t.name, it.position FROM item_tags it
		JOIN tags t ON t.id = it.tag_id
		WHERE it.item_id = 'item-shirt'`).Scan(&tagName, &position); err != nil {
		t.Fatalf("the item lost its category instead of gaining a tag: %v", err)
	}
	if tagName != "Kleidung" {
		t.Errorf("primary tag = %q, want Kleidung", tagName)
	}
	if position != 0 {
		t.Errorf("backfilled tag sits at position %d, want 0 — FR-24.2 reads position 0 as primary", position)
	}

	// The tag's own attributes ride along; the rename is not a rebuild.
	var sortOrder int
	if err := db.QueryRow(`SELECT sort_order FROM tags WHERE id = 'cat-kleidung'`).Scan(&sortOrder); err != nil {
		t.Fatalf("read migrated tag: %v", err)
	}
	if sortOrder != 3 {
		t.Errorf("sort_order = %d, want 3 — the rename must not reset the axis order", sortOrder)
	}

	// An item that had no category gains no tag: inventing one would
	// file it under a heading nobody chose.
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM item_tags WHERE item_id = 'item-lose'`).Scan(&n); err != nil {
		t.Fatalf("count assignments: %v", err)
	}
	if n != 0 {
		t.Errorf("uncategorised item was given %d fabricated tags", n)
	}
}

// The old UNIQUE(name, category_id) allowed one name per category; with
// the category gone the name alone identifies an item (FR-16.3). Rows
// that collide are renamed, never dropped — trip history points at them
// through trip_items.source_item_id.
func TestMigrate022_RenamesCollidingItemsRatherThanLosingThem_FR16_3(t *testing.T) {
	db := migrateWithSeed(t, func(db *sql.DB) {
		if _, err := db.Exec(`
			INSERT INTO categories (id, name) VALUES ('cat-tech', 'Technik'), ('cat-velo', 'Velo');
			INSERT INTO items (id, name, category_id) VALUES
				('item-a', 'Adapter', 'cat-tech'),
				('item-b', 'Adapter', 'cat-velo');
			INSERT INTO trips (id, name, year) VALUES ('trip-hist', 'Samedan 2025', 2025);
			INSERT INTO trip_items (id, trip_id, name, source_item_id)
				VALUES ('ti-1', 'trip-hist', 'Adapter', 'item-b');`); err != nil {
			t.Fatalf("seed colliding rows: %v", err)
		}
	})

	names := map[string]string{}
	rows, err := db.Query(`SELECT id, name FROM items ORDER BY id`)
	if err != nil {
		t.Fatalf("read items: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			t.Fatalf("scan item: %v", err)
		}
		names[id] = name
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate items: %v", err)
	}

	if len(names) != 2 {
		t.Fatalf("collision resolved by deletion: %d items left, want 2 — trip history references them", len(names))
	}
	if names["item-a"] == names["item-b"] {
		t.Errorf("both items still named %q — UNIQUE(name) cannot hold", names["item-a"])
	}
	// The surviving names must still say what the item is.
	for id, name := range names {
		if len(name) < len("Adapter") || name[:len("Adapter")] != "Adapter" {
			t.Errorf("item %s renamed to %q — the original name must survive as its prefix", id, name)
		}
	}

	// The trip row still resolves to its master item.
	var src sql.NullString
	if err := db.QueryRow(`SELECT source_item_id FROM trip_items WHERE id = 'ti-1'`).Scan(&src); err != nil {
		t.Fatalf("read trip item: %v", err)
	}
	if src.String != "item-b" {
		t.Errorf("trip history detached from its item: source_item_id = %q", src.String)
	}
}

// Two uncategorised rows with the same name were legal before 022 (SQLite
// treats NULLs as distinct in a UNIQUE), so the suffix that separates them
// cannot be the category name — there is none.
func TestMigrate022_SeparatesCollidingItemsWithNoCategory_FR16_3(t *testing.T) {
	db := migrateWithSeed(t, func(db *sql.DB) {
		if _, err := db.Exec(`
			INSERT INTO items (id, name) VALUES ('item-x', 'Sackmesser'), ('item-y', 'Sackmesser')`); err != nil {
			t.Fatalf("seed uncategorised collision: %v", err)
		}
	})

	var n int
	if err := db.QueryRow(`SELECT count(DISTINCT name) FROM items`).Scan(&n); err != nil {
		t.Fatalf("count names: %v", err)
	}
	if n != 2 {
		t.Errorf("%d distinct names for 2 items — the rows were not separated", n)
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
