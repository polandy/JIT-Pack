# M9 — Item Inventory

Each id's sentence is read against the test body under it — **only that separates a wrong number from a missing test**:
a duplicate-id gate sees one use of each, and a coverage count sees the same total either way.

* **E2E-M9-01** `all` (FR-1.1/24.2/24.4) — **implemented** (`e2e/inventory-list.spec.ts`): tag-grouped list, **lean by
  default** — per row only primary-tag avatar + name (no tag chips, no weight/price); row thumbnail when a photo exists.
  The case an item on *two* tags is the point: it renders **once**, under its primary tag, and its second tag is not a
  heading. *(Search is E2E-M9-10's.)*
* ~~**E2E-M9-02**~~ `all` (FR-1.1/24.5) — **retired**, not unimplemented: FAB → M10 in **creation mode** is asserted by
  **E2E-M10-07**, which reaches the form by clicking `m9-fab` and then asserts exactly the minimal-mode shape this id
  promised. A second id over one behaviour is a second place for it to read covered.
* **E2E-M9-03** `all` (FR-16.3) — **struck by decision, and not a test gap.** FR-16.3 is *Deduplication on **Import***
  and is discharged where deduplication happens — on import, by M15 (E2E-M15-03/09) and M18 (E2E-M18-03); the cleanup
  clause is not part of UI-Spec M9. The inventory's own duplicate merge is FR-24.15's (E2E-M9-30). **The clause has a
  second reader**: PRD FR-27.5 rejects fuzzy name matching in M21 partly on the grounds that „a duplicate master item is
  visible in M9 **and can be merged**", and PRD FR-27.5 carries a note on that premise.
* **E2E-M9-04** `all` (G-7/NFR-4.7) — **implemented** (`e2e/inventory-list.spec.ts`): an empty inventory offers
  the spreadsheet import, and the way back lands on M9 rather than on M15's *other* parent, the trip list. Its own
  describe, because every other case here creates an item first and this one must not. It is the one case rendering this
  state: elsewhere `m9-empty` appears only as E2E-G9-13's *absence* assertion, where it stands in for „not the inventory
  screen". The G-7 half is asserted beside two absences of elements the screen does render on a populated inventory
  — the tool bar (`m9-tools`: the search row and the tag chips, FR-24.6) and the no-match state — so „the empty state
  is up" cannot be satisfied by a list that painted nothing; the positive signal is `m9-empty` itself and its import
  button landing on M15.
* **E2E-M9-05** `all` (FR-24.4) — **implemented** (partially: the reload half is unit-tested in
  `inventoryProperties.spec.ts`, since a device-local reload assertion belongs where the storage seam is): the eye icon
  opens the „Angezeigte Eigenschaften" sheet; enabling Gewicht/Preis/Tags adds exactly those to the rows, the icon shows
  a count badge while anything is enabled, and the preference survives a reload **on this device only** (device-local,
  never synced). *(**Exactly those**: enabling the weight must leave the tags off the row, which is the whole reason
  FR-24.4 is three switches; the **badge** is asserted from both sides, since „the badge reads 1" is equally satisfied
  by a badge that always reads 1.)*
* **E2E-M9-06** `all` (FR-24.2) — **implemented**: the tag control filters on **any** of an item's tags while the
  grouping stays on the primary one — filtering by *Sommer* surfaces the swimsuit filed under *Kleidung*. Asserted on
  rendered rows, since the two rules differ only in what is painted.
* **E2E-M9-07** `all` (FR-28.1/28.4/28.7) — **implemented** (`item-mark.spec.ts`): a mark set in M10 appears
  on the inventory row **and** on the packing row of a trip that took the item from the inventory, without either row
  storing it (FR-28.7 — asserted by changing the mark once and observing both surfaces); an ad-hoc quick-add row shows
  the empty slot. **Both composer paths are exercised on purpose**, because they differ where it matters: the suggestion
  carries `source_item_id` and therefore a mark, the free-text confirm does not. *The photo rung is the component
  unit's, for the reason given at E2E-M5-15.*
* ~~**E2E-M9-08**~~ `all` (UX-4) — **retired**, not unimplemented: it measured the gap between the tag axis and the
  first group heading, and FR-24.8 removed the axis. The promise it stood for — a heading
  that does not read as sliding under the control above it — is **E2E-M9-13**'s, which asserts the heading stacked
  below the sticky tool bar.
* **E2E-M9-11** `all` (FR-24.7) — **implemented** (`e2e/inventory-search.spec.ts`): the search reaches an umlaut
  name from **both** keyboard spellings („gurtel" and „guertel" → „Gürtel") and reaches an item through a **tag**,
  with the row stating what carried the match and the heading reading *Treffer im Tag*. The ranking arithmetic itself
  is `domain/__tests__/itemSearch.spec.ts`, whose three fold cases are red against a plain
  `name.toLowerCase().includes` rule.
* **E2E-M9-12** `all` (FR-24.7) — **implemented** (`e2e/inventory-search.spec.ts`): a query under an unrelated tag
  chip („socken" under *Hygiene*) is answered by an empty state that **names the tag**, **counts the hits outside it**
  and offers the way out — and taking it **keeps the query**. A bare „Kein Artikel gefunden" while three socks sit in
  the list is the failure it guards.
* **E2E-M9-13** `all` (FR-24.6) — **implemented** (`e2e/inventory-search.spec.ts`): the tool bar is in the same
  place after the list has been scrolled to its end, its field still visible, with the first group heading stacked
  **below** it rather than sliding under it. Geometry on settled boxes, like E2E-M9-08, and the scroll offset is read
  back as the positive signal that the list actually moved. **Proven red** against a build with `position: static` on
  the bar.
* **E2E-M9-14** `all` (FR-24.8) — **implemented** (`e2e/inventory-list.spec.ts`): the axis is **gone from the
  DOM**, the three chips carry their counts, and two tags combine under *alle* — the question a single-select segment
  could not ask. The sheet's own footer count is asserted against the list's, so the two cannot drift into separate
  arithmetic. Its dismissal is read from `data-presented`, because a sheet declared with `:is-open` stays in the DOM.
* **E2E-M9-15** `all` (FR-24.8) — **implemented** (`e2e/inventory-list.spec.ts`): the group heading opens the
  jump list and the chosen group lands directly under the tool bar, **with every row still in the list** — filtering
  takes rows away, jumping does not. Twelve rows on a 360 px viewport, because the case is only meaningful on a list
  taller than the screen. **The ordering rule it cannot falsify is a unit test**: while an overlay is presented the
  scroll host is locked, and a jump issued in the same breath is clamped (measured at 120 px of a 9 975 px jump on the
  family instance); `ItemInventoryPage.spec.ts` asserts that nothing scrolls until the sheet reports it has dismissed,
  and that a dismissal without a choice scrolls nothing at all.
* **E2E-M9-16** `all` (FR-24.9) — **implemented** (`e2e/inventory-bulk.spec.ts`): three rows of a tag group are
  refiled in **one act** — narrow, „Alle 3", give the tag with „als primär", and the group they came from heads
  nothing any more. Two clauses carry the semantics that are easy to get wrong: the old tag is **kept** (the rows
  still answer its filter — refiling is not retagging), and the snackbar's **Rückgängig** puts all three back.
  **Proven red** against a build whose switch appended instead of refiling.
* **E2E-M9-20** `all` (FR-24.3) — **implemented** (`e2e/restore-retired.spec.ts`): M9 names the items it is
  **not** showing and the note is the way to M23. It lives in the M23 unit rather than M9's, because retiring an item
  is the setup and that unit already owns the dance. A second, untouched item stays active throughout — otherwise
  „the note appeared" would be satisfied by an inventory that had emptied itself.
* **E2E-M9-21** `all` (FR-24.11) — **implemented** (`e2e/inventory-search.spec.ts`): „Zelt" finds *Zeltheringe*
  and the tent is **still offered** above that hit — the missing-name rule rather than the empty-result one. The sheet
  opens on the query as the name with the pegs' tag first among the offers; *„Anlegen"* leaves the list **on the same
  query**, with two hits, the new one marked, and the offer gone — the name now existing is the same event reaching
  both places. The toast is asserted **above the FAB** on its settled box, not covering the button, and the item is read
  back under its tag.
* **E2E-M9-22** `all` (FR-24.11) — **implemented** (`e2e/inventory-search.spec.ts`): with *Technik* chosen and
  nothing matching, the no-match sentence stands and the offer sits above it; the sheet opens with **Technik already
  assigned**, and *„Anlegen und öffnen"* lands in M10 on the saved item. Back on M9 the query and the chip are still
  set and the new row answers both — the survival of the search is what the feature is for.
* **E2E-M9-23** `all` (FR-24.11) — **implemented** (`e2e/restore-retired.spec.ts`): searching a
  **retired** item's name offers it back; a tap restores it without opening a sheet, the row returns marked, and M23
  is left with nothing to restore. A second item stays active, because an inventory whose only row is retired is an
  empty one and has no search field.
* **E2E-M9-24** `all` (FR-24.9) — **implemented** (`e2e/inventory-cleanup.spec.ts`): *Tag geben*
  creates the tag its search did not find. A different capitalisation of an existing tag is **not** offered (the
  uniqueness fold), a new name is, and taking it files both selected rows under the new heading. The undo is asserted
  twice: the rows go back under their old heading, **and** the tag is gone from the manager — an undo that left the tag
  behind would pass the first clause alone.
* **E2E-M9-25** `all` (FR-24.13) — **implemented** (`e2e/inventory-cleanup.spec.ts`): a tag's mark is set
  from the tag manager's mark control through the item mark's picker, and read where it files something — on the group
  heading, and **lent, muted, to a row without its own** (the `borrowed` slot). The mark is read off the tile that was
  tapped rather than hard-coded, so the case does not pin the mark index's ordering.
* **E2E-M9-26** `all` (FR-24.9 widened, FR-20.1) — **implemented** (`e2e/inventory-bulk.spec.ts`): a
  dependency declared for two rows at once from the ⋯ sheet, in the **suggested** mode the sheet was switched to, and
  read back on M10's own list for each of them — M9 paints no edges, so a link that wrote nothing would look exactly
  like one that worked. The companion direction is then asserted on the *other* list, since the stored row is the same
  edge and the end it is read from is all that tells them apart. The undo is taken on the **second** of two companion
  batches, so the absence it leaves is measured against a list that still carries the first row.
* **E2E-M9-27** `server` (FR-1.9 over FR-24.9) — **implemented** (`e2e/server/multi-user.spec.ts`): two
  items created as *„Nobody"*, then assigned to Bob in one act from the ⋯ sheet, and both rows name him in M10
  afterwards. It is a `server` case because the action only exists there (G-8 needs two accounts), and it picks its
  rows **by name** rather than with „Alle N", because master data is instance-wide and the inventory carries every
  other case's items too.
* **E2E-M9-17** `all` (FR-24.10) — **implemented** (`e2e/inventory-tags.spec.ts`): a tag is renamed from the
  manager, and the **inventory's group heading** carries the new name — the only place the write is observable, since
  the sheet would show a renamed row whether or not anything was written. The second clause is the refusal: a name a
  second tag already holds leaves the alert **open**, and the tag keeps its old name on the heading behind it.
* **E2E-M9-18** `all` (FR-24.10, ADR-063) — **implemented** (`e2e/inventory-tags.spec.ts`): deleting a tag items
  carry is **refused**, and the alert offers the merge. The absence needs a positive signal, so the case reads the
  refusal's own sentence *and* the heading that is still there afterwards — a delete that had gone through would take
  the heading with it.
* **E2E-M9-19** `all` (FR-24.10, ADR-063) — **implemented** (`e2e/inventory-tags.spec.ts`): the merge itself,
  through the refusal. The item that carried the source ends up under the **target's** heading and the source's
  heading is gone — which is the whole promise, because a merge that re-pointed the assignment without carrying the
  position over would leave the row under a third heading entirely.
* **E2E-M9-28** `all` (FR-24.14) — **implemented** (`e2e/inventory-tags.spec.ts`): three tags for one idea,
  picked in the manager's selection and merged in one act. One item carries **two** of the sources, which is the case
  a per-pair merge cannot do — it would re-point both of its assignments onto the survivor, and `UNIQUE (item_id,
  tag_id)` refuses the second after the outbox has taken it. What says the plan was made over the whole set is the
  row ending with exactly one tag, under the heading it already had; the manager is reopened afterwards so the
  survivor's count and the two absent rows are read from the screen that owns them.
* **E2E-M9-30** `all` (FR-24.15, ADR-069) — **implemented** (`e2e/inventory-bulk.spec.ts`): two duplicates
  merged into one. The loser is built to carry what the survivor lacks — a tag it does not have, a weight it has
  none of, a companion edge pointing at it — because the inventory list after a merge that wrote nothing but the
  delete looks exactly like one that worked; each is read back where it is *rendered* (the heading on M9, the tag
  summary, the companion and the weight in M10). A trip packs the loser first, which is what makes FR-24.3 answer
  its delete by **retiring** it, and the case ends on M23 asserting the row names the survivor — the sentence that
  keeps its restore from being a silent offer to re-create the duplicate. That trip also carries a **remark written
  on the losing row**, read back afterwards in the survivor's FR-27.9 section: the trip row still names the loser,
  so the section is empty unless M10 reads through the alias — the one claim of ADR-069 that the domain's own units
  cannot make, because they never wire the page.
* **E2E-M9-31** `local` (FR-24.9, ADR-075) — **implemented** (`e2e/inventory-bulk.spec.ts`): M9 selects
  the way M6 and M25 do. A **real right-click** on a row — the hold's desktop twin, whose own pointerdown must not
  re-arm the hold and eat the next tap — starts the mode with that row picked and leaves M9 on screen; the very next tap
  on
  another row picks it (the count moves to two), a tap on the first unpicks it; leaving through the bar's ✕ gives the
  tap back to opening the item, read on M10's title. The grouped heading still carries its count and is still the jump
  control. The long press itself is `useRowSelection`'s unit (fake timers), not this case's.
* **E2E-M9-32** `local` (FR-24.14, ADR-075) — **implemented** (`e2e/inventory-tags.spec.ts`): the tag
  manager selects like the lists. A real right-click on a tag's **name** — the rename control outside the mode —
  opens the shared bar with that row picked and the merge in the bulk bar dimmed; a tap on another row picks it and
  lights the merge; the bar's ✕ gives the rows their acts back. That a touch hold's release click does not also
  rename is `TagManagerSheet.spec.ts`'s: a right-click sends no click, so the absence would be vacuous here.
* **E2E-M9-33** `local` (FR-24.10, ADR-075) — **implemented** (`e2e/inventory-tags.spec.ts`): a tag is
  moved on the axis by its grip. The pointer lifts *Navigation* by the grip, the gap before *Foto* is marked while it
  hangs there, the chip above the finger reads *Navigation* and *→ position 1* (G-21), and after the drop `data-drag`
  returns to `idle`; the order is read on M9's own headings once the sheet
  is closed — *Navigation* first — not in the sheet that was dragged.
* **E2E-M9-29** `server` (FR-1.9 over FR-24.4/24.7) — **implemented** (`e2e/server/multi-user.spec.ts`):
  the inventory names who an item is usually for and finds it by that name. Three claims in order, each needing the
  one before it: the property is **offered** (a `server` case for E2E-M9-27's G-8 reason), the row carries the name
  once it is switched on, and the account's name typed into the search reaches the same row. A **second item stays
  unassigned throughout**, or „the name is on the row" would be satisfied by a list that printed it on every row.
* **E2E-M10-21** `all` (FR-24.9) — **implemented** (`e2e/item-editor-tags.spec.ts`): M10's assigned chip has two
  targets. Tapping the **name** makes that tag primary, and the assertion crosses screens — the inventory files the
  row under the new heading, which is the only place the change is observable. The **✕** still removes the tag
  (E2E-M10-08's target, unchanged), and the primary chip's name is disabled, an act already performed being no offer.
* **E2E-M10-22** `all` (FR-24.9) — **implemented** (`e2e/item-editor-tags.spec.ts`): the same chip while
  *creating*, where there is no assignment row to move — the draft's order is what gets written, so only the saved
  item says whether the act worked, and the case reads it off M9's heading. **Proven red** against a creating branch
  that ignores the tap.
* **E2E-M9-09** `single` (FR-21.9) — **implemented** (`e2e/single/instance-currency.spec.ts`): an item price
  is rendered with the currency the instance named. `single` rather than `all`, and that is the feature rather than a
  limitation of the case: the code comes from the server over `GET /api/v1/instance/config`, and Local Mode has none, so
  its amounts stay unit-less by design. The project's backend runs with `JITPACK_CURRENCY=CHF`, so any screen that
  renders an amount without carrying it is a red case rather than a quiet omission. **Two clauses, both asserted:** the
  row contains `CHF`, and it contains `129.50` — naming a currency labels an amount and never converts it, and the
  second assertion is what says so. Mutation-proved: with the `style: currency` option removed the row reads `129.50`
  alone. **M5's context line follows the same rule**, asserted in `ItemDetailSheet.spec.ts` rather than as a second
  `single` case, because what can go wrong there is a bypassed formatter, not the delivery of the code.
* **E2E-M9-10** `all` (FR-1.1) — **implemented** (`e2e/inventory-search.spec.ts`): the search **filters**. The field is
  permanent (FR-24.6), asserted visible without a magnifier. E2E-G12-02 asserts that the magnifier opens *this* screen's
  field and no other screen's; that typing into it narrows the list is a different promise. A term the inventory matches
  leaves one row and takes the *heading* of the group it emptied with it (the filter runs before the grouping, so a
  heading over nothing would be the visible defect); a term nothing matches raises **`m9-no-match`** and explicitly
  **not** the G-7 empty state, which would offer to import an inventory that already exists.
