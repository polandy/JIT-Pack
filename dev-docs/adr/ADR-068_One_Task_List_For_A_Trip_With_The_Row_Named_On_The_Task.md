# ADR-068: One task list for a trip, with the row named on the task — vs. two lists side by side, vs. one list grouped by row

**Status:** Accepted
**Related:** FR-7.6, FR-7.3, FR-7.4, FR-7.5, FR-27.7, FR-25.31, FR-5.8, UI-Spec M1/M4,
`client/src/domain/tripTodos.ts` (`tripTasks`), `client/src/composables/useTripTasks.ts`,
`client/src/components/trips/TaskItemChip.vue`, E2E-M4-136, E2E-M4-137, E2E-M1-02, E2E-M1-07

**Context.** The owner asked on 2026-09-20 for tasks that are declared *on a packing item* and have to be done before
travelling to be **reflected as tasks**: listed where the tasks are, shown on the dashboard, visibly belonging to a
packing element, and removed with it. Almost all of it already existed — FR-7.3's preparation todos are rows of
`comments` hanging off `trip_items`, and the delete already cascades — but they were surfaced as a world of their own:
a collapsed *Vorbereitung* section at the foot of M4, a *Vorzubereiten* card on M1, and a count in M4's header detail
line, while *Aufgaben für die Reise* (FR-7.4) and its figure counted only the trip's own chores. So the question this
ADR answers is not how to store anything; it is **where the two kinds of task are read, and what keeps them apart on
the screen**. The options were mocked interactively and the owner decided from the mockup: one card, packing figures
untouched, the header's detail line freed, templates unchanged.

**Decision Drivers (in priority order):**
1. One place to look for "what still has to happen before we leave". A person who has to remember which of two lists
   a task went into has been given a filing problem, not a task list.
2. A task that belongs to a packing row must **say so** and lead back to it, or the joined list loses what the
   separate one had — the row was the heading there.
3. **No packing figure changes meaning** (FR-7.4's founding rule): the share, the ring and a row's doneness count
   rows. A task of either kind moving them is the false signal FR-7.3 was written against.
4. Nothing new in the data model or the sync protocol — both kinds are already the same table, told apart by one
   column.
5. The removal promise holds on every device: the row goes, its tasks go, including on a device that has not yet
   pulled the delete.

---

## Considered Options

### Option A — One list, the row named on the task by a chip *(recommended, accepted)*

`tripTasks` in `client/src/domain/tripTodos.ts` projects the trip's own todos and its rows' preparations into one
ordered list of `TripTask`; `useTripTasks` is the only place the two stores are joined, and M4's section, M4's figure,
M1's card and M1's trip-card line all read it. A task that prepares a row ends in `TaskItemChip` — the row's mark and
name, linking to the row's sheet; a task of the trip carries the FR-7.5 seat and the ✕ instead. M4's prep section and
M1's *Vorzubereiten* card are deleted.

**Pros**
- One list, one count, one card; the dashboard says the same thing the trip does.
- The chip is a smaller thing to learn than a second section, and it is also the way into the row — the jump the prep
  card's item name used to carry survives the merge.
- The rule is pure and unit-tested without a store or a component (invariant 4), and the three surfaces cannot drift
  because they read one function.
- Nothing about storage, sync or templates changes.

**Cons**
- Two kinds of row in one list means two write paths behind one checkbox, and the screen — not the list component —
  has to own both (it already owns the FR-25.31 undo, so this concentrates rather than spreads the complexity).
- A preparation has no ✕ in the list, because deleting it is M5's; the list is therefore not uniform in what it
  offers, and a reader can only find that out by looking.
- Four e2e cases had to be re-pointed at the joined list, and two of them (E2E-M1-02, E2E-M1-07) changed what they
  promise — their id keeps meaning what the suite implements.

### Option B — Two lists side by side, the preparation card keeping its own head

Keep both sections and both cards, and only add the chip and a shared count.

**Pros**
- No e2e case changes meaning; the smallest diff of the three.
- The two kinds stay visibly different without anyone having to read a chip.

**Cons**
- Leaves the actual complaint unanswered: the task the owner declared on an item is still not *where the tasks are*.
- Two heads, two counts and — on M1 — two cards that answer the same question, which is what the screen already had.
- The M4 prep section sat at the foot of the list under every reveal bar, which is where FR-7.4's own section was
  moved away from in 2026-09-18 for going unseen.

### Option C — One list, grouped by row with the row as a heading

Join the two, but render a row's preparations under a heading naming the row, the way the *Vorzubereiten* card did.

**Pros**
- The strongest possible statement of belonging; no new vocabulary at all.
- Reuses a layout that already existed.

**Cons**
- The trip's own chores need a group too, and naming it („Die Reise", „Sonstiges") invents a category the app has
  never had.
- Headings turn a list of six tasks into a list of ten lines; on a phone the section becomes taller than the packing
  rows it sits above.
- The heading cannot carry the seat or the ✕, so the two kinds end up with different line shapes anyway — Option A's
  cost, paid without Option A's compactness.

---

## Decision Matrix

| Driver | Weight | A — one list, chip | B — two lists | C — one list, grouped |
|---|---|---|---|---|
| One place to look | 5 | 5 — one card, one count | 1 — the split is the complaint | 5 — one card |
| The task names its row | 4 | 4 — chip, and it links | 4 — chip added there too | 5 — the heading names it |
| No packing figure changes | 5 | 5 — untouched, asserted | 5 — untouched | 5 — untouched |
| No model or protocol change | 4 | 5 — a projection only | 5 — nothing | 5 — a projection only |
| Removal holds everywhere | 3 | 5 — unknown row ⇒ not listed | 4 — same rule, twice | 5 — same rule |
| Fits a phone | 3 | 4 — one line per task | 3 — two sections | 2 — heading per row |
| **Total** | | **113** | 84 | 105 |

---

## Decision

A trip has **one** task list. `tripTasks` projects FR-7.4's trip todos and FR-7.3's preparations into it, open before
resolved, the trip's own before a row's, a row's grouped by the row; every count that says *Aufgaben* counts both.
A preparation carries the chip of its row and leads to it; the trip's own carries the assignment seat and the ✕.
M4's *Vorbereitung* section, M1's *Vorzubereiten* card and the header line's open-prep count are gone. No packing
figure changed, and nothing was stored, migrated or synced differently.

## Consequences

**Positive**
- The dashboard and the trip agree, and both agree with the figure above them.
- A preparation is now reachable in two taps from the screen the app opens on, and the chip says which row owes it.
- Three surfaces share one rule; a fourth (M2's trip cards) would get it for free.

**Negative / accepted costs**
- The checkbox in the list writes through two different actions, decided by `task.item`. A third kind of task would
  need a third branch, and this is where it would go.
- A preparation cannot be deleted from the list, only from its row. FR-7.6 records the revisit trigger.
- M4 has to hide the tasks of a row whose removal is still inside the undo window — the row leaves the screen before
  its delete is written, and a chip into an invisible row is worse than no chip. That is a rule the screen carries,
  not the domain.
- Two e2e cases now promise something different under the same id, and one helper (`openTripTodos`) is now on the
  path of four specs that used to open a section of their own.

**Neutral**
- `packing.prepSection` and `packing.openPrep` stay in the catalogue: M5's own section still states both.

## Revisit Trigger

A third kind of task on a trip (a container's, a traveler's, the planner's), or a trip whose task list is long enough
that the chips stop being scannable — measured at the point where a task's row is looked up by reading rather than by
tapping the chip. Either turns Option C's grouping from a cost into an answer.
