# ADR-055: A detached Web Push delivery is waited for at shutdown — process-wide WaitGroup vs. test-only completion hook

**Status:** Accepted
**Related:** NFR-4.6 (self-hosted notification architecture), FR-6.2 (notification triggers), FR-17.3 (Single-User
Mode has no second party), the working agreement's "no non-deterministic timing constraints", 2026-08-22 bug review
finding 22a

**Decision Drivers (in priority order):**
1. **A test must be able to observe the end of the work it started.** The rule is binding and has no exception for
   background work: a test that waits on the wall clock passes for a reason nothing states. The Web Push send is the
   only place in the server where a request starts work and stops waiting for it, and it was also the only place
   left in the Go suite with a sleep-poll — the two facts are the same fact.
2. **A seam only a test uses is a seam nothing else keeps honest.** The project has paid for this before: among the
   four constructor setters that became `api.Options`, one existed for a single test and simulated a state
   production could not reach. A signal worth asserting against is one production also acts on.
3. **NFR-4.6 says push must reach a backgrounded client.** A delivery cut off by process exit fails exactly the
   clients Web Push exists for; the WebSocket fallback does not reach them either, because they are not connected.
4. **Shutdown must stay bounded.** A push service that never answers may not hold a container in `stopping`.

---

## Considered Options

### Option A — a `sync.WaitGroup` on the Server, drained at shutdown *(recommended, accepted)*

`createAndNotify` registers the goroutine it detaches; `Server.WaitDetached(ctx)` blocks until those goroutines are
done or `ctx` is. `cmd/jitpackd` calls it after `httpSrv.Shutdown`, on the same five-second deadline. The test calls
it with a live context and reads the store immediately afterwards.

**Pros**
- The signal is production behaviour, so it is exercised by every run rather than only by the test that asserts it.
- It closes a real hole: today SIGTERM discards a delivery that has already been promised to the notification.
- One bounded wait, reusing the deadline that already exists — no second timeout to configure or document.

**Cons**
- `WaitGroup` has an ordering rule (no `Add` racing a `Wait` from zero), so the method's godoc has to say when it may
  be called. That rule is not enforced by the type; it is a comment, and comments are not checks.
- Shutdown can now take longer than it did, up to the existing budget, on an instance whose push service is slow.

### Option B — a completion hook in `api.Options`

An optional `OnPushDelivered func()` the test sets and production leaves nil.

**Pros**
- Smallest diff, and no change to shutdown behaviour at all.
- Impossible to slow anything down, because nothing outside a test ever reads it.

**Cons**
- It is a seam with one caller, and that caller is the test asserting through it — the shape driver 2 names.
- It answers "a delivery finished", not "no delivery is in flight", so a test with two subscriptions has to count
  calls and know how many to expect. The number is a duplicate of the fixture.
- The shutdown hole stays open and unrecorded.

### Option C — send Web Push synchronously inside the request

**Pros**
- Nothing detached, so nothing to wait for: the push response is the completion signal, and the test needs no seam.

**Cons**
- Puts a third-party HTTP call on the push path, so a slow push service slows every mutation batch that earns a
  notification — the reason the send was detached in the first place.
- A push service that hangs would hold a request until the server's own write timeout, turning a notification
  side-effect into a sync failure the client retries.

---

## Decision Matrix

| Driver | Weight | A: WaitGroup | B: test hook | C: synchronous |
|---|---|---|---|---|
| Test observes the end of the work | 10 | 10 — one call answers "nothing is in flight" | 7 — answers per delivery, count duplicated in the test | 10 — there is no detached work |
| Seam is production behaviour | 9 | 10 — shutdown reads it | 2 — nil in every non-test build | 10 — no seam at all |
| Delivery survives to the wire (NFR-4.6) | 8 | 9 — up to the shutdown budget | 3 — unchanged, still cut off | 10 — sent before the response |
| Shutdown stays bounded | 6 | 8 — bounded by the existing deadline | 10 — untouched | 4 — bounded by the write timeout, on the request path |
| **Total** | | **310** | **172** | **294** |

C loses on one driver only, and it is the one it loses hardest: the detachment it undoes is deliberate, and undoing
it moves a third-party outage onto the sync path — a bigger failure than the one being fixed.

---

## Decision

`Server` counts the goroutines it detaches in a `sync.WaitGroup`; `WaitDetached(ctx)` drains them or returns
`ctx.Err()`. `cmd/jitpackd` drains after the HTTP server has stopped accepting requests, on the shutdown deadline it
already had, and logs when it gives up. The Web Push tests wait on that instead of polling the store.

## Consequences

**Positive**
- The Go test suite contains no `time.Sleep` at all, and `scripts/no-sleep-gate.mjs` holds it there.
- A notification created moments before SIGTERM now reaches its push service, if the service answers in time.
- The next piece of detached work has somewhere to register itself, and a test of it has something to wait on.

**Negative / accepted costs**
- The "call it only after the server stopped accepting requests" rule lives in a doc comment. It is correct for both
  callers today and nothing checks the third.
- `WaitDetached` is exported for one production caller and one test package. That is one more exported symbol than
  the server strictly needs.
- Stopping an instance whose push service is unreachable takes the full five seconds rather than returning at once.

**Neutral**
- The gate reads two spellings of a wall-clock wait, `time.Sleep` in Go tests and `waitForTimeout` in Playwright
  specs. It cannot see a negative asserted against a short read deadline, which is the shape the same bug review
  found in `ws_test.go`, `master_test.go` and `hub_test.go`; those stay open and the script's header says so.

## Revisit Trigger

A second kind of detached work whose completion means something different from the first — a scheduled digest, a
retry queue, an outbound webhook. One `WaitDetached` for all of them answers "everything is quiet", which is the
right answer for shutdown and the wrong one for a test that cares about a particular piece; at that point the
counter becomes a per-kind one, or the work moves behind a named queue with its own drain.
