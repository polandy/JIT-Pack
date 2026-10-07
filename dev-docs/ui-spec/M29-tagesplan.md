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
  unless that day (the first, when started early) holds nothing but arrival or departure, when the trip opens on
  *Einkauf*, or on *Aufgaben* while nothing is to buy and a task is open; before the trip the view last visited on this
  device (`jp_trip_view_<tripId>`), on a first visit *Ideen* while the packing list is empty; afterwards the packing
  list. Back from the opened view is its declared parent, as from any trip view (ADR-011).
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
  * An excursion made from an idea (FR-29.13) is **one line**: the excursion's, whose second line starts *„💡 Titel"*,
    timed by the idea's time on the day the idea was planned for. The idea has no line of its own, and neither a pool
    chip nor an *Außerhalb der Reise* place.
  * An entry that is an excursion's way (written on M27) reads *„🚆 Hinfahrt · Titel"* / *„🚆 Rückfahrt · Titel"* by
    its slot (*„🚆 Verbindung · Titel"* without one) over its connection's line; the plan only shows it.
  * **💡 Idee**, with its note, and a tick (`m29-tick-<key>`) that sets *Gemacht* and back, striking the line through;
    a tap opens it over M28.
  * **☑ Aufgabe** due that day, with its assignee, and M25's tick, which writes what M25's does; a tap opens M25.
  * **✎ Eintrag**, an entry of the plan's own: its title and note; a tap opens its sheet. An entry that carries a
    connection (FR-29.18) has it as a second line under the title — see *Connections* below.
  * **Whom a line is for** (FR-29.15): an entry that names travellers, and an excursion narrowed to some (FR-31.3), say
    *„für Sia, Leonardo"* under the title and its note (`m29-who-<key>`), the names in roster order, a shade lighter
    than the title and darker than the note. A line for everybody says nothing.
  * **🍽 Mahlzeit** (§3.33, FR-33.5), from the meal plan through `lib/dayPlanSources.ts` (`data-kind="meal"`, the
    alpenrose edge): its slot as the label (*Abendessen*), the dish, *„Lena kocht · 2 von 4 Zutaten eingekauft"*
    (*„auswärts · Pizzeria Mulin"* eaten out) and the bought share as a ring. Without a time it stands at its slot's
    place among the timed lines (*früh* 08:00, *mittags* 12:30, *zw.* 15:30, *abends* 18:30), the word in the time
    column. A tap opens the meal's sheet over the plan (M31). An excursion's line names a picnic taken on it
    (*„… · 🍽 Picknick"*, FR-33.6) and counts it in its ring.
  An empty day says *„Noch nichts geplant."* (`m29-empty`).
* **Für** (`who-m29`), under the strip where the trip has more than one traveller: *Alle* (`who-all-m29`) and a chip
  per traveller (`who-m29-<Name>`), the *Für wen* chips and rule — one or several chosen, everybody or nobody being
  *Alle*. It narrows the chosen day, *Morgen* and the strip's dots to the lines that concern the chosen (FR-29.15); a
  card that leaves lines out ends in *„2 Zeilen für andere"* with *Alle zeigen* (`m29-hidden`, `m29-show-all`;
  `m29-tomorrow-hidden` under *Morgen*), and says *„Noch nichts geplant."* only where nothing is left out. The device
  remembers the choice per trip; the first visit opens on the traveller linked to my account, else on *Alle*. A new
  entry's *Für wen* starts on the chosen.
* **Tomorrow** stands below as a second card (`m29-tomorrow`), headed *„Morgen · Do., 16.7."* with its count, while
  the trip has a next day.
* **Outside the trip** — an idea planned, or an entry written, on a day the trip does not have, because its dates
  moved or a connection's link named another day — is listed under *Außerhalb der Reise* (`m29-outside`) below, each
  with its day (`m29-outside-<id>`), the entries first by day; a tap opens the idea, or the entry's sheet.
* **The pool bar** (`m29-pool`), floating at the foot beside the FAB where shortlisted ideas have no day: *„2 Ideen auf
  der Shortlist noch ohne Tag"*. It opens *Shortlist ohne Tag* (`m29-pool-sheet`), each idea with a chip per day of the
  trip; a chip plans the idea on that day and toasts *„„…" steht am Fr., 2.10."*. With none left the sheet says *„Alle
  Ideen auf der Shortlist haben einen Tag."* and the bar is gone.
* **„+" (the FAB, `m29-fab`, `FAB_ANCHOR.m29`)** opens *„Neu am Mi., 15.7."* (`day-entry`), *„Ein Termin, eine
  Erinnerung oder eine Fahrt."* under it — the FAB's accessible name is that title, so it says which day it adds to.
  **A sheet, not M6's composer** (FR-21.24): an entry carries a day, a time and for whom, which one line on top of the
  list cannot hold. **One form**:
  * **Von der Shortlist einplanen** (`day-entry-pool`), where shortlisted ideas have no day: one chip per idea
    (`day-entry-plan-<id>`, 💡 and its title), scrolled sideways. A tap plans the idea on the chosen day, closes the
    sheet and toasts *„„…" steht am Di., 15.7."*. Without such ideas the row is not there.
  * **Was** (`day-entry-name`, *„z. B. Tisch reserviert, Mietauto abholen"*), then *Uhrzeit* (`day-entry-time`, 24 h,
    *hh:mm* while empty) beside *Notiz* (`day-entry-note`, *optional*).
  * **Für wen** (`who-day-entry`), where the trip has more than one traveller: *Alle* (`who-all-day-entry`), then a
    chip per traveller (`who-day-entry-<Name>`) — the chips and the behaviour of M27's *Wer geht mit*: *Alle* is chosen
    on a new entry; a name tapped while *Alle* is chosen names just that person, each next tap adds or takes one, and
    naming everybody or nobody is *Alle* again. Not asked on an excursion's way, which goes with its people.
  * **🚆 Zugverbindung hinzufügen** (`day-entry-add-connection`), a dashed row, *„Im Fahrplan suchen, SBB-Link oder von
    Hand"* under it (*„SBB-Link einfügen oder von Hand"* where the search is not offered). A tap opens the connection
    step (*Connections* below). With a connection taken, the row is its card instead.
  * **Hinzufügen** (`day-entry-save`), full width, on once the entry has a title or a connection.
* **Editing:** a tap on an entry opens *Eintrag bearbeiten* with the same form and its fields — the shortlist row
  left out — *Speichern*, and *Eintrag löschen* (`day-entry-remove`) — a destructive confirmation
  (`day-entry-remove-confirm`) *„„…" löschen?"* / *„Der Eintrag verschwindet für alle, die an der Reise teilnehmen."*.
  An entry without a connection offers *Zugverbindung hinzufügen* there as on a new one.
* **A day on an idea (FR-29.14):** M28's detail carries, for an idea on the shortlist and while the trip has both dates,
  *Tag* as a chip per day (`idea-plan-day-<YYYY-MM-DD>`) plus *kein Tag* (`idea-plan-none`), and, once it has a day,
  *Uhrzeit (optional)* (`idea-plan-time`); taking the day away takes the time with it. The Shortlist's card shows
  *📅 Fr., 2.10. · 09:00*, or *noch nicht eingeplant* with a dashed edge (`idea-card-plan-<id>`).
* **Connections (FR-29.18, ADR-086)** — what an entry carries:
  * **The card** (`day-entry-connection`) stands in the form where *Zugverbindung hinzufügen* stood: *„08:06 → 08:34"*
    with *„28 min · direkt"* at its end, under it *„🚆 Luzern → Hergiswil"* and its lines as chips in what they travel
    by; the small map (`connection-map`, below); then *Teilstrecken ▾* (`day-entry-legs-toggle`), opening its legs in
    place (`day-entry-legs`, each a `connection-leg`), *Ändern* (`day-entry-connection-change`, the step again,
    searching from the connection's own stops and departure, the hand fields holding them) and, at the end, *Entfernen*
    (`day-entry-connection-remove`), which takes the connection off the entry — no confirmation, the entry is not
    written before its button. A connection taken **opens into the form**: the add row closes and the
    card unfolds in its place; *Entfernen* runs the same the other way (none of it under reduced motion).
  * **What it fills:** taking a connection fills an empty *Was* with *„Nach Hergiswil"* — the last stop, a walk's end
    left aside — labelled *aus der Verbindung* in the done tone (`day-entry-filled`), and an empty *Uhrzeit* with its
    first departure, marked by a small train in the done tone (`day-entry-time-filled`); each mark goes when the field
    is typed into. *Entfernen* empties what it filled and nothing else. A connection whose day is not the entry's — a
    link naming another — says *„Am Sa., 10.10. – der Eintrag wandert mit."* (`day-entry-moves`) under the card.
  * **The step** (`connection-step`, `data-step`) replaces the form inside the same sheet, which keeps its height,
    and slides in: ‹ (`connection-step-back`, back to the form with nothing taken), *Zugverbindung*
    (`connection-step-title`; *Hinfahrt* / *Rückfahrt* on M27) and *„Für „Glasi Hergiswil besuchen" · Di., 15.7."*
    (`connection-step-sub`; *„Für „Neuer Eintrag"…"* while the title is empty). What was typed into the search stays
    while the step is left and opened again.
  * **The search** (`timetable-search`) heads the step: *Von* (`timetable-from`) over *Nach* (`timetable-to`) in one
    box, ⇅ (`timetable-swap`) at its right edge; up to four stop chips under the box from the third typed character
    (`timetable-from-stops`, `timetable-to-stops`, a chip `timetable-<from|to>-stop-<id>`; pressing one keeps the
    field's focus). Under the box *Abfahrt* / *Ankunft* (`timetable-mode`), the time (`timetable-time`, 24 h, *08:00*
    where nothing seeds it) and the day. The connections (`timetable-results`) come once both stops stand — a chip
    taken, a field left — and again on each change of stop, mode or time; the same question is not asked twice, and
    there is no search button. While the timetable answers, *„Verbindungen werden gesucht …"* with Ionic's dots
    (`timetable-busy`). They stand between *‹ Früher* (`timetable-earlier`) and *Später ›* (`timetable-later`), each of
    which adds the connections before or after, its dots while it asks. Each result (`timetable-result-<n>`) slides in
    and reads *„08:06 → 08:34"* with *„28 min"* at its end, over *„direkt"* (*„1× umsteigen"*) and its lines as chips,
    and, where the step knows the earliest time, the slack (`timetable-slack`): *„6 h 24 Luft"*, or *„19 min zu früh"*
    in the warning colour. A tap takes the connection and goes back to the form. *„Keine Verbindung gefunden …"* and
    *„Der Fahrplan antwortet nicht …"* (`timetable-message`) stand where the results would. Not offered when the
    instance turned the search off or while the device is offline.
  * **📍 Mein Standort** (`timetable-here`), a small pill at the right of *Von*, where the page may have a position
    (HTTPS). A tap asks for it once (*„Standort wird bestimmt …"* with dots, `timetable-locating`), then *Von* reads the
    nearest stop with *„180 m von dir"* (`timetable-here-distance`) and *Halte in deiner Nähe* (`timetable-near`) lists
    up to three chips (`timetable-near-<n>`, *„Luzern, Schwanenplatz · 320 m"*), the nearest pressed; another chip
    takes that stop. Each result then opens with *„🚶 3 min · los um 08:03"* (`timetable-walk`), and the connection
    taken begins with that walk from *Mein Standort*. Refused: *„Ohne deinen Standort geht das nicht – gib den Halt
    ein."* (`timetable-message`), *Von* left as it was.
  * **Nicht dabei?** (`connection-alternatives`) under the results: *📋 SBB-Link* (`connection-via-link`, *aus der
    Zwischenablage*) and *✎ Von Hand* (`connection-via-hand`, *Halte und Zeiten*) side by side. Without the search they
    are the step (`data-large`): *„Die Fahrplansuche gibt es nur mit Netz und für Halte in der Schweiz. …"* over the
    two as large rows.
  * **SBB-Link** (a step of its own, ‹ back to the search): *„In der SBB-App die Verbindung teilen und den Link kopieren
    – eingefügt wird er sofort gelesen."*; *📋 Link aus Zwischenablage einfügen* (`day-entry-paste`, only where the page
    may read the clipboard — not over plain http) and *Link (optional)* (`day-entry-link`). **A link is read the
    moment it arrives** — pasted into the field, where it replaces what the field held, or fetched by the button; a
    typed one when the field is left. While it reads, *„Verbindung wird gelesen …"* with dots
    (`day-entry-read-state`); then *„✓ 5 Teilstrecken gelesen."* with the connection as the card shows it, read-only,
    and *Übernehmen* (`connection-take`). A link no reader knows says *„Diesen Link kann ich nicht lesen – bitte von
    Hand eintragen."* and offers *✎ Von Hand* (`connection-link-to-hand`), the link kept.
  * **Von Hand** (`day-entry-hand`, a step of its own): *Von* and *ab*, *Nach* and *an*, two to a row, and *Linie
    (optional)*; *Übernehmen* (`connection-take`) once the stops and both times are there. An arrival before the
    departure is the next morning's. A kept link stands under the fields (`day-entry-kept-link`). Changing a
    connection of one leg without places opens it with that leg filled in.
  * **The small map** (`connection-map`), 128 px high under the card's lines, drawn where the legs have positions: the
    legs as lines — train ember, bus glacier, boat heather, a walk dotted in the subtext tone, heavier than a track's
    over the Landeskarte's red roads — over the tiles (ADR-085; the lines alone without them), each stop a dot, the
    whole journey's ends as a track's are. *⤢ Karte* at its corner; a tap opens **the full map**
    (`connection-map-full`): the whole screen, ‹ (`connection-map-back`) and the entry's title as floating pills, a
    legend of what is drawn (`connection-map-legend`: *Bahn*, *Bus*, *Schiff*, *zu Fuss*), ◎ (`connection-map-me`,
    to the device) and its position as FR-29.19 draws it, and under the map a card with *„08:06 → 08:34"* and its legs
    (`connection-map-legs`). A connection without positions has no map and no *⤢ Karte*.
  * **On the timeline** the entry's line (`data-kind="connection"`) carries its own title, and under it *„Luzern →
    Hergiswil Matt · an 08:31 · S 4 · direkt"* (*„3× umsteigen"*, *„an 06:45 (+1)"* on the next day; the stops left
    out where the title already names them), and *Karte ›* (`m29-map-<key>`) where the legs have positions, which
    opens the full map. ▸ (`m29-legs-toggle-<key>`, `aria-expanded`) opens its legs in place (`m29-legs-<key>`) —
    each *„10:58 [RE 3] Samedan → Landquart · an 12:39"* (`connection-leg`), a walk with 🚶 for its line — and, where
    it came with a link, *„In der App öffnen"* (`connection-open-link`), the link in a new tab.
  * **An excursion between its ways:** an excursion's line stands right after its way there on that day, or, with
    only a way back, right before it — whatever time it has of its own; without a way it keeps its place.
* **Modes:** all three; the plan reads and writes the device's rows. Single-User and Local Mode name nobody, as M28
  does. The search, *Mein Standort* and the map's tiles are the device's own calls, so Local Mode has them while
  online; a short SBB link needs the server (FR-29.16) and stays a kept link in Local Mode.
* (E2E-M29-01…08, E2E-M29-13…18 `local`, E2E-M29-09 `server`, E2E-G12-09)
