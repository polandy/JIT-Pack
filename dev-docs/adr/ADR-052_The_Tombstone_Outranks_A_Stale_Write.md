# ADR-052: A deleted row stays deleted — read the tombstone vs. keep the row

**Status:** Accepted
**Related:** ADR-018 (no migrations in the development phase), ADR-031 (a refusal repairs the row it refused),
ADR-032/034 (FR-24.3 retire and restore), NFR-4.2a, Sync-API §5/§6, `internal/store/partition.go`,
`internal/store/schema.sql`

**Decision Drivers (in priority order):**

1. **No silent data loss, in either direction (NFR-4.2a).** A delete that undoes itself is as much a loss as an edit
   that vanishes: somebody decided the row should go, and it came back without anybody being told.
2. **The rule must be one rule.** Delete-versus-write precedence already exists for a row that is present
   (`m.hlc > row.updated_hlc`). A second, differently-shaped answer for a row that is absent is how two behaviours
   for one question get built.
3. **Invariant 2 prices schema changes at a reseed.** Until ADR-018's trigger fires, a DDL change means every
   development database is refused and the family instance is migrated by hand. That is a real cost, not a formality.
4. **Local Mode and Single-User Mode must be unaffected.** Neither has a second device, so neither can produce the
   defect; neither may pay for the fix beyond what it already pays.

---

## Considered Options

### Option A — read the tombstone from `change_log` *(recommended, accepted)*

The change log already records every delete, in the feed the deleted entity belonged to, with the delete's HLC. Where
a mutation finds no row, the store looks up the newest tombstone for that entity in that feed and refuses the mutation
as `row_deleted` unless the mutation's clock is strictly newer. No schema change, no new state: the memory of the
delete is read from the place that already holds it.

**Pros**

- The comparison is the same one the delete branch makes, off the same clock, so the two cannot drift apart.
- Nothing new has to be kept correct: the tombstone is already written, already scoped to its partition, and already
  the thing every device pulls.
- ADR-031's repair works unchanged — there is no server row, so the re-log is a tombstone, which is exactly what the
  device holding the phantom needs.
- The legitimate re-creations (the client's undo, FR-24.3's restore) keep working, because they carry a fresh clock.

**Cons**

- A lookup for every write that finds no row — which is every insert. `change_log` carries no index the predicate can
  use, so it is a scan. **Measured** (`BenchmarkTombstoneLookup_*`, i5-7300U): on the master feed one insert costs
  0.80 ms at an empty log, 3.8 ms at 5 000 entries and 8.0 ms at 20 000, and with the guard disabled the same
  benchmark stays flat at ~0.7 ms — so the growth is entirely this lookup, and it is linear in a log nothing compacts.
- The rule now lives in the store rather than in `internal/sync`, which owns precedence: the tombstone is a store
  table, and `Merge` stays pure by not learning about it.
- It depends on the change log being retained. Nothing compacts it today (Sync-API §4 says so), but a future
  compaction would have to keep tombstones or this guard quietly stops guarding.

### Option B — keep the row and mark it deleted (a `deleted` column per table)

A delete becomes an `UPDATE … SET deleted = 1`, so the row and its clock survive and `Merge`'s ordinary field-LWW
answers the question with no new code path at all.

**Pros**

- The purest fit for the merge model: a delete becomes a field like any other, and precedence needs no special case.
- Every read is a seek, not a scan; the cost is a `WHERE deleted = 0` on queries that already exist.

**Cons**

- A schema change across 31 tables, which invariant 2 prices at deleting every development database and hand-migrating
  the family instance's 34 trips. That cost is paid *now*, for a defect that has a cheaper fix.
- Every existing query in the store, every export, every FK cascade and every uniqueness constraint has to learn about
  the flag, and each one that forgets is a new defect of exactly the kind this ADR is about.
- Deleted rows accumulate forever with nothing to compact them, and the data they hold is precisely the data the user
  asked to be rid of.

### Option C — refuse every write that finds no row for a deleted id, regardless of clock

Treat any tombstone as final: once deleted, that id can never be written again.

**Pros**

- The simplest rule to state, and no clock comparison to get wrong.

**Cons**

- It breaks the client's undo and FR-24.3's restore, both of which re-insert the row they removed under the same id.
  Those are shipped, tested features, so this option is not actually available — it is listed because it is the shape
  the fix takes if the clock comparison is left out, and a test guards against exactly that.

---

## Decision Matrix

| Driver | Weight | A — read the tombstone | B — `deleted` column | C — refuse always |
|---|---|---|---|---|
| No silent loss in either direction | 5 | 5 — the delete wins, the newer write still wins | 5 — same outcome | 1 — undo and restore break |
| One rule, one shape | 4 | 4 — same comparison, stated in the store | 5 — no special case at all | 2 — a second, blunter rule |
| Schema cost under invariant 2 | 4 | 5 — none | 1 — every database reseeded or migrated | 5 — none |
| Modes unaffected | 3 | 5 — server-side only | 3 — the client mirrors the schema | 5 — none |
| Cost per write | 2 | 3 — free on the burst feed, linear on the master one (measured) | 5 — a seek | 3 |
| **Total** | | **79** | **63** | **48** |

---

## Decision

Where a mutation finds no row, the store reads the newest tombstone for that entity in that partition's feed and
refuses the mutation as `row_deleted` unless the mutation's clock is strictly newer. `internal/sync` is untouched:
`Merge` still answers "unknown id" with "apply everything", and the guard decides which unknown ids reach it.

## Consequences

**Positive**

- A delete is durable against every write that predates it, on both partitions, without a schema change.
- The refusal is a first-class one: it names its reason, the client has a sentence for it in both languages, and
  ADR-031's re-log removes the phantom row from the device that pushed it.
- The reason reuses the word §6.1's revert endpoint already answers with, so "the row is gone" has one spelling.

**Negative / accepted costs**

- One unindexed `change_log` lookup per write that finds no row, taken knowingly rather than paid for with a reseed.
  What makes it affordable is an asymmetry that was measured rather than assumed: the **trip** feed is already bounded
  by `idx_change_log_trip (trip_id, seq)` and stays flat at ~1.1 ms per insert through a 20 000-entry instance log —
  and that is the feed carrying the burst, since a trip creation writes about a hundred `trip_items`. The **master**
  feed is the one that scales (0.80 → 3.8 → 8.0 ms at 0 / 5 000 / 20 000 entries), and it sees single-digit inserts
  per user action. At the family instance's present size the worst case is a few milliseconds on an operation a person
  performs one at a time.
- It grows without a bound, because nothing compacts `change_log`. That is what the first revisit trigger below is
  for, and `BenchmarkTombstoneLookup_MasterInsert` is kept so the trigger can be re-measured rather than argued.
- The precedence rule is stated in two files: `internal/sync/merge.go` for a row that exists, `partition.go` for one
  that does not. A comment in each names the other.

**Neutral**

- Local Mode is unaffected: it has no second device, so it cannot produce a write older than its own delete.

## Revisit Trigger

Three, any one of which is enough:

- **The master feed passes ~50 000 entries** — `SELECT count(*) FROM change_log WHERE trip_id IS NULL`. Extrapolating
  the measurement above, a master insert costs about 20 ms there, which is the point at which a person adding several
  items in a row would feel it. Re-measure with the benchmark before acting on the number.
- **The first migration after ADR-018's trigger fires.** At that point an index on `change_log (entity_table,
  entity_id)` costs one line, and the accepted scan should be paid off with it whatever the count says.
- **Anything that compacts `change_log`.** Compaction is described in Addendum v2.0's Open Decision #2 and is not
  built; the day it is, it has to keep tombstones or reinstate this guard some other way.
