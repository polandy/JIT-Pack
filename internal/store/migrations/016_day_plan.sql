-- 016 — FR-29.14/FR-29.15: an idea planned on a day, and the day plan's own
-- entries. Additive only; the comments explaining the columns live in
-- schema.sql (ADR-067 driver 4).

ALTER TABLE ideas ADD COLUMN planned_on TEXT;
ALTER TABLE ideas ADD COLUMN planned_at TEXT;

CREATE TABLE day_entries (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES users(id),
    on_date     TEXT NOT NULL,
    at_time     TEXT,
    title       TEXT NOT NULL,
    note        TEXT,
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_day_entries_trip ON day_entries (trip_id, on_date);
