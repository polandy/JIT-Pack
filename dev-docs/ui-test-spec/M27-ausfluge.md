# M27 — Ausflüge (a trip's excursions, FR-31)

* **E2E-M27-01** `local` (FR-31.1/31.2/31.4/31.5/31.12, FR-31.10) — **implemented**
  (`excursions.spec.ts`): M27 is reached by its pill, marked current, with its empty state. The FAB's sheet names an
  excursion, gives it days and starts it from a group: the group's lines land — a per-person thing as a cluster *für
  alle* with a child per participant, a *vor Ort* line — and what the suitcase lacked is on the packing list, where M4's
  open row names the excursion in its borrowed line. The creation toast offers the undo.
* **E2E-M27-02** `local` (FR-31.4) — **implemented** (`excursions.spec.ts`): ticking a line on the excursion leaves the
  tick of the suitcase row it borrows alone, and ticking the suitcase row leaves the line's alone — the link shares no
  tick (ADR-077).
* **E2E-M27-03** `local` (FR-31.7/31.8) — **implemented** (`excursions.spec.ts`): on a trip under way, starting an
  excursion from a group writes nothing into the packing list and marks the missing lines *nicht im Gepäck*. *Vor Ort
  besorgen* moves such a line to M6's *Vor Ort* list, under the excursion's name; buying it there stamps it *vor Ort
  gekauft* on the excursion, where it stays on the list.
* **E2E-M27-04** `local` (FR-31.5) — **implemented** (`excursions.spec.ts`): the excursion's ＋ opens M4's
  quick-add, whose for-whom strip is over the excursion's participants; *Alle* writes M4's cluster with a child per
  participant, each ticked alone.
* **E2E-M27-05** `local` (FR-31.3/31.5) — **implemented** (`excursions.spec.ts`): changing who goes in the edit sheet
  gives a joiner a line of every *für alle* set; the one toast's undo takes the people and the lines back.
* **E2E-M27-06** `local` (FR-31.11/31.1) — **implemented** (`excursions.spec.ts`): the ⋮'s *Als Gruppe speichern*
  writes a group the template list shows; the ⋮'s delete returns to M27 and leaves the packing list as it was.
* **E2E-M27-08** `local` (FR-31.5/31.6) — **implemented** (`excursions.spec.ts`): a tap on a line opens M5's sheet
  for it — the name, the amount, the large packing control packs it; the sheet's *Alle* turns the shared thing into
  a line per person without closing the sheet, the packed shared line stays; a hold (context menu) opens the line's
  menu, and a hold that fires twice opens it once.
* **E2E-M27-07** `local` (FR-31.13) — **implemented** (`excursions.spec.ts`): on a trip under way, a line not in the
  luggage is bought through M6, then taken *Auf die Packliste*: the toast says so, the line reads *vor Ort gekauft · auf
  der Packliste* and offers the action no more, the packed row is on M4 once the packed rows are revealed, and the item
  is in M9.
* **E2E-M27-09** `local` (FR-31.14) — **implemented** (`excursions.spec.ts`): two names the inventory lacks added *nur
  für diesen Ausflug* read so and are not on M4; *Ins Inventar* on one toasts, makes it *aus dem Gepäck* and a row of
  M4; *Als Gruppe speichern* asks about the other alone, and *Weglassen* saves the Gruppe with it absent from M9.
* **E2E-M27-10** `local` (FR-31.6, FR-5.5, FR-25.24, FR-25.31) — **implemented** (`excursions.spec.ts`): a line's menu
  offers M4's entries in M4's words (*Change the amount*, *Do not pack this*, *Buy there*, *Remove from the list*) and
  not the suitcase's (*Pack*, late packer); the amount through M4's popover is one act with one undo; the skip and the
  removal each leave the list and come back from the snackbar's *Undo*, and *Buy there* is undone back to packing.
* **E2E-M27-11** `local` (FR-31.6, FR-25.11, FR-25.16, FR-25.29) — **implemented** (`excursions.spec.ts`): the bar's
  search narrows the list, a search with no match shows *No matches* and M4's reset; two person cards are two chips
  and a cluster then shows those two people's lines, the reset brings the third back; fold-all folds the group to its
  open count and back; a fully packed list says *All done*.
* **E2E-M27-12** `local` (FR-31.6, G-9) — **implemented** (`excursions.spec.ts`): a tap opens the line's sheet with
  `?line=` in the URL; the browser's back closes it and the excursion's list is what remains; at a desktop width the
  same tap opens M5's side panel beside the list, and no sheet.
* **E2E-M27-13** `local` (FR-31.6, FR-25.13f) — **implemented** (`excursions.spec.ts`): the inventory sheet's
  *packen* on a thing the excursion carries takes its line off the open list, *nicht einpacken* does too, and the
  row's undo brings it back after each.
* **E2E-M27-14** `local` (FR-31.1, G-17) — **implemented** (`excursions.spec.ts`): on a trip from 9 to 18 October,
  the new excursion's range sheet offers the trip's first and last day and disables the day before and the day after;
  two taps pick 12–13 October (the hint says *2 days*), and the list's row states both days.
* **E2E-M27-15** `local` (FR-31.15, FR-29.17) — **implemented** (`excursionTracks.spec.ts`): two GPX files added through
  the excursion's ⋮ stand as two lines on its route card above the progress card, each with its name and *„3.3 km · ↑
  300 m · 1 h 25"* (no climb for a file without heights). A line opens the full-screen map on its track; two steps of
  pauses there, and the track renamed through the map's ⋮, show on the line after the map is closed (*1 h 55*), and a
  download hands back the file as it was added. Both survive a reload. *Route* folds the card to its head — no map, no
  lines, *„3.3 km · ↑ 300 m · +1"* — and it is still folded after a reload. A line added to the list folds the card by
  default, and packing it opens the card again. With five tracks, *Track hinzufügen …* toasts that no more fit and asks
  for no file. A track removed through the map's ⋮, confirmed, closes the map and leaves the list, and M27's list shows
  the first one's distance and climb with *+3*.
* **E2E-M27-16** `local` (FR-31.15, FR-29.20) — **implemented** (`excursionTracks.spec.ts`): *Route zeichnen* in the
  excursion's ⋮ opens the editor on nothing; two taps on the map are joined along a path (the hiking profile asked),
  and saved — with no *Ersetzen* offered — as the excursion's first track, its climb on its line. *Bearbeiten* on its
  full-screen map opens the editor on the track's own file; a moved point saved as a new track stands beside it as
  *(variant)*.
