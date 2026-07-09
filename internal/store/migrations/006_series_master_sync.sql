-- 006: Trip series & destination profiles join the master partition
-- (M16, FR-13.1/13.2). Same pattern as 005: the tables gain updated_hlc
-- so they participate in the LWW merge protocol (NFR-4.2a).

ALTER TABLE trip_series                 ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE destination_profiles        ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE destination_checklist_items ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
