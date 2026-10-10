# M30 — Aktivität (Activity Log, §3.32) — *built*

* **What it is:** who changed what, newest first (Addendum §3.32, ADR-084). One screen, two logs: a trip's
  (`/trips/:id/activity`, the page head's meta line names the trip, back is M4) and the inventory's
  (`/items/activity`, titled *„Aktivität · Inventar"*, back is M9).
* **Where it lives:** the last word in M4's ⋮, *„Aktivität"* (`m4-activity`, glyph `timeOutline`), and in M9's ⋮
  (`m9-activity`). Only M4 carries the trip's: the other trip views keep a ⋮ only for their own context (ADR-051
  amendment 2). **Local Mode offers neither** (G-8), and a typed `/trips/:id/activity` or `/items/activity` lands on
  M4 or M9 there (UX-21) — the empty state below speaks of the server because only a server ever shows it.
* **The list:** a section per day (`activity-day`), headed *Heute*, *Gestern*, then the date, each day's lines one
  card. A line (`activity-row`, `data-kind` the act) carries the act's glyph; the thing's name, or the first three
  names and *„+N"* for a folded line (`activity-title`); the act and the part of the app — *„3× eingepackt ·
  Packliste"*, with *„in „…""* naming what a single line's row belongs to (`activity-what`); for a *geändert* line the
  fields before → after, *„Menge: 2 → 3"* (`activity-detail`); and at the end the person and the time, a run as
  *from–to* (`activity-meta`). **Single-User names nobody**, only the time. A folded line is a button that opens its
  parts beneath it (`activity-member`, name and time). *„Ältere laden"* (`activity-more`) reads the next page while
  there is one. Pull to refresh re-reads.
* **Empty:** *„Aktivität wird geladen …"* until the log was read (`activity-loading`, ADR-033); then *„Noch keine
  Änderungen aufgezeichnet"* with *„Hier steht, wer was geändert hat — jede Änderung, sobald sie beim Server angekommen
  ist."*, or *„Aktivität nicht verfügbar — offline?"* when it could not be read (`activity-empty`).
