# ADR-030: What makes an imported document the same thing — name (and year, for a trip) vs. a database constraint vs. a suffix

**Status:** Accepted
**Related:** FR-18.4 (round-trip import), FR-18.7 (`jitpack-import`), NFR-4.11 / ADR-015 (the device backup), **ADR-017 (a group's identity is its name — its Vorlage exception is superseded here)**, ADR-024 (a restored trip keeps its status), invariant 2 (no migrations in the development phase), invariant 4 (generation runs client-side), invariant 5 (three modes, one artifact), E2E-M18-10

**Decision Drivers (in priority order):**
1. **A restore run twice must not produce two of everything.** Running it again is exactly what someone does when they are not sure the first one worked, and before this the second run built a second copy of every trip — silently, with the first still on screen.
2. **Nothing the user already has may be lost or overwritten.** The trip on the device is theirs; the file is a copy of it, possibly an older one.
3. **The rule has to hold in every mode, offline included.** Local Mode has no server to ask, so the answer cannot come from one.
4. **It must never park the outbox.** A push that violates a database constraint is refused, and a refused mutation stays at the head of the queue — the failure mode found on 2026-08-22, where one constraint stopped every later write on the device.
5. **An import that does nothing must say so.** "Nothing happened" and "it silently failed" look identical on screen.
6. **Two devices may legitimately create trips at the same time.** Whatever identity is chosen must not make ordinary concurrent use a conflict.

---

## Considered Options

### Option A — the year and the name, decided in the client *(recommended, accepted)*

A trip's identity across files and devices is `(year, name)`, compared trimmed and case-folded. `importPortableDocument` looks the incoming document up against the trips the instance holds; if it finds one, it writes nothing at all and reports `outcome: 'duplicate'` naming the trip that is already there. Every surface that imports reports it: M18's restore list marks the document *Schon vorhanden* **before** the button is pressed, the commit raises a toast counting what it left alone, and `jitpack-import` writes one line per document plus a count.

**Pros**

- Driver 1 directly: the second run of a file is a no-op, per document.
- Nothing is written and nothing is overwritten — not the trip, not its rows, not the master items and tags the rows would have needed (driver 2).
- It is a client-side rule in `client/src/domain`, so it holds in Local Mode with no server and in Single-User and Server Mode alike (drivers 3 and 5, invariants 4 and 5).
- No schema change, so no constraint can refuse a push and park the queue (driver 4), and no development database has to be deleted (invariant 2).
- It matches the identity rule the format already uses everywhere else: a group is its name (ADR-017), a tag is its name, an item is its name. A trip needs the year because names repeat across years by design — *Samedan* is a place the family goes back to.
- **Extended to Ferien-Vorlagen after the fact, on the measurement below.** The rule was first written for trips alone, on ADR-017's reasoning that two Vorlagen of one name are two different plans. Importing a real 57-document file twice settled it: the trips held at 33, and the three Vorlagen became six with their includes going 35 → 70. ADR-017's premise was right about a file somebody *shares* and wrong about the file that actually gets re-imported, which is the user's own backup.

**Cons**

- **Two genuinely different trips of one name in one year cannot both be imported.** This is not hypothetical: the family sheet has *Janosch & Andy* twice in 2021. The second has to be renamed in the file, and nothing on screen explains why it did not arrive except the line that says it was already here.
- Identity is derived from mutable, user-facing fields. Rename a trip and the same file imports again as a second copy.
- The check is per instance, not per file: a file whose own two documents collide keeps only the first, which is the same rule applied consistently but is decided by document order.

### Option B — a UNIQUE constraint on `trips(owner_id, year, name)`

Let the database refuse the second one.

**Pros**

- One rule, enforced for every writer including a future one, rather than in each import path.
- Impossible to bypass by writing rows another way.

**Cons**

- **It parks the outbox** (driver 4). A refused mutation is not dropped; it stays queued, and every later write on that device stays behind it. A duplicate trip is a nuisance, a wedged device is not.
- It converts an ordinary concurrent action into a hard failure (driver 6): two members creating *Samedan 2027* on two phones is normal use, and LWW is what the sync design has for that — not an error.
- It cannot be added in the development phase without deleting every existing database (invariant 2), and it would still not help Local Mode, whose enforcement would have to be written a second time in the client anyway (driver 3).
- The user-visible message would be a constraint violation, arriving long after the import, from the sync layer.

### Option C — import it under a suffixed name, as a Ferien-Vorlage used to

`Samedan` becomes `Samedan (import)`, the way a Ferien-Vorlage name collision was handled until this ADR.

**Pros**

- Nothing is ever lost, and the two copies are visible and comparable.
- Consistent with an existing, deliberate decision in the same code path.

**Cons**

- **It does not prevent duplication, it labels it** (driver 1). Restoring a 33-trip backup twice yields 66 trips, 33 of them parenthesised.
- The reason the suffix looked right for a Ferien-Vorlage is that two Vorlagen of one name are two different *plans* the user may well want. That reasoning survives for a file somebody hands you and fails for the file that is actually re-imported — your own backup — which is why the suffix is retired here rather than merely not extended.

### Option D — merge the document into the existing trip

Add the rows the trip does not have; leave the rest alone.

**Pros**

- A backup taken later could top up a trip that was restored earlier and then partly lost.

**Cons**

- Driver 2 at its sharpest: "add what is missing" is indistinguishable from "undo what the user deleted". A row deliberately removed on the device comes back on every restore.
- It needs a per-row identity as well as a per-trip one, and a policy for quantities, statuses and pack counts that differ — the FR-16.3 merge conversation, on a screen that exists to be a restore.
- The one case it serves is served better by importing under a different name and comparing (option C), which the user can do by editing the file.

---

## Decision Matrix

| Driver | Weight | A (year + name, client-side) | B (UNIQUE constraint) | C (suffix) | D (merge) |
|---|---|---|---|---|---|
| A second run adds nothing | 5 | 5 | 5 | 0 | 4 |
| Nothing lost or overwritten | 5 | 5 | 4 — the write is refused, not the file | 5 | 1 |
| Holds in every mode, offline | 4 | 5 | 2 — needs a client rule anyway | 5 | 4 |
| Never parks the outbox | 5 | 5 | 0 | 5 | 5 |
| The user is told | 3 | 5 | 2 — a constraint error, later | 3 | 2 |
| Concurrent creation stays normal | 3 | 5 | 1 | 5 | 3 |
| **Total** | | **125** | **68** | **93** | **86** |

---

## Decision

**A document is a second copy of something this instance already holds when their names match** — plus the year, for a trip, because a family goes back to the same place and only the year tells two *Samedan* trips apart. One function decides it for all three document kinds (`findExistingSubject` in `client/src/domain/portableImport.ts`), before anything is written. An import that finds one adds nothing and returns `outcome: 'duplicate'` naming what was there, and every surface that imports reports it — the M18 restore list before the commit, a toast after it, and one line per document in `jitpack-import` including its `--dry-run`.

Every name comparison is trimmed and case-folded, which is what FR-16.3 and `applyTags` already did; `ensureGroup`'s exact match was the outlier and joins them.

**This retires the `(import)` suffix** ADR-017 kept for Ferien-Vorlagen. Tags and items are untouched: they still merge by name through FR-16.3's matcher, near-duplicates included.

## Consequences

**Positive**

- A restore is repeatable, whole. Measured on a real 57-document file (21 groups, 3 Vorlagen, 33 trips, 1826 positions): the second run reports `57 documents: 0 imported, 57 already here, 0 failed` and the database does not move.
- The command line is safe to put in a script: `jitpack import backup.yaml` (spelled `jitpack-import backup.yaml` until ADR-042) is idempotent per trip, and `--dry-run` answers what a file would actually do.
- No schema change, no migration, no database deleted, and no new way for a push to be refused.

**Negative / accepted costs**

- **Two distinct trips of one name in one year cannot both be imported**, and the family sheet contains exactly that case. The same now holds for two distinct Ferien-Vorlagen of one name — the case ADR-017 protected. The remedy is the same: name them apart in the file. The import says which document it left alone, so the case is visible rather than silent.
- **A Vorlage that changed cannot be re-imported over the one that is here.** The file is not merged into it; it is skipped whole. Bringing a newer version of a Vorlage across instances now means renaming it, or editing it in the app.
- **A renamed trip is a new trip to the next import.** Rename *Samedan* to *Samedan Sommer* and the backup that still says *Samedan* restores a second copy. Accepted because the alternative is a stable identifier in the file, which makes a file from another instance import as "the same trip" as one of yours purely by id collision.
- The rule lives in the import path, so a future writer that creates trips another way does not inherit it.
- **It is only as good as what the device knows.** The comparison is against the client's own stores, so importing on a Server Mode device that has not finished its first pull can still create a duplicate — the instance holds the trip, this device does not know it yet. `jitpack-import` closes that by pulling the master partition before it plans anything; the app does not gate the import screen on a completed sync, and deliberately: blocking a restore behind the network is the wrong failure for a feature whose whole point is working without one.

**Neutral**

- Multi-document order matters where a file collides with itself: the first document of a colliding pair wins. Consistent with "matching happens per document as it is imported" (FR-18.4).

## Revisit Trigger

**Someone needs two trips of one name in one year, or two Vorlagen of one name, badly enough to say so** — the sheet's *Janosch & Andy* pair is the first candidate. The answer then is not to drop the rule but to give the import a way to say "no, this is a different one", which is a screen and a flag rather than a change of identity.

**Or:** the portable format grows a stable per-trip identifier (a UUID written on export). Then identity stops being derived from what the user can edit, renames stop creating copies, and this rule becomes the fallback for files that carry no id.
