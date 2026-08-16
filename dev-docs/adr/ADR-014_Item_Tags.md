# ADR-014: Item Tags — Replace the Category, Add Beside It, or Store a JSON Set

**Status:** Accepted
**Related:** FR-24.1 (multi-tag categorisation), FR-24.2 (tag filtering & grouping), FR-16.3 (duplicate merge), FR-1.1 (central item database), NFR-4.2a / Sync-API Spec §6 (field-level merge), invariant 2 (migrations are never edited), invariant 4 (generation runs client-side), migration `022_item_tags.sql`, `dev-docs/UI_Spec_v1.10.md` M9/M10

**Decision Drivers (in priority order):**

1. **The grouped inventory must show each item exactly once (FR-24.2).** M9 groups the list under headings; an item on three axes must still occupy one row. Whatever shape tags take, "which single heading does this item live under" has to have an answer that is stored, not guessed — a guess reorders the user's inventory whenever the underlying set order changes.
2. **Concurrent tag edits must not overwrite each other (NFR-4.2a).** The merge algorithm is field-level last-write-wins. Two people tagging the same item from two devices, offline, is the ordinary case in a household app — not an edge case. Whether that loses work is decided entirely by how coarse a "field" is.
3. **One concept, one name.** FR-24.1's word is *supersedes*. A schema in which `categories` and `tags` both exist, one of them privileged, is a schema whose readers must learn which is which — and whose writers must decide, per feature, which one to consult.
4. **The trip side must not move.** `trip_items.category_name` is a denormalised snapshot consumed by M4's grouping, M12, analytics, export and the spreadsheet import. Any option that ripples into those pays for a rename with five screens' worth of regression risk and buys no behaviour.
5. **FR-16.3 needs a definition of "duplicate".** The merge-duplicates flow, and M10's "already exists" answer, both need the database to say when two items are the same item.
6. **Local Mode parity (invariant 4/5).** Tags are edited with no server present, so the shape has to work against IndexedDB and the client-side mutation log as readily as against SQLite.

---

## Considered Options

### Option A — `categories` is renamed to `tags`, assignments move to an `item_tags` join table *(recommended, accepted)*

`items.category_id` is dropped. A row in `item_tags (item_id, tag_id, position)` is one assignment; `position = 0` is the primary tag. The existing category rows survive the rename with their ids, names and `sort_order`, and each item's old category is backfilled as its primary tag.

**Pros**

- **Each assignment is its own row, so each is its own merge unit.** Andy adding `Sommer` and Sia adding `Strand` offline are two inserts that both survive — the case that decides driver 2.
- `position` answers driver 1 with stored data. It also answers "in what order do the rest read", which is the same question asked twice; a boolean `is_primary` flag would answer only the first half.
- The rename keeps one name for one concept (driver 3) and costs nothing at runtime: ids are stable, so nothing that referenced a category id needs rewriting.
- The trip side is untouched (driver 4). `category_name` keeps doing exactly what it did, now holding the primary tag at generation time.
- Mirrors `template_item_tasks` (migration 016), which reached the same conclusion for the same reason. One idiom for "a set of things hanging off a row", not two.

**Cons**

- **`items.UNIQUE(name, category_id)` has to become `UNIQUE(name)`.** With no category on the item there is no second column to be unique against. This is the real price: "Adapter" can no longer exist once under `Technik` and once under `Velo`. The model's answer is one Adapter carrying both tags — which is the point of the feature — but it is still a capability removed from anyone who was using the old constraint that way, and existing colliding rows must be renamed by the migration.
- Reading an item's tags is a join, and rendering M9 is a join per row unless the client indexes the assignments up front. On a household-sized inventory this is nothing; it is still more work than reading a column.
- Three tables to keep in the sync whitelist, the partition map, the visibility switch and the Local Mode object stores, where there were two.

### Option B — Keep `items.category_id`, add tags alongside it

The category stays as the privileged grouping key; `item_tags` carries the additional free-form labels.

**Pros**

- No `UNIQUE` change, no collision handling, no data rename. The migration is purely additive — the cheapest and safest one on offer.
- Driver 1 is answered trivially and permanently: the category *is* the grouping key, and no `position` bookkeeping exists to get wrong.
- Every existing read path keeps working untouched, including the spreadsheet import's category column.

**Cons**

- **It contradicts FR-24.1**, which says the tag set *supersedes* the category. Shipping both leaves the requirement half-implemented and the schema carrying the question the feature was meant to settle.
- **Two concepts wearing one hat** (driver 3). Every future feature has to decide whether it filters on the category, the tags, or both — and the answers will diverge. The M9 facet sheet, the M4 axis, analytics and the review assistant would each make that call separately.
- The user is still forced to nominate one category *as a distinct kind of thing* from the tags, which is exactly the choice FR-24.1 removes. "Kleidung" being a category while "Sommer" is a tag is a distinction the user has to maintain and nothing explains.
- The cheapness is borrowed, not saved: the collision problem is deferred to whenever the category is finally dropped, by which time there is more data to collide.

### Option C — A JSON array column on `items`

`items.tags TEXT` holding `["Kleidung","Sommer","Strand"]`, first element primary.

**Pros**

- No join table, no join, no third table in the whitelist. Reading an item's tags is reading a column.
- Order — and therefore the primary tag — is inherent in the array, so driver 1 needs no extra mechanism at all.
- Tags become free strings with no separate lifecycle: no orphan tags, no tag table to garbage-collect.

**Cons**

- **It loses concurrent edits, which is driver 2 and disqualifying.** Field-level LWW sees one field. Andy adds `Sommer` offline, Sia adds `Strand` offline; whichever syncs second wins and the other tag is gone, with no conflict recorded — the merge worked as designed, and the user simply finds their edit missing. Migration 016 rejected a JSON column on exactly this reasoning.
- Tags have no identity, so renaming one means rewriting every item that carries it — a multi-row write with no transaction boundary in the sync model, which can half-apply.
- "Which tags exist" becomes a scan-and-distinct over every item rather than a table, and `sort_order` — the axis order M9 renders — has nowhere to live.

---

## Decision Matrix

| Driver | Weight | A — join table | B — both | C — JSON column |
|---|---|---|---|---|
| One row per item in the grouped list (FR-24.2) | 5 | **5** — stored `position` | **5** — the category is the key | **5** — array order |
| Concurrent tag edits survive (NFR-4.2a) | 5 | **5** — a row per assignment | **5** — a row per assignment | 0 — one field, LWW eats one edit |
| One concept, one name | 4 | **4** — category renamed away | 0 — two axes, per-feature choice | **4** — only tags exist |
| Trip side unmoved | 4 | **4** — `category_name` untouched | **4** — untouched | **4** — untouched |
| FR-16.3 has a duplicate rule | 3 | 2 — `UNIQUE(name)`, at a cost | **3** — unchanged | 1 — name only, unenforced |
| Local Mode parity | 3 | **3** — an object store like any other | **3** — same | **3** — simplest of the three |
| **Total** | | **23** | 20 | 17 |

Option B is close on points and loses on driver 3 alone — which is the driver that does not show up as a defect until much later, and then shows up everywhere at once. It was rejected on that, not on the arithmetic. Option C's zero on driver 2 is the kind that no total should rescue: an option that silently discards user data is not a cheaper version of the others.

---

## Decision

**Option A.** `categories` is renamed to `tags`, keeping ids, names and `sort_order`. `item_tags (id, item_id, tag_id, position, updated_hlc)` carries the assignments, `UNIQUE (item_id, tag_id)`, cascading from both sides. `position = 0` is the primary tag (FR-24.2). `items.category_id` is dropped and `UNIQUE (name, category_id)` becomes `UNIQUE (name)`.

`trip_items.category_name` **stays exactly as it is** and is not renamed: it was always a snapshot of one grouping key taken at generation time, and from here that key is the primary tag.

Migration 022 backfills each item's old category as its primary tag, so an upgraded instance groups precisely as it did before. Items whose names collide under the new `UNIQUE (name)` are **renamed, never dropped** — first with their old category name as a suffix, then with their id where that is not enough (two uncategorised rows could share a name, because SQLite treats NULLs as distinct in a UNIQUE). Archived trips reach their master items through `trip_items.source_item_id`; deleting one to satisfy a constraint would cut a trip loose from its own history.

## Consequences

**Positive**

- An item sits on every axis it belongs to, which is what the inventory was for. `Wanderschuhe` is findable under `Schuhe`, `Kleidung` and `Wandern` without being filed three times.
- Tags are created by typing them (FR-24.1's filter-or-create in M10). There is no taxonomy to administer and no tag-management screen to build — governance proportionate to a home-lab instance.
- Concurrent tagging from two devices merges without loss, and does so through the existing algorithm rather than a special case in it.
- The FR-24.2 primary tag is stored, so the inventory's grouping is stable and the user can change it deliberately.

**Negative / accepted costs**

- **Item names are now globally unique.** This is the sharpest edge of the decision and it is a real capability removed. Anyone relying on `Adapter (Technik)` and `Adapter (Velo)` as separate items must now keep one item with two tags, or rename. The migration renames rather than merges, because merging two items is a judgement about the user's data that a migration has no standing to make — FR-16.3's merge flow exists for the user to make it deliberately.
- **A migration that renames the user's rows.** Renaming is the least-bad resolution, but the user will find item names they did not write, on an instance they did not touch. This is visible enough to belong in the release notes rather than only in this file.
- **Three tables where there were two**, each needing its entry in the sync whitelist, the partition map, `masterVisible`, the backup export and the Local Mode object stores. A fifth place to forget.
- **Orphan tags are possible.** Removing the last assignment leaves the tag row behind, and nothing collects it. Deliberate for now: a tag the user typed once and will type again is worth keeping, and a garbage collector that runs on sync would race with an offline device still holding an assignment to it. The cost is a filter axis that accumulates dead chips.
- **The rename spends the `categories` name permanently.** Per invariant 2 the migration cannot be edited afterwards; going back means a further migration, not a revert.

**Neutral**

- **FR-24.3 (lifecycle-aware deletion) is *not* part of this decision** and stays parked, though CLAUDE.md's parked list names it in the same breath as the tags. Deleting a master item behaves exactly as it did. That split is deliberate: the tag model is what M9/M10 need to be rebuilt against, while lifecycle deletion is an independent rule about history that can be decided on its own evidence.
- The spreadsheet import's category column keeps working — it now creates or matches a tag and assigns it as primary, which is the same user-visible behaviour reached through a different table.

## Revisit Trigger

**When a user hits the `UNIQUE (name)` constraint in normal use** — concretely, when M10's "already exists" answer is reported as wrong rather than helpful, because the two items genuinely are different things that share a name (two `Ladegerät`, for different devices). That is the signal that identity needs more than the name, and the answer is likely a nullable disambiguator on the item rather than a return to the category.

Independently: **if orphan tags reach the point where the M9 axis is unusable without pruning**, the deliberate no-garbage-collection stance above is what caused it, and it needs either a collector with a safe rule or a "hide unused tags" affordance in the filter sheet.
