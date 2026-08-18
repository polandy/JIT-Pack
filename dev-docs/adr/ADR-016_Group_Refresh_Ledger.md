# ADR-016: The Group Refresh Keeps a Ledger — for What It Wrote, and for What Was Refused

**Status:** Accepted
**Related:** FR-27.4 (trips are offered their groups' changes), FR-27.2 (composition and merges), FR-27.7 (preparation tasks), FR-27.10 (adding a group to a running trip), FR-5.5 (deliberately not packing something), NFR-4.2a (field-level LWW merge), ADR-008 (generation runs client-side), invariant 2 (migrations are never edited), invariant 4 (Local Mode keeps every generation feature)

**Decision Drivers (in priority order):**
1. **"Manual edits on the trip always win" has to be decidable.** FR-27.4 states it as absolute. A rule the code cannot evaluate is not a rule — it is a hope.
2. **A row the user deleted must stay deleted.** The most damaging failure mode of an automatic refresh is resurrection: the user removes the tripod, opens the trip tomorrow, and it is back. Once that happens, they stop trusting the list.
3. **Two devices must converge.** A family plans one trip from two phones. Both pull the same group edit, and both run the refresh.
4. **Local Mode parity** (invariant 4): the whole mechanism is client-side, so nothing may depend on a server arbitrating.

---

## Problem 1 — Telling a manual edit from the refresh's own previous work

The trip row says `quantity: 5`. The group says `3`. Did the user set 5, or did the group say 5 last week? Comparing the row against the *current* template cannot answer that, and every option below is an attempt to give the comparison a second point of reference.

### Considered Options

#### Option A — A ledger table: what generation last produced, per position *(accepted)*

`trip_generated_positions` carries one row per generated position with the values the refresh last wrote. The diff then reads it three ways: row equals the snapshot → untouched, an update may land; row differs → overridden by hand, leave it; **ledger entry with no row at all → deleted by hand, never re-add.**

**Pros**
- Answers all three questions with one mechanism, including the deletion case, which is the one that matters most (driver 2).
- The comparison is explicit and testable as a pure function — `planRefresh` needs no I/O and no history.
- A protected row's entry is deliberately *not* refreshed, so the row stays the user's rather than drifting back under template control the moment they revert their own edit.

**Cons**
- A third table, and a write on every propagated change.
- The snapshot duplicates seven columns of `trip_items`. A stale one (a write that lands only half) would read as a manual edit — the failure is safe, but it is silent.
- Rows generated before this migration have no entry. They are *adopted* on first refresh instead, which is one more code path.

#### Option B — A snapshot column on `trip_items`

Same comparison, no join, and the snapshot dies with the row it describes.

**Rejected on driver 2, and only on it.** It detects an override perfectly well. But a snapshot that dies with the row cannot tell "deleted on purpose" from "never existed", so the deleted tripod comes back on the next open — exactly the behaviour FR-27.4 forbids in as many words.

#### Option C — A `touched_by_user` flag set by every write path

Cheapest storage, and the flag says what it means.

**Rejected on maintainability.** Correctness would then depend on *every* current and future mutation path remembering to set it — M4's quick-add, M5's sheet, the M3 review step, the skip control, the container assignment, a bulk edit nobody has written yet. The ledger asks nothing of those paths: it compares outcomes, so a write that forgot to announce itself is still detected.

---

## Problem 2 — Two devices applying the same group edit

Both phones pull "the group gained a tripod". Both run the refresh. With random ids, each inserts its own `trip_items` row, both survive the merge (different primary keys), and the trip shows the tripod twice — from a feature whose entire purpose is to keep the list right.

### Considered Options

#### Option A — Derive the ids from what the row *is* *(accepted)*

`propagatedItemId(tripId, sourceItemId, travelerId)` and `ledgerId(…)` hash their parts into the same 32-hex-character shape the schema generates. Two devices computing the same position compute the same id, so NFR-4.2a's field-level merge resolves the two inserts into one row carrying identical values.

**Pros**
- Convergence falls out of the merge algorithm that already exists; no coordination, no server arbitration, works in Local Mode (driver 4).
- Idempotent by construction: re-running the refresh cannot double anything, which also makes the trigger points cheap to reason about.
- The ledger id is derivable too, so adopting an existing row twice writes one entry.

**Cons**
- **Ids stop being opaque.** Anyone holding a trip id and a master item id can compute the row's id. There is nothing secret in an id here — authorization is per trip membership, and every one of those inputs is already visible to whoever may read the trip — but the property is gone, and a future feature must not start relying on unguessability.
- A hash collision would merge two distinct positions into one row. 128 bits over a per-trip namespace makes this vanishingly unlikely, but it is a silent failure rather than a loud one.
- The derivation is now part of the data model: changing how the id is computed would orphan every existing row, so it cannot be "improved" later.

#### Option B — Random ids, dedup on the next refresh

Let the duplicate happen, notice it afterwards, delete one.

**Rejected.** The user sees the duplicate in between, and the delete is a write racing another device's identical delete. It repairs a symptom the accepted option does not produce.

#### Option C — Only one device refreshes (a "leader")

**Rejected on driver 4.** There is no leader in Local Mode, and electing one over the sync channel is a distributed-systems problem in exchange for an id function.

---

## Problem 3 — Recording a refusal (added 2026-08-18, with the model revision)

The day FR-27.4 landed, the owner changed its shape: a group change is no longer applied silently to planning trips, it is **offered** to every trip that is not past, and the trip's owner answers. Deriving the proposal cost nothing — `planRefresh` was already a pure diff with the writes kept separate, so a proposal is a diff nobody applied yet. Saying **no**, however, has to be *remembered*: the refresh re-derives on every trip open and after every master pull, so an unrecorded refusal is re-asked within seconds.

### Considered Options

#### Option A — Advance the ledger snapshot, leave the trip alone *(accepted)*

Write the refused version into `trip_generated_positions` and touch nothing on the trip.

**Pros**
- **No new state whatsoever** — no table, no column, no flag, nothing extra on the wire, and nothing for two devices to disagree about. The refusal rides the same rows the acceptance would have.
- It reuses a rule that already exists: `isProtected` reads a row differing from its snapshot as the user's own. After a refusal the row differs, so it is the user's — the same status a hand edit confers, reached the same way.
- All three kinds of refusal fall out of one mechanism: a refused *addition* leaves an entry whose row does not exist (already the "deleted by hand" case, Problem 1), a refused *removal* drops the entry so the group stops speaking for the row, a refused *change* leaves the gap described above.
- Nothing to expire, and nothing to clean up.

**Cons**
- **A refused position stops following the group in that trip** — the user cannot say "not this change, but keep listening". This is a real cost, not a technicality, and it is why the M4 card states it under the buttons rather than in a tooltip.
- The mechanism is indirect: the refusal is legible only to someone who knows what the ledger means. Hence this section.

#### Option B — A dismissal table (`trip_refused_changes`)

Record each refused change and filter it out of later proposals.

**Pros**
- Keeps the position following the group — a later, different change is still offered.

**Cons**
- A fourth table, synced, with an identity problem nobody wants to own: *which* change was refused? Keyed by field and value it re-asks the moment the group moves back and forth; keyed by position it is Option A with extra steps and a second source of truth for the same fact.
- Rows that must be garbage-collected, or grow forever.
- Two devices can refuse and accept the same change concurrently, and now the ledger and the dismissal table can disagree.

#### Option C — Keep the proposal pending until answered

Store the plan itself and re-show it.

**Cons**
- A plan is a diff between rows that are already synced; storing it duplicates derivable state and goes stale the moment the group changes again.
- It makes an unanswered question a *thing that syncs*, so a second device shows a question the first already answered — the failure mode the whole feature exists to avoid.

---

## Consequences

* Three tables arrive with migration 023, and the partitioning splits by *who reads them*: the ledger travels the trip partition beside the rows it describes; the registry (`trip_template_sources`) and the log (`trip_applied_changes`) travel the master partition, because M2 renders its chip and M8 its blast-radius note with no trip partition loaded.
* **Existing trips do not move.** They have no registered sources, and deriving sources from `trip_items.source_template_id` was rejected for the same reason as Option B above: it would re-add what the user deleted.
* The refresh runs on trip open and after a master pull. Both are cheap because the empty plan is the normal case — `isEmptyPlan` is checked before any write is queued.
* A trip's *travelers* are part of what it follows: per-person positions fan out over the current roster, so adding a person to a planning trip gives them their share, and removing one takes their untouched rows along.
* **A refusal is per position, not per group.** Everything the plan did not touch keeps following, so the next group edit still reaches the trip — only the refused positions have gone quiet.
* **Bookkeeping is not a proposal.** Adopting a hand-added row into the ledger, or dropping an entry whose row and position are both long gone, changes nothing a user could answer; both are applied on sight and excluded from the count (`proposedChangeCount`). Counting them would put a number on M2's chip that no screen can explain.
* `trip_applied_changes` stores **structured** detail (`{"field":"quantity","from":2,"to":3}`), never a sentence: the row syncs, and a sentence would freeze one language into the database. The view words it.

**Revisit trigger (Problem 3):** a user asking to decline *this* change while keeping the position under the group's control — that is the cost Option A pays, and the moment it is felt, Option B's identity problem has to be solved rather than avoided.

**Revisit trigger:** the first feature that wants an unguessable trip-item id, or a second writer of `trip_generated_positions` other than the refresh itself — the snapshot's "one field, one writer" assumption (the JSON `tasks` column) holds only while that stays true.
