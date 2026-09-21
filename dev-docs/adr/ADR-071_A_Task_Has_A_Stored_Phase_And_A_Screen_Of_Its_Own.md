# ADR-071: A task has a stored phase and a screen of its own — vs. deriving the phase, vs. keeping every task on the packing list

**Status:** Accepted
**Related:** FR-7.7, FR-7.3, FR-7.4, FR-7.5, FR-7.6, FR-5.10, FR-25.17, FR-25.31, FR-30.3, ADR-068, ADR-070,
ADR-051 amendment 1, ADR-066, ADR-022, ADR-067, UI-Spec M25/M4/M8, `internal/store/schema.sql` (`comments.phase`,
`comments.resolved_at`, `comments.resolved_by_user_id`, `template_tasks.phase`),
`client/src/domain/tripTodos.ts` (`taskPhaseOf`, `packingWindowTasks`), `client/src/domain/closePacking.ts`
(`tasksCrossing`), `client/src/views/trips/TripTasksPage.vue`, E2E-M25-01…04, E2E-M4-141

**Context.** A trip has two kinds of moment, and the app knew only one. The owner's story on 2026-09-20: fetching a
salve at the pharmacy is a task for *before* the holiday; when it did not happen before departure it does not stop
being a task — **it changes phase**, and becomes one for *during* the holiday. Some tasks are written for the road
from the start (*„am Bahnhof die Zugverbindung nach X abklären"*). In the same round the owner asked for the tasks to
get **a screen of their own beside the packing and shopping lists**, for a task to be **assignable like a pack item**,
and for **when a task was written and when it was done, and by whom**, to be visible.

FR-7.6 (ADR-068, the same morning) had just made the two kinds of task *one list* read on M4 and M1. This decision
does not undo that: the list stays one. What it adds is a second axis — *when* a task is due — and a second place to
read the one list from.

Three questions had to be answered together, because each one's cheap answer poisons the others: **where the phase
lives**, **which tasks the packing list keeps**, and **who writes the provenance**.

**Decision Drivers (in priority order):**
1. **The phase must be able to be the user's own statement.** Moving the salve is a thing a person does; if the app
   could only infer the phase, the user could not say it.
2. **Nothing is filed twice.** A task must not exist in two lists that can disagree, and a reader must not have to
   remember which one it went into — ADR-068's driver 1, still binding.
3. **The packing list stays about packing.** A screen you work in while packing should show what you do *as part of*
   packing, not every chore of the trip.
4. **A record of who did something is never a client's claim** (invariant 3), while a *clock* may be (FR-25.17's
   precedent) — packing and ticking off both happen away from a network.
5. **No new mechanism where one exists.** Both kinds of task are already one table; the assignment, the seat, the
   picker, the snackbar and the undo all already exist.
6. **Three modes.** Local Mode has no server and nobody to name; the feature must lose exactly the *who* and keep
   everything else (G-8).

---

## Considered Options

### The phase

#### Option A — A stored column, `comments.phase`, with NULL read as *before* *(recommended, accepted)*

A nullable `TEXT` with no CHECK (ADR-022's rule for this table), written by the client, read through one pure function
`taskPhaseOf` that resolves NULL to *before*.

* **Pro:** it can be the user's statement, which driver 1 requires. It survives a reopen, a re-sync and a second
  device. NULL costs no backfill and reads correctly: a task written before this decision *was* a task for before the
  trip, which is what every such row meant.
* **Pro:** it merges on its own under NFR-4.2a — moving a task writes one field, so a body edited elsewhere survives.
* **Con:** a schema change, which under invariant 2 is a reseed of every development database and, until ADR-067's
  chain lands, a hand-carried `ALTER TABLE` on the live instance.

#### Option B — Derive it from the trip's state

*Before* while the trip is `planning` (or while `packing_closed_at` is null), *during* afterwards.

* **Pro:** no column, no reseed, no migration.
* **Con, fatal:** it cannot express the thing the feature is for. Nothing distinguishes „not done yet" from „always
  meant for later" — both are open tasks — so *„am Bahnhof die Zugverbindung abklären"* would sit under *Vor der
  Reise* until the trip started, which is exactly the list it does not belong on. And a user who moved a task by hand
  would see the move undone by the next reading.

#### Option C — A second boolean, `for_the_road`

* **Pro:** the same expressive power as A, and a boolean is one character shorter.
* **Con:** two phases today is an observation, not a law; the concept round already named a third moment (the return
  journey) as a thing somebody might ask for. A boolean has to be replaced to grow, a `TEXT` has to be extended.
* **Con:** `true`/`false` names nothing. `phase = 'during'` reads; `for_the_road = 1` has to be looked up.

### What the packing list keeps

#### Option A — Only the tasks that hang off a packing row and are still due before the trip *(accepted)*

* **Pro:** M4 shows what you do while packing, which is driver 3 — and it is the owner's own sentence (*„die tasks
  während dem packen sollten auch auf der packliste maske erscheinen, da man das im rahmen des packens erledigen
  muss"*).
* **Pro:** it gives the phase a visible consequence. Moving the salve to *during* **takes it off the packing list**,
  which is what moving it means. A window is a reading of the one list, so driver 2 holds.
* **Con:** M4 loses its task composer. Everything the window shows hangs off a row, so a trip task typed there would
  be written into a list that cannot show it. Accepted with a line leading to M25, where it is written.

#### Option B — Everything still due before the trip, both kinds

* **Pro:** the composer stays, and „what must happen before we leave" is answerable on one screen.
* **Con:** it re-creates the complaint FR-7.7 answers — the packing list carrying chores that have nothing to do with
  packing — and M25 becomes a screen you never need, since the only thing it would add is the *during* section.

#### Option C — Nothing; every task moves to M25

* **Pro:** the simplest rule, and the two screens never disagree.
* **Con, fatal:** it contradicts the owner's sentence above. Charging a battery is part of packing the camera, and
  being told to go to another screen for it is the filing problem driver 2 forbids.

### The provenance

#### Option A — The pair splits: the server stamps *who*, the client may name *when* *(accepted)*

`resolved_by_user_id` is stripped from every incoming mutation and written by `stampActor`; `resolved_at` keeps the
client's tap time when it parses. `created_at` and `author_id` already existed and were simply never shown.

* **Pro:** invariant 3 exactly, and FR-25.17's precedent for the clock — a task is ticked off in a pharmacy queue and
  the push lands later. „A clock is not an identity claim."
* **Pro:** the rule was already written twice (FR-25.19's packing record, FR-30.4's purchase). The third copy became
  the reason to generalise it: `stampRecord` in `internal/api/server.go` now serves all three, keyed on the state each
  record follows.
* **Con:** Local Mode gets no *who* at all, ever. Accepted and made explicit (G-8): the line keeps the moment and
  drops the person rather than inventing one.

#### Option B — The client sends both, the server trusts it

* **Con, fatal:** invariant 3. A record you can pick is not a record.

---

## Decision Matrix

| Driver (weight) | Phase A: stored | Phase B: derived | Window A: row-bound | Window B: all before |
|---|---|---|---|---|
| 1. The phase is the user's statement (5) | 5 | 0 | — | — |
| 2. Nothing filed twice (5) | 5 | 5 | 5 | 5 |
| 3. The packing list stays about packing (4) | — | — | 4 | 1 |
| 4. Records are the server's, clocks may be the client's (5) | 5 | 5 | — | — |
| 5. No new mechanism (3) | 2 | 3 | 3 | 3 |
| 6. Three modes (4) | 4 | 4 | 4 | 4 |
| **Total** | **21** | **17** | **16** | **13** |

Option B for the phase scores well on everything except the one driver the feature exists for, which is why a matrix
is not a vote: driver 1 is not tradeable here, and B cannot satisfy it at any price.

---

## Consequences

* **Four nullable columns on two tables**, no CHECK and no NOT NULL, so every one of them is expressible as
  `ALTER TABLE ADD COLUMN` when ADR-067's chain lands. Until then: a reseed of every development database and a
  hand-carried statement on the live instance.
* **A third pill re-opens a measurement made the previous morning.** ADR-051 amendment 1 cut the trip's view switcher
  to two pills because four filled a 390 px line to within six pixels. The tasks earn a pill by that amendment's own
  rule — the row keeps the views a trip is *worked* in — but the row is measured again at 360 px rather than assumed.
* **FR-5.10 is amended at its own line.** Its reason for leaving the tasks alone (*„todos are not packing"*) still
  holds for the rows that step writes, but finishing the packing is the moment „before the trip" ends, so the open
  before-tasks cross with it. The amendment stands in FR-5.10, not only in FR-7.7: a reader of the older rule must not
  meet a justification that no longer carries.
* **An automatic move, where the concept round refused one.** The refusal was about a *date*: a departure day passing
  is a clock, and a clock does not know whether you still mean to do the thing. Closing the packing is a person saying
  they are done. **A decision may move the tasks; a date may not** — and this is the line to hold if anyone later
  proposes moving them on `start_date`.
* **One undo for two kinds of change.** The close's snackbar restores the rows *and* the tasks through one closure,
  because `armUndo` replaces the pending record by design. A second `armUndo` would have silently cost the rows their
  way back — the kind of defect that only shows up when both halves are exercised in one act.
* **FR-7.5's exclusion is reversed.** A preparation may now be assigned. The row's `packer_user_id` and the task's
  `assignee_user_id` are different questions about the same object, and the app now says both: a battery can be Sia's
  to charge on a camera Andy is packing.
* **M4's task section grew a dependency on a screen.** Its window is only useful because *„Alle Aufgaben"* leads out
  of it. If that line is ever lost, the window becomes a place where tasks disappear.
* **The portable format is unchanged and now incomplete.** `trip_tasks` carries words; an imported task arrives as a
  before-task. This is deliberate — inventing a phase for a document that never stated one would be a claim — but it
  means a template round-tripped through a file loses its *during* tasks' phase.

## Why the tasks are not a feature module

FR-30.3 (ADR-066) made the shopping list a **feature module**: its own store, actions and screen, with
`scripts/module-boundary-gate.mjs` holding the line that nothing there imports packing code and nothing in packing
imports it. M25 is a new screen with its own route and pill, and the question is fair — but the answer is no, and the
reason is the feature itself.

A task **names a packing row**. It hangs off `trip_items` by foreign key, it follows that row's cascade when it is
deleted, it renders the row's mark and name in a chip that leads to the row's sheet, and the packing list *reads the
task list* to decide what its window shows. The shopping list's boundary was possible because a shopping line does not
know what a packing row is — it meets packing through a kernel contract (`lib/shoppingSources.ts`) that the
composition root binds. A task could not be given that treatment without inventing a contract to express „the row this
prepares", which is the coupling, not an accident of where the code sits.

So the tasks stay kernel code: the rule in `client/src/domain/tripTodos.ts`, the acts in
`client/src/composables/useTaskActs.ts` (shared by M4 and M25 so the two screens cannot drift), the screen in
`client/src/views/trips/`. **A module boundary is worth drawing where the two sides genuinely do not need each other.**
Drawing one here would produce a contract whose only purpose was to carry a foreign key across it.

## Revisit trigger

* **The phase:** somebody asks for a third moment — the return journey, or the day of departure as its own phase. The
  column already takes it; what would need re-deciding is M25's two sections and the crossing's single rule.
* **The window:** a reader reports missing a task on M4 that M25 holds, or asks to type a trip task while packing. The
  cheapest answer is then the composer back with an explicit phase, not widening the window.
* **The module:** if the packing list ever stops reading the task list — that is, if M4's window is dropped — the
  coupling that makes this kernel code is gone, and the boundary becomes worth drawing.
