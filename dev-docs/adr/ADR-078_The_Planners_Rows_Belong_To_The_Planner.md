# ADR-078: The planner's rows belong to the planner — its own discussion table vs. a column on `comments`; results named on the result vs. a list on the idea

**Status:** Accepted — amended 2026-10-02 (amendment 1: where a result is made)
**Related:** PRD Addendum §3.29 (FR-29.1–29.4, FR-29.9, FR-29.13), ADR-066 (feature modules), ADR-073 (a row per
person), ADR-022 (field-level LWW), UI-Spec M28, schema `ideas`, `idea_votes`, `idea_comments`;
`dev-docs/planner-concept.md` §3, §5a

**Decision Drivers (in priority order):**
1. **A hard module boundary** (FR-29.9, ADR-066): the planner holds every row it shows, and nothing the packing side
   reads has to know that ideas exist — the premise of running only the planner's e2e cases on a planner-only diff.
2. **Two people acting at once both win** (NFR-4.2a): a vote, a word and a link made on two devices at the same moment
   must not merge into one field and lose one.
3. **One comment model where one already fits** — the author stamp, the list shape — rather than a second of everything.
4. **Small blast radius**: the partition, the merge and the screens that exist stay as they are.

---

## Considered Options

Two questions, decided together because they are the same question — where does a row the planner owns live.

### Option A — The planner's own tables; a result names its idea *(recommended, accepted)*

`ideas`, `idea_votes` (a row per idea and account, `UNIQUE (idea_id, user_id)`) and `idea_comments` — a discussion table
of the planner's own — all in the trip partition, routed to the planner's store through the `FeatureStore` the
composition root hands the orchestrator. When the bridge is built (FR-29.13), an excursion, a task or a shopping entry
made from an idea carries a nullable `idea_id` **on the result**, `ON DELETE SET NULL`; the idea's *Daraus gemacht* is a
read over those three tables, never a stored list.

**Pros**
- Driver 1 fully: M25, M26, M1 and the server's note notifications read `comments` exactly as before; the planner's
  store holds all three of its tables and the packing store none of them.
- Driver 2: a vote is its own row (ADR-073's reason for `note_acks`); a result is its own row with its own `idea_id`, so
  two people making a task and an excursion from one idea at once keep both links.
- The vote gate is one rule over one table (`validIdeaVote`): only the voter changes their row.

**Cons**
- A second comment shape beside `comments`: its own author stamp (`stampOnInsert`), codec and entry rendering. The
  planner's entries cannot become tasks by FR-7.2's flag — a task from an idea is FR-29.13's bridge, written as a task.
- The draft §3.29 (FR-29.4) reused `comments` with an `idea_id`; this reverses it.

### Option B — `comments.idea_id` for the discussion

A nullable `idea_id` beside `trip_item_id` on `comments` (at most one set), the thread read by the planner.

**Pros**
- One comment model, the author stamp and the notes' edit rule already in place.

**Cons**
- Every reader of trip-level comments — M26's threads, M25's tasks, M1's notes card, the note-reply notification, the
  due-task reminder — must learn to exclude idea comments, or they surface as notes. A reader that forgets fails
  silently.
- `comments` is the packing store's table: the planner would read its own discussion through a kernel contract into
  packing's store, or reach into it — the boundary FR-29.9 exists for.
- A CHECK tying two columns has to be added to an existing table, which SQLite cannot do without a rebuild.

### Option C — Results as a list on the idea

A `results` column on `ideas` naming the excursion, task and shopping entry made from it.

**Pros**
- *Daraus gemacht* is one field, read without a join.

**Cons**
- One field merged whole (NFR-4.2a): two results made at once lose one link. A join table would avoid that and add a
  fourth table for what one column on the result already says.

---

## Decision Matrix

| Driver | Weight | A — own tables, link on the result | B — `comments.idea_id` | C — list on the idea |
|---|---|---|---|---|
| Module boundary | 4 | 3 — the planner holds its rows | 0 — every trip-comment reader changes | 2 — the idea is the planner's, the list names packing rows |
| Both win at once | 3 | 3 — a row each | 3 — a row each | 0 — one merged field |
| One comment model | 2 | 1 — a second, smaller shape | 3 — one | 1 — as A for the discussion |
| Small blast radius | 1 | 2 — three new tables, nothing changed | 1 — a CHECK on an old table, five readers | 2 |
| **Total** | | **25** | **16** | **12** |

---

## Decision

The planner's rows live in the planner's own tables and store: `ideas`, `idea_votes` (a row per idea and account, the
voter stamped and alone allowed to change it) and `idea_comments`. A result made from an idea will name it in a nullable
`idea_id` of its own row, `ON DELETE SET NULL`.

## Consequences

**Positive**
- The packing side is untouched by slice 1a: no reader of `comments` changed, and the boundary gate holds both
  directions with the planner as its second module.
- Local Mode keeps every rule: the idea's own cascade is named by the planner's store and painted through
  `sync/cascade.ts`'s `cascadeTombstones`.

**Negative**
- Two comment shapes; a later feature that searches *all* words of a trip reads two tables.
- An idea's delete leaves what came of it standing without an origin (FR-29.13's cost, chosen in the concept).

## Revisit Trigger

A third feature needs a discussion of its own — then the shape is extracted once for all three, rather than copied a
third time. Or a reader outside the planner needs an idea's discussion (a search across the trip, an export that renders
it): then decide whether it reads the planner's table through a kernel contract or the discussion moves into `comments`
after all.

## Amendment 1, 2026-10-02: where a result is made — the screen that makes it, not a sheet over the idea

FR-29.13 said "through the existing creator, pre-filled" without saying where that creator stands. Two shapes were
weighed:

- **A — the target screen.** The chip opens M27, M25 or M6 with its creator open and pre-filled; the result is seen
  where it lives, and `‹ back` returns to the idea. The three screens stay exactly as they are, the planner imports
  none of them, and what crosses the boundary is a path (`ideaBridgePath`) and a lookup (`IDEA_LOOKUP`).
- **B — a sheet over the idea.** The creator opens over M28 and the reader never leaves the idea, which is quicker for
  several results in a row. But M27's sheet and M25's composer would have to be handed to the planner through a new
  kernel contract carrying components, and M6's composer is not a component of its own at all.

**A, by the owner's choice.** Its cost is the way back: a trip's view returns to the trip (ADR-011's declared parent),
and here it has to return to the idea. That is a sixth route class, `meta.acceptsLinkedFrom` — the origin is honoured
when **a link carried it**, never stamped on the way in, so switching between the views keeps returning to the trip.
M27's excursion page has the class too, since a new excursion opens its list.

Two traps the shape walked into, both fixed at their cause: an idea's sheet opened **during** the page transition into
M28 (a panel teleported into the frame, a modal presented) left the page it came from unhidden in the outlet, so the
idea opens once the board has entered (`ionViewDidEnter`); and the phone's sheet, dismissed because the route moved
on, navigated back to the board — its dismissal closes the idea only while the route still has one open.
