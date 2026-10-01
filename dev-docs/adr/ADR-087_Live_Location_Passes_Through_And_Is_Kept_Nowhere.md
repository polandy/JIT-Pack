# ADR-087: Where the others are — passed through live and kept nowhere vs. the last position stored

**Status:** Accepted
**Related:** ADR-085 (tracks on a map), ADR-056 (the hub asks again for every send), FR-29.17, FR-29.19, invariant 3,
invariant 5, Sync-API §7

**Decision Drivers (in priority order):**
1. **A position is the most private thing the app could hold.** Where a person is — and was — must not become a trail
   on a server somebody else runs, in a backup, or in the activity log.
2. **It is useful on the trail, in the moment.** The family on a hike wants to see who is ahead and where, now — not
   where somebody was this morning.
3. **The person decides.** Nobody's position is passed on unless they switched it on, for that trip.
4. **No new moving part** if one that exists will carry it.

---

## Considered Options

### Option A — passed through the hub, held in memory per connection *(accepted — the owner's call)*

The device sends `{"location": {trip_id, lat, lon, accuracy_m}}` over the WebSocket it already holds. The hub, after
the membership check, stamps the sender's account and the server's time, keeps the newest fix **on the connection**,
and sends it to the trip's other subscribers (the per-send gate of ADR-056 applies). A member who subscribes later is
given the fixes live now. A stop, leaving the trip or the socket ending sends *gone* — unless another of the person's
devices still shares, which then speaks for them.

**Pros**
- Nothing is stored: a restart of the server, a backup, the activity log hold no position (driver 1).
- Live by construction — the frame arrives within a second (driver 2).
- The socket, its authentication and its membership gate are all there already (driver 4).

**Cons**
- Only while the app is open: a phone's browser gives no position in the background. Accepted — a native shell
  (ADR-006) is where background sharing would come from, and with it a new decision.
- Offline, nobody is seen; a device that was sharing simply goes quiet, and its mark disappears after 5 minutes.
- A server restart drops every live position until the devices send again (within 30 seconds).

### Option B — the last position stored as a synced row

A `live_locations` row per person and trip, written through the outbox and pulled like any row.

**Pros**
- The others see where somebody last was even offline or after they closed the app (*„vor 2 h"*).

**Cons**
- A trail in the database, the change log, the activity log and the backups — exactly what driver 1 forbids.
- A row written every few seconds churns the change feed every device of the trip pulls.

### Option C — only the own position, no sharing

**Pros**
- Nothing leaves the device.

**Cons**
- Answers half the ask: the owner wants to see the others too.

---

## Decision Matrix

| Driver | Weight | A — live, in memory | B — stored row | C — own only |
|---|---|---|---|---|
| Private | 4 | 3 — nothing kept | 0 — a trail everywhere | 3 |
| Useful in the moment | 3 | 3 | 2 — the feed's lag | 0 |
| The person decides | 3 | 3 — per trip, off by default | 3 | 3 |
| No new moving part | 1 | 3 — the socket | 1 — a table, a feed | 3 |
| **Total** | | **33** | **16** | **24** |

---

## Decision

A position is shared per trip, by the person, while the app is open; it passes through the hub to the trip's other
members, stamped by the server, and is held only on the live connection. The client's rules — when to send, when a
mark is stale — are `client/src/lib/liveLocation.ts`; the hub's are `internal/api/livelocation.go`.

## Consequences

**Positive**
- A hike's group sees itself on the Landeskarte, live, without a trail being kept.
- The own position needs no server and works in Local Mode.

**Negative / accepted costs**
- No background sharing and no last-known position.
- The instance's operator could in principle log the frames passing through the server; the app does not.

**Neutral**
- The two choices — sharing a trip, showing the others — are per device, not synced: another device of the same
  person shares only when switched on there.

## Revisit Trigger

The native shell (ADR-006) is built — then background sharing is possible and asks for its own decision. Or the
family asks to see where somebody *was* — then Option B's cost is weighed again, with a retention limit.
