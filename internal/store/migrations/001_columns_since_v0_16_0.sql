-- 001 — everything schema.sql gained after the v0.16.0 baseline.
--
-- Six columns from three releases' worth of work (FR-24.15, FR-5.10, FR-7.7),
-- each nullable and without a default, which is what makes them expressible as
-- `ALTER TABLE ADD COLUMN` at all: SQLite refuses a REFERENCES clause on a
-- column whose default is anything but NULL, and refuses NOT NULL without one.
--
-- The comments explaining *why* each column exists live in schema.sql, which
-- stays the readable description of the database (ADR-067 driver 4). This file
-- says only what changed, for a database that already exists.

ALTER TABLE items ADD COLUMN merged_into_id TEXT REFERENCES items(id) ON DELETE SET NULL;  -- FR-24.15

ALTER TABLE template_tasks ADD COLUMN phase TEXT;                                          -- FR-7.7

ALTER TABLE trips ADD COLUMN packing_closed_at TEXT;                                       -- FR-5.10

ALTER TABLE comments ADD COLUMN phase TEXT;                                                -- FR-7.7
ALTER TABLE comments ADD COLUMN resolved_at TEXT;                                          -- FR-7.7
ALTER TABLE comments ADD COLUMN resolved_by_user_id TEXT REFERENCES users(id);             -- FR-7.7
