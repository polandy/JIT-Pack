# ADR-015: The Local Mode Backup Is One Multi-Document YAML File, Not One File Per Trip

**Status:** Accepted
**Related:** ADR-008 (generation and import run client-side), ADR-010 (import stays dependency-free), FR-18.2/18.3
(portable export), FR-18.4 (round-trip import), FR-19.5 (migration to a server), FR-19.6 (the G-2 storage detail),
NFR-4.3 (dependency footprint), NFR-4.11 (local storage durability)

**Decision Drivers (in priority order):**
1. **The backup has to actually happen.** In Local Mode the device holds the only copy (NFR-4.11), so the cost of
   *performing* a backup decides whether there is one at all.
2. **A backup must be restorable by this app.** A file the product cannot read back is not a backup, whatever it
   contains.
3. **Dependency footprint (NFR-4.3)** — this ships to the browser, and Local Mode has no server to offload anything
   onto.
4. Format legibility: the portable YAML shape is a documented, hand-editable, cross-instance format (FR-18.1), and
   staying inside it is worth more than convenience.

---

## Considered Options

### Option A — One multi-document YAML file *(recommended, accepted)*

`buildBackup` serializes every template and every trip with the existing FR-18.2/18.3 serializers and joins them with
YAML's own `---` document separator. `parsePortableAll` reads such a file back, and M18 grows a restore branch that
lists the documents and imports them together (`commitPortableRestore`).

**Pros**
- One tap produces the whole device. Nobody has to remember which trips and templates exist.
- No new dependency and no new format: multi-document streams are plain YAML, and `yaml` (already present) parses them.
- Each document is still exactly the FR-18.2/18.3 shape, so a text editor, another instance, or a future tool sees
  documents it already understands.
- Partial damage is survivable: an unreadable document is reported in its place and the intact ones still import.

**Cons**
- **The server's `/api/v1/templates/import` and `/api/v1/trips/import` endpoints take one document and reject this
  file.** Restoring or migrating goes through the app, not through `curl` — FR-19.5's migration path is now "open the
  app against the server and import there".
- It is not a *complete* backup: the portable shape carries items by name, so master items nobody uses, item images,
  tags and dependencies do not travel. NFR-4.11 already accepted that when it named the portable export as the backup,
  but a file called "backup" invites the assumption.
- Matching on restore has to run per document rather than once, because the same master item is named by a template and
  by every trip that uses it.

### Option B — Keep the per-document export (status quo before this PR)

M17's export pickers, one trip or one template at a time, with the G-2 detail linking there.

**Pros**
- Zero new code, and every file is importable by the server endpoints as-is.
- The user chooses exactly what leaves the device.

**Cons**
- **It is not a backup anybody performs.** Backing up twelve trips and nine templates is twenty-one deliberate acts,
  repeated whenever anything changes; the realistic outcome is no backup, which is precisely the risk NFR-4.11 exists
  for.
- FR-19.6 asks for a *one-tap* export in the storage detail; a link to a screen with two pickers is not that.

### Option C — A ZIP archive of one file per document

**Pros**
- Familiar container; each entry stays individually server-importable.
- Room to carry item images later.

**Cons**
- Needs a zip library in the browser for a once-a-month operation — the same footprint argument that decided ADR-010,
  and Local Mode cannot lean on a server for it.
- Opaque to a text editor, which is most of what makes the portable format useful when something has gone wrong.
- Writing *and* reading zip has to be built before the first restore works.

---

## Decision Matrix

| Driver | Weight | A — multi-doc YAML | B — per-document | C — ZIP |
|---|---|---|---|---|
| The backup actually happens | 5 | 5 — one tap, whole device | 1 — twenty-one deliberate acts | 5 — one tap |
| Restorable by this app | 4 | 4 — restore path built here, per-document matching | 5 — already worked | 2 — needs a reader first |
| Dependency footprint (NFR-4.3) | 4 | 5 — none added | 5 — none added | 1 — a zip library in the bundle |
| Format legibility | 2 | 5 — still plain portable YAML | 5 — same | 2 — opaque container |
| **Total** | | **71** | **51** | **45** |

---

## Decision

The Local Mode backup is a single multi-document YAML file, `jitpack-backup-<date>.yaml`, holding every template and
every trip of the device with packing progress included. The app's own importer (FR-18.4) reads it, listing its
documents and importing them together, matching master items **per document as each is imported**. The server's
single-document import endpoints are deliberately left as they are.

## Consequences

**Positive**
- FR-19.6's one-tap backup exists and covers the device rather than one row of it.
- The restore is the ordinary M18 screen, so there is one import path and not a second "restore" mechanism to keep
  correct.
- Backup and restore both work with no server, which is the mode they exist for (ADR-008/ADR-009).

**Negative / accepted costs**
- A backup file cannot be posted to the server's import endpoints; `docs/backup.md` says so explicitly rather than
  leaving it to be discovered.
- The file is a data backup, not a device image: unused master items, images, tags and dependencies stay behind.
- Per-document matching is more work than matching once, and it is the behaviour a test has to pin — matching up front
  would create one copy of a shared item per mention.

**Neutral**
- The server keeps its single-document contract, so nothing about cross-instance sharing of one template changes
  (FR-18.1).
- The file is written as `application/yaml` (RFC 9512) with a `.yaml` extension, and M18's picker also accepts the
  plain-text types a mobile file manager hands a YAML file back as — what decides the media type here is whether the
  round trip works on the device, not correctness in the abstract.

## Amendment 2026-08-21 — the file carries the FR-27.4 refresh state

The decision above is unchanged; what a document contains grew. A trip document
now also carries **how the trip follows its groups**: `follows:` (the templates
it follows), `generated:` (the generation ledger) and `applied_changes:` (the
log), all by name, all optional.

Why it was owed: a restored device kept every trip and every Vorlage and then
started following them from zero. The ledger is what tells a group's change
from the user's own edit, so without it the new device re-asked every FR-27.4
proposal the user had already answered and offered every position they had
refused as if it were new — a restore that looks complete and quietly undoes a
month of decisions.

Why it did not need a different format: none of the three needs anything the
portable shape cannot express. Their references are a template, a master item
and a traveler, and this format already carries all three **by name** — so the
revisit trigger below (a) did *not* fire. What the restore does instead of
copying ids is re-key them: a ledger entry's id is derived from (trip, master
item, traveler), and its row is found by that same identity rather than by
name, so a row the user renamed still matches.

The accepted costs, both stated in FR-18.4:

- A reference this device cannot resolve is **dropped**, not restored
  half-resolved. A source pointing at no template would never propose anything;
  a ledger entry keyed on the wrong position would detach one nobody asked to
  detach. The log is the exception — its group name is denormalised precisely
  so the record outlives the group.
- These sections make a **restore** correct, not a cross-instance clone. The
  server's single-document import endpoints ignore them as unknown fields
  (FR-18.5), which is the same asymmetry the decision above already accepted.

An older backup file has none of the three sections. That is not an error: it
restores as it always did and the trip starts following its groups afresh —
today's behaviour, now the *documented* fallback, with a test on it.

## Revisit Trigger

Either of: (a) a restore has to carry something the portable shape cannot express — item images, tag assignments or
dependencies — at which point a container format is back on the table and Option C is the starting point; or (b)
`/api/v1/*/import` gains a multi-document mode, which would make `curl`-based restore possible and reopen where the
restore path should live.
