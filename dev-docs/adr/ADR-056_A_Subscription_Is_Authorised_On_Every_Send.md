# ADR-056: A subscription is authorised on every send — per-send check vs. drop-on-revocation

**Status:** Accepted
**Related:** ADR-007 (session auth), Sync-API Spec §7 (WebSocket events), FR-4.7 (membership), FR-23.3 (deactivation),
invariant 5 (three modes, one artifact), `internal/api/hub.go`, `internal/api/ws.go`, `internal/api/identity.go`

**Decision Drivers (in priority order):**
1. **The socket must not outlive the permission that opened it.** A removed member's connection kept receiving
   `trip.changed`, the G-3 `item.locked`/`item.unlocked` events *with the item's name*, and the presence list, until
   the person themselves closed the tab. That is the same class of defect as an unscoped pull, in a channel nobody
   was auditing.
2. **A rule enforced by a list of call sites is a rule with a half-life.** Whatever closes the leak must stay closed
   when the next way to end a membership is written.
3. **Cost paid per event, not per decision.** The hub broadcasts on every push; whatever is added runs there.
4. **Invariant 5.** Single-User Mode has no membership and no account to deactivate, so it must answer through the
   identity rather than through a branch in the hub.

---

## Considered Options

### Option A — the hub asks per send *(recommended, accepted)*

`Hub` takes a `ReceiveFunc` beside the existing `HeadSeqFunc`, and `subscribersOf(tripID)` collects the subscribed
connections under the mutex and then filters them through it outside the lock. `broadcast`, `broadcastPresence` and
`Subscribers` all go through that one function. The server's implementation asks the identity two questions — is the
account still active (FR-23.3), is the user still a member (FR-4.7) — so Single-User Mode answers *yes* without the
hub knowing there are modes.

**Pros**
- Closes by construction: no revocation path has to know the hub exists, including the ones not written yet.
- Covers the account as well as the membership, at one extra clause, because both are "the socket outlived its proof".
- Self-healing in both directions — a membership restored after an accidental removal resumes with no re-subscribe,
  and the subscription state itself is never mutated behind the client's back.
- `Subscribers` becomes a settled state a test can assert a revocation against, with no read deadline.

**Cons**
- One indexed membership lookup and one account lookup per subscribed connection per broadcast. A trip has a handful
  of members by nature, so this is small — but it is on the sync path and it grows with connections, not with trips.
- The presence *list* others hold goes stale until the next presence event: nothing rebroadcasts at the moment of
  revocation, so a revoked member disappears from the roster on the next cursor, subscribe or disconnect rather than
  instantly.

### Option B — `Hub.DropSubscriber(userID, tripID)`, called from the revocation path

The hub gains an exported drop, and whatever removes a membership calls it.

**Pros**
- Free at broadcast time — the hot path is untouched.
- Removes the subscription outright, so presence corrects itself immediately.

**Cons**
- It is a list, and the list is incomplete on the day it is written: a `trip_members` delete through the master push,
  a trip delete cascading its members, an admin deleting or deactivating a user, and whatever the next quarter adds.
  Each new path silently reopens the leak, and nothing fails when one is forgotten.
- The call has to reach the hub from `internal/store`'s mutation result or be reconstructed in the handler from a row
  that has just been deleted — the deleted membership's `trip_id`/`user_id` are exactly what is no longer there.
- A membership restored after a mistake stays silent until the client reconnects.

---

## Decision Matrix

| Driver | Weight | A: ask per send | B: drop on revocation |
|---|---|---|---|
| Socket cannot outlive its permission | 5 | 5 — true for every cause, including causes not yet written | 3 — true for the causes on the list |
| Survives the next revocation path | 5 | 5 — nothing to remember | 1 — silently reopens |
| Cost per event | 3 | 3 — two indexed lookups per subscribed connection per broadcast | 5 — nothing |
| Answers invariant 5 through the identity | 3 | 5 — the identity already owns both questions | 4 — reachable, but the caller decides |
| **Total** | | **74** | **57** |

---

## Decision

The hub authorises every send. `NewHub` takes a `ReceiveFunc`; `subscribersOf` filters the subscribed connections
through it before any event or presence payload is built, and the server implements it as "the account is active and
the user is still a member", both asked of the `identity` so Single-User Mode needs no branch. The subscribe-time
check in `ws.go` stays — it is what stops a non-member opening a subscription in the first place — but it is no
longer the only check.

## Consequences

**Positive**
- A revoked membership and a deactivated account both silence the socket at the next event, with no cooperation from
  the code that revoked them.
- `Subscribers(tripID)` now reports who a trip's events would actually reach, which is what let both new cases assert
  the absence against an ordering (`ping` → `pong`) instead of a read deadline.
- A nil `ReceiveFunc` admits nobody. A gate that fails open is worse than one that fails shut, and total silence is
  loud in a test — unlike `headSeq`, which is nil-tolerant because `in_sync` is an optimisation.

**Negative / accepted costs**
- Two database lookups per subscribed connection per broadcast, on the sync path.
- The presence roster others see keeps a revoked member until the next presence event.
- `identity` gains a fourth method, so every implementation of it — both modes and any test fake — has to answer it.

**Neutral**
- Nothing about the wire changes: no new frame, no new field, no client change. A revoked device simply stops being
  told, and discovers the loss on its next pull, which already refuses.

## Revisit Trigger

When a single trip regularly carries more than ~50 concurrent connections, or when a profile shows the membership
lookup on the broadcast path above ~1 % of push latency. The fix then is a short-lived cache of the trip's member set
inside the hub, invalidated by the master push — which is Option B's call site again, but as a cache hint whose loss
costs latency rather than authorization.
