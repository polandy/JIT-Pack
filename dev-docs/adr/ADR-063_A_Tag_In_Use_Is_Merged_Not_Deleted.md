# ADR-063: Deleting a tag that items still carry — refuse and offer the merge vs. cascade vs. retire

**Status:** Accepted
**Related:** FR-24.10, FR-24.1, FR-24.2, FR-24.3, ADR-032 (retire over refuse, for master items), ADR-038
(`DELETE /api/v1/master/tags/{tagID}`), `internal/store/schema.sql` (`tags`, `item_tags`)

**Decision Drivers (in priority order):**

1. **A delete must not silently change where items are filed.** FR-24.2 groups the inventory by an item's *primary*
   tag, so removing a tag moves every item that carried it first into the leftover bucket — a data change nobody
   asked for, on rows the user was not looking at.
2. **The act the user actually wants must exist.** The measured shape of this instance is 23 tags with **49 of 184
   items under „Diverses"**; the reason to reach for a tag's delete is almost always that it is a duplicate or a
   mistake, and both of those want the items to end up *somewhere*, not nowhere.
3. **No schema change** (invariant 2, ADR-018): a DDL change means deleting every development database and reseeding
   the `:3000` instance, which a decision this small must not cost.
4. **One rule, client and server.** The delete endpoint already exists (ADR-038) and the device holds the whole
   master partition, so whatever is decided has to be answerable in both places from the same rows.

---

## Considered Options

### Option A — Refuse while in use, and hand back the merge *(recommended, accepted)*

`tagDeletion` counts the assignments naming the tag. Above zero the delete does not happen: the screen says how many
items carry it and offers **„Zusammenführen …"**, which runs `planTagMerge` — re-pointing the source's assignments at
a target the user picks, dropping the ones that would collide with `UNIQUE (item_id, tag_id)`, promoting the survivor
into the source's position where the source was the item's primary tag — and then deletes the now-empty source.

**Pros**

- An item never loses its filing. It ends up under the target, including when the source was its primary tag.
- The refusal is the entrance to the feature the data actually needs. „49 items under Diverses" is a merge, and this
  is the only place in the product that reaches it in one act.
- Nothing in the schema moves, and the count is exact in **both** modes — unlike FR-24.3's outlook, which is short in
  Server Mode until a trip partition is opened, `tags` and `item_tags` are both master-partition tables that every
  device holds in full. There is no `certain` flag to carry and no server correction to wait for.
- The same count is what the manager renders beside each tag, so the screen cannot promise a delete it then refuses.

**Cons**

- A tag genuinely wanted gone, whose items should simply become untagged, takes two acts: remove the tag from those
  items (FR-24.9's „Tag wegnehmen", already built) and then delete it. That is a real cost and it is paid knowingly —
  the two-act path is the one that says out loud what happens to the items.
- „Löschen" is a control that sometimes does not delete. Mitigated by never letting it dead-end: the refusal carries
  both the number and the next act.

### Option B — Delete, and let the FK cascade

`item_tags.tag_id` is already `ON DELETE CASCADE`, so this is what the database does if nothing stops it. The confirm
would state the consequence: *N Artikel verlieren den Tag, M davon fallen unter „Ohne Tag"*.

**Pros**

- One act, no second concept to learn, and no new rule in the domain.
- Honest if the sentence is written well.

**Cons**

- It is the only act in the inventory with no undo and a silent effect on rows the user is not looking at. A merge is
  reversible by merging back; a cascade has nothing left to reverse — the assignments are gone, and which items had
  the tag is no longer recorded anywhere.
- It answers the wrong question. Nobody reaching for a duplicate tag's delete wants 49 items to become untagged.
- It makes the grouping move under a user who was editing a *label*.

### Option C — Retire the tag, as FR-24.3 retires an item

Add `retired_at` to `tags`, hide retired tags from every picker, keep the assignments alive, and restore through M23.

**Pros**

- One consistent lifecycle across master data — the same column, the same restore surface.
- Nothing is ever lost.

**Cons**

- It is a schema change, so every development database is deleted and `:3000` reseeded (invariant 2). Large price for
  a small act.
- **The premise FR-24.3 rests on is absent here.** An item is retired because archived trips, analytics and
  attributions still resolve against it. Nothing resolves against a tag row: FR-24.2 snapshots the primary tag's
  *name* onto the trip row at generation, so no trip item, no template position and no analytic reads `tags` at all.
  A tombstone breaks nothing, which removes the whole reason retire exists.
- A retired tag whose assignments live on is a third state to render — the inventory would have to decide whether an
  item filed under a hidden tag shows that heading. That question has no good answer, and Option A never asks it.

---

## Decision Matrix

Scores 1–5, higher is better.

| Driver | Weight | A — refuse + merge | B — cascade | C — retire |
|---|---|---|---|---|
| A delete must not silently refile items | 5 | 5 — the items keep their filing, by construction | 1 — that is exactly what it does | 4 — nothing moves, but a hidden heading is undefined |
| The act the user wants must exist | 4 | 5 — the merge *is* the act, reached in one tap | 2 — leaves 49 items to retag by hand | 2 — hides the name, fixes nothing |
| No schema change | 4 | 5 — none | 5 — none | 1 — a column, so every dev DB is reseeded |
| One rule, client and server | 3 | 5 — exact count in both modes, same rows | 4 — trivially the same, being the FK | 3 — needs the marker honoured in both |
| **Total** | | **80** | 45 | 41 |

---

## Decision

A tag delete is **refused while any item carries it**, and the refusal offers the merge that makes it deletable.
`tagDeletion` is the rule, `planTagMerge` the way out, and the source tag is removed by the merge itself once nothing
carries it. `tags` gains no lifecycle column, and FR-24.3's retire/remove pair deliberately does not extend here.

## Consequences

**Positive**

- Every item that carried a merged tag is filed under the target afterwards, primary position included — the case
  the grouping rule makes invisible until it is wrong.
- The count the manager shows, the count the refusal names and the count that decides the refusal are one number,
  read through `tagDeletion` in all three places.
- The server needs no change: ADR-038's endpoint stays what it is, and the client never asks it to delete a tag that
  is still carried.

**Negative / accepted costs**

- Emptying a tag on purpose is two acts, and the product does not offer „delete it and untag everything" at all.
- The merge writes one mutation per assignment. Against 49 items that is 49 rows in the outbox — deliberate, and the
  same shape FR-24.9's bulk grant already has (ADR-061): one row per assignment is what lets two offline devices
  merge overlapping sets without either losing an edit.

**Neutral**

- The source is deleted **after** the writes that empty it. Interrupted between the two, a device is left with a tag
  whose assignments are gone — a tag to delete again — rather than assignments whose tag is gone, which every reader
  (`tagsOfItem`, `tagNamesByItem`, `primaryTagNames`) would have to skip.

## Revisit Trigger

A second writer of `item_tags` that can create an assignment without going through the inventory — a shared or
published tag vocabulary (FR-1.6's ownership model), or an import that invents tags on a device that is not the one
importing. At that point „nothing carries it" stops being a question one device can answer from rows it already
holds, and the refusal has to move to the server, where ADR-038's endpoint would enforce it instead.
