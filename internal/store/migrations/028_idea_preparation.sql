-- 028 — FR-29.21: an idea's preparation step is a trip task due its lead before the idea's day.
--
-- Additive only; the comment explaining the column lives in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE comments ADD COLUMN lead_days INTEGER;
