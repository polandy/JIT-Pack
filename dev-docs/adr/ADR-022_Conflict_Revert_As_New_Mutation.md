# ADR-022: A manual conflict revert is a new mutation, not an undo of the past

**Status:** Accepted (2026-08-22)
**Related:** NFR-4.2a (PRD Addendum), ADR-003 (conflict resolution), Sync-API Spec §5.1/§6/§6.1/§8, CLAUDE.md invariants 2/4/5, `internal/store/conflicts.go`, `client/src/views/trips/ConflictLogPage.vue`

NFR-4.2a promises, in one sentence, that every automatic resolution is
logged "so users can audit **and manually revert**". Only the audit was
built: `conflict_log` recorded the loser, two endpoints read it, and one
screen rendered it. This ADR settles what the missing verb means in a
system whose only ordering is a hybrid logical clock.

**Decision Drivers (in priority order):**
1. **Convergence must survive it.** Whatever a revert does, every device
   must end up agreeing — including the device that is offline while it
   happens and pushes afterwards. A repair that other devices undo on
   their next drain is worse than no repair.
2. **The merge rules stay one set of rules.** §6 rule 2 (terminal
   precedence) and the field-level LWW are the algorithm; a path that
   bypasses them is a second, untested algorithm.
3. **The audit stays honest.** A revert is itself a fact about the log
   entry, not a mutation of it: the loss happened, and the record of the
   loss must not be rewritten into never having happened.
4. **It has to work in every mode that can produce a conflict** —
   Server and Single-User (invariant 5); Local Mode has one writer and no
   conflicts at all (FR-19.6).
5. **No schema change if the data is already there** (invariant 2 /
   ADR-018): a schema change deletes every development database.

---

## Considered Options

### Option A — Write the losing value back as an ordinary upsert with a fresh server HLC *(recommended, accepted)*

The server builds a mutation from the log entry (`entity_table`,
`entity_id`, `field`, `losing_value`), stamps it with `Store.hlc.Next()`
after folding the row's own clock in, and runs it through the same
`sync.Merge` + `persist` + `change_log` path as any push.

**Pros**
- **Converges by construction.** The revert is the newest write in the
  system, so every device pulls it and no offline device can undo it by
  arriving late — its HLC is older by definition.
- **One algorithm.** Rule 2 applies to a revert exactly as to a push. That
  is not a leak, it is the point: restoring `packing_now` onto a row that
  is now `packed` is precisely the write the merge exists to drop, and it
  is refused with its own error code rather than silently swallowed.
- Nothing new on the wire for the *result*: the outcome materializes as an
  ordinary `change_log` entry, so the RPC answers `{ok, pull_hint}` and
  the client learns the value by pulling (spec §8, P-1).
- **No schema change.** `conflict_log.losing_value` already stored the
  value, and an unused `reverted` flag was already in `schema.sql`.

**Cons**
- **A revert is not an undo, and the word invites the wrong expectation.**
  It is a new edit that happens to carry an old value: a third device that
  writes the same field afterwards wins over it, correctly and
  unsurprisingly to the algorithm but possibly surprisingly to the person
  who tapped the button.
- **It can fail**, which a true undo could not: the row may have been
  deleted, or rule 2 may outrank it. Three refusals had to be named and
  given sentences rather than one shrug.
- The revert carries the *server's* device id in its HLC rather than the
  reverting user's, so the change feed does not say who asked for it.
  (Attribution of the request itself is not modelled anywhere yet; the
  `conflict_log` row does not record an actor either.)

### Option B — Rewrite the row in place, keeping the original HLC

Set the column back and leave `updated_hlc` alone, so the repair pretends
the losing write had won all along.

**Pros**
- Reads as a true undo: the history looks like the conflict never
  happened.
- Cannot be refused — there is no merge step to refuse it.

**Cons**
- **It does not converge, and it silently loses the repair.** Every device
  that already pulled the winner holds it under an HLC that is *newer*
  than the row's restored clock; the next thing that touches the field
  from any of them re-establishes the winner. The user's repair evaporates
  minutes later with nothing to see.
- The change feed has no entry for it (or a fabricated one with a past
  HLC, which breaks the cursor's monotonicity), so a device that is
  offline right now never learns of it at all.
- It is a second write path that skips `sync.Merge` entirely — driver 2's
  exact failure.

### Option C — The client re-issues the losing value as its own mutation

The conflict log page reads `losing_value`, decodes it, and enqueues an
ordinary outbox mutation with the client's HLC.

**Pros**
- Zero new endpoints; the durable outbox already carries it offline, and a
  revert would queue like any other edit.
- The mutation carries the reverting *user's* device id, so attribution
  comes for free.

**Cons**
- **The flag and the write cannot be made atomic.** Marking the entry
  reverted is a server fact; the mutation is a client fact. Two devices
  tapping the same entry both succeed, and a queued-then-refused revert
  leaves an entry marked reverted that never was.
- The client would have to decode the log's JSON back into a typed column
  value and be trusted to have got it right — the server already holds
  both the value and the column, so this hands a decoding it can do to the
  side that can get it wrong.
- It buys nothing in the one mode that has no server (Local Mode has no
  conflicts), so invariant 4 does not argue for it here.

### Option D — Do nothing; treat the log as read-only and let the user retype the value

**Pros**
- No code. The log already names the value, and typing it back into M4/M5
  is an ordinary edit that converges perfectly.

**Cons**
- **It is the spec's own promise, unbuilt** — NFR-4.2a says revert, and
  the manual would have to say "read the number and type it in again".
- It does not work for the entries whose entity has no screen of its own
  (a `trip_members` role, a `trip_applied_changes` row), which is exactly
  where the log is the only surface.

---

## Decision Matrix

Weights 1–5 by driver priority; scores 1–5.

| Driver | W | **A: new mutation** | B: rewrite in place | C: client re-issues | D: nothing |
|---|---|---|---|---|---|
| Convergence survives it | 5 | **5** | 1 — repair evaporates | 4 | **5** |
| One set of merge rules | 5 | **5** | 1 — bypasses `Merge` | **5** | **5** |
| Audit stays honest | 4 | **5** — entry marked, not erased | 2 — history rewritten | 2 — flag/write can disagree | 3 — nothing recorded |
| Works in Server + Single-User | 3 | **5** | **5** | **5** | **5** |
| No schema change | 2 | **5** | **5** | 3 — would want an actor column | **5** |
| **Total** | | **95** | 50 | 76 | 84 |

D scores well because doing nothing is cheap and correct — it just does
not do the thing. Between the two real options, C loses on driver 3, and
loses it structurally rather than by degree: no amount of care makes a
client-side write and a server-side flag one transaction.

## Decision

A revert is an **ordinary upsert built by the server, stamped with a fresh
server HLC, and resolved by the same `sync.Merge`** as any pushed
mutation. One endpoint per partition sits beside its list endpoint
(`POST …/trips/{tripID}/conflicts/{conflictID}/revert` and
`POST …/conflicts/master/{conflictID}/revert`), because a conflict belongs
to the partition its mutation was pushed to.

The claim and the write share one transaction, and the claim is one
statement (`UPDATE conflict_log SET reverted = 1 WHERE id = ? AND
reverted = 0`): two devices cannot both restore one entry, and any refusal
below rolls the flag back with it.

Refusals are named rather than merged into one code — `already_reverted`,
`row_deleted`, `revert_refused`, `forbidden` — because each is a different
sentence for the reader.

## Consequences

**Positive**
- NFR-4.2a's second promise exists, with no schema change and no new
  wire concept: the result travels the change feed every device already
  reads.
- The merge algorithm gained no branch. `internal/sync` is untouched by
  this change, which keeps its ≥90 % gate meaningful.
- Because the revert is a normal write, the WebSocket ping that follows it
  is the normal one (`trip.changed` / `master.changed`), and an offline
  device converges on its next pull with no special case.

**Negative / accepted costs**
- **The button can fail, and the UI must say why.** Four sentences where a
  true undo would have needed none. The conflict log renders them on the
  row rather than as a snackbar.
- **A revert is beatable.** A concurrent edit with a later HLC wins over
  it, exactly as it would over any other write. This is correct and it is
  the thing users will misread; the page carries a line saying the revert
  is a new change.
- **No actor is recorded.** Neither the conflict entry nor the revert says
  who did it, so a shared trip cannot answer "who took this back". The
  `conflict_log` has no actor column today, which is why this is a gap
  rather than a regression.
- **The master revert reads visibility outside its transaction.** The pool
  holds a single connection (SQLite's single writer), so `masterVisible`
  would deadlock against its own transaction. Membership could in
  principle change in the gap; `authorizeMaster` inside the transaction is
  the actual gate, and the outer check exists only so a stranger is told
  "not found" rather than "forbidden".

**Neutral**
- Local Mode is unaffected in both directions: it has one writer, so it
  produces no conflicts and offers no revert (FR-19.6, invariant 4 is not
  in tension here — nothing is being moved server-side that Local Mode
  had). Single-User Mode gets the feature in full: one user with two
  devices conflicts exactly like two users do, and `authed`/`member` are
  bypassed rather than failing (invariant 5).

## Revisit Trigger

**A conflict entry gaining an actor** — the moment `conflict_log` records
who pushed the losing write (or who reverted it), the client-side
Option C becomes cheaper than it is now, because the attribution it gets
for free stops being free on the server side. Secondarily: if reverting
several fields of one row at once is ever asked for, the per-entry
endpoint becomes N round-trips and a batch shape has to be weighed
against the atomicity this design buys.
