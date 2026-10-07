# M11 — Container Management

* **Purpose:** Define luggage containers and balance weight (3.10).
* **As built:** containers are created and edited here, the FR-10.3 pairing indicator is reachable, and assigning an
  item is one tappable row, never *one button per container per row* — a wall that grows with containers × items and
  buries the item name. The carrier section is
  **absent, not emptied**, when the trip has no travelers (the FR-24.5 stance); the imbalance line appears only beyond
  the threshold, on **both** cards of the pair; delete lives in the sheet and its confirm states that the items stay on
  the list, unassigned. The pairing write set (both sides at once, exclusive, released on delete) is specified in
  `client/src/domain/containers.ts`.
* **Elements:** Per-trip container list: name, carrier, weight bar (current/max) turning amber at 90 % and red beyond
  max (FR-10.3); the pairing imbalance line on paired containers; "Unassigned items" bucket at the bottom (FR-10.2),
  **one tappable row per item** rather than a grid of buttons. **The bucket renders only when a container exists or
  something is unassigned (UX-8):** with zero containers and zero unassigned items, its "everything is
  assigned" line would contradict the empty state right above it, so the G-7 empty state stands alone.
* **Editing is the M5 bottom sheet**, the same grammar as M8's position sheet: header with the container's load, then
  name, carrier, weight limit and the pairing selector, with the FR-25.15 auto-save lamp — no Save button. **Pairing is
  exclusive and set on both sides at once**, and clearing or deleting one side releases the other; a half-set pair would
  render an imbalance against a container that does not consider itself paired.
* **Creating is the FR-24.5 minimal form:** the ＋ FAB creates the container with a placeholder name and opens its sheet,
  so a name is enough to start and carrier/limit are filled in afterwards.
* **A bucket row says whose it is (UX-13).** Under the name, the row's second line carries the planned weight (where
  known) and — on a trip with two travellers or more — the traveller a per-person row belongs to, with the same person
  glyph and name the container cards use for their carrier. A row for the whole trip names nobody. The per-person
  fan-out makes one Regenjacke per traveller, and without the name those rows read identically: nobody can say which one
  goes into the Koffer. The bucket is ordered **by name, then by the traveller's name**, so siblings sit together and
  two devices show the same list (the roster's own order is arrival order, which differs per device); the picker's
  subject line names the traveller too (*„Regenjacke · Sia"*). With one traveller there is no one to tell apart, and no
  name appears. (E2E-M11-09)
* **Assigning:** tapping an unassigned row opens the same sheet as a **container picker**, each option showing its
  current load — so "which bag?" is answered where the load is visible. Assignment stays optional and never blocks
  packing (FR-25.5).
* **Several at once (FR-10.2, ADR-075 amended):** the bucket selects the way M6, M25 and M9 do. A **hold**
  on an unassigned row (500 ms, or a right-click) starts the mode with that row picked, as does the app bar's checkbox
  glyph — offered only while the bucket holds a row. While selecting, the app bar carries ✕, the count and *„Alle N"*
  over the bucket (G-20), each row carries a `SelectBox` in place of its chevron, a tap picks, and the
  ＋ FAB gives way to a `BulkBar` with one act, **In Gepäckstück …**. It opens the same picker once, its subject line
  reading *„N Positionen"*, and the chosen container takes every selected row; the mode ends with it. No grip, no drag
  and no headings — the bucket is one flat run. Assigned positions are not selectable here: they are not rows on M11.
  No undo, like the single assignment. (E2E-M11-08)
* **Actions:** Create/edit/delete containers; assign items from the unassigned bucket via the picker. **Deleting a
  container unassigns its items rather than removing them** — items outlive their bag, and deleting rows with it would
  silently shorten the packing list.
* **Navigation:** From *Gepäck* in the bar's ⋮ on packing's views (G-12, ADR-051 amendments 1 and 2) — the switcher
  is for the views a trip is worked in. Standing here, *Gepäck* **is** a pill, so the row still says where you are.
  There is no "Edit containers" entry inside the grouping switcher. ~~and from M12~~ — **not built:** M12's only
  navigation is to M4, and opening a picked *Gepäck* bar sets the container facet there rather than opening this
  screen — the more useful landing, since it puts the reader on the rows the bar was about.
