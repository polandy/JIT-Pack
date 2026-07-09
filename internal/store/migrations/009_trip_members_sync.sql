-- 009: trip_members joins the master sync partition (FR-4.5/4.7, spec P-3)
--
-- The generic sync pipeline addresses rows by a single-column id and
-- merges via updated_hlc; the composite-PK table gets both. The natural
-- key stays enforced through UNIQUE (trip_id, user_id).
CREATE TABLE trip_members_new (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    role        TEXT NOT NULL DEFAULT 'editor'
                CHECK (role IN ('owner','admin','editor')),
    updated_hlc TEXT NOT NULL DEFAULT '',
    UNIQUE (trip_id, user_id)
);

INSERT INTO trip_members_new (trip_id, user_id, role)
SELECT trip_id, user_id, role FROM trip_members;

DROP TABLE trip_members;
ALTER TABLE trip_members_new RENAME TO trip_members;
