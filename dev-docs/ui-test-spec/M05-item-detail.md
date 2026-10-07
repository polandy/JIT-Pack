# M5 — Item Detail

**How to read this section.** Six M5 numbers — `E2E-M5-06`, `-07`, `-09`, `-10`, `-11` and `-12` — each carry one
live promise and one shadowed entry from the v1.0 catalogue. **A number means what the suite implements.** The
shadowed entries are struck through in place, each saying where its promise went, and are marked *(v1.0 catalogue,
shadowed)*; two promises with nowhere else to live have their own numbers, `E2E-M5-22` and `E2E-M5-23`. Nothing is
renumbered, so a reader arriving from an older commit can find out what happened to the id it names.

`scripts/case-id-gate.mjs` (in `make ci` and the CI client job) fails when an id has more than one *live* definition,
because a collision is not catchable by eye; a struck entry keeps its number on purpose and is a tombstone, not a
definition. The gate carries one rule and no escape hatch: a collision is resolved, never registered.


* **E2E-M5-09** `all` (UI-Spec M5): tapping a row opens the detail **over** the list — M4 stays on screen — and the ✕
  returns to the trip's own URL.
* **E2E-M5-10** `all` (G-4): a cold boot straight onto an item URL opens the same sheet, since the route is the state.
  Its ✕ leads back to the trip.
* **E2E-M5-11** `all` (UI-Spec M5 rework): packing, preparation and notes are on the first level; every attribute
  control is **absent** until *Details* is opened. The packing block carries its eyebrow label („Einpacken" /
  "Packing"), the same pattern as the prep and notes sections (UX-10).
* **E2E-M5-12** `all` (G-9): at desktop width the same content is a side panel beside the list, not a sheet over it.
  *Beside* is asserted as boxes rather than as a resolved `top` (ADR-064): the pane's right edge is the window's, its
  top is the app bar and its bottom the window's, and the list's right edge is at or left of the pane's. One computed
  style would be satisfied by a pane covering two thirds of the list.
* **E2E-M5-27** `all` (G-9, ADR-064): leaving M4 with the pane open takes the pane with it. The pane is the frame's
  now, so `.ion-page-hidden` — which is all Ionic does to a screen it navigates away from — cannot hide it; without
  its own unmount it would stand over the next screen. Asserted with the shopping view rendered as the positive
  signal that the navigation happened at all.
* **E2E-M5-28** `all` (G-4, ADR-064): a cold boot straight onto an item at desktop width opens the pane and no sheet,
  and the pane reaches the window's edge. E2E-M5-10 covers the same route at phone width; this is the pane's own
  path, and the one that needs the teleport's `defer` — the screen and its pane mount on the same tick, before the
  frame's host exists.
  And the page showing the panel is the same element that showed the list (ADR-046) — asserted by identity, because a
  second M4 mounted on open stands unhidden beside the first for as long as its children take to become ready, a
  failure that shows only intermittently on WebKit and never on an idle machine. Mutation-proved — a page keyed on the
  open item, i.e. a remount on open, reddens it on WebKit.
* **E2E-M5-29** `local` (FR-25.28) — **implemented** (`e2e/membership.spec.ts`): M5 is open on *one*
  instance and its strip acts on all of them, so it can delete the row it stands on. Unlighting a **sibling** leaves the
  sheet open with one avatar fewer lit — the positive signal — and unlighting the traveler the sheet was opened from
  **closes it**, with no *not found* notice ever shown, and M4 carries the item as *„… · Andy"*.
* **E2E-M5-30** `local` (FR-27.16) — **implemented** (`e2e/inventory-names.spec.ts`): M5 on an
  inventory row shows no rename line while the names agree; after the item is renamed in M10 it reads „The inventory
  calls it …", and *Take over* renames the row under the sheet's own title, drops the line and reports in M4's
  snackbar.
* **E2E-M5-31** `local` (FR-7.3) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against
  the leading-tick build): a preparation written in the sheet is ticked at the **end** of its line, flush with it and
  past the words — the edge M4 ticks the same task on (E2E-M4-138). The line is a flex row, so the order in the
  template and the order on the glass are two claims, and this one is measured.
* **E2E-M5-13** `all` (Navigation Concept §7 case 4) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against
  the unguarded build): the **browser's** back with the sheet open closes the sheet and stays on the packing list — the
  replace-based overlay history must not let a pop skip M4 and land on the trip list. The write-side rule is
  unit-specified in `src/router/__tests__/overlayBackGuard.spec.ts`.
* **E2E-M5-14** `all` (G-14/FR-21.8) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against the 26 px build):
  the header's save indicator sits on the ✕'s centre line. Measured on the rendered boxes, both read in one
  frame so the sheet's enter animation cannot fake a difference, and on the painted lamp rather than the cell that
  centres it, since that cell agrees with the ✕ by construction — which is the construction under test.
  **A shared diameter is asserted against**: it would make the indicator read as a second button, so the case requires
  the lamp to be visibly smaller than the ✕. *Equal width and height* is not the property that makes a header look
  crooked — a broken centre line is — and a measurement that over-states what it protects outlives its reason. Because
  the lamp is silent until the sheet writes, the case makes an edit first, which is also the only way it can fail for
  the right reason.
* **E2E-M5-32** `all` (FR-25.15) — **implemented** (`e2e/item-detail.spec.ts`): the indicator's spoken half.
  The live region is in the DOM with `role="status"` before the sheet has written anything, and **empty** — silence
  that is present, not absence — and it carries *„Gespeichert"* once an edit commits, with the lamp appearing beside
  it. The roles and the wording are owned by `SaveIndicator.spec.ts`, mutation-proved by hanging the region back on
  the lamp's `v-if`; what only the built bundle can answer is that the region is **invisible and out of flow**, which
  the case reads as a rendered box of at most 1×1 px. That is the half a scoped-style mistake breaks, and it breaks it
  by printing the word *Saved* in the header beside the item's name. The in-flight wording is deliberately not read
  here — racing a local write is a timing bet, and the unit case already owns it.
* **E2E-M5-33** `local` (FR-25.28, G-13, UX-08) — **implemented** (`e2e/membership.spec.ts`): in German, three
  travelers, at 360 and 412 px, M5's for-whom line and quick-add's read *Gemeinsam* whole and cut no name — each toggle
  is as wide as its word. Before, equal shares gave *Gemeinsam* 67 px of its 68 on the reference device and an ellipsis,
  which the case reads as a word its box clips.
* **E2E-M5-34** `local` (FR-25.28, G-13, UX-08) — **implemented** (`e2e/membership.spec.ts`): five travelers on a 360 px
  phone — the line scrolls rather than cut a name; at rest it fades at its end only, scrolled to its end at its start
  only, and every name stands whole or under the fade.
* **E2E-M5-17** `all` (FR-9.1) — **implemented** (`e2e/item-detail.spec.ts`): the two trip-feedback flags are controls
  behind *Details ▾* and appear **only once the trip runs** — the same case starts the trip and marks the row *unused*,
  so the absence half has a positive signal beside it rather than passing on a typo. Read back from the glance chip,
  which renders off the stored row.
* ~~**E2E-M5-06** `all` (FR-25.14): opening a **per-person** item shows its total as a **read-only chip** ("0/3") with
  **no** +/− control on it, and one row per traveler each carrying its own check or stepper.~~ — **retired: superseded
  by FR-25.21.** M5 opens on **one instance** and names its traveler and that instance's amount (UI-Spec M5). The `0/3`
  head and the untouched siblings are M4's cluster, where **E2E-M5-18** asserts both, together with FR-25.14's rule that
  a summed total is never a stepper.
* **E2E-M5-07** `all` (FR-25.15) — **implemented.** The sheet has **no Save button** — asserted in E2E-M5-11, beside the
  indicator that stands instead of one — and the indicator says whether *this device* has captured the edit. Its signal
  is `capturePending`, which counts this device's own open writes and nothing else — never `syncStatus.state`, **G-2's
  own state**, which FR-25.15 rules out: that state answers `offline` before `syncing`, so a write still open on a
  device with no network would render as **saved** — the single case the requirement exists for — while a background
  pull on a device with a network would render as *saving*. **Asserted where it can fail:**
  `composables/__tests__/captureState.spec.ts` (five cases, the offline one included) and three under *M5 FR-25.15 save
  indicator*; a browser could only race the transient ●, so no e2e claims it. **And asserted across all four sheets, not
  only this one** — `saveIndicatorWiring.spec.ts` scans every call site, because the defect it guards is one wrong line
  copied into four templates, and a behavioural case on M5 says nothing about M8, M10 or M11. It counts the call sites
  it found before judging them, so a scan that matched nothing cannot pass quietly. The *Details* toggle needs no case
  of its own — it writes nothing, so an assertion that it does not flip the indicator could not fail.
* ~~**E2E-M5-01** `all` (FR-4.2): distinct *Used by* (traveler) vs *Packed by* (user) sections.~~ — **retired: the
  screen has no free-form *Used by* label.** M5 asks *„Wer braucht das?“* (UI-Spec M5): for-whom is per-person
  **membership**, not a caption. FR-4.2's two halves are both asserted,
  apart — the packing record in E2E-M4-24/-30, the traveler in E2E-M5-18/-19.
* **E2E-M5-02** `all` (FR-3.1/10.2) — **implemented, split across three cases**: both controls exist behind
  *Details ▾* per E2E-M5-11, the mode is actually *switched* in `e2e/shopping/shopping.spec.ts` (a row set to *Buy
  before* leaves M4 for M6), and the container is switched in **E2E-M5-22**. This entry describes the fold's contents;
  it is not a case of its own.
* ~~**E2E-M5-03** `all` (FR-9.1): Unused/Missing flags visible only on active trips.~~ — **retired as a
  duplicate**: E2E-M5-17 is the same sentence, implemented, and carries the positive signal beside the absence that this
  one does not ask for. Same disposal as `M4-07 → M4-40`.
* **E2E-M5-18** `all` (FR-25.21; through M5's for-whom strip per FR-25.28): on a shared item, open
  M5, light Andy/Leonardo/Mia in the strip and step them to 2/3/1 on the amount lines under it; the strip's summary
  reads 6. Asserted **in M4 on the rendered cluster**: the item is named **once**, three child rows carry three
  *different* amounts, and the head reads `0/6` — the **sum** of the three, since every fraction on M4 counts units
  (FR-25.22). Deliberately not a row-count assertion — an implementation that creates N unrelated items sharing a name
  satisfies every count (FR-25.8).
* **E2E-M5-19** `all` (FR-25.21, FR-25.28): from a roster of three, unlight — **in M4's own strip, under the cluster
  head** — the traveler whose row has packed progress. The question is asked **in the strip**, in place of its summary
  line, naming the person and the count, and **no `ion-alert` is presented**; *Abbrechen* leaves the avatar lit and the
  child row at `1/2`; the confirming button removes the row and the head reads `0/3` — Andy's two and Mia's one
  (FR-25.22). Then unlight a third whose row carries nothing: that one is written **without** a question, with the strip
  still open over an item that has just gone from a cluster to a lone row. The cancel half is the positive signal that a
  removal is a decision rather than a side effect of tapping an avatar, and the silent half is the positive signal that
  the question is raised by what it would cost and not by the control.
* **E2E-M5-24** `all` (FR-21.16) — **implemented** (`e2e/membership.spec.ts`): with a cluster and a
  plain row both on M4, read the *rendered* type of three names — the cluster head, one of its child rows, and the
  plain row. The head is larger and heavier than its child, and exactly the size of the plain row. Asserted on computed
  style rather than a baseline because that is where the defect lived: every value in both blocks was a legal token
  (invariant 9b), and the component's own comment described the intended order correctly while the stylesheet under it
  did the reverse. Red-proved by giving the head `--jp-text-base`, which fails the first clause.
* **E2E-M5-25** `all` (FR-21.25) — **implemented** (`e2e/item-detail.spec.ts`): the sheet of an item
  with no prep and no notes is shorter than 80 % of the viewport — not a fixed 88 % — and unfolding *Details*
  makes it taller. The second half is what makes the first mean *content-sized*: a sheet that had merely been given a
  smaller fixed height would pass the first clause alone. Measured off the presented state (`data-presented`), never
  off a wait, because Ionic's enter animation is a duration nobody controls — and measured on the **modal**, not on the
  scroll box inside it: the box is only ever as tall as its content, so a case measuring it stays green against the
  very build it is about. Proved by mutation before it was believed.
* **E2E-M5-26** `all` (FR-25.21c; the strip's *Alle* per FR-25.28) — **implemented**
  (`e2e/membership.spec.ts`): the *Alle* toggle, tapped out of a **partial** membership that already carries a chosen
  amount (Leonardo 3). The two missing travelers arrive at 1, Leonardo stays at 3, and the summary reads 5 — a shortcut
  that reset the amounts would pass every count-based clause and fail this one. The toggle's own state is read before
  and after (`aria-pressed` *false*, then *true*), because a select-all that writes without reporting is half the
  control, and the full state is asserted as an *ordinary enabled* toggle — a second tap on it leaves the amounts and
  the summary where they are, which is the positive signal that the no-op is a no-op rather than an unnoticed toggle.
  ~~The case also holds the row layout — both checkboxes right of the stepper and past the sheet's midline~~: the strip
  has no checkbox column to place.
* **E2E-M5-20** `all` (FR-25.21b): collapse back to *Gemeinsam* from M4's strip. The question names **5** — the sum, not
  the largest — before anything is written; after *Zusammenlegen* one row remains at quantity 5, and the preparation
  todo written on the surviving row before the conversion is still on it afterwards. That last clause is the one worth
  having: ADR-036 chose keep-and-repoint over delete-and-recreate precisely so a structural edit cannot destroy the
  content hanging off a row, and this is the only place that claim is asserted where it would actually be lost.
* **E2E-M5-21** `all` (FR-25.21/FR-5.5; on M4's strip per FR-25.28) — **implemented**
  (`e2e/membership.spec.ts`): an item added with FR-25.13f's ✕ (*„zu Hause gelassen"*, quantity 0 and state *skipped*),
  revealed among the done rows, and then given to a traveler from its own seat — whose smallest membership is 1. The
  strip **asks first**, naming the item, and cancelling is the positive signal that the question is a gate: the avatar
  stays unlit. The confirming button reads *„Doch einpacken"* — the verb, never *OK*. After it, the assertion that
  carries the case is that the row is **on the list**, labelled *„Kurze Hosen · Andy"*: `isDone` reads *skipped* as
  done, so without this rule the row would be created and hidden in the same breath, and only a visible row disproves
  that.
* **E2E-M5-22** `all` (FR-10.2) — **implemented** (`e2e/containers.spec.ts`): moving an item from one container to
  another through M5's picker. E2E-M11-06 covers only the *first* assignment, out of the unassigned bucket; changing an
  existing one is possible only here (see E2E-M11-03). The readback is on **M11 and by weight** — the two cards are the
  only surface stating where the thing actually is, and a control repainting its own value would satisfy anything
  asserted inside the sheet. The bucket count is the third assertion: a move that dropped the old assignment without
  writing the new one leaves the item nowhere, and both card assertions would still pass. Red-proved by ignoring a write
  onto a row that already has a container — E2E-M11-06 stays green against exactly that.
* **E2E-M5-23** `all` (FR-20.1/20.4, carrying M5-10's promise) — **implemented**
  (`e2e/item-detail.spec.ts`): the sheet offers the *suggested* companion its item is missing, an unrelated third master
  item is **not** offered, one tap lands the row on M4, and re-opening the sheet the section is **gone**. The last
  clause is what makes it a live derivation of the list rather than a stored hint, and the negative one is the positive
  signal against a section that simply lists everything. FR-20.4's *required* companions join without being asked and
  are E2E-M4-40's; this case owns the asking. Red-proved by treating `suggested` as `required`, which makes the
  companion join on quick-add so the section never renders.
* ~~**E2E-M5-04** `all` (FR-14.1): history sparkline of quantities from previous series trips.~~ — **retired: not
  owed.** M5 has no history or sparkline; FR-14.1's per-item history is offered where the quantity is actually decided,
  in M3's review step (E2E-M3-08).
* **E2E-M5-05** `all` (FR-7.1/7.2) — **implemented** (`e2e/item-detail.spec.ts`): a note typed into the sheet
  appears in its notes section; the note's flag control **moves** it — gone from the notes, open in *Vorbereitung* — and
  once the sheet closes, M4's row carries a prep badge of 1 where it had none. A note and a todo are one record
  (`is_task = 1`), so the promotion is a row changing *collection* rather than a field changing on a row: a case that
  only looked for the todo would pass against a build that rendered it in both sections at once. M4 is the third reader,
  which is what makes the promotion a trip-level fact rather than something the sheet remembers about itself. Red-proved
  by writing `task_state` without `is_task`.
* ~~**E2E-M5-06 (v1.0 catalogue, shadowed)** `all` (FR-7.3): prep-todo section — add/resolve/reopen; resolve restricted
  to assignee/owner.~~ — **the lifecycle is E2E-M4-25**, which drives M5's own todo controls end to end. **The
  restriction clause is struck together with the FR**: FR-7.3 makes todos visible to, and resolvable by, every trip
  member — see the Addendum.
* ~~**E2E-M5-07 (v1.0 catalogue, shadowed)** `server` (FR-6.2): delegate (set Packed by → other user) triggers a
  notification on the recipient.~~ — **implemented under other ids**: E2E-FLOW-02 drives the assignment and the
  notification it fires, and E2E-NOTIFY-01 asserts the language it arrives in.
* **E2E-M5-08** `single/local` (FR-17.3/G-8): Delegate control hidden — **implemented at unit level**,
  `components/trips/__tests__/ItemDetailSheet.spec.ts` (*offers no picker where the only member is me* and *offers no
  picker where there is nobody to assign to (G-8)*). Deliberately not a browser case: the guard is arithmetic over the
  roster, and neither `local` nor `single` can render a second member at all, so a Playwright run would re-execute what
  is decided here and establish nothing further.
* ~~**E2E-M5-09 (v1.0 catalogue, shadowed)** `all` (FR-3.3): "Buy now" on a BUY_BEFORE item flips mode to PACK with an
  undo snackbar.~~ — **retired: the right behaviour on the wrong screen.** FR-3.3 is realised where
  the buying happens, on M6 — the check-off writes `bought_from` and moves the row (FR-25.11j) — and E2E-M6-17 asserts
  it, including the visit to M4 that finds the row afterwards. M5 offers no buy control and is not owed one.
* ~~**E2E-M5-10 (v1.0 catalogue, shadowed)** `all` (FR-20.1/20.4): Companions hint with one-tap Add (chains required
  companions).~~ — **the promise is E2E-M5-23**, the offer on M5. The *required* half is E2E-M4-40's cascade; this half
  is the offer.
* ~~**E2E-M5-11 (v1.0 catalogue, shadowed)** `server` (G-3): item locked by the other user → read-only with lock
  banner.~~ — **implemented under other ids**: the rendered banner in `e2e/server/multi-user.spec.ts` (which names the
  holder) and `e2e/single/server-sync.spec.ts` (both directions, including the banner's disappearance), and the rule
  itself in seven unit cases under *M5 respects the G-3 lock*, which carry this id in the file.
* ~~**E2E-M5-12 (v1.0 catalogue, shadowed)** `all` (FR-22.1): the source master item's photo renders when present.~~ —
  **implemented at component level on purpose**, as E2E-M5-15's entry records: setting a photo through the UI
  needs a camera or a file upload, so the photo rung of the identity slot is asserted where the component is mounted
  directly.
* **E2E-M5-15** `all` (FR-28.4) — **implemented** (`item-mark.spec.ts`): the sheet's identity slot shows the
  mark when there is no photo, an ad-hoc row's sheet shows **no slot at all** (the header has no column to align, so the
  title is the first thing on the line), and the mark is **not editable here** (no picker in the sheet) — it belongs to
  the master item, and M10 owns it (FR-28.7). *The photo rung of the same slot is asserted in the component unit rather
  than here: setting one through the UI needs a camera or a file upload, which is `item-detail.spec.ts`'s subject and
  not the mark's.*
