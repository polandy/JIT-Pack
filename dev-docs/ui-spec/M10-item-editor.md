# M10 — Item Editor

* **Purpose:** Edit one master item.
* **Built with M9.** Two modes on one screen, chosen by the route: `/items/new` creates, `/items/:id`
  edits.
* **An optional field names its state, never a number (FR-24.5):** weight and price render a placeholder
  that says the value is *not recorded*, from the catalogue. „0" and „0.00" would be a value — an item that weighs
  nothing and is worth nothing — and both columns feed FR-8's totals and FR-14's suggestions, so the reading a person
  takes from the field must be the one the analytics would use.
* **Default assignee (FR-1.9):** *„Üblicherweise zugewiesen an"*, an optional select of accounts under the
  tags, in the create form and on a saved item, with a one-line hint. It is not folded behind „Mehr", because the point
  is to decide it once here. Shown only where the directory holds more than one account (G-8) — absent in Local and
  Single-User Mode. Editing commits immediately like every other field (G-5).
* **Elements:** Name, **multi-tag selector** (`TagChooser` — the same control M9's FR-24.11 sheet uses) — a search field
  filters the tag chips, **assigned tags stay pinned above the matches** so the filter can never hide what the item
  already carries; ＋/Enter creates an unmatched name as a new tag and assigns it (FR-24.1, filter-or-create; there is no
  single category picker). **With an empty query the offers are a shelf, not the vocabulary (UX-14):** the first eight
  unassigned tags, then a dashed *„N weitere per Suche"* tail that hands focus to the search — a grown instance carries
  dozens of tags, and rendering them all would make every item form scroll. A query lifts the cap, so the search still
  reaches everything. A summary line names the set and which of them is primary — i.e. where M9 will file it. Then
  weight (g) and price — displayed through `formatValue` where it is read (M9, M12), which carries the instance's
  currency where one is named (FR-21.9) and stays unit-less where none is. The currency is `JITPACK_CURRENCY`, an
  instance-wide label rather than a per-screen field; there are no units (FR-1.8). **Editing commits immediately (G-5)**
  with the FR-25.15 indicator; there is no save button. Its row keeps its height while the indicator is still silent,
  because here it stands alone on a line rather than beside a title.
* **The rear-view (FR-27.8 + FR-27.9):** below the dependency section and **above the delete card**,
  because the card's *„An N Stellen verwendet"* is the number this list makes navigable and the reader wants the names
  before the count. *„Enthalten in"* lists every group and Ferien-Vorlage whose own positions name the item, each row
  stating that template's position count, wearing its scope chip, and leading straight into its M8 editor. *„Kommentare
  aus Reisen"* lists every comment written on a packing row generated from this item, across the trips the device holds,
  newest first, each with its trip and — where an account can be named — its author; read-only, because the thread lives
  on the trip row. **Both sections are absent rather than empty** when there is nothing to show, which is FR-24.5's
  stance and what makes their absence in creation mode meaningful.
* **An assigned chip has two targets (FR-24.9):** its **name** makes that tag the item's primary one —
  where the inventory files it — and the **✕** takes the tag off. With the destructive action alone, the filing would
  be decided by the accident of which tag was assigned first. The primary chip wears
  its marker and its name stops being a control, an act it has already performed being no offer.
* **The mark sits beside the name (Addendum 3.28, G-15 — *built*):** a tappable slot left of the name field
  opens the **mark picker** — a suggestion band scored from the name as it is typed (FR-28.3), a keyword search field,
  the facet row, and the grid (FR-28.2). The first suggestion is offered, never pre-filled; "Marke entfernen" is its own
  action, not the empty cell. In **creation mode** the picker is present but never blocks: an item is saved without a
  mark as the normal case, and the suggestion band simply follows whatever the name field currently says. When the name
  matches nothing in the index, the band says so in one line rather than rendering an empty row — an empty offer is what
  makes people pick 📦 for everything.
* **Creation mode (FR-24.5):** minimal form — intro line, name (focused), tags, Gewicht/Preis behind "Mehr ▾"; the
  existing-item sections (photo, Hängt ab von, Begleitartikel) are **absent, not emptied**. "Artikel anlegen ✓" commits
  and a missing name is answered with a hint rather than a disabled button. Because the item's name is its identity
  (FR-24.1, `UNIQUE (name)`, ADR-014), a **duplicate name is reported here** rather than left to the sync push to
  reject. On success the route *replaces* rather than pushes, so "back" lands on the inventory and not on a creation
  form for an item that now exists. **Dependencies (Addendum 3.20):** a "Depends on" section listing this item's
  declared dependencies with a required/suggested mode toggle per row, an add-picker with save-time cycle rejection, and
  a *Begleitartikel* list of items depending on this one (FR-20.1/20.4). **The two lists are symmetric:**
  *Begleitartikel* carries the same add-picker, mode toggle and removal as *„Hängt ab von"* (one `RelatedItemsSection`,
  read from either end of the edge) and sits directly beneath it, above the delete card, because an editable section
  under the destructive one is read as part of it. **Each name in
  either list is a link to that item's M10:** the name alone, in the action role, not the whole row, because the row
  also holds the mode select and the remove button. **The companion picker creates what it did not find** (FR-24.11): a
  query no active item carries as its exact name shows M9's dashed offer above the hits — *„‚{Name}' anlegen"*, hint
  *„Neuer Artikel — hängt danach von {Name} ab"* — and opens M9's creation sheet (name + tags, this item's tags offered
  first). *„Anlegen"* writes the item and the companion row together and leaves the user here, picker closed; a retired
  name is offered back (*„Wiederherstellen und als Begleitartikel eintragen"*) and declared without a sheet. *„Hängt ab
  von"*'s picker makes the same offer the other way round (hint *„Neuer Artikel — {Name} hängt danach von ihm ab"*,
  restore *„Wiederherstellen und als Hauptartikel eintragen"*): the new item becomes this one's main item. **Wording
  (NFR-4.12):** the modes are *nötig* / *empfohlen*, and the reverse list is *Begleitartikel* — the word M3 uses for the
  same relation. *„Wird gebraucht von"* would name it backwards: the list holds the items that need this one, not the
  ones it is needed by.
* **States:** archived trip snapshots are unaffected by edits (FR-2.4, stated in UI copy).
* **The delete card (FR-24.3, *built*)** — the last section of the existing-item block, absent in creation mode
  like the others (FR-24.5). Three lines and a destructive button: the **usage count** („An N Stellen verwendet"), the
  **outcome sentence**, and *„Artikel löschen"*, whose confirm repeats the same sentence — the card can be scrolled
  past, the confirm cannot. The sentence has three forms, because the device does not always know: an item something
  references says it will be **hidden and kept**; an unreferenced item on a device that holds every trip (Local Mode)
  says it will be **removed for good**; the same item in Server Mode says removal is what will happen *unless* a trip
  this device has not opened still uses it, in which case it is only hidden. The third form is not hedging for its own
  sake — the client holds the trip partitions it has opened and never every trip's, so a flat promise would be wrong
  exactly on the FR-9.2 case (ADR-032). Deletion is never blocked because the item is referenced.
* **Navigation:** From M9 or inline from M8. The delete card's outcome sentence has a counterpart on **M23**, which
  lists what this card hid.
