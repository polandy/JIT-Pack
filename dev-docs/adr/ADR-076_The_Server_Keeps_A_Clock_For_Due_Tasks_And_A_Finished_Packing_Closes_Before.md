# ADR-076: The server keeps a clock for due tasks, and a finished packing closes *before* — vs. client-side reminders, vs. a stored lock

**Status:** Accepted
**Related:** FR-7.11, FR-7.12, FR-7.7, FR-5.10, FR-17.3, FR-6.2, NFR-4.6, FR-30.3, ADR-066, ADR-071, ADR-037,
`internal/api/taskdue.go`, `internal/store/taskdue.go`, `client/src/domain/taskDue.ts`,
`client/src/domain/closePacking.ts`, `client/src/lib/packingClose.ts`, migration `005_task_due_date.sql`

**Context.** The owner asked on 2026-09-25 for two things that FR-7.7 had deliberately left out. A task may name the
**day** it is due, and whoever it is for is **reminded the day before and on the day**, at a time the operator sets
(default 06:00). And closing the packing ends *before the trip* for good: the shopping list's *before departure* moves
with it, as FR-7.7's tasks already do, and both *before* sections are read-only until the packing is reopened. Two
choices had a real cost. Every notification so far was a person's act, detected in a push (`notificationrules.go`),
so nothing in the server runs on a clock. And the lock could live in its own state or be read off what already exists.

**Decision Drivers (in priority order):**
1. **A reminder arrives when the app is closed.** A reminder that needs the app open is a to-do list, not a reminder
   (NFR-4.6's reason for Web Push in the first place).
2. **Once, and not never.** A restart, a second wake-up or a server that was down at six must neither send a reminder
   twice nor lose the day's.
3. **Local Mode keeps the feature** (invariant 4) as far as a device without a server can.
4. **The lock cannot disagree with the packing.** The phase is closed exactly while the packing is; a second truth to
   reconcile across devices, offline, is how the two would drift.
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

### Option L1 — read it off `trips.packing_closed_at`, move the purchases in the close *(accepted)*

*Before* is closed exactly while the packing stamp is set. The close moves the open *before* tasks (FR-7.7) and, now,
the open *before departure* purchases in the same act under the same undo: its own `buy_before` rows directly, the
shopping list's own entries through a kernel contract (`lib/packingClose.ts`) the composition root binds, since the
packing side may not import the module (FR-30.3). Every writer of a new task asks `phaseForNewTask`, which answers
*during* while the stamp is set.

**Pros**
- One truth; reopening the packing lifts the lock with no second write, on every device, offline too.
- No schema: the stamp exists and syncs already.

**Cons**
- The lock is only as strong as the clients that read it. A device that has not pulled the stamp yet can still write
  into *before*; the result stays readable (the section is history, not hidden) and can be moved out by its sheet.
- A new cross-module contract, the second after `lib/shoppingSources.ts`, in the opposite direction.

### Option L2 — a stored `before_locked` flag, refused by the server

**Pros**
- The server could refuse a write into a locked phase.

**Cons**
- A second state to keep equal to the stamp, and a refusal would wedge an offline device's outbox — the reason the
  G-3 lock stays advisory (owner, 2026-08-30). Fails driver 4 and the precedent.

---

## Decision Matrix

| Driver | Weight | A (server run) | B (client) | C (cron) |
|---|---|---|---|---|
| Arrives with the app closed | 5 | 5 — Web Push, as every kind | 1 — no timed notification on the web | 5 |
| Once, not never | 4 | 5 — the claim, and a run at start-up | 2 — one per device | 3 — depends on the operator |
| Local Mode keeps it | 3 | 3 — an in-app hint instead | 5 | 3 |
| Standard library | 2 | 5 | 5 | 4 — an endpoint to guard |
| **Total** | | **63** | 42 | 54 |

| Driver | Weight | L1 (read the stamp) | L2 (stored flag) |
|---|---|---|---|
| Cannot disagree with the packing | 5 | 5 — it *is* the stamp | 2 — a second truth |
| Offline outbox never wedges | 4 | 5 — nothing is refused | 1 — a refusal wedges it |
| Strength of the lock | 2 | 3 — advisory | 5 |
| **Total** | | **51** | 24 |

---

## Decision

The server runs FR-7.11's reminder itself, once a day at `JITPACK_TASK_REMINDER_TIME` (default 06:00) in its own zone,
claiming the day in `server_keys` so it is sent once and never lost to a restart; Single-User is reminded too, and
Local Mode says *„N Aufgaben fällig"* once when the app opens. FR-7.12's lock is read off `packing_closed_at`: the
close moves tasks and purchases across in one undoable act, and every writer of a new task asks `phaseForNewTask`.

## Consequences

**Positive**
- The first reminder in the product reaches a closed app on the path every notification already takes.
- *Before* closes and reopens with the packing on every device without a sync of its own.

**Negative / accepted costs**
- The server has a timed background writer; its loop is covered only by a stop test, the logic by tables.
- A reminder sent at the claimed time is not re-sent if the process dies between the claim and the sends — the claim
  is the guarantee against twice, and *never* is accepted for that one window.
- The lock is advisory: a device that has not heard of the close can still write into *before*.
- `task_due` is the one kind with no actor, so the notification vocabulary needed a second body chosen by the payload
  (*today* / *tomorrow*, ADR-037's mirror carries both).

**Neutral**
- FR-17.3's *fewer than two people stay silent* was always a rule about one person's own acts; the reminder is the
  first kind outside it, which is why M17 shows a Single-User server the one row it can receive.

## Revisit Trigger

A second server instance on one database (the claim then needs a real lease), a request for a reminder *time* per
task rather than a day, or a web platform API that can fire a notification at a set time with the app closed (then
Local Mode could be reminded properly).
