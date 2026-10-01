-- 018 — FR-29.18: a connection in the day plan, an entry of its own kind with
-- its legs and the link it was read from. Additive only; the comments
-- explaining the columns live in schema.sql (ADR-067 driver 4).

ALTER TABLE day_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'connection'));
ALTER TABLE day_entries ADD COLUMN link TEXT CHECK (link IS NULL OR link LIKE 'http://%' OR link LIKE 'https://%');
ALTER TABLE day_entries ADD COLUMN legs TEXT CHECK (legs IS NULL OR json_valid(legs));
