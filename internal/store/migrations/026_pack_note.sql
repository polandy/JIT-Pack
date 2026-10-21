-- 026 — FR-25.33: a row says what exactly went in.
--
-- Additive only; the comment explaining the column lives in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE trip_items ADD COLUMN pack_note TEXT
    CHECK (pack_note IS NULL OR (length(pack_note) BETWEEN 1 AND 60));
