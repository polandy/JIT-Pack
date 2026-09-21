-- 002 — FR-7.8: a task carries one tag of its own.
--
-- Two statements, and both are expressible against an existing database:
-- a new table costs nothing to add, and the column is nullable with no
-- default, which is what lets SQLite accept a REFERENCES clause on an
-- `ALTER TABLE ADD COLUMN` at all (the same rule 001 was built on).
--
-- The comments explaining *why* these exist live in schema.sql, which stays
-- the readable description of the database (ADR-067 driver 4).

CREATE TABLE task_tags (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    icon        TEXT CHECK (icon IS NULL OR length(icon) <= 32),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

ALTER TABLE comments ADD COLUMN task_tag_id TEXT REFERENCES task_tags(id) ON DELETE SET NULL;
