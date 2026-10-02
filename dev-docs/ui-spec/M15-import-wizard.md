# M15 — Import Wizard

* **Purpose:** Migrate legacy spreadsheet history (3.16).
* **Step 1 — File:** Upload **CSV** through the G-17 file trigger, or paste. ~~CSV/XLSX~~ — the picker accepts `.csv`
  only and the hint says so (XLSX is deferred by NFR-4.3 — a parser dependency for a format every tool exports as
  CSV). **The parser preview (ADR-041):** the first six parsed rows as a
  table, live while the text is being pasted, so the answer to *did it read my file the way I meant it?* arrives before
  *Analyze* rather than after. It renders `parseSpreadsheet` output and nothing derived, which is the point — it stays
  truthful when the analysis is wrong. Rows are padded to the widest so a ragged row keeps its shape, the header row
  carries the emphasis, and a note names the rows not shown. **Wide sheets scroll inside the box and the page never
  scrolls sideways** (G-9; measured at 390 px: a 358 px box over 617 px of content, body unchanged). E2E-M15-01.
* **Step 2 — Mapping:** Mark the item-name column, the **category column** (a picker whose first choice is *None*) *or*
  the category rows, and per trip column: include-toggle, trip name, date (or year — **a bare year imports a year-only
  trip** (UX-5), never a fabricated Dec-31 end date posing as a real date on every list), target series (FR-16.1); noise
  handling per NFR-4.7 — **said inline**: a note names how many entries the sheet marked with a trailing `?`, names up
  to three of them, and states that each becomes an open task on its row, so the user does not first meet the tasks
  inside the trip (E2E-M15-02). The task's body is on the catalogue (NFR-4.12), resolved at write time so a language
  switch reaches it. The trip name and date arrive **prefilled from the sheet's header block**, which may be more than
  one row — a column whose header carries neither is the one case that arrives unticked. Both column pickers label a
  column by its own header text, falling back to its position. **No trip column has to be ticked at all:** a sheet with
  none is an inventory, and the step's note then names the one thing still missing — a column holding the item names —
  rather than a trip.
* **Step 3 — Dedup:** Near-duplicate suggestions against existing master data with merge/keep-separate choice (FR-16.3).
* **Step 4 — Confirm:** Summary (n items, n archived trips, merges, categories) and one row per trip. **Each trip row
  names its target series**, and says *„keine Serie"* where none was chosen — a destination is a destination, and this
  is the last screen before an irreversible write. The picker is on step 2 and the commit writes `series_id`; this is
  where the choice is repeated. **The summary also counts the open tasks the commit will
  create** (NFR-4.7), for the same reason. E2E-M15-02, E2E-M15-04b. ~~transactional commit with progress; failure rolls
  back completely~~ — **the commit is an approximation** (NFR-4.7): the plan is validated in full
  before a single mutation is enqueued, parents precede children in the queues and replay is idempotent, but **nothing
  rolls back** and **there is no progress indicator**. There is no server-side transaction across a push batch to build
  either on. The commit lands on **M9, the inventory, when no trip was created**, and otherwise on **M2's Archived
  segment** — FR-16.2 only ever produces archived trips, and M2 opens on Active, so a default landing would report a
  successful migration with "No active trips".
* **Navigation:** From M9's empty state and from **M2's own title row** — a button beside M18's, not an overflow menu —
  with the origin stamped so `‹` returns to whichever of the two opened it (G-9, ADR-011). ~~and M17~~: Settings offers
  no import entry. **A second visit inside one session does not work** (open defect, E2E-M15-03): the commit's
  `router.replace` onto a tab root leaves that tab's page unhidden in the root outlet, so a later push renders M15
  *underneath* it; M18's restore replaces the same way.
