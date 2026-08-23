# ADR-024: A portable file restores what it saved — status, marks and tags — vs. staying a share format

**Status:** Accepted
**Related:** ADR-015 (the device backup), ADR-017 (a group's name is its identity), FR-18.2–18.5, FR-2.2, FR-24.1/24.2, FR-28.1, NFR-4.11, `internal/portable`, `client/src/domain/portable.ts`

**Decision Drivers (in priority order):**
1. **NFR-4.11 — in Local Mode the backup is the only copy.** What a restore cannot reconstruct is gone for good, and that outranks every other consideration here.
2. **FR-18.5 — a file survives the version that wrote it.** Every file already in the wild must keep importing exactly as it does today.
3. **FR-18.2 — the same file is the share format.** One shape serves both jobs; a second document type would be two things to keep correct.
4. **CODING_PRINCIPLES §4a and invariant 2** — no new concept where an existing one carries the meaning, and no schema change.

---

## Considered Options

### Option A — the file carries what a device needs to be rebuilt *(recommended, accepted)*

A trip document gains `status`. A position gains `tags` (ordered) and, on a trip row, `icon` and `from_inventory`. `commitPortableImport` honours the status when present, and rebuilds the master item of a row that declares itself inventory-backed, with its mark and its tags.

**Pros**
- An archived trip restores archived, so the historical quantities FR-3.14 reads survive the round trip.
- A master item that only a trip referenced — no template — comes back, with the mark and the tags it was filed under. It was silently lost before.
- No schema change: `trips.status`, `items.icon`, `tags` and `item_tags` all exist. Invariant 2 is untouched.
- The tag order *is* `item_tags.position`, so an ordered list carries the primary tag (FR-24.2) without a second field to say which one it is.

**Cons**
- **A shared file now carries a status too**, so a trip somebody sends you can arrive `archived` or `active` rather than in your planning list. FR-18.4 chose `planning` deliberately, and this reverses that for every file, not only for backups.
- `from_inventory` is a new concept in the format — a fourth thing a position can say about itself.
- The restore's landing segment stops being a constant, so M18 has to derive it or send the user to an empty list.

### Option B — a backup-only dialect

Keep the share format exactly as it is, and give `buildBackup` a second document kind that carries the extra state.

**Pros**
- FR-18.4's promise for a shared file is untouched; nothing a stranger sends you can change your trip's lifecycle.
- The new fields are confined to the file that needs them.

**Cons**
- Two document types to validate, version and keep in step across **two** implementations (Go and TS). The drift would be invisible until a restore.
- The backup would stop being *"the same shape the importer reads"*, which is the sentence ADR-015 was built on and the reason a restore is the ordinary M18 path rather than a second one.
- A user who exports one trip and re-imports it still loses its status — the same defect, one screen over.

### Option C — write the fields, honour them only in the restore path

One format, but `commitPortableImport` ignores `status` unless it was reached through the whole-device restore.

**Pros**
- Keeps FR-18.4 for shared files and fixes the backup.

**Cons**
- The same file behaves differently depending on which button opened it, and nothing on screen says so. That is the kind of rule nobody can predict and a bug report can never describe.
- Two paths through one importer, only one of them exercised by most tests.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| The backup is the only copy (NFR-4.11) | 5 | 5 — everything reconstructs | 5 — everything reconstructs | 5 — everything reconstructs |
| Old files keep importing (FR-18.5) | 4 | 5 — absent means what it always meant | 5 — untouched | 5 — untouched |
| One shape for both jobs (FR-18.2) | 4 | 5 — one document type | 1 — two, in two languages | 3 — one type, two behaviours |
| No new concepts / no schema change | 3 | 4 — one new field, `from_inventory` | 2 — a whole document kind | 4 — no new field beyond A's |
| Predictable to the user | 3 | 3 — a shared file can carry a status | 5 — a shared trip is always a plan | 1 — same file, two outcomes |
| **Total** | | **85** | **69** | **72** |

---

## Decision

One format. A trip document carries `status`; a position carries ordered `tags`, and a trip row additionally `icon` and `from_inventory`. The importer honours all of them, whichever screen opened the file, and falls back to today's behaviour — `planning`, no tags, ad-hoc rows — for every field a file does not carry.

Two rules make the fields safe rather than merely present:

- **An unknown status is dropped, not refused.** Both implementations normalise it away, because the schema's CHECK would refuse the value and a push that fails a constraint parks the whole mutation and reports a database error where a file problem happened. Refusing the *document* was considered and rejected: that is the `scope` stance, and the analogy does not hold — a group imported as a Ferien-Vorlage is structurally wrong and corrupts the composition, while an unreadable status is one field with a correct fallback. The closer precedent is `Quantity`, which folds a legacy formula string rather than failing the file. Losing a trip out of a restore to save its lifecycle state is the wrong trade.
- **`from_inventory` is what separates the two kinds of trip row.** Without it a row that came from the inventory and one the user typed on the trip are both just a name, and a restore must either invent inventory nobody filed or drop inventory they did. Creating a master item for *every* trip row was the first idea and is the second of those errors.

## Consequences

**Positive**
- A device of archived history restores as archived history.
- A master item no template mentions survives, with its mark and its tags in position order.
- A tag is linked by name and created only when the device has never heard of it — the same identity rule groups follow (ADR-017), and `tags.name` is UNIQUE, so a duplicate is not merely untidy but impossible.

**Negative / accepted costs**
- **A shared trip file can change your trip's lifecycle.** Accepted by the owner on 2026-08-23 over the two-path alternatives, on the grounds that one predictable rule beats a mode nothing on screen explains.
- `from_inventory` is a fourth thing a position says about itself, and a hand-written file that omits it gets ad-hoc rows.
- Every writer must pass the two resolvers (`masterItem`, `tagsOf`). They are **required arguments**, not optional ones, because a caller that forgets writes a file that looks complete and restores incomplete — invisible until somebody needs the backup. A test can only watch the call sites that exist; the compiler watches every future one. That was not theoretical: making them required immediately surfaced a **fourth** writer nobody had wired (the template list's export), and a mutation had already shown that three hand-assembled copies returning no tags left the entire unit suite and the entire M18 e2e unit green. They come from one source, `masterStore.portableResolvers()`, which has its own driving case.

**Neutral**
- No schema change; every column already existed.
- The Go and TS implementations diverge in one place *by design*: the FR-27.4 sections (`follows`, `generated`, `applied_changes`) remain client-only, unchanged by this ADR.

## Revisit Trigger

**When a portable file is first offered for publication rather than for sharing** — FR-1.6's publish/fork model, which is parked. A file anyone can fetch is a file whose status field acts on a stranger's device without them choosing it, and the accepted cost above was weighed for a file one person hands to another. At that point Option C's per-path rule becomes worth its unpredictability, or the publish flow strips the status on the way out.
