# ADR-077: An excursion is its own list that borrows from the trip — own lines vs. a view on the trip's list vs. a container

**Status:** Accepted
**Related:** PRD Addendum §3.31 (FR-31.1–FR-31.12), §3.10 containers (FR-10), §3.11 Repack (removed), §3.27 Gruppen
(FR-27.10, FR-27.13), ADR-073 (a row per person), ADR-066 (shopping sources), UI-Spec M27, schema `excursions`,
`excursion_travelers`, `excursion_items`; `dev-docs/excursions-concept.md`

**Decision Drivers (in priority order):**
1. **The daypack is packed on its own day.** Ticking the rucksack on the morning of a hike must work whatever the
   suitcase said weeks earlier — including after the suitcase is closed and on the road.
2. **Reusable across trips** — the owner's explicit ask — without a second template system beside §3.27's Gruppen.
3. **Nothing left at home.** What an outing needs from home has to reach the suitcase while it is still open.
4. **Small blast radius** in the one merge, the one partition and the screens that already exist (NFR-4.2a, ADR-022).

---

## Considered Options

### Option A — Own lines with their own tick, optionally linked to a trip row *(recommended, accepted)*

Three trip-partition tables: `excursions`, a row per participant in `excursion_travelers`, and `excursion_items` with
its own `packed_count`/`state` and a nullable `trip_item_id` (`ON DELETE SET NULL`) that says *this comes out of the
suitcase* and shares no tick. Adding a line to pack while the suitcase is open finds, raises (max, never sum) or
creates the trip row; after it is closed, nothing is written to the trip and the line is marked *not in the luggage*.
An excursion starts from a Gruppe and can be saved as one.

**Pros**
- Driver 1 fully: the tick belongs to the outing, so three hikes are three packings and the closed suitcase is no
  obstacle.
- Driver 3: the link is what lets the excursion put the headlamp into the suitcase in time.
- Reuse is §3.27's: one search, one editor, one peek; a Gruppe can seed a trip or an excursion.

**Cons**
- **A second packed state beside the trip's** — exactly what Repack (§3.11) was, and it was removed as *not wanted*
  on 2026-07-17. Accepted because the second packing here is of a **different, smaller set on a different day**,
  chosen per outing, not the same list run backwards on the way home.
- Three tables, a migration, a line codec, a cascade from `travelers` and `excursions`, and an unlinked line on a
  device that still holds a deleted row's id (the server clears the link in the engine and writes no change).
- The excursion writes into the trip's list, so one act has to carry one undo across both.

### Option B — A filtered view on the trip's list

Trip rows get an „also for the hut tour" marker; the excursion is a filter on M4.

**Pros**
- Almost no new data; no second packed state; reuse is whatever the trip's rows came from.

**Cons**
- **Fails driver 1**: there is one tick, so the daypack cannot be ticked once the suitcase is packed — which is always.
- Lunch bought at the trailhead is not a trip row and has nowhere to go.

### Option C — A container „Rucksack" (FR-10)

**Pros**
- Exists already, with weight maths.

**Cons**
- A row is in **exactly one** container — suitcase *or* rucksack, never the suitcase now and the rucksack on Tuesday.
- Containers are per trip and not reusable (driver 2); one tick again (driver 1).

---

## Decision Matrix

| Driver | Weight | A — own lines | B — filtered view | C — container |
|---|---|---|---|---|
| Packed on its own day | 4 | 3 — own tick, works after the close | 0 — one tick | 0 — one tick, one bag |
| Reusable across trips | 3 | 3 — from and to a Gruppe | 2 — via the trip's own groups | 0 — per trip |
| Nothing left at home | 2 | 3 — creates/raises the row while open | 2 — it is the row | 1 — only what is on the list |
| Small blast radius | 1 | 1 — three tables, one undo across two lists | 3 — a marker | 2 — existing tables |
| **Total** | | **28** | **14** | **4** |

---

## Decision

An excursion owns its lines and their tick (`excursion_items`), names its people in a row each
(`excursion_travelers`, none meaning everybody), borrows trip rows through a link that shares no tick, writes into the
trip's list only while *before* is not over, and is started from and saved as a Gruppe.

## Consequences

**Positive**
- A trip can hold three hikes and a hut night, each packed on its morning, each reusable next year as a Gruppe.
- M6 gained a source-owned heading (`ShoppingLine.section`), so a source's lines can be read under their own name.

**Negative / accepted costs**
- The second packed state Repack's removal ruled out, for a smaller set on a different day.
- A per-person set has to be remembered as *für alle* (`for_all_participants`) so it can follow a change of people.
- Not in the portable backup, like the tasks and the notes; the Gruppe is.

**Neutral**
- The fifth pill of the trip switcher (ADR-051); the fifth trip view is worked in, not read.

## Revisit Trigger

A request for a **return tick** — *is everything back from the hut?* That is Repack's second half coming back, and a
third packed state on the same line would reopen whether an excursion's line should instead be a trip row's move
between bags.
