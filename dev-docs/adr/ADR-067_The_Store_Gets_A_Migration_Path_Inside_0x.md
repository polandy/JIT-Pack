# ADR-067: The store gets a migration path inside the 0.x line — a baseline plus an additive chain, over waiting for 1.0

**Status:** Accepted (2026-09-20), **built 2026-09-21** with the amendment below
**Related:** ADR-018 (whose revisit trigger this fires), CLAUDE.md invariant 2, `internal/store/schema.sql`,
`internal/store/store.go` (`ensureSchema`, `schemaFingerprint`, `ErrSchemaStale`), `docs/upgrades.md`, NFR-4.11

**Decision Drivers (in priority order):**
1. **Nothing an instance holds may be lost to an upgrade.** The family instance now carries 213 items, 34 trips and
   2131 trip rows across two accounts, plus reference photos and packing history. None of it is reproducible from a
   seed, and the portable export deliberately carries only the lists — not progress, not images, not a trip's link to
   the templates it came from (`docs/upgrades.md`).
2. **An upgrade must not need the maintainer at a terminal.** v0.14.0 → v0.15.0 was carried across by hand: `ALTER
   TABLE` for three columns, `CREATE TABLE` for `shopping_entries`, then `PRAGMA user_version` stamped with the new
   fingerprint, rehearsed on a copy first. It worked twice. It is not a procedure anyone should have to repeat, and it
   is one typo away from a database that claims a schema it does not have — the fingerprint is stamped, never verified
   against the columns.
3. **This cannot wait for a major.** ADR-018 tied the reversal to "the first release meant for anyone but the
   maintainer", and read that as roughly 1.0. The condition arrived first: an instance other people depend on is
   running now, while 0.x still ships a schema change most weeks. 1.0 is not near, and the gap between the two is
   exactly the window in which data gets lost.
4. **`schema.sql` must stay readable as one artifact.** That was ADR-018's driver 2 and the finding that survives it
   best: answering "what does `trip_items` look like?" should not mean replaying a chain, and the `ALTER TABLE` scar
   tissue that a chain accumulates is already visible in the live database, where the columns added by hand sit
   appended after `updated_hlc` instead of where `schema.sql` declares them.

---

## Considered Options

### Option A — `schema.sql` stays the baseline; an additive chain upgrades existing databases *(recommended, accepted)*

`internal/store/schema.sql` remains the single readable schema and the thing a *fresh* database is built from.
Alongside it, `internal/store/migrations/NNN_*.sql` holds one file per schema change, applied in order to a database
that is behind. `PRAGMA user_version` goes back to naming a level rather than a fingerprint. A CI gate builds one
database from `schema.sql` and another by replaying the chain from the oldest supported baseline, then compares
columns, types, defaults, nullability, keys and indexes — the same comparison ADR-018 used to prove `schema.sql`
equivalent to the chain it replaced, kept permanently this time.

**Pros**
- Both properties at once: the schema reads as one document, and an existing database reaches it.
- The gate makes the duplication safe. Two sources of truth that *must* agree are a defect generator; two that are
  *proved* to agree each CI run are a convenience.
- The comparison is not speculative work — it was written, mutation-proved and then deleted once (ADR-018,
  Consequences/Neutral). Restoring it is recovering a known-good test.
- A data transformation gets somewhere to live again, which is what the hand migration had no room for.

**Cons**
- **Every schema change costs two edits**, the `schema.sql` line and the migration file, and a reviewer has to check
  they say the same thing. The gate catches disagreement, but only after the fact.
- The gate is the only thing standing between this and silent drift. If it is ever skipped or weakened, the project has
  Option B's duplication with none of its safety.
- SQLite still has no `DROP COLUMN` worth the name, so a *destructive* change costs a table rebuild in the migration
  file even though it is a deleted line in `schema.sql` — the asymmetry ADR-018 complained about does not go away, it
  just stops being the only cost.

### Option B — Revert exactly as ADR-018 planned: `schema.sql` becomes `migrations/001_schema.sql`

The reversal ADR-018 wrote down: the baseline becomes the chain's first file, numbering resumes at `002`, and the
readable artifact stops existing.

**Pros**
- One source of truth, no gate, no duplication. The mechanism is the conventional one and needs no explaining.
- It is the cheapest thing to build — ADR-018 estimates the loader at roughly twenty lines.
- Data transformations are expressible and testable against real rows, with no caveat.

**Cons**
- **Gives back driver 4 entirely.** After six months the schema is a few dozen files again and the only way to read it
  is to dump a running database — which is precisely the complaint that produced ADR-018.
- The scar tissue returns permanently: retired features leave columns behind, and quoting and column order drift with
  every rebuild.
- ADR-018's own evidence against it stands. Four of twenty-three migrations existed only because a file could not be
  edited, and one shipped a defect (migration 005 silently dropped `trips.updated_hlc`, breaking every master pull of a
  trip).

### Option C — Keep hand-migrating until 1.0

The status quo since 2026-09-18: when a release changes `schema.sql`, the maintainer works out the `ALTER`s, rehearses
them on a copy of the live database, applies them and stamps the new fingerprint.

**Pros**
- Zero code. It has carried two releases across without losing a row.
- Each migration is written with the actual database in front of you, so a surprise in the data is visible rather than
  assumed away.

**Cons**
- **The fingerprint is a claim, not a check.** `ensureSchema` compares `user_version` and nothing else, so a stamp
  applied after an incomplete `ALTER` produces a database the server happily opens and the code then queries for
  columns that are not there. Only a hand-written structural comparison catches it, and that is not part of the
  procedure.
- It does not scale past one instance, and it scales badly past one maintainer: it needs `sqlite3` on the host, a
  stopped container and the release diff, at whatever hour the release lands.
- It is silently load-bearing. Nothing in the repository says the live instance is being carried this way, so the next
  schema change assumes the documented behaviour — delete and reseed — and the procedure exists only in a shell
  history.

### Option D — Declare the portable export the upgrade path

Make `docs/upgrades.md`'s routine the official mechanism: export YAML before every pull, import into an empty database
after.

**Pros**
- Already built, already documented, and version-independent by construction.
- Survives arbitrarily large schema changes, including ones no migration could express.

**Cons**
- **It loses exactly what a household accumulates**: packing progress, reference photos, avatars, notification
  preferences, archived trips and the analytics behind quantity suggestions, and a trip's link to its templates
  (`docs/upgrades.md`, "What the portable exports do not carry").
- It is a reset dressed as an upgrade, so it fails driver 1 on its own terms.
- Everyone re-enables push and re-uploads photos once per release. The cost lands on the people who did not choose the
  release.

---

## Decision Matrix

Scores 1–5, higher is better.

| Driver | Weight | A — baseline + chain | B — full revert | C — hand-migrate | D — export/import |
|---|---|---|---|---|---|
| Nothing lost to an upgrade | 5 | **5** — carried in place | **5** — carried in place | 3 — carried, by hand, unverified | 1 — progress, photos and links gone |
| No maintainer at a terminal | 5 | **5** — the server does it | **5** — the server does it | 1 — a person per release | 2 — a person plus re-uploads |
| Available inside 0.x | 4 | **5** — nothing waits on 1.0 | **5** | 4 — available, but it is the problem | **5** |
| `schema.sql` readable as one artifact | 4 | **5** — it stays the baseline | 1 — reconstructed from a chain | **5** — untouched | **5** |
| Cost to build | 2 | 3 — loader plus the equivalence gate | **5** — roughly twenty lines | **5** — nothing | **5** |
| **Total** | | **96** | 84 | 66 | 65 |

Driver 4 carries weight 4 rather than ADR-018's 4-of-its-own-scale for the same reason it did there: it is the property
the project spends time in daily. Cost to build carries 2 because the equivalence gate is recovered rather than
invented.

---

## Decision

`internal/store/schema.sql` stays the single readable schema and the source for a fresh database. An additive
`internal/store/migrations/NNN_*.sql` chain carries an existing database forward, `PRAGMA user_version` names the
applied level again, and a CI gate proves after every change that replaying the chain and applying `schema.sql` produce
the same database. This happens inside the 0.x line — it is not gated on 1.0, on a major, or on the packing concept
closing.

**The mechanism is not built yet.** Until it is, ADR-018 describes what the code does: a database at any other
fingerprint is refused with `ErrSchemaStale`, and the live instance is carried across by hand. That interim procedure
is written down in `dev-docs/implementation-log.md` so it stops being tribal knowledge.

## Consequences

**Positive**
- Built as of 2026-09-21: the chain is `internal/store/migrations/NNN_*.sql`, the equivalence proof is
  `TestSchemaChain_EndsWhereSchemaSQLDoes` — a **test**, not a shell gate, so it runs inside `make ci` and
  the CI `go` job with the product's own SQLite driver and needs no new wiring. Its own mutation proof
  (`TestSchemaChain_TheComparisonCatchesDrift`) breaks the chain three ways and requires the comparison to
  report each.
- An instance upgrades by pulling an image, which is what everyone already assumes a version bump does.
- A change needing a backfill becomes expressible again. The four data-transformation tests ADR-018 retired describe a
  category of test that can exist once more.
- `docs/upgrades.md` gets to stop recommending an export-and-reset routine as the normal path.

**Negative / accepted costs**
- Two edits per schema change, and a reviewer who has to read both. This is the price of driver 4 and it is charged on
  every schema change, not once.
- The oldest supported baseline is a commitment: once the chain starts, a database from before it has no path except
  the export routine, and that boundary has to be stated in `docs/upgrades.md` rather than discovered.
- `.claude/settings.json` denies creating `internal/store/migrations/**`, and `.github/hooks/jitpack.json` guards the
  same path for Copilot. Both are correct until the mechanism lands and must be lifted *with* it, in the same PR, not
  before.
- Until the loader exists, every release that touches `schema.sql` still costs a hand migration on the live instance —
  this ADR does not make the next one cheaper.

**Neutral**
- The client's Local Mode is untouched, as in ADR-018: IndexedDB keeps its own `DB_VERSION` / `onupgradeneeded` path in
  `client/src/local/persistence.ts`.
- Nothing here changes what `ErrSchemaStale` says or when it fires. A database *ahead* of the binary, or off the chain
  entirely, is still refused rather than guessed at.

## Amendment, 2026-09-21: the level does not live in `PRAGMA user_version`

Option A said *„`PRAGMA user_version` goes back to naming a level rather than a fingerprint."* Building it
showed that it cannot, safely, and the owner accepted the correction before any code was written.

**The reason is that the field holds two vocabularies at once.** `schemaFingerprint()` is
`sha256(schema.sql)` truncated to 31 bits, so a fingerprint is *any* value in 1…2³¹-1 — including 1…23,
which are exactly the levels the migration era left behind (its chain ran `001_schema.sql` …
`023_planning_refresh.sql`; counted off the deleted files, not off the backlog, which names only the last
two that were open at the time). A loader reading that one field has no way to tell a level from a hash,
and the failure is silent in the worst direction: a database twenty-three steps behind read as current, or
a current one refused.

**So the level gets its own place.** `schema_meta(level, baseline)` — one row, never synced — is
authoritative, and `user_version` is kept as a readable mirror that nothing decides on. The *presence* of
that table is what says a database belongs to the chain era at all, which is a fact no hash can imitate.
A database without it is placed by matching `user_version` against a **list of known release
fingerprints** (`baselineLevels`, today one entry: the schema v0.15.0 and v0.16.0 share, byte for byte, → level 0),
and anything not on the list is refused.
Two guards keep the vocabularies apart for good: values at or below `lastMigrationEraLevel` are refused
before the list is even consulted, and a test refuses a future baseline whose fingerprint would land in
that range.

**The baseline fingerprint is a literal**, proven against `internal/store/testdata/schema-v0.16.0.sql` — which is also
v0.15.0's, the two being identical
rather than recomputed at run time. A recomputation would follow whatever the hash function does next, and
the bridge would break on the one database that cannot be rebuilt.

**What this costs:** one more table in the schema, and a list that has to be extended each time a release
becomes a supported starting point. What it buys is that no reading of a single integer can ever place a
database wrongly.

## Revisit Trigger

**The equivalence gate failing on a change nobody wrote wrong** — that is, a legitimate schema change the gate cannot
express as agreement between the two artifacts. That is the signal that the duplication has outgrown the proof, and at
that point Option B (the baseline becomes `001_schema.sql`, the readable artifact is given up) is the fallback and this
ADR is superseded.
