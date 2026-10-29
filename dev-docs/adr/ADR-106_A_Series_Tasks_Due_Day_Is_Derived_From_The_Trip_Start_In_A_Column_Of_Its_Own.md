# ADR-106: A series task's due day — derived from the trip's start, in a column of its own

**Status:** Superseded by ADR-108
**Related:** FR-13.4, FR-7.4, FR-7.11, FR-29.21, ADR-104, `comments.start_lead_days`,
`comments.destination_task_id`, `client/src/domain/tripTasks.ts`, `internal/store/taskdue.go`

**Decision Drivers (in priority order):**
1. A series todo is due its lead before the trip's start **whatever that start is now** — after the trip moves on
   another device, offline, in any order the writes arrive (NFR-4.2a's field-level LWW).
2. A row's anchor is never guessed: an idea's step whose idea was deleted must not start counting from the trip.
3. Every reader of a due day keeps one projection — M25's pill and order, M1, M4's window, the `task_due` reminder.

ADR-104's revisit trigger — a task due relative to the trip's start — is what this decides.

---

## Considered Options

### Option A — a column of its own, `comments.start_lead_days`, derived on read *(recommended, accepted)*

The todo stores its lead in a new nullable column and no day. The task projection and `DueTasks` read
`trips.start_date − start_lead_days` beside ADR-104's `planned_on − lead_days`.

**Pros**
- Moving the trip moves every series todo at once, on every device, with nothing written.
- Each column names its anchor; a step whose idea is gone (`idea_id` set to NULL) still reads as ADR-104 says.

**Cons**
- A third subtraction, written in TypeScript and in SQL.
- One more column on `comments` for a minority of rows.

### Option B — reuse `comments.lead_days`, anchored on the trip when `idea_id` is NULL

**Pros**
- No new column; one lead field.

**Cons**
- `idea_id` is `ON DELETE SET NULL`: deleting an idea would silently turn its steps into series-style todos due
  before the trip start — a reading nobody wrote.

### Option C — stamp `due_date` at materialisation

**Pros**
- Every reader keeps reading `due_date`; nothing on the server changes.

**Cons**
- A trip whose dates change keeps stale due days; rewriting them on every date change is ADR-104's option B, with
  the same drift offline.
- A trip without a start date (FR-2.1a) would have to be stamped later by somebody.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| Right day after any merge | 3 | 3 — nothing to drift | 3 — nothing to drift | 1 — stamped copy drifts |
| Anchor never guessed | 2 | 3 — a column per anchor | 0 — a deleted idea re-anchors | 3 — no anchor |
| One projection for every reader | 1 | 2 — a third subtraction | 2 — a branch in the same one | 3 — readers unchanged |
| **Total** | | **17** | **11** | **12** |

---

## Decision

A series todo stores its lead in `comments.start_lead_days` and never a due day; its due day is the trip's start less
the lead, derived by the client's task projection and the server's reminder query, and absent while the trip has no
start date. Choosing a fixed day on the todo clears the lead.

## Consequences

**Positive**
- Moving or first dating a trip needs no write to its todos.
- A deleted idea and a deleted series task (`destination_task_id` set to NULL) leave each todo's day as it was.

**Negative / accepted costs**
- `tripTasks.ts` and `taskdue.go` carry one more subtraction each; a change to the rule changes both.
- A lead already past reads *Überfällig*, as ADR-104 settled.

## Revisit Trigger

A third anchor — a task due relative to the trip's end, or to a day-plan entry — so that a generic
`(anchor, lead)` pair would replace the per-anchor columns.
