# ADR-099: Notifications are a package of their own — `internal/notify` vs. push inside `internal/api`

**Status:** Accepted
**Related:** ARCH-06, FR-6.2, FR-7.11, NFR-4.6, ADR-058, ADR-076, CODING_PRINCIPLES §3, invariant 1,
`internal/notify/`, `cmd/jitpackd/dependencies_test.go`

**Decision Drivers (in priority order):**
1. A notification rule is reachable by a unit test without HTTP, a database and a goroutine (§3's acceptance
   criterion), and so is what a push service's answer does to a subscription.
2. `internal/api` holds HTTP; the state a sub-domain owns (the VAPID keypair, the deliveries in flight) is not the
   `Server`'s to carry.
3. A delivery to a push service that never answers ends.
4. The cost: a fifth row in invariant 1, and one more package a reader has to place.

---

## Context

§3 kept push in `internal/api/push.go` because it was "small enough that the package boundary would buy nothing". By
ARCH-06 the sub-domain was four files of 1,189 lines — who a push notifies (FR-6.2, FR-7.13, FR-29.8, FR-30.12),
FR-7.11's daily reminder, the lock takeover's notice and Web Push. `planNotifications` took ten parameters, five of them
resolvers hand-built in the handler; the VAPID keypair, its mutex, the push contact and the wait group of detached
deliveries sat on `Server`; and `webpush.SendNotification` ran on `context.Background()` with no deadline, so a test
of delivery had to wait three seconds of wall clock for a goroutine it could not join.

## Considered Options

### Option A — `internal/notify` with two seams *(accepted)*

A package between `api` and `store`: the rules (`rules.go`, `due.go`), a `Notifier` that creates the rows, pings the
devices through a one-method `Pinger` and sends Web Push, and the HTTP endpoints left in `api`. The rules read the trip
through `notificationFacts` — five questions, one fake in the tests, `storeFacts` in production — and a delivery goes
through `pushSender`, whose production implementation bounds each send with `pushSendTimeout`. `Server` keeps one
`*notify.Notifier`; which mutations landed stays `api`'s, which holds the verdicts.

**Pros**
- The rules' table states every trigger against one fake; what a 404, 410 or 500 does to a subscription is a table
  over a fake sender; the timeout is a test of its own.
- `Server` loses five fields and the delivery methods; `api` is HTTP again.

**Cons**
- Invariant 1 grows a row (`api → notify → store, sync`), and every doc that names the order says so.
- `notificationFacts` has five methods where §3 asks for one to three — the five questions are one effect, the trip's
  reads, and splitting them would hand the rules five interfaces to stand for one.
- The `Notifier` still takes `*store.Store`: its writes and the reminder's reads are tested on real SQLite, which the
  Go test rules prefer over a fake of fifteen methods.

### Option B — keep it in `api`, add the seams there

The same two interfaces, `Server` still holding the Web Push state.

**Pros**
- No new package, invariant 1 unchanged.

**Cons**
- The cohesion cost stays: `Server` carries a sub-domain's state, and every rule still compiles against the HTTP
  package, so nothing stops a rule from reaching for a handler's helper.

---

## Decision Matrix

| Driver | Weight | A: `internal/notify` | B: seams in `api` |
|---|---|---|---|
| Rules and delivery unit-testable | 3 | 3 — both seams, no HTTP in reach | 2 — the seams, HTTP in reach |
| `api` holds HTTP only | 2 | 3 — `Server` keeps one field | 1 — the state stays |
| A send ends | 2 | 3 — `pushSendTimeout` | 3 — the same timeout |
| Cost | 1 | 1 — a row in invariant 1, a moved test suite | 3 — none |
| **Total** | | **22** | **17** |

---

## Decision

Notifications live in `internal/notify`. `api` passes it the push's landed mutations, a lock event, the shutdown wait
and the reminder loop; the rules read through `notificationFacts`; a Web Push send goes through `pushSender` and gives
up after `pushSendTimeout`.

## Consequences

**Positive**
- `push_test.go` reads a delivery after `WaitDetached` rather than within three seconds.
- §3's exception for push is gone: the layout lists `internal/notify` as a package like the others.

**Negative / accepted costs**
- One more package in invariant 1, held by `dependencies_test.go`.
- A delivery a push service answers only after ten seconds is lost while the server runs, where it used to land.
  At shutdown nothing changes: the five-second budget abandoned it before.

**Neutral**
- The wire, the routes and the stored rows do not change.

## Revisit Trigger

A second delivery channel (e-mail, a native push service), or `notificationFacts` growing a sixth question — then the
facts split by the rule that asks them.
