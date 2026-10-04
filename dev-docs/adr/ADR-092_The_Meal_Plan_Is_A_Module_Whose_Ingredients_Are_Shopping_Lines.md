# ADR-092: The meal plan — a feature module of its own, its ingredients shopping lines by projection

**Status:** Accepted
**Related:** ADR-066 (the shopping list as a module, `lib/shoppingSources.ts`), ADR-077 (excursions), ADR-078 (the
planner module), ADR-079 (module-only CI), ADR-083 (hand order), §3.33, FR-33.1–33.11, FR-30.2, FR-31.8, FR-29.15,
invariants 2–5, `client/src/meals/`, `client/src/lib/mealContext.ts`, `client/src/lib/excursionExtraLines.ts`

**Decision Drivers (in priority order):**
1. **One truth for a thing to buy.** An ingredient bought on the shopping list is bought in its meal, and a meal
   deleted or moved takes its lines with it — on every device, offline included (NFR-4.2a).
2. **The boundaries hold.** The packing side, the shopping list and the planner already meet only through kernel
   contracts (`scripts/module-boundary-gate.mjs`); the meal plan must not be the first to reach across.
3. **Local Mode keeps everything** (invariant 4): the suggestions from earlier trips and every rule run on the client.
4. **Little new machinery.** The family's instance runs in production; the change should be additive (ADR-067) and
   reuse the shapes the excursions and the day plan already have.

---

## Considered Options

### Option A — a module of its own, ingredients projected *(accepted)*

`client/src/meals/` holds two trip-partition tables, `meals` and `meal_ingredients`. The ingredients reach M6 through
`lib/shoppingSources.ts` under one heading (FR-33.3), the meals reach M29 through `lib/dayPlanSources.ts` (FR-33.5), a
picnic reaches an excursion's list through a new contract, `lib/excursionExtraLines.ts` (FR-33.6), and M1 through
`lib/tripCards.ts` (FR-33.7). What the module reads of the trip — the trips on the device, a trip's excursions, its
shortlisted ideas — comes in through `lib/mealContext.ts`, answered by `App.vue`. One meal sheet, mounted once by the
shell, opens over whichever screen asked. The ingredient carries `shopping_entries`' purchase record, stamped alike.

**Pros**
- Buying is one write wherever it is made; nothing can drift apart, nothing needs cleaning up after a delete.
- The pattern is the excursions' (FR-31.8): the shopping list already renders a source's own heading.
- The module is a module-only CI diff (ADR-079) for most later changes.

**Cons**
- Three kernel contracts grow: `ShoppingLine` gains `sectionRank`, `detail` and `pressingDays`, `DayPlanLine` a
  `meal` kind with `time`, `placeAt`, `timeWord`, `label` and `open`, and two contracts are new.
- An ingredient is not an entry: it cannot be tagged, handed to somebody or moved to another heading, and a bought one
  goes when its meal is deleted (FR-33.9).

### Option B — the meal plan inside the planner module

Meals as a third kind of planner row beside ideas and day entries, M31 a planner screen.

**Pros**
- No new module, no `mealContext`: the planner already knows the shortlist and the day plan.

**Cons**
- The planner would have to reach the shopping list and the excursions' lists anyway, through the same contracts.
- The planner is already the largest module; a meal change would run its whole e2e set.

### Option C — ingredients copied into `shopping_entries`

*Zutaten auf die Einkaufsliste* writes one entry per ingredient, tagged with the meal.

**Pros**
- No change to the shopping contract; an ingredient is a full entry (tag, assignee, due day, hand order).

**Cons**
- Two truths: the meal says *open*, the list says *bought*, or the meal moves and its entries stay on the old day.
  Undoing a deleted meal, or a meal edited on two devices, has no clean answer.

---

## Decision Matrix

| Driver | Weight | A — own module, projected | B — inside the planner | C — copied entries |
|---|---|---|---|---|
| One truth for a thing to buy | 4 | 3 — one row, one write | 3 — the same projection | 0 — two rows that drift |
| The boundaries hold | 3 | 3 — kernel contracts only | 2 — same contracts, a bigger module | 2 — writes into the shopping module's table |
| Local Mode keeps everything | 2 | 3 | 3 | 3 |
| Little new machinery | 1 | 1 — three contracts grow, two new | 2 — no `mealContext` | 3 — almost none |
| **Total** | | **28** | **25** | **13** |

---

## Consequences

- An ingredient is due on its meal's day and **presses on that day only** (`pressingDays: 0`): with FR-30.10's two days
  the *Fällig* block would hold the next three days' cooking. A past meal's open ingredients leave the open list.
- The *Essen* pill is the eighth of the switcher's row, which scrolls (G-9); it is drawn only with both dates.
- The dashboard's *Heute* card leaves meals to *Heute essen*, so a meal is said in one place.
- Deleting a meal deletes its bought ingredients too; the purchase record goes with the meal.
- The server's morning reminder does not read ingredients (FR-33.3).

## Revisit trigger

Reopen when the family asks for an ingredient to behave like an entry — tagged, handed to somebody, or kept after its
meal is gone — or when a second module wants to put lines on an excursion's list and `ExcursionExtraLine`'s one tick
and one tap no longer describe them.
