# M29 — Tagesplan (A Trip's Day Plan, FR-29.14, FR-29.15, FR-29.18) — *built*

* **What it is:** what the travellers do on each day of the trip, read together from where it is written — planned
  ideas, excursions, tasks, arrival and departure — with entries of its own beside them (Addendum FR-29.15). Reasoning:
  `dev-docs/planner-concept.md` §4.4. The screen is the planner module's (`client/src/planner/DayPlanPage.vue`); the
  excursions and tasks reach it from the packing side through `lib/dayPlanSources.ts`, bound by `App.vue`.
* **Where it lives:** the last pill of the G-9 switcher, glyph `calendarOutline` (`/trips/:id/dayplan`, `meta.tripView:
  'dayplan'`, `trip-view-dayplan`), **drawn only while the trip has both dates** (`absentViews`). The page's name is
  *Tagesplan*, its meta line the trip's name. Back is M4. A trip without both dates that is opened on the route says
  *„Der Tagesplan braucht Start- und Enddatum der Reise."* (`m29-no-dates`).
* **A trip opens here during the trip (FR-29.7).** A tap on a trip from outside it — M1, M2, M20 — goes to
  `/trips/:id/open` (`tripOpenPath`), which the router replaces with the view the dates decide (`router/tripOpening.ts`,
  the rule in `lib/tripOpening.ts`): from the first day to the last, or once started early, the day plan on today —
  unless today holds nothing on it but arrival or departure, when the trip opens on *Einkauf*, or on *Aufgaben* while
  nothing is to buy and a task is open; before the trip the view last visited on this device (`jp_trip_view_<tripId>`),
  on a first visit *Ideen* while the packing list is empty; afterwards the packing list. Back from the opened view is
  its declared parent, as from any trip view (ADR-011).
* **The day strip** (`m29-strip`): one tile per day of the trip (`m29-day-<YYYY-MM-DD>`, `role="tab"`) — the weekday
  small over the date, up to three dots for what stands on it — scrolled sideways; today chosen during the trip, the
  first day otherwise. Days before today are dimmed. A tile chooses its day. Under the strip the chosen day in words,
  *„Mi., 15.7. · Tag 4 von 8"* (`m29-day-heading`).
* **The timeline** of the chosen day (`m29-timeline`), one card: timed entries first by their time, untimed ones after,
  each line (`m29-line-<key>`, `data-kind`) with its time (*–* where it has none), a coloured left edge and a small
  label naming its kind:
  * **🚗 Anreise / Abreise** on the first and last day, from the trip's dates.
  * **🪧 Ausflug** on each of its days (*Start* on the first, *Rückkehr* on the last of several), with its rucksack's
    packed share as a ring where it has lines; a tap opens it on M27.
  * **💡 Idee**, with its note, and a tick (`m29-tick-<key>`) that sets *Gemacht* and back, striking the line through;
    a tap opens it over M28.
  * **☑ Aufgabe** due that day, with its assignee, and M25's tick, which writes what M25's does; a tap opens M25.
  * **✎ Eintrag**, an entry of the plan's own: its title and note; a tap opens its sheet.
  * **🚆 Verbindung** (FR-29.18): see *Connections* below.
  An empty day says *„Noch nichts geplant."* (`m29-empty`).
* **Tomorrow** stands below as a second card (`m29-tomorrow`), headed *„Morgen · Do., 16.7."* with its count, while
  the trip has a next day.
* **Outside the trip** — an idea planned, or an entry written, on a day the trip does not have, because its dates
  moved or a connection's link named another day — is listed under *Außerhalb der Reise* (`m29-outside`) below, each
  with its day (`m29-outside-<id>`), the entries first by day; a tap opens the idea, or the entry's sheet.
* **The pool bar** (`m29-pool`), floating at the foot beside the FAB where shortlisted ideas have no day: *„2 Ideen auf
  der Shortlist noch ohne Tag"*. It opens *Shortlist ohne Tag* (`m29-pool-sheet`), each idea with a chip per day of the
  trip; a chip plans the idea on that day and toasts *„„…" steht am Fr., 2.10."*. With none left the sheet says *„Alle
  Ideen auf der Shortlist haben einen Tag."* and the bar is gone.
* **„+" (the FAB, `m29-fab`, `FAB_ANCHOR.m29`)** opens *„Neu am Mi., 15.7."* (`day-entry`) with three segments
  (`day-entry-kinds`):
  * **Eintrag** — a title (*„z. B. Tisch reserviert, Mietauto abholen"*), *Notiz (optional)* and *Uhrzeit (optional)*;
    *Hinzufügen*.
  * **Verbindung** (`day-entry-kind-connection`) — see *Connections* below.
  * **Idee** — the shortlisted ideas without a day as chips; one plans it on the chosen day.
* **Editing:** a tap on an entry opens *Eintrag bearbeiten* with its fields, *Speichern*, and *Eintrag löschen* — a
  destructive confirmation (`day-entry-remove-confirm`) *„„…" löschen?"* / *„Der Eintrag verschwindet für alle, die an
  der Reise teilnehmen."*.
* **A day on an idea (FR-29.14):** M28's detail carries, for an idea on the shortlist and while the trip has both dates,
  *Tag* as a chip per day (`idea-plan-day-<YYYY-MM-DD>`) plus *kein Tag* (`idea-plan-none`), and, once it has a day,
  *Uhrzeit (optional)* (`idea-plan-time`); taking the day away takes the time with it. The Shortlist's card shows
  *📅 Fr., 2.10. · 09:00*, or *noch nicht eingeplant* with a dashed edge (`idea-card-plan-<id>`).
* **Connections (FR-29.18, ADR-086)** — the ＋ sheet's *Verbindung* (`day-entry-connection`):
  * *„In der SBB-App die Verbindung teilen und den Link kopieren – eingefügt wird er sofort gelesen."*, then
    *📋 Link aus Zwischenablage einfügen* (`day-entry-paste`, only where the page may read the clipboard — not over
    plain http) and *Link (optional)* (`day-entry-link`).
  * **A link is read the moment it arrives** — pasted into the field, where it replaces what the field held, or fetched
    by the button; a typed one when the field is left. There is no read button. While it reads, *„Verbindung wird
    gelesen …"* (`day-entry-read-state`); then *„✓ 5 Teilstrecken gelesen."* with the legs as a preview
    (`day-entry-legs`), the hand fields gone, and the button *„Am Sa., 10.10. einfügen"* — the day the link names,
    where the plan moves once it is written. A link no reader knows says *„Diesen Link kann ich nicht lesen – bitte von
    Hand eintragen."* and leaves the hand fields, the link kept.
  * **The hand fields** (`day-entry-hand`), shown under the link unless a preview stands: *Von* and *ab*, *Nach* and
    *an*, two to a row, and *Linie (optional)*; *Hinzufügen* once the stops and both times are there. An arrival
    before the departure is the next morning's.
  * **On the timeline** a *🚆 Verbindung* (`data-kind="connection"`) stands at its first departure and reads
    *„Samedan → Bern, Cäcilienstrasse"*, under it *„an 15:46 · RE 3, IC 3, IC 1, T 6 · 3× umsteigen"* (*direkt* without
    a change, *„an 06:45 (+1)"* on the next day). ▸ (`m29-legs-toggle-<key>`, `aria-expanded`) opens its legs in place
    (`m29-legs-<key>`) — each *„10:58 [RE 3] Samedan → Landquart · an 12:39"* (`connection-leg`), a walk with 🚶 for its
    line — and, where it came with a link, *„In der App öffnen"* (`connection-open-link`), the link in a new tab.
  * **Editing:** a tap on the line opens *Verbindung bearbeiten* without segments: one leg in the hand fields, several
    as the preview they were read as; a new link pasted reads again. *Eintrag löschen* as for any entry.
* **Modes:** all three; the plan reads and writes the device's rows. Single-User and Local Mode name nobody, as M28
  does.
* (E2E-M29-01…08 `local`, E2E-M29-09 `server`, E2E-G12-09)
