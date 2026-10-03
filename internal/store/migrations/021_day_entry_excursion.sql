-- 021 — FR-29.18: a connection names the excursion it belongs to. Additive only;
-- the comment explaining the column lives in schema.sql (ADR-067 driver 4).

ALTER TABLE day_entries ADD COLUMN excursion_id TEXT REFERENCES excursions(id) ON DELETE SET NULL;

-- An excursion's delete looks up its connections to unlink them.
CREATE INDEX idx_day_entries_excursion ON day_entries(excursion_id);
