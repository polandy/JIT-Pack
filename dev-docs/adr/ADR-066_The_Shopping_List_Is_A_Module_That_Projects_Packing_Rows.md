# ADR-066: The shopping list is a module with its own entries that projects the packing list's buy rows — vs. a flag on trip items, vs. copying buy rows into the list

**Status:** Accepted
**Related:** FR-30.1–30.3, FR-3.1–3.3, FR-25.6, FR-25.11j, FR-29.9 (the planner's module boundary, same rule),
ADR-033, `internal/store/schema.sql` (`shopping_entries`), `client/src/shopping/`, `client/src/lib/shoppingSources.ts`,
`client/src/sync/featureModule.ts`, `client/src/composables/packingShoppingSource.ts`,
`scripts/module-boundary-gate.mjs`

**Context.** The owner asked on 2026-09-19 for a trip's shopping list — groceries for a holiday flat above all — that
is kept **independently of the packing list**, while whatever the packing list marks *vor Ort kaufen* still lands on
it, and for the code to be separated cleanly. The owner added that the concept has to fit the modular layout drafted
for the Idea Board (FR-29.9, on its own branch), with the shopping list implemented first. Until then M6 was a filter
over `trip_items` by `mode`. Its free-text add wrote a packing row in a buy mode, so „Milch" counted in the packing
progress, the weight, the analytics, FR-9's feedback and M21's *Vorlage aus Reise*. Buying it at the destination set it
to *packed*, because *bought* existed only as a packing state. The owner settled two scope questions up front: **one
list per trip**, and **both tabs stay**.

**Decision Drivers (in priority order):**
1. Something typed onto the shopping list reaches no packing figure — not by an exclusion each figure has to remember,
   but because it is not a packing row.
2. A buy-mode packing row is on the shopping list exactly while its mode says so, on every device, offline included.
   Nothing may be bought twice or silently dropped because two copies disagreed.
3. The shopping code and the packing code do not import each other, and a gate says so (FR-29.9's rule), so the
   planner can follow the same shape.
4. The same behaviour in all three modes (invariant 5), and no change to the sync protocol's vocabulary.

---

## Considered Options

### Option A — Own entries table; packing rows projected through a kernel contract *(recommended, accepted)*

`shopping_entries` (trip partition: name, list, bought) holds only what nobody packs. The packing list's buy rows are
not stored a second time. The packing side turns them into `ShoppingLine`s — the contract in
`lib/shoppingSources.ts` — with FR-3.3/FR-25.11j's writes bound into each line's `buy`/`unbuy`. The shopping module
renders lines from its own entries and from every provided source without knowing whose they are. The orchestrator
reaches the module's store only as a `FeatureStore` (`sync/featureModule.ts`: pull routing, the trip cascade, the
`ModuleHost` write path). `App.vue` is the composition root that binds all of it through its config and
`provide`.

**Pros**
- Driver 1 holds by construction: an entry is a different table, so no packing query can count it.
- Driver 2 holds by construction: a line is recomputed from its packing row on every read, so there is nothing to
  reconcile when the quantity, the mode or the row changes.
- The contract is a type and three injection points. A spec mounts M6 with a fake source, and the packing side's half
  is tested on its own (`packingShoppingSource.spec.ts`).

**Cons**
- A new table: every development database is deleted and reseeded (invariant 2).
- M6 loses the shared composer. An inventory item to buy is now put on the packing list in M4 and given its mode there.
  That is one step further than typing it on M6, and it reverses the 2026-08-30 ruling that M6 keeps the shared
  composer and no field of its own (FR-25.13a).
- The kernel grows three seams (`featureModule.ts`, `shoppingSources.ts`, the count on `tripViews.ts`), and the
  orchestrator a `features` config field. They are small, but they are machinery a single screen did not need before.
- Entries are not in the portable backup (NFR-4.11), like FR-7.3/7.4's todos. The free-text rows they replace were.

### Option B — Keep one table; flag trip items that are shopping-only

A column such as `trip_items.shopping_only` marks the groceries; M6 stays a filter.

**Pros**
- No new table and no new sync seam; M6 keeps the composer.

**Cons**
- Driver 1 fails the way it always fails: every packing figure — progress, weight, value, analytics, feedback, review,
  M21, clone, the backup, the portable export — has to learn to skip the flag, and the next figure written will not.
  The FR-7.4 todos took a separate bucket for exactly this reason.
- *Bought* is still a packing state (`packed`). An item neither packed nor packable keeps a state machine it does not
  have.
- Nothing separates: the shopping screen keeps reading the packing store, so there is no boundary to gate.

### Option C — Own table; copy buy rows into it

Setting a packing row's mode to a buy mode writes a `shopping_entries` row that points back at it; buying the entry
writes FR-3.3 on the packing row.

**Pros**
- M6 reads one table, and every line has the same shape in storage.

**Cons**
- Driver 2 fails. The copy is a second truth, and every change to the original — quantity, name, mode back to *pack*,
  the row removed, a per-person fan-out (ADR-036) — has to reach it. That happens on several devices, offline, merged
  field by field (NFR-4.2a). The failure is a thing bought twice or never. Derived ids (ADR-036's trick) make
  convergence possible but not free, and the code that keeps the two in step is packing code writing module rows, the
  coupling this ADR exists to remove.
- A copy changes nothing the user can see compared with A. The projection already renders the same line.

---

## Decision Matrix

| Driver | Weight | A — entries + projection | B — flag on trip items | C — entries + copy |
|---|---|---|---|---|
| 1. Entries reach no packing figure | 4 | 5 — a different table | 1 — every figure must exclude | 5 — a different table |
| 2. One truth per buy row | 4 | 5 — recomputed on read | 5 — one row | 1 — two rows to reconcile offline |
| 3. No import across the boundary, gated | 3 | 5 — kernel contracts, one gate | 1 — M6 reads the packing store | 3 — the sync of copies is packing writing module rows |
| 4. Same in all modes, no new vocabulary | 2 | 5 | 5 | 4 — reconciliation differs with and without a server |
| **Total** | | **75** | **43** | **51** |

---

## Decision

A trip's shopping list is the module `client/src/shopping/` with its own table, `shopping_entries`. The packing
list's buy-mode rows reach it as projected `ShoppingLine`s through `lib/shoppingSources.ts`, bound in `App.vue`.
`scripts/module-boundary-gate.mjs` holds the boundary in both directions.

**How the wiring is done, and why not otherwise.** The module's store, the packing source and the switcher's count are
handed in: the orchestrator through its config (`features`), the screen and the switcher through `provide`/`inject`.
A module-level registry filled at start-up was rejected. It would work in the app and be empty in every spec that did
not remember to fill it, and its failure is a silently dropped row. The orchestrator importing the module was rejected
because that is the import the gate exists to refuse.

## Consequences

**Positive**
- Groceries leave every packing figure, and a *bought* entry is a bought entry rather than a packed one.
- The planner (§3.29) finds its seams already there. It adds a directory to `MODULES` in the gate, its store to
  `features`, and its lines or counts through the same kind of contract.
- The M6 screen no longer knows what a `TripItem` is.

**Negative / accepted costs**
- The M6 composer is gone. The inventory-backed add, its create sheet (FR-24.11) and its duplicate exclusion
  (FR-25.13d) are no longer on M6. E2E-M6-21 and E2E-M6-25 are retired with them.
- The frame composable `useTripScreen` still reads the trip store for the trip itself, so the module reaches the
  packing store transitively. The gate judges direct imports only, and says so. The clean end is a trip store split
  from the packing rows, which nothing needs yet.
- `useTripScreen`, `useHeaderTitle` and `useOrchestrator` are kernel by name in the gate while they live in
  `composables/` beside packing code. Moving them to a frame directory is a mechanical refactor for later.
- Entries are not in the portable backup and not cloned.

**Neutral**
- No sync-protocol change: `shopping_entries` is one more trip-partition table in `tables.go`. Its trip cascade is the
  same unannounced one every trip-partition table has, and the client mirrors it through `FeatureStore.tripChildRows`
  and `forgetTrip`.

## Revisit Trigger

- An entry needs a field a packing line has — an amount, a category or a buyer (FR-25.12's *Zugewiesen an* is the
  likely first). The contract's `ShoppingLine` already carries amount, recipients and section, so the question is
  then only the entry's schema, not the boundary.
- A second module arrives (the planner). Its first real need that the three seams do not cover is the moment to
  decide whether they become a single module registration shape.
