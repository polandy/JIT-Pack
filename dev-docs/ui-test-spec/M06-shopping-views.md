# M6 — Shopping Views

The shopping list is a module of its own (FR-30, ADR-066): entries typed into it are rows of `shopping_entries`, and
the packing list's buy-mode rows are shown beside them. Every case below reaches a packing row the way a person does —
added on M4, its mode chosen in M5 (`addBuyRowOnM4`) — because M6 writes no packing rows; the cases live in
`client/e2e/shopping/`. M6 has no inventory composer, so its composer cases (E2E-M6-21, E2E-M6-25) are retired.

* **E2E-M6-01** `all` (FR-3.2, FR-30.11) — **implemented** (`e2e/shopping/shopping.spec.ts`): the two lists (Before
  departure / At destination) are sections one under the other, no tabs; each head counts the **things to buy** open
  under it rather than rows (FR-25.6) — *„3 open"*, a bare head for none — and the empty *Vor Ort* says so in its own
  line. The rows come from M4 with a buy mode; one entry is typed into M6's own field, for *Vor Ort* through the
  composer's list chip, and is asserted under *„Eingetragen"* (FR-30). A tagged master item's category does not surface
  as a heading: the packing rows are combined under one *„Packing list"* heading, asserted by name, and a per-category
  heading is asserted absent. The clause about the destination list showing **destination-checklist entries
  separated** is **not testable yet**: those are FR-13.3 standing entries, which wait for trip series in the client, and
  would pre-fill entries (FR-30).
* **E2E-M6-02** `all` (FR-3.3) — **implemented inside E2E-M6-17 and E2E-M6-22** rather than as a case of its own: both
  halves of this promise are asserted there — the row leaving the list, and the reveal note naming where it went — so a
  third case would re-run them for an id's sake. M6-17 also asserts that **the packing list is actually visited**,
  because *„on the packing list"* is a string until the screen
  it names has been looked at: check off a BUY_BEFORE item → it transitions to PACK and leaves the list; BUY_LOCAL →
  packed, and it leaves the list too. *„with animation"* is deliberately dropped from the assertion set: a transition
  nobody can observe deterministically is a `waitForTimeout` waiting to be written.
* **E2E-M6-03** `all` (FR-5.6) — **implemented inside E2E-M6-01**: free-text add directly into either list, the list
  chosen with the composer's chip. The free text is an **entry of the list's own** (`shopping_entries`, FR-30.1), not a
  packing row; E2E-M6-26 asserts it reaches no packing figure.
* **E2E-M6-04** `all` (FR-3.2) — **implemented** (`e2e/shopping/shopping.spec.ts`): with both lists empty, M4's ⋮
  keeps the **shopping entry** and drops only its **count** — the destination exists either way, and hiding the entry
  would leave an empty trip unable to reach M6 at all. The entry lives in the menu (ADR-050), so the count is part of
  the word rather than a badge.
* **E2E-M6-05** `all` (FR-25.6) — **implemented** (`shopping/shopping.spec.ts`): a **per-person** item in a
  buy mode appears in the shopping list at all — the regression it guards decides open-ness from the item's own
  `packed`/`quantity`, which a per-person item does not carry. It renders as **one aggregated row** with
  the summed quantity ("6×", from 2 + 3 + 1), the recipients named ("for Andy, Leonardo, Mia") and their avatars —
  **not** one row per traveler. The **list's own head** (*Before the trip*) is asserted with it, reading *"1 open"*:
  it counts things to buy, so a head reading three over a list showing one is the same lie in the other direction.
* **E2E-M6-06** `all` (FR-25.6/3.3) — **implemented**, and the half that matters: a single aggregated row
  that settles only one instance is worse than three honest ones. Checking off that aggregated row settles **every**
  instance in one act — a BUY_LOCAL per-person item leaves the list fully packed for all recipients, and a BUY_BEFORE
  one moves to PACK for all of them. Asserts no instance is left behind — through the **empty state**, because two
  instances left over would still render a row of their own, and through the undo, which brings the whole amount back.
* **E2E-M6-07** `all` (FR-25.6) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it is.
  A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and the
  composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant 4's
  shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* a per-item note can be added from the row, is shown inline on it, survives a re-render, and can
  be edited and cleared — without leaving M6.
* **E2E-M6-08** `all` (FR-25.10) — **implemented inside E2E-M6-05**: the recipients line carries no control,
  asserted beside a positive count of the row's one checkbox so the absence has something to fail against: the shopping
  row offers **no free-form "for whom" control**; the recipients shown are derived from membership only. Guards against
  reintroducing the attribution FR-25.10 removed.
* **E2E-M6-16** `all` (FR-25.13a) / **E2E-M4-21** `all`: both quick-adds carry a **visible confirm button** in every
  mode, and adding works by tapping it alone — no keyboard involved. Guards the phone case, where relying on Enter
  leaves no reachable way to commit. **M6's half (FR-30):** M6's own field carries the same visible add
  button, and every entry in `shopping/shopping.spec.ts` is committed by tapping it (`addEntry`), never by the keyboard.
* **E2E-M6-12** `all` (FR-25.13a) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* the quick-add offers name, description and a *Zugewiesen an* chip row. Adding with all three set
  produces a row carrying the description inline and the assignee mark. **Enter commits from the description field
  too.** Regression guard: tapping an assignee chip must **not** clear an already-typed description — the failure mode
  of re-rendering the form on selection.
* **E2E-M6-13** `all` (FR-25.13a) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* after an add, the **assignee stays selected** for the next item while name and description are
  cleared. Asserts the carry-over is on the assignee only.
* **E2E-M6-17** `all` (FR-25.11i/j, FR-30.11) — **implemented**: checking off a row hides it; the list's own *gekauft*
  reveal — M4's FR-25.2 shape, not a filter sheet, which M6 does not have — states the count and one tap reveals the
  row in a section of its own, whose checkbox restores it to the open list. Covers the **BUY_BEFORE** case
  specifically, where checking off changes the item's mode and would otherwise make it unreachable from the shopping
  side; the revealed row states where it went ("auf der Packliste"). Default is hidden, and the reveal is **absent**
  while nothing has been bought. The bought packing row empties *Vor der Reise*, so its purchase is counted by the
  list's line at the end (*„Before the trip · nothing open · 1 bought"*), its state read off `aria-expanded` rather
  than a changing label, and putting it back returns the list to its place.
* **E2E-M6-24** `single` (ADR-033, G-7, FR-30.11) — **implemented** (`e2e/single/empty-state-hydration.spec.ts`):
  a screen still loading states no count and no empty list — two answers on one screen, and the empty one is what a
  reader acts on. While every trip pull is held, M6 shows its loading line and no empty state, no list and no section;
  once the partition lands it says *„Nothing to buy"*: the empty answer is deferred, not dropped, because a genuinely
  empty list is worth naming. `single` for E2E-M4-86's reason — only a backend-backed run has the moment.
* ~~**E2E-M6-25** `local` (FR-24.11 in the composer, FR-25.13): an unknown name typed into M6's
  composer goes through the *„Neuer Artikel"* sheet and nothing is written before *„Anlegen"*.~~ — **retired
  (FR-30.2)**: M6's field adds entries, which are no inventory items and need no sheet. The create sheet's rule is
  covered on M4.
* **E2E-M6-26** `local` (FR-30.1) — **implemented** (`shopping/shopping.spec.ts`): an entry typed on
  M6 is on the shopping list only. With one packing row in *Buy there* the trip reads *0/1*; after *„Milch"* is typed
  for *Vor Ort* (the composer's list chip), the entry sits under *„Eingetragen"* before the packing row, that list's
  head counts *„2 open"* and the switcher pill **2**, and M4 still reads *0/1* with no *Milch* row — the positive signal
  that the entry became no packing row.
* **E2E-M6-27** `local` (FR-30.1/FR-25.11j) — **implemented** (`shopping/shopping.spec.ts`): an entry
  is checked off, survives a reload **under the reveal**, is revealed with **no note** (it was never elsewhere), is put
  back by unchecking, and is removed from its sheet (*Remove*; the row has no ✕) — and a second reload shows only the
  entry that was not removed. The list's fold reads *„1 bought"*.
* **E2E-M6-28** `local` (FR-30.2) — **implemented** (`shopping/shopping.spec.ts`): a packing row is on
  the shopping list exactly while its mode says so. A *Buy there* row appears in the *Vor Ort* section; it opens no
  sheet (not a button), so it offers no removal. Set back to *Pack* in M5, it is gone from the section (empty state)
  and from the pill's count — a copied entry would have stayed.
* **E2E-M6-29** `single` (FR-30.4) — **implemented** (`shopping/single/purchase-stamp.spec.ts`): who
  bought it, and when. An entry and a *Buy before* packing row are both checked off; a **second browser context** opens
  M6 fresh from the server and finds two stamps, each *„bought by <the Single-User account> · today …"*. `single`
  because the buyer is stamped by the server (invariant 3) — the `local` cases can only see the time, and do:
  **E2E-M6-17** (the packing row keeps its purchase time although its mode is *pack* again) and **E2E-M6-27** (the
  entry's time survives a reload) each assert *„bought · today"*.
* **E2E-M6-31** `local` (FR-30.9) — **implemented** (`shopping/shopping.spec.ts`): the entry sheet
  (opened by *＋ Tag*) adds *Pasta* with a tag made in its search-or-create mask, and the tag stays selected for the next
  entry typed in the field; unselecting the chip leaves it in place (a tag nobody carries yet must not vanish) and the
  next entry has no tag; the same sheet, opened from an entry's name, is prefilled and renames it and files it under a
  new tag, which A–Z puts first and which empties the *Eingetragen* section. The check-off's bounding box is right of
  the name's — the positive signal for „at the end", which a checkbox left at the start would fail. Buying a tagged
  entry takes it out of its group, the reveal is flat and names the tag in the row, and the tags survive a reload.
  The entries stay on *Vor der Reise*, *Probe* is removed through its sheet, and the fold is that list's (FR-30.11).
* **E2E-M6-32** `local` (FR-30.9) — **implemented** (`shopping/shopping.spec.ts`): several own
  entries, already tagged or not, are retagged in one act. A long press (`contextmenu`, its deterministic seam) on an
  untagged entry enters an inline selection with that entry pre-selected; *„Alle N"* takes an already-tagged one too —
  a reach beyond M9's own selection screen (FR-24.9), which offers no retag. The bulk bar's *Tag
  vergeben* opens the same search-or-create sheet a single entry's does, titled for the batch; choosing a tag files
  both at once, the mode ends with the batch, and the toast's undo puts each back under the tag it carried before.
* **E2E-M6-33** `local` (FR-25.11j) — **implemented** (`shopping/shopping.spec.ts`): a bought row
  leaves the open list smoothly rather than vanishing, and raises its own toast with an undo — M4's shape
  (`presentToast` with a button), not the dashboard card's inline panel, which exists only because several cards share
  that page. The undo puts the row back without the reveal ever being opened.
* **E2E-M6-34** `local` (FR-30.9) — **implemented**
  (`shopping/shopping.spec.ts`): one own entry, lifted by its grip (`useDragToGroup`, FR-7.8's own gesture) and
  dropped onto another own section, is retagged in one act — a batch of one, through the same `bulkSetTag` a
  selection's *Tag vergeben* uses, so its undo diffs against the entry as the drop actually left it rather than the
  pre-drop snapshot. The packing list's combined heading refuses the drop — it never highlights and never takes it —
  since it carries no tag of its own to file under; while the entry is in the air, that heading dims rather than
  sitting inert (an untouched heading reads as broken, not as ineligible). The packing line carries a grip of its own
  (FR-30.13) and the line below the list says where it may go. Also asserts the travelling clone's border, drawn from
  `composables/dragToGroup.css` rather than this screen's own style.
* **E2E-M6-35** `local` (FR-30.10) — **implemented** (`shopping/shopping.spec.ts`): a due day on an
  own entry. On a running trip, *Pasta* gets tomorrow in the entry sheet through the app's date control, written on
  *Save*. On the list it wears *Tomorrow* (the *soon* state) and *Brot* wears nothing; *Pasta* stands in the **Fällig**
  block above both lists, named *„Added here"*, while *Brot* stays alone in its group, and the block's box is above
  *Vor Ort*'s (FR-30.11) — read back after a reload. Then M1: a fresh load
  says *„1 purchase due"* once (Local Mode's stand-in for the push), and the trip's shopping card lists *Pasta* first
  with the same pill. The server's `shopping_due` reminder is held by Go tables (`TestPlanShoppingDue_*`,
  `TestRemindDueTasks_*`), not driven here: its time is a wall clock.
* **E2E-M6-36** `local` (FR-30.11) — **implemented** (`shopping/shopping.spec.ts`): both lists stand
  on one screen, what is due today leads above them, and an entry is removed from its sheet. On a planned trip the
  composer's *Before the trip* chip is pressed; *Brot* goes there, *Milch* goes to *At destination* by its chip with
  *Today* from the day chips. *Milch* stands alone in the **Fällig** block with *Today* and *„Added here"*; *Vor der
  Reise* holds *Brot* under *„1 open"*; *Vor Ort* has no row and is its line at the end, *„At destination · 1 due"*,
  since its one open line is up in the block, not a bare head in place. The boxes read
  block, then before, then local. *Brot*'s row carries no button; removed from its sheet, *Vor der Reise* folds to its
  line at the end, *„Before the trip · nothing open"*
  — and after a reload *Milch* is still in the block and *Brot* gone. Every clause but the removal would fail on a
  tabbed screen, and the missing-button clause on a row that carries a ✕.
* **E2E-M6-37** `server` (FR-30.12) — **implemented** (`e2e/server/multi-user.spec.ts`): an own entry's
  empty seat stands at the row's edge and adds no second line; it opens the task's picker, and picking the other
  account fills the seat with them. That account is told (the toast names the entry and who handed it over), sees
  itself on the entry on its own open M6 without a reload, and *Meine* narrows its list to that one entry. E2E-M25-05's
  shape for a purchase; `server` because the seat is absent where nobody else can be picked (G-8).
* **E2E-M6-38** `local` (FR-7.16) — **implemented** (`close-packing.spec.ts`): an own entry written for before
  departure is carried by *Finish packing* and stands under *„From before departure"* at the destination; an entry
  written there afterwards does not — both are in *Vor Ort*, only the carried one under that heading.
* **E2E-M6-39** `local` (FR-30.13) — **implemented** (`shopping/shopping.spec.ts`): three own entries typed one after
  another read in that order, not A–Z; the last is dragged above the first, and the first row carries the insert line
  (`data-drop-gap="before"`) before the drop. Of two packing lines, the second is dragged above the first inside the
  packing heading. After a reload both headings still read in the new order — the places were written, not painted.
* **E2E-M6-40** `local` (FR-30.9) — **implemented** (`shopping/shopping.spec.ts`): an untagged entry and a tagged
  one are selected (a hold, then a tap) and removed with **Löschen**; only the unselected entry stays, and the mode
  ends. The toast's undo puts both back under their headings, and after a reload they are still there — re-created,
  not only repainted.
* **E2E-M1-25** `local` (FR-5.10 with FR-7.10 on M1) — **implemented** (`close-packing.spec.ts`): a
  trip is packed; while its packing is open the hero's date line names the phase *Packen*. Once the packing is
  finished the hero carries **no packing figure**, **no** *Packen abgeschlossen* line, and the phase reads *Vor Ort*.
  The pair is the case: a card that had merely lost its figure would satisfy half of it.
* **E2E-M1-26** `local` (FR-7.10) — **implemented** (`close-packing.spec.ts`): the hero's task block
  takes a task in its field, lists it, shows the check to the right of the words, and drops the row when it is ticked.
  Folded, the head and the field stay and an added task moves the count without unfolding the block (the count is
  the positive signal for that absence), and the fold survives a reload.
* **E2E-M1-27** `local` (FR-7.10) — **implemented** (`close-packing.spec.ts`): the shopping block adds
  an entry, lists it, and buys it on the right-hand check; the hero contains **no control inside a link**, and
  *Packliste öffnen* is there.
* **E2E-M6-30** `local` (FR-30.8 with FR-5.10, FR-30.11) — **implemented** (`close-packing.spec.ts`): M6 stops
  offering *Vor der Reise* once that moment is past; the rule decides the composer. The trip is still **planning** —
  nobody tapped *Start trip* — and the composer offers the list chips with *Vor der Abreise* pressed; the packing is
  then finished on M4, the chips are gone, and an entry typed lands in *Vor Ort* — the positive signal beside the
  absence. The planning status is what makes the case about FR-30.8 rather than about the trip's phase alone.
* **E2E-M6-22** `all` (FR-3.3/25.11j, FR-30.11) — **implemented**: the destination list's half. A BUY_LOCAL row never
  changes mode — being bought there *is* its packed state — so the record is the only thing that keeps the two lists'
  reveals apart. With *Milch* bought, *Vor Ort* has nothing open and folds to its line at the end, *„At destination ·
  nothing open · 1 bought"*, which holds the one bought row, noting it was packed; *Vor der Reise* keeps its open row
  and has no fold — exactly one fold on the page.
* **E2E-M6-18** `all` (FR-25.11k) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* M6 shows **no search field by default**; the magnifier in the tab row reveals and focuses it,
  typing filters the list, and ✕ **closes** the field rather than merely clearing it. The filter icon sits beside the
  magnifier and carries the active-count badge. Asserts the list regains its full height when the search is closed.
* **E2E-M6-19** `all` (FR-25.13b) — **M6's half retired (FR-30.2):** M6 carries no inventory composer, so it offers
  no suggestions, and an entry has no category to adopt. M4-21 carries the rule: typing at least two characters offers
  master-item suggestions; picking one fills the name **and adopts that item's category**, including a category this
  trip has not used yet. Without a pick the category defaults to *Sonstiges*. Regression guard: choosing a suggestion
  must not clear an already-typed description, and the suggestion strip must redraw **without** re-rendering the
  form.
* **E2E-M6-20** `all` (FR-25.12) — **not implemented; owed by decision**, in its own PR with UI-Spec, e2e and an
  eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy kauft das"* is the
  multi-user case M6 cannot express, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* a row with no assignee shows an **edit glyph**, not a plus.
* ~~**E2E-M6-21** `all` (FR-25.13c/25.13d): what the trip already carries is offered on no shopping
  tab either — not in the composer's autocomplete, and in the browse-sheet only as the *„schon drin"* state.~~ —
  **retired (FR-30.2): M6 carries no inventory composer**, so there is nothing on M6 that offers an inventory item at
  all. The rule itself is the composer's and is covered where the composer is, on M4 and M8.
* **E2E-M6-14** `all` (FR-25.11g) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* M6 shows the same filter bar as M4; its sheet offers *Zugewiesen an*, *Für wen* and *Kategorie*
  and — unlike M4's — **no grouping section**. Filtering by an assignee narrows the list and shows the removable chip.
  The unassigned bucket reads "niemand zugewiesen" and leads the list. M4's and M6's filters are **independent**:
  setting one must not change the other.
* **E2E-M6-15** `local` (FR-25.11h, FR-30.6) — **implemented** (`shopping/shopping.spec.ts`): with fourteen entries on a
  390 × 700 viewport and the list scrolled to its end, the last row's box does **not** intersect the ＋ (checked red with
  the list's bottom padding removed); the field is then out of view, and one tap on the ＋ brings it into view
  **focused**, ready for the next entry. M4's half is E2E-M4-20's.
* **E2E-M6-09** `all` (FR-25.12) — **not implemented; owed by decision**, in its own PR with UI-Spec, e2e and an
  eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy kauft das"* is the
  multi-user case M6 cannot express, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* tapping a shopping row opens its sheet with *Zugewiesen an* and *Beschreibung*.
  Assigning a buyer shows that person on the **right** of the row with the 🛒 badge, while derived recipients stay on the
  **left** — asserts the two are visually distinct even when the buyer is also a recipient. "niemand" clears the
  assignment.
* **E2E-M6-10** `all` (FR-25.12) — **not implemented; owed by decision**, in its own PR with UI-Spec, e2e and an
  eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy kauft das"* is the
  multi-user case M6 cannot express, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* a description entered in the sheet renders inline on the row, survives closing
  and reopening, and can be cleared. Both buyer and description are optional — a row with neither renders without either
  mark.
* **E2E-M6-11** `all` (FR-25.13, FR-30.2): M6 has **no permanent "add" row** and no native `prompt()`. It carries no
  shared composer; it has one text field of its own, always shown, which adds to the list its chip chooses
  (E2E-M6-26/27); the ＋ FAB is FR-30.6's (E2E-M6-15).
