# M10 — Item Editor

Each id is read against the test carrying its number in the `item-editor-*.spec.ts` file it names; the ledger's promise
table maps each test row to the same ids. Two ids over one section (M10-03 and M10-09) are merged into M10-03, and
M10-02's delete refusal is reversed by FR-24.3.

* ~~**E2E-M10-01**~~ `all` (FR-1.1) — **retired**, clause by clause rather than as a summary: the name and the
  inline-created tag are **E2E-M10-08**, the weight behind *Mehr ▾* is **E2E-M10-07**, and the price is asserted where
  it is *read* — **E2E-M9-09**, which is the case that can tell a formatted amount from a bare number. What is left is
  the last clause, *no unit control*, and it has nothing to assert against: FR-1.8 retired units and no unit field
  exists.
* **E2E-M10-08** `all` (FR-24.1) — **implemented** (`e2e/item-editor-create.spec.ts`, two tests): the tag input is a
  search field — typing filters the chips, tapping a match assigns it (the second item finds the tag instead of
  duplicating it); an unmatched name shows the "＋ „X“ neu anlegen" chip, and ＋ creates and assigns the tag in one step,
  clearing the field for the next; unassigning refiles the item in M9. **„Assigned tags stay pinned"** (UI-Spec M10: „so
  the filter can never hide what the item already carries") is asserted with a *non-empty* query — an empty query is the
  one state that cannot tell the rule from its absence. The ＋ chip is the positive signal it rides on, so „the chip is
  still there" cannot be satisfied by a field that filters nothing at all.
* **E2E-M10-10** `all` (FR-24.1/16.3) — **implemented** (`e2e/item-editor-create.spec.ts`): the item's name is its
  identity (`UNIQUE (name)`, ADR-014), so creating a second item with an existing name is **reported in the form** — not
  left to the sync push to reject.
* **E2E-M10-17** `all` (FR-27.8): the item names the groups and Vorlagen holding it, each with its
  position count and its scope chip, and one row leads into that template's editor with the way back landing on the item
  again. The list is **mixed on purpose** — a group *and* a Ferien-Vorlage — because both scopes wear the same chip here
  and a group chip asserted alone would pass on a screen that marks nothing else.
* **E2E-M10-18** `all` (FR-27.9): a remark written on a trip row through M5's own composer is
  readable at the item, with the trip named. The chain is the app's: master item → quick-add → M5 comment → M10.
  Red-proved by dropping the join in `domain/itemHistory.ts`.
* **E2E-M10-19** `all` (FR-24.5/FR-27.8/FR-27.9) — **implemented** (`item-editor-rear-view.spec.ts`): an item nothing
  has used carries **neither** section — absent, not empty. The positive signal is the delete card, which *is* on the
  screen: a page that failed to load satisfies an absence assertion just as well.
* **E2E-M10-07** `all` (FR-24.5) — **implemented** (`e2e/item-editor-create.spec.ts`, two tests): creating an item shows
  the minimal form (name focused, tags, *„Mehr — Gewicht & Preis ▾"*); committing without a name is caught with a hint
  rather than a disabled button; after *„Artikel anlegen"* the full editor appears. The absence of the delete card is
  asserted with the photo's and the dependency section's — the sections whose absence proves the mode. It also asserts
  that the optional fields' placeholders are not numbers (FR-24.5): „0" and „0.00" read as a value rather than an
  absence. The clause tests the *shape* — not a number, and not empty — because the wording is the catalogue's and a
  case pinned to it would go green the moment somebody translates it.
* **E2E-M10-11** `all` (FR-28.2/28.3/28.11) — **implemented** (`item-mark.spec.ts`); removal is its own case,
  **E2E-M10-12**, because it is a separate promise. The picker and its three cases: typing **„Zahnbürste“** puts 🪥 first
  in the suggestion band and one tap sets it; **„Stirnlampe“** suggests 🔦 and the item is saved **unmarked** unless the
  offer is tapped (asserted positively — the stored value stays null, so the case cannot pass by the picker simply being
  slow); **„Zwischenringe“** renders the named empty result and **no** suggestion chips. Then: the search field finds by
  keyword and not by name (typing „regen“ surfaces 🧥 and 🌂 — the index carries the open umbrella, not ☂️), and a facet
  narrows the grid.

* **E2E-M10-12** `all` (FR-28.2): **„Marke entfernen"** clears a set mark back to the empty slot,
  and the action is **absent** on an unmarked item — removal is worded as removal and never offered as "choose the empty
  one".
* **E2E-M10-13** `all` (NFR-4.12): the sections that exist only once the item is saved — photo, *Hängt ab von*, the
  dependency picker, the *Begleitartikel* heading and its add-trigger — are rendered from the catalogue, asserted with
  the app language set to German. English cannot carry this case: a finished English literal and the catalogue lookup
  produce the same pixels.
* **E2E-M10-14** `all` (FR-24.3) (`e2e/lifecycle-delete.spec.ts`): an item a group position holds is deleted from M10's
  delete card. Before the confirm the card states the count and *„Er wird ausgeblendet, nicht entfernt"*; after it the
  row is gone from M9, the quick-add of a *second* group does not offer it, **and the first group still resolves it in
  M8**. The second group is deliberate: the composer already excludes what the open template holds, so asserting the
  autocomplete inside the same group would be green whatever the filter does. The second half is the positive signal the
  first is asserted against — "absent from the inventory" is equally satisfied by the row having been destroyed, which
  is the failure this whole FR exists to prevent.
* **E2E-M10-15** `all` (FR-24.3): an item nothing has ever used is removed outright. A *second*
  item is created and asserted untouched, so "one row fewer" cannot be produced by the list simply failing to paint;
  then the same name is created again, which a retired row holding it would refuse — the rendered proof that the delete
  was physical and that uniqueness ranges over the active rows only.
* **E2E-M10-16** `all` (FR-24.1, UX-14) (`item-editor-tags.spec.ts`): with ten unassigned tags and an empty query the
  form offers **eight** chips and a *„N weitere per Suche"* tail naming the two held back; the search reaches a tag past
  the cap; clearing the query (by keys — a programmatic clear is the event-loss path the suite's `fillIonic` exists to
  avoid) returns to the shelf; tapping the tail focuses the search. Runs at phone width and in German, where it also
  measures that the placeholder fits its box — by briefly rendering the text as the value and reading `scrollWidth`,
  because a canvas re-measure can use the wrong font and then cannot fail.
* **E2E-M7-11** `all` (FR-24.3): M7's row menu → *Löschen* on a Vorlage no trip ever used; the
  confirm says it will be removed for good before the tap that does it, and the row goes. The retire branch for a
  Vorlage is covered by the store and the orchestrator units rather than here, because reaching it through the UI means
  generating a whole trip for one sentence.

**M24 — Aufräumen (FR-24.12).** Four cases in `e2e/inventory-cleanup.spec.ts`, all `local`. Every repair is asserted on
**M9's headings after going back** — a finding that leaves M24's list is equally what a screen that wrote nothing and
re-rendered would show. *Lange nicht gebraucht* has no rendered case: its finding needs a trip that ended months ago,
which the wizard cannot date without a clock seam the suite does not have; the rule, its window and the unseen-trips
line are unit-tested (`inventoryHygiene.spec.ts`, `InventoryCleanupPage.spec.ts`).

* **E2E-M24-01** `all` (FR-24.12) — **implemented**: M9's foot sentence counts the one untagged item, is the
  way into M24, and the suggestion carries its reason (*„like ‚Zahnbürste'"*); taking it leaves M24 all tidy and, back
  on M9, **both rows under one heading and the sentence gone** — the same event reaching both screens.
* **E2E-M24-02** `all` (FR-24.12, FR-24.9) — **implemented**: an item with no reason for a suggestion says
  so; *„Tag wählen …"* opens the give sheet **without** the refiling switch, creates the typed tag, and M9 files the
  item under it.
* **E2E-M24-03** `all` (FR-24.12) — **implemented**: *Behalten* on a single-item tag silences the rule
  **across a reload** (device-local), while the rule's card still stands collapsed to *„Nichts zu tun"* — the positive
  signal that the rule runs and was told, rather than having been switched off.
* **E2E-M24-04** `all` (FR-24.12) — **implemented**: M24 is reached from M9's ⋮ word too; switching *Ohne
  Tag* off removes its card, and M9's count agrees — the foot sentence is gone while the untagged row itself is still
  listed.

* **E2E-G9-22** `all` (FR-24.12, ADR-011) — **implemented**, in `e2e/global-nav.spec.ts` for E2E-G9-14's
  reason: M24 is reached from M9's ⋮ word, named only by the app bar, and its back returns to the inventory with the bar
  naming *Inventory* again — the promise a route added without a `titleKey` or a `parent` breaks silently.

**M23 — Hidden items and templates (FR-24.3, the restore).** Four cases in `e2e/restore-retired.spec.ts`, all `local`,
all reached through M17's row rather than a typed URL.

M23-01/02/03 each retire an **item**, and FR-24.3 governs items *and* Vorlagen, which M23 renders from two different row
builders. E2E-M23-01 uses the Vorlagen segment's *emptiness* as a positive control, which only says something if it can
be non-empty; **E2E-M23-04** is the case that fills it and the Vorlage **retire** branch's rendered case (E2E-M7-11
covers the remove branch and says why it stops there).

* **E2E-M23-01** `all` (FR-24.3): an item a group holds is retired, M23 lists it,
  *Wiederherstellen* brings it back and M9 shows it again. Two positive controls the "it came back" assertion is made
  against: a *second*, untouched item is asserted still present, so "the inventory grew by one" cannot be produced by
  the list repainting from nothing; and the *Vorlagen* segment is asserted empty, so the items list being non-empty is a
  fact about the store rather than about the screen rendering anything at all.
* **E2E-M23-02** `all` (FR-24.3, ADR-034), the case the file exists for: after the retire, a *new* item takes the freed
  name, and the restore then collides. The alert names the holder **while the row is still on M23** — that assertion is
  what separates the refusal arriving before the write from a restore that is enqueued, refused by the push and reversed
  by ADR-031's repair, which on screen is a row appearing and vanishing. A replacement name is typed, the input's value
  is **asserted before the button is clicked** (a row restored as "K" still passes every count), and M9 then shows
  *both* rows — the restored one made room for itself rather than taking the name back. Finally the group still resolves
  the row under its new name, which is the retire's own promise surviving the rename.
* **E2E-G9-14** `all` (FR-24.3, ADR-011), in `e2e/global-nav.spec.ts` rather than in M23's own
  file, because getting to a screen and leaving it are global behaviours: Settings → M23, and the assertion that carries
  it is the **app-bar title**, since M23 renders no heading of its own and the header is the only place the user is told
  what they are looking at. Back returns to Settings and the bar is asserted to say *Settings* again rather than keeping
  the title of the screen that was left. Proved red by removing the route's `titleKey` —
  *"expect(locator).toHaveText(expected) failed / Expected: 'Hidden master data' / element(s) not found"*.
* **E2E-G9-15** `all` (G-9), in `e2e/global-nav.spec.ts`: the settings gear is on every screen except M17 itself, where
  it would only reopen the screen it is on (UX-16). Asserted as presence on a tab root plus absence on the rendered
  settings screen — the settings page's own content is the positive signal the absence rides on.
* **E2E-G9-16** `all` (G-9), in `e2e/global-nav.spec.ts`: at 1280 px a settings section heading is far narrower than the
  area it sits in **and centred in it** (equal gutters to within a pixel), and at 400 px it fills the width again. A
  section heading rather than a control, deliberately: a control sits at one edge whatever the layout does, so it cannot
  tell the two states apart — the language `ion-select` passes the cap assertion against an uncapped build. Both halves
  matter: the second is what keeps the column from becoming a margin on the phone the app is built for (UX-17).
* **E2E-G9-20** `all` (G-9, FR-21.26), in `e2e/global-nav.spec.ts`: the same settings screen's `.app-content` is
  measured at a desktop width (1280 px, where it is capped flat), then at an iPad mini's 744 px — wider than the desktop
  measurement by more than 40 px, so the tablet gap is not inert, and still short of the viewport by the same margin, so
  a gutter survives on both sides. A third measurement back at 1280 px matches the first exactly, which a
  `clamp()`-based layout cannot pass: `vw` only rises with the viewport, so a factor steep enough to widen the column on
  an iPad mini also leaves it pinned at its ceiling for every wider desktop window.
* **E2E-M23-05** `single` (ADR-033, G-7) — **implemented** (`e2e/single/opening-segment.spec.ts`): E2E-M6-24's twin one
  partition up, on the held master pull E2E-M2-18 already uses. „Artikel (0)" and „Vorlagen (0)" must not stand above
  „Archiv wird geladen …": this is the screen a user reaches *because* they are looking for something they retired, so
  the count is the claim that matters. Exact text while held; after the pull only that a count is **stated** — the run
  shares one database and other cases retire rows, so the figure itself is not this case's business.
* **E2E-M23-04** `all` (FR-24.3, ADR-032): the other thing FR-24.3 retires. A group a trip was generated from is deleted
  from M7, and the confirm carries the sentence E2E-M7-11's twin does not — *hidden, not removed* — before the tap; the
  row leaves M7, appears on **M23's Vorlagen segment** (with the items segment asserted empty, the mirror of
  E2E-M23-01's control), offers the restore and **no** *Endgültig löschen* while the trip still holds it, and comes back
  to M7 still holding the position it was created with. One trip generation pays for two screens: the Vorlage retire
  branch and the second half of M23. Mutation-proved by pointing M23's template row at `restoreMasterItem` — a plausible
  copy-paste, since the two callbacks have the same shape — which reddens this case and leaves the three item cases
  green.
* **E2E-M23-06** `local` (FR-24.3, ADR-034, ADR-075) — **implemented**
  (`e2e/restore-retired.spec.ts`): M23 selects like the other lists, and a batch restore keeps the single restore's
  collision refusal. Three hidden items; an active item then takes the second one's name. A **real right-click** on
  the first starts the mode — the rows' own buttons step aside — and a tap picks the second. *Wiederherstellen* on the
  bar restores the first with **no alert**, and leaves the colliding row listed **and still selected** (count *one*)
  beside the unpicked third, which is not; the app bar's glyph leaves the mode and the rows' buttons return; the
  inventory then lists the restored item. The batch delete, its one
  confirmation and its refusal of still-used rows are `RetiredMasterPage.spec.ts`'s.
* **E2E-M23-03** `all` (FR-24.3): a retired row does not become undeletable. While the group still
  holds it, M23 offers the restore and **no** *Endgültig löschen* — asserted as an absence beside the restore button's
  presence, so it is a statement about the row and not about an empty page. The group is then deleted, which makes the
  row unreferenced, the button appears, and the confirm carries M10's "removed for good" sentence. The proof it was
  physical is that the name is free again afterwards, which a row still holding it — retired or not — would refuse.
* ~~**E2E-M10-02**~~ `all` (FR-2.4) — **retired**, two clauses with two different fates. *„Delete blocked while
  referenced"* is **reversed** by FR-24.3 (ADR-032): the refusal is a choice, and UI-Spec M10 says so in as many words —
  the delete retires instead of refusing, asserted in **E2E-M10-14** and **E2E-M10-15**. The *usage count* lives in the
  delete card, and both of those cases assert it, from both ends: *1* on a referenced item, *0* on an unreferenced one.
  The split the sentence promised is not built — the card says „An N Stellen verwendet", one number over templates and
  trips together, and no screen names the two separately.
* ~~**E2E-M10-09**~~ `all` (FR-20.1/20.4) — **retired**: it and E2E-M10-03 are two ids over one section, differing only
  in which half they lead with; the section is **E2E-M10-03**'s.
* **E2E-M4-66** `all` (FR-20.4/20.2): quick-adding an item pulls its required companions **and names them**, as
  FR-20.2's *skip* names exactly what it takes along — silent companions would read as an omission rather than as a
  decision. The action returns what it added, and the **screen** says it, the shape `skipItem` has (FR-5.5). An item
  with no companions says nothing: the positive signal against a snackbar that always fires. Carries the third clause of
  the retired E2E-M4-32 under a live number rather than reviving it. Red-proved.
* **E2E-M4-67** `all` (FR-25.4a): a dense M4 row draws the mode glyph only when the mode is worth saying. 🛒 and 📍 are
  drawn; 🧳 is not, because it is what every other row means. The buy row and the pack row are asserted through the same
  `title` on the same icon, so the silence is falsifiable rather than merely unrendered. The mapping lives in
  `lib/modeLabels.ts` and the rule is an option a call site can omit, which is why M4 needs its own case. Red-proved.
* ~~**E2E-M4-32 (v1.0 catalogue, shadowed)** `all` (FR-20.4/20.2): quick-adding an item pulls its **required**
  companions onto the trip and reports it, while *suggested* ones are not added unasked; skipping the item co-skips
  those companions with the reason naming the parent.~~ — **retired, clause by clause.** The required pull and the
  co-skip with its reason are **E2E-M4-40**; that *suggested* companions do not join unasked is **E2E-M5-23**; *and
  reports it* is **E2E-M4-66**.
* **E2E-M10-03** `all` (FR-20.1/20.4) — **implemented** (`item-editor-sections.spec.ts`): the rules of the *„Hängt ab
  von"* section. Two other cases drive it as *setup* (E2E-M5-23 and the skip-item cascade both declare a dependency
  through this screen to get a companion onto a trip), and E2E-M10-13 reads its heading for a German word — a heading is
  not a behaviour, and a fixture is not an assertion. Three clauses, all on M10 itself: a new relation is *nötig* until
  someone says otherwise, which is what makes FR-20.4's cascade the default; the **reverse list shows the same mode**
  the declaring side chose; and a dependency that would **close a circle is refused before the write**, naming the hops
  (`Kamera → Ersatzakku → Kamera`) rather than saying *invalid*. The refusal is asserted against a positive signal on
  the same screen: the companion row is still there afterwards, so „no dependency row" cannot be produced by a page that
  rendered nothing. The cycle arithmetic itself stays in `domain/__tests__/dependencies`; what this case adds is that
  the fault reaches a user as a sentence. What the reverse list's rows do is E2E-M10-20's (FR-20.1).
* **E2E-M10-20** `all` (FR-20.1/20.4) — **implemented** (`item-editor-sections.spec.ts`): the *Begleitartikel* list
  writes its own end of the relation. A companion is declared from the main item, re-moded and removed there, and
  **every one of those three is asserted on the other item's editor** — the edge is read where it was not declared,
  which is what separates a stored relation from a drawn one. The cycle refusal is asserted from this direction as well,
  against the dependent side still listing exactly one relation: the same edge, so the same answer, whichever end posed
  it.
* **E2E-M10-23** `all` (FR-20.1/24.11) — **implemented** (`item-editor-sections.spec.ts`): a companion the inventory
  lacks is created from the *Begleitartikel* picker. The sheet opens on the query with this item's tag offered first;
  after *„Anlegen"* the editor is still this item's, the picker is closed and the pair is listed — and it is read again
  from the **new item's** editor, with its tag, which is what says both writes were stored rather than drawn. A second
  companion taken with *„Anlegen und öffnen"* lands in its own editor, already naming this item as its main item.
* **E2E-M10-24** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): a retired name in the picker
  is offered back; one tap restores it and declares it, no sheet opens, and M23 is left with nothing to restore.
* **E2E-M10-25** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): the failure path. The item
  in hand already depends on the retired one, so declaring it a companion would close a circle: the refusal names
  the path, and the item **stays retired** — asserted as M23 still listing it, the positive signal a restore that
  ran anyway would remove. Mutation-proved: without the check before the restore, this case goes red.
* **E2E-M10-26** `all` (FR-20.1/24.11) — **implemented** (`item-editor-sections.spec.ts`): the *„Hängt ab von"* picker's
  offer. The created item becomes this item's **main item** — asserted as the dependency row here and as this item
  in the new one's *Begleitartikel* list, which is the direction, read from both ends.
* **E2E-M10-27** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): a retired name in the
  dependency picker is restored and depended on without a sheet; M23 is left empty.
* **E2E-M10-28** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): the failure path from this
  end — the retired item already depends on the one in hand, the refusal names the path, and the item stays retired
  (M23 still lists it). Mutation-proved like E2E-M10-25.
* **E2E-M10-29** `server` (FR-1.9) — **implemented** (`server/multi-user.spec.ts`): Bob is chosen as an item's
  default assignee in M10, Alice records her traveler as Bob's account in M3 step 2, and the review row names Bob and
  is not marked „per person". The choice surviving the create is asserted on the saved item.
* **E2E-M10-30** `local` (FR-1.9, G-8) — **implemented** (`item-editor-create.spec.ts`): Local Mode has no accounts, so
  the editor renders no assignee control; the name field and the „Mehr" row beside it are the positive signal.
* **E2E-M10-31** `local` (FR-20.1) — **implemented** (`item-editor-sections.spec.ts`): a dependency's name is a link.
  From the dependent's *„Depends on"* the main item's M10 renders (its name in the head, the dependent in its
  companions), and from there the companion's name leads back.
* **E2E-M10-04** `all` (FR-22.1/22.5) — **implemented** (`item-editor-sections.spec.ts`): the reference photo is added,
  replaced and removed, and the one trigger words itself for the state it is in (*Add photo* → *Replace photo*). Two
  things make it more than a screenshot: the two sources differ in **shape**, so the assertion is `naturalWidth` and not
  the object URL, which a rewrite changes whether or not the image did; and the item is left and reopened between the
  replace and the removal, which is what says the bytes were *stored* — the preview is resolved from `image_hash`
  through the device, so a round trip proves the write rather than the picker. **The ≤150 KB cap is deliberately not
  asserted here**: the backoff is measured where it is deterministic, in `lib/__tests__/imageResize.spec.ts`, and
  enforced again at handler, store and CHECK (invariant 6). An e2e that re-measured it through a real canvas would be
  asserting the encoder and would be non-deterministic about the one number it claimed to check.
* ~~**E2E-M10-05**~~ `all` (FR-27.8) — **struck**: the *„Enthalten in"* section's promise is **E2E-M10-17**'s, and its
  absence on an unused item **E2E-M10-19**'s.
* ~~**E2E-M10-06**~~ `all` (FR-27.9) — **struck**: the remarks-from-trips section's promise is **E2E-M10-18**'s, and its
  absence on an unused item **E2E-M10-19**'s.
