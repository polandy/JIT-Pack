-- 031 — FR-29.22: any number of links on an idea (ADR-107).
--
-- Additive only; the comments explaining the table and columns live in
-- schema.sql (ADR-067 driver 4).

CREATE TABLE idea_links (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    idea_id     TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    url         TEXT NOT NULL CHECK (url LIKE 'http://%' OR url LIKE 'https://%'),
    label       TEXT,
    position    INTEGER NOT NULL DEFAULT 1,
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_idea_links_idea ON idea_links (idea_id);

ALTER TABLE ideas ADD COLUMN link_label TEXT;
