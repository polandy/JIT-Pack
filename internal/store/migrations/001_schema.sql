-- ============================================================
-- JIT-Pack — SQLite Schema v0.4 (port of PostgreSQL v0.1)
-- Covers: Base PRD + Addendum v2.7
-- Porting notes:
--   * Postgres ENUMs      -> TEXT + CHECK constraints
--   * uuid/gen_random_uuid-> TEXT, default lower(hex(randomblob(16)))
--   * timestamptz          -> TEXT ISO-8601 UTC, default strftime
--   * jsonb                -> TEXT + json_valid() CHECK (JSON1)
--   * Requires: PRAGMA foreign_keys = ON; journal_mode = WAL
-- v0.4 changes: users.display_name gets a DB-level length CHECK (<=50,
--   charset validated in-app); matches FR-17.13.
-- v0.3 changes: users gains is_local_singleuser, avatar_image (BLOB,
--   100 KB hard cap via CHECK), avatar_mime (JPEG only) — Addendum
--   FR-17.2 / FR-17.13. oidc_subject is now nullable (NULL for the
--   Single-User Mode implicit user).
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------- Identity (Section 2: OIDC + JIT provisioning) ----------
CREATE TABLE users (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    oidc_subject         TEXT UNIQUE,           -- NULL for the Single-User Mode implicit user
    is_local_singleuser  INTEGER NOT NULL DEFAULT 0 CHECK (is_local_singleuser IN (0,1)), -- Addendum FR-17.2
    display_name         TEXT NOT NULL CHECK (length(display_name) <= 50), -- charset itself validated in-app (FR-17.13)
    email                TEXT,
    avatar_image         BLOB,                  -- Addendum FR-17.13: 256x256 JPEG, hard-capped below.
                                                 -- Deliberately a BLOB, not a file on disk: keeps the
                                                 -- single-file backup story of ADR-001 atomic (no avatar
                                                 -- can ever be out of sync with its row across a backup
                                                 -- or Litestream snapshot), avoids orphaned-file cleanup
                                                 -- on replace/delete, and at <=100 KB is within the size
                                                 -- range SQLite is documented to read faster than the
                                                 -- filesystem (avoids per-file open/seek overhead).
    avatar_mime          TEXT CHECK (avatar_mime IS NULL OR avatar_mime = 'image/jpeg'),
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (avatar_image IS NULL OR length(avatar_image) <= 102400), -- 100 KB hard limit, DB-enforced
    CHECK (avatar_image IS NULL OR avatar_mime IS NOT NULL),        -- image implies its mime is recorded
    CHECK (is_local_singleuser = 1 OR oidc_subject IS NOT NULL)     -- every non-local user has a subject
);

-- ---------- Master data (3.1) ----------
CREATE TABLE categories (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name       TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (                              -- FR-1.1
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name          TEXT NOT NULL,
    category_id   TEXT REFERENCES categories(id),
    weight_grams  INTEGER CHECK (weight_grams >= 0),
    value_cents   INTEGER CHECK (value_cents  >= 0),
    is_consumable INTEGER NOT NULL DEFAULT 0 CHECK (is_consumable IN (0,1)), -- FR-1.7
    unit          TEXT NOT NULL DEFAULT 'pieces'
                  CHECK (unit IN ('pieces','pairs','per_day')),              -- FR-1.8
    per_day_rate  REAL,
    created_by    TEXT REFERENCES users(id),
    UNIQUE (name, category_id)                    -- FR-16.3
);

-- ---------- Templates (3.1) ----------
CREATE TABLE templates (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id     TEXT NOT NULL REFERENCES users(id),      -- FR-1.6
    name         TEXT NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
    UNIQUE (owner_id, name)
);

CREATE TABLE template_items (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    template_id      TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    item_id          TEXT NOT NULL REFERENCES items(id),
    quantity_formula TEXT NOT NULL DEFAULT '1',           -- FR-1.3/1.5
    assignment       TEXT NOT NULL DEFAULT 'per_person'
                     CHECK (assignment IN ('per_person','trip_global')),     -- FR-1.4
    dedup            TEXT NOT NULL DEFAULT 'max' CHECK (dedup IN ('max','sum')), -- FR-2.3
    conditions       TEXT CHECK (conditions IS NULL OR json_valid(conditions)),  -- FR-15.2
    default_mode     TEXT NOT NULL DEFAULT 'pack'
                     CHECK (default_mode IN ('pack','buy_before','buy_local')),
    late_packer      INTEGER NOT NULL DEFAULT 0 CHECK (late_packer IN (0,1)),
    UNIQUE (template_id, item_id)
);

-- ---------- Series & destinations (3.13) ----------
CREATE TABLE trip_series (
    id       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id TEXT NOT NULL REFERENCES users(id),
    name     TEXT NOT NULL,
    default_attributes TEXT CHECK (default_attributes IS NULL OR json_valid(default_attributes)),
    UNIQUE (owner_id, name)
);

CREATE TABLE destination_profiles (               -- FR-13.2
    id        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    series_id TEXT NOT NULL UNIQUE REFERENCES trip_series(id) ON DELETE CASCADE,
    notes     TEXT
);

CREATE TABLE destination_checklist_items (        -- FR-13.3
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    profile_id TEXT NOT NULL REFERENCES destination_profiles(id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'buy_local'
               CHECK (mode IN ('pack','buy_before','buy_local'))
);

-- ---------- Trips (3.2) ----------
CREATE TABLE trips (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    series_id  TEXT REFERENCES trip_series(id),   -- FR-13.1
    name       TEXT NOT NULL,
    start_date TEXT NOT NULL,                     -- ISO date 'YYYY-MM-DD'
    end_date   TEXT NOT NULL CHECK (end_date >= start_date),
    duration_days INTEGER GENERATED ALWAYS AS
        (CAST(julianday(end_date) - julianday(start_date) AS INTEGER) + 1) STORED, -- FR-2.1
    status     TEXT NOT NULL DEFAULT 'planning'
               CHECK (status IN ('planning','active','repack','archived')), -- FR-11.1
    attributes TEXT CHECK (attributes IS NULL OR json_valid(attributes)),   -- FR-15.1
    imported   INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1))         -- FR-16.2
);

CREATE TABLE trip_members (                        -- FR-4.1/4.5
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    role    TEXT NOT NULL DEFAULT 'collaborator' CHECK (role IN ('owner','collaborator')),
    PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE travelers (                           -- FR-2.5
    id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id        TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    profile        TEXT NOT NULL DEFAULT 'adult' CHECK (profile IN ('adult','child')),
    linked_user_id TEXT REFERENCES users(id)
);

CREATE TABLE containers (                          -- FR-10.1
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id             TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    carrier_traveler_id TEXT REFERENCES travelers(id),
    max_weight_grams    INTEGER CHECK (max_weight_grams > 0),
    paired_container_id TEXT REFERENCES containers(id)   -- FR-10.3
);

-- ---------- Trip items: decoupled snapshot (FR-2.4) ----------
CREATE TABLE trip_items (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id              TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    source_item_id       TEXT REFERENCES items(id),
    source_template_id   TEXT REFERENCES templates(id),   -- FR-9.2
    name                 TEXT NOT NULL,
    weight_grams         INTEGER,
    value_cents          INTEGER,
    category_name        TEXT,
    quantity             INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),  -- 0 = skipped (FR-5.5)
    packed_count         INTEGER NOT NULL DEFAULT 0
                         CHECK (packed_count >= 0 AND packed_count <= quantity), -- FR-5.4
    state                TEXT NOT NULL DEFAULT 'open'
                         CHECK (state IN ('open','packing_now','partial','packed','skipped')),
    mode                 TEXT NOT NULL DEFAULT 'pack'
                         CHECK (mode IN ('pack','buy_before','buy_local')), -- FR-3.1/3.3
    late_packer          INTEGER NOT NULL DEFAULT 0 CHECK (late_packer IN (0,1)), -- FR-5.1
    assigned_traveler_id TEXT REFERENCES travelers(id),   -- FR-4.2 "Assigned to"
    packer_user_id       TEXT REFERENCES users(id),       -- FR-4.2 "Packed by"
    container_id         TEXT REFERENCES containers(id),  -- FR-10.2
    packing_now_by       TEXT REFERENCES users(id),       -- FR-5.3
    packing_now_at       TEXT,
    flag_unused          INTEGER NOT NULL DEFAULT 0 CHECK (flag_unused  IN (0,1)), -- FR-9.1
    flag_missing         INTEGER NOT NULL DEFAULT 0 CHECK (flag_missing IN (0,1)), -- FR-9.1
    outbound_packed      INTEGER CHECK (outbound_packed IN (0,1)),          -- FR-11.1
    updated_hlc          TEXT NOT NULL DEFAULT ''         -- NFR-4.2a
);
CREATE INDEX idx_trip_items_trip   ON trip_items (trip_id);
CREATE INDEX idx_trip_items_packer ON trip_items (packer_user_id) WHERE state <> 'packed'; -- FR-6.1
CREATE INDEX idx_trip_items_mode   ON trip_items (trip_id, mode);                          -- FR-3.2

-- ---------- Comments & tasks (3.7) ----------
CREATE TABLE comments (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_item_id TEXT REFERENCES trip_items(id) ON DELETE CASCADE,  -- NULL = trip-level
    author_id    TEXT NOT NULL REFERENCES users(id),
    body         TEXT NOT NULL,
    is_task      INTEGER NOT NULL DEFAULT 0 CHECK (is_task IN (0,1)),       -- FR-7.2
    task_state   TEXT CHECK (task_state IN ('open','resolved')),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (is_task = 0 OR task_state IS NOT NULL)
);

-- ---------- Notifications (3.6) ----------
CREATE TABLE notifications (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL,
    payload    TEXT NOT NULL CHECK (json_valid(payload)),          -- FR-6.3 deep link
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    read_at    TEXT
);

-- ---------- Offline sync (NFR-4.2a) ----------
CREATE TABLE conflict_log (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    entity_table  TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    field         TEXT NOT NULL,
    losing_value  TEXT,
    winning_value TEXT,
    resolved_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    reverted      INTEGER NOT NULL DEFAULT 0 CHECK (reverted IN (0,1))
);

-- Server-side change feed for the pull protocol: monotonically increasing
-- per-trip sequence the clients use as their sync cursor.
CREATE TABLE change_log (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    entity_table TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    deleted      INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),  -- tombstone
    hlc          TEXT NOT NULL
);
CREATE INDEX idx_change_log_trip ON change_log (trip_id, seq);

-- ---------- Historical insights (3.14) ----------
CREATE VIEW item_series_history AS
SELECT t.series_id,
       ti.source_item_id,
       ti.name,
       t.id            AS trip_id,
       t.name          AS trip_name,
       t.start_date,
       t.duration_days,
       ti.quantity,
       ti.flag_unused,
       ti.flag_missing
FROM trip_items ti
JOIN trips t ON t.id = ti.trip_id
WHERE t.status = 'archived' AND t.series_id IS NOT NULL;

-- ---------- Integrity triggers (sketch, migration 002) ----------
-- 1) FR-3.3: purchase flips buy_before -> pack
-- 2) FR-5.4: derive state from packed_count
-- 3) FR-7.2: block state='packed' while attached tasks are open
-- 4) FR-5.3: clear packing_now_by/at on terminal state
-- 5) change_log: AFTER INSERT/UPDATE/DELETE triggers on trip-scoped tables
