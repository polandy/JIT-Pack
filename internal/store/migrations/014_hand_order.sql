-- 014 — FR-30.13/FR-7.17: a shopping line and a task stand where a person put
-- them inside their group.
--
-- Additive only; the comments explaining the columns live in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE shopping_entries ADD COLUMN position INTEGER;
ALTER TABLE comments ADD COLUMN position INTEGER;
ALTER TABLE trip_items ADD COLUMN shopping_position INTEGER;
ALTER TABLE excursion_items ADD COLUMN shopping_position INTEGER;
