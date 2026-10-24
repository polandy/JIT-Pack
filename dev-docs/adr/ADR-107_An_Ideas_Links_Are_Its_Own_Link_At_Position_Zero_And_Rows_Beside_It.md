# ADR-107: An idea's links — its own link at position 0 and rows beside it vs. all links as rows vs. one list column

**Status:** Accepted
**Related:** FR-29.22, FR-29.1, FR-29.16, NFR-4.2a, ADR-067, ADR-078, `idea_links`, `ideas.link_label`,
`client/src/planner/domain/links.ts`

**Decision Drivers (in priority order):**
1. Two travellers adding, naming or moving a link each, on two devices and offline, keep both writes (NFR-4.2a's
   field-level LWW).
2. Every idea written so far keeps its link as it is, and a device still running the previous build keeps reading and
   writing it — the family's devices update when they reload, not at once.
3. The schema chain stays additive (ADR-067): nothing is copied or dropped on start-up.

---

## Considered Options

### Option A — `ideas.link` stays the link at position 0, further links are `idea_links` rows *(recommended, accepted)*

The idea keeps its column, with a name beside it in `ideas.link_label`. Every further link is a row of `idea_links`
with its idea, address, name and an integer `position`; the own link counts as 0, so a link moved before it takes a
negative position and the idea's row is not rewritten. The client's `ideaLinks` merges the two into one ordered list
for every screen, and `linkWrites` turns the sheet's list back into the fields and rows that changed.

**Pros**
- A row per link is a row per write: two links added on two devices are two inserts, a name and a move on the same
  link two fields. Nothing is lost to a merge.
- An idea with one link is the idea it was — no migration of data, and the previous build still reads and writes its
  one link.
- The migration only adds a table and a column.

**Cons**
- A link lives in one of two places, and every reader goes through `ideaLinks` to get the order right.
- The own link's place is fixed at 0; reordering around it needs negative positions and a tie-break (own link first,
  then the id) so every device draws the same order.
- Removing the own link empties the column unless a link added in the same save takes its place; the remaining rows
  stand where they are, so the idea's first link is then a row.

### Option B — every link a row of `idea_links`, `ideas.link` emptied into it

A migration copies each idea's link into a row at position 0 and the client stops writing the column.

**Pros**
- One place for every link; the order is the rows' alone.

**Cons**
- A device on the previous build writes `ideas.link`, which nobody reads any more: its edit is lost until it reloads.
- The migration rewrites data on start-up, which ADR-067's chain avoids, and the column stays in the schema, dead.

### Option C — the links as one JSON array in an `ideas.links` column

**Pros**
- One field, one read, no second table or ordering rule.

**Cons**
- The array is one field to the merge: two links added at once on two devices keep only the later list.
- A name or a move rewrites every link, and a CHECK cannot hold each address to `http`/`https`.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| Concurrent writes survive | 3 | 3 — a row per link | 3 — a row per link | 1 — last list wins |
| Old ideas and old builds keep working | 2 | 3 — the column is untouched | 1 — old builds write a dead column | 1 — old builds write a dead column |
| Additive schema chain | 1 | 3 — a table and a column | 1 — data copied on start-up | 2 — a column, data copied |
| **Total** | | **18** | **12** | **7** |

---

## Decision

`ideas.link` stays the idea's own link at position 0, named by `ideas.link_label`; every further link is an
`idea_links` row at an integer position of its own, negative before the own one, read together through one ordered
list on the client.

## Consequences

**Positive**
- Every one-link idea and every reader of `ideas.link` is unchanged.
- A save writes only the fields and rows that changed; positions stand unless the order needs new ones.

**Negative / accepted costs**
- Two places to read and to write, held together by `ideaLinks` and `linkWrites` and their tests.
- The guard `validIdeaLink` holds a row to an idea of its own trip; the delete of an idea tombstones its rows.

**Neutral**
- The detail names a link by its name or its site and reads no page; only the sheet reads titles, once per link.

## Revisit Trigger

A reader outside the planner needs an idea's links in order — an export, the server's notifications, the bridge to the
packing side — so that the merge of the two places would be written a second time.
