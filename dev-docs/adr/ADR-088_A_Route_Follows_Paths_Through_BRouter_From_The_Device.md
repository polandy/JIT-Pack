# ADR-088: Editing a route — paths from BRouter asked by the device, the edit saved as a GPX file of our own

**Status:** Accepted
**Related:** ADR-085 (tracks read on the device, tiles on by default), ADR-082 (the server's one outbound request),
FR-29.20, FR-29.17, NFR-4.3, invariants 4 and 5, `client/src/domain/route.ts`, `client/src/composables/routing.ts`,
`client/src/components/global/TrackEditor.vue`

**Decision Drivers (in priority order):**
1. **It feels like the swisstopo app.** A point set on the map is joined to the last one *along the paths*, and a
   handle that moves takes its two stretches with it. A straight line between two taps is not a hike.
2. **Every mode keeps it** (invariant 5). Local Mode has no server, and drawing a variant on holiday must work there.
3. **The operator decides which third party is asked**, as for the tiles (ADR-085): a switch, on by default.
4. **Few new parts** (NFR-4.3): no new dependency, and no service the instance has to run.
5. **Nothing of the trip leaves the device** beyond two coordinates per request.

---

## Considered Options

### Who finds the path

#### Option A — the public BRouter, asked by the device *(recommended, accepted)*

`composables/routing.ts` asks `https://brouter.de/brouter` for one stretch at a time: two points, a profile
(`hiking-mountain` for a hike, `trekking` for a bike tour), GeoJSON back with a height on every point. BRouter is
open source, routes on
OpenStreetMap with SRTM heights and answers cross-origin. `JITPACK_ROUTING=false` turns it off and
`JITPACK_ROUTING_URL` points it at another BRouter; the instance's config carries the address, empty when off. Local
Mode asks the public one.

**Pros**
- Paths anywhere OpenStreetMap has them, with heights, so the figures and the time stay true (driver 1).
- Local Mode keeps it, since the device asks (driver 2).
- No new code on the server beyond one config field, and an operator can run their own BRouter (drivers 3, 4).

**Cons**
- A volunteer-run service with no promise of uptime. When it fails, the stretch is drawn straight and says so.
- The router learns the device's address and the two points of each stretch.
- OpenStreetMap's paths, not the Landeskarte's hiking trails: in Switzerland they mostly agree, not always.

#### Option B — the same BRouter, through the server

The server forwards each request, as it reads a pasted link (ADR-082).

**Pros**
- The router sees the server's address, not the device's.

**Cons**
- Local Mode loses the paths (driver 2), and Server Mode loses them whenever the device cannot reach its own server.
- A second outbound fetcher on the server and a route to keep. Meanwhile the tiles under the same map already go
  straight from the device to swisstopo and OpenStreetMap, so the privacy gained is small.

#### Option C — a router the instance runs

A BRouter or GraphHopper container beside JIT-Pack, with the region's data.

**Pros**
- No third party at all.

**Cons**
- Gigabytes of routing data and a second service for a family's instance (driver 4). It stays possible through
  `JITPACK_ROUTING_URL` for an operator who wants it.

#### Option D — straight lines only

**Pros**
- No third party, works offline.

**Cons**
- Not the swisstopo app (driver 1): a variant drawn from straight lines has no path under it.

### The heights of a straight stretch

A stretch drawn as *Luftlinie* — or one the router could not find — gets its heights from swisstopo's profile service
(`api3.geo.admin.ch/rest/services/profile.json`) where both ends lie in Switzerland, and none elsewhere. It is
swisstopo again, under the tiles' switch: where the operator turned the tiles off, editing is locked anyway, because a
route cannot be set without a map.

### What an edit saves

The device writes **a new GPX file** from the edited points (`writeGpx` in `domain/route.ts`): a track with the
kind's `<type>`, every point with its height. It goes up through FR-29.17's upload, read by the same `readTrack`.
*Als neuer Track* adds it under a new id. *Ersetzen* replaces the file under the same id, so name, kind, *Mit Kind*
and pauses stay. The original file is gone after a replacement. The undo in the toast puts the old file back with
the same upload. Neither the server nor the schema changes. Editing a file in place, keeping its timestamps and
extensions, was not weighed further: an edited route has no recorded times, and a second file per track would be a
second table.

---

## Decision Matrix

| Driver | Weight | A — BRouter from the device | B — through the server | C — our own router | D — straight |
|---|---|---|---|---|---|
| Feels like swisstopo | 5 | 3 — paths with heights | 3 | 3 | 0 |
| Every mode | 4 | 3 — Local Mode asks too | 1 — server needed | 1 | 3 |
| Operator decides | 3 | 3 — a switch and an address | 3 | 3 | 3 |
| Few new parts | 2 | 3 — one config field | 1 — a fetcher and a route | 0 — a service | 3 |
| Nothing leaves | 1 | 1 — address and two points | 2 | 3 | 3 |
| **Total** | | **43** | 32 | 31 | 30 |

---

## Decision

Paths come from BRouter, asked by the device, on by default behind `JITPACK_ROUTING` with its address in
`JITPACK_ROUTING_URL`. An edit is saved as a GPX file the device writes, uploaded as a new track or as the
replacement of the one it came from.

## Consequences

**Positive**
- A variant is drawn in the app the family plans in, with the figures and the time recomputed as it is drawn.
- No schema change, no new endpoint: an edited route is a track like any other.

**Negative / accepted costs**
- A second third party is asked by the device, on by default. Without it, editing joins points by straight lines.
- The public BRouter can be slow or down. A stretch then stays dashed until it answers, or is drawn straight.
- An edited route's file is ours: the original's timestamps, waypoints and extensions are not carried over.

**Neutral**
- The routing profiles are two names in one table; another BRouter must know them.

## Revisit Trigger

The public BRouter refuses or throttles our requests, or a tester finds the OpenStreetMap paths disagree with the
Landeskarte's hiking trails often enough to plan wrongly — then the router behind `JITPACK_ROUTING_URL` is
reconsidered (our own, or swisstopo's should it publish one).
