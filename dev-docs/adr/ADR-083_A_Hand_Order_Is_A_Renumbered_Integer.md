# ADR-083: A hand order — a renumbered integer on the row vs. a fractional key vs. an order table of the module's own

**Status:** Accepted
**Related:** FR-30.13, FR-7.17, FR-24.10 (the tag axis, the precedent), FR-30.2/ADR-066 (the shopping module and its
sources), NFR-4.2a (field-level LWW), `client/src/domain/handOrder.ts`, `shopping_entries.position`,
`comments.position`, `trip_items.shopping_position`, `excursion_items.shopping_position`

**Decision Drivers (in priority order):**
1. **A move must never lose a line or a task**, whatever two devices did offline at once. An odd order after a clash is
   acceptable; a row that vanishes, or two that overwrite each other's other fields, is not (NFR-4.2a).
2. **A list nobody has arranged reads as it always did.** The family's instance is in production: its lists must not
   reshuffle on the update that brings the grip.
3. **One way of ordering by hand in the app.** The inventory's tag axis already has one (FR-24.10); a second scheme is
   a second thing to understand and to get wrong.
4. **The module boundary holds** (ADR-066): the shopping list may not reach into the packing side's tables, nor it
   into the module's.

---

## Considered Options

### Option A — a nullable integer on each row, renumbered `0…n-1` by a move *(accepted)*

Each row that can stand in a list carries its place: `shopping_entries.position`, `comments.position`, and
`shopping_position` on `trip_items` and `excursion_items` (a place on M6, apart from anything the row means on its own
list). NULL is „never placed" and reads **before** every placed row, in the order the group already had. A move takes
the group as the screen shows it, puts the row at the gap, numbers the whole group `0…n-1` and writes only the rows
whose number changed — `planTagReorder`'s rule, now one kernel function (`domain/handOrder.ts`) for both lists. A line
typed by hand takes one past the highest place of its trip, so it lands at the end of whatever group it is filed in.
The shopping module writes a sourced line's place through the line (`ShoppingLine.place`), which the source binds, as
it already binds the purchase.

**Pros**
- One field per row, merged like any other: a move and a retag on two devices both stand, and a clash between two
  moves leaves every row in the group — in an order the next move settles.
- Untouched lists keep their order exactly: the first move is what places a group.
- The same rule as the tag axis, and the renumbering diff keeps a move near the end at a write or two.

**Cons**
- **The first move in a group writes every row of it**, and a move to the top of a placed group rewrites all of it —
  on a family's list, tens of rows, one mutation each.
- A line that arrives from the packing list or an excursion has no place and reads at the **top** of its heading, not
  at the end; placing it on arrival would make the packing side write the shopping list's order.
- Four columns on four tables for one concept.

### Option B — a fractional (lexicographic) key between the neighbours

One write per move: the moved row takes a key between the rows above and below it, which always exists for strings.

**Pros**
- A move costs exactly one write, however long the list.

**Cons**
- A group of never-placed rows has no neighbours' keys to fit between, so the first move has to key them all anyway —
  the cost Option A pays, on the same occasion.
- Two devices that put rows into the same gap offline can produce the same key; the tie is broken by id, which is
  Option A's clash behaviour with more code.
- A second ordering scheme beside the tag axis's integers (driver 3), and keys that grow with every insertion into
  the same gap.

### Option C — an order table owned by the shopping module (`shopping_order(trip_id, line_key, position)`)

The module keeps the place of every line by its key, sourced lines included, and no packing-side table changes.

**Pros**
- The packing side's tables stay untouched; the module owns the whole concept.

**Cons**
- A new synced table — store repository, trip-partition rules, codec, cascade on the trip's delete — for what is a
  column's worth of data.
- A line's key is a projection's (`packing:` plus the aggregated row's key); when the packing row is renamed or its
  aggregation changes, the place is orphaned silently. A column on the row cannot be.
- Tasks would still need a column of their own, so the app would end up with two schemes after all.

---

## Decision Matrix

| Driver | Weight | A: integer, renumbered | B: fractional key | C: module's order table |
|---|---|---|---|---|
| Never lose a row | 4 | 3 — one field per row, clashes reorder only | 3 — same | 2 — an orphaned key loses the place silently |
| Untouched lists unchanged | 3 | 3 — NULL reads as before | 3 — same | 3 — same |
| One scheme in the app | 2 | 3 — the tag axis's | 1 — a second scheme | 1 — a table and a column |
| Module boundary | 1 | 2 — written through the source's binding | 2 — same | 3 — nothing crosses |
| **Total** | | **26** | **22** | **20** |

---

## Decision

A hand order is a nullable integer on the row itself, compared only inside one group, renumbered `0…n-1` by a move
that writes what changed (`domain/handOrder.ts`). Never-placed rows read first, in the group's old order.

## Consequences

**Positive**
- Both lists and the tag axis order by hand the same way, and a production list reads unchanged until moved.
- Sourced lines move on M6 without the shopping module learning where they come from.

**Negative / accepted costs**
- The first move in a group, and a move to its top, write every row of the group.
- A sourced line with no place reads at the top of its heading until somebody moves it.
- Positions are not in the portable backup, like everything else of the two lists (item 25).

**Neutral**
- The *Fällig* blocks keep their date order and are never a drop target; a row in one keeps its place in its group.

## Revisit Trigger

A group long enough that renumbering it shows up in the outbox — a single move queuing more than 100 mutations — or
a sync conflict report of two devices reordering one group that the next move did not settle.
