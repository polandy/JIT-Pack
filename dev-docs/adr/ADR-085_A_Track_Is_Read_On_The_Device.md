# ADR-085: GPX tracks — read on the device, a drawn line in the row and the file outside it, over Leaflet

**Status:** Accepted
**Related:** ADR-002 (bytes outside the envelope), ADR-081 (idea pictures, whose upload path this follows), ADR-082
(the other request on by default), ADR-078 (the planner), FR-29.17, NFR-4.3, invariants 4 and 6,
`internal/store/track.go`, `internal/api/track.go`, `client/src/domain/track.ts`,
`client/src/components/global/TrackMap.vue`

**Decision Drivers (in priority order):**
1. **The board and the open idea draw a track without fetching a file.** A family scrolls M28 on a phone, often on
   a mountain's signal; a card must not wait for the whole recording.
2. **One reader of the format** (invariant 4). Local Mode has no server and has to read a track too, so the rules —
   parsing, distance, climb, time — are the client's and there is only one of each.
3. **The file stays as it was given.** A track is downloaded again to go into a watch or a hiking app; whatever the
   app keeps for drawing is not that file.
4. **The trip stays private** (ADR-081 driver 1): the file and the row are the trip's.
5. **Few new parts** (NFR-4.3): one dependency at most, loaded only by the screen that draws a map.

---

## Considered Options

### Where the track lives

#### Option A — read on the device; the row carries the figures and a drawn line, the file sits outside *(accepted)*

The device reads the GPX when it is chosen (`domain/track.ts`): the points, their distance, climb and descent with a
5 m hysteresis, the highest point and a line thinned to at most 800 points, encoded as a polyline string. It sends all
of it in one `PUT /trips/{id}/ideas/{ideaID}/tracks/{trackID}`, and the server writes the `idea_tracks` row — the
figures, the line, the hash, the name and kind — and the file, in `idea_track_gpx` outside the envelope, in one
transaction. It does that under the client's id, as for a picture. The row travels the trip partition. A push may
change the name, the kind, *Mit Kind*, the pauses and the place, or delete the row. It may never create one or
change what the file says. The file is read back only to be downloaded. Local Mode writes the row on the device and
keeps the file in IndexedDB.

**Pros**
- A card and the detail draw from the row they already hold, offline included (driver 1).
- The figures are read once, by the code that reads them everywhere (driver 2).
- The original is kept byte for byte (driver 3).

**Cons**
- The row's figures are what the uploading device computed. A member could send figures the file does not hold —
  as they could write any other field of the trip.
- A row carries up to ~8 KB of line, more than any other trip row.
- Replacing a file is an upload again, not an edit.

#### Option B — the row names the file; every device reads it

The row carries only the name and the hash. Each device fetches the file and reads it when it draws.

**Pros**
- The smallest row, and no figure that could disagree with its file.

**Cons**
- A board of eight ideas with two tracks each fetches sixteen files before it can draw a card, each up to 5 MB
  (driver 1).
- Offline, a track whose file was never fetched is a blank tile.

#### Option C — the whole track in the row

**Pros**
- No second table, no upload route.

**Cons**
- A 5 MB row in the envelope, in every pull and in the outbox (ADR-002).
- The original is gone (driver 3).

### Drawing the map

#### Option M1 — Leaflet, loaded with the first map *(accepted)*

Leaflet 1.9 (~42 KB gzipped with its stylesheet), imported dynamically by `TrackMap.vue`, raster tiles from swisstopo
and OpenStreetMap in Web Mercator.

**Pros**
- Small, no WebGL, and both tile sources speak its default projection.
- Touch gestures, attribution and fitting a line are already solved.

**Cons**
- A new dependency (NFR-4.3), and a stylesheet of its own with colours outside our tokens.

#### Option M2 — MapLibre GL

**Pros**
- Vector maps, smooth zoom.

**Cons**
- ~250 KB gzipped and WebGL, and neither raster source needs it.

#### Option M3 — a tile grid of our own

**Pros**
- No dependency.

**Cons**
- Pinch-zoom, inertia and tile caching written and maintained by us, for one screen.

### The tiles

The browser fetches the tiles directly from `wmts.geo.admin.ch` and `tile.openstreetmap.org`, without going through
the instance. Those hosts learn the device's address and the area it looks at. It is the first request a *client*
makes to a third party without being asked. It is **on by default** (the owner's call, as for ADR-082):
`JITPACK_MAP_TILES=false` turns it off, the instance's config says so, and every map is then the line alone on the
card's surface — what a device offline sees anyway. Local Mode has no operator to ask and draws tiles.

---

## Decision Matrix

| Driver | Weight | A — line in the row, file outside | B — file only | C — all in the row |
|---|---|---|---|---|
| Draw without fetching | 5 | 3 — from the row | 0 — a fetch per track | 3 |
| One reader | 4 | 3 — the device, once | 3 — the device, each time | 3 |
| The original kept | 3 | 3 — byte for byte | 3 | 0 — parsed away |
| Trip-private | 2 | 3 — ADR-081's gate | 3 | 3 |
| Few new parts | 1 | 2 — a table and a route | 2 | 3 |
| **Total** | | **44** | **29** | **38** |

| Driver | Weight | M1 — Leaflet | M2 — MapLibre | M3 — our own |
|---|---|---|---|---|
| Few new parts | 5 | 2 — one small dependency | 1 — a large one | 3 — none |
| Draw without fetching | 3 | 3 | 3 | 3 |
| Cost to build and keep | 3 | 3 — solved | 3 — solved | 0 — gestures by hand |
| **Total** | | **28** | **23** | **24** |

---

## Decision

A GPX file is read on the device that chooses it. The row it creates carries the figures and an 800-point line that
every screen draws from, and the file itself stays outside the envelope behind the trip's membership, 5 MB at most at
handler, store and CHECK. The map is Leaflet, loaded with the first map, with swisstopo's Landeskarte where every
track lies in Switzerland and OpenStreetMap otherwise. Tiles are on unless the operator turns them off.

## Consequences

**Positive**
- The board shows a track's line and figures from the pull alone, also offline.
- Excursions (FR-31) get the same card from the kernel: `domain/track.ts` and the components in
  `components/global/` know no idea.

**Negative / accepted costs**
- Figures are as honest as the uploading device. Nothing re-reads the file to check them.
- Like a picture, a track cannot be added offline in Server Mode.
- The line is thinned: zoomed in on a switchback the drawn track cuts the corner by a few metres.
- Leaflet's stylesheet brings colours the token gate does not see. Our overrides sit in `TrackMap.vue` and use
  tokens.
- A device with tiles on tells swisstopo and OpenStreetMap where it looks.

**Neutral**
- The time on the card is computed, never stored: the paces are constants of `domain/track.ts`, so changing one
  changes every track at once.
- Deleting an idea takes its tracks (FK cascade, a tombstone per row). The file table is excused from tombstones,
  like `idea_image_bytes`.

## Revisit Trigger

- A family asks for an elevation profile, or for times along the way. Then the line needs heights, and either the row
  grows or the file is read when the idea is opened.
- OpenStreetMap's tile servers refuse the instance's traffic. Then the tiles need a provider with a key, or a proxy
  on the instance.
