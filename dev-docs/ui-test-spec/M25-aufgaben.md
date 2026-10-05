# M25 — Aufgaben (a trip's tasks, FR-7.7)

The screen that holds every task of a trip, in the two phases a trip has. Three ids below **live here, not on M4**:
their promise is M4's original one, made by this screen, so the M4 entries are struck in place and say where each
went.

* **E2E-M25-01** `local` (FR-7.7, was E2E-M4-96) — **implemented** (`trip-tasks.spec.ts`): the trip's own tasks are
  written, ticked, reopened and removed here, each state read back **after a reload** because a list that only repaints
  proves the component and not the write. What the id gained with the move is the phase: a task written into *Während
  der Reise* stands in that section and **not** in the other one — a task in both would be a task filed twice, which is
  the defect „one list, two windows" exists to prevent. The one composer's phase chip decides the section (FR-7.14),
  and the removal is made from the task's sheet. The removal keeps the other section's task as its positive signal, and
  waits for the snackbar to lapse before reloading, since that is when the delete is written (FR-25.31). The rest line:
  with its one task done, *Vor der Reise* is the line *„Before the trip · nothing open · 1
  done"* at the end, which opens onto the task directly; unticked, the phase is back in its place and the line gone.
* **E2E-M25-02** `local` (FR-7.7/FR-25.2, was E2E-M4-105) — **implemented** (`trip-tasks.spec.ts`): ticking a task off
  offers the snackbar's undo, like a pack. The tick makes the task leave the open list, so the mistap has no evidence
  left to tap again; the undo brings it back and the reopened state is read after a reload. The *„N erledigt"* fold is
  asserted **absent** afterwards, which is the positive signal that the undo reached the store rather than the paint.
* **E2E-M25-03** `local` (FR-7.5/G-8, was E2E-M4-134) — **implemented** (`trip-tasks.spec.ts`): Local Mode has nobody
  to hand a task to, so the task carries no seat **and** the screen offers no *Meine* chip — absent, not an empty
  picker over an empty list. The task's grip is the positive signal beside the two absences; the seat itself is
  E2E-M25-05's. The row carries no ✕ either (FR-7.14), and the case asserts that absence too.
* **E2E-M25-07** `local` (FR-7.8) — **implemented** (`trip-tasks.spec.ts`): a task is tagged from
  its own sheet, and the heading it lands under appears with it. The tag is **created** rather than picked, because
  that is the first run every instance has: the list starts empty, and a word that is not in it is the next tag. The
  grouping is read back after a reload — a heading that only repainted proves the component and not the write — and
  the tag is then taken off again — by the ✕ on the chosen chip in M6's search-or-create mask,
  whose summary line first reads *„Filed under: Apotheke"* — which puts the task back under *Ohne Tag* and takes the
  now-empty heading away with it.
* **E2E-M25-08** `local` (FR-7.8) — **implemented** (`trip-tasks.spec.ts`): the
  drag. A task is lifted by its grip, carried into another tag's group and let go. Three clauses, each a way the
  gesture fails on its own: **`data-drag` is the signal** and the case waits for `idle`, which arrives only once the
  write has resolved — waiting on the animation is what E2E-M4-135 paid for; **the group under the pointer says so**
  while the task is in the air, or the drop is made blind — framed, and named on the chip above the finger, which
  says *→* and the group (G-21, ADR-094); and **the list's scroll position is read before the lift
  and after it**, because a list that grew a drop target under the finger would have shifted every row below it
  (ADR-060). Run in both browsers. Also asserts the travelling clone's border, which comes from
  `composables/dragToGroup.css`, shared with M6's.
* **E2E-M25-09** `local` (FR-7.8) — **implemented** (`trip-tasks.spec.ts`): a heading that would
  not be true of the task in hand neither lights up nor takes it — *Aus Packliste* under a chore of the trip. The
  refusal is asserted with its positive half beside it: the gesture still reaches `idle`, because a refused drop is
  not a hung one, and the task is still where it was.
* **E2E-M25-12** `local` (FR-7.8/ADR-075) — **implemented** (`trip-tasks.spec.ts`): several tasks in
  one act, M6's selection on M25. **A hold selects and does not lift** — the right-click is the hold's deterministic
  twin, and `data-drag` staying `idle` is the positive signal that nothing was picked up; the grip and the composer step
  aside while choosing (the one composer stays in place, `inert`, G-20). *„Alle N"* takes both tasks, the batch sheet
  creates a tag, and both then stand under its heading while the mode has ended. A second selection sends both to
  *Während der Reise*, read back after a reload. The second round is not decoration: it guards `SheetModal`'s
  moved-modal insert failure (implementation log).
* **E2E-M25-13** `local` (FR-7.11/FR-7.14) — **implemented** (`trip-tasks.spec.ts`): a due
  day. It is set on the task's own sheet through the calendar behind *Datum…*, and the sheet stays up with the day as
  its chip. On the list the line wears *Tomorrow* (the *soon* state) and the undated task wears nothing; the
  dated task stands in the *Fällig* block and **not** in its section — read back after a reload, since a line that
  only repainted proves the component. Then Local Mode's stand-in for the push: with the trip running, a fresh load of
  M1 says *„1 task due"* once. The server's reminder itself is not driven here — its time is a wall clock — and is held
  by `TestRemindDueTasks_FR7_11_OnceADayFromTheConfiguredTime` against an injected one.
* **E2E-M25-14** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): a task is filed as it is
  typed. The composer on top takes the words and *Heute*; *＋ Tag* then opens **M6's entry sheet**,
  titled *New task*, which carries the words and the day typed so far, creates the tag through the search-or-create mask
  (its summary says *„Filed under: Apotheke"*) and adds; the task lands with all three: it stands in the *Fällig* block
  wearing *Today* and its tag's name, it is not in its section, and the tag's group is not drawn because nothing else is
  in it. The tag stays chosen for the next task and the day does not. Read back after a reload; then the FAB focuses the
  field.
* **E2E-M25-15** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): the sheet's first two
  acts. A task's words are corrected in the sheet's title field, Enter commits, the list shows the new words and the
  snackbar's undo brings the old ones back; corrected again, the words survive a reload. *Erledigt* then finishes the
  task, the sheet closes, and the task is in its phase's one *erledigt* fold.
* **E2E-M25-16** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): the selection's own
  acts. Two tasks are dated *Morgen* from the bar's *Fällig* sheet and both lead the screen; selected again from the
  *Fällig* block they are ticked off with the bar's *Erledigt*, which empties the block, and both are in the fold. A
  third is deleted with *Löschen* and the one undo brings it back — read after a reload.
* **E2E-M25-17** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): a trip whose first
  day was two days ago. The composer is on screen and names no phase; a task typed there lands under *Während der
  Reise*, and after a reload it is still there and not under *Vor der Reise*.
* **E2E-M25-19** `local` (FR-7.14, FR-30.8) — **implemented** (`trip-tasks.spec.ts`): a trip started with *Reise
  starten* a month before its first day, one task already under *Vor der Reise*. M25's composer is on screen and names
  no phase, and a task typed there lands under *Während der Reise*; its sheet is up with *Erledigt* and offers no move;
  the selection of the *before* task alone offers *Unterwegs*, and with the road task added offers no *Vor der Reise*.
  After a reload M6's composer is on screen and offers no list. Fails on a build that reads the start from the date
  alone, which is what M25 did.
* **E2E-M25-20** `local` (FR-7.17) — **implemented** (`trip-tasks.spec.ts`): three trip tasks typed one after another
  read in that order under *Ohne Tag*, not by their words; the last is dragged above the first with the insert line
  on the first row before the drop, and after a reload the group still reads in the new order.
* **E2E-M25-18** `server` (FR-7.14) — **implemented** (`e2e/server/multi-user.spec.ts`): on a trip
  shared with a second account, a task with nothing to say under its words shows its empty seat and **no** facts
  line, and its row is exactly as tall as a shopping entry's with its own seat. Fails on a build that seats the person
  in the facts line, which makes every task row two lines. `server`, since only two people make a seat at all.
* ~~**E2E-M25-10**~~ `local` (FR-7.9) — **moved to E2E-M26-01** (FR-7.13): the notes are a view of
  their own; the write, the sheet's `tel:` rule and the delete are asserted there.
* ~~**E2E-M25-11**~~ `server` (FR-7.9) — **moved to E2E-M26-03** (FR-7.13): "new for another member", the
  count and the sheet naming the ticker are asserted on M26, the count on the notes pill.

* **E2E-M25-06** `local` (FR-25.31 with FR-7.7, was E2E-M4-124) — **implemented** (`e2e/undo-every-act.spec.ts`): a task
  removed (from its sheet, FR-7.14) leaves the list and its undo brings it back; removed again and left alone, it
  is gone after a reload once the snackbar has gone — the lapse is the delete. **The snackbar's disappearance is the
  signal waited on**, because the lapse changes nothing on screen, and the composer's field is asserted after the reload
  as the positive half: without it, „the task is gone" is also what an empty screen says.
* **E2E-M25-05** `server` (FR-7.5/FR-7.7, was E2E-M4-133) — **implemented** (`e2e/server/multi-user.spec.ts`): a
  task's empty seat opens the row's picker, which offers the current user as well — the one difference from a row's —
  and picking the other account fills the seat with them. That account is told (the toast names the task and who
  handed it over), sees itself on the task on its own open screen without a reload, and finds its name after the task
  on M1's *Aufgaben* card. Both halves happen on M25, which is where the trip's own tasks are worked.
* **E2E-M25-04** `local` (FR-7.7) — **implemented** (`trip-tasks.spec.ts`): the salve. A preparation
  that will not happen before departure is moved to *Während der Reise* from the task's own sheet, and the move is
  what takes it **off the packing list** — the consequence that makes a stored phase worth its column. Both halves are
  asserted on both screens, because either alone is green on a build that moved the task in one list and copied it in
  the other. The sheet's own promise rides along: it names the row the task prepares and who wrote it, which is what
  the line has no room for. The undo is asserted too, and it returns the task to M4's window rather than to „no phase
  at all".
