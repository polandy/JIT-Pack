-- 011 — FR-29.5: pictures on an idea. The synced row and its bytes, in two
-- tables so the bytes stay outside the sync envelope (ADR-002). The comments
-- explaining their shape live in schema.sql (ADR-067 driver 4).

CREATE TABLE idea_images (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    idea_id     TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    image_hash  TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE idea_image_bytes (
    image_id   TEXT PRIMARY KEY REFERENCES idea_images(id) ON DELETE CASCADE,
    image      BLOB NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg' CHECK (mime = 'image/jpeg'),
    CHECK (length(image) <= 512000)
);

CREATE INDEX idx_idea_images_idea ON idea_images (idea_id);
