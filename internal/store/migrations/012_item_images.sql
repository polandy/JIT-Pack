-- 012: Item images / reference photos (Addendum 3.22, FR-22.1).
-- One optional photo per master item. The BLOB lives in a dedicated table
-- kept OUT of the sync envelope (ADR-002, like users.avatar_image): only a
-- lightweight items.image_hash flows through the master-partition feed so
-- other devices know a photo exists/changed without carrying its bytes.
-- The 150 KB cap (FR-22.4) and JPEG-only rule are enforced here as
-- defense-in-depth, independent of the client.

ALTER TABLE items ADD COLUMN image_hash TEXT;   -- NULL = no photo (FR-22.1)

CREATE TABLE item_images (
    item_id    TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    image      BLOB NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg'
               CHECK (mime = 'image/jpeg'),                 -- FR-22.4
    updated_at TEXT NOT NULL DEFAULT '',
    CHECK (length(image) <= 153600)                         -- FR-22.4: 150 KB
);
