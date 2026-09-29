-- 012 — FR-7.15: a trip note may name the excursion it is about.
--
-- Additive only; the comment explaining the column lives in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE comments ADD COLUMN excursion_id TEXT REFERENCES excursions(id) ON DELETE SET NULL;

-- An excursion's delete looks its notes up to unlink them.
CREATE INDEX idx_comments_excursion ON comments(excursion_id);
