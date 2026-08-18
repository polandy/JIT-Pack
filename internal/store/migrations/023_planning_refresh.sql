-- 023: The planning-trip refresh (FR-27.4)
--
-- While a trip is in `planning` status it follows the templates it was
-- generated from: added positions appear, removed ones disappear, quantity
-- and attribute changes land — with manual edits on the trip always winning.
-- The mechanism is a client-side re-resolution diff (invariant 4: generation
-- runs client-side, so Local Mode keeps the feature), and it needs three
-- facts the schema did not carry:
--
--   1. which templates a trip follows          -> trip_template_sources
--   2. what generation last produced per row   -> trip_generated_positions
--   3. what it changed, so nothing is silent   -> trip_applied_changes
--
-- Existing trips are deliberately not backfilled: a trip created before this
-- migration has no registered sources and therefore does not move. That is
-- the honest state — deriving sources from `trip_items.source_template_id`
-- would guess at rows the user may have deleted on purpose.

-- FR-27.4/27.10: the templates a trip follows, registered at generation and
-- when a whole group is added to a running trip. Deliberately not derived
-- from `trip_items.source_template_id`: a group whose positions were all
-- excluded by condition (FR-15.2) or deleted by hand contributes no row, and
-- deriving would drop it as a source — a position added to it later would
-- then never reach the trip.
--
-- Master partition (P-3), like `trips` and `trip_members`: the M8 blast-radius
-- note asks "which planning trips does this edit reach?" without any trip
-- partition being loaded.
CREATE TABLE trip_template_sources (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (trip_id, template_id)
);

CREATE INDEX idx_trip_template_sources_template ON trip_template_sources (template_id);

-- FR-27.4's "manual edits always win", made decidable. One row per generated
-- position, carrying what generation last produced for it. The diff reads it
-- three ways:
--
--   * row equals the snapshot            -> untouched, an update may land
--   * row differs from the snapshot      -> overridden by hand, leave it
--   * ledger entry with no row at all    -> deleted by hand, never re-add
--
-- The third case is why this is a table and not a column on `trip_items`: a
-- snapshot that dies with the row cannot tell "deleted on purpose" from
-- "never existed", and the deleted position would come back on the next open.
--
-- Keyed on (source_item_id, traveler_id) rather than on the source template:
-- that is exactly generateTripItems' own dedup key, so a position two groups
-- both carry (FR-27.2) is one ledger entry, not two. `source_template_id` is
-- an attribute of the entry — the first contributor, which the applied-changes
-- log names — not part of its identity.
--
-- traveler_id is '' for a trip-global position rather than NULL, so the UNIQUE
-- constraint actually constrains: SQLite treats NULLs as distinct.
CREATE TABLE trip_generated_positions (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id            TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    -- No FK: the row's *absence* is the signal that the user deleted it, and
    -- a cascade would erase the evidence along with the row.
    trip_item_id       TEXT NOT NULL,
    source_template_id TEXT NOT NULL,
    source_item_id     TEXT NOT NULL,
    traveler_id        TEXT NOT NULL DEFAULT '',
    -- The snapshot itself: the fields generation decides and propagation may
    -- therefore overwrite.
    name               TEXT NOT NULL,
    quantity           INTEGER NOT NULL,
    mode               TEXT NOT NULL,
    late_packer        INTEGER NOT NULL DEFAULT 0 CHECK (late_packer IN (0,1)),
    weight_grams       INTEGER,
    value_cents        INTEGER,
    category_name      TEXT,
    -- FR-27.7 preparation tasks as a JSON array of strings. One field on
    -- purpose: unlike `template_item_tasks`, nobody edits this concurrently —
    -- only the propagation writes it, and it is read as a whole.
    tasks              TEXT NOT NULL DEFAULT '[]'
                       CHECK (json_valid(tasks)),
    updated_hlc        TEXT NOT NULL DEFAULT '',
    UNIQUE (trip_id, source_item_id, traveler_id)
);

CREATE INDEX idx_trip_generated_positions_trip ON trip_generated_positions (trip_id);

-- FR-27.4: "applied changes are never silent". The log behind M2's
-- "⟳ N Änderungen aus Gruppen übernommen" chip — one row per change the
-- refresh made, naming the group it came from.
--
-- Master partition, like `trips`: M2 must render the chip without pulling
-- every trip's partition, and a change device A applied should show up on
-- device B's trip list without B ever opening the trip.
--
-- `source_template_name` is denormalised and `source_template_id` carries no
-- FK on purpose: the log is a record of what happened, and deleting the group
-- afterwards must not rewrite history into "3 changes from (unknown)".
CREATE TABLE trip_applied_changes (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id              TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    source_template_id   TEXT NOT NULL,
    source_template_name TEXT NOT NULL,
    kind                 TEXT NOT NULL CHECK (kind IN ('added','removed','changed')),
    item_name            TEXT NOT NULL,
    -- What changed, as JSON ({"field":"quantity","from":2,"to":3}) rather than
    -- as a sentence: the log is synced, and a sentence would freeze one
    -- language into the database — the view words it (i18n).
    detail               TEXT CHECK (detail IS NULL OR json_valid(detail)),
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_hlc          TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_trip_applied_changes_trip ON trip_applied_changes (trip_id, created_at);
