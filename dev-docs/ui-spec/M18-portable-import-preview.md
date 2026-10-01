# M18 — Portable Import Preview

* **Purpose:** A lightweight, single-screen confirmation for importing a portable YAML template or trip file (Addendum
  FR-18.4) — deliberately not a multi-step wizard like M15, since the file is our own well-structured format and needs
  no column mapping.
* **Elements:** File summary header (kind: Template/Trip, name, item count, `schema_version`); item list preview with
  per-item state: *new* (no local match), *near-duplicate* (name closely matches an existing item, FR-16.3-style), or
  *matched* (exact name match) — each near-duplicate row offers *merge* or *keep separate*. **What M15 Step 3 and this
  list actually share is the rule, not the component:** both resolve names
  through `domain/spreadsheet.ts`'s `findDuplicates` — M18 through `matchPortableItems`, which wraps it — and both
  render their own list and hold their own choice map. The two catalogue keys (*Merge* / *Keep separate*) are shared,
  which is as far as the reuse goes. Kept as two lists deliberately: M15's row is a spreadsheet cell being mapped and
  M18's is a document position with a state chip beside it.
* **Actions:** *Import* commits — a template import creates a new template, shared instance-wide like every other
  (FR-1.6 MVP); a trip import creates a new trip in **the status the file carries, and *planning* when it carries none**
  (FR-18.4, ADR-024); *Cancel* discards with no residue. **Where the document is already here, *Import* opens what is
  already here and adds nothing** (ADR-030), confirming it with a toast: the screen still commits
  rather than disabling its own button, because "this is already yours, here it is" is a better answer than a dead
  control with no explanation.
* **States:** A `schema_version` newer than the app understands shows a plain warning but still attempts best-effort
  import, ignoring unrecognized fields (FR-18.5); a malformed file is rejected **at this screen's own picker step**,
  with an inline error naming the reason, and no preview is opened (the picker's trigger is G-17's button). The picker
  is M18's first state, so the refusal happens here — which is what makes it correctable, the pasted text still in the
  field. **A document this instance already holds is named as such in the preview** (ADR-030) — a note beside the schema
  warning, carrying the same weight, because it is the same kind of fact: something about this file the user should know
  before pressing the button rather than after. A trip is recognised by its year and its name, a Ferien-Vorlage and a
  group by their name.
* **Restore branch (ADR-015 — the screen the backup is read back through):** a file holding **more than one document**
  is a device backup rather than a single export, so it gets a list instead of the per-item merge preview: one row per
  document naming it and its kind and item count, an unreadable document reported **in its place** with its reason and a
  *skipped* chip, and one *Import all* commit that matches master items per document as each is imported. *Cancel*
  returns to the picker. It lands on the **trip list**, on `/tabs/trips` specifically (E2E-M18-05). **It lands on the
  segment its own result is on**, not the Active one the list opens on: a successful restore ending on the words „No
  active trips“ reads as a restore that did not happen. The segment travels as a route query (`?status=…`), which M2
  honours when it names one of its three segments and otherwise leaves the user's own choice alone. It is **derived from
  the first restored trip's status** (ADR-024, E2E-M18-09) — a device of archived history restored onto a hard-coded
  *planned* would land on an empty list. A file of templates only, having no trip to point at, lands on *planned*.
  **Every row that is already here carries a *Schon vorhanden* chip (ADR-030)**, decided by the import rules' own
  function rather than by a second reading of them — so the list answers "what would this restore actually add?" before
  *Import all* is pressed, and the commit's toast counts what it left alone. **A trip row also names what it follows
  (FR-27.4):** where the document carries the trip's group registry, the row reads „Reise · N Artikel · folgt M Gruppen“
  — the only place the restored refresh state is visible before anything is imported, and absent on a file written
  before those sections existed. **In Server and Single-User Mode the restore pushes what it wrote — all of it
  (E2E-FLOW-07):** a trip's rows are its own partition (ADR-033), so the restore drains one per trip the file brought as
  well as the master partition — otherwise a migration off Local Mode (FR-19.5) would send the trips' names and years
  and leave every packing list queued on the importing device, whose own screen shows the restored data either way.
  **The screen is localized** (EN/DE), M15 with it; the parser's own error strings stay English, because they
  interpolate the YAML library's message and would need an error model rather than a catalogue key.
* **Navigation:** From M7 (template import) and M2 (trip import).
