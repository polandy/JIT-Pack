# ADR-018: No DDL migrations during the development phase — one always-current schema vs. a numbered migration chain

**Status:** Accepted (2026-08-19)
**Related:** CLAUDE.md invariant 2 (rewritten by this ADR), ADR-001 (SQLite as the store), `internal/store/schema.sql`,
`PRAGMA user_version`

**Decision Drivers (in priority order):**
1. **Cost per schema change while the schema is still moving.** JIT-Pack averaged roughly two schema changes a week over
   the six weeks before this decision, and the packing concept is still being implemented.
2. **The schema must be readable as one artifact.** Answering "what does `trip_items` look like?" should not require
   replaying twenty-three files in order.
3. **Nothing the user might still want may disappear silently.** Whatever the mechanism, start-up must not destroy a
   database on its own initiative.
4. **The decision must be cheap to reverse.** The project ships; the development phase ends.

---

## Considered Options

### Option A — One always-current `schema.sql`, no migrations *(recommended, accepted)*

`internal/store/schema.sql` is the whole schema, embedded and applied to an empty database. A schema change edits that
file. `PRAGMA user_version` holds a fingerprint of the file, so `Open` can tell an up-to-date database from one built
against an older version; an older one is **refused with an instruction** (`rm <path>` and restart, then reseed through
the M2 dev button), never upgraded and never recreated.

**Pros**
- A schema change is an edit, not a new file. Dropping a column is deleting a line rather than SQLite's twelve-step
  table rebuild.
- The schema reads as one document, in a chosen order, with its comments where the columns are.
- The `ALTER TABLE` scar tissue disappears: before this change five tables closed with `, updated_hlc TEXT NOT NULL
  DEFAULT '');` sharing a line with the closing paren, four more carried the same column appended mid-list, eight table
  names were quoted because a rebuild had requoted them, and `users` had three columns and a stranded `CHECK` appended
  after `created_at`.
- Four of the twenty-three migrations (013, 014, 015, 018) existed **only** because an earlier file could not be edited.
  They retired features and left the schema no better than a one-line edit would have.
- The debt invariant 2 previously blessed — dead schema kept because it cannot be removed — becomes a choice rather than
  a rule. (This PR still keeps `outbound_packed` and the `repack` status; removing them changes the sync contract and is
  a separate change, now unblocked.)

**Cons**
- **Every schema change destroys every existing database.** There is no upgrade path, by construction.
- **Data-transformation tests lose their subject.** Four tests staged a database at the level *before* a migration and
  asserted what the migration did to real rows (019's packing-record backfill, 021's year derivation, 022's
  category-to-tag rename and its collision handling). Their behaviour no longer exists to test.
- The habit has to be unlearned again at 1.0, and forgetting means shipping a release nobody can upgrade to.

### Option B — Keep the numbered migration chain

The mechanism as it stood: `migrations/NNN_*.sql`, applied in lexical order, `PRAGMA user_version` as the applied level,
applied files never edited.

**Pros**
- Any database from any past version reaches the current schema.
- Data transformations are expressible and testable against real rows.
- Nothing to remember at 1.0 — the mechanism is already the right one.

**Cons**
- Every change costs a file, and in SQLite every *destructive* change costs a table rebuild that must carry every column
  the table has grown since. One such rebuild already shipped a defect: the first draft of migration 005 was modelled on
  004 and silently dropped `trips.updated_hlc`, which broke every master pull of a trip.
- The schema is not readable anywhere. It has to be reconstructed, or dumped from a running database.
- Retired features leave columns behind permanently.

### Option C — Squash the chain into `001_schema.sql` and keep the mechanism

Collapse the twenty-three files into one and carry on numbering from 002.

**Pros**
- Readable schema; mechanism intact; future upgrades still possible.

**Cons**
- Buys the readability once and then re-accumulates at the same rate — after six more weeks the chain is a dozen files
  again.
- Does nothing about the per-change cost, which is the actual complaint.
- Old databases still cannot be upgraded across the squash point, so it carries Option A's incompatibility *and* Option
  B's per-change cost.

---

## Decision Matrix

Scores 1–5, higher is better.

| Driver | Weight | A — schema.sql | B — keep chain | C — squash |
|---|---|---|---|---|
| Cost per schema change | 5 | **5** — edit a line | 2 — new file, rebuild dance | 2 — unchanged |
| Schema readable as one artifact | 4 | **5** — it is the artifact | 1 — must be reconstructed | 4 — until it re-accumulates |
| Nothing destroyed silently | 5 | **5** — refuses, names the file | **5** — upgrades in place | **5** |
| Cheap to reverse | 3 | 4 — `schema.sql` becomes `001_`, resume at `002` | 5 — nothing to reverse | 4 |
| Upgradability of existing databases | 2 | 1 — none, by design | **5** | 2 |
| **Total** | | **84** | 64 | 67 |

Upgradability carries weight 2 deliberately: the only tagged release is v0.1.0 (2026-07-10, eleven migrations behind),
and the only known deployment is the maintainer's own test instance, whose data is reproducible from the dev seed in one
tap. That weight is exactly what the revisit trigger changes.

---

## Decision

`internal/store/schema.sql` is the single, always-current schema. `Open` applies it to an empty database and stamps a
fingerprint of the file into `PRAGMA user_version`; a database carrying any other value — including a migration-era
`user_version`, and including `0` when the file already has tables — is refused with `ErrSchemaStale` and an error
naming the database path and the two steps to start over. Nothing is deleted, recreated or upgraded on start-up.

## Consequences

**Positive**
- A schema change is one edit and one `make ci`.
- `schema.sql` is a document; the sections and comments survive rather than being scattered across a chain.
- The store's test template (PR #110) gets cheaper again: applying one schema is faster than replaying twenty-three
  files even before the copy.

**Negative / accepted costs**
- **Every schema change requires deleting every development database**, including the maintainer's `:3000` instance.
  Reseeding is the M2 dev-seed button, which the standing rule already keeps current.
- The four data-transformation tests listed above are gone. What survived as *schema* assertions was kept and renamed
  (`internal/store/schema_shape_test.go`, `TestSchema_ItemNameIsUniqueOnItsOwn_FR16_3`); what was genuinely about a
  transformation was not replaced, because the transformation no longer exists.
- Anyone running v0.1.0 cannot upgrade. They could not upgrade across most of the chain either, but this makes it
  definitive.

**Neutral**
- Local Mode is untouched. The client's IndexedDB keeps its own `DB_VERSION` / `onupgradeneeded` path in
  `client/src/local/persistence.ts`, and that is where the only irreplaceable user data lives.
- The equivalence of `schema.sql` to the retired chain was proved before the chain was deleted: a temporary test built
  one database from the twenty-three migrations and another from `schema.sql`, then compared columns, types, defaults,
  nullability, primary keys, foreign keys with their delete actions, index origins and uniqueness across every table,
  plus the view. Identical. The test was mutation-proved (adding one column to `schema.sql` made it fail) and then
  removed with the migrations it compared against.

## Revisit Trigger

**The first release tagged for anyone but the maintainer** — concretely, the first `v*` tag published after the packing
concept's implementation closes, or the first time a second person runs an instance holding data they did not seed
themselves. At that point `schema.sql` becomes `migrations/001_schema.sql`, numbering resumes at `002`, and invariant 2
reverts to its previous text. The loader is roughly twenty lines; this ADR is the record that it was deliberate, not
forgotten.
