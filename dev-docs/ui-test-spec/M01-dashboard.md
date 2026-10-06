# M1 — Dashboard

> **Audit of backlog item 6.** Two of the six ids are implemented (`e2e/dashboard.spec.ts`) and **three describe a
> surface that is not built** — open, deliberately untested. The visual baseline is taken on a fresh Local Mode with no
> trips, and every other spec passes *through* the dashboard on its way somewhere, so these cases are the only ones that
> render a populated M1.

* **E2E-M1-01** `all` (FR-6.1) — **implemented** (`dashboard.spec.ts`), and two of its clauses are not the
  screen's. What is asserted: an **active** trip renders a card, the card counts what is open, previews three rows and
  reports the remainder as "+N more". The card is the hero (FR-21.13), so the counts are read as its two lines — the
  share beside the ring and what is still owed under it — plus the ring's own accessible name, rather than as one
  summary sentence; the preview and the "+N more" line sit *inside* the hero. The empty state's absence is asserted
  beside it, as the positive signal that the trip is active — M1 filters on the status, so a trip nobody started
  renders exactly the screen no trip at all does.
  ~~my open items~~: the dashboard is **not filtered by person**, it aggregates every open row of every active trip.
  FR-6.1's *"assigned to them"* is struck by decision: a filter would empty the screen in Local and Single-User Mode,
  where there is no account to be assigned anything. The *highlight* takes its place — the delegation becomes visible
  without the list becoming personal (E2E-M1-03). The aggregation this case asserts is therefore the screen's settled
  shape, not an interim one. ~~next 3~~: "next" names an ordering **nothing defines** — the preview is the first three
  of the store's own array, whose order after a reload is IndexedDB's over random ids. The case asserts three of four
  rows and the fourth counted, which is the rule the screen actually keeps.
* **E2E-M1-02** `all` (FR-7.3/7.6) — **implemented** (`dashboard.spec.ts`): a row's open preparation is listed in M1's
  **one** *Aufgaben* card, named by the **chip** of the row it prepares, and the card **offers nothing to tick** — M1
  takes no actions, so it carries no checkbox. Resolving the todo in M5, reached through the chip, is what clears the
  card; that is the positive signal that the card reads the todos rather than a copy of them. ~~grouped by item~~ in a
  card of its own (*Prep to do*): FR-7.6 names the row by its chip instead. ~~ticking one resolves it~~: struck, M1
  takes no actions. The hero's own task block of a finished packing is the exception and is worked (FR-7.10,
  E2E-M1-26).
* **E2E-M1-03** `server` (FR-6.1/6.3/4.4) — **implemented** (`server/multi-user.spec.ts`): Alice assigns a
  row and it appears on Bob's dashboard **while he is looking at it**, marked new, without a reload; opening it leads to
  the row; and coming back the same row is listed and not marked as news. Every assertion is scoped to **this case's
  row** rather than to the section, because the instance is shared and a sibling case delegating to the same account
  puts a section on the screen — the reason E2E-FLOW-02 filters its toast by item, the same trap here. Red-proved
  by dropping the join in `domain/dashboardSections.ts`.
* **E2E-M1-04** `all` (FR-6.3/G-4) — **half covered, half unbuilt.** That the card leads into M4 is asserted inside
  E2E-M1-01 — tapped on a preview row, and *in the document*: a mark left on `window` before the tap must survive it,
  since an `ion-item` inside the card's link can turn the tap into a full page load. ~~at the item~~: the preview rows
  are plain list items, not links, so M1 has no per-item deep link; the G-4 landing itself is E2E-G4-01's, from a
  notification. The clause is retired here rather than left open, because the screen answering it would be a *new*
  affordance and G-4's own case already keeps the promise it names.
* **E2E-M1-05** `all` (G-7) — **implemented** (`trip-creation.spec.ts`, with E2E-M3-10): the empty state offers exactly
  one way forward and it reaches M3.
* **E2E-M1-06** `all` (**FR-5.1**, not FR-5.4) — **implemented** (`dashboard.spec.ts`): a trip departing **today**
  contributes its flagged, still-open rows to a cross-trip section, and only those rows; the section leads to each row.
  The clock is *set by the case* to half past midnight in Zurich, still the day before in UTC, so the section is
  proved to read the device's local day (`orchestrator.today()`) — the rule itself takes the date as a parameter
  (`domain/dashboardSections.ts`).
* **E2E-M1-06b** `all` (FR-5.1): the same flagged row on a trip departing **later** produces no
  section at all. The positive signal is the trip card, which is on the screen either way, because an absence read off a
  page that failed to load says nothing.
* **E2E-M1-07** `all` (FR-7.3/7.6): the **chip** on a task opens **that row's** sheet, asserted on the sheet's own
  todo rather than on the trip having opened. UI-Spec M1 promises the jump, and the chip carries it (FR-7.6). The
  section's name is its head and the number its count (FR-21.28), and the block under it carries `.jp-card` — the
  assertion that M1 is drawing the app's card rather than Ionic's, which no screenshot of this screen shows.
* **E2E-M1-09** `all` (FR-21.13): the trip departing **soonest** is the hero; the later one is
  still a list card. The case seeds **two** active trips on purpose — the promise is a singular, and a screen with one
  trip would be green whether the rule said "the one" or "every one". The later trip's visible card is the positive
  signal beside the absence, so "no second hero" reads as a shape rather than as a trip that failed to render. Both
  trips carry a **departure date**, and that is the case rather than the fixture: two dateless trips would make the
  hero an ordering nothing defines — green on Chromium, red on WebKit. The rule lives in the screen
  (`byDepartureSoonestFirst`), not in the assertion.
* **E2E-M1-08** `all` (FR-6.1), with the planned-trips section: a trip left in `planning` by the
  wizard is listed on M1 *as planned*, with its period, and leads to the trip. Three assertions carry it rather than
  one, because each alone passes on a wrong screen: the section could be a screen that stopped filtering by status (so
  the trip must **not** also be an active card), and the absent card could be a screen that shows the trip nowhere (so
  the section must be there). **Starting the trip is the positive signal behind the absence** — the same trip changes
  sides, which is what says the section is keyed on the status rather than listing a leftover. The section carries
  head, count and the card class on the block (FR-21.28), the same way as E2E-M1-07.
* **E2E-M1-10** `all` (FR-7.4) — **implemented** (`dashboard.spec.ts`). Trip
  todos written in M4 are reported on M1's *Aufgaben* card, read-only: the trip's own check (*„1 von 2 erledigt"*), its
  open todo as text and not its resolved one, the card line *„Aufgaben: 1 offen"*, and **no control on the card** (no
  checkbox, field or button). A second active trip without todos is absent from the card — an absence that means
  something only because the first trip is on it. The trip's block leads into the trip, where M4's section is visible.
* **E2E-M1-11** `all` (FR-7.4) — **implemented** (`dashboard.spec.ts`). Packing and tasks are two
  answers, asserted both ways on one trip whose only row is packed. With no trip todo the hero has no second figure;
  with one open (added in M4), the hero's share still reads complete **and** its todo figure reads *„0/1 Aufgaben"* as
  the share's pair — asserted at desktop width (side by side) and at 360 px (stacked); resolving it in M4 turns the
  figure to *„1/1 Aufgaben"* while the share reads the value it read before — the before/after pair on one locator is
  the signal, since „unchanged" alone is green on a card that never rendered the share. The reverse half unpacks the
  row: the share drops, the todo figure stays at *„1/1 Aufgaben"*. The hero shows a figure; E2E-M1-10 keeps the
  one-line check, on a list card.
* **E2E-M1-12** `local` (FR-30.7/30.5) — **implemented** (`dashboard.spec.ts`): a running trip's
  shopping card opens on *At destination* with its *Buy there* packing row, tagged *Packing list*; a planned trip with a
  *Buy before* row has a card titled *„Shopping · Elba 2027"* open on *Before the trip*; a planned trip with nothing to
  buy has **no** card (asserted beside its rendered row); the card's last line leads onto M6, with the switcher's
  *Shopping* pill current.
* **E2E-M1-13** `local` (FR-30.7) — **implemented** (`dashboard.spec.ts`): the card is worked. An
  entry typed there lands on the shown list; checking it off shows the card's undo, and *Undo* brings it back; checking
  the packing row off packs it (FR-3.3) — the hero's share reads *1/1 packed* on the same screen — and M6 then shows the
  entry open and the packing row under its reveal.
* **E2E-M1-03b** `local` (FR-6.1, G-8): Local Mode carries no delegation section, and the
  aggregation below it is still complete. The second half is the point: it is why FR-6.1's personal *filter* is struck
  rather than built.
* **E2E-M1-14** `server` (FR-7.9, FR-7.13) — **implemented**
  (`server/trip-notes.spec.ts`): the *Neue Notizen* card, M1's one deliberate exception to "M1 takes no actions"
  (decision 2). A second member's dashboard lists another's thread by its title, quoting the newest entry they have not
  seen with its writer (*„Alice: 044 555 01 00"*), and the trip's name; ticking it there is the same write M26 offers,
  so the card drops the row — asserted on the card itself, since an emptied card must not stay behind with nothing in
  it. A reply brings the thread back, quoting the reply, and the words open **that thread's own view**, named by its
  title.
