-- 029 — FR-7.18: a task's due day may carry the time its reminder arrives.
--
-- A nullable column: every task written before it has no time, which is
-- what „no time" means. The comment explaining the shape lives in
-- schema.sql (ADR-067 driver 4).

ALTER TABLE comments ADD COLUMN due_time TEXT;
