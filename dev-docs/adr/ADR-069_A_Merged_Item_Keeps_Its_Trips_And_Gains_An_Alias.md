# ADR-069: Merging two master items — what happens to the trips they were packed on

**Status:** Accepted
**Related:** FR-24.15, FR-24.3 (retire over remove), FR-24.14 (the tag merge this is modelled on), FR-27.9
(comments from trips), ADR-032 (retire), ADR-034 (restore), ADR-036 (keep-and-repoint), ADR-063 (a tag in use is
merged, not deleted), `internal/store/schema.sql` (`items.merged_into_id`), `client/src/domain/itemMerge.ts`

**Decision Drivers (in priority order):**

1. **A finished trip is history, not a view.** `trip_items` carries a *snapshot* — `name`, `weight_grams`,
   `category_name` are copies taken at generation — and nothing else in the product lets a master edit rewrite a
   trip that already happened. A rename does not; a merge asking to would be the first.
2. **The rule has to run client-side, in every mode** (invariant 4). Whatever a merge writes, a *client* writes:
   Local Mode has no server, and a server-side merge would remove the feature from the mode it matters most in.
3. **The merge has to be true afterwards.** If M10 still reports the two rows' pasts separately, the user merges
   them again next year and the feature has bought a shorter list and nothing else.
4. **Nothing the user cannot see may refuse the act.** A merge blocked by an edge, a position or a pointer that is
   invisible from the inventory is a dead end (ADR-063's lesson, one table over).
5. **Schema cost.** Under ADR-018 a column meant deleting every development database; since ADR-067 it is an
   additive migration inside `0.x`. Cheaper than it was, not free.

---

## Considered Options

### Option A — Master data moves, history stays, and an alias joins the two *(recommended, accepted)*

`planItemMerge` re-points `item_tags`, `item_dependencies`, `template_items` and the survivor's empty fields, copies
the photo where the survivor has none, and then writes `items.merged_into_id` on each losing row before FR-24.3's
ordinary delete disposes of it. `trip_items.source_item_id` and `trip_generated_positions.source_item_id` are left
exactly as they are. The rear view reads *through* the alias: `mergedIdsOf(itemId, items)` gives M10's FR-27.9
section the survivor's id plus everything aliased at it, and `resolveMergedItem` answers the other direction for a
reader that starts from a trip row.

**Pros**

- Every trip keeps saying what it said. The row that was packed still names the item it was generated from, which is
  the only statement about the past that was ever true.
- The whole act is one plan over rows the device already holds, so it works identically in all three modes.
- The alias is one nullable column and one hop. `planItemMerge` **flattens** it — merging B into C re-points
  everything already aliased at B — so a reader never walks a chain, whatever the instance's merge history is.
- It degrades safely. Two devices that merge the same pair in opposite directions converge, under field-level LWW,
  on a pair of rows naming each other; a reader that follows at most one hop and treats an aliased target as no
  alias then reports the two pasts separately — exactly the state the product was in before this existed.
- `ON DELETE SET NULL` keeps the alias from ever refusing a delete: deleting the survivor (which FR-24.3 allows only
  when nothing else resolves against it) simply gives the merged-away rows their own past back.

**Cons**

- A schema change, with the migration ADR-067 owes and a reseed of every development database until that chain is
  built. Paid knowingly: the column *is* the half of the feature that makes the merge true.
- Two ways to read one relationship — forwards for the rear view, backwards for a trip row — and both are in one
  module with the property that keeps them consistent (one hop) written into their docs.
- A merged-away row is usually *retired* rather than removed, so it stays visible in M23. Mitigated by M23 naming
  the survivor on that row, because a bare restore would otherwise offer to re-create the duplicate.

### Option B — Re-point the history too

The merge rewrites `source_item_id` on every trip row and generated position that names a loser.

**Pros**

- One notion of identity afterwards: no alias, no second read path, nothing to explain in M10's section.
- The analytics and the rear view need no change at all.

**Cons**

- **A client cannot do it.** Those rows are the trip partition: in Server Mode a device holds only the trips it has
  opened, so the merge would be partial on every device and complete on none — and moving it to the server takes the
  rule out of Local Mode (driver 2, invariant 4).
- `UNIQUE (trip_id, source_item_id, traveler_id)` refuses the re-point on exactly the trips that carried **both**
  duplicates, which is the interesting case. Answering that needs a rule for merging two packing rows — two packed
  states, two quantities, two sets of comments — inside a trip nobody is looking at.
- It rewrites finished trips (driver 1). "We packed the Petzl in 2024" becomes false in the one place the product
  stores what actually happened.

### Option C — Master data only, no alias

The merge moves the master rows and stops. The losing row is retired or removed; nothing records where it went.

**Pros**

- No schema change, no second read path, and the smallest possible diff.
- Honest in the narrow sense: each row's history stays its own.

**Cons**

- The merge is a claim the product then contradicts. M10 shows the survivor with none of the duplicate's remarks,
  and FR-27.9's section — the reason the rear view exists — stays split (driver 3).
- FR-27.5's rejection of fuzzy matching in M21 rests on duplicates being *mergeable*; without the alias the merge
  only shortens a list, and the premise does not come back.
- M23 cannot say where a retired row went, so its restore silently re-creates the duplicate.

---

## Decision Matrix

Scores 1–5, higher is better.

| Driver | Weight | A — alias | B — re-point history | C — no alias |
|---|---|---|---|---|
| A finished trip is history | 5 | 5 — untouched | 1 — rewritten | 5 — untouched |
| Runs client-side in every mode | 5 | 5 — master rows only | 1 — partial per device, or server-only | 5 — master rows only |
| True afterwards | 4 | 5 — one past, read through the hop | 5 — one past, by construction | 1 — two pasts, forever |
| Nothing invisible may refuse it | 3 | 5 — `SET NULL`, and edges are dropped and named | 2 — the `UNIQUE` refusal is invisible | 5 — nothing to refuse |
| Schema cost | 2 | 3 — one nullable column + a migration | 3 — none, but a rewrite instead | 5 — none |
| **Total** | | **86** | 44 | 72 |

---

## Decision

A merge moves **master data** and leaves the **trip partition** alone. The losing row carries
`items.merged_into_id` pointing at the survivor, flattened to one hop at merge time, and is then disposed of by
FR-24.3's ordinary delete — retired while anything still resolves against it, removed when nothing does. Readers
follow the alias exactly one hop: `mergedIdsOf` for a rear view that starts at the item, `resolveMergedItem` for one
that starts at a trip row.

## Consequences

**Positive**

- M10's FR-27.9 section reads a merged item's remarks as the survivor's, which is what the act claimed.
- The merge is one plan over four tables, so every collision — `UNIQUE (item_id, tag_id)`,
  `UNIQUE (template_id, item_id)`, `UNIQUE (item_id, depends_on_item_id)`, the self-edge `CHECK` and a cycle the two
  rows kept open apart — is decided before anything is written, and the act never half-applies.
- FR-24.12's rejected fourth rule (*similar names*) becomes buildable: a finding can now hand over a repair.

**Negative / accepted costs**

- One more column on `items`, and the ADR-067 migration that goes with it. Every development database has to be
  deleted and reseeded until that chain exists.
- FR-27.8's „Enthalten in" and FR-8/FR-14's analytics deliberately do **not** read the alias: the first reads
  template positions, which the merge itself re-points, and the second aggregates trip rows by name and category.
  Neither is wrong today — but a future analytic that keys on `source_item_id` has to decide this question again,
  and the two helpers are where it should be answered.
- The rear view of a *merged-away* row, opened from M23, still shows only its own past. Deliberate: it is the row
  the user chose to leave behind, and making it read the survivor's history would invert the hop for no reader.

**Neutral**

- The photo is the only part of a merge that moves bytes (ADR-002), so it is copied — not moved — after the
  mutations and only where the survivor has none. The losing row keeps its own image, which is what makes its
  retired state a complete record rather than a stripped one.

## Revisit Trigger

An analytic or a screen that aggregates by `source_item_id` across trips — FR-27.8's parked per-trip usage history
is the likely first. At that point the one-hop rule has to be honoured in a third place, and the choice is between
teaching that reader the hop and doing what Option B would have done once, in a migration, where the whole database
is in hand and the `UNIQUE` collisions can be resolved deliberately rather than per device.
