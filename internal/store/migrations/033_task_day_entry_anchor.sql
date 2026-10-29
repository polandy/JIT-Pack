-- 033 — FR-29.21: a task's due day may be a lead before a day-plan entry
-- (ADR-108's third anchor kind, 'entry'). The entry is named by a typed column
-- of its own, as the idea is by idea_id; a deleted entry clears it and leaves
-- an ordinary task. The comments explaining the column live in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE comments ADD COLUMN day_entry_id TEXT REFERENCES day_entries(id) ON DELETE SET NULL;
CREATE INDEX idx_comments_day_entry ON comments(day_entry_id);
