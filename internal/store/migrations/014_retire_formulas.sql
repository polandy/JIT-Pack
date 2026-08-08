-- 014: Retire quantity formulas (FR-1.3/1.5 — owner decision 2026-08-08)
--
-- Quantities are plain integers now. template_items.quantity_formula becomes
-- quantity INTEGER NOT NULL DEFAULT 1; item_dependencies.quantity_formula
-- becomes quantity INTEGER (nullable = "same as 1"). Purely numeric formula
-- strings carry their value over; real formulas fold to 1 / NULL — the M3
-- step-4 quantity review is where trip-specific amounts are set from now on.
--
-- Same 12-step rebuild as 004/013 (SQLite cannot ALTER column types).

PRAGMA foreign_keys = OFF;

CREATE TABLE template_items_new (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    template_id      TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    item_id          TEXT NOT NULL REFERENCES items(id),
    quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    assignment       TEXT NOT NULL DEFAULT 'per_person'
                     CHECK (assignment IN ('per_person','trip_global')),     -- FR-1.4
    dedup            TEXT NOT NULL DEFAULT 'max' CHECK (dedup IN ('max','sum')), -- FR-2.3
    conditions       TEXT CHECK (conditions IS NULL OR json_valid(conditions)),  -- FR-15.2
    default_mode     TEXT NOT NULL DEFAULT 'pack'
                     CHECK (default_mode IN ('pack','buy_before','buy_local')),
    late_packer      INTEGER NOT NULL DEFAULT 0 CHECK (late_packer IN (0,1)),
    updated_hlc      TEXT NOT NULL DEFAULT '',
    UNIQUE (template_id, item_id)
);

INSERT INTO template_items_new (id, template_id, item_id, quantity, assignment, dedup, conditions, default_mode, late_packer, updated_hlc)
SELECT id, template_id, item_id,
       CASE WHEN quantity_formula GLOB '[0-9]*' AND NOT quantity_formula GLOB '*[^0-9]*'
            THEN CAST(quantity_formula AS INTEGER) ELSE 1 END,
       assignment, dedup, conditions, default_mode, late_packer, updated_hlc
FROM template_items;

DROP TABLE template_items;
ALTER TABLE template_items_new RENAME TO template_items;

CREATE TABLE item_dependencies_new (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    item_id            TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    depends_on_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    mode               TEXT NOT NULL DEFAULT 'required'
                       CHECK (mode IN ('required','suggested')),     -- FR-20.4
    quantity           INTEGER CHECK (quantity IS NULL OR quantity >= 0),
    updated_hlc        TEXT NOT NULL DEFAULT '',
    UNIQUE (item_id, depends_on_item_id),
    CHECK (item_id <> depends_on_item_id)
);

INSERT INTO item_dependencies_new (id, item_id, depends_on_item_id, mode, quantity, updated_hlc)
SELECT id, item_id, depends_on_item_id, mode,
       CASE WHEN quantity_formula IS NULL THEN NULL
            WHEN quantity_formula GLOB '[0-9]*' AND NOT quantity_formula GLOB '*[^0-9]*'
            THEN CAST(quantity_formula AS INTEGER) ELSE NULL END,
       updated_hlc
FROM item_dependencies;

DROP TABLE item_dependencies;
ALTER TABLE item_dependencies_new RENAME TO item_dependencies;
CREATE INDEX idx_item_dependencies_main ON item_dependencies (depends_on_item_id);

PRAGMA foreign_keys = ON;
