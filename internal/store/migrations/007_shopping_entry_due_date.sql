-- 007 — FR-30.10: a shopping entry may name the day it is due.
--
-- A nullable column: every entry written before it has no date, which is
-- what „no date" means. The comment explaining the shape lives in
-- schema.sql (ADR-067 driver 4).

ALTER TABLE shopping_entries ADD COLUMN due_date TEXT;
