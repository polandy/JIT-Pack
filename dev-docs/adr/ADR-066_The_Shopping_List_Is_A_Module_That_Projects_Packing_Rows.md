# ADR-066: The shopping list is a module with its own entries that projects the packing list's buy rows — vs. a flag on trip items, vs. copying buy rows into the list

**Status:** Accepted
**Related:** FR-30.1–30.3, FR-3.1–3.3, FR-25.6, FR-25.11j, FR-29.9 (the planner's module boundary, same rule),
ADR-033, `internal/store/schema.sql` (`shopping_entries`), `client/src/shopping/`,
`client/src/kernel/shoppingSources.ts`, `client/src/sync/featureModule.ts`, `client/src/sync/sinks.ts`,
`client/src/sync/cascade.ts`, `client/src/kernel/moduleContribution.ts`, `client/src/featureModules.ts`,
`client/src/kernel/packingShoppingSource.ts`, `scripts/module-boundary-gate.mjs`

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
`kernel/shoppingSources.ts` — with FR-3.3/FR-25.11j's writes bound into each line's `buy`/`unbuy`. The shopping module
renders lines from its own entries and from every provided source without knowing whose they are. The orchestrator
reaches the module's store only as a `FeatureStore` (`sync/featureModule.ts`: the sinks its pulls, cascades and
painted writes go through, and the `ModuleHost` write path). `App.vue` is the composition root that binds all of it.

**Pros**
- Driver 1 holds by construction: an entry is a different table, so no packing query can count it.
- Driver 2 holds by construction: a line is recomputed from its packing row on every read, so there is nothing to
  reconcile when the quantity, the mode or the row changes.
- The contract is a type and three injection points. A spec mounts M6 with a fake source, and the packing side's half
  is tested on its own (`packingShoppingSource.spec.ts`).

**Cons**
- A new table, with what invariant 2 charges for one.
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
list's buy-mode rows reach it as projected `ShoppingLine`s through `kernel/shoppingSources.ts`.
`scripts/module-boundary-gate.mjs` holds the boundary in both directions. The planner and the meal plan are modules of
the same shape, and what follows is the shape all three share.

### One registration shape per module

Each `<m>/index.ts` exports a `FeatureModule` (`kernel/moduleContribution.ts`) of two members, in the order the app
is built: `featureStore()`, handed to the orchestrator as one of its `features`, and `contribute(host)`, which returns
the module's `ModuleContribution` — activity readers, trip cards, shell components, shopping, day-plan and excursion
sources, idea results, a shortlist, view counts, close crossings, and the single answers (`ideaLookup`,
`dayPlanEmpty`, `duePurchases`, the excursion connections and journey line). The kernel's own adapters are a
contribution like any other (`kernel/kernelPorts.ts`), folded first. `composeModules` folds them all: lists append in
order, and a record key or a single answer given twice throws. `provideComposition` provides the result to the
screens. `featureModules.ts` is the constant list, and with the router, the catalogue and the dev seed it is the only
file that names a module's face; `App.vue` names none and holds no logic of its own.

Aggregates that cross modules are handed back **lazily**. The shopping count and `duePurchases` read every shopping
source, meals' included; `dayPlanEmpty` reads every day-plan source; the kernel's day plan reads every excursion's
extra lines. They read the folded lists through the host when called, and a read during `contribute` throws. So a
module reads the folded list and never another module: M31's shortlist is the planner's `shortlist` contribution,
which the kernel's `mealContext` reads through the host.

Rejected: a module-level registry filled at start-up — it would work in the app and be empty in every spec that did
not remember to fill it, and its failure is a silently dropped row; the orchestrator importing the module — the import
the gate exists to refuse; `featureStore` inside the contribution — the host is built from the orchestrator and the
orchestrator from the stores, so the store would have to exist before its own contribution; and eager aggregates, with
`App.vue` passing each module the others' lists — explicit, but the root would again know which module needs whose
list.

### What crosses the boundary is a sink per table

A `FeatureStore` is one member, `sinks`: a `RowSink` per table the module holds (`sync/sinks.ts`), built with
`specifiedSinks(specs, …)` so **each sink carries its table's spec**. The kernel derives the rest. Which tables a
module holds is which sinks it offers; a pulled change is parsed by its sink's codec and lands through
`applyChangesToSinks`; the row a write is painted over comes from `currentRowIn` and is encoded by the same codec; and
what a delete takes along is `cascadeOf` (`sync/cascade.ts`), walked over the `cascadeParents` each spec declares — the
`ON DELETE CASCADE` references `schema.sql` holds, which `cascade.spec.ts` compares them with. The trip and master
stores go through the same functions, so there is one cascade on the client, not one per store, and a module keeps its
rows in the kernel's `bucketedRows` by trip, as the packing rows are kept.

Rejected: a hand-written child-row function per parent and per store, as Go keeps a query per parent — fast lookups
through each store's own indexes, but eight functions and module-side copies nothing compared with the schema, which
had already drifted (a trip item's cascade named its notes and not their replies' ticks); and generating the edges
from Go's `tableSpecs`, a generator for one field.

### A module's rows and types are its own

A module's entity types live in `<m>/types.ts`, and its parsers, encoders and `RowSpec`s in `<m>/rows.ts`
(`SHOPPING_ROWS`, `PLANNER_ROWS`, `MEAL_ROWS`). The kernel's registry is `KERNEL_TABLE_SPECS` and names none of a
module's tables; routing calls every table the kernel does not specify a feature table. A module's `types.ts` is
vocabulary in the layer order (ADR-096), so its rules read it (`layer-gate.mjs`, `domain-purity-gate.mjs`). The picture
and track rows of the planner (`IdeaImage`, `IdeaTrack`) and their codecs stay in the kernel, because the kernel serves
their files (ADR-002, ADR-085; `ModuleHost.pictures`/`tracks`); the planner's spec names them. A new module's rows are
a diff inside its own directory.

Rejected: a full spec map composed in `App.vue` and handed to the orchestrator beside `features` — explicit, but a
second list kept in step with the stores, threaded into `cascade.ts`, `sinks.ts` and the trip store. A store that holds
a table necessarily knows how to read it, and the cascade can only find rows in the sinks it walks anyway, so the spec
rides the sink.

## Consequences

**Positive**
- Groceries leave every packing figure, and a *bought* entry is a bought entry rather than a packed one.
- A new module — the planner (§3.29) and the meal plan (§3.33) followed the shopping list — is a directory in
  `MODULES`, a store in `features` and a contribution in `featureModules.ts`, with no edit to `App.vue`.
- The M6 screen no longer knows what a `TripItem` is.

**Negative / accepted costs**
- The M6 composer is gone. The inventory-backed add, its create sheet (FR-24.11) and its duplicate exclusion
  (FR-25.13d) are no longer on M6. E2E-M6-21 and E2E-M6-25 are retired with them.
- The frame composable `useTripScreen` still reads the trip store for the trip itself, so the module reaches the
  packing store transitively. The gate judges direct imports only, and says so. The clean end is a trip store split
  from the packing rows, which nothing needs yet.
- A contract a module adds is three edits in the kernel: a field on `ModuleContribution`, its fold in
  `foldContributions` and its `provide` in `provideComposition`.
- The order of `FEATURE_MODULES` is M1's card order and the order of module lines after the kernel's. `features`
  follows it too, which nothing reads by order.
- The fold throws at start-up on a doubled answer instead of refusing it at build time.
  `src/__tests__/activityReadersWiring.spec.ts` folds the real list, so CI meets the throw first.
- The build no longer refuses a `TABLE.*` without a spec: `satisfies Record<SyncTable, TableSpec>` can hold only one
  map. `src/__tests__/moduleRows.spec.ts` holds it instead, composing the kernel's specs and each module's against
  `TABLE`, and holds each module store's sinks to its module's specs; the specs that read the codecs against each other
  and against the schema compose the same way (`src/__tests__/rowSpecs.ts`).
- The cascade finds children a level at a time by scanning each child table once per level, not through an index —
  on a family's data, a few passes over a few thousand rows per delete — and rebuilds its edges per cascade from a few
  dozen sinks rather than once at load. Siblings come out in spec order; only leaf-first is a contract, and the specs
  hold that alone.
- Entries are not in the portable backup and not cloned.

**Neutral**
- No sync-protocol change: `shopping_entries` is one more trip-partition table in `tables.go`. Its trip cascade is the
  same unannounced one every trip-partition table has, mirrored on the client by `cascadeOf`.
- The fields an entry needed that a packing line has — a tag (FR-30.9), a due date (FR-30.10), a buyer (FR-30.12) —
  were answered in the entry's own schema, as this decision foresaw; the boundary did not move.

## Revisit Trigger

- The first screen that needs the trip and must not load the packing rows with it. That is the point at which the trip
  store splits from the packing rows, the clean end the transitive reach through `useTripScreen` waits for.
