-- 010 — §3.29 slice 1: the planner's ideas, their votes and their discussion
-- (FR-29.1–29.4, ADR-078).
--
-- Three new tables in the trip partition. The comments explaining their
-- shape live in schema.sql (ADR-067 driver 4).

CREATE TABLE ideas (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    note        TEXT,
    link        TEXT CHECK (link IS NULL OR link LIKE 'http://%' OR link LIKE 'https://%'),
    tag         TEXT CHECK (tag IS NULL OR tag IN ('hiking','swimming','culture','food','outing')),
    rain_proof  INTEGER NOT NULL DEFAULT 0 CHECK (rain_proof IN (0,1)),
    state       TEXT NOT NULL DEFAULT 'idea'
                CHECK (state IN ('idea','shortlisted','done','dropped')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE idea_votes (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    idea_id     TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    vote        TEXT CHECK (vote IS NULL OR vote IN ('up','down')),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (idea_id, user_id)
);

CREATE TABLE idea_comments (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    idea_id     TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES users(id),
    body        TEXT NOT NULL,
    edited_at   TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_idea_comments_idea ON idea_comments (idea_id);
