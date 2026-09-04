# ADR-031: A refusal repairs the row it refused — re-log vs. client-side undo vs. a second read path

**Status:** Accepted
**Related:** Sync-API §5 (push protocol, the refusal vocabulary), §5.1 (the durable outbox), P-1 (one read path), P-3
(partitioned sync), P-5 (idempotency), NFR-4.2a, ADR-026 (the wire contract), invariant 5 (three modes),
`internal/store/store.go` / `master.go`, `client/src/composables/useSyncOutbox.ts`

**Decision Drivers (in priority order):**
1. **A device must stop showing what the server refused.** This is the defect being fixed, and it applies to *every*
   refusal — an authorization denial, a scope refusal, a structural template rule, a constraint, a blocked delete — not
   only to the delete that motivated it. A refusal that is announced and not repaired leaves the device permanently
   wrong about what exists.
2. **One read path (P-1).** Clients receive data exclusively through pull; a WebSocket event is a ping and never a data
   carrier. A repair that arrives any other way is a second read path with its own bugs, its own authorization surface
   and its own offline behaviour.
3. **A refusal must never become a leak (P-3).** The mechanism runs on the mutation the server just refused, and one of
   the reasons it refuses is *this row is not yours to touch here*.
4. **Repair is not retry (P-5).** A refused mutation still leaves the outbox. Anything that keeps it queued wedges the
   partition behind one bad row — the failure §5.1 exists to prevent.
5. **Cost to devices that did nothing wrong**, and to the shared feed they read.
6. **Three modes keep their own answer** (invariant 5).

---

## Considered Options

### Option A — the server re-logs the refused row

A refusal appends a `change_log` entry for the entity it refused. The device's ordinary next pull — the one the same
drain makes right after the push — then carries the server's own snapshot, which replaces the optimistic copy.

**Pros**

- Stays entirely inside P-1: the repair is an ordinary pull change, applied by the code path that already applies every
  other one.
- Reuses machinery that exists, including a precedent for the exact problem: `ApplyMasterMutation` already re-logs a
  trip when a membership is granted, because the new member's cursor is past the trip's original entry and it would
  otherwise never arrive.
- Answers the insert/update asymmetry without a special case, by reading `deleted` from the **server's row** rather than
  from the mutation's op: a refused delete or update re-delivers the snapshot, a refused insert has no snapshot to
  deliver and yields a tombstone that drops the phantom.
- The repair is per-row, so a device that has other unsent work keeps it.

**Cons**

- **The entry lands in the shared feed**, so every device pulls a row that did not change. Bounded (one entry per
  refusal, and refusals are rare) but real.
- **It cannot serve every refusal.** `out_of_scope` means the row belongs to another trip; an entry for it under *this*
  trip would hand the pusher the foreign row's whole snapshot on the next pull — the leak `belongsToTrip` exists to
  prevent. Where a master row is invisible to the pusher, `masterVisible` filters the repair out and the divergence
  survives.
- A rejection now writes to `change_log`, so a refusal is no longer a pure no-op on the server.

### Option B — the client repairs from its own outbox

The parked mutation names the table, the id and the op. For an insert the client can simply drop the row; for an update
or a delete it needs the server's version of the row, which it does not have.

**Pros**

- No server change at all, and no traffic for anyone else.
- Exactly right for a refused insert: the client is the only device that ever had the row, so it is the only one that
  has to forget it.

**Cons**

- **It cannot repair an update or a delete**, which is most refusals. The client's copy is the optimistic one; there is
  no second, server-known copy anywhere in the client (the store holds one row, and an optimistic change is applied to
  it through the same path as a pull change). Recovering the server's value lands back at A or at D.
- The op is the client's idea of the row's history, not the server's. A row another device deleted meanwhile makes "this
  was an update" wrong, and the client cannot tell.

### Option C — hybrid: the server re-logs what it can, the client repairs the rest *(recommended, accepted)*

Option A for every refusal the server can re-log without leaking, and a client-side drop for `out_of_scope`, which is
precisely the refusal that says *this row is not this partition's* — so dropping it is not a guess but the literal
content of the answer.

**Pros**

- Every refusal is repaired, and each half is used where it is sound: the server where it holds the truth, the client
  where the truth is "you should not have this".
- The split is by the server's own stated reason, so it is checkable rather than heuristic. The reason vocabulary
  already exists on the wire.
- Keeps A's pros; confines B's weakness to the one case where B is not weak.

**Cons**

- Two mechanisms for one rule, which is one more place to change if the vocabulary grows. Mitigated by the reason being
  a closed, declared set that both sides already compile against.
- The residue A leaves — a master row invisible to the pusher — stays. See Consequences.

### Option D — a read path for one entity (`GET /trips/{id}/items/{itemId}`)

The client asks for the refused row and applies the answer.

**Pros**

- Repairs precisely, with no traffic for other devices, and needs nothing from the change feed.

**Cons**

- **It contradicts P-1 outright.** A second way for data to reach a client is a second authorization surface, a second
  offline story and a second place for a snapshot shape to drift — the drift ADR-026 exists to prevent.
- It would need one endpoint per table, or a generic entity endpoint that is a pull endpoint with a worse cursor.

### Option E — the device resyncs the partition on any refusal

Reset the cursor to 0 and rebuild the partition from what comes back.

**Pros**

- Repairs everything, including phantoms, with no server change and no new read path.

**Cons**

- **It throws away unsent work's optimistic view.** A rebuild from the server erases every row this device is still
  holding in the outbox — the ordinary state of an offline-first app after a day without wifi, and the one state that
  must never be lost (NFR-4.1).
- A whole-partition transfer to fix one row, on the connection least likely to be good.

---

## Decision Matrix

| Driver | Weight | A (re-log) | B (client) | C (hybrid) | D (read path) | E (resync) |
|---|---|---|---|---|---|---|
| Every refusal stops diverging the device | 5 | 4 — all but out-of-scope | 1 — inserts only | 5 — all of them | 5 — all of them | 5 — all of them |
| One read path (P-1) | 5 | 5 — it *is* the pull | 5 — no read at all | 5 — pull, plus a local drop | 0 — a second path by definition | 5 — the same pull |
| No refusal becomes a leak (P-3) | 5 | 3 — needs the out-of-scope carve-out | 5 — sends nothing | 5 — carve-out made explicit | 2 — a new surface to scope | 5 — scoped as pull is |
| Repair is not retry (P-5) | 4 | 5 | 5 | 5 | 5 | 5 |
| Cost to innocent devices | 3 | 3 — one shared-feed entry each | 5 — none | 3 — same as A | 5 — none | 4 — none for others |
| Modes keep their answer | 2 | 5 | 5 | 5 | 4 | 3 — Local Mode has nothing to resync from |
| **Total** | | **86** | **72** | **97** | **66** | **91** |

---

## Decision

**C.** A refusal appends a `change_log` entry for the row it refused, with `deleted` read from the server's own row
rather than from the mutation's op, so the device converges through its ordinary next pull. `out_of_scope` re-logs
nothing — the client drops the row instead, because a row this partition may not touch is a row it must not keep.

The user is told: a push that came back with refusals raises one toast per push naming how many changes were undone and,
where the build has a sentence for the reason, why. G-2's detail sheet keeps the standing record it gained with the
reason vocabulary.

## Consequences

**Positive**

- The screen and the server agree again after a refusal, for every reason in the vocabulary, without a new endpoint and
  without the outbox holding anything back.
- A refused insert cleans itself up: the tombstone is the same mechanism, decided by what the server holds.
- A refused **delete** carries its children back too. The client mirrors the server's cascade optimistically — deleting
  a Vorlage takes its positions off the screen with it — so re-logging the named row alone put the Vorlage back empty.
  Rendering the repair is what found that; an assertion on the row alone was green against it.
- The repair rides the existing broadcast, so a device that was not the pusher converges through the same ping-and-pull
  it already does.

**Negative / accepted costs**

- One `change_log` entry per refusal reaches every device on the partition — and a refused *delete* costs one per
  cascaded child as well, because the repair has to undo the whole optimistic cascade. Accepted: a refusal is an
  exceptional event, and the alternative was a second read path.
- A rejection is no longer a no-op transaction on the server. It never was one in full — the idempotency memo was
  already written — but it now touches the feed.
- **A residue stays**: if the refused master row is one `masterVisible` hides from the pusher (a trip they are not a
  member of), the pull filters the repair out and their optimistic row survives. They are told by the toast and by G-2;
  the row is corrected the moment the entity becomes visible to them, and never otherwise. Left open deliberately rather
  than closed with a tombstone, which would be the server saying "this does not exist" about a row that does.
- Two mechanisms rather than one, split by the reason on the wire.

**Neutral**

- **Local Mode is unaffected, and coherently so.** It has no server, no outbox and no push, so no mutation can be
  refused: its optimistic rows are the only copy there is and cannot diverge from a second one. The repair path is not
  dead code there — it is not constructed at all, because the outbox that owns it is not. What can fail in Local Mode is
  the *write to the device*, which is already a different signal (G-2's durability line, NFR-4.11).
- Single-User Mode gets the whole mechanism: it is a server configuration, and its store refuses on constraints and
  structural rules exactly as the multi-user one does. Only the reasons about people (`not_authorized`) are inert there.
- The merge rules are untouched. This is about a mutation the server never applied; NFR-4.2a still decides what happens
  to one it did.

## Revisit Trigger

**A refusal becomes ordinary rather than exceptional.** The accepted cost above is priced on rarity — one shared-feed
entry per refusal. If a surface starts producing refusals in bulk (a bulk delete over rows a trip references, an import
pushing hundreds of rows the schema refuses), the feed cost stops being noise and the answer is to refuse the *batch*
before it is applied, not to re-log every row of it.

**Or:** the client gains a server-known copy beside its optimistic one. Option B's disqualifying weakness is that no
such copy exists. If one ever does — a shadow row kept for an undo stack, say — the client can repair an update on its
own and the server-side half becomes optional.
