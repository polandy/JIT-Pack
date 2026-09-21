-- 003 — FR-30.9: a shopping entry carries one tag of its own.
--
-- One nullable column with no default, which is what SQLite accepts on an
-- `ALTER TABLE ADD COLUMN` (the same rule 001 was built on). The CHECK is
-- expressible too: it is a constraint on the column alone.
--
-- The comments explaining *why* live in schema.sql, which stays the readable
-- description of the database (ADR-067 driver 4).

ALTER TABLE shopping_entries ADD COLUMN tag TEXT CHECK (tag IS NULL OR (length(tag) BETWEEN 1 AND 40));
