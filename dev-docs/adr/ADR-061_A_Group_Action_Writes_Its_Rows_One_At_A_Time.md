# ADR-061: A cluster head's "for everyone" — fan-out over its instances vs. a field on the item

**Status:** Accepted
**Related:** FR-25.26, FR-25.25, FR-25.1, FR-25.23, FR-5.1, FR-25.19, NFR-4.2a, ADR-022, ADR-036, G-3,
`internal/store/schema.sql` (`trip_items.late_packer`, `trip_items.packer_user_id`)

**Decision Drivers (in priority order):**

1. **The per-person model stays one shape.** FR-25.21/ADR-036 settled that a per-person item is N ordinary
   `trip_items` rows and nothing else — M4's cluster, the FR-27.4 refresh, M6's aggregation and M12's analytics all
   read rows and sum. A second place where "the item's" value could live would be a second shape for every one of them.
2. **Offline merge stays the rule that already exists** (NFR-4.2a, ADR-022): field-level LWW per row. Anything that
   merges differently is a new algorithm to specify, test and debug on devices that were offline.
3. **A group action must not become a way past the G-3 lock**, which is advisory by owner decision (2026-08-30).
4. **The screen must be able to say what it did.** Whatever the mechanism, the user has to be able to tell "all four"
   from "three of four".

---

## Considered Options

### Option A — Fan-out: the head writes each instance's own field *(recommended, accepted)*

The head has no state. Choosing *„Spätpacker für alle ein"* resolves the instances it counts, drops the ones somebody
else is holding, and enqueues one ordinary `upsert` per remaining row — the same mutation the row-level control
produces. `domain/clusterActions.ts` decides the set and the report; `setLatePackerForRows` / `setPackerForRows` are
loops over the existing single-row actions.

**Pros**

- No schema change, no sync-contract change, no merge rule: four writes are merged exactly as four row edits are.
- An instance set differently afterwards **stays** different, which is what a per-person list is for — one traveler
  can be taken off the flag without the group statement fighting the row.
- The locked instance has an obvious, honest answer: leave it out and name its holder.
- Undo, conflict logging and the optimistic paint work already, because nothing about the write is new.

**Cons**

- N mutations for one gesture, and on a large roster N is the roster. Measured against the model's own limits this is
  small (a trip's travelers, not its rows), but it is real outbox traffic.
- The instances can disagree, so the head can only report a *fact about the set* ("all flagged") rather than hold a
  value. The menu therefore offers *„aus"* only when every instance carries the flag — a rule that has to be stated.
- Two devices doing it at once write the same fields twice; LWW settles it, but the change log shows both.

### Option B — A field on the source item (`items.late_packer` as the cluster's truth)

The flag moves up to the master item or to a per-trip "item settings" row, and instances read it unless they override.

**Pros**

- One write per gesture, regardless of roster size.
- The head has a value of its own, so its menu is a plain toggle.

**Cons**

- It introduces the override model FR-25.21 deliberately does not have: every reader of `late_packer` — M4's row, the
  cluster head, the dashboard's departure-day list, M6, the portable format, analytics — would have to resolve
  instance-then-item instead of reading a column.
- The master row is the **inventory**, shared across trips: a flag set for this trip's toothbrushes would follow the
  item to next year's trip, or need a third table to scope it.
- It needs a schema change, and invariant 2 makes that a reseed of every development database — paid for a feature
  that the existing columns already express.
- Field-level LWW would now merge two levels that can disagree, which is a merge rule NFR-4.2a does not describe.

### Option C — One mutation carrying several row ids

A new mutation op ("set field on these rows") pushed as one envelope entry.

**Pros**

- One outbox entry; atomic on the server.

**Cons**

- It is a new operation in the sync contract (ADR-026/027, the Sync-API spec, the server's apply path, the change log
  and the conflict log all describe *one row per mutation*), for an ergonomics win the loop already delivers.
- Atomicity is the wrong promise here: the point of the G-3 rule below is that a partial application is the **correct**
  outcome, and an all-or-nothing write would have to refuse the whole gesture because one row is busy.

---

## Decision Matrix

Scores are 1–5, higher is better.

| Driver | Weight | A — fan-out | B — field on the item | C — multi-row mutation |
|---|---|---|---|---|
| Per-person model stays one shape | 5 | 5 — nothing is added | 1 — introduces overrides everywhere | 4 — rows unchanged |
| Merge stays field-level LWW | 5 | 5 — unchanged | 2 — two levels can disagree | 3 — new op to specify and test |
| No way past the advisory lock | 4 | 5 — skips the held row, names it | 3 — one value, so it writes through | 2 — atomic write refuses or overrides |
| The screen can report what it did | 3 | 5 — it knows the two counts | 3 — nothing partial to report | 4 — server could report |
| Cost to build | 2 | 5 — a loop and a pure planner | 2 — schema + every reader | 2 — contract, server, client |
| **Total** | | **73** | **37** | **51** |

---

## Decision

The cluster head owns no state. *„Für alle"* resolves the instances the head counts, drops the ones another person is
holding, and writes each remaining instance's own field with the same mutation the row-level control uses. The set it
writes is the set it counts — filtered-out and other-people's rows are outside both. A fan-out that could not write
every instance says so, naming the holders; a cluster whose every instance is held offers no menu at all.

## Consequences

**Positive**

- Nothing downstream of `trip_items` learns a new shape: the schema, the sync envelope, the merge, the conflict log,
  the portable format and every screen that reads these two columns are untouched.
- The rule for a held instance is stated once, in `domain/clusterActions.ts`, and is unit-tested without a screen —
  the case that matters most is the one a running app shows as "nothing visibly different happened".
- Per-instance divergence survives, which keeps FR-25.21's promise that each traveler's row is genuinely their own.

**Negative / accepted costs**

- One mutation per instance. On a family-sized roster that is three to five writes per gesture; on a hypothetical
  twenty-traveler trip it is twenty, and the outbox will show them.
- The head cannot render a tri-state, so "some flagged" and "none flagged" offer the same entry. The ⏰ on the head
  (FR-25.23, any instance) is what distinguishes them visually.
- The write is not atomic: a device that goes offline mid-gesture can land some instances and not others. This is the
  same exposure every multi-row action on the client already has (FR-20.2's co-skip, ADR-036's repoint).

**Neutral**

- The head could later carry more fan-out entries (mode, container) at no additional structural cost; whether it
  *should* is a product question, and the menu is deliberately two entries long today.

## Revisit Trigger

A roster large enough that one gesture's writes are visible as a stall — concretely, when a trip's traveler count
routinely exceeds ~20, or when an action is added whose fan-out is over *rows* rather than over instances of one item
(a "flag this whole category" gesture would be hundreds of writes, and Option C's multi-row mutation becomes the
cheaper answer).
