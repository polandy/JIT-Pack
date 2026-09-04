# ADR-038: A master row has a delete endpoint — and the app deliberately does not use it

**Status:** Accepted
**Related:** FR-24.3, FR-24.4, NFR-4.14, ADR-025, ADR-026/027, ADR-032, invariants 4 and 5, Sync-API §5/§5a,
`internal/store/master_delete_row.go`, `internal/api/masterdelete.go`

**Decision Drivers (in priority order):**
1. **A rule must not exist twice unnoticed** (invariant 4, and ADR-025's finding: a second implementation with no
   product surface drifts in silence and nobody hears).
2. **The app's writes have to survive being offline, and Local Mode has no server at all** (invariant 5). Whatever is
   built must not quietly make deletion an online-only feature.
3. **Deleting one row from outside the app must not require becoming a sync client.** The reason this was asked for at
   all: cleaning up an instance meant minting a `mutation_id` and an HLC, and reading a per-mutation outcome array, for
   one delete.
4. **The contract is declared once** (NFR-4.14, ADR-026/027): a new route is a line in `wire.go` or it does not exist.

---

## The constraint that forces the shape

`POST /api/v1/master/sync` is a *batch of clocked mutations*, and every part of that
shape is load-bearing for the app: the `mutation_id` makes a retry idempotent across a
dropped connection, the HLC orders the write against every other device's, and the batch
is what an outbox drains. None of it is optional for a client that goes offline.

All of it is overhead for a caller that is online, holds no local state, and wants one
row gone. Such a caller has to invent a device identity, format a 13-4-8 clock, and then
discover that `outcome: "applied"` does not mean the row is gone — FR-24.3 may have
retired it instead, which only the next pull reveals.

So the question is not *whether* the two callers differ. They do, irreducibly. The
question is what may differ **with** them: the transport, or the rule underneath it.

## Considered Options

### Option A — A REST route per deletable table, over the same store pipeline *(recommended, accepted)*

Four `DELETE` routes declared in `wire.go`, each bound to one table and one path
variable. The handler reads no rule: it calls `store.DeleteMasterRow`, which mints the
`mutation_id` and the HLC the caller would otherwise compose and hands an ordinary
`sync.Mutation` to **`ApplyMasterMutation`** — the same function the push calls. FR-24.3's
retire-or-remove decision, the authorization and the `change_log` entry are reached
exactly where they already were.

The response carries `retired`, read back from the row rather than inferred, because that
is the one thing the status code cannot say: FR-24.3 keeps a row something still resolves
against, so a `200` does not always mean the row is gone.

The app keeps writing through the push. This is the deliberate half of the decision, not
an omission — see *Consequences*.

**Pros**
- One implementation of the rule. The two doors cannot diverge, because only one of them
  contains a decision.
- The external caller sends no clock, no mutation id and no batch, and gets an answer that
  distinguishes FR-24.3's two deletions without a follow-up pull.
- Offline behaviour is untouched: the app's path is the one it always had, so Local Mode
  keeps deletion (invariant 5) with no branch anywhere.
- Costs no new vocabulary — the outcomes are the ones the push already answers with.

**Cons**
- A second HTTP surface for the same act, which a reader has to learn is *not* a second
  mechanism. Mitigated by the route comment in `wire.go` and by this ADR, and bounded by
  the handler holding no rule of its own.
- The allowlist is a third place naming tables, after the partition set and the lifecycle
  set. Held by `TestDeleteMasterRow_EveryDeletableTableIsInTheMasterPartition`.

### Option B — No endpoint; document the push instead

**Rejected.** It is what exists today, and it is what prompted the request. Documenting it
does not remove the requirement that every external tool implement HLC formatting and
per-mutation result parsing to delete one row — it turns each of them into a partial sync
client, which is exactly the class of duplicate ADR-025 was written about, only outside
this repository where nothing can notice it drifting.

### Option C — The client calls the REST route too, and falls back to the outbox offline

**Rejected**, and it is the option that looks most like consistency. It produces *three*
write paths for one act — the route when online, the outbox when not, and Local Mode's
own — with the retire decision then reachable by three routes through the code. It also
makes the online path the one that is exercised in development and the offline path the
one that is not, which inverts where an offline-first app needs its confidence. The
consistency it buys is in the URL, and the cost is paid in the rule.

### Option D — One generic `POST /api/v1/master/mutations`

**Rejected.** It is the push endpoint with a different name and no batching, and it keeps
every part of the shape (driver 3) that made the push awkward for this caller.

## Decision

Option A. The transport differs per caller; the rule does not. `DeleteMasterRow` is a
caller of `ApplyMasterMutation`, never a peer of it — if a future change ever needs it to
decide something the push does not, that is the signal that this ADR is being violated
rather than extended.

## Consequences

- Anything outside the browser deletes a master row with one authenticated request, and
  reads `retired` to learn which of FR-24.3's two deletions happened.
- **The app is unchanged.** No client code calls these routes, and that is the point:
  `client/src/api/routes.ts` gains four builders it does not use, which is what generation
  from one declaration produces and is cheaper than a second declaration that omits them.
- With today's allowlist a delete cannot be *refused* — the four tables are shared, so
  nobody is unauthorized, and a reference retires an item or a Vorlage rather than
  refusing it. The HTTP edge therefore has no per-reason error code, deliberately;
  `TestDeletableTables_CannotBeRefusedAsStillReferenced_FR24_3` fails the day a widening
  makes a refusal possible, so the code is written then rather than guessed at now.
- `trips`, their membership and their series are **not** on the allowlist. Deleting a trip
  is a different act with a different authorization story, and a path parameter must not
  be able to reach it.

## Revisit trigger

**If a second verb is wanted on these rows** — a create or an update from outside — this
stops being one endpoint and becomes an API surface, and the question of whether the app
should share it reopens with better evidence than it has today. The answer must still be
argued against Option C's cost, not assumed from the URL.

**If the client ever needs a server-authoritative delete synchronously** — for a screen
that cannot proceed on an optimistic answer — Option C returns as a scoped exception for
that screen, not as a policy.
