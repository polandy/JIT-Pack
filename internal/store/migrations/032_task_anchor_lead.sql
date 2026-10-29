-- 032 — FR-29.21, FR-13.4: a task's due day is a lead before an anchor
-- (ADR-108). The two per-anchor leads (lead_days before an idea's day,
-- start_lead_days before the trip's start) become one pair, anchor_kind and
-- anchor_lead_days; the anchor's row stays the typed column that already
-- names it (idea_id). The comments explaining the columns live in schema.sql
-- (ADR-067 driver 4).

ALTER TABLE comments ADD COLUMN anchor_kind TEXT;
ALTER TABLE comments ADD COLUMN anchor_lead_days INTEGER;

-- A series task first, as the due-day query read it: start_lead_days beat
-- lead_days when a row somehow carried both.
UPDATE comments
   SET anchor_kind = 'trip_start', anchor_lead_days = start_lead_days
 WHERE start_lead_days IS NOT NULL;
UPDATE comments
   SET anchor_kind = 'idea', anchor_lead_days = lead_days
 WHERE start_lead_days IS NULL AND lead_days IS NOT NULL AND idea_id IS NOT NULL;

-- Field-level LWW compares per-field clocks: the new fields inherit the old
-- ones', so a device that wrote the lead last still wins over an older write.
UPDATE comments
   SET field_hlcs = json_set(field_hlcs,
         '$.anchor_lead_days', COALESCE(json_extract(field_hlcs, '$.start_lead_days'), json_extract(field_hlcs, '$.lead_days')),
         '$.anchor_kind',      COALESCE(json_extract(field_hlcs, '$.start_lead_days'), json_extract(field_hlcs, '$.lead_days')))
 WHERE anchor_kind IS NOT NULL
   AND COALESCE(json_extract(field_hlcs, '$.start_lead_days'), json_extract(field_hlcs, '$.lead_days')) IS NOT NULL;

ALTER TABLE comments DROP COLUMN lead_days;
ALTER TABLE comments DROP COLUMN start_lead_days;
