-- 022 — FR-29.18: a connection of an excursion is its way there or back.
-- Additive only; the comment explaining the column lives in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE day_entries ADD COLUMN excursion_role TEXT CHECK (excursion_role IS NULL OR excursion_role IN ('out', 'back'));
