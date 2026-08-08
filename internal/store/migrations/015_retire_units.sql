-- 015: Retire the quantity unit (FR-1.8 — owner decision 2026-08-08)
--
-- "Die Einheit braucht es nicht, wir haben nur Stück." Everything counts in
-- pieces; the unit column and its pieces/pairs distinction go away. Display
-- concern only — no data folds, the column is simply dropped.
--
-- Same 12-step rebuild as 004/013/014 (the CHECK sits on the column).

PRAGMA foreign_keys = OFF;

CREATE TABLE items_new (                          -- FR-1.1
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name          TEXT NOT NULL,
    category_id   TEXT REFERENCES categories(id),
    weight_grams  INTEGER CHECK (weight_grams >= 0),
    value_cents   INTEGER CHECK (value_cents  >= 0),
    created_by    TEXT REFERENCES users(id),
    updated_hlc   TEXT NOT NULL DEFAULT '',
    image_hash    TEXT,                           -- NULL = no photo (FR-22.1)
    UNIQUE (name, category_id)                    -- FR-16.3
);

INSERT INTO items_new (id, name, category_id, weight_grams, value_cents, created_by, updated_hlc, image_hash)
SELECT id, name, category_id, weight_grams, value_cents, created_by, updated_hlc, image_hash
FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

PRAGMA foreign_keys = ON;
