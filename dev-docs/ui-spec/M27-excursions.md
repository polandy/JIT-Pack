# M27 — Ausflüge (A Trip's Excursions, FR-31) — *built*

* **What it is:** a trip's excursions — a day hike, a hut night, a boat trip — each with **its own small packing list**
  (Addendum §3.31, ADR-077). Reasoning: `dev-docs/excursions-concept.md`; the rendered variants, all three open points
  decided as variant A, are `UI_Concept_Excursions_variants.html` at `6b148419` (`build-excursions-variants.mjs` at
  `6b148419`).
* **Where it lives:** the fifth pill of the G-9 switcher, after *Notizen*, glyph `trailSignOutline` — a signpost, which
  fits a hike, a boat and a town trip alike (`/trips/:id/excursions`, `meta.tripView: 'excursions'`). Its badge counts
  the upcoming excursions that still have something open (FR-31.10), grey. No ⋮ on the list. Back is M4.
* **The list:** *Kommende* — by first day, a row per excursion: its days (*„So., 27.9. – Mo., 28.9."*, one day for a day
  hike), its name in the heading weight, the participants' names where not everybody goes, and `done/total` at the end
  with a chevron, and under the name, where it carries GPX tracks, the first one's kind glyph, distance and climb with
  *+n* for the others (`m27-tracks-<name>`, FR-31.15), and where it has a way there or back a train glyph with
  *„08:06 hin · 16:23 zurück"* (`m27-journey-line-<name>`, FR-29.18, the planner's words through
  `kernel/excursionConnections.ts`); then *Ohne Datum*, by name, the same row without the days line;
  then a fold *„1 vergangener Ausflug"*, latest first, muted. A row opens that excursion's list. The empty trip says
  *„Noch keine Ausflüge. Eine Tageswanderung, eine Hüttenübernachtung – mit ＋ legst du einen mit eigener kleiner Liste
  an."* **Before the trip partition has arrived** the screen shows nothing rather than an empty list (ADR-033).
* **The sheet** (the FAB, ＋, `FAB_ANCHOR.m27`; also *Ausflug bearbeiten* from one excursion's ⋮): *„Neuer Ausflug"* —
  **Name** (*„z. B. Tageswanderung"*), **Wann** — one G-17 range field (*Von → Bis*), optional, offering only the trip's
  days once it has them (FR-31.1); **Wer geht mit** — *Alle* and a chip per traveller (where the trip has two or more),
  everybody by default, and a set that reaches everybody is *Alle* again; and, new only, **Beginnen mit** — FR-27.13's
  group search (*„Gruppe suchen…"*), the groups A–Z with their item count and *„über Kamera"* on an item match, then
  *Leer beginnen*. With a group chosen, one line says in advance what the tap does to the packing list: *„Was noch nicht
  im Gepäck ist, kommt auch auf die Packliste."* while the suitcase is open, *„Die Reise hat begonnen: Was nicht im
  Gepäck ist, wird markiert statt auf die Packliste gesetzt."* once it is not (FR-31.7). *Ausflug anlegen* writes it,
  opens its list, and a toast *„„Hüttentour" angelegt · 3 Dinge auf die Packliste"* carries *Rückgängig*, which takes
  back the excursion, its lines and what it put into the suitcase (FR-31.4).
* **One excursion** (`/trips/:id/excursions/:excursionId`, `meta.parent` the list, still in the excursions view, so the
  pills stay): named by the excursion, with *„So., 27.9. – Mo., 28.9. · Sia, Andy"* (or *Alle*, or *Ohne Datum*) as the
  meta line. **It is M4, smaller, built from M4's own parts**, so it reads and works like the packing list: M4's
  **header line** (`m27-header`) — the progress card (*„2/6 gepackt"*, with *„1 vor Ort besorgen"* as its detail while
  *vor Ort* lines are unbought, *„Noch nichts auf der Liste"* on an empty one), sticky, yielding to the list on the way
  down with the page head and back on an upward gesture (FR-21.17, the same `useHeadScroll`) — and, where two or more
  go, its **Pro Person** strip over the participants, whose cards toggle people in the person filter as on M4 (FR-25.29:
  several at once, each an active chip). Then M4's **chip row** (`m27-filter-bar`: the active filter values, removable,
  or *„Gruppiert nach Kategorie"*), and the lines **by category** — or by person or state, the filter sheet's grouping,
  container left out since a line has none — under M4's collapsible group heads (`done/total` in units, *Ohne* for
  none), A–Z. **The list is built by M4's own view model** (`buildPackingView` over the lines as they are), so it
  behaves as the packing list does: a packed line **leaves the list** with M4's pack-out (FR-25.2) and M4's snackbar
  with *Rückgängig*, and M4's reveal bar (*„2 gepackt anzeigen"*, `m27-done-bar`) brings the packed lines back. **The
  bar** carries M4's own three (G-12): the search (`m27-search`, its field `m27-search-input`, *„Ausflugsliste
  durchsuchen…"*), the filter sheet (`m27-filter`: M4's facets and grouping, and of the reveal switches only *Erledigte*
  — FR-25.20 and FR-25.27 are the suitcase's), and fold-all (`m27-fold-all`). The filter lasts the session, the grouping
  is kept, both per excursion. **Empty, it says what M4 says** (`m27-empty-list`): *Keine Treffer* with the reason and
  M4's reset while a search or filter narrows it, *„Noch nichts auf dieser Liste"* before anything is on it, *„Alles
  erledigt 🎉 · Nichts mehr offen für diesen Ausflug."* when everything is packed.
* **The notes about it** (FR-7.15): under the progress card and the *Pro Person* strip, one quiet line per thread
  that names this excursion (`m27-notes`, a line `m27-note-<id>`) — M26's `chatbubblesOutline`, the thread's name, a
  chevron — each opening that thread's view. Only the names, in M26's order; none is drawn where no thread names the
  excursion. Deleting the excursion keeps its notes as trip notes.
* **Der Tag** (FR-29.18, FR-31.15, ADR-089; `m27-connections`, the planner's card bound through
  `kernel/excursionConnections.ts`): **first, above the progress card**, one card that scrolls away with the page head —
  the day is what the excursion is, and the list is packed for it. Its head (`m27-day-toggle`, compass glyph, *Der
  Tag*, a caret) **folds and unfolds** it: folded, the head alone carries the day in one line, *„08:06 → 3.3 km →
  16:23 · 4 h 24 Luft"* — the ways' departures around the first track's distance, and what the route leaves — or,
  without a way, the first track's distance and climb with *+n* (`m27-day-folded`). **While the list has something
  left to pack it starts folded, once nothing is left it starts open** — packing first, the way after. A fold or
  unfold is kept per excursion in this browser (`composables/routeFold.ts`), for the phase it was made in. A card
  with nothing yet — no way, no track — is always open and has no caret, since folded it would hide how to start.
  * **Open, it is a timeline** of the day, each step a dot on a rail: the **way there** (`m27-journey-out`, a train in
    glacier), the **route** (`m27-day-route`, a walker in larch — FR-31.15's tracks as M27 hands them in, the
    `TrackSummary` without a head of its own), the **way back** (`m27-journey-back`). A filled way reads *„08:06 Spiez →
    08:34 Kandersteg"* in the heading weight over *„Hin · RE · direkt"* (*„1× umsteigen"* with a change), a chevron at
    the end; an empty one, its dot dashed, *„Hinfahrt eintragen"* / *„Rückfahrt eintragen"* in the action colour. A tap
    on an empty way opens the day plan's sheet **at M29's connection step**, headed *Hinfahrt* / *Rückfahrt*, *„Ausflug
    Rigi · Di., 15.7."* under it (`connection-step-sub`), on the excursion's first day for the way there, its last for
    the way back; its ‹ closes the sheet. *Nach* of the way there is the stop nearest the first track's start, marked
    *nächster Halt zum Start* (*„Kein Halt in der Nähe des Routenstarts …"* where none is found), the way back is
    searched arriving-reversed, from the way there's arrival plus the route's time, and each result says what it leaves
    of that. A connection taken shows the form of that sheet without *Was* and *Uhrzeit* — the slot names it, the
    departure times it — as its card and *Notiz*, with *Als Hinfahrt speichern* / *Als Rückfahrt speichern*. A filled
    way opens that form to change or delete; its *Ändern* searches from the way's own stops and departure, not the
    slot's morning and nearest stop, and *Von Hand* holds them. **Without days** the first step says *„Gib dem Ausflug
    einen Tag, dann kannst du Hin- und Rückfahrt eintragen."* (`m27-journey-no-day`) and no way is offered; the route
    stays. Any other connection of the excursion stands under the timeline as a row of its own (`m27-connection-<id>`:
    departure, title
    over day, chevron).
  * **The route step:** a still map with every track's line in its colour (`track-summary-map`, tiles as FR-29.17 sets
    them, the lines alone offline), inset with the card's small radius, and the ways' legs that have positions drawn
    with it as M29's connection map draws them, so the way there's last stop and the track's start stand side by side; a
    tap on it opens FR-29.17's full-screen map, which draws them too. The connection sheet's own small map shows the
    same. Under it, one line per track (`track-row-<id>`): the kind glyph in the track's colour, its name, *„3.3 km · ↑
    300 m · 1 h 25"* (`track-row-facts-<id>`, the time with the pauses), a chevron — a tap opens the full-screen map on
    that track, its tabs choosing among the excursion's tracks and its figures setting kind, *Mit Kind* and pauses; its
    bar carries *Bearbeiten* (FR-29.20) and the track's **⋮** (`TrackMore`: *Route bearbeiten*, *Umbenennen*, *GPX
    herunterladen*, *Durch andere Datei ersetzen*, *Track entfernen*, confirmed). No step without a track; while a file
    is read, *„Track wird gelesen …"* (`m27-track-busy`) stands under the card.
  * **The time budget** (`m27-journey-budget`), the card's foot where FR-29.18 has one: with a track, a thin bar of
    the day — travel in glacier, the route in the done tone, the slack empty — over *„Vor Ort 7 h 49 · Route 3 h 25 →
    4 h 24 Luft"*, the verdict in the done tone, straw under an hour, ember where the route does not fit; without a
    track the line alone, *„Vor Ort 7 h 49"*; from the way there alone *„An 08:34 · Route 3 h 25 → frühestens zurück
    ab 11:59"*.
  * Without the planner bound, the route stands alone as `TrackSummary`'s own card, headed *Route*, folding by the
    same rule.
* **One rhythm:** every block stands 12 px from the edge and 12 px from the next — *Der Tag*, the progress card, *Pro
  Person*, the list — and every block names itself the same way: a card in its own head, M4's parts in the eyebrow
  over them. The chip row opens with the list's own eyebrow, *„Packliste"*, the grouping at its end (*„Gruppiert nach
  Kategorie"*); with a filter on, the chips stand there instead. The first group's head follows that row closely —
  its room is for a group above it, and there is none (M4 the same).
* **A line** is M4's `PackingRow` (handle `m27-row-*`, a child `m27-child-*`): the §3.28 mark, the name, the mode
  and late glyphs, the stepper or tick at the edge. Under the name, where it has something to say
  (`ExcursionFacts`):
  * ***aus dem Gepäck*** — it borrows a trip row this device holds;
  * ***nur für diesen Ausflug · Ins Inventar*** — a line no inventory item names (FR-31.14); the action makes it one,
    with a toast and *Rückgängig*;
  * a *vor Ort* line to buy says nothing more — the row's mode glyph says it, as on M4; ***vor Ort gekauft*** once
    bought (FR-31.8), with ***Auf die Packliste*** beside it until it is a trip row, and ***vor Ort gekauft · auf der
    Packliste*** after (FR-31.13);
  * ***nicht im Gepäck · Vor Ort besorgen*** in the straw warning tone, the action a small text button in place
    (FR-31.7) — the mark is never painted on (FR-28.5/G-15);
  * ***nicht mehr dabei · Herausnehmen*** on a packed line of somebody who no longer goes (FR-31.5); the action removes
    the line with an undo.

  **A tap on the row opens M5's sheet for the line** (`ExcursionItemSheet`, handle `m27-line-sheet`) — on the route as
  M5's is, `?line=<id>` (`overlayQuery`), so a deep link and a reload open it too; on a desktop width (≥ 900 px) it is
  M5's **side panel** beside the list (`m27-line-panel`, G-9). Unlike M5's `?item=` the query is **pushed**, so the
  browser's back removes it and closes the sheet on the same page; ✕ takes that same step back. Laid out and
  styled as M5 block for block: the mark, the name and its category (and person) in the head; *Menge* with the quick
  amounts; *Einpacken*, the large stepper with the state beside it; *Nicht einpacken* / *Doch mitnehmen*; where two or
  more go, **M5's for-whom strip over the participants** — shared, *Alle* (*für alle*), or named people; open lines of
  those it is no longer for go, a packed one stays, and the sheet stays on the thing when its line is replaced
  (FR-31.5); a glance row (person where the strip is absent, the mode); the line's facts with their actions
  (`ExcursionFacts`); and *Details ▾* with the mode (*Einpacken* / *Vor Ort kaufen*) and, for a *vor Ort* line, the
  *Gekauft* switch. What M5 has and a line has not — preparations, notes, packer, container, flags — is left out.
  **A hold** (or a desktop's context menu) opens **M4's row menu** — its entries decided by M4's `rowMenuEntries` over
  the line read as its row (`excursionMenuEntries`) and worded and iconed as on M4 (`lib/rowMenuButtons.ts`): *Menge
  ändern* (M4's amount popover, `m27-quantity-popover`, which also opens from the row's own count), *Nicht einpacken*,
  *Vor Ort kaufen* / *Doch mitnehmen* (on a line nothing has been done to yet, FR-5.9), then the excursion's own —
  *Gekauft* / *Noch nicht gekauft* (a *vor Ort* line), *Auf die Packliste* (a bought one, FR-31.13), *Ins Inventar
  übernehmen* (a line for the excursion alone, FR-31.14) — and *Von der Liste entfernen* last; a skipped line offers
  *Doch einpacken* and the removal. The suitcase's own entries (*Packen*, *Spät packen*, *Nicht benutzt*, the claim's)
  are never offered. **Every act is announced in M4's snackbar with its one undo** (FR-25.31) — the amount (one editing
  session, one undo), the skip, the way back, the mode, the purchase, the removal, *Auf die Packliste*, *Ins Inventar*
  and a change of who goes alike.
* **A thing per person** is M4's `ClusterHead` (handle `m27-cluster-*`): the mark, the name, a caret; **shut by
  default** (FR-25.23, view state, not persisted) with a face per person and the open count; open, a child per
  participant in roster order, each with its own tick.
* **Adding** is M4's: the orange **＋** (`m27-add-fab`) opens M4's **quick-add** — the inventory search with its create
  sheet (FR-24.11), recent chips, *Mehr aus dem Inventar…*, whole **groups** (FR-27.10's offer; a group adds what the
  list does not carry yet, with *Rückgängig*), and FR-25.28's **for-whom strip** over **the excursion's participants**
  where two or more go — and the inventory sheet's verbs on a thing the list already carries (FR-25.13f–i: *packen*,
  *nicht einpacken*, *für alle*, the people, the row's own undo and *wieder öffnen*) act on the excursion's lines of
  that item. *Gemeinsam* adds one shared line, every participant is *für alle*, some avatars name those people
  (FR-31.5). The line is linked into the suitcase like a group's (FR-31.4/31.7). A name the inventory lacks is offered
  two ways (FR-31.14): ***„X" nur für diesen Ausflug*** (*Kommt nicht ins Inventar – Proviant, Wasser, Kleinkram*,
  `quick-add-local-only`) first, and what ✓ does; the inventory's create offer below it.
* **The ⋮** (G-12, words only): *Ausflug bearbeiten* (the sheet above; a change of who goes rewrites the per-person sets
  and toasts *„Wer mitgeht, geändert"* with *Rückgängig*), *Track hinzufügen …* (`m27-track-add`, the file chooser;
  FR-31.15) and *Route zeichnen* (`m27-track-draw`, FR-29.20's editor on nothing; without the map it toasts why) — with
  five tracks both toast *„Es sind schon 5 Tracks – mehr gehen nicht."* instead —, *Als Gruppe speichern* (a prompt
  prefilled with the excursion's name and the line *„Die Liste wird eine Gruppe, aus der du andere Ausflüge und Reisen
  beginnen kannst."*; a taken name is refused in a toast and the prompt stays open; FR-31.11 — where lines for the
  excursion alone exist, an alert asks first, *„Auch Dinge, die nur für diesen Ausflug sind?"* naming them, with
  *Mitnehmen* and *Weglassen*, handle `m27-save-group-unlisted`, FR-31.14), *Ausflug löschen* (a destructive
  confirmation *„„Hüttentour" mit seiner Liste löschen? Die Packliste bleibt, wie sie ist."*, then back to the list). An
  excursion deleted elsewhere leaves its view for the list.
* **Another module's lines (FR-33.6):** a picnic taken on the excursion from the meal plan stands above the list under
  *Essen* (`m27-extra`, a line `m27-extra-meal:<id>`) — its dish and its day and slot, ticked as packed here, a tap on
  its name opening the meal's sheet — and counts in the progress card's share and the list's `done/total`. It is no
  M4 row: no amount, no person, nothing borrowed from the suitcase (`kernel/excursionExtraLines.ts`).
* **Elsewhere:** M4 names the excursions that borrow an open row (FR-31.12); M6 files an excursion's *vor Ort* lines
  under its name (FR-31.8); M1 carries an *Ausflüge* block the day before and the day of (FR-31.10); M17 carries the
  *Ausflüge* reminder switch (FR-31.9). A notification `excursion_due` opens the excursion's own list.
* **From an idea (FR-29.13):** entered from an idea's *Ausflug* chip (`?fromIdea=`), the sheet opens with the idea's
  title as the name and its planned day as both days; the excursion created names the idea and opens its list, which
  still returns to the idea (`meta.acceptsLinkedFrom` on both routes). On the M27 row and above the excursion's own list
  the **💡 line** (`IdeaOrigin`, the bulb in `--jp-brand` and the idea's title, small and quiet) names the idea it was
  made from (FR-29.13); a tap opens the idea over M28 (`?idea=`), and nothing is drawn for an idea the device does not
  hold. Its handles: `m27-idea-<name>` on the row, `m27-excursion-idea` on the list.
* **Modes:** all three; the reminder is not sent in Local Mode (there is no server).
* (E2E-M27-01…17 `local`, E2E-G12-07)
