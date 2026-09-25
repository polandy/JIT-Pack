-- 006 — FR-7.13: trip notes become threads.
--
-- A reply names its thread's first note, a first note may carry a title, an
-- entry records when it was edited, and a tick records how far it reached.
-- Additive only; the comments explaining each column live in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN title TEXT;
ALTER TABLE comments ADD COLUMN edited_at TEXT;
ALTER TABLE note_acks ADD COLUMN seen_through TEXT;

CREATE INDEX idx_comments_parent ON comments(parent_id);
