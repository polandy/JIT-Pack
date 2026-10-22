-- 027 — FR-9.6: a row judged *zu viel* says how many were actually used.
--
-- Additive only; the comment explaining the column lives in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE trip_items ADD COLUMN needed_quantity INTEGER
    CHECK (needed_quantity IS NULL OR needed_quantity >= 1);
