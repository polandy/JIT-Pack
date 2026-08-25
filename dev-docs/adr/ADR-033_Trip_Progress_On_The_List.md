# ADR-033: How M2 knows a trip's progress — load what is on screen vs. load everything vs. count on the trip row

**Status:** Accepted
**Related:** FR-2.3 (the trip list), FR-3.14 (historical quantities), NFR-4.2a (field-level LWW), Sync-API §4 (partitions and paging), ADR-018 (no migrations in the development phase), invariant 5 (three modes, one artifact), E2E-M2-10

**Decision Drivers (in priority order):**
1. **The number on the list has to be true.** A fully packed trip that reads `0/0 gepackt` is not a cosmetic problem: it is the app telling the user their decade of history is empty.
2. **"Not pulled yet" must never be rendered as "nothing there."** The orchestrator already guards this in four places (`tripDataLoaded`); M2 was the screen that did not ask.
3. **The cost must not grow with the archive.** A device holds every trip it has ever taken; a rule that pays for all of them on every visit gets slower every year, for a list.
4. **No new correctness hazard.** Whatever carries the number has to survive two devices packing offline and merging later.
5. **No schema change while ADR-018 stands**, unless the value is worth deleting every development database for.

---

## Considered Options

### Option A — say *unknown* instead of zero *(accepted, and the floor under everything else)*

While a trip's own partition is not on the device, the row reports that: the summary line says the items are still coming and the ring is unfilled and unlabelled, rather than summing nothing and printing `0/0` at 0 %.

**Pros**

- Driver 2, exactly. It is the rule the codebase already applies everywhere else, applied to the one screen that had not.
- Three lines, no request, no schema.
- It is honest in every mode, including a Local Mode device still hydrating from IndexedDB.

**Cons**

- On its own it does not show the number the user wanted — it only stops lying about it.

### Option B — load every trip's partition when M2 opens

**Pros**

- Simplest correct thing: every number on the list is right, immediately.
- The machinery exists — M2's pull-to-refresh already calls `drainAll` over every trip.

**Cons**

- **Measured on the family instance: 33 partitions, 357 ms and 1.1 MB over the wire** (localhost; applying the rows is on top). That is the whole archive, on every visit to a list, to render eight rows.
- Driver 3 directly: 60 trips in five years is ~2 MB per session, and it never stops growing.

### Option C — load the partitions of the rows that are on screen *(accepted, with A)*

An `IntersectionObserver` per row; a row that becomes visible asks for its trip's data once, and the orchestrator deduplicates concurrent askers.

**Pros**

- **Measured on the same instance: 8 partitions on opening the list, 18 after scrolling to the end of 33.** The cost is bounded by the viewport and grows with scrolling rather than with the archive (driver 3).
- No schema change, no protocol change, and it composes with A — a row that has not been reached yet says so instead of lying.
- Degrades honestly where the browser has no observer: every observed row is treated as visible, which costs option B and keeps the screen right.

**Cons**

- A screen now triggers network, which was previously the orchestrator's business alone. The dedup lives in `ensureTripData` precisely because the caller is a list and eight rows arriving together must not be eight requests.
- Scrolling fast past rows leaves them unfetched until they are on screen again — correct, but it means the list fills in as you move rather than all at once.

### Option D — carry `packed`/`total` on the trip row itself

`trips` is in the master partition, which M2 already pulls. Put the counts there and the list is right with no extra request, for ever.

**Pros**

- Zero additional requests at any archive size — the only option that is free at 500 trips.
- Simplest possible read path.

**Cons**

- **It is a derived aggregate under field-level LWW** (driver 4). Two devices packing the same trip offline both compute a total, and the merge rule has to let one win — a count that is simply wrong rather than merely stale, and wrong in a way no user can explain. Every other field the protocol carries is a value somebody typed.
- Recomputation would have to happen on the server *and* on every client, because Local Mode has no server (invariant 5).
- A schema change, which under ADR-018 deletes every development database.

---

## Decision Matrix

| Driver | Weight | A (say unknown) | B (load all) | C (load what is shown) | D (count on the row) |
|---|---|---|---|---|---|
| The number is true | 5 | 2 — honest, but absent | 5 | 5 | 5 |
| "Not pulled" never reads as "empty" | 5 | 5 | 3 — briefly, while loading | 5 (with A) | 4 |
| Cost does not grow with the archive | 4 | 5 | 1 | 4 | 5 |
| No new correctness hazard | 5 | 5 | 5 | 5 | 1 |
| No schema change | 3 | 5 | 5 | 5 | 0 |
| **Total** | | **86** | **74** | **106** | **72** |

---

## Decision

**A and C together.** The row reports *unknown* until the trip's own rows are on the device, and M2 asks for a row's data when that row is on screen (`useOnFirstVisible` → `ensureTripData`, deduplicated per trip). Neither half is useful alone: A without C never shows the number, and C without A means a row lies for the moment before its request lands.

`tripDataLoaded` and the loaded-partition set became **reactive** with this, which is not a detail: a screen now reads them, and a plain `Set` is a value Vue cannot see change. The first implementation loaded correctly and rendered "still loading" for ever.

## Consequences

**Positive**

- A device that has never opened a trip shows its real progress on the list — the family's imported archive reads `100 % · 170/170` instead of `0 %  · 0/0`.
- The cost is the viewport, not the archive: 8 requests instead of 33 today, and the same 8 when there are 300 trips.
- `ensureTripData` gives any future screen the same "I need this trip's rows" without opening the trip.

**Negative / accepted costs**

- **The list fills in.** Rows that were never on screen have no numbers, and a fast scroll leaves a trail of them behind. This is visible behaviour, not a bug, and it is the price of driver 3.
- **A screen triggers network.** The dedup that makes that safe is one map in the orchestrator; a second caller that forgets to go through `ensureTripData` would reintroduce the stampede.
- **A drain nobody asked for must not answer for the app.** `drainTrip` gained a `background` mode with this: it does the data work and leaves the G-2 glyph alone. Without it a row that fails — a trip the user was removed from answers 403 while the network is fine — would announce an outage nobody caused, and eight rows appearing at once would flicker the glyph through *syncing* on every visit to the list.
- Option D's freeness is genuinely attractive and is being turned down on a correctness argument, not a cost one.

**Neutral**

- Local Mode is unaffected in behaviour: everything is on the device, so `tripDataLoaded` follows hydration and no request is ever made.

## Revisit Trigger

**A list where the fill-in is felt** — a very long archive on a slow link, where scrolling outruns the requests badly enough that the numbers lag behind the eye. The answer then is not option B but a small read-ahead (observe with a root margin, so a row is fetched shortly *before* it is on screen), which is one parameter in `useOnFirstVisible`.

**Or:** the protocol grows a way to carry a server-computed aggregate that is not a mergeable field — a read-only projection rather than a synced column. That removes option D's only real objection, and the matrix should be read again.
