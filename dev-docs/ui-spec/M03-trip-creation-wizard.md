# M3 — Trip Creation Wizard

* **Enter is the step's button (G-16):** each step's plain text fields fire the step's own navigation action behind its
  validity gate — the name, series name and tags on step 1 and the traveller names on step 2 fire *Weiter* (the dates
  are a G-17 range field — its Enter opens the picker), a step-4 quantity fires *Reise erstellen*. The single-item
  search on step 3 is G-16-exempt (its Enter is reserved for the field's own result list), so step 3 is left by the
  button alone.
* **Step 2 opens with the default travellers (FR-2.5a)** from M17, editable there like any other traveller.
  A default picked from the accounts opens as the account picker adds one: linked, a collaborator, with
  the role selector.
* **Step 1 shows the dates and folds the rest (FR-2.1c):** name, year and the date range (optional, with the hint
  *Mit Daten gibt es Tagesplan, Essen und Countdown.*) stand open; series and attributes live behind one *Mehr Optionen
  ▾* row that states what is set behind it.
* **The navigation is a fixed footer (G-16):** one band pinned above the tab bar on all four steps — a 46 px *‹ Zurück*
  square (disabled on step 1) and the step's default action filling the rest: *Weiter*, on step 4 *Reise anlegen · n
  Artikel*. The steps scroll under it; the band never moves with their content, so *Weiter* stays on screen however
  long step 3's template list. The soft keyboard covers it as it covers the tab bar — the field's Enter is
  the same action (G-16), so the footer is not chased above the keyboard.
* **The head names the step:** its second line reads *Schritt n · Name* — *Reise · Reisende · Inhalt · Mengen* — rather
  than a bare counter, so a step says what it is for before its content does.
* **Step 3's single-item search is a search field:** M9's `SearchRow` (magnifier, filled field, ✕ only with a query),
  not a bare input that reads as a sentence.
* **Step 1 requires a name and a year (FR-2.1b).** The year is a picker that opens on the current one, so
  the required field is satisfied on arrival; the range field is marked optional and does not gate *Next*. The
  trip's length is the field's own pill, shown only when both dates are set.

* **Purpose:** Generate a trip instance from templates with correct quantities on the first pass.
* **Step 1 — Metadata:** Name, series picker (or "New series"), optional start date and end date (duration auto-computed
  and displayed when both dates are set, FR-2.1/2.1a), attribute chips: season, transport, accommodation (FR-15.1;
  prefilled from series defaults). **A new-series name that is taken is refused here (FR-13.1):**
  `trip_series.name` is UNIQUE instance-wide, so the field carries a note naming the existing series and *Weiter* stays
  disabled. The step deliberately does **not** attach the trip to that series by itself — the picker right above the
  field already offers it, and quietly choosing whose series a trip joins is not the wizard's decision to make.
* **Step 2 — Travelers:** Add travelers (name only — no Adult/Child type, FR-25.9, FR-2.5),
  optionally link to a registered user account — **an *account* picker beside *Add traveller* adds an existing account
  as a traveller and, in the same act, as a member of the trip with a role picker (FR-2.5)**; share the
  trip with user accounts that do not travel and assign roles: Owner (creator,
  immutable), Admin (can manage travelers and roles), Editor (default — can edit items but not manage travelers)
  (FR-4.5/4.7). In Single-User Mode (Addendum FR-17.3), the sharing and role-assignment part of this step is hidden
  entirely — only traveler add/edit remains, and the sole user is silently the trip's Owner.
  **Each traveler row carries an optional account select (FR-1.9)**, offering the creator and the accounts
  the trip is shared with, and shown only once the trip is shared with somebody (G-8) — a link outside the trip's
  members would be refused. It is what lets an item's default assignee land on a traveler: step 4's review reads the
  links it will be created with, so a row handed over that way names the traveler and is *not* marked „per person".
* **Step 3 — Templates:** Checkbox lists of all templates (shared instance-wide, FR-1.6 MVP simplification),
  **split by scope per FR-27.6: *Ferien-Vorlagen* first, *Zusätzliche Gruppen* below** — the
  Vorlage is what a trip starts from, groups are what you add to it. Every row counts what picking it would *resolve* to
  (FR-27.2), not the template's own positions: a Vorlage frequently owns none and is nothing but its groups. A group a
  picked Vorlage already brings along says so on the row („bereits über ‚Sommerferien' enthalten") rather than letting
  the user believe a second tap added something — the FR-25.13 duplicate-report rule. **Every row can be looked into
  (FR-27.12):** it names its first **two** items with a count for the rest („Kamera · Makro-Objektiv +2“) —
  two rather than three because three German item names wrap at 390 px, which turns a scannable row into a four-line
  block, and a chevron opens the read-only peek sheet with the resolved list. The footer **names every merge and its
  contributing groups** („Kamera nur 1× — in Makro & Wildlife", FR-27.2) instead of an anonymous count, and states the
  preparation tasks the trip inherits („📋 2 Vorbereitungs-Aufgaben übernommen", FR-27.7). The trip tasks it inherits are
  a line of their own („✅ 3 Aufgaben für die Reise übernommen", FR-7.4) — deduplicated by text across the Vorlage and
  its groups — because they are not preparation of anything on the list (E2E-M3-23). Live preview footer also:
  resulting item count, deduplicated overlaps listed with the applied merge strategy (FR-2.3); items excluded by
  conditional rules (FR-15.2) shown collapsed with reason ("skipped: season ≠ winter"). **And
  (FR-2.5b/ADR-053) the per-person positions the trip's roster cannot place** — named in an *open* block
  (*„Braucht Reisende"*) rather than a collapsed one, because unlike an exclusion nobody decided against them: the
  block names the items and the step that fixes it. It is absent whenever the roster holds anybody, and a position
  whose item another contributor already placed is not among them. **Companions (Addendum 3.20):**
  the footer additionally reports companion items pulled in automatically ("+ 2 companion items (battery,
  screwdriver)"); step 4 lists them with their main item, notes FR-20.3 dedups ("already on the list, not duplicated"),
  and offers suggested companions as opt-in checkboxes (FR-20.4).
* **Step 4 — Quantity Review:** Virtualized list of all generated items; each row: name, the template quantity with a
  stepper, history hint "2024: 5 · 2025: 6 → suggested 6" with one-tap accept (FR-14.1/14.2; no formulas); destination
  checklist offer if the series has one (FR-13.3). **The hint waits for the series' own trips (E2E-FLOW-05):** their
  rows live in each trip's partition, which Server and Single-User Mode pull only when a trip is *opened* (ADR-033), so
  the screen asks for them and offers nothing until every one of them is here — an unpulled partition would read not as
  *unknown* but as a trip that packed none of it, and the median would be taken over whichever subset happened to be on
  the device.
* **Actions:** Back/Next per step; "Create trip" commits and opens M4.
* **States:** Draft persists locally between steps (offline-safe).
* **Step 3 also takes single items (FR-27.3, *built*).** Below the two scope sections sits *„Einzelne
  Artikel"*: a search field over the **inventory** (two characters before it offers anything, five matches at a time),
  results as tappable rows, picks as removable chips. Deliberately **not** the M4/M8 quick-add despite the §3.25
  consistency directive — that composer exists to *write a row*, free text included; this one picks something that
  already exists, because a name nobody owns has no weight, no tag and nothing for FR-27.5 to recognise a year later.
  What the two share is the rule behind them (`searchItems`). A pick the composition already carries is **reported in
  the footer** („Bereits enthalten, nicht doppelt: …") and changes no count; an already-picked item leaves the
  suggestions rather than being offered twice; and an empty result says so, because an empty inventory and an unmatched
  search are different problems.
* **Navigation:** From M2 FAB or M1 empty state. Cancel returns without residue.
