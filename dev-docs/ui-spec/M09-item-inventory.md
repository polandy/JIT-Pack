# M9 — Item Inventory

* **Purpose:** Central item database (FR-1.1) — the master-data screen for every item that can be packed.
* **Built on the tag set** (FR-24.1, ADR-014), together with M10.
* **Elements (FR-24.6):** a **tool bar that stays while the list scrolls** — the shared search
  row, **always present rather than behind the G-12 magnifier** (the one exception to that pattern, see G-12), and the
  **tag controls of FR-24.8** below it. The **group headings stick directly under that bar**, at a height the bar
  reports rather than a constant, because the bar grows a row when a tag outside the three is chosen. The page head's
  meta line carries the collection's size and, while anything narrows it, what is left of it. The app bar carries
  **no glyph** before the ⋮ (G-12, ADR-050 amendment 1, UX-05). The **sort** (*Nach Tag gruppiert* / *Alle
  alphabetisch*) and the **shown properties** (FR-24.4) head the *Ansicht & Filter* sheet: the sort as a two-way
  segment, the properties as toggle chips under *In den Zeilen zeigen*, each in force at once. Neither is a chip in
  the tool bar, because a fourth chip wraps the sticky bar to three rows at 390 px; which order is active is legible
  from the list itself. The list is grouped by each item's **primary
  tag** so a row appears exactly
  once (FR-24.2); groups order by the tag's `sort_order`, items by name, and items carrying no tag collect in a trailing
  **"Ohne Tag"** bucket that is present only when something is in it. Per row **lean by default**: the leading slot +
  name; tags, weight, price and — where FR-1.9 applies — **who the item is usually for** appear only
  when enabled in that sheet's chips (device-local, `localStorage`, never synced). The assignee line sits under the
  name in the meta weight, a person glyph and the account's display name; a row that names nobody shows nothing, and
  the toggle itself is absent where there are fewer than two accounts (G-8), while a preference already stored is
  kept. **The leading slot follows G-15's inventory ladder — photo → item mark → the primary tag's mark (muted,
  FR-24.13) → primary-tag initial** (Addendum FR-28.4): the tag initial is the last resort, so a marked item is
  recognised here
  the same way it is on the packing list.
* **The tag controls (FR-24.8, ADR-061).** Three chips for the tags holding the most items, each with its count; **„Alle
  N Tags"** opening the *Ansicht & Filter* sheet (under the sort and properties: every tag with its count, searchable,
  several at once under *irgendeiner* / *alle*, plus the **„Ohne Tag"** bucket) — with no tag at all the chip reads
  **„Ansicht"** and the sheet is its head alone, so the sort and the properties never depend on a tag existing; and a
  removable chip for any chosen tag that is not one of the three. There is no swipe axis, and ~~E2E-M9-08~~ went with
  it; E2E-M9-13 holds the geometry: the heading stacked below the tool bar rather than sliding under it.
* **The filter reaches wider than the grouping:** an item matches a chosen tag when that tag is anywhere in its set,
  while the grouping stays on the primary one. Choosing *Sommer* therefore surfaces the swimsuit filed under
  *Kleidung* — the reach a single category could not give (FR-24.2).
* **The selection mode (FR-24.9):** a **hold** on a row arms it (below); the app bar carries no selection glyph
  (UX-05). The rows stop navigating, carry a checkbox and
  lose their chevron; the app bar says how many are picked and offers *„Alle N"* over the **filtered** list (G-20); a
  bar above the tab bar carries *Tag geben*, *Tag nehmen* and *Stilllegen*. Giving and taking open the same sheet — the
  whole vocabulary for giving, only the tags the selection carries for taking — and giving offers *„Als primären Tag
  setzen"*, which is what moves the rows into that group rather than merely labelling them. The two tag actions raise a
  snackbar with one **Rückgängig** for the batch; *Stilllegen* raises a confirm that names both halves of FR-24.3's two
  acts and has **no** undo, because the removed half cannot come back. The mode ends with the batch. **The bottom bar's
  fourth control is ⋯ *Mehr***, between *Tag nehmen* and *Stilllegen*. It opens an action sheet carrying *„Üblicherweise
  zuweisen an …"* (FR-1.9; absent below two accounts, G-8), *„Hängt ab von …"* and *„Begleitartikel …"* (FR-20.1). Four
  is what the bar holds at 390 px before the labels clip, so the rarer acts live behind one door. The bar's count reads
  **„Nichts ausgewählt"** at zero and „N ausgewählt" from one — zero is its own sentence rather than a plural form,
  since the catalogue has two forms and `n === 1` takes the first. The assignee sheet lists the directory with
  **„Niemand"** first — the way an assignment is taken away again — and each row says how many of the selection already
  name it; the two link sheets are one component, differing in the sentence above the list and the direction the edge is
  written in, and carry the required/suggested switch (FR-20.4) plus a capped, name-sorted offer of the inventory that
  names what the cap held back. All three raise the same snackbar with one **Rückgängig**, and a link's result sentence
  names what it skipped. A batch that writes **nothing** — every item already named that person, or every edge already
  there or circular — is a plain toast instead, with no *Rückgängig* to offer, and the selection stays armed so the
  choice can be made again. **M9 selects the way M6 and M25 do** (ADR-075, amended): a **hold** on a row (500 ms, or a
  right-click) starts the mode with that row picked; a tap opens the item outside the mode
  and picks the row inside it — the whole row is the surface, since M9 has no grip to share it with. The row navigates
  in code rather than through a router link, so the release that ends a hold never opens M10. The bars, the box and the
  headings are the shared components (`BulkBar` with *Stilllegen* as its `danger` button, `SelectBox`, `ListGroup`); the
  count, ✕ and *„Alle N"* are the app bar's (G-20), and the tools stay live beneath it. **M9 does not drag**, by
  decision: its groups are the *primary* tag, so a drop would have to decide silently what happens to the tag the row
  leaves, and neither the alphabetical order nor a search has a group to drop on — *Tag geben* with its refiling switch
  stays the way to move rows. *„Alle N"* compares the rows on screen with the chosen ones rather than counting, so a
  chosen row the filter now hides does not make it clear instead of take. (E2E-M9-31)
* **The hidden items are named (FR-24.3):** below the last row, M9 says how many items are **retired**
  and the sentence is the way to M23. A retired item stays out of the list by design (ADR-032); without the sentence
  the head's „N Artikel" would read as the whole collection and M23 would be reachable only by somebody who already
  knew it was there. It is absent while nothing is hidden, while the master
  partition has not arrived (ADR-033 — „nothing is hidden" is a claim), and in selection mode. **The tap target is
  the sentence, not the row it sits in:** a full-width button there runs under the FAB.
* **No pull-to-refresh:** M9 and M7 carry none — one there would fetch nothing and still report the list up to date; the
  sync pulls on its own in Server Mode and there is nothing to fetch in Local Mode. `scripts/refresher-gate.mjs` holds
  the rule for the four that remain (M1, M2, M4, the conflict log): the handler of every `<IonRefresher>` must `await`
  something.
* **The tag manager (FR-24.10, ADR-063):** a **word in the app bar's ⋮** — M9's bar carries no glyph at
  all (G-12, UX-05). It is absent while the
  inventory has no tag. The sheet lists every tag with its **assignment count**, searchable under FR-24.7's fold, and
  each row carries: a **drag grip** on the grouping axis, the **name as the rename control**, the count, **merge** and
  **delete**. A rename refused because another tag holds the name keeps the alert open **with the typed text** and
  says which tag has it. A delete is **refused while items carry the tag** and the refusal offers *„Zusammenführen …"*
  in the same alert; merging asks for the target, confirms with the number of items moving, and deletes the source
  once it is empty. **The grip** sits at the row's leading edge (ADR-075), M6's and M25's: it lifts at once, a
  line in the action colour marks the gap the tag would land in, the carried chip names its new place (*„→ Platz
  3"*, G-21), and the drop moves it there in one act. While a
  search narrows the list the grip is dashed and inert — it moves a tag on the axis, and a move between two rows
  eleven apart on it is an ordering nobody can predict; while picking, the selection box takes its place.
* **Several tags merged in one act (FR-24.14).** A hold or right-click on a tag row starts a **selection** with that
  row picked, as does the checkbox icon in the sheet's head (lit while the mode is on, a second tap leaves it) — a
  checkbox at the leading edge, the whole row picking it, and the per-row acts, the grip and the mark control
  withdrawn, so a tap can mean one thing (ADR-075). The head is the bar (G-20): the line under the title reads *„N
  ausgewählt"*, and *„Alle N"* over the rows the search leaves joins the checkbox icon; *„Zusammenführen"* sits in
  `BulkBar` at the sheet's foot, dimmed under two. The merge asks **which of the picked
  tags stays**, in the same action sheet the single merge uses, each named with its assignment count and the
  **largest first**; the confirm names the survivor, how many items move and how many tags go, and the toast counts
  the **items** that ended up under the survivor. A picked tag **stays picked while a search narrows it away** — two
  names for one idea are rarely one query — and after the merge the manager stays open with the mode on, the merged
  tags simply gone from the axis the selection is read against.
* **A tag carries a mark (FR-24.13).** The tag chips, the group headings, the filter sheet and the give/take
  sheet show it beside the tag's name, rendered through `ItemMark` (G-15). The tag manager gives every row a **mark
  control** before the name — the mark, or a dashed empty slot — which opens the item mark's own picker (FR-28.2) over
  the manager, its suggestion band derived from the tag's name.
* **Giving creates the tag it did not find (FR-24.9).** In *Tag geben*'s sheet a query that names no
  tag — under the uniqueness fold, so a different capitalisation is not offered — puts FR-24.11's dashed row above the
  list, *„‚{Name}' anlegen"* / *„Neuer Tag für N Artikel"*; taking it creates the tag and gives it in one act, and the
  snackbar's *Rückgängig* removes the tag again with the assignments. *Tag nehmen* never offers it.
* **The way into M24 (FR-24.12).** *„Aufräumen"* is a word behind the ⋮, after *„Tags verwalten"*, offered
  whatever the count. While a rule finds something, a sentence at the list's foot above the retired count says *„N
  Hinweise zum Aufräumen"* and is the way in — like that count, **the sentence is the tap target**, absent before the
  partition has arrived (ADR-033) and in the selection mode.
* **The group heading is the jump (FR-24.8):** it opens the list of groups with their counts and **scrolls** to the
  one chosen, leaving the list whole — filtering takes rows away, jumping does not. It is offered only where it is a
  question: in the grouped order, outside a search, with more than one group. The scroll waits for the sheet to have
  dismissed, because an overlay locks the scroll host while it is up.
  **The heading is drawn by `ListGroup`** (ADR-075, amended), M6's and M25's heading, so the three
  lists look alike: the row divider with the tag's mark before the name. M9 switches on the three extras only it needs —
  the group's **count** at the trailing edge, the heading **sticking under the tool bar** (`--list-group-top`, the
  measured bar height) and the **jump** (a chevron in the accent colour; the whole heading is the control). The groups
  do not sit in one card each: the list is one run of rows under its headings, as on M6 and M25.
* **Searching (FR-24.7):** the field matches **name, tags, mark keywords and — where FR-1.9 applies — the default
  assignee's name**, folding both spellings of an umlaut; while a query is running the
  list leaves its tag groups: the results are grouped by **why** they matched, the assignee last, and a row that
  matched through something else says *über <tag>*. A **dead end names its cause** — with a
  tag chip active the empty state reads *„Kein Treffer in ‚Hygiene'"*, counts the hits outside the filter and offers
  *„In allen Artikeln suchen"*, which drops the filter and keeps the query. The rule itself is
  `client/src/domain/itemSearch.ts`; what M9 owns is the grouping and the sentence.
* **What the search did not find, it offers (FR-24.11):** while the query names **no active item
  exactly** (under the search's fold), a dashed row sits **above** the results — and above the no-match sentence when
  there are none: *„‚{Name}' anlegen"* with the line *„Neuer Artikel — Name und Tags genügen"*. It opens a sheet
  (`SheetHead` *„Neuer Artikel"*): the name, prefilled from the query; the tag control M10 uses, with **every tag
  narrowing the list already assigned** and the tags of the name hits offered first, marked in the done hue; a line
  saying weight, price, mark and photo follow in the item view; then *„Anlegen und öffnen"* and *„Anlegen"*. After
  *„Anlegen"* the screen **stays**: the query and the filter are untouched, the new row wears *„Neu"* until the query
  changes, the offer is gone, and a toast *„‚{Name}' angelegt."* with *„Öffnen"* sits above the FAB (anchored to it,
  like M4/M7/M8). A name that only a **retired** item carries is offered back instead — *„‚{Name}' ist stillgelegt"*
  / *„Wiederherstellen statt neu anlegen"*, in the caution hue — and a tap restores it in place, without a sheet.
  Enter in the field opens the sheet and never writes. Absent before the partition has arrived (ADR-033) and in the
  selection mode.
* **Actions:** Tap → M10; FAB → new item. **Deleting lives in M10 (FR-24.3, *built*).** **Merging duplicates is
  FR-24.15** — in FR-24.9's selection mode, behind the ⋯ sheet, offered from two picked rows up. It opens its own
  sheet (`MergeItemsSheet`), not FR-24.14's action sheet: a tag is a name, an item is a name plus tags, a weight, a
  photo and a past, so every candidate says **what it brings** — its tags, its weight, whether it has a photo, how
  often it was used — and the **most-used is offered first**, being the row the rest of the data already hangs on.
  The confirm names the survivor and how many rows go; the sentence afterwards names what was **taken over** (the
  weight, the mark, the photo, the assignee), how many Vorlagen collapsed a position and how many companion edges
  were dropped — the parts of a merge that are invisible on the list. **Trip history is not re-pointed** (ADR-069),
  so the losing row is usually *retired* rather than gone, and the confirm may not read as an undo: M23 brings the
  row back, not the references that moved. The row swipe stays *proposed*: a shortcut past M10 is worth little while
  M10's own card carries the usage count and the outcome sentence — a swipe reveal has room for a label and not for a
  reason. It returns, if it returns, as a second
  entry point to the same rule and the same wording.
* **A retired item is absent, not dimmed (FR-24.3).** A row the lifecycle rule hid leaves this list, the tag axis counts
  and the search — no strike-through, no greyed section. **It goes to M23**, its own
  screen off Settings, not a filter chip on the tag axis (a lifecycle state is not a tag, and the same chip would then
  be owed on M7) and not a folded section at the foot of this list (FR-24.4 made M9 lean on purpose, and the same
  section would be owed twice). Retired rows leave M9 and do not come back as a
  mode of it.
* **Navigation:** Tab 4.
