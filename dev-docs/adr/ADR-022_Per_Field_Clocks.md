# ADR-022: A clock per field, stored beside the row — JSON column vs. side table vs. the row-level clock the code had

**Status:** Accepted (2026-08-22)
**Related:** NFR-4.2a, Sync-API Spec §6, `internal/sync/merge.go`, `internal/store/schema.sql` (`field_hlcs`,
`conflict_log.mutation_id`/`actor_user_id`), ADR-018 (no migrations in the development phase), CLAUDE.md backlog item 14
(a)

**Decision Drivers (in priority order):**
1. **Field-level LWW has to be true, not declared.** NFR-4.2a and §6 promise that two fields which never competed do not
   decide each other. The most frequent concurrent pair on a shared trip is *somebody packs offline* against *somebody
   edits the same row online*; if the pack loses to that, the multi-user concept does not hold in its core case.
2. **No silent loss.** Whatever wins, the loser is written to the log with enough to tell the author and to restore it —
   a rule that makes the log complete is worth more than a rule that is convenient.
3. **The `sync` package stays pure** (invariant 1) and its coverage gate (≥90 %) stays meaningful: the merge decides,
   the store persists.
4. **Development-phase cost** (ADR-018): a schema change is an edit to `schema.sql` and a reseed, so the shape can be
   chosen for what it is, not for how it migrates.

---

## What was actually wrong

The backlog recorded (a) as *"`groupDecision` lets any incoming `packed` win regardless of HLC, and logs no conflict"*,
with an owner decision owed: spec or code. Reading the store showed a third thing underneath: **one `updated_hlc` per
row**, compared against every incoming field. The mutations on the wire are partial (`packItem` sends
`state`/`packed_count`, `assignContainer` sends `container_id`), so the granularity existed on the wire and was thrown
away at the row:

```
X packs offline at 10:00                → push {state: packed}, hlc 10:00
Y assigns a container online at 10:30   → row.updated_hlc = 10:30
X syncs at 11:00                        → 10:00 < 10:30 → X's pack is a conflict
```

That this did **not** happen for packing is *because* of the "packed always wins" branch: it was the compensation, and
only for the one state. For `partial`, `skipped`, `open`, `mode`, `assigned_traveler_id` and every other field an older
offline change lost to any unrelated newer edit of the row, was logged, and was told to no one. So "code follows spec"
alone would have made offline packing lose to container assignments — the owner decision as posed had no good answer,
and the real decision is this one.

## Considered Options

### Option A — `field_hlcs` JSON column on every synced table *(recommended, accepted)*

One `TEXT NOT NULL DEFAULT '{}'` column beside `updated_hlc`, holding `{field: hlc}`. `loadRow` decodes it into
`sync.FieldClocks`, `Merge` compares each field (the state group against the newer of its two clocks), stamps applied
fields with the mutation's HLC, and returns the table; `insertRow`/`updateRow` write it back. An insert stamps every
column, because a default taken at insert time was written then; a row with no record (written by a non-merging path)
falls back to the row clock.

**Pros**
- Atomic with the row and gone with it — no orphan bookkeeping, no cascade to write.
- One SELECT and one UPDATE touch it, both already there. ~15 lines of store code.
- `Merge` takes a `Row{Fields, HLC, Clocks}` and returns `Clocks`: the `sync` package gains a type and no I/O.
- Small: ~20 fields × ~30 bytes per row, on tables that already carry the same fields' values.

**Cons**
- **Twenty table definitions carry the column.** It is one line each and a schema edit is a reseed (ADR-018), but it is
  a repeated line, and a new synced table has to remember it.
- Not queryable by SQL. Nothing needs to query "which rows' `state` was written after T" today; if something does, it is
  a side table then.
- `SELECT *` paths (the NFR-4.5 full export) now carry it. It is internal bookkeeping in an export envelope that already
  carries `updated_hlc`; accepted.

### Option B — A side table `field_clocks(entity_table, entity_id, field, hlc)`

**Pros**
- One DDL statement, no per-table line; queryable.

**Cons**
- No FK can cascade generically across twenty tables, so a delete has to clean it by hand, in every delete path.
- Every merge adds a second SELECT and an UPSERT loop per field — more statements in the same transaction for the same
  information.
- The "row predates the record" fallback is harder to see: absence in a side table is indistinguishable from "never
  written".

### Option C — Keep the row-level clock, keep "packed always wins"

**Pros**
- No change.

**Cons**
- Silent loss in both directions: a later deliberate unpack or skip overwritten by a stale pack with no log entry; every
  other offline edit dropped by unrelated later edits. Fails driver 1 and 2 outright.

### Option D — Keep the row-level clock, narrow rule 2 to the spec

**Pros**
- Matches §6's text; a one-line change.

**Cons**
- Removes the compensation without removing the fault: offline packing starts losing to container assignments and
  traveler changes. Worse for the core case than C.

---

## Decision Matrix

| Driver | Weight | A (JSON column) | B (side table) | C (as was) | D (rule only) |
|---|---|---|---|---|---|
| Field-level LWW is true | 5 | 5 — per field, persisted | 5 — same | 0 — row-level | 0 — row-level |
| No silent loss | 4 | 5 — every drop logged, with actor | 5 | 0 | 3 — logged, but the wrong things lose |
| `sync` stays pure, gate meaningful | 3 | 5 — one type, no I/O | 4 — store grows | 5 | 5 |
| Development-phase cost | 2 | 4 — one line × 20 tables, reseed | 3 — cleanup in every delete | 5 | 5 |
| **Total** | | **68** | 63 | 25 | 37 |

---

## Decision

Every synced table carries `field_hlcs`; `Merge(row, m)` decides each field against that field's clock — the state group
against the newer of its two — and rule 2 is exactly the two pairs §6 names: incoming `packed` on a `packing_now` row
applies regardless of HLC, incoming `packing_now` on a `packed` row is dropped regardless of HLC, and any other pair of
states is last-write-wins and logged. `conflict_log` gains `mutation_id` and `actor_user_id`, server-stamped, so the
fields one push lost can be restored together and their author can be told.

## Consequences

**Positive**
- A pack made offline survives any unrelated edit of the same row, and a later deliberate unpack or skip survives a
  stale pack — and when one does lose, the log says which push and whose.
- The log is now complete enough for the two halves that follow on the client: telling the pusher in the push response
  (the `conflicts[]` nobody read) and *Wiederherstellen* from the conflict view (NFR-4.2a's "manual revert";
  `conflict_log.reverted` had existed as a column with no writer).

**Negative / accepted costs**
- A repeated column on twenty tables, and a reseed of every development database (invariant 2).
- Two pushes that both set `packed` with different clocks log the older one as a conflict whose losing and winning
  values are equal. Harmless in the audit; the client surface that follows compares values before it says "your change
  lost".
- `ApplyMutation` now takes the acting user, because the log names the actor (the master partition always had it).

**Neutral**
- `updated_hlc` stays: tombstones are an all-fields decision and remain row-level, and it is the fallback clock for rows
  no merge wrote.

## Revisit Trigger

A query that needs field clocks across rows (e.g. "everything packed after T" for a history view) — that is the side
table's case; or a synced table added without the column, which the schema shape test should catch first.
