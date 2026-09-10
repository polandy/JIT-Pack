# ADR-057: A broadcast waits for no peer — per-connection queue vs. serial writes

**Status:** Accepted
**Related:** ADR-056 (a subscription is authorised on every send), Sync-API Spec §7 (WebSocket events) and §9 (idle
timeout), P-1 (one read path), NFR-4.6, `internal/api/hub.go`, `internal/api/ws.go`

**Decision Drivers (in priority order):**
1. **One stalled device must not be able to delay every other device.** The hub wrote to its subscribers in a loop,
   each write bounded by a 5 s context. A peer whose socket the kernel has stopped draining — a phone that walked out
   of range and whose TCP connection has not failed yet — held that write for the full 5 s, and the *next* subscriber
   was not written to until it ended. With three such peers the last member of a trip learned about a change 15 s
   after it happened, on the sync path, with nothing in any log to say why.
2. **A WebSocket event is a hint, and losing one costs a pull, not data.** §7's events carry no rows; P-1 makes the
   pull the only read path, and the client re-pulls everything on every reconnect after the first (implemented
   2026-09-01). What a dropped event costs is therefore bounded and already handled.
3. **Memory per connection has to be bounded by something.** Whatever absorbs the slack must have a stated size and a
   stated behaviour when it is full, or the answer to a stalled peer is an unbounded queue.
4. **Order per connection.** Events for one socket must arrive in the order the hub produced them; `item.locked`
   followed by `item.unlocked` in the other order is a lock nobody can clear.

---

## Considered Options

### Option A — one queue and one writer goroutine per connection, drop the peer that overruns it *(recommended, accepted)*

`conn` gains a buffered channel of frames and a `done`. `Register` starts a pump that is the connection's only writer;
`Unregister` ends it. `send` marshals once and hands the frame to each target's queue without blocking. A queue that
is full means the peer has stopped reading: the connection is closed, its read loop fails, and the handler unregisters
it. The client's existing reconnect-and-pull recovers what it missed.

**Pros**
- The broadcast is O(number of targets) channel sends and returns; no peer can delay another, whatever its socket does.
- Bounded: `wsSendQueue` frames per connection, and a stated behaviour at the boundary.
- Order per connection is preserved by construction — one writer, one queue.
- The 5 s write timeout stays, but changes meaning: it reaps a socket, rather than pacing everybody else's delivery.
- Testable without a socket: the pump writes through a small interface, so a test can hold a peer *inside* a write and
  assert that another peer received the event anyway — a rendezvous, not a deadline.

**Cons**
- A peer is disconnected for being slow, which the peer experiences as a reconnect and a full re-pull. On a slow link
  that is more expensive than the events it missed.
- One goroutine per connection, and one more place where a connection can end.
- The drop is invisible to the client: it looks like any other closed socket.

### Option B — one goroutine per send

`send` spawns a goroutine per target and returns immediately.

**Pros**
- Two lines. No new state on `conn`, no lifecycle to get wrong.
- No peer waits for another.

**Cons**
- Unbounded: a stalled peer accumulates one parked goroutine *per event*, each holding a frame, for as long as the
  stall lasts. Driver 3 is not answered — it is inverted.
- Order per connection is lost, which driver 4 forbids outright: two goroutines writing to the same socket may
  interleave, and `coder/websocket` refuses concurrent writers anyway.

### Option C — leave it, and shorten the write timeout

Keep the serial loop, drop the timeout to, say, 500 ms.

**Pros**
- One constant changes. No new machinery, nothing new to test.

**Cons**
- Only makes the delay smaller: N stalled peers still cost every later subscriber N × 500 ms, and the cost still grows
  with the number of devices on the trip.
- Trades one arbitrary number for another with no way to say which is right, and a timeout short enough to be
  harmless is short enough to cut off a merely slow — rather than dead — peer.

---

## Decision Matrix

| Driver | Weight | A: queue per conn | B: goroutine per send | C: shorter timeout |
|---|---|---|---|---|
| One peer cannot delay the others | 5 | 5 — never waits | 5 — never waits | 2 — waits less |
| A dropped event costs a pull, not data | 4 | 5 — the drop is deliberate and logged | 4 — nothing is dropped, but nothing is bounded | 5 — nothing dropped |
| Bounded memory per connection | 4 | 5 — `wsSendQueue` frames, stated | 1 — one goroutine per undelivered event | 4 — nothing queued |
| Order per connection | 4 | 5 — one writer | 1 — interleaves, and the library refuses it | 5 — one writer |
| **Total** | | **85** | **51** | **65** |

---

## Decision

Each connection owns a queue of `wsSendQueue` frames and a single writer goroutine started at `Register` and ended at
`Unregister`. `Hub.send` marshals the event once and enqueues it for every target without blocking. A connection whose
queue is full is closed and stops being written to; the handler's read loop discovers the closure and unregisters it,
so there is still exactly one path out of the hub. The write timeout stays at 5 s per frame, now bounding one socket
rather than the broadcast.

## Consequences

**Positive**
- Delivery latency for a trip's members no longer depends on the worst socket among them.
- The failure is now *stated*: a dropped peer is logged with its user id, where the old behaviour — everybody waits —
  was invisible except as slowness.
- The `wsWriter` seam makes the hub's delivery rules testable with no sockets and no timing: a fake peer that parks
  inside `Write` lets a case assert what the *other* peer received, and the queue-overrun case is a rendezvous rather
  than a count that races the pump.

**Negative / accepted costs**
- A peer that falls more than `wsSendQueue` frames behind is disconnected and pays a reconnect and a full re-pull.
  This is the deliberate trade of driver 2, and it is what keeps driver 3 answerable.
- One goroutine per open connection, for the life of the connection.
- An event enqueued for a peer that is then dropped is lost with no notice to anyone; the client discovers nothing
  because from its side this is an ordinary disconnect.

**Neutral**
- Nothing on the wire changes: no new frame, no new field, no client change.
- `Unregister` now stops the pump before it takes the connection out of the map, so a frame enqueued a moment earlier
  may never be written. That was already true of a socket about to close.

## Revisit Trigger

When a legitimately slow but live peer is observed being disconnected — the log line names it — or when a trip
routinely carries enough connections that one goroutine each is a number somebody has to think about. The fix then is
not a bigger queue but a slower producer: coalescing `trip.changed` per trip inside a short window, which is the one
event that arrives in bursts.
