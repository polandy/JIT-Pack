-- JIT-Pack schema — the single, always-current definition of the database.
--
-- During the development phase there are no DDL migrations: a schema change
-- edits this file, and a database built against an older version of it is
-- rejected at Open with an instruction rather than upgraded (see the note on
-- invariant 2 in CLAUDE.md, which carries the trigger for when migrations
-- come back). PRAGMA user_version holds a fingerprint of this file, so
-- "older version of it" is a fact the code can check rather than a habit.
--
-- Ordering is for reading, not for correctness: SQLite resolves foreign keys
-- by name at write time, so a table may reference one defined further down.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

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
    notification_prefs   TEXT CHECK (notification_prefs IS NULL OR json_valid(notification_prefs)),
    is_instance_admin    INTEGER NOT NULL DEFAULT 0 CHECK (is_instance_admin IN (0,1)),
    deactivated_at       TEXT,
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (avatar_image IS NULL OR length(avatar_image) <= 102400), -- 100 KB hard limit, DB-enforced
    CHECK (avatar_image IS NULL OR avatar_mime IS NOT NULL),        -- image implies its mime is recorded
    CHECK (is_local_singleuser = 1 OR oidc_subject IS NOT NULL)     -- every non-local user has a subject
);

-- First-party sessions of the OIDC login broker (ADR-007).
CREATE TABLE sessions (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id),
    refresh_hash      TEXT NOT NULL UNIQUE,
    idp_refresh_token TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    refreshed_at      TEXT,
    expires_at        TEXT NOT NULL
);

CREATE TABLE server_keys (
    name  TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Inventory (master partition)
-- ---------------------------------------------------------------------------

CREATE TABLE items (                            -- FR-1.1
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name          TEXT NOT NULL,
    weight_grams  INTEGER CHECK (weight_grams >= 0),
    value_cents   INTEGER CHECK (value_cents  >= 0),
    created_by    TEXT REFERENCES users(id),
    image_hash    TEXT,                           -- NULL = no photo (FR-22.1)
    -- One optional emoji (FR-28.1). A length cap is the server's *only*
    -- validation: it treats the value as opaque text like a name, because
    -- Unicode adds emoji every year and a "is this really an emoji" table
    -- silently rejects next year's valid input (FR-28.9).
    icon          TEXT CHECK (icon IS NULL OR length(icon) <= 32),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc   TEXT NOT NULL DEFAULT '',
    UNIQUE (name)                                 -- FR-16.3
);

-- The bytes stay out of the sync envelope (ADR-002); only items.image_hash
-- flows through the master feed.
CREATE TABLE item_images (
    item_id    TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    image      BLOB NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg'
               CHECK (mime = 'image/jpeg'),                 -- FR-22.4
    updated_at TEXT NOT NULL DEFAULT '',
    CHECK (length(image) <= 153600)                         -- FR-22.4: 150 KB
);

CREATE TABLE tags (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE item_tags (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id      TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    -- 0 = the primary tag (FR-24.2). An ordinary integer rather than a
    -- flag: "which one is primary" and "in what order do the rest read"
    -- are the same question, and a flag answers only half of it.
    position    INTEGER NOT NULL DEFAULT 0,
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (item_id, tag_id)
);

CREATE TABLE item_dependencies (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    item_id            TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    depends_on_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    mode               TEXT NOT NULL DEFAULT 'required'
                       CHECK (mode IN ('required','suggested')),     -- FR-20.4
    quantity           INTEGER CHECK (quantity IS NULL OR quantity >= 0),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc        TEXT NOT NULL DEFAULT '',
    UNIQUE (item_id, depends_on_item_id),
    CHECK (item_id <> depends_on_item_id)
);

-- ---------------------------------------------------------------------------
-- Templates and groups (§3.27 composition)
-- ---------------------------------------------------------------------------

CREATE TABLE templates (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id     TEXT NOT NULL REFERENCES users(id),      -- FR-1.6
    name         TEXT NOT NULL,
    -- A group is a template with a different scope, not a second table:
    -- both resolve to items and both are included the same way (FR-27.1).
    kind         TEXT NOT NULL DEFAULT 'template'
                 CHECK (kind IN ('group','template')),
    is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
    icon         TEXT CHECK (icon IS NULL OR length(icon) <= 32),  -- FR-28.8
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc  TEXT NOT NULL DEFAULT '',
    -- Instance-wide, not per owner: under the FR-1.6 MVP simplification
    -- every account sees every template, so two same-named groups from two
    -- accounts are two rows nobody can tell apart — and FR-18.2/18.4 link
    -- an imported group *by name* across the whole instance. Same rule as
    -- items.name and tags.name.
    UNIQUE (name)
);

CREATE TABLE template_items (
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
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc      TEXT NOT NULL DEFAULT '',
    UNIQUE (template_id, item_id)
);

-- FR-27.7 preparation tasks on a template position; they materialise as
-- ordinary FR-7.3 todos on the rows a trip is generated from.
CREATE TABLE template_item_tasks (
    id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    template_item_id TEXT NOT NULL REFERENCES template_items(id) ON DELETE CASCADE,
    task             TEXT NOT NULL,
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc      TEXT NOT NULL DEFAULT ''
);

-- FR-27.2. Include order is derived at read time (`includedTemplatesOf`),
-- deliberately not stored: see the FR text for the rejected sort_order column.
CREATE TABLE template_includes (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    template_id          TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    included_template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc          TEXT NOT NULL DEFAULT '',
    UNIQUE (template_id, included_template_id),
    CHECK (template_id <> included_template_id)
);

-- ---------------------------------------------------------------------------
-- Trips (master partition)
-- ---------------------------------------------------------------------------

CREATE TABLE trip_series (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id           TEXT NOT NULL REFERENCES users(id),
    name               TEXT NOT NULL,
    default_attributes TEXT CHECK (default_attributes IS NULL OR json_valid(default_attributes)),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc        TEXT NOT NULL DEFAULT '',
    UNIQUE (name)                                        -- instance-wide, like templates.name (FR-13.1/FR-1.6)
);

CREATE TABLE trips (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    series_id  TEXT REFERENCES trip_series(id),
    name       TEXT NOT NULL,
    -- The one required temporal fact (FR-2.1b).
    year       INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2200),
    start_date TEXT,                                     -- optional since FR-2.1a
    end_date   TEXT,                                     -- optional since FR-2.1b
    duration_days INTEGER GENERATED ALWAYS AS (
        CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL
             THEN CAST(julianday(end_date) - julianday(start_date) AS INTEGER) + 1
             ELSE NULL
        END
    ) STORED,
    -- 'repack' is inert: the feature that used it was retired, and the value
    -- is kept so an existing row cannot become unreadable (FR-11.1).
    status     TEXT NOT NULL DEFAULT 'planning'
               CHECK (status IN ('planning','active','repack','archived')),
    attributes TEXT CHECK (attributes IS NULL OR json_valid(attributes)),
    imported   INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
    created_by TEXT REFERENCES users(id),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc TEXT NOT NULL DEFAULT '',
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE trip_members (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    role        TEXT NOT NULL DEFAULT 'editor'
                CHECK (role IN ('owner','admin','editor')),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (trip_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Trip partition
-- ---------------------------------------------------------------------------

CREATE TABLE travelers (                           -- FR-2.5
    id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id        TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    linked_user_id TEXT REFERENCES users(id),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE containers (                          -- FR-10.1
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id             TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    carrier_traveler_id TEXT REFERENCES travelers(id),
    max_weight_grams    INTEGER CHECK (max_weight_grams > 0),
    paired_container_id TEXT REFERENCES containers(id),  -- FR-10.3
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE trip_items (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id              TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    source_item_id       TEXT REFERENCES items(id),
    -- NULL for an FR-27.3 single item: FR-27.4 and FR-27.5 both read this
    -- provenance, and a single item has none.
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
    -- Which shopping list the row was bought from (FR-25.11j). Buying a
    -- BUY_BEFORE row *changes* its mode (FR-3.3), so without this record the
    -- row is gone from the shopping side and the purchase cannot be undone.
    -- Deliberately nullable and independent of `mode`: field-level LWW merges
    -- fields one at a time (NFR-4.2a), so a NOT NULL, or a CHECK tying the two
    -- together, would refuse an ordinary single-field mutation — and a
    -- rejected mutation leaves the outbox, taking the user's change with it.
    -- Same vocabulary as `mode`, because the value is one.
    bought_from          TEXT CHECK (bought_from IN ('pack','buy_before','buy_local')), -- FR-25.11j
    late_packer          INTEGER NOT NULL DEFAULT 0 CHECK (late_packer IN (0,1)), -- FR-5.1
    assigned_traveler_id TEXT REFERENCES travelers(id),   -- FR-4.2 "Assigned to"
    -- Since FR-25.19 this is the *assignment*; packed_by_user_id below is the
    -- record of who actually packed it, and only the server may stamp that
    -- one (invariant 3).
    packer_user_id       TEXT REFERENCES users(id),
    packed_by_user_id    TEXT REFERENCES users(id),       -- FR-25.19
    packed_at            TEXT,                            -- FR-25.17
    container_id         TEXT REFERENCES containers(id),  -- FR-10.2
    packing_now_by       TEXT REFERENCES users(id),       -- FR-5.3
    packing_now_at       TEXT,
    flag_unused          INTEGER NOT NULL DEFAULT 0 CHECK (flag_unused  IN (0,1)), -- FR-9.1
    flag_missing         INTEGER NOT NULL DEFAULT 0 CHECK (flag_missing IN (0,1)), -- FR-9.1
    -- Inert, like trips.status 'repack': the outbound/return split was
    -- retired, and the column is kept so existing rows stay readable.
    outbound_packed      INTEGER CHECK (outbound_packed IN (0,1)),          -- FR-11.1
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc          TEXT NOT NULL DEFAULT ''         -- NFR-4.2a
);

CREATE TABLE comments (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_item_id TEXT REFERENCES trip_items(id) ON DELETE CASCADE,  -- NULL = trip-level
    author_id    TEXT NOT NULL REFERENCES users(id),
    body         TEXT NOT NULL,
    is_task      INTEGER NOT NULL DEFAULT 0 CHECK (is_task IN (0,1)),       -- FR-7.2
    task_state   TEXT CHECK (task_state IN ('open','resolved')),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc  TEXT NOT NULL DEFAULT '',
    CHECK (is_task = 0 OR task_state IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- FR-27.4 planning refresh (ADR-016)
-- ---------------------------------------------------------------------------

-- Which templates a trip was generated from, so a change to one of them can
-- find the trips that follow it.
CREATE TABLE trip_template_sources (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (trip_id, template_id)
);

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
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc        TEXT NOT NULL DEFAULT '',
    UNIQUE (trip_id, source_item_id, traveler_id)
);

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
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc          TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Destination profiles (FR-13)
-- ---------------------------------------------------------------------------

CREATE TABLE destination_profiles (               -- FR-13.2
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    series_id   TEXT NOT NULL UNIQUE REFERENCES trip_series(id) ON DELETE CASCADE,
    notes       TEXT,
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE destination_checklist_items (        -- FR-13.3
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    profile_id  TEXT NOT NULL REFERENCES destination_profiles(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    mode        TEXT NOT NULL DEFAULT 'buy_local'
                CHECK (mode IN ('pack','buy_before','buy_local')),
    field_hlcs TEXT NOT NULL DEFAULT '{}',  -- per-field HLC record (NFR-4.2a field-level LWW, ADR-022)
    updated_hlc TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Notifications (FR-6)
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL,
    payload    TEXT NOT NULL CHECK (json_valid(payload)),          -- FR-6.3 deep link
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    read_at    TEXT
);

CREATE TABLE push_subscriptions (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id    TEXT NOT NULL REFERENCES users(id),
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ---------------------------------------------------------------------------
-- Sync plumbing (NFR-4.2a, Sync_API_Spec)
-- ---------------------------------------------------------------------------

CREATE TABLE change_log (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id      TEXT REFERENCES trips(id) ON DELETE CASCADE,  -- NULL = master partition
    entity_table TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    deleted      INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
    hlc          TEXT NOT NULL
);

CREATE TABLE conflict_log (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id       TEXT REFERENCES trips(id) ON DELETE CASCADE,  -- NULL = master partition
    entity_table  TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    field         TEXT NOT NULL,
    losing_value  TEXT,
    winning_value TEXT,
    -- The push that lost, and who pushed it: the mutation groups the
    -- entries one revert restores together (state+packed_count), the
    -- actor is the person to tell (NFR-4.2a audit and revert).
    mutation_id   TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    resolved_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    reverted      INTEGER NOT NULL DEFAULT 0 CHECK (reverted IN (0,1))
);

-- Who took a packing claim from whom (FR-5.7). Its own table beside
-- conflict_log rather than a row in it (ADR-028): that one holds merge
-- losers, and one table for two unrelated kinds of event is how a log
-- stops being readable. item_name is stored rather than joined so the
-- record stays readable after the row it names is deleted.
CREATE TABLE lock_events (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_item_id TEXT NOT NULL,
    item_name    TEXT NOT NULL,
    from_user_id TEXT NOT NULL REFERENCES users(id),
    to_user_id   TEXT NOT NULL REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Idempotency memo of the push endpoint.
CREATE TABLE mutations (
    mutation_id TEXT PRIMARY KEY,
    outcome     TEXT NOT NULL,
    conflicts   TEXT,              -- JSON array of dropped fields
    seq         INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_change_log_master ON change_log (seq) WHERE trip_id IS NULL;
CREATE INDEX idx_change_log_trip   ON change_log (trip_id, seq);
-- The two hot conflict_log queries: the per-partition listing (trip_id = ?
-- for a trip, IS NULL for the master half, newest first) and the revert's
-- lookup of everything one push lost together.
CREATE INDEX idx_conflict_log_partition ON conflict_log (trip_id, resolved_at DESC, id);
CREATE INDEX idx_conflict_log_mutation  ON conflict_log (mutation_id, entity_table, entity_id);
CREATE INDEX idx_item_dependencies_main ON item_dependencies (depends_on_item_id);
CREATE INDEX idx_item_tags_tag ON item_tags (tag_id);
CREATE INDEX idx_lock_events_trip ON lock_events (trip_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_template_includes_included ON template_includes (included_template_id);
CREATE INDEX idx_template_item_tasks_position ON template_item_tasks (template_item_id);
CREATE INDEX idx_trip_applied_changes_trip ON trip_applied_changes (trip_id, created_at);
CREATE INDEX idx_trip_generated_positions_trip ON trip_generated_positions (trip_id);
CREATE INDEX idx_trip_items_trip   ON trip_items (trip_id);
-- FR-4.5: a trip has exactly one Owner. No client can reach the role
-- (authorizeMaster refuses every client-sent 'owner' and freezes the
-- creator's row), so this index can only ever catch a server bug — which
-- is what it is for.
CREATE UNIQUE INDEX idx_trip_members_owner ON trip_members (trip_id) WHERE role = 'owner';
CREATE INDEX idx_trip_template_sources_template ON trip_template_sources (template_id);
