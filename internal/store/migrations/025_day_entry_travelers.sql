-- 025 — FR-29.15: whom a day-plan entry is for. Additive only; the comment
-- explaining the table lives in schema.sql (ADR-067 driver 4).

CREATE TABLE day_entry_travelers (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_entry_id TEXT NOT NULL REFERENCES day_entries(id) ON DELETE CASCADE,
    traveler_id  TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
    field_hlcs TEXT NOT NULL DEFAULT '{}',
    updated_hlc TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_day_entry_travelers_entry ON day_entry_travelers (day_entry_id);
