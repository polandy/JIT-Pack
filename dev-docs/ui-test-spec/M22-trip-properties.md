# M22 — Trip properties (new screen, FR-2.7)

Every id below is implemented and read against the screen. The trip's series is edited on M16, not here (see
below, and UI-Spec M22).

* **E2E-M22-01** `all` (FR-2.7): M4's G-12 cluster opens the editor, and a new name commits on blur and comes back
  through the store — asserted on the repainted M4, never on the URL. It also sets the dates through the
  `DateRangeField` sheet (G-17, ADR-080) and asserts the locale display (`Oct 3 – 10, 2026`) both optimistically and
  after a round trip back through M4.
* **E2E-M22-02** `all` (FR-2.7, FR-27.4): a traveller added to an existing trip extends the
  per-person positions **immediately**, and the screen reports what it did. The report is also the settled state the
  case waits on, so no clock is involved. The report is asserted as the sentence, not the digit `1` — which is
  equally true of *„1 item removed"* — so the screen cannot report the wrong half of FR-27.4's outcome.
* **E2E-M22-03** `all` (FR-2.7/FR-25.1): a traveller removed takes **their** row and never a sibling's. Three things
  this case needs in order to be able to fail, each learned by watching it pass when it should not have: the surviving
  row is **part**-packed rather than packed, because a fully packed row leaves the list through the FR-25.2 pack-out and
  takes the signal with it; its `1/2` is asserted *after* the removal, because a count and a name also pass against a
  removal that took both rows and a re-resolution that generated one back; and the case waits on the roster losing the
  row before it navigates, because navigating first races the removal and fails against correct code. Mutation-proved
  — detaching by position instead of by traveller reddens it.
* **E2E-M22-05** `all` (FR-2.7): a traveller whose own row is part-packed is removed **with** it — the confirmation
  offers the choice, states how many rows it concerns, and *Alles entfernen* deletes rather than unassigns. The
  sibling's untouched share stays hers, which is what proves the choice widens *what* leaves and not *whose* rows are
  considered. *„Deletes rather than unassigns"* is asserted as the number of Regenhose rows left: an unassigned row
  carries neither Zoe's name nor a child test id, so it satisfies *„Zoe's row is not there"* just as well.
* **E2E-M22-06** `all` (UI-Spec M22 / G-9/G-12, in `global-nav.spec.ts`): reaching the editor from the trip's menu —
  M2's row menu (G-12) — and getting the trip back from its chevron. It lives with the global patterns rather than in
  the M22 unit because the navigation defects it guards are global ones — a route that changes without repainting, and
  a back that leaves the previous screen on the display. Asserted on the painted page, and the return is checked against
  M4's own actions rather than against the absence of the editor alone. The return also asserts that the page head names
  the trip at every width (ADR-050).
* **E2E-M22-04** `all` (FR-2.7): a trip that has started keeps its roster and offers **no** removal control — the ✕ is
  gone, the reason is rendered under the list, and adding still works — not an `aria-disabled` control left on screen
  (see UI-Spec M22). Two traps this case pays for: the absence of an ability needs a positive signal, which is the note;
  and `[data-testid^="traveler-remove-"]` also matches `traveler-remove-note`, so a prefix locator counts the
  explanation as a button and can never reach zero — the locator is scoped to `ion-button`.
* **E2E-M22-08** `all` (FR-2.7): after an edit the trip is **still on M2**. The editor writes a partial upsert on
  purpose (field-level merge), but the optimistic row it applies locally replaces the whole row — so a save that drops
  `status` takes the trip off *every* M2 segment (M2 lists by status), with no pull in Local Mode to bring it back.
  Asserted on M2's planned list rather than on the trip screen, which the defect leaves looking perfectly correct.
  Mutation-proved.
* **E2E-M22-09** `all` (FR-9.4): a bottom toast is presented **above** the tab bar, asserted as
  geometry — the toast's bottom edge against the bar's top edge — because the question a screenshot cannot answer is
  whether a live overlay is covered or merely translucent. Two guards make the comparison mean something: the viewport
  is set to a phone (above 900 px G-9 hides the bar, and a `display: none` element measures as a zero-height box at the
  origin, against which every overlap assertion resolves in both directions), and both boxes are asserted to have height
  before they are compared.
* **E2E-M22-07** `all` (FR-2.7): the positive half — a **planning** trip renders one ✕ per traveller and no note.
  Without it, "no ✕ on a started trip" would pass just as well against a screen that never renders one at all.
* **E2E-M22-10** `all` (FR-2.7/FR-27.4): the archived trip's editor. UI-Spec M22's *States* line promises that *„on an
  archived one the whole screen is read-only"*; `TripEditPage.spec.ts` pins the two `DateField`s, and this case covers
  the name, the roster inputs and the add row. All four are asserted, against a roster that is demonstrably rendered so
  the absences are not read off a screen that failed to load. **Open decision:** `traveler-remove-note` is gated on the
  trip *not* having started, so an archived trip loses the ✕, the add row **and** the sentence together — nothing on the
  screen says why it answers no tap, the shape E2E-M22-04 rules out for the started trip. Build a sentence for the
  archived state, or accept the silence; the case asserts today's absence and is what has to change either way.
  Mutation-proved by dropping the name field's `readonly` binding.
* **E2E-M22-12** `all` (FR-2.1b/FR-2.7): the year is corrected on M22 and the trip moves in M2's
  list. Read back through the **list**, not through the field: a select repainting its own value satisfies an assertion
  on itself, and placing the trip is the year's whole job. Then re-opened from M2, because a value that only lives in
  the form's ref reads identically until something reloads. Red-proved by dropping the mutation.
* **E2E-M22-11** `all` (FR-2.7): the third roster affordance. UI-Spec M22 names *rename in place*,
  ＋ and ✕ per row; ＋ and ✕ have their own cases and this one operates the rename. What it
  asserts is the rule underneath rather than the new string: a rename is a rename, never a removal plus an addition, so
  the renamed traveller's **part-packed** share is still there with its `1/2` after a reload, and there are still two
  shares rather than three. The composable pins that on the mutation; the screen's blur handler reads the value off the
  Ionic host and no unit test sees it.

* **E2E-M22-13** `server` (FR-2.5, ADR-058): the roster's account picker. It has to be a
  multi-identity case rather than an `all` one: the picker offers `trip_members` and a trip with a single member
  renders no control, so `local` and `single` can only assert its absence — which `TripEditPage.spec.ts` does, beside
  the membership filter, both cheaper as rows than as a second browser. Alice shares the trip with Bob, records the
  traveller as Bob's account, and the value survives a **reload**: the write is optimistic like every other row edit,
  so the value standing straight after the tap says only that the screen painted it. Asserted on
  `ion-select .select-text`, the rendered value — an `ion-select`'s own text content is its whole option list, which
  stays green against a link the server refused (see the ledger's section on it).
  Red-proved by linking a non-member: `not_a_trip_member`, rolled back, the select back to *„Kein Konto"*.

* **E2E-M22-14** `server` (FR-2.5): the *add* row's account picker. A second
  case rather than a clause on E2E-M22-13, because it drives a different write: the traveller does not exist yet, so
  the account has to survive being created with them. Alice picks Bob before typing the name, presses ＋, and the new
  row reads Bob's name after a **reload**. It also asserts the picker returning to *„Kein Konto"* — a sticky value
  would silently make the next person the same account. What it cannot see is the ordering the write depends on (the
  link is a second mutation *after* FR-27.4's rows, so the account is not notified once per generated row); that is
  asserted on the queued mutations in `tripLifecycle.seam.spec.ts`, because the only browser-visible symptom would be
  a notification count on a third device.

**Two fields at the edge of M22's scope** (read against the template):

* **The trip's year is edited here.** FR-2.1b makes the year the one required temporal fact and `TripEdit` carries it;
  FR-2.7's own scope is *name, dates and travellers*, so the field is UI-Spec M22's addition rather than the PRD's.
  E2E-M22-12 asserts it.
* **The series a trip belongs to is edited on M16, not here.** `setTripSeries` has exactly one caller and it is
  `SeriesPage.vue`, whose *detach/attach trips* action UI-Spec M16 describes. Coverage of the attach/detach path is
  M16's question.

**One deterministic seam in the unit:** every `page.goto` in `trip-properties.spec.ts` waits on the G-2 indicator
returning to *on this device* first. A case that fills, blurs and navigates otherwise fails under load against
**correct code** — the reload discards the optimistic store, and the trip is on no M2 segment because the rename has
not reached IndexedDB yet. The screen's own repaint is not that signal: it is satisfied by the optimistic row alone.
The same shape as E2E-M22-03's note, in the other five cases that reload after a write.
