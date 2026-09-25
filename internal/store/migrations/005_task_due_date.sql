-- 005 — FR-7.11: a task may name the day it is due.
--
-- A nullable column: every task written before it has no date, which is
-- what „no date" means. The comment explaining the shape lives in
-- schema.sql (ADR-067 driver 4).

ALTER TABLE comments ADD COLUMN due_date TEXT;
