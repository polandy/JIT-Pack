-- 009 — FR-31: excursions, a small packing list inside a trip (ADR-077).
--
-- Three new tables in the trip partition. The comments explaining their
-- shape live in schema.sql (ADR-067 driver 4).

CREATE TABLE excursions (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    starts_on   TEXT,
    ends_on     TEXT,
    source_template_id TEXT,
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE excursion_travelers (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    excursion_id TEXT NOT NULL REFERENCES excursions(id) ON DELETE CASCADE,
    traveler_id  TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE excursion_items (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id              TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    excursion_id         TEXT NOT NULL REFERENCES excursions(id) ON DELETE CASCADE,
    trip_item_id         TEXT REFERENCES trip_items(id) ON DELETE SET NULL,
    source_item_id       TEXT REFERENCES items(id),
    name                 TEXT NOT NULL,
    category_name        TEXT,
    assigned_traveler_id TEXT REFERENCES travelers(id) ON DELETE CASCADE,
    quantity             INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    packed_count         INTEGER NOT NULL DEFAULT 0
                         CHECK (packed_count >= 0 AND packed_count <= quantity),
    state                TEXT NOT NULL DEFAULT 'open'
                         CHECK (state IN ('open','partial','packed','skipped')),
    mode                 TEXT NOT NULL DEFAULT 'pack'
                         CHECK (mode IN ('pack','buy_local')),
    bought_at            TEXT,
    not_in_luggage       INTEGER NOT NULL DEFAULT 0 CHECK (not_in_luggage IN (0,1)),
    for_all_participants INTEGER NOT NULL DEFAULT 0 CHECK (for_all_participants IN (0,1)),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc          TEXT NOT NULL DEFAULT ''
);
