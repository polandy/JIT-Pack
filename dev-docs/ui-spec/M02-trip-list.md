# M2 — Trip List

* **Purpose:** Overview and entry to all trips.
* **Elements:** Filter bar (search + segmented *Active / Planned / Archived*, the shared list-filter pattern); per-trip
  row: **the trip's travellers as small faces at the row's end** (FR-2.1/8.1) — the *roster*, who the trip is for, and
  never the G-10 presence facepile. **Two faces before the „+N" bubble, measured rather than chosen:** at 390 px three
  faces plus „+1" is 64 px and pushes „Sommerferien im Tessin 2027" onto a second line, taking the row from 87 px to 106
  px; two plus „+2" is 61 px and the name stays on one. It is the wrap boundary rather than a comfortable margin — a
  longer name still wraps, which is fine; paying a line for a face nobody asked for is not. A trip with nobody on it
  shows no pile at all. Name, dates — **locale-formatted through the one `formatTripPeriod` helper** (UX-5: `22.08. –
  05.09.2026` in German, `Aug 22 – Sep 5, 2026` in English via `Intl`, never a raw ISO string; *bis/until* and *ab/from*
  for a single known date, and the bare year for a year-only trip, FR-2.1b — the same helper serves M1's cards and M16's
  history; asserted by E2E-M2-12 and unit-owned per locale in `lib/__tests__/format.spec.ts`), progress ring
  (packed/total — **and *unknown* rather than zero while the trip's own rows are still coming**, ADR-033: `trip_items`
  live in the trip's partition, so a trip this device has never opened has nothing to sum, and printing the sum of
  nothing would read as „you packed none of it" for a decade of finished holidays. The row then says the items are
  loading and the ring stays unfilled and unlabelled. **M2 fetches the partition of a row when that row is on screen**,
  so the cost is the viewport rather than the archive — measured on a 33-trip device: 8 requests on opening the list
  against 33 for loading them all, and the list fills in as you scroll, which is the accepted price written into
  ADR-033), an item summary and the FR-27.4 chips. **No presence facepile:** G-10 states that presence is meaningless
  outside a specific trip, and the wire agrees — presence is broadcast per *subscribed* trip, so a list would have to
  subscribe every row it shows in order to draw circles on it.
* **The running trip is a hero card at the head of *Active* (FR-21.15).** The same card M1 draws, naming the same trip —
  the running one that departs **soonest**, which is deliberately not the head of M2's own newest-first order. Only on
  *Active*: the other two segments are lists by definition, and a card over either would claim a trip is being packed
  that is not. The trip is **lifted out** of the grouped list rather than drawn twice, so the series header below counts
  what it lists. It is M1's card element for element — the dates with the phase word, the name with the day counter, the
  series and who it is for, the packing figure with what is still open — worded by one function for both screens. It
  carries **no row of glyphs**: the row menu, on a hold or right-click, is its action surface, and on a fine pointer a
  ⋮ beside the card (`m2-hero-more-<trip>`, 44 px, its top-right corner) opens the same menu (UX-06). It carries
  the FR-27.4 and FR-16.2 chips with it, and asks for its own trip partition — no observer would ever ask for a card
  (ADR-033).
* **Default ordering (E2E-M2-15): grouped by series under tappable headers that lead to M16, every segment
  newest-first** (through `tripOrderKey`), **no series chip on the row**, and the opening segment is FR-2.8's derived
  one. A flat list ordered by usefulness (active, then upcoming soonest first, then archived newest first) was weighed
  and rejected by decision: its premise — that the list stays short — does not hold over years of use, and the series
  grouping is the way through a long history.
* **Actions:** Tap → M4; FAB "New trip" → M3; **hold or right-click a trip row → its row menu**, an action sheet headed
  by the trip's name: *„Reise-Eigenschaften"* first (FR-2.7, → M22), *Export* (Addendum FR-18.3), *Share* (FR-4.5),
  *Clone* on an archived trip only (FR-12.1), the one lifecycle step the trip's status offers — *Start* on a planned
  trip, *Archive* on a running one (FR-9.1/9.2) — and *Delete*, destructive, confirmed, Owner-only (FR-4.5); tap series
  header → M16. The trip's properties and its lifecycle steps are **M2's alone** — M4's ⋮ holds packing's entries only
  (G-12). Starting says what it changes in a toast (FR-9.1: later additions count as forgotten). **On a trip whose
  packing is still open, *Start* opens M4 with its close sheet in the start variant** (FR-7.16, `?starting=1`) instead
  of starting here: the moment the trip begins is the moment *before the trip* ends. The running trip's step reads
  *„Reise abschliessen"* and **opens M4 in its closing pass** (FR-9.3, `?closing=1`) instead of archiving here: the pass
  is what archives, with *Fertig*, and archiving straight from M2 would skip it. (E2E-M2-34) In Single-User Mode
  (Addendum FR-17.3) and Local Mode, *Share* is omitted from this menu — there is no second account to share with. The
  tap that ends a hold does not also open the trip. The hero card (FR-21.15) opens the same menu on a hold or
  right-click, and from its ⋮ where the pointer is a mouse. There is no swipe: a hold opens a row's actions
  on every list (M4 FR-5.5, M7 FR-18.2), one gesture across the app. *Datei importieren* → M18 and the legacy
  spreadsheet importer *Tabelle importieren* → M15 are **words behind the app bar's ⋮** (G-12, ADR-050 amendment 1): a
  tab root carries the magnifier and the ⋮ alone, and an import done a few times a year does not earn a glyph to be
  guessed at (UX-05). **The list opens on the segment a caller names** (`?status=active|planned|archived`) — M18 uses it
  to land a restore where its own result is; an absent or unknown value never resets the segment the user last chose.
* **The opening segment is derived, not fixed (FR-2.8, *built*):** on entering the screen, a segment showing nothing is
  left for the first one that does, in the order *Active → Planned → Archived*; a segment that still holds trips is
  never taken away from the user, `?status=` still wins over the walk, and all three empty leaves the list on *Active*
  with its G-7 CTA. It decides **on entry only** — archiving the last active trip from M2's own context menu does not
  reorganise the list under the finger that did it — and it waits for the trip list to be **settled** before deciding at
  all, since a list that has not arrived yet is not an empty one (the ADR-033 rule, with a master-partition counterpart
  to `tripDataLoaded`). **Each segment button carries its count in brackets beside the label** (`Aktiv (3)`): `(0)`
  where a segment is empty, **nothing at all** while the count is unknown, and part of the button's accessible name
  (`Aktiv, 3 Reisen`) rather than a bracketed digit read out after it. Fitting `ARCHIVIERT (29)` at 390 px costs the
  segment its horizontal padding and one step down the type scale, both measured against the rendered German label; a
  three-digit count truncates and is deliberately not paid for. The counts follow the search field so they say where the
  hits are; the jump deliberately does not, so a leftover search cannot decide where the user lands.
* **The empty state carries no CTA of its own:** create is the `trips-new` FAB and it is on screen either way, which is
  the ruling M7's *States* line records for the same reason. What is still owed here is a `data-testid` on that state,
  so E2E-G7-01's M2 half can be asserted at all.
* **The empty state waits for the list, and says so meanwhile (E2E-M2-18):** a device whose master pull has not landed
  must not render *Keine aktiven Reisen* over a list that is on its way — the ADR-033 mistake in the one place the user
  reads it. Until the partition is settled the screen says **„Reisen werden geladen …"** instead: the same block without
  its illustration, because it is a notice rather than an absence — one component and one spacing rule, not a second
  loading layout beside the G-7 one. It persists for as long as no pull has succeeded, so an **offline cold start stays
  on the notice**, which is the same honest answer FR-2.8 gives for the counts: the G-2 indicator carries the reason and
  pull-to-refresh (`drainAll`) is the retry. The rule is general (G-7).
* **States:** Archived trips render muted with final stats; imported legacy trips (FR-16.2) carry an **„Importiert"**
  chip, read from `trips.imported` (written by M15's migration, carried into `Trip.imported`). On an instance carrying a
  decade of migrated history it is what separates the two kinds of past. **A trip carries up to two FR-27.4 chips.** The
  first is a *pointer*: „⟳ N Änderungen vorgeschlagen“ — a group the trip follows has changed and the trip has not
  answered yet. It is a label, not a control: the two answers live at the trip (M4), and tapping the row is already the
  way there. It can only appear for a trip whose partition this device holds — in Server Mode a trip's rows arrive when
  it is opened — so its absence means "nothing to say from here", never "nothing to decide", which is why M4 asks again
  on open. The second is the record: „⟳ N Änderungen aus Gruppen übernommen“ above one line per change naming its source
  group, followed by the note that past trips are never changed. **Up to ten changes the log is simply written out**
  under the row; above that it folds away behind the chip, which then carries a chevron and toggles it. The reason for
  the threshold rather than always folding: a handful of lines is worth reading where it happened, but M2 is the app's
  main entry and there is deliberately no *seen* state, so an unbounded log would push every other trip down the list
  until the busy one departs. A folding chip stops the tap, so opening the log does not also open the trip; a
  non-folding one is a label and takes no interaction at all. **No status rule on either chip:** a running trip is asked
  too, and a past one produces nothing to show.
* **Navigation:** Tab 2.
