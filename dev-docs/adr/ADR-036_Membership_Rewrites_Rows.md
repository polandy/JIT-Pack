# ADR-036: Editing membership rewrites rows — keep-and-repoint vs. delete-and-recreate vs. a membership table

**Status:** Accepted
**Related:** FR-25.21, FR-25.1, FR-25.8, FR-25.10, FR-27.4, ADR-016, NFR-4.2a, invariants 2 and 4,
`trip_items`, `client/src/domain/refresh.ts`

**Decision Drivers (in priority order):**
1. **Nothing a person typed or packed is lost by a structural edit.** Comments (FR-7.1), preparation
   todos (FR-7.3) and `packed_count` are the expensive content on a row; membership is cheap
   metadata. A conversion must not trade the first for the second.
2. **Two offline devices converting the same item converge** (NFR-4.2a). Field-level LWW merges
   fields, not intent: two independent inserts for the same traveler are two rows forever.
3. **No new structure where rows already carry it** (invariant 4, FR-25.1). Local Mode must keep the
   feature, and a schema change costs every development database (invariant 2, ADR-018).
4. Footprint (NFR-4.3): the smallest write path that satisfies 1–3.

---

## Considered Options

### Option A — keep-and-repoint *(recommended, accepted)*

Converting *gemeinsam → pro Person* **keeps the existing row** and points it at the first selected
traveler in trip order; every further traveler is a fresh insert whose id is derived with the
existing ADR-016 helper `propagatedItemId(tripId, sourceItemId, travelerId)` — folded name where
there is no source item, matching `perPersonKey`'s own fallback (named `clusterKeyOf` when this ADR was written) so the
rows land in one cluster.
Converting back collapses onto **one** surviving row chosen by a deterministic ladder — the row
carrying content (comments or todos), then the row with the most packed units, then trip order —
summing the quantities and capping the packed count; the rest are deleted.

**Pros**
- The item's thread, todos, container, mode and progress survive both conversions untouched.
- Derived ids make the fan-out idempotent: two devices doing it offline produce one row per
  traveler, not two.
- The derivation is the *same* one FR-27.4 uses, so a later template refresh **adopts** the
  hand-made row instead of adding a duplicate beside it — the ledger-less path in `refresh.ts` that
  already exists for hand-added rows. The reuse was not designed for this and pays anyway.
- No schema change, no server change, no sync-contract change.

**Cons**
- The surviving row is older than its siblings: its change-log history and its comment thread belong
  to the item's whole past, not to that one traveler. If that traveler is later removed, the ladder
  moves the thread again. **This is the accepted cost** — a thread that survives on a slightly wrong
  row beats a thread deleted, and no shape short of Option C avoids it.
- The ladder is invisible from the screen, so the confirm has to name the surviving row for the
  outcome to be readable at all.

### Option B — delete-and-recreate

Every conversion deletes all instances and inserts the target set fresh.

**Pros**
- One code path, trivially correct as a set operation; no ladder, no tie-break.

**Cons**
- Loses comments, todos and packing progress on **every** membership edit, including adding one
  traveler to an item three people have already packed. Fails driver 1 outright.
- The cascading delete takes the FR-7.1/7.3 children with it, which is unrecoverable rather than
  merely annoying.

### Option C — a `trip_item_members` table

Membership becomes its own table: one item row, N member rows carrying traveler and quantity.

**Pros**
- Membership edits never touch the item row, so nothing on it can be lost. Driver 1 is satisfied
  structurally rather than by rule.
- The natural home for per-traveler data beyond a quantity.

**Cons**
- Contradicts FR-25.1's decision and its stated reason, and would make a per-person instance stop
  being an independently packable row — which is what M4's cluster, the claim (FR-5.7), the packer
  stamp (FR-25.3), the container assignment and the analytics all key off. The change is not the
  table; it is every reader of a row.
- A schema change under invariant 2 means deleting every development database, and a data
  transformation has nowhere to live, so the existing per-person trips become a reseed.
- New sync-partition surface and new merge rules for a table that a row already expresses.

---

## Decision Matrix

| Driver | Weight | A — keep-and-repoint | B — delete-and-recreate | C — membership table |
|---|---|---|---|---|
| Nothing typed or packed is lost | 5 | 4 — survives on one row; the row may be the wrong one | 0 — loses it on every edit | 5 — structurally safe |
| Offline convergence | 4 | 5 — derived ids, reuses ADR-016 | 3 — converges, having destroyed both sides | 4 — needs its own merge rules |
| No new structure | 4 | 5 — no schema, server or contract change | 5 — same | 0 — schema change, reseed, every row reader |
| Footprint | 2 | 4 — one pure module and one sheet | 5 — smaller | 1 — table, sync, merge, reseed |
| **Total** | | **68** | 48 | 43 |

---

## Decision

Editing membership rewrites `trip_items` rows in place: the existing row is kept and re-pointed at
the first selected traveler, further travelers are inserted under ids derived from
`(trip, source item, traveler)`, and collapsing back keeps the one row that carries content and sums
the quantities onto it. The conversion is a pure function in `client/src/domain/membership.ts` —
current membership plus target membership in, a list of mutations out — so it is table-driven
testable and runs identically in all three modes.

## Consequences

**Positive**
- Per-traveler amounts arrive with no schema, server or sync-contract change.
- The derived-id reuse makes the hand-made row and the FR-27.4 generated row the *same* row, so the
  refresh adopts it silently rather than duplicating it.
- One editor component serves M5 and M4's quick-add, which closes FR-25.8 in the same work.

**Negative / accepted costs**
- The surviving row's history is the item's, not the traveler's; the ladder can move a comment
  thread from one person's row to another's on a later edit.
- Two conversions are destructive and need confirms that state the outcome first — machinery that
  Option C would not need.

**Neutral**
- Templates keep a single per-head quantity; per-traveler amounts are trip-level only.

## Revisit Trigger

An item needs **per-traveler data that is not a `trip_items` column** — a note, a container or a
mark belonging to one person's instance and not to the others. At that point the row stops being
able to express membership on its own and Option C returns with a real reason.
