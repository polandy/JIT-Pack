# ADR-089: An excursion's GPX tracks — tables of its own beside the idea's, one code path over both

**Status:** Accepted
**Related:** ADR-085 (GPX tracks on an idea, whose shape this repeats), ADR-088 (the route editor), ADR-077
(excursions), ADR-078 and ADR-066 (feature modules and their boundary), ADR-067 (the migration chain), FR-31.15,
FR-29.17, invariants 2 and 6, `internal/store/track.go`, `client/src/app/trackFiles.ts`,
`client/src/composables/shared/useTrackOwner.ts`, `client/src/components/global/TrackSummary.vue`

**Decision Drivers (in priority order):**
1. **Nothing on disk changes meaning.** The family's instance runs in production with tracks on its ideas; their rows
   and files must be read tomorrow exactly as today, without a data migration.
2. **Each half stays with its feature.** Ideas are the planner module's tables, excursions the packing side's
   (ADR-078); neither side may need the other's table to exist, and §3.29's bridge, not this slice, is where the two
   meet.
3. **One behaviour, written once.** Upload, replacement, the push rule, the file read back, the editor's save and its
   undo are the same for both holders; a second copy would drift as ADR-025's importer did.
4. **The sync machinery's grain.** A partition, a codec, a cascade and an activity label are declared per table; a
   holder that is a column value instead of a table cuts across all four.

---

## Considered Options

### Option A — `excursion_tracks` and `excursion_track_gpx`, column for column the idea's, under one parameterised code path *(accepted)*

Migration 019 adds the two tables; only the holder column differs (`excursion_id`). The store's upload, replacement
and file read take a `trackHolder` (the two table names, the holder column and table, the not-found error) and
serve both; the write gate's `validTrack` holds both tables; the wire's upload is one `TrackUpload` on two routes.
On the client the files go through one `createTrackFiles` bound to either table and route, the acts of a screen
through one `useTrackOwner`, and the excursion's tracks are rows of the trip store, cascaded with the excursion.

**Pros**
- Purely additive: two `CREATE TABLE`s, no row on disk touched.
- Each table belongs where its holder does; the boundary gate has nothing new to allow.
- The per-table declarations (partition, codec, cascade, activity label, FK graph) are the ordinary ones.

**Cons**
- Two schemas that must stay identical by hand; a column added to one is owed to the other.
- The store builds SQL with the table names spliced in (from constants, never input).

### Option B — one kernel `tracks` table with `holder_kind` and `holder_id`

Move `idea_tracks` into a table both holders share, the holder named by two columns.

**Pros**
- One schema; a new holder (a day entry?) costs no table.

**Cons**
- Rewrites the production rows of `idea_tracks` and moves the planner's table into the kernel — a destructive
  migration for a convenience.
- No foreign key can cascade a delete from two parents: the excursion's and the idea's delete would each need
  hand-written cleanup, on the server and in the client's cascade.
- Every per-table declaration becomes a per-holder branch inside one table.

### Option C — two nullable columns on `idea_tracks` (`idea_id` or `excursion_id`)

**Pros**
- No new table; foreign keys still cascade from each parent.

**Cons**
- `idea_id` is `NOT NULL` today: relaxing it is a table rebuild in SQLite, on production data.
- The planner's table then carries the packing side's rows — the boundary (driver 2) is broken in the schema itself.

---

## Decision Matrix

| Driver | Weight | A — tables of its own | B — one shared table | C — two columns |
|---|---|---|---|---|
| Nothing on disk changes meaning | 4 | 5 — additive | 1 — rows rewritten | 2 — table rebuilt |
| Each half with its feature | 3 | 5 | 2 — kernel owns both | 1 — planner table holds packing rows |
| One behaviour, written once | 2 | 4 — parameterised | 5 | 4 |
| The sync machinery's grain | 1 | 5 | 2 | 3 |
| **Total** | | **48** | 22 | 22 |

---

## Decision

An excursion keeps its tracks in `excursion_tracks` and `excursion_track_gpx`, shaped as the idea's, behind its own
`PUT/GET /trips/{id}/excursions/{excursionID}/tracks/{trackID}`; one code path serves both holders on the server
(`trackHolder`) and on the client (`createTrackFiles`, `useTrackOwner`, the kernel's `TrackMore` and `TrackSummary`).

## Consequences

**Positive**
- The idea's rows, files and route are untouched; the upgrade is migration 019 alone.
- The kernel's track components and screen logic are now shared, so the next holder is a table, a route and a list.

**Negative / accepted costs**
- Two identical schemas held together by hand; `TestSchemaChain_EndsWhereSchemaSQLDoes` holds each against its
  migration, not the two against each other.
- A track does not follow an idea onto an excursion; the file is downloaded and added again until §3.29's bridge.

**Neutral**
- The wire's `IdeaTrackUpload` is renamed `TrackUpload`; client and server ship as one artifact, so nothing reads the
  old name.

## Revisit Trigger

A third holder of tracks is asked for, or a column is added to one track table — then a shared table (Option B) is
weighed again against the rows it would rewrite.
