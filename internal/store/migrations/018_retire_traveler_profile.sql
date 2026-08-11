-- 018: Drop travelers.profile — the Adult/Child traveler type (FR-2.5)
--
-- FR-25.9 was removed on 2026-08-08 ("es gibt keine Unterscheidung von
-- Erwachsenen- und Kind-Mengen") and it was the only rule that ever read
-- the type. Unlike outbound_packed, which stays inert because nothing
-- asks for it, this field is on the sync whitelist and on a screen — a
-- question put to the user for nothing. So it goes.
--
-- DROP COLUMN carries the rows over untouched; the column's CHECK does
-- not block it, and no index, view or foreign key names it.

ALTER TABLE travelers DROP COLUMN profile;
