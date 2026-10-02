-- 020 — FR-29.13: an excursion, a task or a shopping entry names the idea it
-- was made from. Additive only; the comments explaining the columns live in
-- schema.sql (ADR-067 driver 4).

ALTER TABLE excursions ADD COLUMN idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL;
ALTER TABLE shopping_entries ADD COLUMN idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL;

-- An idea's delete looks up what came of it to unlink it.
CREATE INDEX idx_excursions_idea ON excursions(idea_id);
CREATE INDEX idx_comments_idea ON comments(idea_id);
CREATE INDEX idx_shopping_entries_idea ON shopping_entries(idea_id);
