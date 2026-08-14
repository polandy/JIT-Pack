-- 020: When a row was packed (FR-25.17)
--
-- Migration 019 gave the packing record a *who*; the revealed rows on M4
-- state "gepackt von Andy · heute 14:32", which needs a *when* as well.
-- It is written by stampActor with the record it belongs to and cleared
-- with it, so a time can never outlive the state it describes.
--
-- Deliberately not backfilled: rows packed before this migration have a
-- packer but no known moment, and inventing one would put a precise time
-- on the screen that nothing ever observed. The client renders the
-- packer alone where the time is missing.

ALTER TABLE trip_items ADD COLUMN packed_at TEXT;
