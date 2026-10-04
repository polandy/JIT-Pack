-- 024 — FR-33.13: an ingredient is fresh or durable. Additive only; the
-- comment explaining the column lives in schema.sql (ADR-067 driver 4).

ALTER TABLE meal_ingredients ADD COLUMN fresh INTEGER CHECK (fresh IS NULL OR fresh IN (0, 1));
