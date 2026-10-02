# M3 — Trip Creation Wizard

* **E2E-M3-01** `all` (FR-2.1/2.1a/15.1): step 1 metadata — name, dates auto-compute + display duration, attribute chips
  (season/transport/accommodation) set. The dates are set through the `DateRangeField` sheet (G-17, ADR-080) via
  `setDateRange`, and the case asserts the field's rendered value is the locale display (`Sep 13 – 20, 2026`), never
  the ISO strings the state holds, and the length on its pill (`8 days`).
* **E2E-M3-02** `all` (FR-13.1/13.2): series picker incl. inline "New series…"; picking a series prefills empty
  attribute chips from its defaults.
* **E2E-M3-03** `all` (FR-2.5): step 2 adds travelers **by name**; asserts there is **no** Adult/Child control and no
  type on the created traveler records (FR-25.9).
* **E2E-M3-04** `server` (FR-4.5/4.7): step 2 sharing — user picker (minus self), Editor/Admin role select; grants
  applied on create.
* **E2E-M3-05** `single/local` (FR-17.3/G-8): step 2 sharing/role part hidden; only traveler add/edit remains.
* **E2E-M3-06** `all` (FR-2.2/2.3/15.2): step 3 template checkboxes; live footer shows resulting count, deduped overlaps
  with strategy, and excluded items with reason ("skipped: season ≠ winter").
* **E2E-M3-07** `all` (FR-20.3/20.4): step 3 footer reports auto-pulled companion items; step 4 lists them with their
  main item, dedup notes, and suggested companions as opt-in checkboxes.
* **E2E-M3-08** `all` (FR-14.1/14.2): step 4 rows show the template quantity with a stepper and a one-tap history
  suggestion ("2024: 5 · 2025: 6 → 6").
* **E2E-M3-09** `all` (FR-13.3): step 4 offers the series destination checklist as opt-out extra items.
* **E2E-M3-10** `all` (FR-2.4/NFR-4.1): draft persists across steps offline; "Create trip" commits and opens M4; cancel
  leaves no residue.
* **E2E-M3-11** `all` (FR-27.1/27.2/27.6): step 3 — the list separates *Ferien-Vorlagen* from *Zusätzliche Gruppen* as
  two sections; a Vorlage's row counts what it **resolves** to rather than its own positions (a Vorlage with no own
  positions never reads 0); picking it resolves for real: the footer count matches the deduped set and the merge is
  **named** with both source groups ("Kamera nur 1× — in Makro & Wildlife"), and each group it already brings says so on
  its own row. There is no tab per scope and no "enthält: …" line on the Vorlage row: M3 has no scope segment —
  FR-27.6 asks for "sections/tabs" and a four-step wizard is not a place to add a second navigation control — and the
  "enthält" relation is stated from the other side, on the group rows that name the Vorlage bringing them, which does
  not repeat the same fact twice on one screen.
* **E2E-M3-12** `all` (FR-27.3) — **implemented** (`e2e/trip-composition.spec.ts`): step 3 — single master items joined
  via the inventory search: an item **not** in the resolved set raises the footer count by one; an item already in it is
  reported „bereits enthalten, nicht doppelt" and leaves the count unchanged; added items appear as removable chips, and
  removing one lowers the count again. The case ends on the created trip, where the picked row has to actually be — a
  preview count cannot prove that half.
* **E2E-M3-13** `all` (FR-27.7): step-3 footer reports the preparation tasks the selection carries ("📋 N
  Vorbereitungs-Aufgaben übernommen"); after creation each task exists as an FR-7.3 todo on its generated item, and that
  item stays un-done in M4 until the todo is resolved (blocking itself is covered by the M4 prep cases).
* **E2E-M3-17** `all` (FR-27.12): step 3 — a group row names its first items with a count for the rest, and the chevron
  opens the read-only peek sheet listing the *resolved* content (a Ferien-Vorlage peeks through its composition, a
  shared item appears once). The sheet offers no control that writes; closing it returns to the wizard with the draft
  intact.
* **E2E-M3-18** `all` (FR-2.6): step 4 lets a decision be made before the trip exists — dropping a row lands as FR-5.5
  *skipped* — visible and reversible in the wizard, and on the created trip **not absent but behind the *Erledigte*
  bar**, which is where the case asserts it rather than trusting the wizard's own display.
* **E2E-M3-14** `all` (FR-2.5a): step 2 opens with the household's default travellers from M17, editable there like any
  other traveller.
* **E2E-M3-15** `all` (FR-2.1b): a trip can be created with no dates at all — the year is preselected, so a name is the
  whole gate.
* **E2E-M3-16** `all` (FR-2.1c): step 1's optional fields are folded behind *Mehr Optionen ▾*, and the fold states what
  is set behind it.
* **E2E-M3-20** `all` (FR-2.1d): with a range already set, the end side chosen and a day before the start tapped,
  that day becomes the start and the end is open again — both halves asserted on the sheet's head and its hint — and
  the next tap closes the range the field then shows. The picker is **re-opened** rather than opened: one that
  already holds a value scrolls to that value's month, so the case is the same on any day of any year.
* **E2E-M3-21** `local` (FR-2.5b/FR-1.4): a group carrying one trip-global and one per-person
  position, previewed on a trip whose step 2 was walked through without naming anybody: the count states the one row
  placed, and the *„Braucht Reisende"* block names the other position — not the exclusion block, which stays empty
  because no condition kept it out. The case then goes **back to step 2 and adds one traveller**, which takes the
  block away and lifts the count to two: without that half the two assertions above would also pass against a block
  that is always shown.
* **E2E-M3-22** `local` (G-17): the *Reise erstellen* button is pressed twice as fast as a hand can
  make it, and the trip list afterwards holds one trip. The create writes the whole trip synchronously and then leaves
  the screen, so between the write and the repaint the button is still under the finger; an unguarded second press
  writes a second trip with the same name, the same dates and the same positions, and neither screen says so.
* **E2E-M3-23** `local` (FR-7.4) — **implemented** (`trip-composition.spec.ts`). A Vorlage carries
  the trip task *„Pflanzen giessen"* and includes a group carrying the same text and *„Kühlschrank leeren"*; its
  position *Kamera* carries an FR-27.7 task besides. Step 3 reports **two** trip tasks on their own line — not three,
  and not folded into the preparation count, which reads one beside it — and the created trip, once started, lists
  exactly those two open todos on M1. The duplicate is the case: a count of three is what a concatenation without the
  dedup would show. M4's header reading exactly one open preparation is the positive signal that the trip tasks did not
  land on a row.
* **E2E-M3-24** `server` (FR-2.5, FR-4.5) — **implemented** (`server/multi-user.spec.ts`). Alice, in
  step 2, picks Bob from the *account* picker: the row appears named *Bob* with a role control, and after *Create trip*
  the roster lists Bob and Bob's own session opens the trip. The last part is the case — a trip is readable to a
  non-member never, so a wizard that recorded the traveller but skipped the grant fails here and nowhere else.
  Such a row carries no FR-1.9 per-row account picker — its link is the account it was added as.
* **E2E-M3-19** `all` (G-16): Enter in a step's plain field is the step's *Weiter* — nothing happens while the gate
  holds (empty name), the same keypress on the same field advances once it opens, and a step-2 traveller name fires the
  same way; step 3's single-item search is G-16-exempt, so Enter there does not advance — proven live by the button
  click that then does.
