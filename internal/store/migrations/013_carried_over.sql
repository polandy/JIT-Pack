-- 013 — FR-7.16: what closing the packing carried from *before departure* to
-- *at the destination* says so, on a packing row and on a shopping entry.
--
-- Additive only; the comments explaining the columns live in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE trip_items ADD COLUMN carried_over_at TEXT;
ALTER TABLE shopping_entries ADD COLUMN carried_over_at TEXT;
