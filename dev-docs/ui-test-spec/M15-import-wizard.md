# M15 — Import Wizard

* **E2E-M15-01** ~~`all` (FR-16.1): upload/paste CSV → grid preview; mark item column, category rows, per-trip
  include/name/date/series.~~ — **retired clause by clause**, because it is six promises in one sentence and they are
  asserted in five different places. *Upload* is **E2E-M15-10** and *paste* is every other case in
  the unit; *category rows* is **E2E-M15-11**; *per-trip include* is **E2E-M15-12**; *name/date*, prefilled from the
  header block, is **E2E-M15-05**. The *grid preview* is **E2E-M15-13** (ADR-041), not
  this number, which a reader arriving from an old commit has to be able to land on. And *mark the item column* is left
  deliberately
  untested: the picker's candidate list is asserted in M15-05 and the same override, on the same control shape, is
  asserted for the category column in M15-07 — what is not covered is a *sheet* whose item column the detector reads
  wrong, and FR-16.1 records that the surrounding inference has no manual override at all.
* **E2E-M15-02** `all` (NFR-4.7) — **implemented** (`spreadsheet-import.spec.ts`): step 2 names the entries
  the sheet marked uncertain and up to three of them by name, step 4 counts the tasks the commit will write, and the
  case follows the chain to the prep badge on the imported row — the positive signal the note stands against. The task
  body is on the catalogue (NFR-4.12), asserted in the *other* locale by `composables/__tests__/import.spec.ts`, because
  a body read through `t()` in the default language is equally satisfied by an English literal. The body is
  `import.wizard.noiseTodo`, rendered with `t()` in `composables/sync/actions/tripCreation.ts`. The rule underneath —
  a trailing `?` becomes an item plus an open task on its trip row; `buildImportPlan` strips it and sets
  `hasOpenTask`, `commitImport` writes the todo — is unit-covered at both levels
  (`domain/__tests__/spreadsheet.spec.ts`, `composables/__tests__/import.spec.ts`, which asserts the todo lands `open`).
* **E2E-M15-03** `all` (FR-16.3) — **implemented** (`e2e/spreadsheet-import.spec.ts`): step 3 is reached only with an
  existing inventory — every other fixture in the unit imports into an empty device, where there is nothing to be a
  duplicate *of*. The inventory is therefore built by an import of its own — M15
  is the screen that turns a sheet into master items — and the second sheet carries one exact repeat and one one-letter
  neighbour. The near one is switched to *keep separate*, the exact one left on the default; the confirm reports *2 new
  items, 1 merged*, and afterwards M9 holds **five** rows. The count is what makes the merge legible: „no second
  *Wanderschuhe* appeared" is equally true of an import that created nothing at all. *(Mutation-proved: with `plan`
  merging every match regardless of the choice, the kept-apart item never arrives.)*
* **E2E-M15-13** `all` (FR-16.1, ADR-041) — **implemented**: step 1 renders the grid the parser read, live while the
  text is being pasted, before anything is derived from it. Asserts the one thing a derived list cannot show — a quoted
  comma kept as **one** cell — plus a short row keeping its shape rather than shifting its neighbours left, the row
  count, and that the wide content scrolls inside its own box. It carries E2E-M15-01's grid clause, which is retired
  there.
* **E2E-M15-04b** `all` (FR-16.1) — **implemented**: the confirm names each trip's target series, and names *„keine
  Serie"* where none was chosen. Asserted from both sides — first with no series to prove the row is not merely silent,
  then after choosing one — because a row that always printed *„keine Serie"* would satisfy half of it.
* **E2E-M15-04** `all` (FR-16.2/NFR-4.7) — **distributed, and one clause an approximation.** *n items* and *n archived
  trips* are asserted on the confirm line by M15-06/08/11 and committed by M15-05/08/11; *pre-validation blocks a bad
  file before commit* is **E2E-M15-12**. The *target series* clause is **E2E-M15-04b**: each confirm row names the
  series its trip will join, and says *„keine Serie"* where none was chosen (`commitImport` writing `series_id` is
  unit-covered in
  `composables/__tests__/import.spec.ts`). And *transactionality* is an
  **approximation, not a rollback**: the plan is validated before a single mutation is enqueued and replay is
  idempotent, but nothing rolls back and there is no progress indicator — UI-Spec M15's *„transactional commit with
  progress; failure rolls back completely"* is not a promise any code keeps.
* **E2E-M15-05** `single` (FR-16.1/16.2, FR-2.1b) — **implemented**: a CSV with a two-row header (year above name) and a
  category column imports through the wizard; the mapping step shows the name and the date it read from the two header
  rows, and both column pickers offer *candidates* rather than every column — a column holding quantities can be neither
  of the two they choose; after the commit the trip is on M2's Archived segment, and **a second browser context that
  never saw the optimistic write finds the trip and its packed rows** — the only assertion that can tell a wire that
  carried the import from a screen that only believed it.
* **E2E-M15-06** `all` (FR-16.1) — **implemented**: a sheet whose category is a *column* has it detected, and the
  confirm step reports the categories it produced. ~~and no item turned into one~~ — **that half cannot fail here**:
  with a category column the analysis claims no category rows at all, so no item is ever a candidate to become one. The
  clause is falsifiable only in the *rows* layout, and it is asserted there by **E2E-M15-11** — where the mutation that
  stops claiming heading rows does turn both headings into items.
* **E2E-M15-07** `all` (FR-16.1) — **implemented**: setting the category-column picker back to *None* is honoured rather
  than re-detected, and the plan then carries no category at all. The override is the escape hatch for a column the
  detector reads wrong — a *Notes* column carrying text and no quantities looks exactly like a category to it.
* **E2E-M15-08** `all` (FR-16.1) — **implemented**: a sheet with no trip column at all passes the mapping step, reports
  *0 archived trips* with its items, and lands on the inventory rather than on the trip list — not refused, and the
  bare list it imports arrives as items, not as categories.
* **E2E-M15-10** `all` (UX-6, G-17, ADR-035) — **implemented**: M15's file control is the app's own catalogue-labelled
  button, not the browser's file chrome, and a file picked through it lands its text on the same path the paste area
  feeds — asserted end to end by the mapping step appearing for the picked CSV.
* **E2E-M15-09** `single` (FR-24.2/16.3) — **implemented**: after an import, a **second browser context** filters M9's
  tag axis to the imported category and finds the item under it, and a name the sheet listed twice is there once. Both
  halves can be refused at the wire while invisible on the importing device: a tag link enqueued before its item, and
  `items` being UNIQUE (name). *(The „there once" half is carried by Playwright's strict mode — a
  second row makes the `getByText` resolve two elements and throw — rather than by a count of its own. It cannot pass
  against a duplicate, so it is coverage; it just does not read like it.)*
* **E2E-M15-11** `local` (FR-16.1/16.2/24.2) — **implemented** (`e2e/spreadsheet-import.spec.ts`): the
  **category-row** layout, which is the one this wizard was built for, end to end — the case that makes
  `analyzeGrid`'s heading-row branch produce a row anybody can see (the other cases carry the category in a *column*,
  and M15-08 imports a sheet with no category rows and no trip at all). Two headings become
  tags and do **not** also become items (three new items out of five named rows), the two trip columns land archived
  under the years that are their only header, and on M9 the heading filters to the two items beneath it and not to the
  third. The write half and the read half are two behaviours: a tag that exists is not a tag on an item (FR-24.2).
  *(Mutation-proved on the `categoryRows` push: the summary then reads „5 new items, 0 categories".)*
* **E2E-M15-12** `local` (FR-16.1, NFR-4.7) — **implemented** (`e2e/spreadsheet-import.spec.ts`): the mapping
  gate, and the include toggle as the way past it. A trip column the sheet **dates but never names** is preselected —
  FR-16.1 leaves out only a column carrying *neither* fact — so the step names what is missing and refuses to advance;
  unticking that column releases it and the confirm then reports **one** archived trip. It is the case that operates
  the per-trip include checkbox and asserts the note's presence (M15-08 asserts its absence). *(Mutation-proved on
  `mappingValid`'s name check.)*
