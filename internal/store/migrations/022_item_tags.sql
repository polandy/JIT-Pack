-- 022: An item carries a set of tags, not one category (§3.24, FR-24.1/24.2)
--
-- A swimsuit is Kleidung *and* Sommer *and* Strand. One mandatory category
-- forced a choice between those and threw away the filter reach the user
-- expects. From here the item carries a set; the tag at position 0 is its
-- *primary* tag, the single key the grouped inventory needs so a row
-- appears exactly once (FR-24.2).
--
-- `categories` is renamed rather than kept beside the new table: two names
-- for one concept is the thing that rots. The rename preserves ids, names
-- and sort_order, so an instance keeps its axis exactly as it was — see
-- ADR-014 for the options weighed and what this costs.
--
-- Deliberately NOT touched: trip_items.category_name. It was always a
-- denormalised snapshot of one grouping key, taken when the trip was
-- generated, and one grouping key is still what a trip row needs. From
-- here it holds the primary tag at generation time. Renaming it would
-- have rippled through M4, M12, analytics, export and the spreadsheet
-- import for no behaviour change.

PRAGMA foreign_keys = OFF;

-- ---------- 1. categories become tags ----------
-- The rename rewrites items.category_id's REFERENCES clause to point at
-- `tags`; that column is dropped in step 4 anyway.
ALTER TABLE categories RENAME TO tags;

-- ---------- 2. the assignment ----------
-- A row per (item, tag). Not a JSON array on the item: assignments are
-- added and removed independently, and field-level LWW merge (Sync-API §6)
-- would treat one blob as a single field and lose concurrent edits — the
-- same reasoning migration 016 applied to template_item_tasks.
CREATE TABLE item_tags (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id      TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    -- 0 = the primary tag (FR-24.2). An ordinary integer rather than a
    -- flag: "which one is primary" and "in what order do the rest read"
    -- are the same question, and a flag answers only half of it.
    position    INTEGER NOT NULL DEFAULT 0,
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (item_id, tag_id)
);

CREATE INDEX idx_item_tags_tag ON item_tags (tag_id);

-- The category an item already had becomes its primary tag, so the
-- inventory groups exactly as it did before the migration. An item that
-- had no category gains none: a tag nobody chose would file it under a
-- heading nobody chose.
INSERT INTO item_tags (item_id, tag_id, position, updated_hlc)
SELECT id, category_id, 0, '' FROM items WHERE category_id IS NOT NULL;

-- ---------- 3. one name, one item ----------
-- UNIQUE (name, category_id) allowed one "Adapter" per category. With the
-- category gone the name alone identifies an item, which is also what
-- FR-16.3's duplicate merge assumes. Colliding rows are *renamed*, never
-- dropped: archived trips reach them through trip_items.source_item_id,
-- and deleting one would cut a trip loose from its own history.
--
-- The collision set is materialised first — an UPDATE whose WHERE reads
-- the table it rewrites would see its own edits mid-statement.
CREATE TEMP TABLE colliding_items AS
SELECT i.id FROM items i
WHERE EXISTS (SELECT 1 FROM items o WHERE o.name = i.name AND o.id < i.id);

-- The old category is the most informative thing left to tell them apart.
UPDATE items
SET name = name || ' (' || COALESCE(
        (SELECT t.name FROM tags t WHERE t.id = items.category_id), 'ohne Tag') || ')'
WHERE id IN (SELECT id FROM colliding_items);

-- Rows that had *no* category could collide before 022 (SQLite treats
-- NULLs as distinct in a UNIQUE), so the suffix above may not separate
-- them. The id does, being unique by construction.
CREATE TEMP TABLE colliding_items_2 AS
SELECT i.id FROM items i
WHERE EXISTS (SELECT 1 FROM items o WHERE o.name = i.name AND o.id < i.id);

UPDATE items SET name = name || ' #' || id
WHERE id IN (SELECT id FROM colliding_items_2);

DROP TABLE colliding_items;
DROP TABLE colliding_items_2;

-- ---------- 4. the item loses its category ----------
-- Same 12-step rebuild as 013/014/015 — SQLite cannot drop a column that
-- carries a constraint, and the UNIQUE changes shape with it.
CREATE TABLE items_new (                          -- FR-1.1
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name          TEXT NOT NULL,
    weight_grams  INTEGER CHECK (weight_grams >= 0),
    value_cents   INTEGER CHECK (value_cents  >= 0),
    created_by    TEXT REFERENCES users(id),
    updated_hlc   TEXT NOT NULL DEFAULT '',
    image_hash    TEXT,                           -- NULL = no photo (FR-22.1)
    UNIQUE (name)                                 -- FR-16.3
);

INSERT INTO items_new (id, name, weight_grams, value_cents, created_by, updated_hlc, image_hash)
SELECT id, name, weight_grams, value_cents, created_by, updated_hlc, image_hash
FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

PRAGMA foreign_keys = ON;
