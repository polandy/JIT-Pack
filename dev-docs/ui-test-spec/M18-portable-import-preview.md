# M18 — Portable Import Preview

* **E2E-M18-01** `all` (FR-18.4/18.5) — **implemented** (`e2e/backup-restore.spec.ts`): template YAML →
  summary header (name, kind, item count, `schema_version`) + per-item state (new/near-duplicate/matched, each on its
  own row, and **only the near row carries a choice** — a decided state offers none); Import creates the template,
  landed whole, with its three positions on M8. This is the rendered coverage of the screen's *preview* branch: the two
  `packing-list.spec.ts` cases that come through M18 use it as a **fixture** for a trip with quantities and click
  straight past the preview. The template is **shared instance-wide** (FR-1.6 MVP), never „private owned“ —
  `templates.owner_id` is creator metadata the server stamps; and the ADR-030 name-collision clause is asserted by
  **E2E-M18-11** at the screen (`findExistingSubject` is one function for all three document kinds, so the trip case
  covers the template's
  branch of it) and by `composables/__tests__/portableImport.spec.ts` at the rule. *(Mutation-proved: with the state
  chip reading `matched` for every row, the *new* assertion falls.)*
* **E2E-M18-02** `all` (FR-18.4, ADR-024) — **implemented** (`e2e/backup-restore.spec.ts`): a trip arrives in **the
  status the file carries**, and *planning* only when it carries none. **E2E-M18-09 covers the restore list**, and
  ADR-024 explicitly rejected honouring the status *only* there, on the grounds that the same file would otherwise
  behave differently depending on which button opened it — so the **preview** branch is the
  half that rejection is about. The case imports an archived trip document through the preview, finds it on M2's
  *Archived* segment and asserts it is **not** on *Planned*, where a constant status would land it.
  *„Travelers/containers remapped by name“* stays unit-owned (`composables/__tests__/portableImport.spec.ts`): the remap
  is invisible on any screen this case can reach without a container view of its own. *(Mutation-proved on `{ status:
  doc.status ?? undefined }`.)*
* **E2E-M18-03** `all` (FR-16.3) — **implemented** (`e2e/backup-restore.spec.ts`). **There is no shared dedup
  component**: M15 Step 3 and M18's preview each render their own list and hold
  their own `mergeChoices` map; what they share is the *rule* (`domain/spreadsheet.ts`'s `findDuplicates`, which
  `matchPortableItems` wraps) and two catalogue keys. The case drives the choice to where it becomes visible — the
  inventory: two near-duplicates in one document, one left on the default (*merge*), one switched to *keep separate*;
  afterwards M9 holds a new item for
  the one kept apart, none for the merged one, and **three rows in total**. The count is what makes the absence mean
  something: „no second item appeared“ is equally green against an import that created nothing at all.
  *(Mutation-proved: with `commit()` merging every match regardless of the choice, the kept-apart item never arrives.)*
* **E2E-M18-05** `all` (NFR-4.11/FR-19.6/FR-18.4, ADR-015) — **implemented** (`e2e/backup-restore.spec.ts`): the round
  trip. A backup taken through the G-2 detail on a device carrying a group and a packed trip restores onto a **second
  browser context** — a device that has never seen the data, which is what stops the case passing against an importer
  that does nothing. The multi-document file lists its documents (template and trip named as such) rather than opening
  the merge preview; after *Import all* both partitions are present and the trip keeps its packing progress. The list is
  **already on the Planned segment**, asserted without tapping it — restored trips are *planning*, and landing on Active
  would show „No active trips“ after a restore that worked. Asserted on `trip-row-<name>`, never on the trip's name as
  text: the pasted YAML is still in the textarea, so a bare text match reads the *input* and hides a missing
  `/tabs/trips` redirect.
* **E2E-M18-06** `all` (ADR-015) — **implemented**: a file whose middle document is unreadable lists all three, marks
  the damaged one *skipped* with its reason **in its place**, and still imports the intact ones. A document silently
  missing from a restore is data loss nobody is told about.
* **E2E-M18-07** `local` (FR-27.1/27.7, ADR-017) — **implemented** (`e2e/backup-restore.spec.ts`): a backup taken with a
  composed Ferien-Vorlage restores onto a device that has never seen the group — M8 still shows the group under the
  Vorlage and the FR-27.2 footer resolves through it, and the template list holds **one** group of that name — the
  backup carries it both nested and as its own document, so a restore that took both at face value would leave a second,
  suffixed copy included by nothing. Asserted on the *second* device, and after a positive check that the group is
  absent there, so an importer that did nothing could not pass.
* **E2E-M18-08** `local` (FR-27.4, NFR-4.11, ADR-015) — **implemented** (`e2e/backup-restore.spec.ts`): a trip that
  follows a group is answered twice — one change accepted, one refused — and then restored onto a second browser
  context. The restore list names the trip as *following 1 group*, M2's applied chip and log keep the accepted change
  with its original timestamp, the refused position is not on the list and is not offered again, and a **new** group
  position added on the restored device is proposed on its own. That last step is the positive signal the two absence
  assertions need: without the restored sources nothing would be proposed, without the restored ledger the refused
  position would be proposed beside it.
* **E2E-M18-09** `local` (FR-2.2, FR-18.4, ADR-024) — **implemented** (`e2e/backup-restore.spec.ts`): a backup gives
  back the **status** it saved. A trip is taken planning → active → archived through the app's own path, backed up, and
  restored onto a device that has never seen it: it comes back archived, and the restore lands on M2's *Archived*
  segment rather than a constant *Planned*. The negative companion is asserted too — the trip is **not** on
  Planned. *(The device needs a template as well as the
  trip: a single-document file is M18's merge preview, not the restore branch. The marks-and-tags half of ADR-024 is
  unit-covered end to end — `buildBackup` → `commitPortableRestore` on a fresh store — rather than here, because
  building a tagged, marked inventory item through M10 doubles this case's length to assert what the unit already
  asserts at the same boundary.)*
* **E2E-M2-10** `single` (FR-2.3, ADR-033) — **implemented** (`e2e/single/server-sync.spec.ts`): a trip the device has
  **never opened** still shows its progress on the list. One context builds a trip with two items and packs one; a
  **second** context — a device that has never been inside that trip — opens M2 and its row reads `1/2 packed` with
  nothing clicked, and the trip-partition request count is asserted beside it, so the number cannot have come from
  somewhere else. The second context is the whole point: on the device that built the trip the rows are already in the
  store and the case would pass against a screen that loads nothing. *(Mutation-proved: with the row's
  request removed the summary stays on „Loading items …" — it does not fall back to `0/0`, because the two halves of
  ADR-033 are independent.)*
* **E2E-M2-11** `single` (FR-12.1, ADR-033) — **implemented** (`e2e/single/server-sync.spec.ts`): cloning a trip the
  device has **never opened** carries its items. Without the guard, ClonePage sums a partition that is not on the
  device: the preview reads `0 items, 0 travellers` and the clone is created exactly that empty, with no error anywhere.
  A second context opens the source's clone page directly, the preview settles on the real counts (the loading line
  stands in until the partition arrives, and the button stays locked with a name typed — both unit-tested in
  `ClonePage.spec.ts`), and the created clone opens with both source rows visible. `cloneTrip` itself refuses an
  unloaded source (`clone.spec.ts`). *(UX-1.)*
* **E2E-M2-12** `all` (FR-2.1, UX-5) — **implemented** (`e2e/trip-list.spec.ts`): a dated trip's temporal
  line is the locale-formatted range (`Aug 22 – Sep 5, 2026` in the suite's English), never interpolated ISO strings.
  Intl collapses the shared year, so a hand-written `start – end` fails the assertion too. The German shapes,
  *until/from* and the year-only line are unit-owned per locale in `lib/__tests__/format.spec.ts`; the greeting buckets
  (UX-15) in `lib/__tests__/greeting.spec.ts`.
* **E2E-SYNC-01** `single` (Sync-API §4) — **implemented** (`e2e/single/server-sync.spec.ts`): a master partition
  **larger than one page** arrives whole. 520 items are pushed straight at the API (this case is about the size of a
  partition, not about clicking five hundred times), then a browser that has never talked to the instance boots and the
  **last** row of the feed is asserted on M9. The request count is asserted beside it — more than one pull, or the seed
  no longer exceeds a page and the case would be proving nothing. *(A truncated first page otherwise passes silently: M2
  reads „Keine archivierten Reisen" with the G-2 glyph green. Mutation-proved: with the loop taken out, the last row is
  never
  found.)* §4's paging rule has **two callers** — `SyncOutbox.drain`, which every browser runs and this case covers,
  and the FR-18.7/18.8 command line's own pull (`sync/partition.ts`), which nothing here reaches. The rule, including
  the progress guard (*stop when `next_cursor` does not advance*, or a server claiming more without moving the cursor
  makes `jitpack import` spin for ever), is named once (`client/src/sync/pullProtocol.ts`) and both callers ask it. Its
  twin, §3's observe step, is asserted on the drain in `sync/__tests__/outbox.spec.ts`. No new e2e id: both are
  rules below the screen, and a second paged-partition case would re-drive the loop E2E-SYNC-01 already drives.
* **E2E-M18-10** `local` (FR-18.4, ADR-030) — **implemented** (`e2e/backup-restore.spec.ts`): the same backup, restored
  **twice** onto one device, carrying all three document kinds — a group, a Ferien-Vorlage and a trip. The first run
  lands them and the restore list shows no *Schon vorhanden* mark; the second run marks **every** row before the button
  is pressed, raises the toast that counts what it left alone, and leaves **exactly one** trip, **one** group and
  **one** Vorlage, with no `(import)` suffix anywhere. The count is the point: an assertion that no second row appeared
  would be just as green against a restore that deleted the first. *(Mutation-proved: with the
  identity check reading an empty trip list, the second restore produces two rows and the case fails on that count.)*
* **E2E-M18-11** `local` (FR-18.4, ADR-030) — **implemented** (`e2e/backup-restore.spec.ts`): the **single-document**
  half of the same rule, which is a different branch of M18 — the merge preview, not the restore list. A device with one
  trip and no template backs itself up (one document by construction, so the year stays out of the fixture) and the file
  is pasted back on that same device: the preview carries the note **before** the button, *Import* opens the trip that
  was already there rather than a copy, the toast says so, and M2 still lists it once. *(Mutation-proved on
  `findExistingSubject`.)*
* **E2E-M18-12** `local` (FR-25.11j, NFR-4.11) — **implemented** (`e2e/backup-restore.spec.ts`): a backup gives back
  **where a row was bought from**. A BUY_BEFORE row is bought on M6, which moves it to the packing list (FR-3.3) and
  leaves `bought_from` as the only record M6's reveal can find it by; the device backs itself up and the file is
  restored onto a second, empty context. On the restored device the row is an open row on M4 **and** M6's bought bar
  counts it, the reveal names it with *on the packing list*, and it is on no open shopping row. The bar is the positive
  signal: a portable format carrying the mode and the count but not the record leaves the restored row on the packing
  list with the shopping side knowing nothing — neither an open row nor a bought one, and no bar at all.
  *(Mutation-proved: with `serializeTrip` writing no `bought_from`, the case fails on the bar.)*
* **E2E-M18-04** `all` (FR-18.5) — **implemented** (`e2e/backup-restore.spec.ts`): a newer `schema_version`
  shows a warning but imports best-effort — an unrecognised key and all — and a malformed file is refused **at this
  screen's own picker step**, with the parser's reason, no preview opened and the pasted text still in the field to
  correct. The picker **is** M18's first state, and the refusal happening here is the point — refusing somewhere else
  would leave nothing to fix. The parser's rules are exhaustively unit-covered (`domain/__tests__/portable.spec.ts`);
  this case is what renders either message, and a rule nobody paints is a rule the user never hears. *(Mutation-proved
  twice — `newerSchema` forced false, and the parse error's own string dropped.)*
