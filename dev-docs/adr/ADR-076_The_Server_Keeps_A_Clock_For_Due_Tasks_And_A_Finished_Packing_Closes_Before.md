# ADR-076: The server keeps a clock for due tasks, and a finished packing closes *before* — vs. client-side reminders, vs. a stored lock

**Status:** Accepted
**Related:** FR-7.11, FR-7.12, FR-7.14, FR-7.7, FR-5.10, FR-30.8, FR-17.3, FR-6.2, NFR-4.6, FR-30.3, ADR-066, ADR-071,
ADR-037, `internal/notify/due.go`, `internal/store/taskdue.go`, `client/src/domain/taskDue.ts`,
`client/src/domain/closePacking.ts`, `client/src/domain/shared/tripPhase.ts`, `client/src/kernel/packingClose.ts`,
`client/src/composables/useDueLine.ts`, UI-Spec M1, migration `005_task_due_date.sql`

**Context.** The owner asked on 2026-09-25 for two things that FR-7.7 had deliberately left out. A task may name the
**day** it is due, and whoever it is for is **reminded the day before and on the day**, at a time the operator sets
(default 06:00). And closing the packing ends *before the trip* for good: the shopping list's *before departure* moves
with it, as FR-7.7's tasks already do, and both *before* sections are read-only until the packing is reopened. Nor does
anything new belong *before* a trip that is under way although nobody has closed its packing: one that has been
started, or whose first day has come (FR-7.14, FR-30.8). Two choices had a real cost. Every notification so far was a
person's act, detected in a push (`internal/notify/rules.go`), so nothing in the server runs on a clock. And the lock
could live in its own state or be read off what already exists.

**Decision Drivers (in priority order):**
1. **A reminder arrives when the app is closed.** A reminder that needs the app open is a to-do list, not a reminder
   (NFR-4.6's reason for Web Push in the first place).
2. **Once, and not never.** A restart, a second wake-up or a server that was down at six must neither send a reminder
   twice nor lose the day's.
3. **Local Mode keeps the feature** (invariant 4) as far as a device without a server can.
4. **The lock cannot disagree with the trip.** It is read off facts the trip row already carries and syncs; a second
   truth to reconcile across devices, offline, is how the two would drift.
5. **Standard library first** (NFR-4.3).

---

## Considered Options — the reminder

### Option A — an in-process daily run on the server, the day claimed in `server_keys` *(accepted)*

`Server.RunTaskReminders` sleeps until the configured time of day in the server's zone, reads the open tasks due
today or tomorrow, and creates `task_due` notifications through the path every other kind takes (`createAndNotify`:
the row, the WebSocket ping, the Web Push). Before it sends, it claims the day in `server_keys` with one statement
that only succeeds when the stored day differs, and it runs once at start-up too, so a server started after six sends
the day's reminders late.

**Pros**
- Reaches a closed app through the existing Web Push path; nothing new on the client beyond a body text.
- Once per day across restarts by construction, with no table of its own; standard library only (`time.Timer`,
  `time/tzdata` so `TZ` works in the image, which carries no zoneinfo).

**Cons**
- The server now has a background goroutine with a wall-clock schedule, the first one that writes. A test cannot wait
  for six; the schedule and the recipient rule are pure functions tested by table, and the loop around them is thin.
- One instance is assumed. Two servers on one database would each claim — the claim holds, but only by accident of
  SQLite's single writer.

### Option B — the client schedules its own reminders

Each device computes what is due and raises a local notification.

**Pros**
- No server clock; works identically in Local Mode.

**Cons**
- A browser cannot fire a notification at six in the morning while the app is closed — there is no scheduled-
  notification API on the web, and a service worker is not woken by time. Fails driver 1 outright.
- Every device of every member would remind separately, and nothing knows who the task is for until it syncs.

### Option C — an external scheduler (cron calling an endpoint)

**Pros**
- No goroutine in the server.

**Cons**
- A second moving part for the operator of a one-container app (ADR-043), and an endpoint that must be protected from
  everybody else. The instance would be silently reminder-less wherever the operator did not set it up.

## Considered Options — the lock

### Option L1 — read it off the trip row, move the purchases in the close *(accepted)*

The lock has two strengths, both read, neither stored:

- **Under way, *before* takes nothing new** — `beforeIsOver` in `domain/shared/tripPhase.ts`, true when any one of
  three facts holds: the trip is no longer `planning` (*Reise starten*, even a day early), its `start_date` has come in
  the reader's day, or `packing_closed_at` is set. M25's and M6's composers then offer no *before*, the dashboard card
  files for the destination, and no task is moved or dragged into *before*. What already stands there stays
  workable — ticked, reworded, moved to the road. An undated trip nobody has started has no day to have passed.
- **Closed, *before* is history** — the packing stamp alone. Only the close moves anything (a start without it moves
  nothing, FR-7.16): it moves the open *before* tasks (FR-7.7) and the open *before departure* purchases in the same act
  under the same undo — its own `buy_before` rows directly, the shopping list's own entries through a kernel contract
  (`kernel/packingClose.ts`) the composition root binds, since the packing side may not import the module (FR-30.3).
  From then on *before* is read-only on M25 and M6, every writer of a new task asks `phaseForNewTask`, which answers
  *during* while the stamp is set, and M5 offers *Vorher kaufen* to no row not already in that mode.

A date never moves anything (FR-7.12): the first day arriving, like the start, closes *before* to new things and
leaves the rest where it stands until somebody closes the packing.

**Pros**
- One truth per fact; reopening the packing lifts the read-only lock with no second write, on every device, offline
  too. The *under way* reading stays true as long as its date or start does.
- No schema: the status, the start date and the stamp exist and sync already.

**Cons**
- The lock is only as strong as the clients that read it. A device that has not pulled the stamp or the start yet can
  still write into *before*; the result stays readable (the section is history, not hidden) and can be moved out by
  its sheet.
- A new cross-module contract, the second after `kernel/shoppingSources.ts`, in the opposite direction.

### Option L2 — a stored `before_locked` flag, refused by the server

**Pros**
- The server could refuse a write into a locked phase.

**Cons**
- A second state to keep equal to the facts it stands for, and a refusal would wedge an offline device's outbox — the
  reason the G-3 lock stays advisory (owner, 2026-08-30). Fails driver 4 and the precedent.

## Considered Options — what Local Mode shows instead

With no server there is no push, so the app says what is due when it is open.

- **The page head's meta line on M1** *(accepted)* — *„2 Aufgaben (1 überfällig) · 3 Einkäufe fällig"*, each count a
  link that brings its block forward. Seen on arrival at every width and for as long as it is true. It is a fact about
  the page, not a reminder, so it stands in all three modes beside the server's push. The purchases are every open line
  carrying a day, a source's included, so the line agrees with the *Heute* badges on the shopping card.
- **A toast on opening** *(rejected after it was built; UX-review item UX-15)* — *„2 Aufgaben und 1 Einkauf fällig"*,
  once per app start, for three seconds, over the hero, with nothing to tap: a state of the trip said in the grammar
  the app keeps for answering an act (FR-25.2 undo), repeating what the rows' pills already say.
- **A count pill on the *Aufgaben* and *Einkaufen* block heads** *(rejected)* — at 412 px the *Aufgaben* head stands
  some 1400 px down, so on arrival nothing would say anything; and the head is the fold's button, so the pill could
  not lead anywhere.

---

## Decision Matrix

| Driver | Weight | A (server run) | B (client) | C (cron) |
|---|---|---|---|---|
| Arrives with the app closed | 5 | 5 — Web Push, as every kind | 1 — no timed notification on the web | 5 |
| Once, not never | 4 | 5 — the claim, and a run at start-up | 2 — one per device | 3 — depends on the operator |
| Local Mode keeps it | 3 | 3 — M1 says what is due instead | 5 | 3 |
| Standard library | 2 | 5 | 5 | 4 — an endpoint to guard |
| **Total** | | **63** | 42 | 54 |

| Driver | Weight | L1 (read the row) | L2 (stored flag) |
|---|---|---|---|
| Cannot disagree with the trip | 5 | 5 — read off the row | 2 — a second truth |
| Offline outbox never wedges | 4 | 5 — nothing is refused | 1 — a refusal wedges it |
| Strength of the lock | 2 | 3 — advisory | 5 |
| **Total** | | **51** | 24 |

---

## Decision

The server runs FR-7.11's reminder itself, once a day at `JITPACK_TASK_REMINDER_TIME` (default 06:00) in its own zone,
claiming the day in `server_keys` so it is sent once and never lost to a restart; Single-User is reminded too. Local
Mode has no reminder: M1's page head says what is due instead, in every mode. The lock on *before* is read off the trip
row, never stored. Once the trip is under way — started, its first day come, or its packing closed (`beforeIsOver`) —
the composers and moves offer *before* nothing new. Once the packing is closed (`packing_closed_at`), *before* is
read-only history: the close moves tasks and purchases across in one undoable act, and every writer of a new task asks
`phaseForNewTask`.

## Consequences

**Positive**
- The first reminder in the product reaches a closed app on the path every notification already takes.
- *Before* closes on every device without a sync of its own — to new things with the start or the date, to everything
  with the packing — and the history reopens with the packing.

**Negative / accepted costs**
- The server has a timed background writer; its loop is covered only by a stop test, the logic by tables.
- A reminder sent at the claimed time is not re-sent if the process dies between the claim and the sends — the claim
  is the guarantee against twice, and *never* is accepted for that one window.
- The lock is advisory: a device that has not heard of the close or the start can still write into *before*.
- Between the start or the first day and the close, *before* is half shut: nothing new goes in, but its open tasks and
  purchases stay where they are, because only the close moves them.
- M1's head line changes with the data, and *„Was beim Packen ansteht"* is shown only when nothing is due.
- `task_due` is the one kind with no actor, so the notification vocabulary needed a second body chosen by the payload
  (*today* / *tomorrow*, ADR-037's mirror carries both).

**Neutral**
- FR-17.3's *fewer than two people stay silent* was always a rule about one person's own acts; the reminder is the
  first kind outside it, which is why M17 shows a Single-User server the one row it can receive.

## Revisit Trigger

A second server instance on one database (the claim then needs a real lease), a request for a reminder *time* per
task rather than a day, or a web platform API that can fire a notification at a set time with the app closed (then
Local Mode could be reminded properly).
