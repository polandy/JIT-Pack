# ADR-108: A task's due day — a lead before an anchor, stored as a kind and a lead

**Status:** Accepted
**Related:** FR-13.4, FR-29.21, FR-7.11, ADR-104, ADR-106, ADR-067, `comments.anchor_kind`,
`comments.anchor_lead_days`, `comments.idea_id`, `client/src/domain/shared/taskAnchor.ts`,
`internal/store/taskdue.go`

**Decision Drivers (in priority order):**
1. A task anchored on something that moves — an idea's day, the trip's start, a day-plan entry — is due its lead
   before the anchor **whatever the anchor is now**, after any merge of offline writes (NFR-4.2a).
2. A row's anchor is never guessed: an anchor that is gone leaves an ordinary task, not one re-anchored elsewhere.
3. A third anchor must cost a kind and a foreign key, not a column and a subtraction in each of two languages.
4. Every reader of a due day keeps one projection — M25's pill and order, M1, M4's window, the `task_due` reminder.

---

## Considered Options

### Option A — `anchor_kind` and `anchor_lead_days`, the target in a typed foreign key *(recommended, accepted)*

A task stores what it is a lead before (`'idea'`, `'trip_start'`, later `'entry'`) and the lead in days, never a due
day. The target is where it already was or will be a typed column with `ON DELETE SET NULL` (`idea_id` today, a
day-entry id for the third kind). The client has one subtraction (`leadBefore`) and the server one `CASE` over the
kind.

**Pros**
- A new anchor is a kind, a foreign key and one `CASE` branch; the lead is never a new column.
- The engine clears the foreign key when the target is deleted, and a step without its target reads as an ordinary
  task — no cleanup code, and nothing that can dangle.

**Cons**
- A kind that needs a foreign key still adds one column.
- Two columns must agree: a kind without its target (or a lead) is read as no anchor.

### Option B — one polymorphic `anchor_id` beside the kind

**Pros**
- One column for every target.

**Cons**
- No foreign key can cover rows of three tables: a deleted target leaves a dangling id that code must find and
  clear, on every device and in Local Mode too.

### Option C — a lead column per anchor (ADR-104, ADR-106)

**Pros**
- Each column names its anchor; nothing to read twice.

**Cons**
- Every new anchor adds a column, a subtraction in TypeScript and another in SQL, and a branch in each reader.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| Right day after any merge | 3 | 3 — nothing stored to drift | 3 — nothing stored to drift | 3 — nothing stored to drift |
| Anchor never guessed | 2 | 3 — the foreign key clears itself | 1 — a dangling id | 3 — a column per anchor |
| Cost of a third anchor | 2 | 2 — a kind, a key, a branch | 2 — a kind and a branch | 0 — a column and two subtractions |
| One projection for every reader | 1 | 3 — one derivation each side | 3 — one derivation each side | 1 — a branch per column |
| **Total** | | **19** | **15** | **13** |

---

## Decision

A task's due day is derived, not stored: `comments.anchor_kind` names the anchor, `comments.anchor_lead_days` the lead
before it, and the target sits in a typed foreign key (`idea_id` for `'idea'`; the trip's own `start_date` needs
none). The client's task projection and the server's reminder query derive the day from the same pair and the same
subtraction. A fixed day chosen on the task clears both columns. A step whose idea is deleted loses `idea_id` and is
read as an ordinary task; one whose idea is not planned or is dropped has no due day.

`idea_id` is also set on the tasks made from an idea's *result* (FR-29.13), where it only says where they came from;
only a task of kind `'idea'` takes its day from it.

Migration 032 carries existing rows over (`start_lead_days` to `'trip_start'`, `lead_days` with an idea to `'idea'`,
per-field clocks included) and drops the old columns; a Local Mode row stored before it is read as the same pair.

## Consequences

**Positive**
- The day-plan entry's steps (FR-29.21) are a kind and a foreign key.
- Moving a trip or planning an idea writes nothing to its tasks.

**Negative / accepted costs**
- A lead already past reads *Überfällig*; nothing is clamped to today.
- `tripTasks.ts` and `taskdue.go` still carry one derivation each; a change to the rule changes both.
- The retired `lead_days` and `start_lead_days` are no longer in the push whitelist.

## Revisit Trigger

A task anchored on a day after the trip's start, or on something with no day of its own, so that `leadBefore` would
need a direction or a second field.
