# M8 — Template Editor

Every M8 id carries a test, read clause by clause against it. **E2E-M8-06's ✕ is the one clause most easily taken on
trust**: it is a design decision (the M7 variant pass rejected the swipe panel) written into the UI-Spec and the ledger,
and a clause that arrives as news is not checked the way a clause that arrives as a requirement is — so it has its own
removal assertions. Further clauses of other ids are named on their own entries below.

*Filing note:* **E2E-M8-20, E2E-M8-21 and E2E-M8-22** are defined in the M4 block above,
beside the M4 twins they were written with (FR-27.10, FR-25.13c, FR-25.13d). They are M8's
ids and M8's tests; the entries stay where they are so no id is defined twice.

* **E2E-M8-01** `all` (FR-1.8/G-6): the position sheet's quantity is a numeric stepper (– n +), 0 allowed ("bewusst
  nicht dabei", FR-5.5); no formula input exists (FR-1.3/1.5 retired).
* **E2E-M8-02** `all` (FR-1.4): per-item assignment type Per Person / Trip-Global. *(Both values are asserted, and only
  one of them is clicked — **Trip-Global is the FR-25.7 default**, so E2E-M8-12 asserts it as the state a fresh row is
  in and the glance chip's absence is part of "Standard".)*
* **E2E-M8-03** `all` (FR-2.3/15.2): dedup strategy select; condition chips (season/transport/accommodation). *(The
  three axes come off one `CONDITION_AXES` loop, so a chip on one is the render of all three; what a second axis would
  not add is **FR-15.2's one-value-per-axis rule — the active chip is also the way to clear it**, the only branch of
  `toggleCondition` that deletes. Asserted in the same case, with the per-person chip beside it so a glance that simply
  emptied cannot pass.)*
* **E2E-M8-04** `all` (FR-1.1/25.13): positions are added through the shared quick-add (see M8-13); a free-text name
  creates the master item inline.
* **E2E-M8-05** `all` (FR-2.4/27.4): editing a template a **not-past** trip still follows shows the FR-27.4 blast-radius
  note naming those trips — each is *asked* on its next open, nothing lands silently, and past trips are never touched;
  everyone else sees the change at the next trip generation (FR-2.4). The note is reached through **both** provenance
  paths: the Vorlage's own positions and a group included in it. *(A *running* trip still follows its groups and is
  asked like a planning one; nothing updates immediately.)*
* **E2E-M8-06** `all` (FR-1.2) — **implemented** (`e2e/template-editor.spec.ts`): the only case removing a position —
  `m8-position-remove-*` appears in no other test, and the page has no component test. Positions are written out of
  alphabetical order and render **name-sorted** (`template_items` has no order column — that is why the clause exists,
  and an insertion-ordered list would pass a one-row check); the row's ✕ takes that row and no other, with the surviving
  rows and the section count as the two positive signals; the removal **survives leaving and reopening**, so it is a
  write rather than a view state; and removing the rest reaches `m8-positions-empty`. Removal is the ✕ and there is no
  reorder: a swipe panel breaks out of the card.
* **E2E-M8-07** `all` (FR-27.1/27.6): scope-shaped editor — a **Gruppe** shows only *Positionen* and no group picker; a
  **Ferien-Vorlage** shows the *Gruppen* section whose picker offers **groups only** (never vacation templates, never
  already-included groups) plus "Neue Gruppe anlegen…" inline (created group is immediately included); groups and own
  positions stay visually separate sections.
* **E2E-M8-10** `all` (FR-27.6): guarded scope switch — a Vorlage with included groups refuses demotion to Gruppe (hint:
  remove groups first); a Gruppe included somewhere refuses promotion and the editor names its consumers ("Eingebunden
  in: …"); an unconstrained template switches freely.
* **E2E-M8-11** `all` (FR-27.7): the expanded position form carries the preparation-task list (add via input/Enter,
  remove per row) with the blocking rule stated inline; the collapsed row shows a "📋 N Vorbereitung" count chip;
  adding/removing a task on a group a not-yet-past trip follows is offered to that trip and, once accepted, appears in
  its FR-27.4 applied-changes log *(the log half is covered generically by E2E-M8-09, and the task-specific line by the
  `groupRefresh` unit)*.
* **E2E-M8-12** `all` (FR-25.7): adding a position via the quick-add suggestion is one tap — the row lands **collapsed**
  with the defaults (qty 1, trip-global, Packen, dedup max, no conditions, no Late-Packer), reads "Standard", and
  nothing auto-opens; the position sheet (M8-14) shows only Menge + Vorbereitung before its "Details ▾" toggle; the
  advanced parameters (per-person, procurement, dedup, conditions, Late-Packer) appear only after the toggle and
  collapse again with it. *(**„Nothing auto-opens"** is checked on the add itself, because an editor presenting itself
  after every commit would make the FR-25.7 defaults a suggestion rather than an answer — which is the whole of "one
  tap". **Procurement** is clicked too: the `m8-mode-*` segment, the glance chip and the collapsed row's chip are all
  asserted.)*
* **E2E-M8-14** `all` (FR-25.13/25.7/25.15): tapping a position opens the **M5-pattern bottom sheet** — name header,
  read-only glance-chip row, "Wer braucht das?" wording for the assignment (FR-25.10), the sheet closes without
  committing anything; no inline expanding row form exists. *(The dismissal is one `@did-dismiss` handler and both of
  its user-reachable paths are asserted — the sheet's own ✕ here, Escape in E2E-M8-23; a scrim tap is Ionic's own
  `backdropDismiss` default and nothing of this screen's.)* The ●→✓ **flip is unit-tested** on the shared
  `SaveIndicator` against a controlled state — e2e asserts the indicator's presence and settled tooltip, because racing
  the transient ● would be a forbidden timing dependency.
* **E2E-M8-13** `all` (FR-25.13/25.13a/25.13c/FR-24.11): M8's add is the packing list's quick-add, verbatim — collapsed
  card, ＋ FAB expands it **without focusing it** (FR-25.13c: the empty composer leads with chips, and the raised
  keyboard would cover them — asserted after the confirm has rendered, so the absent focus cannot pass by racing),
  inventory autocomplete from the first character (the composer searches with M9's rule), visible confirm labelled for
  the scope ("Zur Gruppe/Vorlage hinzufügen"), Enter commits, the field stays open and empty for the next position and
  never collapses on blur (FR-25.13a). An already-present name is reported *before* the commit — *„‚{Name}' ist schon
  drin"* under the field, ✓ `aria-disabled`, Enter inert — and not added twice; an unknown name goes through the create
  sheet (E2E-M8-27).
* **E2E-M8-16** `all` (FR-27.14): M8's resolution footer opens the peek sheet on the Vorlage itself; the list is the
  resolved set, flat and alphabetical; a merged row names both contributing groups and an own position reads as one; the
  sheet offers no control that writes, and the editor is still behind it afterwards. *The marks themselves — merge, per
  person, procurement, condition — are asserted in `GroupPeekSheet.spec.ts` rather than here:* reaching a per-person and
  a conditional position through M8's position sheet doubles this case's UI work, and this unit already sits at WebKit's
  test budget (see the ledger). The rendering is covered; only the driving surface differs.
* **E2E-M8-15** `all` (FR-27.13): the group picker's search — the field appears only above six groups; typing an item
  name finds the group that carries it and the row states the reason („über Kamera"); results render as rows with the
  FR-27.12 summary; a matching **already-included** group reports that instead of being absent; no match offers *„Neue
  Gruppe anlegen…"* prefilled with the typed text. *(The case drives the **item-name** hit only, deliberately: matching
  a **group's own name** and the diacritics fold are `searchGroups`' rules and are asserted exhaustively in
  `domain/__tests__/templates.spec.ts`, including the `föhn`/`fohn` pair. UI-Spec M8 states both, and only one of them
  is reachable from a screen assertion at a sensible price.)*
* **E2E-M8-17** `all` (FR-25.13a): the ＋ is present, hides while the quick-add composer is open, and returns when it
  closes; the fab *container* remains throughout, because the screen anchors its toasts to it.
* **E2E-M8-18** `all` (FR-28.8) — **implemented** (`template-editor.spec.ts`): M3 step 3 has *two* pickable columns and
  both carry the slot. The walk crosses a **reload** before the last surface, because a mark is master data and Local
  Mode rebuilds its store from IndexedDB on every navigation. A group's own mark is set from the same picker beside its
  name and then renders wherever that group is offered — the M7 row, M3 step 3, M8's *Gruppen* section and the FR-27.12
  peek sheet header. One assertion per surface, because the field exists precisely so those four stop being hardcoded.
* **E2E-M8-28** `local` (FR-28.8 on FR-27.15 and FR-27.10) — **implemented** (`template-editor.spec.ts`): a marked and
  an unmarked group, both matched among a Vorlage's loose positions. M8's fold row for the marked group carries its
  mark; the unmarked one's has no slot at all. On a trip that picked neither, M4's quick-add card for the marked group
  carries the mark instead of the generic group glyph, and the unmarked group's card keeps the glyph.
* **E2E-M8-08** `all` (FR-27.2): resolution footer shows the resolved item count over groups + own positions and
  **names** every dedup with its contributing groups ("Kamera nur 1× — in Makro & Wildlife").
* **E2E-M8-09** `all` (FR-27.4) — **implemented** (`e2e/group-refresh.spec.ts`): a group gains a
  position after a trip was generated from it; M2 already carries the „⟳ N Änderungen vorgeschlagen“ chip on a freshly
  booted app (the startup sweep, and the positive half of M8-19's absence assertion); opening the trip shows the
  **proposal card** naming the change while the list has *not* moved (the row's absence at that point is what separates
  "asked" from "asked afterwards"), *Übernehmen* puts the row on the list and clears the card, and M2 then carries the
  „⟳ N Änderungen aus Gruppen übernommen“ chip with the source group and item in its log. Up to ten changes the log is
  written out under the row (the case asserts that state); above ten it folds behind the chip, which the TripListPage
  component test pins from both sides of the threshold. It lives outside `template-editor.spec.ts` because the surface
  under test is M4 and M2.
* **E2E-M8-19** `all` (FR-27.4) — **implemented** (`e2e/group-refresh.spec.ts`): *Nicht übernehmen*
  leaves the trip's list untouched and clears the card; leaving to M2 and coming back proves the refusal was
  **recorded** rather than held in memory — the trip re-derives on every open, so a refusal that wrote nothing would ask
  again right there — and M2 carries no proposal chip.
* **E2E-M8-23** `all` (FR-27.15, *implemented as two tests sharing one world*): group recognition in the Vorlage editor
  — own positions covering a group's complete resolved item set surface the suggestion row („N Positionen entsprechen
  …“) with
  the FR-27.12 peek chevron; *Zusammenfassen* replaces those positions with the include (resolution footer count
  unchanged — the proof nothing was gained or lost) and the snackbar's *Rückgängig* restores the positions, deviations
  included, and drops the include; *Ignorieren* removes the row and it stays away across a reload (device-local memory),
  yet returns after the group's item set changes; a one-item group and an already-included group never suggest; a
  deviated quantity is named on the row before the tap — and so is *any* generation-relevant deviation (FR-27.15's
  first settlement), so the row counts positions rather than amounts.
* **E2E-M8-24** `local` (FR-1.6/FR-27.6, *implemented as two tests*): the inline *„Neue Gruppe anlegen…"*
  meets a name that exists. A **Gruppe** of that name (capitals differing) is **included** rather than created — the
  toast says so, the group appears in the *Gruppen* section, and M7 still lists exactly one row of that name (counted on
  the row title, since the composed row names the group in its *enthält:* line). A **Ferien-Vorlage** holding the
  name is reported as the cross-scope fact it is and nothing is included or created; a free name in the same field then
  does both. The editor's own name field refuses a rename onto a taken name, the toast names the holder, **the field
  itself goes back** to the stored name and the ADR-011 header title with it; a free name saves.
* **E2E-M8-25** `local` (FR-21.24) — **implemented** (`e2e/template-editor.spec.ts`): the editor
  offers the composer once, through its own FAB. A second site of the same rule needs its own case: the rule is a prop
  each caller passes, so M4 keeping it says nothing about M8.

* **E2E-M8-26** `local` (FR-7.4) — **implemented** (`template-editor.spec.ts`, once per scope).
  *Aufgaben für die Reise* takes two tasks in both scopes, keeps them across a reload with the count on the head, and ✕
  removes one while its sibling stays. What a generated trip makes of them — trip todos, and no preparation — is
  E2E-M3-23's.
* **E2E-M8-27** `local` (FR-24.11 in the composer, FR-25.13) — **implemented**
  (`template-editor.spec.ts`): an unknown name in M8's composer opens
  the *„Neuer Artikel"* sheet instead of creating the master item silently; nothing is a position before *„Anlegen"*,
  and after it the name is a position and an inventory item.
* **E2E-M8-29** `local` (FR-21.11, UX-16) — **implemented** (`template-editor.spec.ts`): on a Vorlage with one included
  Gruppe and one own position, the *Gruppen*, *Eigene Positionen* and *Aufgaben für die Reise* heads each end on their
  card's right edge and start on its left edge.
