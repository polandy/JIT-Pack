-- 015 — FR-32.1: who changed what, per trip and for the inventory.
--
-- Additive only; the comments explaining the table live in schema.sql
-- (ADR-067 driver 4). The log starts empty: nothing before this step
-- recorded who made a change.

CREATE TABLE activity_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id       TEXT REFERENCES trips(id) ON DELETE CASCADE,
    entity_table  TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    op            TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
    label         TEXT NOT NULL,
    subject       TEXT,
    changes       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(changes)),
    actor_user_id TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_activity_log_trip      ON activity_log (trip_id, id) WHERE trip_id IS NOT NULL;
CREATE INDEX idx_activity_log_inventory ON activity_log (id) WHERE trip_id IS NULL;
