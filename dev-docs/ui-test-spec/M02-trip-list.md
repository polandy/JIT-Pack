# M2 — Trip List

* **E2E-M2-01** `local` (FR-2.1) — **covered, where the rule is actually exercised**: the segments *partition* the list,
  which E2E-M2-13c asserts from the other side (standing on *Archived*, the planned trip is `toHaveCount(0)`) and
  E2E-M2-13d again. The rest of the sentence is retired: ~~archived render muted with final stats~~ — the muting is a
  class the visual baselines own, and there are no *final* stats, an archived row carrying the same `packed/total`
  summary as every other row.
* **E2E-M2-02** `all` (FR-13.1): trips group under series headers with ~~destination +~~ count; tap header → M16. —
  **Implemented.** The header carries the series name and a trip count and **no destination**. The count is asserted
  as the *group's* (a third trip in no series must not be counted into it) and the grouping as containment rather than
  as a heading being present. The built screen's grouping by series is the rule by decision.
* **E2E-M2-03** `local` (FR-2.1/8.1) — **covered in three of its four parts and blocked on the fourth.** The name is
  asserted by every case that addresses `trip-row-<name>`, the dates by E2E-M2-12, the item summary by E2E-M2-10 (off a
  trip the device never opened; a planned trip draws no ring since UX-20, which E2E-M2-36 asserts). **Participant
  avatars are built** by decision, and this case's fourth part is asserted with them: the trip's *travellers* — the
  roster, not the presence facepile — as two faces and a „+N", plus a trip with nobody on it showing no pile at all,
  against a row that is demonstrably rendered.
* **E2E-M2-04** `local` (FR-12.1) — **covered**: M2's row actions open on a **hold or a right-click** as an action sheet
  (E2E-M2-19), and *Copy trip* is offered on an archived trip only (unit-owned in `trips.spec.ts`, `tripRowActions`).
  That the copy screen heads *Copy trip*, offers *Create copy* (UX-21: the family copies a trip, nobody clones one) and
  opens with the source's rows is E2E-M2-11 (`single`, ADR-033, the case that found ClonePage summing a partition the
  device did not hold); that ClonePage opens on a year of its own with empty dates is unit-owned in `ClonePage.spec.ts`
  — a *fresh* date is the absence of the source's, which is the shape a rendered case asserts worst.
* **E2E-M2-05** `server` (FR-4.5) — **implemented** (`e2e/server/multi-user.spec.ts`): Bob, an Editor on
  Alice's shared trip, is offered every other row action and not *Delete*; Alice, the owner, is. Her cancel leaves the
  trip where it was — without that half the confirm proves nothing about confirming — and her confirm takes it off her
  list and, after a reload, off Bob's, whose segment count is asserted first so the absence cannot pass against a list
  that has not arrived. `server` because `canDelete` reads the roster for the caller's own role: with one account the
  rule is inert by design, and the negative half exists nowhere else.
* **E2E-M2-06** `local` (G-8/FR-17.3) — **implemented** (`e2e/trip-list.spec.ts`): a device with no session
  is offered no *Share*, asserted against the row's other options so an empty menu cannot satisfy the absence. The
  positive half is E2E-FLOW-01's, on `server`.
* **E2E-M2-07** `local` (FR-18.3) — **implemented** (`e2e/trip-list.spec.ts`): the row menu's *Export trip*
  asks progress-or-clean and the answer reaches the file — the same trip and the same row both times, `packed_count: 1`
  in one and no `packed_count` at all in the other. Both branches, because one alone cannot tell a working choice from a
  constant.
* **E2E-M2-08** `all` (FR-16.2) — **implemented** (`trip-list.spec.ts`): an imported trip carries the chip
  and one made in the app does not. The imported trip is created **through M15**, the only writer of `trips.imported` —
  a fixture setting the column directly would assert the chip against a state the app cannot produce. Red-proved by
  dropping the render.
* **E2E-M2-36** `local` (FR-27.4, UX-20) — **implemented** (`e2e/group-refresh.spec.ts`): at 412 px a planned trip
  that took one change over from its group and has another waiting is **three lines** — name, the dates with the item
  count, one chip — counted off the label's line boxes, with no ring. Before, it was six. The chip reads „⟳ 2 changes
  · 1 open“; a tap opens the sheet without opening the trip (the row still on screen), the open change in its first
  block and the taken-over one in its second, and *Zur Reise* opens the trip on the proposal card naming the waiting
  change. In `group-refresh.spec.ts` because that is where a trip following a group is built through the app.
* **E2E-M2-09** `local` (FR-18.4) — **covered by E2E-G9-12** (`e2e/global-nav.spec.ts`), which reaches M18 from the trip
  list and comes back to it. The entry is the word *Datei importieren* behind the app bar's ⋮, beside M15's *Tabelle
  importieren* (G-12, ADR-050 amendment 1); E2E-G12-02 asserts both words and that neither is a glyph.
* **E2E-M2-17** `all` (FR-21.15): M2's *Active* segment draws the running trip that departs **soonest**
  as a hero card, does not also list it as a row, leaves the later departure a row, opens the rows' menu on a
  right-click (its *Archive* entry shown, then cancelled), and still exports from the card's menu.
  Two running trips, because with one the choice cannot be told from the only trip there was — and the two are ordered
  so that M2's own newest-first list would name the *other* one, which is what makes the shared rule falsifiable
  (mutation-proved: replacing `heroTripOf` with the head of the screen's list turns the case red naming Kreta). The
  export and the menu are the clauses that carry the lift: a card without the row's actions is the cost FR-21.13
  deferred the card over.
* **E2E-M2-35** `local` (FR-21.15, UX-06): on its third of fifteen days the hero states the phase word and the day
  counter **as M1 renders them** — read off M1's hero in the same run, not off a constant both could drift from — and
  carries no button at all (the card is on screen first, so the absence is about the card); its ⋮ opens the rows' menu
  with *Trip properties*, *Export trip*, *Finish trip* and *Delete trip* as words, without opening the trip.
* **E2E-M2-35b** `local` (UX-06), Chromium only: the ⋮ is there with a mouse, and gone once CDP switches touch on —
  the hold (a `contextmenu`) still opens the menu. Touch emulation is the one way to turn `(hover: hover) and
  (pointer: fine)` over inside a running page, and WebKit has no CDP.
* **E2E-M2-19** `local` (FR-4.5/FR-9.1/FR-18.3): **a right-click on a trip row opens its row menu** — the M4/M7
  shape — headed by the trip's name and listing exactly *Export trip*, *Start trip*,
  *Delete trip*, *Cancel* for a planned trip on a device with no second account. Choosing *Start trip* closes the sheet
  and moves the trip off *Planned* (the row is gone, *Active* counts one) while M2 stays on screen — the choice did not
  also navigate. A second row's menu, cancelled, leaves that row a door: a plain tap then renders M4 with that trip's
  name in the page head. `contextmenu` rather than a held pointer, the suite's convention (`helpers/m4.ts`): the 500 ms
  are `useLongPress`'s, and the hold's wiring to it is unit-owned in `TripListPage.spec.ts` with fake timers, as is the
  guard that ignores a tap while the sheet is up.
* **E2E-M2-16** `all` (G-7): M2's empty state states which segment is empty and offers **no CTA of its
  own** — the FAB is the way out, on screen either way (M7's reasoning). Its own number rather than a second definition
  of E2E-G7-01, whose case tests the Dashboard's half: the gate allows one definition per id. Asserted against the state
  going away once there is a trip — an empty state that is always on screen would satisfy the visible half on its own.
* **E2E-M2-15** ~~`all` (M2 ordering): the list renders **flat** — no series section headers — with the
  active trip first, upcoming trips **ascending** by date and archived ones descending, the series a chip on the row
  that opens M16 without also opening the trip.~~ — **struck by decision**: the built screen is the rule.
  `TripListPage` groups by series with a tappable header, sorts every segment strictly newest-first through
  `tripOrderKey`, and renders no series chip. The promise that survives is E2E-M2-02's.
* **E2E-M2-13/13b/13c/13d** `local` (FR-2.8) — **implemented** (`e2e/trip-list.spec.ts`): with no active
  trip and one planned trip, opening M2 lands on **Planned** and renders that trip; with neither active nor planned and
  one archived trip, it lands on **Archived**; with nothing at all it stays on **Active** and shows the G-7 CTA. A third
  leg proves the rule cannot steal a non-empty segment: standing on *Archived* with trips on it, leaving M2 for another
  tab and coming back keeps *Archived* — which is also the only leg that exercises the re-entry hook rather than the
  mount. A fourth: `?status=active` with an empty *Active* still lands there, because the caller outranks the walk.
  `local` throughout, because the walk needs a device whose whole trip world the test built.
* **E2E-M2-14** `single` (FR-2.8, ADR-033) — **implemented** (`e2e/single/opening-segment.spec.ts`): the
  jump waits for a settled list. With the master pull held, M2 shows the segment labels **without counts** and stays on
  *Active*; when the pull completes it decides once. The held pull is the whole case — against an unsettled list the
  rule would send every cold start to *Archived* and, because it decides on entry only, leave it there. Which segment it
  then lands on is deliberately not asserted there — the `single` run shares one database, so other tests' trips are in
  the list too; it asserts that the segment it chose is one that holds trips. The counts as rendered text (`0` on an
  empty segment, nothing while unknown) are E2E-M2-13's, and the settled guard's own failure mode is unit-proved in
  `TripListPage.spec.ts` by flipping the signal after the assertion.
* **E2E-M2-18** `single` (FR-2.8, ADR-033, G-7) — **implemented** (`e2e/single/opening-segment.spec.ts`):
  the *screen* waits too. The same held pull as E2E-M2-14, one layer up: while the master partition is outstanding M2
  shows „Reisen werden geladen …" and **no** `m2-empty`, and once it lands the notice goes and the trip is on its
  segment. Both halves are asserted together on purpose — the absence of the empty state means nothing without a
  positive line saying what the screen is doing instead, and it is the pair that separates "guarded" from "rendered
  nothing at all" — an unguarded screen shows `m2-empty` in exactly that window.
* **E2E-M2-34** `local` (FR-2.7, FR-9.3, G-12) — **implemented** (`trip-list.spec.ts`): the trip's properties and
  lifecycle steps are M2's alone. The row menu's *„Trip properties"* renders M22; *„Start trip"* moves the trip off the
  planned segment; on the running trip's hero *„Finish trip"* renders M4 **in the closing pass** (the banner), with the
  `closing` flag gone from the URL, and the trip is still running — the pass is what archives.
