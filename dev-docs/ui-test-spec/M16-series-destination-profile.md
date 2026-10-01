# M16 — Series & Destination Profile

All four ids describe behaviour that is built, every one of them a *write* (the name, the three FR-15.1 defaults, a
destination profile created on first use, its checklist, attach and detach), and all four are implemented in
`client/e2e/series.spec.ts`. A promise here is read against the rendered screen rather than against a stylesheet
(G-14) — see the note below.

* **FR-13.3's checklist field must have a box.** Ionic gives `ion-select` `width: 100%`, which as a flex item is a
  flex-basis of the whole row, so the add-row's `ion-input` — flex-basis 0 — would render at **zero width** beside it;
  the select is therefore content-sized. No DOM query catches a regression: the native input is in the DOM and
  `getByTestId` resolves it, and only Playwright's *visible* check says it has no box. E2E-M16-02 is the standing
  assertion, because it types into that field.
* **E2E-M16-01** `all` (FR-13.1/15.1) — **implemented** (`e2e/series.spec.ts`): the series
  name and the three default selects are editable, and both are read back after leaving the screen
  and returning rather than off the control that wrote them (the defaults are selects). It also
  covers the **rename refusal** UI-Spec M16 states: renaming onto
  another series' name is refused on the client (`trip_series.name` is UNIQUE instance-wide), the
  toast names the holder, and the field goes back to the stored name — with a free rename after it,
  read off the header, which renders from the series and not from the field. **The trap:**
  `toContainText` on an `ion-select` matches its **options**, not its value, so
  `toContainText('Summer')` is true of a season select nobody has ever touched. The untouched second
  series is asserted first for exactly that reason, and the value is read from `.select-text`.
  Red-proved twice (blanking the attribute read, dropping the field's revert).
* **E2E-M16-02** `all` (FR-13.3) — **implemented**: with no destination profile in
  existence the checklist states its own emptiness; typing notes and adding an entry both go through
  `ensureDestinationProfile`, and the read-back after leaving and returning is what proves the row
  it created is real. The entry keeps its procurement mode, and removing it returns the empty state —
  the positive signal the two absence assertions stand against. Red-proved by dropping the write.
* **E2E-M16-03** `all` (FR-13.2) — **implemented**: the history lists the series' trips
  with their packed/total line, a trip in no series is *not* in it, and detach and attach move one
  each way. Detach sits on a row that is itself a link to the trip, so the case asserts M16 is still
  the rendered page afterwards — a `.stop.prevent` that stopped working would otherwise read as a
  pass. The attach is read back on **M2**, whose series header counts the trips: the write is a
  trip's `series_id`, not a list local to this page. Red-proved by making detach re-attach.
* **E2E-M16-04** `all` (FR-13.2/15.1) — **implemented**: *„New trip in series"* opens M3
  carrying the series *and its defaults*, asserted on `wizard-more-summary`, which is where the
  folded FR-2.1c step states what it is holding — and asserted **before** the default exists as well
  as after, so a summary that only ever names the series cannot pass for a prefill. The trends
  shortcut opens M12 on the series' most recent trip, rendered rather than routed. What the shortcut
  is *not*: M12's trend section itself needs archived series history and is E2E-M12-03's, on both
  halves; this case owns the edge, not the section.
* **Checked and deliberately left untested:** a series with no trips at all (its empty history line
  and the absent trends shortcut). It is reachable only by detaching every trip, both halves are one
  `v-if` over the same list this case already moves, and an id invented for it would be the coverage
  inflation this programme exists to avoid. The **clone entry** (FR-12.1, offered when the series has
  an archived trip) is likewise left: it is a router-link to M2-04's screen, which that case owns.
  Neither carries a `data-testid`, deliberately — a hook nothing addresses is the same „kept for
  later" as dead code.
