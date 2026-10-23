-- 030 — FR-13.4: a series carries tasks for every trip in it (ADR-106).
--
-- Additive only; the comments explaining the table and columns live in
-- schema.sql (ADR-067 driver 4).

CREATE TABLE destination_tasks (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    profile_id  TEXT NOT NULL REFERENCES destination_profiles(id) ON DELETE CASCADE,
    task        TEXT NOT NULL,
    lead_days   INTEGER,
    assignee_user_id TEXT REFERENCES users(id),
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

ALTER TABLE comments ADD COLUMN start_lead_days INTEGER;
ALTER TABLE comments ADD COLUMN destination_task_id TEXT REFERENCES destination_tasks(id) ON DELETE SET NULL;
