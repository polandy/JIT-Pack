# ADR-086: A shared connection — read from its link vs. from its picture vs. searched for vs. typed

**Status:** Accepted
**Related:** ADR-082 (the server reads a link's page), FR-29.15, FR-29.16, FR-29.18, invariant 4, invariant 5,
`dev-docs/planner-concept.md` §3

**Decision Drivers (in priority order):**
1. **A connection should cost a paste.** The family plans its journeys in the SBB app; typing five legs off its screen
   into another app is what keeps a day plan empty.
2. **It must work where the trip is.** Most trips are abroad. Whatever is built has to leave a connection possible in
   Sardinia, with or without a reader for the local operator.
3. **No dependency on a service or a format JIT-Pack does not control** beyond what fails softly.
4. **Local Mode keeps working**, if with less.

---

## Considered Options

### Option A — read the link the SBB app shares *(accepted)*

The SBB app shares a connection as a picture with a short link (`a.sbbmobile.ch/s/…`). That link's page carries an
ordinary `<a href>` to `www.sbb.ch/…/trip?tripId=3HA.<a>.<b>`, where `<a>` and `<b>` are zlib-compressed, base64url
text: `<a>` is the timetable system's reconstruction context, listing every leg as `T$A=1@O=<from>@…$A=1@O=<to>@…$<
departure YYYYMMDDHHMM>$<arrival>$<line> <number>$…` (a walk is `W`, without a line), `<b>` the search that found it.
The client decodes this in a pure rule of the planner's domain; the server's part is FR-29.16's page read, which now
also returns the page's links, so it learns nothing about the SBB.

**Pros**
- One paste brings every leg, exactly as planned, and the date (driver 1).
- A connection stays an ordinary record of legs; anything without a reader is entered by hand (driver 2).
- The server stays provider-agnostic, and a full `sbb.ch` link decodes without it (driver 4).

**Cons**
- **The format is not published.** The SBB can change it any day. Accepted: the reader then finds no legs, the sheet
  says it cannot read the link, and the hand fields take over; the legs are stored, so nothing written before breaks.
- Only the SBB at first. Another provider is a reader of its own, written when somebody brings a link that carries
  its data.
- A short link needs the server's read: in Local Mode, or with previews off, it is kept as a link only.

### Option B — read the shared picture (OCR in the browser)

**Pros**
- Works on the thing the SBB app actually shares.

**Cons**
- Several megabytes of recogniser and language data for one field set (NFR-4.3), and it reads a layout the SBB
  redesigns more often than an id. The link beside the picture carries the same data exactly.

### Option C — search the connection inside the app (transport.opendata.ch)

**Pros**
- Exact data without any sharing; no unpublished format.

**Cons**
- Swiss public transport only — useless on the trip itself (driver 2).
- An outbound service on every search, and a second planner beside the one the family already uses.

### Option D — hand fields only

**Pros**
- Nothing to break, every mode alike.

**Cons**
- Five legs typed off another app's screen; driver 1 fails.

---

## Decision Matrix

| Driver | Weight | A — link | B — picture | C — search | D — by hand |
|---|---|---|---|---|---|
| A connection costs a paste | 4 | 3 | 2 — recogniser errors to check | 2 — searched again | 0 |
| Works where the trip is | 4 | 2 — hand fields abroad | 2 — the same | 0 — Switzerland only | 2 |
| No service or format outside our control | 2 | 1 — unpublished, fails softly | 1 — a layout, fails softly | 1 — a service | 3 |
| Local Mode | 1 | 2 — full links only | 3 | 0 | 3 |
| **Total** | | **24** | **21** | **10** | **17** |

---

## Decision

A connection is a day-plan entry of its own kind whose legs are stored. A pasted link is read at once by the reader
that knows it — the SBB's first, in `client/src/planner/domain/` — and a link nobody knows, or a format that changed,
leaves the hand fields with the link kept. The server only returns a page's links beside its preview.

## Consequences

**Positive**
- The family's own way of planning a journey becomes one paste.
- A connection abroad is no worse off than any other entry.

**Negative / accepted costs**
- The SBB reader follows a format the SBB does not promise; a fixture of a real link pins it in a unit test, and the
  day it breaks is a red test only against a new fixture — in the field it is a polite fallback.

**Neutral**
- The day the reader stops finding legs costs nothing stored; only new pastes fall back.

## Revisit Trigger

A real SBB link that no longer reads — then the reader is fixed against it, or retired if the id stops carrying the
legs. Or a second provider's shared link carries its legs — then it gets its reader beside the SBB's.
