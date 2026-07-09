-- 005: Master-partition sync (Sync-API Spec §4/§5)
--
-- 1. Master tables gain updated_hlc so they participate in the LWW
--    merge protocol (NFR-4.2a) through the generic sync pipeline.
-- 2. change_log.trip_id and conflict_log.trip_id become nullable:
--    NULL marks a master-partition row (spec §4). SQLite cannot drop
--    NOT NULL, so both tables are rebuilt.

PRAGMA foreign_keys = OFF;

-- ---------- HLC columns for master tables ----------
ALTER TABLE categories     ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE items          ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE templates      ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE template_items ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE trips          ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';

-- ---------- change_log: nullable trip_id ----------
CREATE TABLE change_log_new (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id      TEXT REFERENCES trips(id) ON DELETE CASCADE,  -- NULL = master partition
    entity_table TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    deleted      INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
    hlc          TEXT NOT NULL
);

INSERT INTO change_log_new (seq, trip_id, entity_table, entity_id, deleted, hlc)
SELECT seq, trip_id, entity_table, entity_id, deleted, hlc FROM change_log;

DROP TABLE change_log;
ALTER TABLE change_log_new RENAME TO change_log;

CREATE INDEX idx_change_log_trip   ON change_log (trip_id, seq);
CREATE INDEX idx_change_log_master ON change_log (seq) WHERE trip_id IS NULL;

-- ---------- conflict_log: nullable trip_id ----------
CREATE TABLE conflict_log_new (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id       TEXT REFERENCES trips(id) ON DELETE CASCADE,  -- NULL = master partition
    entity_table  TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    field         TEXT NOT NULL,
    losing_value  TEXT,
    winning_value TEXT,
    resolved_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    reverted      INTEGER NOT NULL DEFAULT 0 CHECK (reverted IN (0,1))
);

INSERT INTO conflict_log_new (id, trip_id, entity_table, entity_id, field, losing_value, winning_value, resolved_at, reverted)
SELECT id, trip_id, entity_table, entity_id, field, losing_value, winning_value, resolved_at, reverted FROM conflict_log;

DROP TABLE conflict_log;
ALTER TABLE conflict_log_new RENAME TO conflict_log;

PRAGMA foreign_keys = ON;
