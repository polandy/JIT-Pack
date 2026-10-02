# ADR-090: The large developer documents are directories — one file per section, the ledgers one per period

**Status:** Accepted
**Related:** `dev-docs/prd-addendum/`, `dev-docs/ui-spec/`, `dev-docs/ui-test-spec/`, `dev-docs/implementation-log/`,
`dev-docs/e2e-ledger/`, `scripts/log-index-gate.mjs`, `scripts/case-id-gate.mjs`, `scripts/spec-width-gate.mjs` (T-12),
`CLAUDE.md` § Reading budget

**Decision Drivers (in priority order):**
1. **What one task has to read.** The work here is done by agents, and every line one reads is paid for, on every
   turn after it. The PRD addendum was 634 KB, the UI spec 347 KB, the UI test spec 468 KB, the e2e ledger 439 KB and
   the implementation log 1.27 MB — its index alone 89 KB. A change to one screen opened all of the first three.
2. **The ids stay where they are.** FR numbers, § numbers, M- and G-numbers and E2E case ids are how every other file,
   commit and test title points into these documents; none of them may change.
3. **A gate holds the structure.** Each document already has a gate for the claims it makes about itself (the index,
   the width, the case ids); a new structure must not leave one of those claims unchecked.
4. **History stays traceable.** The ledgers are history, and `git blame` on an entry is how a decision is traced back
   to the work that made it.

---

## Considered Options

### Option A — keep each document one file, and read it better

The files stay; the reading discipline changes — grep for the id, read by offset, never the whole file.

**Pros**
- No move, no changed path, no gate change; `git blame` untouched.

**Cons**
- The discipline is all there is. A read without an offset — the default of every tool — returns the first 2 000
  lines of whichever section happens to come first, and an index of 89 KB is itself too large to read.
- Nothing makes a forgotten offset visible.

### Option B — one file per section for the specs, one per week or month for the ledgers *(accepted)*

The addendum becomes one file per numbered section (`3.29-planner.md`, `nfr.md`), the UI spec and the UI test spec one
file per screen (`M28-ideen.md`) plus the global patterns, the traceability matrix and the journeys. Each directory's
`README.md` carries the preamble and names every file. The implementation log becomes one file per week, the e2e
ledger's narratives one per month beside its `status.md`; **each dated file opens with the index of its own
sections**, and the README says how to search the index lines across them.

**Pros**
- A change to M28 reads `ui-spec/M28-ideen.md` — 17 KB, not 347 KB — and the default read of any one file is one
  section.
- The newest ledger file is small, so "what happened recently" is one short read.
- Every id stays valid; a reader finds a file by its number with `ls`.

**Cons**
- Five paths change: every pointer to the old files is rewritten in the same change, and a reader of an old commit
  meets the old names.
- `git blame` on a moved ledger line names the move; `git blame -C -C` follows it to the commit that wrote it.
- Two kinds of index: a dated file's own, and a README's file table.

### Option C — one file per requirement and per ledger entry

Every FR, case and log entry in a file of its own.

**Pros**
- The smallest possible read.

**Cons**
- Thousands of files; a section's requirements are read together far more often than alone, and would then be many
  reads.
- The ids live in headings and bullets, not file names — splitting them out is a rewrite of the documents, not a move.

---

## Decision Matrix

| Driver | Weight | A — one file, read better | B — per section / per period | C — per requirement |
|---|---|---|---|---|
| What one task has to read | 4 | 2 — discipline only | 5 | 4 — many small reads |
| The ids stay where they are | 3 | 5 | 5 | 2 — documents rewritten |
| A gate holds the structure | 2 | 5 | 4 — gates extended | 2 — new gates needed |
| History stays traceable | 1 | 5 | 3 — `blame -C` | 2 |
| **Total** | | **36** | **46** | 28 |

---

## Decision

The five documents are directories. `log-index-gate` checks every dated ledger file's own index and that each
directory's README links every file beside it; `case-id-gate` reads the UI test spec's files as one text;
`spec-width-gate` exempts the two ledger directories as it exempted the two files. Nothing inside a section was
rewritten: every content line of the old files is in exactly one new file.

## Consequences

**Positive**
- A task opens the sections it touches. Measured on this split: the M28 slice of the three specs is 57 KB, where
  the three files were 1.45 MB.
- A new screen is a new file plus a README row, and the gate refuses the file without the row.

**Negative / accepted costs**
- `git blame` on a ledger line needs `-C -C` to get past the move.
- An agent or a person who remembers the old file names finds them gone; `dev-docs/README.md` and `CLAUDE.md` name
  the new layout, and the ledgers' own historical text still says `implementation-log.md` where it was true.
- The week boundary of the log is a convention, not a gate: an entry appended to last week's file is still indexed
  and still found, only filed a week early.

**Neutral**
- `Sync_API_Spec_v1.3.md` (93 KB) stays one file; it is read far less often than the three split here.

## Revisit Trigger

A single section file passes 150 KB (3.25 is 123 KB today) — then that section splits by its own FR groups — or the
week files of the log pass 60, at which point the README's file table stops being one screen and a per-month
grouping of it is due.
