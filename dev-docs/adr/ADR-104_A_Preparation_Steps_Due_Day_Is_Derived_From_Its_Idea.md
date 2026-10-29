# ADR-104: A preparation step's due day — derived from its idea on read vs. stored on the task

**Status:** Superseded by ADR-108
**Related:** FR-29.21, FR-7.11, FR-29.13, FR-29.14, FR-7.3, ADR-078, ADR-097, `comments.lead_days`,
`client/src/domain/shared/ideaPreparation.ts`, `internal/store/taskdue.go`

**Decision Drivers (in priority order):**
1. A step is due its lead before the idea's day **whatever day that is now** — after a re-plan on another device,
   offline, in any order the writes arrive (NFR-4.2a's field-level LWW).
2. The planner and the kernel stay apart (ADR-097): planning an idea is the module's write, a task is the kernel's
   row.
3. Every reader of a due day keeps one rule — M25's pill and order, M1, M4's window, the `task_due` reminder.

---

## Considered Options

### Option A — store the lead, derive the day on read *(recommended, accepted)*

The step keeps `idea_id` and a nullable `comments.lead_days`, and its `due_date` stays empty. The client's task
projection (`tripTasks`) asks the planner's `IdeaLookup` for the idea's day and writes `planned_on − lead_days` into
the task it hands every screen; the server's `DueTasks` does the same in its query with a join on `ideas`. No day,
a dropped idea or an idea the device does not hold: no due day, and the step waits.

**Pros**
- A re-plan moves every step at once, on every device, with nothing written: there is no copy to fall behind.
- Two edits on two devices — the idea's day here, a step's lead there — merge into the right day, because each is
  one field of its own row.
- The planner writes only its own table; no write crosses the boundary.

**Cons**
- The rule is written twice, in TypeScript and in SQL, and the two must agree (each has its test).
- A reader that skips the projection — a raw `comments` row — sees no day; every reader goes through the projection.
- The step's phase cannot follow a re-plan the same way, since a phase is stored (FR-7.7); it is set once.

### Option B — store `due_date` on the step and rewrite it on every re-plan

Planning the idea writes the new day into each step's `due_date` through a kernel port.

**Pros**
- Every reader keeps reading `due_date` as it does today; nothing on the server changes.

**Cons**
- A re-plan written offline on one device and a step added on another leaves the new step with the old day: the copy
  drifts, as FR-7.3's stored copies did before they were derived.
- Planning an idea becomes a write into the kernel's rows from the planner — a port that writes, for every re-plan,
  unplan and drop.
- A dropped idea's steps would have to be cleared and written back on reopening.

---

## Decision Matrix

| Driver | Weight | Option A | Option B |
|---|---|---|---|
| Right day after any merge | 3 | 3 — nothing to drift | 1 — a copy written on re-plan drifts offline |
| Module boundary | 2 | 3 — the planner writes only its table | 1 — every re-plan writes kernel rows |
| One rule for every reader | 1 | 2 — one projection, written in two languages | 3 — readers unchanged |
| **Total** | | **17** | **8** |

---

## Decision

A step stores its lead (`comments.lead_days`) and never a due day; the due day is the idea's planned day less the
lead, derived by the client's task projection and by the server's reminder query, and absent while the idea has no
day, is dropped, or is not on the device.

## Consequences

**Positive**
- Planning, re-planning, unplanning and dropping an idea need no change to its steps.
- The reminder follows the plan the day it runs.

**Negative / accepted costs**
- `ideaPreparation.ts` and `taskdue.go` carry the same subtraction; a change to the rule changes both.
- A step's phase stays where it was filed.
- A step whose idea was deleted elsewhere (the link `ON DELETE SET NULL`) reads as an ordinary task without a day.

**Neutral**
- A lead that has already passed reads *Überfällig*; nothing is clamped to today.

## Revisit Trigger

A second kind of row takes its day from another one — a day-plan entry's preparation, or a task due relative to the
trip's start — so that the derivation would be written a third time.
