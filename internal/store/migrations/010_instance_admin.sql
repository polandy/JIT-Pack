-- 010: Instance user management (Addendum 3.23, FR-23.1/23.3)
--
-- is_instance_admin is stamped on every login from JITPACK_ADMIN_EMAILS
-- (declarative, authoritative in both directions); deactivated_at NULL
-- means active — the timestamp doubles as audit info for the overview.
-- Neither column syncs: users is outside both sync partitions.
ALTER TABLE users ADD COLUMN is_instance_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_instance_admin IN (0,1));
ALTER TABLE users ADD COLUMN deactivated_at TEXT;
