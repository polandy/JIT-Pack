# ADR-097: A kernel area shares rows with packing — excursions stay kernel, and the rules both sides read get a folder

**Status:** Accepted
**Related:** ARCH-19, ARCH-26, ADR-066 (feature modules), ADR-071 (tasks stay kernel), ADR-077 (excursions), ADR-096
(the layers), ADR-008 (one of each rule), `client/CLAUDE.md`, `dev-docs/CODING_PRINCIPLES.md` §3,
`scripts/domain-purity-gate.mjs`, `scripts/module-boundary-gate.mjs`

**Decision Drivers (in priority order):**
1. A contributor can tell from one written rule whether a new feature is a kernel area or a feature module.
2. One rule exists once (ADR-008): a day is stepped, counted and listed by one function, whichever side asks.
3. What a module may read of the kernel's rules follows a folder a gate can hold, not a list of files with a comment.
4. An area's code can be found in the places its name points to.

---

## Context

Two questions turned out to be the same one. ADR-071 kept the tasks in the kernel on a criterion — **a module boundary
is worth drawing where the two sides genuinely do not need each other** — that no later decision weighed and
`client/CLAUDE.md` did not carry: ADR-077 put excursions in the kernel without saying why, and their code spread over
eight directories. And the pure rules both sides need had no home a module may import: "ISO day + 1" was written four
times, "every day of the trip" twice, `daysBetween` twice and `MS_PER_DAY` six times, because `lib/dueDay.ts` and
`lib/tripPhase.ts` sat outside `domain/` „because a module reaches only the kernel" and the boundary gate let modules
read `domain/` one allowlisted file at a time.

## Considered Options — where excursions live

### Option A — Excursions are a kernel area, with a home inside the kernel *(recommended, accepted)*

The criterion is written down: **a kernel area shares rows with packing; a feature module meets the kernel only
through contracts.** Excursions fail the module test at every step. A line borrows a suitcase row (`trip_item_id`), and
planning it raises or creates that row (`planLinks`); M4 shows which excursions borrow a row (`borrowersByTripItem`);
the excursion screen *is* M4's list — its lines read as `TripItem`s through `excursionLineAsRow` into
`buildPackingView`, `PackingRow` and the browse sheet; a line bought on the spot joins the packing list or the
inventory; the list is saved as a Gruppe. The code moves into the places its name points to: `views/trips/excursion/`
beside the two pages, modelled on `views/trips/packing/`, and `domain/excursions.ts` (~40 exports) split by concern
into `excursionLines.ts`, `excursionSuitcase.ts` and `excursionSchedule.ts`.

**Pros**
- No contract invented to carry a foreign key across a boundary — ADR-071's argument, which holds here for the same
  reason.
- The excursion screen keeps reusing M4's view model and row unchanged.

**Cons**
- The kernel stays the larger side, and an excursion change can still touch packing code without a gate noticing.
- `TrackEditor.vue` and the other track widgets stay in `components/global/`, shared by excursions and ideas.

### Option B — An `excursions/` feature module, with the track widgets as kernel

As the planner and the meal plan: its own store, actions, screens and rules, meeting the kernel through ports.

**Pros**
- A module-only diff for an excursion change, run by CI as `@excursions` (ADR-079).

**Cons**
- Each of the couplings above becomes a port: a suitcase writer, a borrower reader, a row adapter M4's view model takes
  from outside, an inventory adopter, a Gruppe writer — five contracts whose only purpose is to carry `trip_item_id` and
  M4's row shape across.
- The excursion screen could no longer import M4's view model and row; it would get a copy, or both would move below
  the boundary.

### Option C — Leave it as it is

**Pros**
- No moves.

**Cons**
- The next area is placed by guess, and the excursion code stays 18 files across 8 directories.

## Considered Options — where the rules both sides read live

### Option 1 — `domain/shared/`, module-visible by folder *(recommended, accepted)*

The boundary gate lets a module read `domain/shared/` as a whole; the purity gate holds the folder to reading only
itself and the vocabulary (`types/`, `api/`), so it never leads on into packing's rules. `calendar.ts` holds
`addDays`, `daysBetween`, `daysOf` and `MS_PER_DAY`; the nine allowlisted files and `lib/tripPhase.ts`,
`lib/whoGoes.ts` moved in.

**Pros**
- One copy of each day rule, read by the tasks, the shopping list, the day plan, the meal plan and the excursions.
- A new shared rule needs no gate edit: it is placed, and the folder rule holds it.

**Cons**
- A rule that moves into `domain/shared/` must shed its imports of the rest of `domain/`, or stay where it is.

### Option 2 — Keep the per-file allowlist

**Pros**
- Each module-visible file is named with a reason beside it.

**Cons**
- Every new shared rule is a gate edit, and a file on the list may import any packing rule, which the module then
  reaches without either gate seeing it.

### Option 3 — Shared rules in `lib/`

**Pros**
- Modules already read `lib/`.

**Cons**
- `lib/` becomes a second rule layer outside the purity gate — the drift ARCH-19 found.

---

## Decision Matrix

| Driver | Weight | A + 1 | B + 1 | C + 2 |
|---|---|---|---|---|
| One written rule for kernel vs. module | 4 | 5 — written, and excursions show it | 4 — written, at five ports | 1 — unwritten |
| One of each rule | 3 | 5 — one calendar | 5 — one calendar | 2 — copies stay |
| Module view by folder | 2 | 5 — `domain/shared/` | 5 — `domain/shared/` | 2 — the list |
| Code where its name points | 1 | 4 — two folders and three files | 5 — one folder | 1 — eight directories |
| **Total** | | **49** | 46 | 15 |

---

## Decision

Option A with Option 1. `client/CLAUDE.md` carries the criterion beside the layer order; the tasks are a kernel area by
the same rule (ADR-071), their physical home a later step.

## Consequences

**Positive**
- A new feature is placed by asking whether it writes or reads packing's rows; the answer is in one place.
- `planner/domain/dayPlan.ts`, `meals/domain/mealPlan.ts`, `domain/taskQuickDays.ts`, `domain/excursion*.ts` and the
  connection rules step days through one function.

**Negative / accepted costs**
- `domain/excursions.ts`'s single spec now covers three files; split it when one of them grows a concern of its own.
- `TripExcursionPage.vue` is still the largest file in the client; splitting it into slices like M4's is its own step.

**Neutral**
- The pages stay in `views/trips/`, their parts beside them in `excursion/`, as `PackingListPage.vue` and `packing/`.

## Revisit Trigger

A feature that shares no rows with packing yet is placed in the kernel; a kernel area whose couplings to packing all
turn out to be one contract; or a file in `domain/shared/` that needs a rule from the rest of `domain/`.

## Amendment, 2026-10-09: the tasks get their folder (ARCH-26b)

The tasks' later step is taken as the excursions' was: M25's parts — the composer, the phase section, the list, the
sheet, the tag chooser, the item chip, M1's figure and overview — move from `components/trips/` into
`views/trips/tasks/` beside `TripTasksPage.vue`. M4 and M1 import them from there, as they import an excursion's sheet.
What stays put stays by the same rule: M4's own slices of the list (`packing/TripTodosSection.vue`,
`usePackingTasks.ts`) are packing's, `useTripTasks`/`useTaskActs` serve three screens from `composables/`,
`lib/taskDueText.ts` is read by every module, and the rules keep their `domain/task*.ts` names — `tripTodos.ts` is
renamed with ARCH-27's glossary, not before it.
