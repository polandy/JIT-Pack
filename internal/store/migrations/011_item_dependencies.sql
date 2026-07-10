-- 011: Item dependencies / "companion items" (Addendum 3.20, FR-20.1).
-- A relation table analogous to template_items: one item can depend on
-- several others, and the relation carries its own attributes (mode,
-- optional quantity formula). Both FK endpoints cascade — a deleted item
-- takes its relations with it; the store tombstones them for clients.

CREATE TABLE item_dependencies (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    item_id            TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    depends_on_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    mode               TEXT NOT NULL DEFAULT 'required'
                       CHECK (mode IN ('required','suggested')),     -- FR-20.4
    quantity_formula   TEXT,                                          -- FR-1.3
    updated_hlc        TEXT NOT NULL DEFAULT '',
    UNIQUE (item_id, depends_on_item_id),
    CHECK (item_id <> depends_on_item_id)
);

CREATE INDEX idx_item_dependencies_main ON item_dependencies (depends_on_item_id);
