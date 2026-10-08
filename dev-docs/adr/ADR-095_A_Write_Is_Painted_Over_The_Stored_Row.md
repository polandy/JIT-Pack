# ADR-095: A write is painted over the row the store holds — one funnel vs. a paint at every call site

**Status:** Accepted
**Related:** ARCH-12, ARCH-10 (`TableSpec`), Sync-API P-3, ADR-016, FR-25.2, FR-5.5, FR-30.3,
`client/src/sync/writeFunnel.ts`

**Decision Drivers (in priority order):**
1. Correctness that does not depend on each call site: an optimistic update must not revert what landed between the
   caller's read and the write (a pull, another device's change, a packer avatar).
2. A row somebody deleted stays deleted — an undo or a late tap must not resurrect it.
3. The partition a write travels is the table's fact (Sync-API P-3), not something a caller restates.
4. Readability of the action groups, where the write was a three-part triple repeated ~180 times.

---

## Considered Options

### Option A — One funnel: the caller hands over the mutation *(recommended, accepted)*

`ctx.write(...mutations)` (and `queue` for a cascade that drains once) picks the feed from the table and the trip
from the row — `trip_id` in an insert's fields, else in the row the store holds — and the paint from the op: an
insert shows its fields, a delete its tombstone, an upsert is laid over the store's **current** row, read when the
write is made. An upsert or delete of a row the device does not hold is dropped: no paint, no queue. A caller that
paints more than its own row (a cascade's tombstones, a generated position upserted whole) passes
`{ mutation, optimistic }` and the funnel takes that paint as given.

**Pros**
- The stale-snapshot hazard `restorePack` guarded by hand is the funnel's rule for every write.
- The 156 hand-named partitions and ~87 `optimisticUpdate(mut, xRow(item))` pairs disappear.
- The seam specs run the production funnel, so the partition and paint they assert are a device's.

**Cons**
- Every store answers `currentRow(table, id)`, encoding its domain row back through the registry — `comments` by
  whichever of its three readings holds it.
- A write to a row the device does not hold is lost silently. In Server Mode a partition that was never pulled has
  no rows to write to, so a screen showing such a row would be the defect, not the drop.

### Option B — Keep the paint at the call site, add a lint rule

Leave `enqueueAndDrain(type, id, { mutation, optimistic })` and forbid building the paint from anything but a fresh
store read.

**Pros**
- No change to the stores; a caller can still write to a row it alone knows about.

**Cons**
- The rule is not expressible as a lint check: "fresh" is a data-flow property of each site.
- The partition stays restated by hand at every site.

### Option C — One funnel, but a write to an absent row is queued anyway

As A, but an upsert with no stored row is pushed unpainted, under a trip id the caller names.

**Pros**
- Nothing a caller writes is ever dropped.

**Cons**
- Resurrects a row deleted elsewhere as soon as the push lands (the server upserts it), the failure `restorePack`
  documented.
- Brings the caller-named trip id back, for the one case where it is most likely wrong.

---

## Decision Matrix

| Driver | Weight | A — funnel, drop | B — call site + lint | C — funnel, queue |
|---|---|---|---|---|
| Correctness per write | 4 | 5 — one rule, read at write time | 2 — per site, unenforceable | 5 — same paint as A |
| Deleted stays deleted | 3 | 5 — dropped | 3 — guarded where remembered | 1 — resurrected |
| Partition from the table | 2 | 5 — derived | 1 — restated | 3 — trip named again |
| Readability | 1 | 5 — `write(mut)` | 2 — the triple stays | 4 — a trip id beside it |
| **Total** | | **50** | **21** | **34** |

---

## Decision

Option A. Every client write goes through `createWriteFunnel` (`client/src/sync/writeFunnel.ts`); the orchestrator,
a feature module (`ModuleHost.write`) and the seam double bind it to their stores.

## Consequences

**Positive**
- A new action writes `write(mutations.x(...))` and cannot pick the wrong feed or paint from a stale row.
- A new table is routed and painted by its `TABLE_SPECS` entry and its store's sink, with nothing at the call site.

**Negative / accepted costs**
- `RowSink` grew a `get`, every store a `currentRow`, and a bucketed lookup by id scans the buckets.
- A fixture row a spec passes to an action has to be in the store, or the write is dropped.

**Neutral**
- The action groups keep their `tripId` parameters; the facade's signatures did not change.
  Amendment (ARCH-12b): the parameters that only forwarded `tripId` without using it were dropped; a parameter
  the body still reads — a store lookup, a row's `trip_id` on insert — stayed.

## Revisit Trigger

A write that must reach the server for a row the device does not hold — e.g. a bulk action over trips whose
partitions are not pulled — or a bucketed table where the scan in `currentRow` shows in a profile.
