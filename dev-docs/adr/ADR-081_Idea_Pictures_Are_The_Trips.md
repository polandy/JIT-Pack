# ADR-081: Idea pictures — the upload creates the row, the bytes are the trip's vs. a pushed row and a public GET

**Status:** Accepted
**Related:** ADR-002 (bytes outside the envelope), ADR-078 (the planner), FR-29.5, FR-22.6, invariants 3 and 6,
`internal/store/ideaimage.go`, `internal/api/ideaimage.go`, `client/src/app/ideaImages.ts`,
`client/src/planner/domain/pictures.ts`

**Decision Drivers (in priority order):**
1. **A picture of where a family is going is the trip's.** Whoever is not on the trip must not read it, which an item
   photo's public GET (FR-22.6) would allow to anyone holding the id.
2. **No row names bytes that are not there.** A picture every device lists must be one every member can load.
3. **Offline-first where it is honest.** A move or a delete should wait in the outbox like every other write; bytes
   that were never sent cannot be pretended into the feed.
4. **One mechanism per concern.** ADR-002's split stays: the envelope carries the row, bytes travel on their own.

---

## Considered Options

### Option A — the upload creates the row; the bytes sit behind the trip's membership *(accepted)*

`PUT /trips/{tripID}/ideas/{ideaID}/images/{imageID}` stores the bytes and, in the same transaction, writes the
`idea_images` row (hash, position) and logs it on the trip's feed. The id is the client's, so a retried upload finds
its row and changes nothing. The trip partition lists the row's columns so the pull carries them, and its write gate
lets a push change `position` or delete the row, nothing else. `GET` on the same path answers only a member, so the
client fetches the bytes with its bearer token and shows an object URL, cached per picture and hash for the session.
Local Mode, which has no server, writes the row itself and keeps the bytes in IndexedDB.

**Pros**
- A picture exists on every device exactly when its bytes exist on the server (driver 2).
- The membership gate is the one every other trip route has (driver 1).
- Moving and deleting are ordinary mutations and wait offline (driver 3).

**Cons**
- An upload in Server Mode needs the connection: a picture taken offline is refused, not queued.
- A picture cannot be an `<img src>`: every screen resolves it through the host's channel, and the bytes are fetched
  per session rather than left to the HTTP cache.
- The row's creation path is not the push pipeline, so the trip partition carries one more write-gate rule.

### Option B — the client pushes the row, then uploads the bytes

The row is an ordinary insert through the outbox; the bytes follow over their own endpoint when the device is
online.

**Pros**
- A picture added offline appears at once, on this device.

**Cons**
- Every other device can pull a row whose bytes have not arrived — or never will, if the device that took the
  picture is lost first. Each would show a broken tile with no way to tell *later* from *never* (driver 2).
- The bytes would need their own durable queue beside the outbox: the outbox holds JSON mutations, not 500 KB blobs.

### Option C — Option A's row, with a public GET like an item photo

**Pros**
- `<img src>` works, and the browser's cache keeps the bytes.

**Cons**
- Anybody who learns an id reads the picture (driver 1). Item photos accept that because an item is instance-wide
  master data (FR-22.6); a trip's pictures are not.

---

## Decision Matrix

| Driver | Weight | A — upload creates, member reads | B — pushed row | C — A with a public GET |
|---|---|---|---|---|
| Trip-private | 4 | 3 — the trip's own gate | 3 — same gate possible | 0 — public by id |
| No row without bytes | 3 | 3 — one transaction | 0 — rows before bytes, maybe forever | 3 |
| Offline-first | 2 | 2 — moves and deletes queue; the upload does not | 3 — the row queues | 2 |
| One mechanism | 1 | 3 — ADR-002 as it stands | 1 — a second queue for bytes | 3 |
| **Total** | | **28** | **19** | **19** |

---

## Decision

The server writes an idea picture's row when its bytes arrive, under the client's id; a push may only move or delete
it. The bytes are read through the trip's membership with the member's own session. Local Mode writes both halves on
the device.

## Consequences

**Positive**
- A stranger to the trip can neither add nor read a picture (`TestIdeaImage_AStrangerNeitherUploadsNorReads_FR29_5`).
- A listed picture is always loadable, on every device.

**Negative / accepted costs**
- A picture cannot be added offline in Server Mode; the screen says so and keeps nothing.
- Each device downloads a picture once per session, not once per cache lifetime.

**Neutral**
- Deleting an idea takes its pictures (FK cascade, a tombstone per row); the bytes table is excused from tombstones,
  like `item_images`, since no device holds its rows.

## Revisit Trigger

Families report pictures taken without signal — on the trip itself — that they could not add. That is when a byte
queue beside the outbox (Option B's cost) is worth building.
