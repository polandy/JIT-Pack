# ADR-105: A task's reminder time is a wall time read on the server's clock and sent by a minute mark — vs. an instant from the device's zone, vs. a scheduled job per task

**Status:** Accepted
**Related:** FR-7.18, FR-7.11, FR-30.10, NFR-4.3, ADR-076, ADR-037, `internal/notify/timed.go`,
`internal/notify/due.go`, `internal/store/taskdue.go`, `client/src/composables/shared/reminderTime.ts`,
`client/public/sw.js`, UI-Spec M25, migration `029_task_due_time.sql`

**Context.** FR-7.11 gave a task a **day**, reminded the day before and on the day at the instance's daily time
(`JITPACK_TASK_REMINDER_TIME`, ADR-076). The owner asked on 2026-10-23 for an optional **time** on that day — *renew
the passport, the office opens at 14:00*. Four choices had a cost: whose clock the time is read on, whether the
morning push stays beside the timed one, how a run that wakes once a day learns to send at any minute, and whether
FR-30.10's dated shopping entries get the same.

**Decision Drivers (in priority order):**
1. **One time means one moment for the whole family.** The trip's people live in one place; the time is the one on
   the kitchen clock, whoever wrote it.
2. **Once, late rather than never** (ADR-076's driver 2): a restart, a downtime or a second wake-up neither doubles
   a reminder nor loses it.
3. **No more pushes than the task needs.** A timed task on its day is reminded once, at its time.
4. **Local Mode keeps the feature** as far as a device without a server can (invariant 4).
5. **Standard library first** (NFR-4.3), no table of its own.

---

## Considered Options — whose clock

### Option Z1 — a wall time `HH:MM` beside the day, read in the server's zone *(accepted)*

`comments.due_time` holds `14:00` as typed; the server reads it in `TZ`, the zone the daily run already keeps.

**Pros**
- The row stays what it was: two plain values that sync and merge field by field; no zone travels on the wire.
- The day and the time are read on the same clock, so *today at 14:00* can never fall on a different day.

**Cons**
- A member writing from another zone gets the instance's 14:00, not their own. Accepted: the family plans at home.

### Option Z2 — an instant (UTC) from the writing device's zone

**Pros**
- Exact for whoever wrote it, wherever they were.

**Cons**
- The day is a zone-less date (FR-7.11) while the time would be an instant: a task moved to another day would have to
  re-derive its instant on a device that may be elsewhere, and two devices could disagree on what day it falls on.
  Fails driver 1.

## Considered Options — the morning push

### Option M1 — the timed push replaces the day's 06:00; the day before stays and names the time *(accepted)*

**Pros**
- One push on the day, when it matters; the eve's push says *„morgen um 14:00"*, which is the planning moment.

**Cons**
- A time set for 05:30 arrives before the daily run would have — which is what it asks for.

### Option M2 — both pushes on the day

**Cons**
- Two pushes for one task on one morning, the first one carrying nothing the second does not. Fails driver 3.

## Considered Options — how the run sends at a minute

### Option S1 — a minute tick and one mark in `server_keys` *(accepted)*

`RunTaskReminders` wakes each whole minute. The mark `task_reminder_moment` holds the last minute looked at; each
wake-up advances it to now and sends the timed tasks due today whose moment lies in `(mark, now]`, the mark clamped
to the start of today.

**Pros**
- Once by construction (the advance is the claim, as ADR-076's day was), late rather than never after a downtime
  within the day, and no table.
- A time moved later is sent again at the new time; a time set to a minute already gone is not sent at all — both
  fall out of the window without a sent-flag per task.

**Cons**
- A wake-up per minute reads the timed tasks of the day — a few rows on a family instance.
- A downtime over midnight loses the past day's timed reminders: the clamp sends no yesterday's 14:00 today. The eve's
  push has named the time.

### Option S2 — a timer per task, rescheduled on every write

**Cons**
- State in memory to rebuild after every restart and on every synced edit, and the *once* guarantee would need a
  per-task flag. Fails drivers 2 and 5.

## Considered Options — shopping entries

FR-30.10's dated shopping entries **get no time** *(accepted; parked in `backlog.md`)*: a purchase is due by a day,
the shop's opening hours are not the family's to remind. The column is the task's alone.

---

## Decision Matrix

| Driver | Weight | Z1 + M1 + S1 | Z2 (device instant) | M2 (both pushes) | S2 (timer per task) |
|---|---|---|---|---|---|
| One moment for the family | 5 | 5 | 2 | 5 | 5 |
| Once, late not never | 4 | 4 — midnight downtime loses a day | 4 | 4 | 2 |
| No more pushes than needed | 3 | 5 | 5 | 2 | 5 |
| Local Mode keeps it | 2 | 3 — kept and shown, not sent | 3 | 3 | 3 |
| Standard library | 2 | 5 | 5 | 5 | 3 |
| **Total** | | **72** | 57 | 63 | 64 |

---

## Decision

A task may carry a wall time `HH:MM` beside its day, read in the server's zone. On its day the server reminds at that
time instead of the daily one (payload `due: "now"`, `time`), the day before at the daily time naming it (`due:
"tomorrow"`, `time`); a minute tick advances one `server_keys` mark and sends what fell due since. Clearing the day
clears the time. Local Mode keeps and shows the time and says that nothing fires; shopping entries get none.

## Consequences

**Positive**
- The reminder arrives when the task wants it, on the path every notification already takes.
- No new table, no zone on the wire; the old daily run is unchanged for a task without a time.

**Negative / accepted costs**
- The server wakes every minute instead of once a day.
- A server down across midnight sends no timed reminder of the day it missed.
- A member abroad reads the instance's clock.
- `task_due` now has four bodies chosen by the payload (ADR-037's mirror in `sw.js` carries them all).

**Neutral**
- The pill reads *„Heute 14:00"*, and timed tasks lead their day; an overdue task shows no time.

## Revisit Trigger

A trip whose members live in different zones and miss a reminder because of it, a request for a time on a shopping
entry, or a second server instance on one database (the mark then needs a lease, as ADR-076's claim does).
