# M6 — Shopping Views

* **Purpose:** The trip's shopping list (FR-3.2), a feature module of its own (FR-30, ADR-066): it holds the entries
  typed into it, and shows the packing list's buy-mode rows beside them.
* **What M6 is (FR-30):** the two lists as sections one under the other, a ***Fällig*** block above them, M25's
  composer, the list's own entries under their tags, the packing list's buy rows under one heading, and one *gekauft*
  fold per list — **no tabs, no filter bar, no search field, no row sheet for a packing line, and no FR-25.13
  composer**. The screen lives in `client/src/shopping/` and renders lines without knowing whose they are
  (`lib/shoppingSources.ts`); the packing side supplies its rows as lines with their FR-3.3 writes bound in. Not built:
  FR-25.11g/k, FR-25.13a's two fields and FR-25.6's per-item note; owed: FR-25.12's row sheet (*Zugewiesen an* and
  *Beschreibung*), which would apply to both kinds of line.
* **M25's look and feel.** One look and feel across the two lists, M25's: **no tabs**, because a tab hides one list
  behind the other and a thing due tomorrow on the tab not open is a thing nobody sees; **M25's composer** (a card, with
  list chips and day chips); **two-line rows with no ✕** (an entry is removed from its sheet); **one *gekauft* fold per
  list**; a finished packing's *before* **folded at the end**, as M25's is. FR-30.8's rule decides only whether the
  composer still offers *Vor der Reise*.
* **One set of components for M6 and M25**, so the two are uniform by construction. Both screens are drawn from
  `components/global/`: `ListComposer` (the card, the field and its ＋) with `ChipRow`s of `ChoiceChip`s and `DueChips`;
  `DueBlock` (*Fällig*, tinted faintly in the overdue ink on both); `ListSection` (a section's head and count);
  `ListGroup` (a tag's heading and drop frame); `ListRow` (leading slot, name, facts line, trailing tick) inside
  `ListRows` (the open rows as one `TransitionGroup`, so a row put or pushed elsewhere glides to its place on both
  lists); `FoldToggle` (*„› N erledigt"* / *„› N gekauft"*); `RestLine` (a section with nothing open, at the end);
  `TagPicker` (the search-or-create tag mask, test ids `tag-pick-*`) and `EntrySheet` (name, day, tag, *Entfernen*, the
  writing button). What remains per screen is what a line *is* — a task or a thing to buy — never how it looks. The
  shopping module reaches these as kernel (ADR-066).
* **Elements, top to bottom:**
  * **The composer** (`m6-composer`, a `jp-card`, M25's shape): the **text field** with its ＋ (placeholder *„Was
    kaufen? z. B. Milch, Brot …"*), then chips that file the entry as it is typed. **The list** (`m6-composer-list`):
    *Vor der Reise* / *Vor Ort*, *Vor der Reise* chosen — offered only while FR-30.8's rule still names *before*
    (the trip not yet under way); otherwise the row goes and everything written is for *Vor Ort*. **The
    tag**: the tag chips and *＋ Tag* (below). **The day**: M25's day chips (`DueChips`), shown once something is
    typed — *Heute*, *Morgen*, *Vor Abreise* (for *Vor der Reise* only, while that day is later than tomorrow) and
    *Datum…*. The list and the tag stay chosen for the next entry; the day does not.
  * **The *Fällig* block** (`m6-due`), drawn only when something is pressing: every open line overdue, due today or
    in the next two days, **from both lists**, earliest first, one `ListGroup` headed *Fällig* with its count. **A
    line in it leaves its group.** Its rows name their tag on the second line — *Eingetragen* for an untagged entry,
    *Packliste* for a packing line (which carries no day today, so it does not appear here yet).
  * **Two sections**, *Vor der Reise* (`m6-before`) and *Vor Ort* (`m6-local`), each a `SectionHead` whose count is
    **what stands under it** (*„N offen"*). **A list with nothing open under its heading** — also when its last open
    lines stand in the *Fällig* block, since a heading over nothing reads as a list left over — leaves reading order for
    **one line at the end of the screen** (`RestLine`, M25 alike): *„Vor der Reise · nichts offen"*, a statement; *„· 1
    fällig"* in place of *nichts offen* while the block holds some of its lines; *„· 2 gekauft ›"* once something was
    bought, a fold that opens onto the bought rows directly (`m6-before-fold` / `m6-local-fold`). Inside each: the
    packing list's rows in that mode first, **combined under one *„Packliste"* heading regardless of category** (a
    packing category is not this list's tag), then the list's own entries — **a section per tag, A–Z, then the untagged
    under *„Eingetragen"* (FR-30.9)**. **What the close carried over (FR-7.16) leads *Vor Ort* under its own
    heading, *„Von vor der Abreise"*** (`m6-group-carried`): packing rows and untagged own entries alike, marked by
    `carried_over_at`; an own tag or an excursion's heading still wins, and whatever is written at the destination
    afterwards files as usual. (E2E-M6-38) An entry and a packing row of the same name stay two lines. FR-13.3's
    destination entries are not built.
  * **One *gekauft* fold per list**, at the section's end (*„› N gekauft"*, `m6-bought-bar`, M25's *erledigt* fold)
    — see FR-25.11j below.
  * **The empty state** (*„Nichts zu kaufen"*, `m6-empty`) only when nothing is open and nothing bought on either list.
* **A line: two lines at most, as a task's.** The first is the grip (every open line; a dashed placeholder on a closed
  list) and the name; the second, where there is anything to say, the **due pill**, the amount when above one, the tag
  (in the *Fällig* block only) and — for a per-person item — the recipients (FR-25.6). **Who is to buy it (FR-30.12)**
  stands at the row's edge before the check-off, M25's seat (`m6-row-assign-<name>`): on an own entry in Server Mode
  when anybody else is on the trip; an avatar alone while selecting or on a closed list; nothing on a packing line,
  whose person is M4's question. The seat opens the person picker (headed with the entry's name, *„niemand"* last) and
  the hand-over raises a toast with **Rückgängig**. The recipients (*„für Mia"*, an 18 px avatar without a ring) and the
  assignee (the ringed 24 px avatar at the edge) never share a place. The check-off stands at the row's own edge. **No ✕
  on the row**: an own entry is removed from its entry sheet (*Entfernen*, `m6-entry-remove`), as a task is from its
  own. A packing line offers neither.
* **Before the trip, closed (FR-7.12, *built*):** once the packing is finished, *Vor der Reise* is the record of what
  was bought before the trip. Closing the packing moves its open lines to *Vor Ort* (M4's close sheet names the number);
  the list is not drawn in reading order but **folded at the end of the screen**, M25's way: one line (*„Vor der Reise ·
  N gekauft"*, or *„· abgeschlossen"*, `m6-before-fold`) that opens onto the lock sentence (*„Die Packliste ist
  abgeschlossen — diese Liste zeigt jetzt, was vor der Reise gekauft wurde."*, `m6-before-locked`) and the list's bought
  fold, which can be read but not put back. The composer stays, writing for *Vor Ort*. Reopening the packing lifts it.
* **Tags (FR-30.9, *built*):** under the field a **chip row** — the tags still in use on the trip, those made in this
  visit, and *＋ Tag*. A chip selected files the next entry and stays selected after the add; a second tap on it
  unselects and the chip stays. *＋ Tag* (carrying what was typed in the field), and a tap on an own entry's name, open
  the **entry sheet**, laid out like the packing list's creation sheet (`CreateItemSheet.vue`): head *Neuer Eintrag* /
  *Eintrag bearbeiten* with the close, a **Name** field, M10's **search-or-create mask** (`ShoppingTagChooser.vue`, the
  shape of `TagChooser.vue`: a search field *„Tags suchen oder anlegen…"*, the chosen tag as a chip with its ✕, the
  matching tags as chips, a dashed *„… neu anlegen"* chip for a name nothing carries — matched case-insensitively, Enter
  chooses or creates — and a summary line) and one button, *Hinzufügen* or *Speichern*, disabled while the name is
  blank. Nothing is written before the button; *Speichern* writes the fields that changed. There is no inline field for
  a new tag. A packing row's name opens nothing. **An untagged own row carries no label of its own** — a *＋ Tag*
  repeated under every such row reads as clutter at any real list length; the row's own tappability is the whole
  affordance, exactly as a tagged row's is. **The reveal of what was bought is not grouped:** its rows say their tag as
  a small label under the name, and its check (which puts the line back) is at the end like the open rows'. (E2E-M6-31)
* ***Meine* (FR-30.12, *built*):** M25's chip above the composer (`m6-mine`), where anybody else is on the trip: only
  the lines I am to buy, on both lists and in the *Fällig* block; a packing line leaves too. With nothing of mine the
  lists fold to their end lines rather than the empty state. (E2E-M6-37)
* **The day an entry is due (FR-30.10, *built*):** the entry sheet carries a ***Fällig*** row between the name and the
  tag mask — **M25's day chips** (`DueChips`: *Heute*, *Morgen*, *Vor Abreise* where it applies, *Datum…* for the app's
  date control, ADR-035; the day in force as a chip with its ✕) — written with the sheet's button like the other two;
  the composer carries the same chips (above). An open entry with a day wears **M25's due pill** on its second line:
  *Überfällig* (red), *Heute*, *Morgen*, *In 2 Tagen*, a short date further out; one due within two days stands in the
  *Fällig* block instead of its group. Inside a group the dated entries lead, earliest first. A packing line carries no
  day; a bought entry wears no pill and its sheet offers no day. (E2E-M6-35)
* **Several entries retagged at once (FR-30.9, *built*):** a long press on an own row, or the app bar's own icon
  (`checkboxOutline`, mirroring M9's `m9-select`, FR-24.9) — active state on while the mode is on — arms an inline
  **selection**, reaching every own entry on both lists, tagged or not; unlike M9's, this selection offers a *retag*, so
  an already-tagged entry is as selectable as an untagged one. The app bar becomes the selection's bar (G-20): a ✕ to
  leave, *„Nichts ausgewählt"* at zero and *„N ausgewählt"* from one (the same two-form split as M9's own bar, since one
  entry is not a plural), and *„Alle N"* over every own entry; the field and chip row stay in place at rest. Each row
  grows a leading checkbox (a dashed, dimmed slot for a packing row's projection, which never carries a tag and is named
  once below the list rather than repeated per row: *„Packlisten-Positionen tragen nie ein Tag — nicht wählbar."*); the
  row's own tap toggles it instead of opening the entry sheet. A row selected by the long press that started the mode is
  not toggled off by the tap the browser sends on release — the same care M4's row menu takes with its own trailing
  click. Once at least one entry is picked, a bottom bar offers **Tag vergeben** and — where anybody else is on the
  trip — **Zuweisen** (FR-30.12: the person picker headed *„Wer kauft N Einträge?"*; only what changes is written, and
  the toast's **Rückgängig** gives each entry its own assignee back) and **Löschen** (M25's own word and shape: no
  question first — every selected entry is removed at once, the mode ends, and the toast *„N Einträge entfernt"* with
  **Rückgängig** puts each back under its own id, as it was). **Tag vergeben** opens the same search-or-create
  sheet the single entry does — titled *„Tag für einen Eintrag"* / *„Tag für N Einträge"*, and with no trailing summary
  line, since that sentence is written for one entry staying staged until *Speichern* and this sheet applies the instant
  a chip is chosen, to more than one. Choosing files every selected entry at once; the mode ends with the batch, and a
  toast with **Rückgängig** puts each entry back under the tag it carried before. The header's icon is offered only
  while an own entry is open to select. **The gesture and its chrome are shared with M25** (ADR-075): `useRowSelection`
  holds the keys and the hold, `SelectBox` and `BulkBar` draw the box and the floating bar (the count is the app bar's,
  G-20), and `ListGroup` the headings and their drop frame — one component each, so the two lists cannot drift apart.
  (E2E-M6-32) M9 renders the same pieces, without the grip (see M9); so do M11's unassigned bucket and M23 (see there),
  flat lists with neither grip nor headings.
* **A line, put where it belongs (FR-30.13, *built*):** while nothing is selected, every open row carries a **grip**
  (`reorderThreeOutline`, label *„<Name> verschieben"*) at its leading edge, in the checkbox's own place. Pressed and
  carried, it lifts the row (G-21: a chip above the fingertip names the line and the heading it would land in, while
  the row itself only dims in place); inside the heading under the pointer a **3 px bar in the
  action colour, led by a dot,** marks the gap the row will land in — laid over the neighbouring row's edge
  (`data-drop-gap`), so no row moves under the finger, and drawn only where the drop would move something. Inside its
  own heading the row gets no frame and no *hier ablegen*: the bar says it all. Letting go puts the row there. Packing
  and excursion lines move only inside their own heading. Rows in the *Fällig* block are lifted the same way and keep
  their date order there; the placed row stands in its heading once its day has passed. (E2E-M6-39)
* **One entry, dragged into another heading (FR-30.9, *built*):** carried across the list instead, an own row makes
  the heading under the pointer take the same accent frame while it could honestly hold it — a tag's own heading, or
  *„Eingetragen"* to clear one; the packing list's combined heading never frames and never takes it, the same refusal
  a selection gives it. Letting go over a framed heading files the row under it in one act, at the gap it was let go
  in, through the same `bulkSetTag` a selection's *Tag vergeben* uses (a batch of one), and raises the same toast with
  **Rückgängig**. The gesture itself is `useDragToGroup` (FR-7.8's own, first built for the trip's tasks) — a
  lift-carry-drop with no shape of its own beyond a place's name, the gap and what was dropped on it. The frame is the
  mockup's blue outline, on both the carried chip and the target heading. **A heading that refuses the row in hand dims
  for as long as it is in the air** (`data-drop-refused`, set by the gesture from the screen's own rule): the packing
  heading under an own entry, every other heading under a packing line. A line below the list says once in words that
  a packing line moves only inside its heading, next to the checkbox's own hint. The carried chip's frame, the dimmed
  row it left behind and the insert line are drawn once, in `composables/dragToGroup.css`, and reach every screen that
  lifts something with `useDragToGroup` — M25's own drag (FR-7.8) draws the identical frame for the same reason.
  (E2E-M6-34)
* **A bought row's own undo (FR-25.11j, *built*):** checking a row off — an own entry's or a packing row's projection
  alike — leaves the open list with a wash-collapse-fade, M4's FR-25.2 recipe, rather than vanishing, and raises a toast
  with **Rückgängig** immediately, M4's own shape (`presentToast`, anchored clear of the FAB) rather than the dashboard
  card's inline panel (which exists only because several cards share M1's page). The bought fold is the way back once
  the toast is gone. (E2E-M6-33)
* **Whether *Vor der Reise* is offered (FR-30.8 — *built*):** until the trip is under way the composer offers *Vor der
  Reise* and starts on it; once it is — started (even ahead of its date), its first day come, or its packing declared
  finished (FR-5.10) — it writes for *Vor Ort*. M25's composer asks the same rule (`beforeIsOver`). Until the trip
  itself is on the device the rule reads *before* (ADR-033's reasoning). The dashboard card (FR-30.7) opens by the same
  rule, from the same function. (E2E-M6-30, E2E-M25-19)
* **Actions:** Type and tap ＋ (or Enter) → an entry on the list the composer names; the field clears for the next. Check
  off an entry → bought, under its list's fold. Check off a packing row → FR-3.3 on the row (BUY_BEFORE → on the packing
  list, BUY_LOCAL → packed). *Entfernen* in an entry's sheet → removed. A packing row leaves only by being bought or by
  changing mode on M4/M5.
* **The ＋ bottom right (FR-30.6):** M4's FAB, same place and glyph. It scrolls the list to the top
  and puts the cursor in the field — the field stays where it is, so the screen keeps one way to add, and the ＋ is the
  way back to it from a long list. The list scrolls clear of the FAB's footprint (FR-25.11h's 96 px).
* **Adding an inventory item to buy (FR-30.2):** on **M4**, with the composer, then its mode — in M5, or *Vor Ort
  kaufen* from the row menu (FR-5.9). M6 writes no packing rows. The composer, its create sheet (FR-24.11) and its
  duplicate exclusion (FR-25.13d) are M4's and M8's.
* **Per-person items (Addendum §3.25 / FR-25.6, *built* with FR-25.21):** **one aggregated row per per-person item** —
  summed quantity, recipients' names and avatars, one check-off settling every instance. The row is keyed exactly like
  M4's cluster — the shared `perPersonKey` in `domain/packingView.ts` — the bought fold aggregates by the same rule, and
  each list's count counts *rows to buy* rather than `trip_items` rows. A line is not assigned to a traveler from here
  and carries no per-item note: free-form *Used by* is removed (FR-25.10), and assigning a line belongs to FR-25.12's
  owed row sheet.
* **What was bought (FR-25.11j, *built*):** checking a row off takes it off its list — a BUY_BEFORE row by changing its
  mode, a BUY_LOCAL row by being packed — and the row records **which list it left**. A BUY_LOCAL row checked off on the
  **packing list** rather than here records nothing of the kind, and is listed by its packed state instead. The bought
  rows sit in the list's *gekauft* fold, off by default, the count in its label, one tap. A revealed row states where it
  went (*„auf der Packliste"* for a purchase before departure, *„eingepackt"* for one at the destination) and its
  checkbox is the way back — unchecking restores the mode it was bought from and clears the record. Each list has its
  own fold, and the fold is **absent, not empty**, when nothing was bought from that list. Deliberately **not**
  remembered across a session the way M4's switch is (FR-25.18). **Every revealed line carries FR-30.4's stamp** —
  *„gekauft von Andy · heute 14:32"* with the buyer's avatar, or *„gekauft · heute 14:32"* where nobody can be named
  (Local Mode) — under its note. **An entry (FR-30.1)** is revealed the same way, with **no note** — it was never
  anywhere but here.
* **Bought again (FR-30.14, *built*):** an own entry's row in a *gekauft* fold carries a pill ***＋ Nochmal***
  (`m6-bought-again`, label *„<Name> nochmal kaufen"*) at its edge before the tick, in the brand colour so it never
  reads as the tick's green. A tap writes a new open entry with the row's name and tag on its list (*Vor Ort* once
  *Vor der Reise* is over), the purchase staying in the fold; a toast *„„Milch" steht wieder auf der Liste"* with
  **Rückgängig** removes the new entry. While an own entry of that name stands open, the pill is a quiet *✓ Auf der
  Liste* (`m6-bought-listed`) that does nothing. No pill on a packing line, on a finished packing's *Vor der Reise*
  (FR-7.12) or on the dashboard card. (E2E-M6-41)
* **A source's own heading (FR-31.8 — *built*).** A source may name the heading its lines are filed under
  (`ShoppingLine.section`): an excursion's *vor Ort* lines stand under the excursion's name, after the combined packing
  heading and before the own entries, A–Z, and such a heading takes no dropped entry — it is not one of this list's
  tags. Checking one off stamps the excursion's line *vor Ort gekauft*; it stays on the excursion's list, still to go
  into the rucksack. *Vor Ort* only. (`m6-group-source-<name>`, E2E-M27-03)
* **The meal plan's heading (FR-33.3 — *built*).** A meal's ingredients stand under ***Essensplan***, ranked after
  every excursion's heading (`ShoppingLine.sectionRank`), in the order of their meals, each naming its amount and meal
  on the second line (*„1 kg · Mo. Abend · Raclette"*, `ShoppingLine.detail`). An ingredient is due on its meal's day
  (*Vor der Reise*: the eve of departure) and **enters the *Fällig* block on that day only** (`pressingDays: 0`); a
  line in the block names a source's heading where an entry names its tag. Buying one is the meal's own tick
  (M31); a past meal's open ingredients are not listed. (`m6-group-source-Essensplan`, E2E-M31-03)
  * **Summed (FR-33.14 — *built*).** One name's ingredients are one line (`ShoppingLine.parts`): the name, then its
    total in the quiet tone (*„· 1.5 kg"*, `m6-row-total-<name>`), how many meals it serves (*„3×"*,
    `m6-row-uses-<name>`) and *🌿* for fresh food (`m6-row-fresh-<name>`, `ShoppingLine.fresh`; a single fresh
    ingredient wears it too). Its second line lists the parts, *„Mo. Abend 200 g · Di. Früh 300 g"*, wrapping rather
    than running off the row. A tap on the name opens the parts under it (`aria-expanded`, `m6-row-parts-<name>`), a
    row each (`m6-row-part`) with its meal and dish on the left and its amount on the right; a second tap closes them.
    The tick buys every part; in the bought fold the line keeps its total (`m6-bought-total`). (E2E-M31-10)
* **From an idea (FR-29.13):** entered from an idea's *Einkauf* chip (`?fromIdea=`), the composer holds the idea's title
  on *Vor Ort*, focused; the entry written next names the idea, the one after is the list's own again. The parameter
  leaves the address once answered; `‹` returns to the idea (`meta.acceptsLinkedFrom`). On an own entry's second line
  the **💡 line** (`IdeaOrigin`, the bulb in `--jp-brand` and the idea's title, small and quiet) names the idea it was
  made from (FR-29.13); a tap opens the idea over M28 (`?idea=`), and nothing is drawn for an idea the device does not
  hold. Its handle: `m6-row-idea-<name>`.
* **States:** An empty screen, once the trip partition is here (ADR-033), shows the G-7 empty state with the hint *„Trag
  oben ein, was ihr kaufen wollt. Was auf der Packliste gekauft statt eingepackt wird, erscheint hier von selbst."* —
  the one place the screen says where its other lines come from. Both lists empty → the G-9 switcher keeps the
  **shopping pill** and drops only its **count**: the destination exists either way.
* **Navigation:** From the G-9 trip switcher, which carries M6's pill on every one of the trip's views (FR-21.21);
  deep-linkable.
