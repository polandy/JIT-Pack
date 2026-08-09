-- 013: Retire the consumable feature (FR-1.7 — owner decision 2026-08-08)
--
-- Drops items.is_consumable and items.per_day_rate and narrows the unit
-- CHECK to pieces/pairs. Per-day consumption is expressed through quantity
-- formulas (FR-1.3, e.g. ceil(trip_duration / 7)) instead of a dedicated
-- item mechanism. Existing per_day rows fold to 'pieces'.
--
-- SQLite cannot ALTER column constraints; same 12-step rebuild as 004.

PRAGMA foreign_keys = OFF;

CREATE TABLE items_new (                          -- FR-1.1
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name          TEXT NOT NULL,
    category_id   TEXT REFERENCES categories(id),
    weight_grams  INTEGER CHECK (weight_grams >= 0),
    value_cents   INTEGER CHECK (value_cents  >= 0),
    unit          TEXT NOT NULL DEFAULT 'pieces'
                  CHECK (unit IN ('pieces','pairs')),                       -- FR-1.8
    created_by    TEXT REFERENCES users(id),
    updated_hlc   TEXT NOT NULL DEFAULT '',
    image_hash    TEXT,                           -- NULL = no photo (FR-22.1)
    UNIQUE (name, category_id)                    -- FR-16.3
);

INSERT INTO items_new (id, name, category_id, weight_grams, value_cents, unit, created_by, updated_hlc, image_hash)
SELECT id, name, category_id, weight_grams, value_cents,
       CASE WHEN unit = 'per_day' THEN 'pieces' ELSE unit END,
       created_by, updated_hlc, image_hash
FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

PRAGMA foreign_keys = ON;
