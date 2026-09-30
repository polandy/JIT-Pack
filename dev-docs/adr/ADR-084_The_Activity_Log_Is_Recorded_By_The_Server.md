# ADR-084: The Activity Log — Recorded By the Server in a Table of Its Own vs. Read Out of the Change Log vs. Synced

**Status:** Accepted
**Related:** Addendum §3.32 (FR-32.1–32.3), UI-Spec M30, ADR-028 (a log per kind of event), ADR-022 (per-field
clocks), invariant 3 (the server stamps actors), invariant 4 (rules live client-side), `internal/store/activity.go`,
`client/src/domain/activity.ts`

**Decision Drivers (in priority order):**
1. **The name on an entry is true.** "Bob packed it" has to be what the server saw — the session that pushed —
   never what a device claimed (invariant 3).
2. **An entry stays readable after its row is gone.** "Who deleted the sunscreen" is one of the questions the log
   exists for, and a deleted row has no name left to join.
3. **Nothing about sync changes.** The change feed, its compaction and the pull are the load-bearing part of the app;
   a history feature must not add weight or rules to them.
4. **What an entry means is decided once, beside the rules that write it** (invariant 4) — "packed" is a statement
   about `trip_items.state`, and that vocabulary is the client's.

---

## Considered Options

### Option A — A table of its own, written by the server inside each write *(accepted)*

`activity_log` gets one row per applied write, in the write's transaction: table, row, op, the pushing account, the
server's time, each changed field as *[before, after]*, and the row's name and its parent's name resolved at that
moment from a per-table declaration in `tableSpecs`. Two read endpoints, paged; the client classifies and folds.

**Pros**
- The actor is the session's (driver 1), and a write that changed nothing is recognisably nothing — the merge's own
  `Applied` set says so.
- Names and the deleted row's values are stored (driver 2).
- The change feed is untouched (driver 3): the log is read, never synced, and nothing in pull or compaction knows it.

**Cons**
- Every write costs an extra insert and, for a table whose name lives on a parent, a lookup. A trip's generation
  writes hundreds of rows, and each is an entry.
- The log is never pruned, like the conflict log; it grows with the household's activity.
- A write that bypasses the push pipeline has to call the recorder itself — the revert, an item's photo and an idea's
  picture do. A future side path that forgets is a silent gap; the lock takeover is deliberately left out (its own
  record is `lock_events`, ADR-028).
- It starts empty: nothing before the deployment recorded who made a change.

### Option B — Put the actor on `change_log` and read the history out of it

**Pros**
- One insert per write already exists; the actor column is one more field.

**Cons**
- `change_log` holds the *current* snapshot's pointer, not what changed: no before, no after, and after a delete no
  name (drivers 2, 4).
- It carries entries nobody made — re-logs of refused writes (ADR-031), cascade tombstones, master touches — which
  would need telling apart from acts.
- It is the sync feed. Anything that makes it longer or makes its entries mean more is weight on driver 3.

### Option C — A synced table the client writes to

**Pros**
- Local Mode would have a log too.

**Cons**
- The actor would be the client's claim, the one thing the log must not be (driver 1), unless the server re-stamps
  it — at which point it is Option A with a second copy on every device.
- Every device would hold every trip's whole history, and it would grow the pull.

---

## Decision Matrix

| Driver | Weight | A: own table, server-written | B: change_log + actor | C: synced table |
|---|---|---|---|---|
| The name is true | 4 | 4 — the session's | 4 — the session's | 1 — a claim |
| Readable after a delete | 3 | 4 — names and values stored | 1 — nothing left | 3 — if the client stores them |
| Sync untouched | 3 | 4 — never synced | 1 — it is the feed | 1 — it grows the pull |
| Meaning decided once | 2 | 4 — before/after, client classifies | 2 — no before | 3 |
| **Total** | | **48** | **26** | **22** |

---

## Consequences

- **Time is the server's**, the moment the write was applied: an offline session's packs appear when its device came
  back, not when they were tapped. The HLC carries the tap's time, but ordering a log by device clocks makes it
  disagree with itself; `packed_at` still says when a row was packed.
- **Local Mode has no log.** Its entries are hidden (G-8). Single-User has one, without names.
- **A trip's log goes with the trip**, and the trip's deletion is recorded nowhere — the trip was the only place to
  read it.
- **The inventory's log is filtered like the master pull**, by table: shared master data is everyone's, and the
  owner-only rows (a series) are only ever written by their owner, so their entries are that owner's.
- **What a change means is the client's** (`domain/activity.ts`): the server records fields, the client says
  "packed". A new table needs a name declaration (`TestActivity_EveryLabelSourceNamesARealColumn_FR32_1` refuses a
  missing one) and, where its writes mean more than added/changed/deleted, a rule there.

## Revisit trigger

- The log's share of the database file passes **a quarter** (read `SELECT sum(length(changes)) FROM activity_log`
  against the file size) — then prune by age, or drop an insert's full field list.
- A push of a few hundred mutations (a trip's generation) is measured **noticeably slower** than before this change —
  then batch the name lookups, or record generation as one entry.
- Local Mode users ask for a history — that is Option C's one advantage, and it would need its own answer to driver 1.
