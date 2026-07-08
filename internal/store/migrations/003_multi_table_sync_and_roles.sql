-- 003: Multi-table sync support + trip member roles (FR-4.5/4.7, FR-7.3)
--
-- 1. Add updated_hlc to trip-scoped tables so they can participate in
--    the LWW merge protocol (NFR-4.2a) via the generic sync pipeline.
-- 2. Expand trip_members.role to owner/admin/editor and record the
--    trip creator for immutable-owner enforcement (FR-4.7).

-- ---------- HLC columns for syncable tables ----------
ALTER TABLE travelers  ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE containers ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';
ALTER TABLE comments   ADD COLUMN updated_hlc TEXT NOT NULL DEFAULT '';

-- ---------- Trip creator tracking (FR-4.7) ----------
ALTER TABLE trips ADD COLUMN created_by TEXT REFERENCES users(id);

-- ---------- Expanded roles (FR-4.5) ----------
-- SQLite cannot ALTER CHECK constraints, so we recreate trip_members.
-- The new schema: owner (creator only), admin, editor (default).
CREATE TABLE trip_members_new (
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    role    TEXT NOT NULL DEFAULT 'editor'
            CHECK (role IN ('owner','admin','editor')),
    PRIMARY KEY (trip_id, user_id)
);

INSERT INTO trip_members_new (trip_id, user_id, role)
SELECT trip_id, user_id,
       CASE role WHEN 'owner' THEN 'owner'
                 ELSE 'editor'
       END
FROM trip_members;

DROP TABLE trip_members;
ALTER TABLE trip_members_new RENAME TO trip_members;
