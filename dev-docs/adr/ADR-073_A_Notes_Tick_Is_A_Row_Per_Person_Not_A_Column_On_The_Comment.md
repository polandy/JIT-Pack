# ADR-073: A note's tick is a row per person, not a column on the comment — vs. an `acked_by` column, vs. a device-local set

**Status:** Accepted
**Related:** FR-7.9, FR-7.1, FR-7.3, FR-7.4, ADR-022 (NFR-4.2a field-level LWW), ADR-067, ADR-068,
`dev-docs/trip-notes-concept.md`, `internal/store/schema.sql` (`note_acks`),
`internal/store/migrations/004_note_acks.sql`, `client/src/domain/tripNotes.ts`, `internal/api/server.go` (`stampActor`)

**Context.** The owner asked on 2026-09-21 for notes a traveller writes that every co-traveller can read — a key-box
code, a courier's phone number — which can be ticked off, where *„die Deklaration hat den State im Bezug auf den
User der es deklariert hat und nicht global"*: Anna having seen the code must not mark it seen for Chris. A note
itself is free — it is a trip-level `comments` row, the shape FR-7.1 already allows and no screen wrote yet (FR-7.2's
`is_task` stays 0). What this ADR decides is the one new piece: where a **per-person** fact about a shared row lives,
which the codebase has answered once already for a different reason (ADR-068's tasks are one list; a task's own
*resolution* is global, not per person, so it stays a column). This is the first per-person fact on a row several
people read, and the three options were compared against what NFR-4.2a's merge actually does to a column two people
write at once.

**Decision Drivers (in priority order):**
1. **Two people's ticks made without either seeing the other's must both survive.** This is the whole point of the
   feature — a global "seen" flag would make the second tick invisible, and a lost tick reads as a note nobody has
   read.
2. **"New for me" must be answerable without a server**, because Local Mode has no server at all (invariant 4) — the
   rule that decides it has to be pure client code over rows the device already holds.
3. **The tick follows the person, not the device.** A traveller who ticks a note on their phone and opens the trip on
   a tablet must not see it as new again.
4. **Nothing the client writes as an identity claim is trusted** (invariant 3) — whichever shape is chosen has to
   go through `stampActor` the way `comments.author_id` already does.
5. **Un-ticking must not look like the note was never read** — the history of who has seen a note is worth keeping,
   not just the current state.

---

## Considered Options

### Option A — an `acked_by` column on `comments` *(rejected)*

A JSON array or a set-valued column of user ids who have ticked the note, merged as one field like every other
column on the row.

* **Pro:** no new table, no new migration, no new `stampActor` case.
* **Con, decisive:** NFR-4.2a merges a field **whole** — the later HLC wins the entire value. Anna and Ben both
  ticking the same note while offline is exactly two concurrent writes to one field; whichever syncs second silently
  discards the other's tick, and neither device is told. Driver 1 fails outright. This is the same reason FR-7.4's
  own tasks sit in a table rather than a column (ADR-068's context) — a fact two people can produce at once needs a
  row each, or one of them is lost.
* **Con:** a column meant to hold structured data (a set, as JSON) invites exactly the string-matching and
  ad-hoc parsing CODING_PRINCIPLES already steers away from, for a feature where the two other options need neither.

### Option B — the tick lives on the device only, never synced *(rejected)*

A local set of ticked note ids, the shape `dashboard.ts`'s existing `delegationSeen` already uses for "have I shown
this before" (`client/src/local/delegationSeen.ts`).

* **Pro:** the simplest possible implementation — no schema change, no migration, no `stampActor` case, works
  identically in all three modes because nothing about it needs an account.
* **Con, decisive against driver 3:** it does not follow the *person*, only the *device*. Ticking a note on a phone
  and opening the trip on a tablet shows it as new again — the opposite of what "declared seen" is supposed to mean,
  and worse than doing nothing, because it teaches the traveller the tick is unreliable.
* **Con:** lost with the browser's storage, same as every `localStorage`-backed feature already accepts for its own
  narrower promise (a remembered scroll position, a collapsed section) — a promise this feature does not make.

### Option C — `note_acks`, one row per (note, person) *(chosen)*

A new trip-partition table: `id`, `trip_id`, `comment_id`, `user_id` (server-stamped, invariant 3), `acked`, the
usual `field_hlcs`/`updated_hlc` pair. Two people ticking the same note write two different rows — there is nothing
for NFR-4.2a's field merge to arbitrate, because the rows never collide (`UNIQUE (comment_id, user_id)` is the only
place two devices' writes could meet, and both would be writing the *same* fact for the *same* person). Un-ticking
sets `acked` back to `0` rather than deleting the row, so field-level LWW never has to decide whether a delete or a
later re-tick came first — the row's own history stays legible instead of disappearing and reappearing.

* **Pro:** driver 1 by construction — a row per person is immune to the exact collision Option A loses to.
* **Pro:** driver 2 — "new for me" (`isNoteNewForMe` in `client/src/domain/tripNotes.ts`) is `author ≠ me` and no
  `acked` row of mine, entirely over rows the device already has; no server round-trip.
* **Pro:** driver 3 — the row is keyed by `user_id`, a synced fact, not a device.
* **Pro:** driver 5 — un-ticking is a fact of its own (`acked: false`), not an erasure.
* **Con, accepted:** a second table and a second migration (`004_note_acks.sql`), and a second `stampActor` case
  (`store.TableNoteAcks`, stamped on insert only — the same shape as `comments.author_id`, and for the same reason:
  an upsert must flip `acked` on a row that already names its person, never reassign the row to someone else's tick).
* **Con, accepted:** in Local Mode no `note_acks` row is written at all (there is no `user_id` to write, and the
  screen still works as a scratchpad) — one more table `client/src/domain/portable.ts`'s exporter never has to
  serialise, on the same footing as FR-7.4's own tasks and FR-30's shopping entries (NFR-4.11).

---

## Decision Matrix

| Driver (weight) | A: `acked_by` column | B: device-local set | **C: `note_acks` table** |
|---|---|---|---|
| 1. Concurrent ticks both survive (5) | 1 | 5 | 5 |
| 2. Derivable with no server (4) | 4 | 4 | 4 |
| 3. Follows the person, not the device (4) | 4 | 1 | 4 |
| 4. Server stamps the identity (3) | 3 | — | 3 |
| 5. Un-tick keeps its history (2) | 2 | 3 | 4 |
| **Total** | **14** | **13** | **20** |

---

## Consequences

* **Two schema edits, no reseed.** `note_acks` is in `schema.sql` and in `migrations/004_note_acks.sql`;
  `TestSchemaChain_EndsWhereSchemaSQLDoes` holds the two together (ADR-067).
* **`trip_id` is carried directly on `note_acks`**, not only reachable through `comment_id` — the trip partition's
  own scoping (`internal/store/store.go`'s `belongsToTrip`, `internal/store/partition.go`'s `feed.where()`) reads a
  row's `trip_id` column, the same as every other trip-partition table (`containers`, `comments` themselves). A row
  that only named its comment would need a join the sync layer does not do.
* **`stampActor`'s `TableNoteAcks` case mirrors `TableComments`'s `author_id` exactly**: `delete(m.Fields,
  "user_id")`, then `m.Set("user_id", userID)` **only on insert**. Stamping unconditionally, on every op, was tried
  first and rejected during review — it would let a second user's *upsert* on someone else's ack row silently
  reassign whose tick the row is, where the `UNIQUE (comment_id, user_id)` constraint should instead refuse the
  attempt as a fresh insert. `TestStampActor_NoteAckUpsertCannotStealAnotherUsersRow` holds this.
* **Deleting a note cascades to its acks.** `comments`' `tableSpec.cascades` now names `note_acks`
  (`comment_id`-scoped), and `trip_items`' does too, flattened — the FK graph test
  (`TestTableSpecs_CascadesAreTheFKGraphMinusTheDocumentedExceptions`) walks transitively but a `tableSpec`'s own
  list does not, so a table reachable two hops down still needs its own entry. `trips → note_acks` is excused the
  same way every other trip-partition child is: the whole feed is deleted with the trip, so no tombstone reaches a
  feed that no longer exists.
* **The client mirrors the cascade optimistically.** `tripStore.ts`'s comment sink removal now also drops any
  `note_acks` rows for the deleted comment, scanning every trip's bucket the way `bucketedRows.remove` already does
  for a row's own id — a comment's `trip_id` is not known once the comment itself is gone from the store.
* **M1's tick is the same table, reached through `useOrchestrator`'s `toggleNoteTick`**, which decides insert vs.
  upsert from the caller's own `note_acks` lookup (`myAckFor`) rather than duplicating that choice at each call
  site — M25's list and M1's card both call it the same way.
* **The portable backup stays silent about notes and their ticks**, like every task and shopping entry (NFR-4.11):
  `client/src/domain/portable.ts` never names `ItemComment` or `NoteAck` among what it serialises, so there is
  nothing to add or omit deliberately — the absence is inherited from FR-7.3/7.4's own todos, not decided here again.

**Amendment note (2026-09-25, FR-7.13) — the tick is the thread's, and says how far it reached.** Notes became threads:
a reply names its first note, and the tick stays exactly this table — one row per (first note, person) — read one way
further. A nullable **`seen_through`** records the stamp of the thread's newest entry at the moment of the tick, so an
entry by somebody else created or edited after it makes the thread new again, compared data against data rather than
clock against clock. Nothing here is re-decided: the per-person row is what makes a per-person reach possible at all,
where a column on the comment could have held neither. A row written before the column has no reach and reads as
covering the first note as it was, which is what it was given for. `isNoteNewForMe` became `noteThreads`, which also
treats the reader's own latest entry as read — replying is not ticking, but what one answered is behind one. Reasoning:
`dev-docs/trip-note-threads-concept.md` §3; no new tradeoff, so no new ADR.

## Revisit trigger

* **A note ticked by dozens of people on one trip.** `note_acks` grows one row per (note, person); a trip with an
  unusually large roster ticking every note is the case where this stops being "a handful of rows nobody counts" —
  worth revisiting if a trip's roster in practice runs past the low dozens this was sized against.
* **A second per-person fact on a shared row appears elsewhere** (a "starred" flag, a per-person priority). If the
  same table-per-fact shape gets written a third time, it is worth asking whether a general per-(row, person) table
  is owed instead of one bespoke table each time.
* **Local Mode grows a real second identity.** The device-local set (Option B) was rejected for not following the
  person; if Local Mode ever gains device-to-device sync of its own identity (it does not today — ADR-006's native
  shell is still planned, not built), the trade this ADR made should be re-read against that.
