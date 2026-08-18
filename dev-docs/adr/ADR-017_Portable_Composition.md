# ADR-017: A Portable Ferien-Vorlage Carries Its Groups Whole

**Status:** Accepted
**Related:** FR-18.2 (template export), FR-18.4/18.5 (import tolerance), FR-27.1 (composable templates), FR-27.7 (preparation tasks), FR-27.4 (a trip follows its groups), NFR-4.11 (the Local Mode backup), invariant 1 (`portable` imports nothing internal)

**Decision Drivers (in priority order):**
1. **A file has to work on an instance that has never heard of it.** FR-18.2's whole promise is a file you can post in a forum and someone else can import. Anything that assumes shared state breaks that.
2. **The Local Mode backup is the only copy** (NFR-4.11). A backup that restores a Ferien-Vorlage as an empty name is worse than a missing feature, because the failure only shows up at the next trip generation.
3. **An import must not edit what it did not create.** Since FR-27.4 a group edit reaches every trip that follows it — an importer that rewrote an existing group would change other people's packing lists.
4. **The format stays readable and hand-writable** (FR-18.1): YAML somebody can type.

---

## Problem — what does `includes:` contain?

`template_includes` is a pair of ids. Ids are meaningless in a file (FR-18.2 strips every instance-specific identifier), so the file has to say something else.

### Considered Options

#### Option A — the groups whole, nested in the document *(accepted)*

```yaml
kind: template
scope: template
name: Fototage
includes:
  - name: Makro Fotografie
    items:
      - name: Kamera
        tasks: ["Akkus laden"]
items:
  - name: Reiseapotheke
```

**Pros**
- The file is **self-contained**: it means the same thing on every instance, which is the only property FR-18.2 actually promises (driver 1).
- The backup restores a working composition rather than a shell (driver 2).
- Hand-writable and obvious: the nesting *is* the composition.
- Import needs no resolution step that can fail halfway.

**Cons**
- **Duplication.** A group in three Vorlagen appears in three files, and in the backup it appears both as its own document and inside each Vorlage that includes it. The backup is bigger than the data.
- Two copies of the same group can disagree — see the identity rule below.

#### Option B — reference by name only (`includes: [Makro Fotografie]`)

**Pros**
- No duplication; the file is tiny and reads like a table of contents.

**Cons**
- **On a fresh instance it imports nothing.** The name resolves to nothing, and the choice is then between an empty group (a lie that survives into every trip generated from it) and rejecting the file (a share link that works only for people who already have your data).
- Fails driver 1 outright, and driver 2 with it.

#### Option C — one file per template, plus a manifest linking them

**Pros**
- No duplication and still self-contained *as a set*.

**Cons**
- A set of files is not shareable in the way FR-18.2 means: it cannot be pasted into a forum post, and one lost file leaves a manifest pointing at nothing.
- Needs an archive format, which the format's readability rule (FR-18.1) exists to avoid.

---

## Decision Matrix

| Driver | Weight | A — groups whole | B — by name | C — file set + manifest |
|---|---|---|---|---|
| Works on an instance that never saw it | 5 | 5 — self-contained | 1 — imports an empty shell | 4 — if every file arrives |
| The backup is the only copy (NFR-4.11) | 5 | 5 — restores a working Vorlage | 1 — restores a name | 3 — one lost file breaks it |
| Import never edits shared data | 4 | 4 — link-not-rewrite rule below | 4 — nothing to rewrite | 4 — same rule |
| Shareable as one artefact (FR-18.1/18.2) | 3 | 5 — one pasteable file | 5 — one file | 1 — needs an archive |
| No duplication | 2 | 1 — a group repeats per Vorlage | 5 — none | 4 — none |
| **Total** | | **83** | **56** | **65** |

---

## The identity rule that follows

With Option A the same group can arrive twice — from its own document and from inside a Vorlage. **The name is a group's identity across instances**, because it is the only field that survives the trip, so the importer:

* **links** to an existing group of that name rather than creating a second one, and
* **never rewrites** its positions from the file.

**The rule belongs to the group, not to where in a file it appears.** A group's own document and a Vorlage's `includes:` entry are the same group, so both go through the same link-or-create step. Applying it to the nested case alone made the result depend on document order — a backup is written in `templateList` order, which in Local Mode comes from IndexedDB keyed by a random id and is re-rolled on every reload, so a Vorlage listed before its group restored *two* groups, the second one included by nothing. The rule is deliberately **not** extended to Ferien-Vorlagen: two of one name are two different plans, and merging them would lose one, so that path keeps its `(import)` suffix.

The second half is the one that matters. The file may be older than the group, may come from a stranger, and the group may be included by other Vorlagen and followed by other people's trips (FR-27.4). Import is not the place to edit shared data. The cost is that an import can silently give you *less* than the file described — a Vorlage linked to your "Makro Fotografie", not the author's — which is the right failure: your data wins over a file you just opened.

## Consequences

* `portable.Document` gains `includes: []Group`, and `Item` gains `tasks: []string`. Both are omit-empty, so every file written before this ADR still parses and still means what it meant.
* Structural rules are enforced **at the file boundary**, on both parsers: includes only on a template document, never on a trip and never on a group (FR-27.1 is two levels, which is what makes cycles impossible), and every included group has a name.
* The client's three export paths — M7's row action, the settings export and the NFR-4.11 backup — go through one `compositionFrom`, so they cannot disagree about what a file contains.
* A group still gets its **own document** in the backup as well as being nested inside the Vorlagen that include it. That redundancy is deliberate: the group is a template in its own right and must survive even if no Vorlage references it.

**Revisit trigger:** a user reporting that an import created a *different* group than they expected because two groups share a name — at that point the format needs a stable identifier that is not the name (a content hash, or an author-scoped slug), and the linking rule above has to be re-decided rather than patched.
