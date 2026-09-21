# ADR-072: Tasks get their own tags, and the untagged group is named by origin — vs. sharing the inventory's tag axis, vs. a real „from the packing list" tag

**Status:** Accepted
**Related:** FR-7.8, FR-7.7, FR-24.1, FR-24.2, FR-24.13, FR-25.31, ADR-060, ADR-063, ADR-067, ADR-071, UI-Spec M25,
`internal/store/schema.sql` (`task_tags`, `comments.task_tag_id`),
`internal/store/migrations/002_task_tags.sql`, `client/src/domain/tripTodos.ts` (`taskGroups`),
`client/src/composables/useDragToGroup.ts`, E2E-M25-07/08/09

**Context.** M25 lists a trip's tasks. Past a handful, listing is not ordering, and the owner asked on 2026-09-21 for
*„einem task soll man genau ein Tag vergeben können. damit werden sie dann standardmässig in der task ansicht
gruppiert. man kann tasks auch zwischen den Tags einfach schieben können."*

The request names one thing and decides three. **Which tags** is the one that decides the rest: whether a task's tag
is the inventory's `tags` axis — which already carries an order, a mark and a manager — or a vocabulary of its own.
The options were drawn as an interactive prototype (the owner could tag, regroup and drag) and he chose from it.

**Decision Drivers (in priority order):**
1. **The headings have to be the words a reader is looking for.** A grouping whose headings do not fit is a second
   filing problem, not a solution to the first.
2. **One vocabulary per picker.** Whatever is decided, a person choosing a tag must not be choosing between two
   meanings of the same word in the same list.
3. **A heading must be true of everything under it.** This is what makes a group safe to drop onto.
4. **Nothing that has to be kept in step.** A row the app must create, protect from renaming and re-create when
   deleted is a mechanism with no owner.
5. **Three modes, and an existing database.** The chain is on main (ADR-067): a schema change is two edits and no
   reseed, and Local Mode must not need a migration of its own.

---

## Considered Options — which tags

### Option A — the inventory's `tags` axis, used as it is

* **Pro:** nothing new. Order (`sort_order`), mark (FR-24.13) and the tag manager already exist, and an item's
  preparation would inherit a sensible group from its item.
* **Con, decisive:** the trip's own chores have nowhere to go. *„Pflanzen giessen"* is not *Technik* or *Kleidung*,
  so it lands in the leftover bucket — which on the measured instance already holds **49 of 184 items** (ADR-063).
  The group that would grow fastest is the one that says nothing.

### Option B — their own `task_tags` *(chosen by the owner)*

* **Pro:** the headings are the words a reader searches by — *Apotheke*, *Haus*, *Bahn* — because the list is free
  to grow from the side that needs it. Driver 1 outright.
* **Pro:** the inventory is untouched. No tag appears there that no item uses.
* **Pro:** it makes the delete rule simple, which the shared axis could not (see below).
* **Con, accepted:** the same word may exist twice, once as an item tag and once as a task tag. They never appear in
  one picker, so neither means the other — driver 2 is satisfied by *separation* rather than by unification.
* **Con:** a second small table to carry through the wire, the stores and Local Mode.

### Option C — one axis both sides may add to

* **Pro:** one vocabulary, one order, one manager, and the words still fit because either side may create them.
* **Con:** the inventory's tag list fills with words no item uses, and the tag manager would have to say *where* a
  tag is used or *Bahn* reads there as a mistake. The owner weighed this and chose B.

---

## Considered Options — what „from the packing list" is

The owner asked that what comes from the packing list read under **„Aus Packliste"**. That is one sentence with two
possible meanings, and they differ in the data.

### Option A — a real tag row, seeded per instance *(rejected)*

* **Pro:** one mechanism. Every task has a tag; the group is a group like any other.
* **Con, decisive:** it can be renamed, deleted, and given to a task that never came from a packing row — and then
  the heading is false, which driver 3 forbids. Keeping it true would mean protecting the row from renaming, from
  deletion, and from being chosen for the wrong task: three rules with no owner, against driver 4.
* **Con:** it needs seeding, and a per-instance well-known id or a name lookup to find again.

### Option B — the name the *untagged* group wears, by origin *(accepted)*

Both untagged groups are `task_tag_id IS NULL`. Which heading they read under is `trip_item_id`, which the task
already carries: a preparation reads *Aus Packliste*, a chore of the trip *Ohne Tag*.

* **Pro:** nothing to create, nothing to protect, nothing to keep in step — driver 4.
* **Pro:** the heading is true by construction, and a group refuses what it could not head (driver 3).
* **Con, accepted:** two tasks in the same state read under two headings. That is information rather than an
  inconsistency — *where did this come from* is the one thing the untagged group can say.

---

## Decision Matrix

| Driver (weight) | A: shared axis | **B: own tags** | C: one axis, both add | „Aus Packliste" as a row |
|---|---|---|---|---|
| 1. The headings fit (5) | 1 | 5 | 4 | — |
| 2. One vocabulary per picker (4) | 4 | 4 | 4 | — |
| 3. A heading is true of its contents (5) | 5 | 5 | 5 | 1 |
| 4. Nothing to keep in step (4) | 4 | 3 | 2 | 1 |
| 5. Three modes, existing database (3) | 3 | 2 | 2 | 2 |
| **Total** | **17** | **19** | **17** | — |

---

## Consequences

* **Two schema edits, no reseed.** `task_tags` and `comments.task_tag_id` are in `schema.sql` and in
  `migrations/002_task_tags.sql`; `TestSchemaChain_EndsWhereSchemaSQLDoes` holds the two together. Both are
  expressible against an existing database because the column is nullable with no default — the same rule 001 rests
  on, which is what lets SQLite accept a `REFERENCES` clause on an `ALTER TABLE ADD COLUMN` at all.
* **A trip row points at a master row**, as `trip_items.source_item_id` already does. The partition boundary is not
  new and needed no new mechanism.
* **`ON DELETE SET NULL`, where `item_tags` cascades.** There the row *is* the assignment and deleting it unassigns;
  here the row is the task, and the same cascade would throw the work away. A deleted task tag therefore leaves its
  tasks standing, under the group named after where they came from — and ADR-063's merge-instead-of-delete does not
  have to be extended, because the reason it exists (a delete silently refiling rows nobody was looking at) does not
  arise when the rows stay put and say so.
* **Local Mode needed no migration**, and the reason is worth writing down because the opposite was assumed: the
  IndexedDB adapter keeps every table in **one** object store keyed `table/id`, so a new syncable table is new keys
  rather than a new store, and `DB_VERSION` has nothing to say about it. A case in `persistence.spec.ts` now states
  that, so the next person to add a table finds the answer instead of the question.
* **The drag is a composable, not a widget** (`useDragToGroup`). It reports *what was lifted* and *where it was let
  go* — a container and, where the container numbers its children, the gap — and knows nothing about tasks. That is
  the shape the tag-reorder session needs for reordering *within* a list, which Ionic's `ion-reorder-group` could
  have served and this could not have been built on: it appears nowhere in this client, it cannot express moving
  *between* groups, and it reports the end of its animation rather than the landing of a write.
  * **`data-drag` is always set**, with `idle`, `lifting`, `dragging` or `settling`, mirrored from a plain `let` so
    a pointer move does not re-render the list under the finger holding it.
  * **`idle` means „nothing is in the air", not „something was written."** A drop that changes nothing must still
    reach it, or every case that waits on the attribute hangs on exactly that one drop — the tag-reorder session's
    point, from a case it already has.
* **An empty group is not drawn and is not a target**, so a tag is removed in the task's sheet rather than by
  dragging into a heading that would have to appear for the purpose. The prototype did it the other way and the list
  moved under the finger that had just lifted a task (ADR-060).
* **The portable format is unchanged and therefore incomplete**, as it already is for the phase: a task travels as
  its words, and an imported one arrives untagged.

## Revisit trigger

* **The two vocabularies:** somebody renames an item tag and expects the task tag of the same name to follow, or asks
  why *Technik* has to be typed twice. The cost accepted here is exactly that, and it would be the signal that
  option C was the better trade after all.
* **The origin heading:** a reader asks to drag a chore of the trip into *Aus Packliste*, or to rename that heading.
  Either means it is being read as a tag, and the decision above is the thing to re-open.
* **The drag:** if the tag manager's reordering cannot be built on `useDragToGroup` — the index it reports, or the
  continuous hover — the composable is wrong for one of its two consumers and should be split rather than widened.
