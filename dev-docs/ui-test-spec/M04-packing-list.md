# M4 — Packing List (core)

* **E2E-M4-01** `all` (FR-8.1/7.3): the single header line shows packed/total, weight and the open-prep count (the
  latter only when todos exist), and stays **unfiltered** while a filter or search narrows the list below it. Analytics
  is reached from the 📊 icon on the trip line, not from the header (the KPI-tile entry is gone, G-12).
* **E2E-M4-29** `all` (trip screen) — **implemented**, and one clause retired. Landing **directly** in M4 from M2 or M1
  is asserted by `expectTripOpen` at every caller in the suite; the archived trip's closing card, *Vorlage aus dieser
  Reise* and the M14 suggestions are E2E-M4-53/54's and E2E-M21-01's. *„No phase tab bar anywhere in the app"* is
  **retired**: it guards a design that was never built, so there is nothing to regress to — an assertion on the absence
  of a screen that does not exist has no positive signal and would stay green through any defect.
* **E2E-M4-02** `all` (FR-8.2): grouping switcher Category/Container/Person/Status; selection persists per user per trip
  (survives reload; a second user/other trip unaffected).
* **E2E-M4-03** `all` (FR-5.1/G-6): item rows show state, stepper/checkbox and the mode, late-packer, traveler and
  packer marks. Each is asserted where it belongs rather than as one omnibus case — the row's two columns in E2E-M4-56,
  the traveler in E2E-M5-19, the packer/assignee edge in E2E-M4-30 — so this entry is a description of the row and not
  a case of its own. **There is no container chip, by decision**: M4 answers *which bag* by grouping (FR-8.2), not by a
  chip, and the right edge stays as FR-25.19 defines it — a fifth mark there is exactly what that requirement keeps off
  the row.
* **E2E-M4-04** `all` (FR-5.6/9.1): inline quick-add with master-item autocomplete; free text creates an ad-hoc item; on
  an active trip new items auto-flag *Missing*; input stays expanded.
* **E2E-M4-05** ~~`all` (FR-5.2): swipe right → *Packing Now*.~~ **Retired**: M4 has no swipe. Press-and-hold carries
  every action the gesture did (backlog item 11); `ion-item-sliding` survives on M2's trip list alone. The claim itself
  lives on in E2E-M4-49.
* **E2E-M4-06** ~~`all` (FR-4.3/5.5): swipe left → assign-to-me or skip.~~ **Retired**, with E2E-M4-05. The behaviour
  it described is covered by the press-and-hold menu: E2E-M4-37 skips, E2E-M4-38 undoes, E2E-M4-39 un-skips, and the
  collapsed *Erledigte* section is E2E-M4-23's.
* **E2E-M4-07** ~~`all` (FR-20.2): skipping cascades co-skip of dependent companions with a reason.~~ **Retired as a
  duplicate**: E2E-M4-40 asserts exactly this sentence — the cascade, the single snackbar naming the companion, the
  reason on the revealed row and the one undo restoring all of it. Two ids for one rendered outcome is how a suite
  grows a case that only ever re-runs another.
* **E2E-M4-08** `all` (FR-7.3) — **implemented** inside E2E-M4-25, which is its lifecycle: open prep todos render a
  count badge on the row (`m4-prep-badge-<name>`), and it is gone once the todo is. **The amber „packed with open prep"
  style is M5's, not M4's, by decision**: on M4 a row with open prep is distinguished by *staying on the list* plus its
  badge, and no amber is asserted here.
* **E2E-M4-25** `all` (FR-7.3/25.2) — **implemented** (`e2e/packing-list-sheet.spec.ts`): the full lifecycle
  in one case — an item packed while a prep todo is open stays **visible** and does **not** count as done (asserted on
  the reveal bar being absent, which is the positive signal for „nothing is done"); **resolving its last todo makes it
  done and it leaves the list**; revealing brings it back without a badge. The regression guard is the point and is
  mutation-proved: handing the view an empty `itemsWithOpenPrep` reddens it. The entry's second direction — *an item
  with a todo but no stored count still shows its badge* — is retired: no count is stored (FR-7.3), so there is no state
  to assert against.
* **E2E-M4-09** ~~`all` (FR-7.2): an item with open tasks refuses completion with an inline hint.~~ **Retired — the
  rule is reversed.** It restates PRD_Base FR-7.2 (*„An item cannot be fully marked as ready until all nested
  tasks are Resolved"*), which the Addendum's FR-7.3 overrides and the Addendum wins: packing such a row is *allowed*
  and produces the „packed with open prep" state, which stays visible and does not count as done (FR-25.2). There is no
  refusal and no hint in the screen, deliberately — refusing the tap would leave a packed rucksack the app says is
  empty. What the id was reaching for is E2E-M4-25.
* **E2E-M4-10** `server` (FR-4.4) — **implemented** (`e2e/server/multi-user.spec.ts`, inside E2E-FLOW-01): a row Alice
  packs reaches Bob's screen **without a reload**, carrying her name — the attribution is the server's own stamp
  (invariant 3), which is what makes it worth two accounts. The *animation* the entry also named is not asserted and
  will not be: motion is spec §3's untestable half, and the suite runs with it reduced.
* **E2E-M4-11** `all` (FR-3.2) — **implemented** (`e2e/packing-list-sheet.spec.ts`): the shopping entry is always
  there — M6 is a screen, not a notification — and carries a **count only when something is to be bought**, since a
  zero is worse than no number at all. The entry is a **word in the bar's ⋮** (ADR-050) and the count rides in the word,
  because an action sheet renders no badge; the case reads the menu's entries. Archiving is E2E-M4-54's (*Fertig*
  archives and lands on M14).
* **E2E-M4-12** `all` (FR-25.8/25.1, FR-25.28) — **implemented** (`e2e/membership.spec.ts`,
  one case): asserted in the same case as E2E-M4-58, whose *two of three at different amounts* is this entry's world
  with the numbers pulled apart; every clause below is a clause of that case, and running both would run one rendered
  outcome twice. The entry: a quick-add with two travelers lit in the composer's for-whom strip produces **one named
  cluster** with exactly two indented child rows, each showing its traveler and its own working control — and **no
  editor opens**: no modal is presented and M5 is absent, while the strip still holds the choice for the next add.
  Asserts there is **no** second top-level row repeating the name — the regression it guards is N separate items, where
  every individual row looks right and only the grouping is wrong, so the assertion must be on the cluster structure
  and the absence of duplicate top-level rows, not merely on "two rows of that name exist".
* **E2E-M4-13** `all` (FR-25.1 flat fallback) — **implemented** (`e2e/membership.spec.ts`, inside E2E-M5-19): a
  per-person item with exactly **one** member renders as an ordinary flat row labelled with that person („Kurze Hosen ·
  Andy“), **not** a one-child cluster — both halves asserted, since a cluster of one would also name Andy in its child.
  The state is reached by a membership of one, not by a quick-add: FR-25.8's mode is **absent** on a trip with one
  traveler (G-8) — which is where E2E-M5-19 already arrives.
* ~~**E2E-M3-13 (v1.0 catalogue, shadowed)** `all` (FR-2.5a): travellers configured in M17 are already in step 2 of the
  next new trip, in order, and removing one there still works.~~ — **retired as a duplicate**: **E2E-M3-14** is the same
  promise, and its test body carries every clause of this one — the M17 configuration, the three names in step 2, the
  **order** (the first is Andy) and the removal that makes them a starting point rather than a rule. The number's live
  meaning is FR-27.7's preparation tasks.
* ~~**E2E-M3-12 (v1.0 catalogue, shadowed)** `all` (FR-2.1c): step 1's optional inputs are **absent** until *Mehr
  Optionen* is opened, and a value set behind the fold is stated on the folded row.~~ — **retired as a duplicate**:
  **E2E-M3-16** is the same promise, implemented in `global-nav.spec.ts`, and it asserts both halves
  including the folded row naming the date it holds. The number's live meaning is FR-27.3's single master items.
* ~~**E2E-M3-11 (v1.0 catalogue, shadowed)** `all` (FR-2.1b): a trip is created with **no date touched at all**, and
  reads by its year in M2 where a date line would be.~~ — **retired as a duplicate**: **E2E-M3-15** is the same
  promise and is implemented in `global-nav.spec.ts`. The number's live meaning is FR-27.1/27.2/27.6's composition
  step, which the suite carries.
* **E2E-M4-20** `all` (FR-25.11b-rev): the filter panel has **no apply button** — asserted as *absent*, not merely
  unused — and a facet value bites while the sheet is still open: the head's outcome line and the list behind it both
  follow the tap. Closing only closes.
* **E2E-M4-15** `all` (FR-25.11a/b): M4 shows a single filter row; tapping it opens the sheet with *Gruppieren nach*
  plus the six facet groups (Person, Kategorie, Beschaffung, Gepäck, Merkmale, Status per FR-25.11l). Selecting a
  person narrows the list, and the selection appears as a removable chip in the collapsed row; tapping the chip's ×
  restores the unfiltered list. Asserts the grouping switcher is **not** present as a second bar in the header.
* **E2E-M4-16** `all` (FR-25.11c) — **implemented** (`domain/__tests__/packingView.spec.ts`: *ORs the values within one
  facet* / *ANDs across facets*): the OR-within / AND-across rule is arithmetic over a row list and is asserted where it
  lives. Building the world it needs through the browser — rows carrying two categories, three travelers and a buy mode
  — would cost a wizard run and three sheets to re-check a decided function. E2E-M4-20 already proves the panel is wired
  to it.
* **E2E-M4-17** `all` (FR-25.11d) — **implemented** (`domain/__tests__/packingView.spec.ts`, four cases): a value counts
  against the *other* active facets but not its own, dead ends are not offered, counts run over open rows only, and a
  selected value stays listed at zero so a filter can always be undone from the panel. Same reasoning as E2E-M4-16.
* **E2E-M4-18** `all` (FR-25.11e): the "Alles erledigt 🎉" state appears **only** when nothing is narrowing the list.
  Four cases, all required: **search** with no match, **filter** with no match, **search + filter** together, and
  genuinely-everything-done. The first three must all show "Keine Treffer" naming what is in force; only the fourth
  may celebrate. The reset offered clears **everything** narrowing — after pressing it, both the search term and the
  filter set are empty and the list is back. Regression guard: searching for a string the list does not contain must
  not announce completion — a check on the filter count alone would.
* **E2E-M4-19** `all` (FR-25.11f) — **implemented**, in two places on purpose. That the shared bucket
  **leads** the Person facet is `packingView.spec.ts`'s (*leads the person facet with the shared bucket rather than
  sorting it in*), because the sort lives there. The **word** is `e2e/packing-list-sheet.spec.ts`'s, because the unit
  deliberately labels only the values it can and leaves UI copy to the caller: three facets address absence with the
  same empty value, and one shared label makes Person read as „keine Kategorie". The case asserts the Person bucket's
  label differs from the Category bucket's and is not a form of *Alle* — the FR's own wrong answer, since the bucket
  means *nobody in particular*, not *everybody*.
* **E2E-M4-85** `all` (FR-25.11l): selecting **Status → Bewusst weggelassen** with *Erledigte* off shows the skipped
  row and hides everything else — proving the override, not just the bucketing (`packingView.spec.ts` already proves
  the arithmetic; this is the panel wiring). Then switching to **Status → Gepackt** shows the packed row instead. The
  chip row names the picked value the same way every other facet's chip does.
* **E2E-M4-87** `all` (FR-25.25) — **implemented** (`e2e/packing-list.spec.ts`): the late-packer
  flag set from the row's own press-and-hold menu. The rendered ⏰ is the evidence the write landed; reopening the
  menu and finding *„Spätpacker aus"* in place of *„ein"* is the evidence the entry states the row rather than a
  constant. Then off again, so neither direction is assumed from the other.
* **E2E-M4-119** `all` (FR-5.9) — **implemented** (`e2e/packing-list.spec.ts`): *Vor Ort kaufen*
  from the row's own menu. The row's *Buy there* badge is the row reading its mode back; M6's *Vor Ort* tab listing it
  is the same write reaching the other screen that reads it. Reopening the menu finds *Doch mitnehmen* in place of the
  entry, and taking it removes the badge again; its snackbar's undo (FR-25.31) brings the badge back.
* **E2E-M4-88** `all` (FR-25.26) — **implemented** (`e2e/membership.spec.ts`): the cluster head's
  fan-out. The menu names its scope („2 rows") before the action, and the flag is asserted **per instance in M5**
  rather than on the head — the head paints its ⏰ when *any* instance carries the flag (FR-25.23), so a head-only
  assertion is green against a fan-out that reached one row of two. The way back off it closes the case.
* **E2E-M4-89** `local` (FR-25.25, G-8) — **implemented** (`e2e/packing-list.spec.ts`): Local Mode
  renders no assignment seat on a row, because there is no second account to hand it to. Deliberately the negative
  half of E2E-M4-90: asserted alone it would also pass against a build where the control was never wired at all.
* **E2E-M4-90** `server` (FR-25.25) — **implemented** (`e2e/server/multi-user.spec.ts`): the row's
  own avatar hands the row to the other account, without M5. The row then **leaves** the list (FR-25.20) with the
  reveal bar naming the assignee — which is both the rule and the settled signal that the write landed — and the same
  control takes the assignment back.
* **E2E-M4-91** `local` (FR-5.8) — **implemented** (`e2e/remove-item.spec.ts`): an untouched row is
  removed from the row menu at once. The entry is the last before *Cancel*; the pack snackbar is the positive signal
  that the no-dialog path ran; the row is gone **and no reveal bar appears**, which is what tells a removal from a skip.
  The undo brings the row back, and a second removal survives a reload — the delete reached IndexedDB.
* **E2E-M4-92** `local` (FR-5.8 with FR-20.2) — **implemented** (`e2e/remove-item.spec.ts`):
  removing a main item with a required companion asks first and the alert names the companion; *Cancel* leaves both
  rows on the list (the positive signal that it was a question). Confirmed, the main item is gone from the done rows
  too while the companion is among them, skipped. Mutation-checked: with `removalNeedsConfirm` forced to `false` the
  case fails at the alert. The alert also says the main item leaves the inventory (ADR-065), and once confirmed M9
  lists *Akku* — its skipped row still uses it — and no *Drohne*. The confirmed removal has an undo (FR-25.31), so M9
  is read once its snackbar has gone.
* **E2E-M4-95** `local` (FR-5.8, G-9) — **implemented** (`e2e/remove-item.spec.ts`): at a desktop
  width, removing the row whose M5 panel is open closes the panel rather than leaving it to report the item as not
  found. Mutation-checked: without the close the panel is still counted.
* ~~**E2E-M4-113 (ADR-065, collided)** `local` (FR-5.8): the removal that takes its unused inventory item along.~~ —
  **renumbered to E2E-M4-115**: the live meaning of E2E-M4-113 is FR-25.30's case (`membership.spec.ts`).
* **E2E-M4-115** `local` (FR-5.8, ADR-065) — **implemented** (`e2e/remove-item.spec.ts`): two rows
  typed into the composer, so two inventory items used nowhere else. Removing *Zelt* announces *„from the inventory
  too"*; undone, and the screen left, M9 still lists *Zelt* — the undo lapsed nothing. Removed again and the snackbar
  left to run out, M9 lists *Schlafsack* and no *Zelt*. Mutation-checked: without the prune the last assertion fails;
  with a prune at removal time instead of at the lapse, the M9 check after the undo does.
* **E2E-M4-116** `local` (FR-5.8 with FR-25.21) — **implemented** (`e2e/remove-item.spec.ts`): a
  per-person item for two travelers, both instances packed; removing one traveler's instance from its own row asks
  first, naming **one** packed unit rather than the cluster's two, and takes only that row. The cluster dissolves into
  the other traveler's row, still packed, and a reload reads the same — taken once the snackbar has gone, since the
  delete is written when its undo lapses (FR-25.31).
* **E2E-M4-120** `local` (FR-25.31) — **implemented** (`e2e/undo-every-act.spec.ts`): a packed row,
  revealed and un-checked, raises the snackbar (*„unpacked"*); its undo packs it again — the reveal bar, gone with the
  last done row, is back and the check is set. Replaces E2E-M4-35's absence.
* **E2E-M4-121** `local` (FR-25.31 with FR-25.24 and FR-5.8) — **implemented**
  (`e2e/undo-every-act.spec.ts`): the amount raised to 2 through the row menu's popover is announced once the popover
  closes, and undone the check is back; a ＋ step (*„1 of 2 packed"*) is undone to *0/2*; and a **confirmed** removal of
  the row carrying that unit is undone to *1/2*, which a reload still reads — the row was never deleted.
* **E2E-M4-122** `local` (FR-25.31 with FR-25.25) — **implemented** (`e2e/undo-every-act.spec.ts`):
  *Late packer on* from the row menu, undone; the menu then offers *on* again and no *off* — the row's own answer.
* **E2E-M4-123** `local` (FR-25.31 with FR-9.3) — **implemented** (`e2e/undo-every-act.spec.ts`):
  in the closing pass one tap on a row's mark raises the snackbar, and its undo leaves the mark unpressed.
* ~~**E2E-M4-124**~~ **struck (FR-7.7): its promise moved to E2E-M25-06**, with the screen the trip's own tasks are
  removed on.
* **E2E-M4-125** `local` (FR-25.31 with FR-5.5 and G-3) — **implemented**
  (`e2e/undo-every-act.spec.ts`): *Doch einpacken* on a skipped row, undone, leaves it skipped again (the reveal bar is
  back); *Packen* (the claim), undone, takes the row's own-claim note away.
* **E2E-M4-129** `local` (FR-21.17) — **implemented** (`packing-list-sheet.spec.ts`): on a 390 px
  phone, a search's few hits overflow their screen by 150 px — past the yield threshold, short of what yielding frees.
  Scrolled to the end, the header line never changes state and the offset stays at the end. Red before the guard: two
  class changes and an offset back near the top.
* **E2E-M4-135** `all` (FR-21.17) — **implemented** (`packing-list-shape.spec.ts`): with the head
  yielded by a reader's own flick, the list carried to its end **and that flick over** — the screen says so, and a
  scroll is only nobody's once it is — a row that has gone off the top is brought back into view the way the browser
  does it, `scrollIntoView`, which nobody asked for. The header line does not change state once (counted, not sampled),
  and the row moves by the scroll and by nothing else. Red before the rule on both engines: one class change, and the
  row 162 px down on a 60 px scroll.
* **E2E-M4-150** `all` (FR-21.17) — **implemented** (`packing-list-shape.spec.ts`): the list at its top and at
  rest, an upward wheel that cannot scroll — the gesture window is asserted open, and nothing will close it — then a
  focus moved to the last row's first control, which the browser scrolls into view. The scroll is asserted (well past
  the yield threshold), the window is closed, and the header line does not change state once. Red before the rule on
  both engines: one class change, the head yielded under a focus.
* **E2E-M4-153** `local` (UX-03, FR-25.28, FR-21.19) — **implemented** (`packing-list-shape.spec.ts`): at 412 px, the
  sample trip's *Kleidung* group imported as the seed writes it (a shared stepper row, a three- and a two-person
  cluster, three travelers) and a lone per-person row in another group. Every item row and head carries its seat; the
  seat is the row's mark (🧦, no glyph of its own) or, on the lone row, the traveler's face with no mark slot beside it;
  the heads' people chips read *3* and *2*. Measured on rendered boxes: every name — rows, heads, the lone row — at one
  x, one slot (32 px) in from the card; the lead column 32 px on every kind; and the name column from the name to the
  row's other edge at least 205 px on *Kleidung* (175–198 px with the seat beside the mark).
* **E2E-M4-154** `local` (FR-25.28, UX-03) — **implemented** (`packing-list-shape.spec.ts`): *For whom …* in a shared
  row's press-and-hold menu opens its strip under it and lights its seat; the same entry in a cluster head's menu moves
  the one strip under the head.
* **E2E-M4-127** `local` (FR-25.2) — **implemented** (`packing-list-sheet.spec.ts`): tapping the words
  of the *Erledigte* switch turns it on and it stays on — the regression it guards is a tick that comes and goes, the
  label forwarding the tap to a checkbox that has already toggled itself. Closing the sheet shows the packed row.
* **E2E-M4-128** `local` (FR-25.32) — **implemented** (`packing-list-sheet.spec.ts`): with a packed
  row and *Erledigte* off, typing its name shows it and the *Gepackte anzeigen* bar is gone; clearing the term puts the
  row away again and brings the bar back. The unit rows (`domain`) cover the other two switches and the facet exemption.
* **E2E-M4-126** `local` (FR-25.31 with FR-25.26) — **implemented** (`membership.spec.ts`): the
  cluster head's *late packer on for everyone* raises *„2 rows changed"*, and its undo clears the head's ⏰ — which the
  head paints while any instance carries the flag, so its absence is every instance.
* **E2E-M4-117** `all` (FR-25.26 widened) — **implemented** (`e2e/membership.spec.ts`): the cluster
  head offers a row's entries. *Menge ändern* from the head, stepped to 3, reads **0/3 on each child**, and *Nicht
  einpacken* takes the whole cluster off the working list — one skipped child of two would have kept it there. The
  snackbar's one undo brings both back at their amount.
* **E2E-M4-118** `all` (FR-25.26, FR-5.8) — **implemented** (`e2e/membership.spec.ts`): the head
  removes every instance of an untouched cluster without asking; no instance is left behind as a lone row, and the
  undo returns the cluster with both children.
* **E2E-M4-132** `local` (FR-5.9 with FR-25.26 and FR-25.31) — **implemented**
  (`e2e/membership.spec.ts`): the cluster head's *Vor Ort kaufen* switches **every instance**, read per child in its
  own M5 (the head draws one instance's mode, so it repaints on a fan-out that reached one child of two). With all
  instances bought there the head offers only *Doch mitnehmen*; its snackbar undo gives each instance its previous
  mode back.
* ~~**E2E-M4-96**~~ **struck (FR-7.7): its promise moved to E2E-M25-01.** The trip's own tasks are not written or
  listed on M4 — its section keeps only the preparations still due before the trip — so the case runs on M25.
* ~~**E2E-M4-133**~~ **struck (FR-7.7): its promise moved to E2E-M25-05**, with the screen the trip's own
  tasks are worked on.
* ~~**E2E-M4-134**~~ **struck (FR-7.7): its promise moved to E2E-M25-03**, which also asserts the *Meine*
  chip's absence — the second thing G-8 takes away on a screen with nobody to name.
* ~~**E2E-M4-105**~~ **struck (FR-7.7): its promise moved to E2E-M25-02.** E2E-M4-106 still holds the same
  rule for a preparation, ticked in M4's own window, so the snackbar's undo stays covered on this screen too.
* **E2E-M4-136** `local` (FR-7.6) — **implemented** (`trip-tasks.spec.ts`): a row's preparation and a
  chore of the trip stand in the one section, counted by the one figure (*„0/2 tasks"*), and the header line does not
  state the preparation a second time. Every clause is a pair, because „both kinds are here" is green on a list that
  renders one of them twice: the preparation carries the chip and the trip's own does not, the ✕ is on the trip's own
  and not on the preparation. Ticking the preparation in the section clears the **row's badge** — one todo read by two
  surfaces — and the figure survives a reload; the chip then opens the row's sheet on that same todo.
* **E2E-M4-137** `local` (FR-7.6 with FR-5.8) — **implemented** (`trip-tasks.spec.ts`): removing the
  packing row takes its preparation out of the trip's tasks — off the list and out of the count — while the trip's own
  task stays, which is what makes the disappearance about the row rather than about the section. The removal is
  **confirmed** rather than immediate precisely because the preparation cascades (`removalNeedsConfirm`), and the
  snackbar's *Rückgängig* brings row and task back together, which a list that lost the task for good would fail.
* **E2E-M4-138** `local` (FR-7.6 with UI-Spec M4) — **implemented** (`trip-tasks.spec.ts`,
  red-proved against a leading-tick build): both kinds of task are ticked at the row's **own end**, past the seat and
  the ✕ on the trip's own and past the chip on a preparation. Measured, not read off the markup — only the rendered
  box says which edge a control reached (invariant 9b) — and every box is read in one frame, because a section still
  unfolding reports edges that were never on screen together. The **packing row is measured in the same frame and
  asserted the same way**, which is what makes the case about the idiom rather than a number: that clause alone would
  stay green the day the packing control moves, and the task clauses would be the ones to fail.
* **E2E-M4-139** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): the whole shape of
  finishing the packing, in one pass. Two rows, one packed; the ⋮ step asks first and the question states *„1 open
  item"*, which is the one row still open rather than the two on the list. Confirmed, the open row leaves the working
  list and the card names the moment and the **1** left behind; the step is then **gone from the ⋮**, since a second
  close would re-decide rows nobody touched. The snackbar's one *Rückgängig* brings the row back **and** takes the
  card away — a close that was undone did not happen — and the ⋮ offers the step again.
* **E2E-M4-140** `local` (FR-5.10, variant P1) — **implemented** (`close-packing.spec.ts`): four of
  six socks are in the bag. Closing shrinks the amount to what travelled rather than skipping the row, so the trip's
  figure reads **4/4** and the row sits under the *Erledigte* reveal as a packed one. The figure is the assertion that
  separates P1 from P2: a skip would have written 0/0 and denied four socks that are in the bag. The quantity above one
  comes from the M18 import, which is the only path to one through the app (§2.4).
* **E2E-M4-141** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): a finished list stays
  workable. The composer opens on a closed list, says *„recorded as packed"* before anything is typed, and the row it
  adds lands packed — it is **not** on the open list, the card still stands (the addition did not reopen the packing)
  and the trip's figure reads *2/2*. Without the last two clauses the case would pass on a build where an addition
  silently revoked the decision, which is the failure the stamp exists to prevent.
* **E2E-M4-142** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): reopening is not the
  undo. Every snackbar is taken off the page first, so nothing the case then asserts can be an undo's doing; the card's
  *Reopen* removes the card and brings the ⋮ step back, **and the rows the close decided stay decided** — the skipped
  row is still off the working list and still counted behind the reveal. That last clause is the case: a reopen that
  restored rows would have to invent the amount variant P1 does not record.
* **E2E-M4-143** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): the step is offered where the moment is,
  **and the offer does not take the screen**. With one of two rows packed the bar is **absent** — the negative half,
  without which the case would pass on a build that shows it always — and packing the second raises it, in the empty
  state, with no sheet. The list underneath is then operated (the reveal bar is clicked and answers), which is the
  clause that fails on a build where the offer is a sheet. Taking the offer opens the sheet; *Später* there leaves the
  trip exactly as it was: no card, and the ⋮ still offering the step.
* **E2E-M4-110** `local` (FR-25.29) — **implemented** (`traveler-progress.spec.ts`): a trip for three
  travelers with two shared rows shows three faces in roster order, each *nothing to pack*, and *Shared 0 of 2*. One row
  is given to Andy through the for-whom strip — Andy *0 of 1*, Shared *0 of 1* — and packed: Andy reads *done* while the
  trip line reads *1/2*, the same sum. A tap on *Shared* presses it and puts a person chip in the chip row with the
  shared row still listed; a tap on Andy then presses him **beside** it — two chips, Leonardo unpressed, the shared row
  still listed; the tap adds to the pick rather than replacing it — and a second tap on each releases only that one.
* **E2E-M4-111** `local` (FR-25.29) — **implemented** (`traveler-progress.spec.ts`): a trip for one
  traveler shows no per-person strip, read once the trip line has rendered.
* **E2E-M4-112** `local` (FR-25.29 with FR-9.3) — **implemented** (`traveler-progress.spec.ts`): on a
  running trip for three travelers the per-person strip is shown; opening the closing pass removes it, read once the
  pass banner is on screen, and cancelling the pass brings it back.
* **E2E-M4-113** `local` (FR-25.30) — **implemented** (`membership.spec.ts`): a per-person item for
  Andy (1) and Leonardo (2) is a cluster; a tap on Andy's FR-25.29 ring presses it, and the item becomes a plain row —
  no cluster head, no child row, and no *„Andy"* in its label. Its check is ticked **without the head ever being
  tapped**, the row leaves (FR-25.2) and the trip line reads *1/3*. A second tap on the ring clears the filter and the
  cluster is back, reading *„2 open"* with both faces — the half only M4's wiring can fail, by handing the view builder
  an already-narrowed list instead of the facet.
* **E2E-M4-106** `local` (FR-7.3 with FR-25.2) — **implemented** (`packing-list-sheet.spec.ts`): the same for a
  row's preparation, ticked in the trip's one task section (FR-7.6):
  it drops the row's badge and raises the snackbar; *Rückgängig* brings the badge back, also after a reload.
* **E2E-M4-107** `local` (FR-24.11 in the composer, FR-5.6) — **implemented**
  (`packing-list-adding.spec.ts`): „Zelt" typed while the inventory holds *Zeltheringe* shows the offer **above** the
  partial hit; ✓ opens the *„Neuer Artikel"* sheet on „Zelt" and **no row has appeared** — asserted once the sheet is
  visibly open, so the absence is not read before the write could land. *„Anlegen"* puts a *Zelt* row on the list, the
  composer stays open, and M9 lists *Zelt* — the row and the inventory entry are the same event reaching both places.
* **E2E-M4-108** `local` (FR-24.11, FR-24.7) — **implemented** (`packing-list-adding.spec.ts`): an
  inventory item typed in the other umlaut spelling („guertel" for *Gürtel*) shows no offer, and ✓ adds it directly — no
  sheet. Typed again once it is on the list, the composer says *„‚Gürtel' ist schon drin"* and ✓ is disabled.
* **E2E-M4-114** `local` (FR-25.13j, FR-24.11) — **implemented** (`packing-list-adding.spec.ts`): the
  browse-sheet opens with its search field visible and **not focused**, listing both *Zeltheringe* and *Kocher*; „Zelt"
  narrows it to *Zeltheringe* with the offer **above** it. Enter opens the *„Neuer Artikel"* sheet on „Zelt" and no M4
  row has appeared — asserted once that sheet is visibly open. *„Anlegen"* returns to the browse-sheet with the query
  kept, the offer gone and the *Zelt* line reading *„hinzugefügt"*; after closing, M4 carries the row and M9 lists three
  items.
* **E2E-M4-109** `local` (FR-24.11 with FR-24.3) — **implemented** (`restore-retired.spec.ts`): a
  retired item's name is offered as a restore; taking it puts the row on the list and the item back in M9, and M23 has
  nothing left to restore — no second item.
* **E2E-M4-97** `local` (FR-7.4 visibility) — **implemented** (`trip-tasks.spec.ts`): with no task the
  section is closed and the header carries no task figure beside the share. With two preparations on a row (FR-7.7:
  M4's section holds what is done as part of packing), after a reload that no helper has touched, the section is open
  and **above the first row** (bounding boxes), and the header figure reads *„Beim Packen 0/2"* and stands as the
  share's pair (`expectFiguresPaired`: same ring, headlines and tracks level, no sentence clipped — mutation-checked:
  without the paired layout the tracks sat 6 px apart). Ticking one keeps it open at *„Beim Packen 1/2"*; ticking the
  last folds it to *„✓ Alle Aufgaben erledigt"* with the list gone and the figure at *„Beim Packen 2/2"* — the status
  line is the positive signal for the fold. After another reload it is still folded, and tapping the header figure
  unfolds it.
* **E2E-M4-103** `local` (FR-27.16) — **implemented** (`e2e/inventory-names.spec.ts`): two
  inventory items quick-added onto a trip, the ⋮ read without the entry, then both items renamed in M10. The trip still
  shows the old names; the ⋮ offers „Names from the inventory (2)", the sheet counts „2 of 2 selected", one untick and
  „All" put it back and the button reads „Take all 2 over". Applying renames both rows and the snackbar's *Undo* puts
  them back; applied again, both names survive a reload and the ⋮ — read as a populated list — no longer offers the
  entry.
* **E2E-M4-104** `local` (FR-27.16) — **implemented** (`e2e/inventory-names.spec.ts`): archived
  trips too. A trip with one inventory row is started and archived through the closing pass, the item is
  renamed in M10, and the archived trip's ⋮ still offers „Names from the inventory (1)"; applying it renames the row,
  which survives a reload, and the entry is gone from a populated menu.
* **E2E-M4-130** `server` (FR-5.1) — **implemented** (`e2e/server/multi-user.spec.ts`): the
  late-packer flag is trip state, so one account's „pack later" is the other's. Alice flags a row from its menu and
  Bob's open screen shows the ⏰ without a reload, and again after his reload (the server's copy, not a socket frame);
  clearing it reaches him the same way.
* **E2E-M4-93** `local` (FR-25.27) — **implemented** (`e2e/packing-list-shape.spec.ts`): flagging a
  row as late-packer drops it to the end of its group. The order is read **before** the flag as well as after it,
  because an assertion on a list that already stood in that order says nothing — the flag has to be what moved the row.
  A packed row is then revealed, which is what separates the three tiers from two: the flagged row sits above it, not
  with it.
* **E2E-M4-94** `local` (FR-25.27) — **implemented** (`e2e/packing-list-shape.spec.ts`): the
  *Spätpacker* switch. Read as checked before it is touched — the one switch of the three that starts on — then off, and
  the row goes while the reveal bar counts it. Everything else is then packed, and the assertion that the emptied list
  still offers the reset is what proves it did not fall through to *„alles erledigt"* over a row nobody has touched. The
  bar brings it back. It also pins the **order of the bars** — late-packers above packed — which is the rule the rows
  already follow read once more at the foot of the list. A search for the hidden row (FR-25.32) shows it and takes the
  bar away; clearing the term hides the row and brings the bar back.
* **E2E-M4-100** `local` (FR-25.28) — **implemented** (`e2e/membership.spec.ts`): the for-whom seat on a shared row
  unfolds the strip **under the row**, *Gemeinsam* lit and the summary saying so. Lighting one traveler renames the row
  *„… · Andy"* and lighting a second turns it into a cluster — a different element under a different list key — and the
  strip is **still open** after each, without a second tap: it is held by the item, not by the row. The head's people
  chip then reads **2** (UX-03), M5 and `ion-alert` were never presented, another row's seat **moves** the strip rather
  than opening a second one, and the seat that opened it folds it. A build that animates the old row out beside its
  replacement has the control twice for the length of the collapse, and this case fails on a strict-mode violation — the
  defect, not a test artefact. Read at once as the strip opens, while the rows under it are still sliding down,
  **nothing paints over the strip's foot** — rows drawn across it for 0.3 s look like a background too transparent to
  hide them; mutation-proved by removing the strip's stacking. And at TRIP's three travelers **every name under a face
  is whole**, not ellipsized — the line is laid out for three.
* **E2E-M4-101** `local` (FR-25.28) — **implemented** (`e2e/membership.spec.ts`): the last traveler
  leaving makes the item *gemeinsam* **without a question** — FR-25.28's narrowing of FR-25.21 (iii). The row is given
  progress first (`1/3`), because that is what a silent path could lose: afterwards *Gemeinsam* is lit, no question
  stands in the strip, the row still reads `1/3` and no longer names Leonardo. The lit *Gemeinsam* toggle is the
  positive signal the absent question is read against.
* **E2E-M4-86** `single` (ADR-033, G-7) — **implemented** (`e2e/single/empty-state-hydration.spec.ts`):
  the trip partition's half of E2E-M2-18. Opened straight onto M4 with every trip pull held, the screen shows
  „Packliste wird geladen …" and **no** `packing-empty`; when the pull lands the notice goes and the G-7 state appears
  with the FAB beside it. **It also pins the header figure**: `m4-progress` absent while the pull is held — „0/0
  packed" over a full track would be the same verdict the notice declines to give — and
  *visible* once the rows land, because without that half the guard could be satisfied by a header that never returns.
  `single` because Local Mode hydrates the whole database before the first paint, so the mode
  that cannot have the defect is also the cheapest to test — this is the one that can. The other eight screens in the
  same sweep are unit-proved rather than driven here (one spec each, the guard flipped after the assertion): a held
  pull per screen would buy nine minutes of pipeline for one rule, and the rule is the same one nine times.
* **E2E-M4-21** `all` (UI-Spec M4 group presentation): the group heading's computed size is **larger** than an item
  row's, and a group's rows sit in one block of their own. Asserted on computed style rather than on a class, because
  the defect it guards is purely visual: everything renders, in the wrong order of importance.
* **E2E-M4-22** `all` (FR-25.16): tapping a group header folds that group to **its header line alone**, which then reads
  "‹Gruppe› · N offen" — asserts **no** extra stub line is rendered and that N matches the group's open rows in the
  model. Other groups stay untouched. The app-bar fold-all control collapses every group to headers with **zero item
  rows** and flips its label to *Alle aufklappen*; pressing it again restores the full list. The folded set survives a
  re-render — packing a row must not unfold the rest.
* **E2E-M4-23** `all` (FR-25.16/25.2): a group whose rows are **all** done disappears completely — no header and **no
  stub** — and reappears only when *Erledigte* is switched on. Asserts folding and doneness stay separate concepts: a
  folded group with open items is still on the list, an absent group is not.
* **E2E-M4-24** `all` (FR-25.17) — **implemented**, split by what each mode can reach. The **time**, and that
  un-packing clears the stamp so it never outlives the state it describes, is `e2e/packing-list-sheet.spec.ts`'s: Local
  Mode has no account, so `packed_by_user_id` is null and the stamp reads its time alone. The **name** is E2E-FLOW-01's,
  where the server stamps the column itself. The avatar beside it is E2E-M4-30's.
* **E2E-M4-36** `all` (FR-25.13a) — **implemented** (`e2e/packing-list.spec.ts`): M4's ＋ hides while
  the quick-add composer is open — including after an add, since the composer stays open — and returns when it closes;
  the fab **container** (`#m4-fab-anchor`) survives throughout, because the FR-25.2 undo snackbar is positioned against
  it. The same rule has its own case on M8 (E2E-M8-17) and needs both: each screen writes it in its own template, so one
  keeping it says nothing about the other, and the shared `openQuickAdd` helper deliberately tolerates either state.
* **E2E-M4-37** `all` (FR-5.5) — **implemented** (`e2e/skip-item.spec.ts`): a row's press-and-hold menu offers *Nicht
  einpacken*; choosing it takes the row out of the working list (it is done, FR-25.2), raises the snackbar naming it,
  and the row returns through the *Erledigte* switch **stating that it was left behind on purpose** — the mark is the
  case's point, since a revealed skipped row that says nothing is indistinguishable from a packed one and re-opens the
  very confusion FR-5.5 exists to close. Driven through `contextmenu`, which shares the handler: the 500 ms of the hold
  are unit-tested with fake timers and are not a duration this suite may wait on.
* **E2E-M4-38** `all` (FR-5.5): the snackbar's undo returns the row to the **open** list, not merely to the revealed one
  — asserted by the reveal bar being gone afterwards, which is only true when nothing is done.
* **E2E-M4-39** `all` (FR-5.5): on a skipped row the menu offers *Doch einpacken* **and not** *Nicht einpacken*, and
  taking it back clears the mark. Un-skipping has to read as the opposite of the decision rather than as an "undo" that
  is long gone.
* **E2E-M4-40** `all` (FR-5.5/20.2): with a master dependency built through M10 and the companion pulled onto the trip
  by the quick-add (FR-20.4), skipping the main item removes **both** rows, names the companion in the one snackbar, and
  marks the revealed companion with the decision that took it ("weggelassen: „Drohne“ ist nicht dabei"). The single undo
  restores the whole cascade. `test.slow()`: the case builds its world through M10, M3 and M4 per §2.4 rather than by
  injection.
* **E2E-M4-41** `all` (FR-5.5, UI-Spec M4) — **implemented**: holding a row opens the menu **and not** the detail sheet,
  and cancelling the menu leaves the row's ordinary tap working. The release of a hold usually lands on the overlay
  rather than on the row, so a "swallow the next click" flag goes stale and eats a later, legitimate tap. A touch hold
  fires the menu twice — the hold's timer and the browser's own `contextmenu` — and opens **one** sheet. **Not asserted
  here:** that a G-3-locked row has no menu at all — the guard exists in `packing/usePackingMenus.ts`, but a lock needs
  a second user and therefore `server` mode, which this unit does not have. Recorded rather than implied.
* **E2E-M4-42** `all` (FR-5.5, FR-25.1) — **implemented**: the same menu on a **per-person child row** inside a cluster
  — skipping one traveler's row leaves the other traveller's standing, and the revealed child carries the mark. The
  gesture is written into *two* templates, and the ordinary row keeping it says nothing about the child; a family trip
  is mostly child rows. Mutation-proved on its own: removing the child row's handler reddens this case alone.
* **E2E-M5-16** `all` (FR-5.5) — **implemented** (`e2e/skip-item.spec.ts`): the M5 sheet's control reads *Nicht
  einpacken*, skips on tap — the sheet's own state line then says so — and flips to *Doch einpacken*, which takes it
  back. The findable half of the pair; a screen keeping its half says nothing about the other, which is why this is not
  folded into the M4 cases.
* **E2E-M4-30** `server` (FR-25.19) — **implemented** in two layers. The rule — the packing record beats the
  assignment, and a row carries **one** right edge — is `domain/packingView.spec.ts`'s `rowEdgeAvatar` block, five
  cases.
  The rendered half rides on E2E-FLOW-02 (`e2e/server/multi-user.spec.ts`): Bob is responsible, Alice packs, the edge is
  Alice with the packer's tick and there is no second avatar. Two accounts are what the case needs — with one, the two
  columns cannot hold different people and the rule is satisfied by accident. Mutation-proved by inverting the
  precedence. The M5 sheet's read-only packing record is asserted inside E2E-M4-24 (`m5-stamp` carries the time and
  no control). **Not asserted, and
  recorded rather than implied:** the same edge on a per-person *child* row. `rowEdgeAvatar` is called from two
  templates and the rule is one function, so a child cannot disagree with a row about the precedence — but whether
  the child renders the avatar at all is a second template's business, and reaching it costs a cluster, an assignment
  and two accounts at once. It is the same shape as E2E-M4-42's argument for covering the child row's menu separately,

* **E2E-M4-31** `server` (FR-25.20) — **implemented** (`e2e/server/multi-user.spec.ts`, inside E2E-FLOW-02): a row
  assigned to Bob leaves Alice's list, the reveal bar states it and names him, the empty state says so rather than
  blaming a filter nobody set, and one tap shows the row. **The header guard**: the packed/total text
  is read while the row is hidden and asserted after the reveal, so a filtered list can never make the trip look further
  along than it is. The session-persistence clause is `usePackingFilter.spec.ts`'s, with the rest of FR-25.18.
* **E2E-M4-26** `all` (FR-27.10) — **implemented** (`e2e/group-to-trip.spec.ts`, two cases): the M4 quick-add lists
  **groups** under *„Ganze Gruppe hinzufügen“* with their resolved position count; typing filters them — asserted in
  both directions against a second group in the world, since "always offers the first group" would satisfy a single
  query. Tapping one adds **only the positions the trip does not already carry**, reports the result ("N Positionen, M
  schon dabei") and materialises the positions' FR-27.7 tasks as prep todos on them. The group's **provenance on the new
  rows** is asserted in `composables/__tests__/groupToTrip.spec.ts` rather than here: `source_template_id` is invisible
  on M4, and its user-visible consequences are a year away (FR-27.5) or belong to another case (the FR-27.4
  registration, M4-27). Asserts the new rows are **not** flagged *Missing* — an added group is a grown plan, not a
  forgotten item, and flagging it would feed M14 a false signal.
* **E2E-M8-20** `all` (FR-27.10) — **implemented** (`e2e/group-to-trip.spec.ts`): M8's composer is the
  *same component* with the group offer switched off, so M4 gaining groups could hand them to a screen where FR-27.1
  forbids nesting one. The case asserts the absence beside a **positive signal** — the free-text hint, which is the line
  M4 hides when groups match, so a leaked prop reddens it. Mutation-proved on both browsers.
* **E2E-M8-21** `all` (FR-25.13c) — **implemented**
  (`e2e/template-editor.spec.ts`): the empty composer offers the recent-items chip row; a chosen item is never
  offered again, asserted beside a chip tap that lands an FR-25.7 Standard row without the keyboard ever rising; and
  the trail crosses scopes — a fresh group offers what the last one just used, recency first. There is **no related
  row** ("Passt zu {Tags}"), by decision: it reads as noise, most visibly under the *Diverses* catch-all tag.
* **E2E-M8-22** `all` (FR-25.13d) — **implemented** (`e2e/template-editor.spec.ts`): the empty
  composer's *„Mehr aus dem Inventar…"* line opens the browse-sheet; the tag axis narrows on **any** tag (the two
  matching rows are the positive signal for the absent third); two taps land two positions in a run, each tapped row
  flipping to *„schon drin"* in place while the sheet stays open; the sheet's only input is its search field, unfocused
  (FR-25.13j) — free text is the explicit footer line, which dismisses the sheet
  and focuses the composer's field; the run's rows are on the editor
  with the FR-25.7 defaults. The sheet's own rules (grouping, carried-as-state not tappable, no-match line) are pinned
  in `InventoryBrowseSheet.spec.ts`.
* **E2E-M4-27** `all` (FR-27.10) — **implemented** (`e2e/group-to-trip.spec.ts`): tapping a group whose positions are
  all present adds nothing and says so; the row count is unchanged. Second direction: on a trip that still follows its
  groups the added group becomes one of the trip's sources, so a subsequent edit to it reaches the trip as an FR-27.4
  proposal the trip can apply (the applied-changes *log* half stays with E2E-M8-09). On a **past** trip — archived, or
  the end date gone by — nothing is registered: a running trip still follows its groups (FR-27.4), and only the past is
  frozen. **Two halves are asserted in unit tests instead, deliberately:** the *Missing* flag of M4-26
  is only ever set on an **active** trip, and nothing user-facing moves a trip to active yet — an e2e assertion would
  pass on a planning trip whatever the production code did — and the frozen-trip direction of M4-27 needs an
  **archived** trip, which the same gap puts out of reach. Both live in
  `client/src/composables/__tests__/groupToTrip.spec.ts` until the North-Star phase supplies the transition.
* **E2E-M4-28** `all` (FR-25.18): set two facet values and the *Erledigte* switch, leave M4 for M6 and return — the
  filter, the switch and the grouping are still in force **and their chips are visible** (FR-25.11a). Same after a
  reload. A **fresh session starts unfiltered**, and the search term is **not** restored. Regression guard: the chip row
  must appear together with the restored filter — a restored filter with no chip is an invisible filter, the exact
  failure FR-25.11a forbids.
* **E2E-M4-32** `all` (FR-19.2, ADR-011): opening M4 **cold** — a reload or a deep link straight onto the trip — lists
  its rows. Two separate defects read as *lost data* here: app-bar actions teleported into the header's DOM, which Ionic
  relocates, crash Vue mid-patch and abort the render; and a fire-and-forget Local Mode write lets a reload right after
  an add cancel the row's transaction. The case must **wait on the sync indicator returning to its settled state**,
  never on a duration — if there is nothing observable to wait for, that absence is the bug.

* **E2E-M4-14** `all` (FR-25.1/25.2) — **implemented** (`e2e/membership.spec.ts`): packing one instance of a
  two-person cluster keeps the cluster intact — the packed child drops out (FR-25.2), the head still counts over the
  full set (`1/2`), and the remaining instance is still a **child**. The rule is unit-tested twice in
  `packingView.spec.ts`; what this case owns is M4's own wiring, because the screen holds a full set and a hidden-done
  one and handing over the wrong one flattens the survivor the instant its sibling is packed — restructuring the list
  under the finger that is mid-tap.

* **E2E-M4-144** `local` (FR-7.7) — **implemented** (`close-packing.spec.ts`): finishing the packing
  is the moment „before the trip" ends, so the open tasks cross with it. Two preparations on one row, one of them
  already done; the question names *„1 open task"* — the count comes from the same plan the write reads, so it cannot
  say two while one moves, and the resolved one is not in it because its phase says when it *was* done. Confirmed, the
  task is off M4's window and stands in M25's *Während der Reise*. **One undo takes back the rows and the tasks**: the
  record holds a single action at a time, so a second `armUndo` for the tasks would have silently cost the rows their
  way back — the case reads the restored task from M4, where the undo was armed.

* **E2E-M4-145** `local` (FR-25.2 with FR-5.10) — **implemented** (`close-packing.spec.ts`): the
  reveal bar names what it counts, and so does the state above it. One row is packed and one is left behind by the
  close, so the word standing over both has to be true of both: the bar reads *„Show 2 done"*, and *„Hide 2 done"*
  once it is open, while the empty state the finished list shows reads *„All done 🎉"* —
  read before the bar is opened, since revealing the rows takes that state off the screen. **Both
  directions, because the label is built twice** — once per direction in the same template — and the pair can drift
  (a bar reading „Show 3 packed" and then „Hide 5 packed" for the same rows). The case
  ends on the revealed row wearing *deliberately skipped*, which is what makes the count more than arithmetic: without
  it, a bar reading „2 done" over two packed rows would pass just as well.

* **E2E-M4-149** `local` (FR-7.12) — **implemented** (`close-packing.spec.ts`): finishing the packing
  ends *before*. A packing row bought *before departure* and the shopping list's own entry both cross — the second
  travels the kernel contract the composition root binds, so a close that moved only its own rows fails here. The sheet
  counts both (*„2 open purchases"*), the one undo brings both back to *before departure*, and after the second close
  both stand *at the destination* while M6's *Vor der Reise* carries its lock line and no field, and M25's *Vor der
  Reise* is one folded line at the end whose fold holds the lock line, with no *Vor der Reise* chip on the composer
  (FR-7.14). *Wieder öffnen* gives both back and moves nothing. With FR-30.11 (no tabs), M6's *Vor der Abreise* is
  read in `m6-before` before the close and is afterwards the folded line *„Before the trip · closed"*
  at the end, whose fold holds the lock line; the composer stays and writes for *Vor Ort*. Mutation-proved: with the
  module's crossing skipped the case goes red at the own entry.
* **E2E-M4-151** `local` (FR-7.16) — **implemented** (`close-packing.spec.ts`): *Start trip* on M2, on a trip
  whose packing is open, lands on M4's close sheet in its start variant — headed *„Start trip"*, the lead asking to
  finish first, *Start only* beside the primary. *Finish and start* closes the packing; the one undo takes back the
  close *and* the start (the step offered on M2 is *Start* again). Done again: the trip is started (*Finish trip* is
  offered), the purchase left for before departure stands under M6's *„From before departure"*, the trip's untagged
  task stands under M25's tag of that name, and the preparation stays under *From the packing list*.
* **E2E-M4-152** `local` (FR-7.16) — **implemented** (`close-packing.spec.ts`): *Start only* starts the trip and
  leaves the packing open — the row still on the list, no closed card, *Finish packing* still offered.
* **E2E-M4-148** `local` (G-14) — **implemented** (`packing-list-shape.spec.ts`): the header line's
  figures are a card — a non-zero corner radius — whose left and right edges are the tasks card's below it, measured
  on the painted boxes, at desktop width too, where a lone figure must not keep its own width.
* **E2E-M4-147** `local` (FR-25.13d, ADR-075) — **implemented** (`e2e/packing-list-adding.spec.ts`): the
  browse sheet heads its groups with M9's heading — the primary tag's name and the number of lines under it, in the
  shared `ListGroup` rather than a caption of its own. The count is what a caption of its own lacks, so it is what
  says the heading is the shared one.
* **E2E-M4-146** `local` (FR-5.11) — **implemented** (`close-packing.spec.ts`): once the packing is
  closed the composer asks *packed* or *forgotten*. Before the close there is no choice; after it *Eingepackt* is
  selected, and choosing *Vergessen* changes the hint to say what will be recorded. After the add the figure is still
  *1/1* (not packed, not an open job) and the row is absent from the open list; behind the reveal bar it reads
  *„Forgotten to pack"* rather than *deliberately skipped*. The default answer is E2E-M4-141's.
