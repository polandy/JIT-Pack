# ADR-028: A packing claim ends by decision — takeover vs. expiry vs. expire-and-announce

**Status:** Accepted
**Related:** FR-5.3 (Collision Prevention), FR-5.7 (the requirement this decides), FR-6.2 (notifications), Sync-API §7
(the window being removed), UI-Spec G-3, backlog 14(d), invariant 3 (server-stamped identity), invariant 5 (three
modes), invariant 2 (no migrations), `trip_items.packing_now_by` / `packing_now_at`

**Decision Drivers (in priority order):**
1. **No claim is discarded behind its holder's back.** FR-5.3 exists so two people do not pack the same thing twice. A
   rule that silently stops honouring a live claim reintroduces exactly that, and does it worst when the holder is slow
   — which is when they most need the row held.
2. **Every break has an author.** A lock that anyone can walk through is only a lock if walking through it is
   attributable. Attribution is also what lets a household settle it the way households settle things: by asking the
   person.
3. **A blocked row always has a way out**, reachable by whoever is standing in front of it, without waiting.
4. **The three modes keep their own answer** (invariant 5). Whatever this costs, Local Mode must not lose the ability to
   give your own row back.
5. **Cost of building and running it** — including what it obliges the *server* to do, which today is nothing periodic
   at all.

---

## Considered Options

### Option A — a claim ends only by decision *(recommended, accepted)*

The staleness window is removed. A claim holds until the holder packs the row, the holder releases it, or somebody else
**takes it over**: one gesture that ends the previous claim and starts the taker's, confirmed against the holder's name
before the fact, notified to the holder as an FR-6.2 kind, and written to a `lock_events` row. The lock becomes partly
server-side, because only the server can stamp who took over (invariant 3) and create a notification for another
account.

**Pros**

- A live claim is never dropped without its holder learning of it — driver 1 satisfied outright rather than mitigated.
- Every break has a name, a time and a record, and the person it happened to is told. Driver 2 satisfied by
  construction: there is no unattributed path.
- The way out is immediate and needs no waiting: whoever wants the row takes it (driver 3).
- Local Mode and Single-User keep the release, which needs nobody else; the takeover surface is simply absent where
  there is no second person (driver 4, resolved by G-8 rather than by an inert control).

**Cons**

- **An abandoned claim blocks its row until a person notices.** The window used to clear that unattended. This is the
  real cost and it is accepted: the block is soft — the row names its holder, any member can take it in one gesture, and
  the app is used by people in the same building who can ask.
- A schema change for `lock_events`, which under invariant 2 means every development database is refused and reseeded.
- Reverses backlog 14(d)'s conclusion that the lock stays a client-side courtesy. That conclusion was correct for a lock
  that only *displayed*; it does not survive a lock that notifies.

### Option B — a claim expires by itself (the status quo, Sync-API §7)

Every client stops honouring a claim older than the instance's window (`JITPACK_LOCK_TIMEOUT`, served on `GET /config`).
Nothing is written and nobody is told.

**Pros**

- Already built, including the per-instance window; no schema change, no reseed, no server involvement.
- An abandoned claim clears with nobody having to notice it.
- Identical in all three modes, since it needs no server.

**Cons**

- **It discards live claims, and silently.** Fifteen minutes is not a statement about whether somebody is still packing;
  a person looking for the tent in the cellar crosses it easily. The holder is never told their claim stopped counting,
  so both of them pack the tent — the exact failure FR-5.3 exists to prevent.
- No author, no record: the row stops being locked and nothing can say why or by whom (driver 2 unmet).
- The way out is *waiting* rather than acting, and the wait is invisible — before FR-5.7's predecessor work there was
  not even a line saying the window existed.

### Option C — the claim expires, and the expiry is announced

Keep the window, and notify the holder when their claim ages out.

**Pros**

- Removes the silence, which is B's worst property, while keeping the unattended clearing that is B's best one.
- Reads as the compromise, and was the option to beat.

**Cons**

- **It costs everything A costs and keeps the clock.** The notification needs the server, a new FR-6.2 kind and an M17
  toggle; a record of "expired at" is the same table. Once that is paid for, the clock is no longer buying cheapness —
  it is only buying the ability to decide, badly, on the holder's behalf.
- **It obliges the server to run a clock, which this server has nowhere to put.** Expiry is not an event any request
  causes: the whole point is that nobody acted. Announcing it therefore needs periodic work, and `jitpackd` has exactly
  one goroutine — the listener (`cmd/jitpackd/main.go`). There is no scheduler, no ticker and no job runner to extend,
  so C is not a smaller version of A but an architectural addition on top of it.
- It keeps driver 1 unmet: a live claim still stops counting because of a duration. The holder now learns about it,
  which is better than B and still worse than not doing it.

---

## Decision Matrix

| Driver | Weight | A (ends by decision) | B (expires, silent) | C (expires, announced) |
|---|---|---|---|---|
| No claim discarded behind the holder's back | 5 | 5 — only a person ends a claim | 0 — a duration ends it, unannounced | 2 — still a duration, but the holder hears |
| Every break has an author | 4 | 5 — taker stamped, recorded, notified | 0 — no actor exists to record | 2 — an expiry has no author to name |
| A way out without waiting | 4 | 5 — take it now | 1 — wait out the window | 1 — same wait |
| Modes keep their own answer | 3 | 4 — release everywhere, takeover where there is a second person | 5 — identical everywhere | 4 — same as A |
| Cost to build and to run | 2 | 2 — schema change, reseed, server involvement | 5 — already built | 1 — A's cost plus a scheduler the server does not have |
| **Total** | | **77** | **28** | **35** |

---

## Decision

A claim ends because somebody decided it should. `packing_now` holds until the holder packs the row, the holder releases
it, or another member takes it over — and a takeover confirms against the holder's name, is stamped with the taker by
the server, writes a `lock_events` row readable per trip, and notifies the person it was taken from. The staleness
window and everything serving it (`JITPACK_LOCK_TIMEOUT`, `lock_timeout_seconds`, the client's freshness test, the
expired-claim row note) are removed: with no window there is no *stale* state, only claimed and free.

## Consequences

**Positive**

- The lock is worth trusting: while it says Sia has the tent, Sia has the tent, however long she takes.
- Breaking it is available to everyone and free to nobody — it costs a confirmation you read and a notice the other
  person gets.
- `lock_events` gives a household the one thing the packing screen could never answer afterwards: who took what from
  whom.

**Negative / accepted costs**

- A holder who walks away blocks their row until somebody takes it. Accepted, and softened rather than solved: the row
  names them, and taking it over is one gesture.
- The lock is no longer purely client-side. Backlog 14(d)'s conclusion is superseded here, deliberately and one day
  later.
- One schema change, and with it a reseed of every development database including the `:3000` instance (owner accepted
  2026-08-23). The reseed path is repeatable.
- Two days of work is deleted rather than adapted: the per-instance window and the expired-claim note both go. Keeping
  them would leave two rules for one question.

**Neutral**

- Local Mode and Single-User Mode lose nothing they had: there is no second person to take a row from, and the release
  works without a server. The takeover surface is hidden per G-8.
- The merge rules are untouched. This is about avoiding collisions, not resolving them; NFR-4.2a still decides what
  happens when two devices write the same field anyway.

## Revisit Trigger

**A scheduler appears in `jitpackd` for another reason.** §3.26's calendar feed is the likeliest — it needs periodic
work — and the moment one exists, C's disqualifying cost is gone and *expire-and-announce* becomes a cheap addition
rather than an architectural one. Revisit then, not before: the question is not whether waiting is unpleasant but
whether a duration may overrule a person, and only a cheap way to do both is new information.

**Or:** a trip gains members who are not in the same building. The accepted cost above rests on being able to ask the
holder. Once a trip is shared with somebody who cannot be asked, an abandoned claim stops being soft and the case for a
bounded hold returns on its own merits.
