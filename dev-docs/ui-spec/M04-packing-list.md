# M4 — Packing List (Trip Detail) — *core screen*

* **Purpose:** The live, collaborative packing workspace, and — by decision — **the trip screen itself**: tapping a trip
  in M2 or M1 opens M4 directly, with no hub in between. Highest design investment.
* **No phase hub in the MVP.** A four-phase trip hub (*Planen · Vorbereiten · Unterwegs · Danach*) was mocked and
  rejected. Two reasons: three of its four panels would be North-Star content with nothing behind them (idea board, day
  plan, expenses — `Vision_NorthStar_v1.0.md` §2 marks Plan and During as ❌ new), and its remaining entries duplicate
  what M4 already reaches (G-12). A hub with two dead tabs claims a structure the app does not have, and every later
  design question would have to ask "hub or M4?". **Re-entry point, so this stays deliberate rather than forgotten:**
  when the Plan and During phases acquire real content, they attach *here* as a phase frame above M4 — M4 becomes the
  *Vorbereiten* phase rather than being replaced.
* **The screen (Addendum §3.25).** It gives the actual packing as much room as possible. The full reasoning per decision
  lives in the addendum; what M4 *is*:
  * **The header line** — packed/total · weight with the presence facepile, and — once the trip has a task — **the
    tasks' own figure** as the share's pair (FR-7.4, FR-7.6; the window's, FR-7.7): same ring, *„Beim Packen 1/4"*
    (FR-7.14 — it counts the window, and three screens saying *Aufgaben* with three numbers would read as a defect), *„3
    offen"*, a track; side by side, or on two rows where the line is too narrow for both sentences (the line's height
    allows for it). **The figures are a card** (`.jp-card`, G-14): the line itself is page-coloured with the page's
    gutter, so the card has the same radius and width as the cards below it rather than being one full-width,
    square-cornered band. A tap unfolds *Aufgaben für die Reise* and scrolls it into view. Nothing else. It stays
    **unfiltered**, so real progress is visible whatever the current view shows. On scroll-**down** the whole line hides
    and any upward scroll brings it back — and so does a list the hiding itself made fit its screen: with nothing left
    to scroll, no upward gesture could, and the view switcher above would stay gone.
  * **The page head reads *Packliste* over the trip's name, at every width (ADR-050)** — the same two lines every
    other view of the trip has, so a switch between views changes the title and never moves the head.
    **"S…" names nothing:** with search, filter, fold-all, the FR-27.5 lifecycle step, the sync glyph and
    the settings gear beside it, 54 px are left at 390 px and "Samedan 2026" renders as **"S…"** in the bar — measured
    off the visual baseline, and weighed on a rendered four-way round (`UI_Concept_M4Title_variants.html` at
    `6b148419`). On scroll, *you generally know which packing list you are on*, so identity does not migrate into the
    app bar. The head collapses on the same gesture as the line (FR-21.17), which is 89 px of a 390×844 phone returned
    to the list — on the reader's *gesture* and on nothing else: a wheel, a touch drag, a key or the scrollbar. A scroll
    the browser makes to bring a control into view leaves both standing, because answering it moves every row by the
    head's height under a finger already on its way to one (E2E-M4-135).
  * **The line draws the trip as a figure, not as a fraction** (FR-21.23): a ring, the share in words (*„1/4 gepackt"*)
    and a track, with the weight on the second line under it. It is the same `ProgressFigure` M1's and M2's hero cards
    carry, from the same percentage — the screen where the progress is made carries it too. Measured on a 390×844 phone:
    59 px while it stands, and it still yields entirely on the way down (FR-21.17).
  * **The list stays where it was left.** Opening an item is a state of the list's own page (ADR-046), so the list never
    leaves the screen and keeps its offset and its folded header line by simply staying — a remount would put a
    forty-row list back at the top mid-pack, the screen's most expensive small failure. The line also stops travelling
    entirely under `prefers-reduced-motion`: it is the largest movement on the screen and it happens while the list is
    moving too.
  * **Actions live in the app bar (G-12), not in the header:** search (collapsed behind its icon; opened, its field
    takes the progress card's place in the sticky line and holds it while the head yields — UX-18), filter (badge =
    active facet count), fold-all — the three glyphs the bar's budget allows, and the three tapped while packing. The
    trip's *other views* are the **G-9 switcher under the page head** (FR-21.21, ADR-051): *Einkaufen* stands in the
    switcher and carries its open count — things to buy, the same arithmetic M6's segments use — while *Gepäck* and
    *Auswertung* head the ⋮ (ADR-051 amendment 1), ahead of packing's own entries (G-12).
  * **One door to the quick-add** (FR-21.24): the ＋ FAB, and nothing else. A collapsed composer pill above the list
    would say the same thing as the FAB hovering over it — the FAB is what stays, because it is reachable from anywhere
    in a list and the pill only from the top of one. M8's editor makes the same choice, and M6 and M25 make it for
    their own composer. *Rejected:* dropping the FAB instead, which would put the app's one-tap add behind a scroll
    to the top on the longest list it has.
  * **Faceted filter panel** (FR-25.11): a bottom sheet holding *Gruppieren nach*, three reveal switches (*Erledigte*,
    *Anderen zugewiesen* and *Spätpacker*, FR-25.27), and the facets Person / Kategorie / Beschaffung / Gepäck /
    Merkmale / Status. OR within a facet, AND across facets; active values appear as removable chips under the header.
    The panel has **no apply button** (FR-25.11b-rev) — every tap is in force behind it, and the head states the outcome
    — its values are **chips rather than folded accordions**, each axis carries an icon, and it is visibly a layer over
    the list rather than more page. **Status (FR-25.11l)** has three values — *Gepackt* / *Bewusst weggelassen* / *Noch
    nicht gepackt* — that override the Erledigte switch for whichever bucket is picked, so "show me only the skipped
    rows" works whether or not done rows are otherwise revealed.
  * **The empty list says what actually hid the rows.** With every row assigned to somebody else and neither a search
    nor a facet set, M4 reads *„Alles ist bei jemand anderem"* and names them, and its action is *„Alle anzeigen"* — the
    same reveal the foot bar offers. FR-25.20's hiding is not a filter anybody chose, so *„Keine Treffer"* over *„Suche
    und Filter zurücksetzen"* would be untrue.
  * **Rows assigned to someone else are hidden by default** (FR-25.20; "Zugewiesen an" is the term everywhere, M4/M5 and
    M6 alike): M4 opens on your own work. Unassigned rows stay — they belong to everyone. A reveal bar names the count
    and the people, and the switch sits in the filter panel beside *Erledigte*; the header keeps counting the whole trip
    regardless.
  * **Done rows drop out** (FR-25.2) — fully packed *or* consciously skipped, but never a row with open preparation
    (FR-7.3). Revealed via the *Erledigte* switch, dimmed but interactive, each showing **who packed it and when**
    (FR-25.17). A fully-done group disappears header-and-all.
  * **Late-packer rows sink, and can be put away (FR-25.27).** A row carrying the ⏰ flag (FR-5.1)
    sits at the end of its group, below what can be packed now and above what is done — three tiers, one partition. A
    cluster sinks as soon as one visible instance carries the flag, matching the ⏰ its head already paints
    (FR-25.23). The filter panel's **third switch**, *Spätpacker*, hides them outright; it is the only one of the three
    that starts **on**, because those rows are not finished with, merely not due yet. Hidden, they get the same reveal
    bar the other two classes get and the list still counts as narrowed, so *„alles erledigt"* cannot appear over them.
    **The three bars sit in the same order as the rows:** Spätpacker, then *Anderen zugewiesen*,
    then *Erledigte* last — the two whose rows still ask for something stand above the one whose rows do not.
    Picking ⏰ in *Merkmale* overrides the switch, as a *Status* value overrides *Erledigte* (FR-25.11l). The closing
    pass (FR-9.3) is exempt from both halves. **A typed search term lifts all three switches** for the rows it
    matches (FR-25.32); clearing it puts them away again. While the term stands, the *Erledigte* and *Spätpacker*
    bars are absent — their matches are already on screen — and they return with the cleared term. A switch's words
    are inside its checkbox, so a tap on the words and a tap on the box are one toggle.
  * **Groups fold** (FR-25.16): tapping a header collapses the group to that line, which then carries its open count;
    fold-all turns the list into a table of contents.
  * **Per-person items render as a named cluster** (FR-25.1) — item name once with `done/total`, one indented child row
    per traveler; a lone instance (notably when grouped by traveler) falls back to a flat "Item · Person" row.
    Cluster-vs-flat is decided over the *full* set, so packing one instance never restructures the list — the full set
    being what the **person facet** lets through (FR-25.30): filtered to Andy, his socks are a plain row with their own
    check, labelled *„Socken"* without *„· Andy"*, which the chip row already says. **The head counts units, like every
    other fraction on the screen** (FR-25.22): with Andy 2, Leonardo 3 and Mia 1 it reads `0/6`, and the child rows add
    up to it. A head counting *travelers* (`1/3` = one of three people done) could not be added up from the lines
    beneath it, and fractions on one screen would mean different things. **And the head is set louder than its
    children** (FR-21.16): the item is what is being packed and the person only qualifies it, so the head takes the row
    size and the child steps down.
  * **A cluster folds too, and starts shut** (FR-25.23): the child rows are not rendered until the head is tapped, so a
    per-person item is **one** line on the list rather than one line per traveler. Shut, the head carries **a face per
    instance in roster order** (ringed in the done colour once that instance is dealt with) and the **open count in
    units** („4 offen"); open, it hands both statements back to the children and returns to `done/total`. The caret
    **trails the item's name** instead of leading the line, because leading it would move the name off the x every other
    item row's name sits on (FR-21.20). The fold is view state per cluster key and is deliberately **not** persisted,
    unlike the FR-25.18 filter.
  * **One avatar at the right edge** (FR-25.3/25.19), set apart from the traveler avatar on the left: it shows the
    **assignee** while the row is open (blue ring) and **who actually packed it** once it is packed (green ring +
    check). Never both — the left avatar already answers *for whom*, and a third circle makes the row unreadable.
  * **Procurement glyph on the two buy modes only** (🛒 / 📍; 🧳 stays silent so the exceptions stand out), once per
    cluster header; **Late Packer** stays a separate ⏰ flag (FR-25.4).
  * **Quick-add** stays inline, collapses on blur, and is opened *and focused* by the ＋ FAB — which **hides while the
    composer is open**: it would only open what is already open, and the composer needs the room; its
    container stays, because M4 and M8 anchor their toasts to it. The composer also carries a **visible confirm button**
    — a phone has no reachable Enter (FR-25.13/13a). It also adds **whole groups** (FR-27.10): typing
    filters groups alongside items under *„Ganze Gruppe hinzufügen“*, and one tap expands the group into the trip —
    deduped against what is already there, provenance stamped, FR-27.7 tasks materialised, result reported, and
    deliberately **not** flagged *Missing*. A group entry is a **card**, not a list row like the item suggestions, and
    carries the group's name, the FR-27.12 summary („Makroobjektiv · Ringblitz +1“) and its resolved position count: a
    tap that adds a dozen rows must not look like a tap that adds one item, and the summary is what lets the user decide
    without opening anything. Matching is on the **group name** — the resolved item names are FR-27.13's job on M8's
    picker. Three outcomes, three sentences: what was added and what was already there, a group that is already fully on
    the list, and a group whose positions this trip's attributes all excluded (FR-15.2). The entry leads with the
    group's own mark (FR-28.8), and with the generic group glyph when the group has none.
  * **Full-screen:** the bottom tab bar is hidden here, the FAB drops to the screen foot, and the list scrolls clear of
    the FAB's whole footprint so nothing sits permanently underneath it (FR-25.11h).
  * Container assignment defaults to none and is de-emphasized so it never blocks packing (FR-25.5).
  * **The FR-27.4 question sits above the list.** When a group the trip follows has changed, a card
    names **every** change — „Aus den Gruppen“, one line per change with its source group — and offers exactly two
    answers: *Übernehmen* and *Nicht übernehmen*. Deliberately a card and not a modal: a modal over the packing list has
    to be dismissed before the list it talks about can be looked at, and dismissing is not one of the two answers.
    Deliberately the full list and not a count: „3 Änderungen“ with nothing to read can only be answered by guessing. It
    folds above ten lines, same threshold and same reason as M2's log. The cost of *no* is stated where *no* is pressed
    — the refused positions stop following the group in this trip — because it is the one thing about the card a user
    cannot work out from the list above it. Both answers are final and neither offers an undo, so both report through a
    plain toast rather than a snackbar.
  * **Names the inventory moved on from are taken over on request, from the ⋮ (FR-27.16).** While
    at least one row's master item is now called something else, the ⋮ carries „Namen aus dem Inventar (N)" — on a
    past or archived trip too — and opens a sheet: „Alle" (tri-state, with „N von M ausgewählt") on the sunken
    surface, then one row per choice with its tick, the old name struck through above the new one and small facts
    that make it recognisable (*für Andy, Mia*, *gepackt 1/1*, *nicht dabei*); a row the trip named on purpose carries
    *bewusst so benannt* and a sentence saying why it is not ticked. The footer's button counts what it will do
    („N Namen übernehmen", „Alle N übernehmen"). Deliberately **not** a card above the list: that place belongs to the
    FR-27.4 question, and a notice would have to remember its dismissal (the rejected variant is in the FR). The
    result reports through M4's snackbar with *Rückgängig*, because one tap on „Alle" renames many rows.
  * **An archived trip leads with a closing card** (where a *Danach* phase would stand): "Reise
    abgeschlossen" — plain, with no glyph: a composition glyph says nothing about a finished trip, every other heading
    in the app is plain text, and the card already carries two button icons — with **"Vorlage aus
    dieser Reise erstellen →"** (M21, FR-27.5) and the M14 review suggestions beneath it. The packed list stays visible
    below as the trip's record.
* **Group presentation:** a category **heads** the rows under it and must look like it — uppercase micro-type
  *smaller* than the item names it introduces would invert the hierarchy it exists to state. Three levels, three
  weights: the group heading, then a per-person cluster's name (FR-25.1), then the rows; the cluster's name is never
  set below the traveler rows under it (FR-21.16). **The other axis (FR-21.20):** the cluster's indent and its rule
  belong to the **children**, not the whole block — a head names an item, exactly like the plain row beside it, and
  stands in the same name column rather than 8 px right of every other item name.
  And **each group is its own block** — a bordered card carrying its rows — because with nothing but a gap between
  them, two categories run into each other on a long list.
* **Elements:**
  * Sticky header: **one row at every width (ADR-050)** — packed/total, weight (FR-8.1), the task figure (FR-7.6),
    trip presence facepile and group-sync badge per G-10. The trip's name is the page head's second line (G-9) and
    the trip's other views are the switcher and the ⋮, so the line states figures alone. There is no KPI tile strip:
    Analytics is a named entry rather than a tap on a tile, which testing found undiscoverable.
  * **Per person (FR-25.29):** under the sticky line, not in it, so it scrolls away with the list — one compact card per
    traveler with their face inside a `--jp-done` ring (the ProgressRing construction) and, beside it, the name over *„x
    von y"* / *„fertig ✓"* / *„nichts zu packen"*, three to a row (M27 draws the same); a dashed *Gemeinsam* line with a
    track under the cards when any row is for nobody. A tap toggles the traveler in the person facet (pressed card, chip
    in the chip row), so several can be pressed at once — a quick filter, OR'd like the sheet's chips — and a second tap
    takes that one back out. Beyond six travelers the sixth slot reads *„+N weitere · M noch offen"* and unfolds the
    rest, *„Weniger zeigen"* folds them again. Absent with fewer than two travelers and during the closing pass.
  * Grouping switcher: *Category / Container / Person / Status*, inside the filter sheet's *Gruppieren nach* section.
    **Decided: persists per user per trip** (not a global preference) — switching to
    *Container* view on one trip doesn't affect another trip or another user's view of the same trip.
  * Item rows read **mark, name, then what you do to it**. The **lead column** is the mark slot (G-15: photo → item mark
    → nothing, width held either way) — a traveler avatar, where the row carries one, shares this column — and because
    it holds its width empty, the names line up straight without anything being told a number. Then the name and its one
    sentence. Then, at the row's other edge: the chips — mode (BUY_BEFORE/BUY_LOCAL), Late Packer flag, packer avatar,
    ~~container tag~~ — **no container chip** (E2E-M4-03): M4 answers *which bag* by grouping (FR-8.2), and a fifth mark
    at this edge is exactly what FR-25.19 kept off the row; and **last, the control**: checkbox for quantity 1, stepper
    per G-6 for quantity > 1 (showing "3/5"), the closing-pass toggle or the G-3 lock. The control is last so its outer
    edge is the row's on every row, whatever precedes it — the thing you tap sits under the thumb rather than across the
    screen from it.
    * **Why the control is last (UX-9).** A leading control column of one fixed width, sized to the stepper, would also
      give a straight name column, at the cost of a 108 px gap on every row that carries only a checkbox and the
      most-tapped control at the far edge from the thumb. With the control at the end the lead column holds the names,
      and the container's own edge holds the controls. E2E-M4-56 asserts both, because either one alone passes on a row
      that has lost the other. The mark is resolved through the row's source item (FR-28.7) — an ad-hoc row (an
      import's, an older trip's; the quick-add makes none, FR-24.11) carries none until it exists in the inventory, and
      shows an empty slot rather than a placeholder.
    * **The lead column is one glyph wide (FR-21.19).** The mark on an item row, the traveler's face on a child row
      under a cluster — never both. A *lone* per-person instance renders as an item row with the person folded into
      its label (`Wanderstöcke · Andy`) and draws no face beside the mark slot, which would start its name 32 px right
      of every sibling; on a list with the *who* column its face takes the mark's place instead (FR-25.28). A test of
      the rule must be given a row with a traveler. **The *who* column is not a second column (UX-03):** a seat beside
      the mark on every row would start the names at x 101 of 412 px and leave *Kleidung*'s name columns 175–198 px
      wide; in the one slot they start at x 69 (E2E-M4-153).
    * **The edge avatar is a control (FR-25.25).** Tapping it opens the assignment picker — the
      trip's other members and *niemand* — instead of only naming the responsible person. A row nobody is responsible
      for renders an **empty seat** in the same place, which is the row's only affordance for being handed over. It is
      absent where nothing is assignable (G-8), under a G-3 lock, in the closing pass, and once the avatar names the
      packing record rather than the assignment: that one is not a choice (FR-25.19).
  * **Row press-and-hold menu (FR-5.5):** *Menge ändern*, *Für wen …* (FR-25.28, on a list with the *who* column —
    also after *Doch einpacken* on a skipped row), *Packen*, *Nicht einpacken*, **_Vor Ort kaufen_** — on a
    `buy_local` row **_Doch mitnehmen_** in its place, and neither on a row already begun (FR-5.9) —,
    **Spätpacker ein/aus** (FR-25.25, last of the row's own actions), FR-9.3's unused mark where the trip can be judged,
    and **_Von der Liste entfernen_ last of all** (FR-5.8, destructive role). A row somebody else
    holds has no menu but the takeover (G-3/FR-5.7); a row the viewer holds offers only the release; a skipped row
    offers the way back and the removal, and no late-packer flag, because nothing is being packed on it.
    * **Removal (FR-5.8).** A row with nothing on it goes at once, with the pack snackbar's *Rückgängig*
      (*„„Zelt" von der Liste entfernt"*). A row carrying packed units, notes or FR-20.2 companions opens a destructive
      alert first — title *„„Drohne" entfernen?"*, a body naming each loss and pointing at *Nicht einpacken*, buttons
      *Abbrechen* / *Entfernen* — and a confirmed removal raises the same snackbar with *Rückgängig* (FR-25.31): the
      row leaves the screen and is deleted once the undo lapses, its companions skipped at once. A row whose M5 is open
      closes it: the sheet would otherwise report the item it was just asked to remove as not found.
      Where the row is the **only use of its inventory item** (ADR-065), the snackbar reads
      *„„Zelt" entfernt – auch aus dem Inventar"* and the alert's body ends with *„Der Artikel kommt sonst nirgends vor
      und wird auch aus dem Inventar gelöscht."*; the item goes once the undo has lapsed.
  * **Cluster head menu (FR-25.26):** the head of a per-person cluster (FR-25.1) takes the same press-and-hold, while
    the short tap stays FR-25.23's fold. It offers **Spätpacker für alle ein/aus** and **Alle zuweisen an …**, each
    acting on every instance the head counts, and **every entry of a row's own menu** except the takeover, in the row's
    order and words: *Menge ändern*, *Für wen …*, *Jetzt packen*, *Nicht einpacken* / *Doch einpacken*, *Freigeben*,
    *Unbenutzt*, *Von der Liste entfernen*. Each reaches the instances whose own row would offer it; *Für wen …* opens
    the one strip, under the head. *Menge ändern* opens the row's amount popover, centred, naming the item; each tap
    writes the same amount to every instance. Skip and removal carry one snackbar and one undo for all of them. It
    states the scope in its sub-header (*„4 Zeilen"*) because a shut head hides the rows it is about to write. Instances
    somebody else holds are skipped and reported in the toast (*„3 von 4 geändert · Sia packt gerade"*) — or, for skip
    and removal, in the snackbar's name (*„Zahnbürste (3 von 4)"*); a head whose every instance is held offers no menu
    at all, and none of its entries is a takeover.
  * **The for-whom strip (FR-25.28):** the list carries a ***who* column** wherever the trip has two travelers or
    more and outside FR-9.3's closing pass (G-8) — and it is **the lead slot itself**, not a column beside it (UX-03).
    On an item row and on a cluster head the slot is the **for-whom seat**: it draws nothing of its own, only what the
    slot holds anyway — the mark on a shared row (an empty slot on a row without one), the traveler's face *in the
    mark's place* on a lone per-person row, the mark on a cluster head. The head says how many travelers it is for in
    a grey **fact chip after its name** (*Regenjacke* `3`), the vocabulary of M8's `1×`. A child row's avatar sits in
    the same slot, so every name keeps one x (FR-21.19/FR-28.4). Because a seat no longer looks like one, the row's
    and the head's press-and-hold menus name the same door as **_Für wen …_**. Tapping a seat unfolds the strip
    **as a line of the card under that row** — *Gemeinsam* ⎮ *Alle*, one avatar toggle per traveler in roster order, and
    a summary line (*„3 Personen · 3 Stück"*); tapping it again or another seat folds it, so **at most one** is open.
    Every tap commits (G-5). Unlit travelers keep their face at half weight; a lit one wears the action ring. **Laid out
    for three travelers**: up to three the faces are 40 px with the name spelled out; from the fourth they are 32 px.
    Each toggle is as wide as its word, 40 px at least, so *Gemeinsam* and every name stand whole; a roster whose names
    do not fit scrolls the line sideways by G-13's rule (E2E-M5-33). The
    strip is an **opaque, sunken** band raised above the rows below it, which slide out from underneath as it opens
    rather than across it; the seat is its own tap target, so tapping it does not ripple the row. **No steppers here** —
    a lit traveler is a child row at once, and its count is where the amount is changed (FR-25.24). A question the plan
    owes — a row with progress or notes going, two or more rows collapsing, a *weggelassen* item taken along again —
    **replaces the summary line inside the strip**: the outcome stated first, then *Abbrechen* and the verb (*Entfernen*
    / *Zusammenlegen* / *Doch einpacken*); the toggles are inert while it stands. It is the one place a destructive
    confirm is not an alert. **G-3:** with any instance held by somebody else the strip still opens, reads, names the
    holder and writes nothing. The strip stays open while its item turns from a row into a cluster and back, and that
    change is not animated (E2E-M4-100).
  * **Inline quick-add (FR-5.6):** A persistent "Add item..." trigger below the filter bar. Tapping it expands an inline
    text input with autocomplete suggestions from the master item inventory (M9). **The composer is M9's search
    (FR-24.11):** the suggestions follow M9's rule (umlaut fold, tags, marks — a tag or mark hit says *„über {Tag}"*),
    and a name no active item carries exactly is offered above them as *„‚{Name}' anlegen"* — M9's `SearchOfferButton`,
    dashed, hint *„Neu im Inventar anlegen und gleich hinzufügen"*. Taking it, or ✓/Enter, opens M9's *„Neuer Artikel"*
    sheet (name + tags); *„Anlegen"* creates the inventory item and adds it at once, for whoever the for-whom strip
    names, and the composer stays open. A retired name reads *„‚{Name}' ist stillgelegt"* and is restored and added in
    one tap. ✓/Enter add an exact inventory match directly and never write a new name on their own; a name already on
    the list reads *„‚{Name}' ist schon drin"* and ✓ rests. The placeholder says so: *„Suchen oder neu anlegen…"*.
    Selecting a suggestion reuses the master item's metadata (weight, value, category). If the trip is active, new items
    are auto-flagged *Missing* (FR-9.1). The input stays expanded after adding for rapid entry; Escape or the close
    button collapses it. No navigation away from M4 required. **FR-25.13c:** the FAB expands the composer **without
    focusing it**, because while the field is empty it leads with a tappable *„Zuletzt verwendet"* chip row (the
    device-local trail) — and the raised keyboard would cover it; a chip tap adds with the FR-25.7 defaults and stays in
    chip mode. There is no second row of items sharing a primary tag with what the trip already carries (*„Passt zu
    {Tags}"*): it reads as noise rather than a suggestion. What the trip already carries is offered in **no** row and
    not in the autocomplete either; typing hides the chips and the suggestions take over. **FR-25.13d:** the empty
    composer also carries the *„Mehr aus dem Inventar…"* line, opening the **inventory browse-sheet**: the whole
    inventory in a bottom sheet, grouped like M9 by primary tag — **under M9's own heading** (`ListGroup`: the tag's
    mark, its name and the number of lines under it) — and filtered along the M9 tag axis (any of an item's tags),
    one-tap rows that stay open for runs, a carried item stating *„schon drin"* in place of its add control and flipping
    to that state right after a tap, and free text demoted to an explicit footer line that hands back to the composer's
    field. **The sheet can also put the carried rows away (FR-25.13e):** one line under the tag axis — the count on the
    left (*„14 schon drin“* → *„14 ausgeblendet“*), a switch labelled *„ausblenden“* on the right — hides everything the
    scope carried **at the moment the switch was flipped**, so a row added during the run stays in place and reads *„✓
    hinzugefügt“* rather than disappearing under the finger. Off by default and remembered device-locally, the count
    scoped to the tag filter and the line absent when it would hide nothing; a tag whose rows are all hidden loses its
    heading, and the two „alles ist schon drin“ sentences carry *„Trotzdem anzeigen“*. The sheet is part of the shared
    composer, so M6 and M8 carry it identically — *Erfassen* and *Zusammenstellen*, the two postures of FR-25.13's one
    way to add. **Each line in M4 carries the two verbs as well (FR-25.13f):** ✓ *gepackt* and ✕ *nicht einpacken* at
    the right edge, the name keeping the plain add and the ⊕ stepping aside for them. On a free line they add and decide
    in one write (a skip-add is never flagged *Missing* and pulls no companions); on a line the trip already carries
    they act on all of its rows, naming the count where it is more than one (*„eingepackt · 3 Personen"*). The acted
    line stays where it is, says what happened and carries *„Rückgängig"* for as long as the sheet is open — the sheet
    still has no toast. A settled line states *„schon eingepackt"* / *„bleibt zu Hause"* and carries *„zurücksetzen"*
    beside it (FR-25.13i); a G-3-locked one names its holder and offers nothing at all. **M4 only:** the verbs appear
    for a caller that reports the per-item packing states, which M6 and M8 do not (G-8). **A third verb stands before
    them in M4 (FR-25.13g):** 👥 *für alle*, which puts the item on every traveler's list in that one tap — on a free
    line it adds and distributes, on a carried one it gives the travelers who have none a row of their own at amount
    one, keeping the amount anybody already chose (ADR-036 keep-and-repoint, ADR-054). No editor opens and the sheet
    stays open, which is what lets the taps run; the line then reads *„für alle · 3 Personen"* with *„Rückgängig"*
    beside it. The verb is **absent** where it would do nothing (G-8): under two travelers, on a line that already
    reaches every traveler, on settled and locked lines, and wherever the two verbs above are absent. A line this run
    has just added shows its *„Rückgängig"* and no 👥 — reopening the sheet offers it again. The head names all three
    (*„Tipp = hinzufügen · 👥 für alle · ✓ gepackt · ✕ nicht einpacken"*). Its glyph wears the brand role and its border
    the plain one: a brand-edged box on every free line reads as a column of warnings. **A free line can also name one
    or more travelers, multi-select (FR-25.13h).** Up to three travelers, an avatar button per person sits beside 👥, in
    trip order, sized to the same touch-target floor 👥/✓/✕ use (shrinking only the visible glyph leaves a target
    impractical to tap). A tap **toggles**: assigning a second traveler is a second tap on their button, and the line
    stays open, offering more avatars and its own *„Rückgängig"*, rather than closing the way the other four verbs do;
    tapping an already-selected avatar again takes just that traveler back off, and emptying the set reaches the same
    outcome as *„Rückgängig"* itself. The line never grows a second row for it — the buttons shrink a step and the
    name's existing ellipsis simply triggers earlier. Above three travelers the line stays exactly as FR-25.13g drew it,
    and a **long press on 👥** opens a small menu instead — *für alle* first, then each traveler by name; a second long
    press and a second pick adds a second traveler to the same row the same way the inline buttons do, an action sheet
    having no way to show a pick as already selected, so a pick here only ever adds. A plain tap on 👥 keeps meaning *für
    alle* in every shape, unconditionally. A second, unrelated **long press on the name** shows what its ellipsis hid,
    in a small label above the line; a new press starting anywhere else in the sheet closes it. Free lines only — a line
    the trip already carries keeps 👥/spread as FR-25.13g left it. **A settled line has a way back, and the sheet a
    second filter (FR-25.13i).** The line's right edge carries *„zurücksetzen"* where the caller reports packing states
    at all (M4; G-8 keeps it off M6 and M8, like the verbs), and one tap puts every row the item has back on the list —
    a skipped one at amount one, a packed one with its count cleared, the same two writes M4's own row menu makes. It is
    a **reset, not FR-25.13f's undo**: it is driven by what the trip says rather than by the run's ledger, so it works
    on a decision made yesterday, on another device, or by somebody else, and it does not restore an amount a skip
    zeroed. A locked line is untouched by it (FR-5.7). Above the FR-25.13e switch a second line counts the decided rows
    inside the current tag filter (*„2 entschieden"*) and offers *„nur Entschiedenes"*, which shows those rows alone —
    the pass the reset exists for, instead of a scroll through the whole inventory. What it shows is FR-25.13e's
    **snapshot**: the rows decided when it was switched on (re-taken when the tag axis moves), so a line reset during
    the pass stays in place and flips to *„schon drin"* with its verbs back, instead of vanishing under the finger; the
    count beside the switch stays live and says how much of the pass is left. It is transient rather than remembered,
    unlike the FR-25.13e switch (a task, not a posture), it takes precedence over that switch, which steps aside
    entirely while it is on, and it is absent where nothing has been decided. A tag it finds nothing decided under
    states *„Hier ist noch nichts gepackt oder zu Hause gelassen."* with *„Alle anzeigen"* beside it — a third kind of
    empty next to the two FR-25.13e already has. **The sheet searches (FR-25.13j):** M9's search field sits between the
    head and the tag axis, persistent and unfocused on arrival, and narrows the rows by M9's rule inside the tag filter,
    grouping kept. A name no active item carries is offered at the top as FR-24.11's dashed *„‚{Name}' anlegen"* row (a
    retired one as its restore); tapping it or pressing Enter opens the *„Neuer Artikel"* sheet over the browse-sheet,
    with the filtered tag assigned. *„Anlegen"* closes back onto the browse-sheet with the query intact, and the new
    line reads *„✓ hinzugefügt"* with *„Rückgängig"*; *„Anlegen und öffnen"* closes both sheets and opens M10. An
    emptied result reads *„Nichts im Inventar passt dazu"*. **The composer says who the next add is for (FR-25.28):**
    the **for-whom strip** sits over the field — *Gemeinsam*, *Alle*, one avatar toggle per traveler, the same line a
    row unfolds on M4 — with a sentence under it stating the outcome (*„Wird gemeinsam angelegt."* / *„Wird für 2
    Personen angelegt, je 1."*). An add writes one row per lit traveler at one each, as the FR-25.1 cluster, and **opens
    nothing**: amounts are changed on the child rows it produced. It is where FR-25.8's *Gemeinsam* or per-traveler
    choice is made, and no membership editor opens. The choice survives an add, because rows are entered in runs, and is
    forgotten when the composer closes. It is **absent** — not disabled — wherever there is nobody to distribute over:
    on M8, whose Vorlage has no people, and on a trip with fewer than two travelers (G-8). **The strip speaks for what
    the composer adds and for nothing else:** the browse-sheet answers *for whom* per line with its own 👥 and avatars
    (FR-25.13g/h), so a sheet add — FR-25.13f's two verbs included — never reads the strip, and no add waits for the
    sheet to close (E2E-M4-102).
  * Collapsed sections: "Consciously skipped" items (FR-5.5) and "Late Packers" (pinned to bottom until departure day,
    then pinned to top). ~~**"Preparation" (FR-7.3)**~~ — **no section of its own (FR-7.6, ADR-068):** the
    preparations are in *Aufgaben für die Reise* above the list, each with the chip of its row, and every member may
    tick them.
  * **"Aufgaben für die Reise" (FR-7.4, FR-7.6 — *built*)** — the trip's own chores that prepare no row (*„Pflanzen
    giessen"*) **and the preparations its rows owe** (FR-7.3), in one list: open before resolved, the trip's own before
    a row's, a row's grouped by the row. A task that prepares a row ends in the **chip** of that row — its mark and its
    name, leading to the row's M5 sheet — and carries neither the assignment seat (FR-7.5: the row names its person) nor
    the ✕ (it is removed in M5). A task of the trip itself carries both and no chip, which is the whole distinction on
    the line. A collapsible card **above the list, directly under the header line** (at the list's foot, closed, it
    would go unseen), **always present** outside the FR-9.3 closing pass, because it is where the first todo is typed —
    once the trip's partition is on the device (ADR-033): before it, the section would read folded and then spring open
    under a tap meant to open it. It is **unfolded while any todo is open** and folded to its head once none is — or
    while the trip has none; a fold the user makes holds for the visit. Its head names the section and, once the trip
    has a todo, the check: *„1 von 2 erledigt"*, or *„✓ Alle Aufgaben erledigt"* with the head in `--jp-done`. Unfolded:
    open todos, each **ticked at its own end** — past the seat, the ✕ or the chip, where the packing row one line down
    carries its control; the resolved ones folded under *„{n} erledigt"* where unticking reopens one, and a composer
    (*„Aufgabe hinzufügen…"*, Enter or *Hinzufügen*, which writes the trip's own kind — a preparation is declared on its
    row, in M5). Nothing here counts toward the packing ring or any row's doneness; the check in the head and the figure
    in the header count **both** kinds (FR-7.6). Every trip member may tick; there is no G-3 claim, because there is no
    row. (E2E-M4-96, E2E-M4-97)
    * **The tick sits at the row's end.** Leading the line it would be at the far edge from the thumb and, next to the
      packing rows the section stands above, would read as a different kind of row — the same cost and the same fix
      as UX-9 one screen down. The ✕ keeps its place before it, so the destructive control is not the
      one the thumb lands on. M5's preparation list follows (E2E-M4-138, E2E-M5-31).
    **Whose job (FR-7.5 — *built*).** Each open todo ends, before its ✕, in the row's assignment seat — the
    same component as FR-25.25's: the assignee's avatar, or the dashed empty seat. A tap opens the row's picker, whose
    list here includes the current user, plus *niemand*; the choice is taken back from the snackbar. A resolved todo
    shows its assignee's avatar and no seat. Where nobody else is a member (Local, Single-User, an unshared trip) no
    seat is rendered; an assignee already set is shown as a plain avatar. An assigned todo is never hidden.
    (E2E-M4-133, E2E-M4-134)
  * Item rows with open prep todos show a small **prep badge** (wrench icon + count) next to the item name. Packed items
    with open todos use a distinct "packed with open prep" style (e.g., amber checkbox instead of green) to signal
    incomplete readiness.
  * **Packen abschliessen (FR-5.10 — *built*).** A ⋮ entry (G-12), worded to stay one word away from M2's *Reise
    abschliessen*: finishing the packing is not finishing the trip. Offered while the trip is not archived and its
    packing is open, a list with nothing left open included. It asks once, in **the app's own sheet** (U-3's chrome,
    head + lead + the exceptions on the sunken plane + one primary): the count of what is about to be left behind, then
    how many rows are started, due on departure day (FR-5.1) or held by somebody else (G-3), each on its own line.
    **When the last open row is packed, the step appears in the *„Alles erledigt"* empty state** the list shows at that
    moment (FR-25.11e), and the sheet opens from it, headed *„Das war das letzte offene Packelement."* There rather than
    in a band of its own, because nothing may enter the flow above a list somebody is tapping (ADR-060) and an
    unasked-for modal takes the screen from the tap that follows it — both measured, at seventeen and four e2e flows.
    Once per trip per visit, on the transition only, never over a list that has not arrived, and gone again as soon as
    the list reopens. The snackbar's one *Rückgängig* takes the whole batch back, the stamp with it (FR-25.31). A row
    nothing was packed of becomes FR-5.5's *weggelassen* with its claim released; a half-packed row keeps what is in the
    bag, its amount shrinking to the count (variant P1). Afterwards **M4 leads with a card** naming the moment and how
    many rows are *nicht mitgenommen*, carrying *Wieder öffnen* — which lifts the stamp and decides nothing, so a single
    row still comes back through the *Erledigte* reveal. The list stays workable: the composer is where it was, and
    while the packing is closed what is typed into it lands **packed**, its hint saying so instead of FR-9.1's.
    (E2E-M4-139, E2E-M4-140, E2E-M4-141, E2E-M4-142, E2E-M4-143) The sheet carries one more crossing line (FR-7.12)
    beside FR-7.7's tasks, with the cart glyph: *„N offene Einkäufe wandern von „Vor der Reise" zu „Vor Ort"."*
    (`m4-close-sheet-shopping`) — the packing rows still to buy before departure plus the shopping list's own entries
    there, which move in the same act and come back with the same undo. The task window's lines carry FR-7.11's due
    pill, the dated ones first, and M5's mode select does not offer *Vor der Reise kaufen* for a row not already there
    while the packing is closed.
  * **The start variant (FR-7.16 — *built*).** Reached from M2's *Start* on a trip whose packing is open, the same
    sheet is headed *„Reise starten"*, its lead reads *„Das Packen ist noch offen. Zuerst abschliessen?"*, and its
    primary reads *„Abschliessen und starten"*: it closes the packing as above and starts the trip in one act, and the
    snackbar's one *Rückgängig* takes back both — the trip returns to planning. Beneath it an outline ***„Nur
    starten"*** (`m4-close-sheet-start-only`) starts the trip and leaves the packing open; *Abbrechen* starts nothing.
    A packing finished on another device before M4 arrives starts the trip without the sheet.
    What the close carries is marked where it lands: purchases stand under M6's *„Von vor der Abreise"*, tasks without
    a tag take the task tag of that name. (E2E-M4-151, E2E-M4-152)
  * **Packed or forgotten (FR-5.11 — *built*).** Once the packing is closed the composer carries a
    two-way choice above its hint (`role=radiogroup`): ***Eingepackt*** — *stand nicht auf der Liste* — and
    ***Vergessen*** — *blieb zuhause*. *Eingepackt* is selected each time the composer opens and is exactly the add
    above; the choice stays across a run of adds. On *Vergessen* the hint reads *„Wird als vergessen vermerkt, damit es
    nächstes Mal auf der Liste steht"* and an add writes a row that stayed home: skipped at quantity 0, flagged
    *Missing*, so it is neither packed nor open and the figure does not move. It never reads the for-whom strip.
    Revealed with the other done rows, it says *„Vergessen einzupacken"* where its siblings say *„Bewusst
    weggelassen"*. No choice before the close, in M8, or on an archived trip. (E2E-M4-146)
  * **Consciously skipped (FR-5.5) — a state, not a *section* (FR-25.2).** A skipped row is a done
    row: it leaves the working list and returns, dimmed, through the same *Erledigte* switch as a packed one (two
    mechanisms would show it twice). What it keeps is its own words — *"Bewusst weggelassen"*, or the FR-20.2 reason —
    and the reverse action *Doch einpacken*, which restores it to open with quantity 1. Purpose unchanged: acknowledge
    that an item was considered and deliberately not packed, distinguishing "forgot" from "decided against."
  * Filtering: the faceted panel described above (FR-25.11), reached from the app-bar filter icon. **Decided: the
    filter, the Erledigte switch and the grouping persist per trip for the session** (FR-25.18) — deliberately
    session-scoped where grouping is durable, since a forgotten filter hides rows; a fresh session starts unfiltered and
    the chip row keeps the active filter visible throughout.
* **Actions (FR-5.5):** **press and hold a row** → its action sheet, the M7 idiom: *Jetzt packen* (FR-5.2), *Nicht
  einpacken* (FR-5.5) and — on a trip that is running or archived — *Als ungenutzt markieren* / *Ungenutzt aufheben*
  (FR-9.3); on an already-skipped row the sheet offers *Doch einpacken* and nothing else, since "pack now" on a row
  nobody is packing would invent a third state. The *ungenutzt* entry is the same judgement M5's *Details* block spells
  out, one gesture from the list instead of three taps into a fold nothing ever asks for — the menu-plus-control pair
  FR-5.5 settled on. It is a toggle, so the entry that sets it is also the one that takes it back, and **the row shows
  the mark** beside its mode icon: a judgement invisible on the row cannot be reviewed before the pass ends. A locked
  row (G-3) has no menu. **A press that begins on the packing control is that control's, not the row's (E2E-G6-01):**
  the stepper has holds of its own — G-6's + completes and − zeroes — which could never fire if the row armed its menu
  on every pointerdown inside it; the control column stops the row's *press* as it stops its *click*. Holding a row's
  name or its body opens the menu, holding its ✚/− does what G-6 says. **There is no swipe** — it would be announced by
  nothing and its option panel breaks out of the row's card (the M7 A2/B2 round). Skipping raises the FR-25.2 snackbar
  naming the FR-20.2 companions it took along, with one undo for the whole cascade; a revealed skipped row carries
  *"Bewusst weggelassen"* — or its reason where a cascade put it there — in the line a packed row uses for its FR-25.17
  stamp. tap row → M5; long-press checkbox → complete item. M4's bar holds no lifecycle step: M6 is the switcher's
  *Einkaufen* pill (G-9), and archiving is M2's *Reise abschliessen* (G-12), which opens M4's closing pass (FR-9.3)
  and continues into M14. **Companions (Addendum 3.20):** skipping an item cascades to co-skip its dependent companion
  items, which are revealed with the other done rows carrying their reason (e.g., "weggelassen: „Drohne“ ist nicht
  dabei", FR-20.2); a quick-add that matches a master item pulls its missing required companions in automatically
  (FR-20.4).
* **States:** Real-time: rows animate on remote changes with actor attribution ("packed by Sarah"); item blocked by open
  tasks shows a task badge and refuses completion with inline hint (FR-7.2); offline behaves identically (G-5).
* **The excursions that borrow a row (FR-31.12 — *built*).** An open row — an item row or a cluster's child — that
  lines of upcoming or undated excursions borrow carries one quiet line under its name, a signpost glyph at
  `--jp-icon-xs` and the excursions' names (*„Hüttentour Supramonte, Bootsausflug"*, each once), so the row is not
  skipped or left home blind. A done row does not carry it. (`m4-borrowed-<row>`, E2E-M27-01)
* **Navigation:** From M1, M2, notifications. Deep-link anchor target (G-4). **Desktop (≥ 900 px, per G-9): two-pane
  layout** — M4's list occupies the left/main pane while M5 opens as a **persistent side panel** on the right rather
  than a bottom sheet; selecting a different row swaps the panel's content in place. Below the breakpoint, M5 remains
  the mobile overlay sheet described above. **The pane is the frame's, not the screen's (ADR-064)** — it is a flex
  column of the app body beside the content column, so the two never overlap and the pane ends at the window's edge; a
  layer inside the screen would cover the right 400 px of a 600 px column at every desktop width. The column re-centres
  in what is left when the pane opens, which is the accepted cost.
