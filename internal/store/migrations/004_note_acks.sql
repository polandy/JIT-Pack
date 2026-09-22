-- 004 — FR-7.9: a per-person tick on a trip note.
--
-- A new table, not a column on `comments` — the comments explaining why live
-- in schema.sql (ADR-067 driver 4; the ADR is ADR-073).

CREATE TABLE note_acks (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    comment_id  TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    acked       INTEGER NOT NULL DEFAULT 1 CHECK (acked IN (0,1)),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (comment_id, user_id)
);
