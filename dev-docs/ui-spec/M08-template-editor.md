# M8 — Template Editor

* **Purpose:** Define the positions of one template — and, for a Ferien-Vorlage, which groups it is built from (FR-1.2,
  FR-27.1).
* **The editor (Addendum §3.25/§3.27)** is **scope-shaped** and follows the same capture grammar as the packing list:
  * **A Gruppe shows only *Positionen*** — there is nothing to nest, since the hierarchy is deliberately two levels
    (FR-27.1). **A Ferien-Vorlage additionally shows *Gruppen***, whose picker offers groups only and carries **"Neue
    Gruppe anlegen…"** inline, so a missing building block never forces a detour through M7. A resolution footer states
    what the composition actually yields after dedup.
  * **The scope is switchable but guarded** (FR-27.6): a Vorlage that still includes groups cannot become a Gruppe, and
    an included Gruppe cannot be promoted — the editor names the consumers ("Eingebunden in: …") instead of failing
    opaquely.
  * **Adding a position is the packing list's quick-add, verbatim** (FR-25.13): ＋ FAB
    expansion — **without focus (FR-25.13c)**, because the empty composer leads with the
    device-local recents chip row, which the raised keyboard would cover — master-item autocomplete, a visible
    scope-labelled confirm, Enter, the field stays open (and never
    blur-collapses, FR-25.13a), a duplicate is reported rather than added twice and is **not
    offered** in chips or autocomplete to begin with, and a new name creates the master item (FR-1.1) through
    FR-24.11's offer and sheet, exactly as at M4's quick-add, never silently from the bare name. The composer's
    *„Mehr aus dem Inventar…"* browse-sheet (FR-25.13d) is here too, verbatim — described once at M4's quick-add.
  * **Editing a position is the M5 bottom sheet:** glance chips, **Menge und Vorbereitung first**,
    everything else behind "Details ▾", with the FR-25.15 indicator in the header (shared `SaveIndicator`). There is no
    inline expanding row form.
  * **Progressive disclosure on the parameters** (FR-25.7): sensible defaults (quantity 1, trip-global, mode *Packen*,
    dedup *max*, no conditions, no Late Packer) mean a typical position is one tap; assignment (FR-1.4), default mode,
    Late Packer, dedup (FR-2.3) and condition chips (season/transport/accommodation, FR-15.2) live behind "Mehr
    Optionen". A per-person position carries **one quantity for everyone** — no Adult/Child split (FR-25.9); concrete
    per-person numbers are set on the trip (FR-25.8).
  * **A group hiding in the loose positions is offered, never applied** (FR-27.15, *built*): when a
    Ferien-Vorlage's own positions contain a Gruppe's **complete** resolved item set, a non-blocking suggestion row sits
    between the *Gruppen* section and the own positions — „*2 Positionen entsprechen der Gruppe «Erste Hilfe»*", with
    the FR-27.12 peek chevron, *Ignorieren* and *Zusammenfassen*. Where those positions define something the group
    defines differently, the row says so **before** the tap, carrying its own tint rather than relying on the flavour's
    straw, which is legible on Nacht and thin on Tag. *Zusammenfassen* swaps the positions for the include on the
    picker's own write path and the anchored snackbar's *Rückgängig* restores exactly what went; *Ignorieren* is
    device-local (`localStorage`, the M9 property-sheet class) and keyed to the group's item set, so it lapses once that
    set changes.
  * **Preparation tasks on a position** (FR-27.7): a free-text list under progressive disclosure with a count chip on
    the collapsed row. Each task instantiates as an FR-7.3 todo on the generated trip item, and an open prep todo keeps
    that item from counting as done (FR-25.2).
  * **Trip tasks** (FR-7.4 — *built*): a section *„Aufgaben für die Reise"* below the positions, in both scopes
    — a group can carry them as well as a Vorlage. A free-text list with the position task list's add and ✕ idiom under
    a one-line hint that says what the tasks do (*„Jede neue Reise aus dieser Vorlage bekommt sie als Aufgabe — sie
    halten keine Packliste auf."*), placeholder *„z. B. „Pflanzen giessen““* — a longer one is cut off at 390 px — and
    a count on the section head. Each task becomes an open trip todo on every trip generated from this template, not on
    any row, so it holds back no item from counting as done. Editing the list changes the next generated trip only;
    running trips are not offered the change (FR-7.4 names the trigger). (E2E-M8-26)
    * **Each task carries its phase (FR-7.7 — *built*).** A quiet chip on the line reads *Vor der Reise* or
      *Während der Reise*, and tapping it flips the task to the other one; the composer carries the same chip, which
      says which phase the next task is written in and remembers the choice while the editor is open. A Vorlage can
      therefore author *„Am Bahnhof die Zugverbindung abklären"*, and the trip it generates starts that task in the
      right section of M25. A task that names no phase reads as one for before the trip.
* **The template's own mark (Addendum FR-28.8, G-15 — *built*):** the same picker as M10's, on the slot left of
  the editable name, suggested from the template's name. Every mark on a group row in M3, M7, M8 and the FR-27.12 peek
  sheet reads this column. Optional like the item's, and **never a letter**. Whether an unmarked group keeps its
  slot depends on what it stands in: in a **column** (M7's list, M3 step 3) the slot holds its width, because
  without it the marked rows push their names right of the unmarked ones — the same misalignment FR-28.4's held slot
  prevents on M4. Beside a **single** name (M8's own editor head, the FR-27.12 peek header) there is no column to align,
  so an absent mark renders nothing at all.
* **Elements:** editable name (commits on blur/Enter; the ADR-011 header mirrors it); scope
  selector with the *"Eingebunden in: …"* line on an included group; the FR-27.4 blast-radius note (yellow, above the
  sections it warns about); *Gruppen* section (Ferien-Vorlage only) — rows with resolved count, the FR-27.12 summary
  line and its peek chevron, and ✕, a collapsed *"Gruppe einbinden…"* trigger opening the picker card (available groups
  as chips, *"Neue Gruppe anlegen…"* revealing an inline name field — the M7 create lesson: no row until the name
  exists, and no `prompt()`; above six searchable groups the card carries a **search field** (FR-27.13)
  — never auto-focused, this picker exists to be tapped — matching group *and resolved item* names case- and
  diacritics-insensitively: while searching the offers become rows with the FR-27.12 summary, an item hit states its
  reason („über Kamera"), an already-included match says *„Bereits eingebunden"* instead of being absent, and no match
  leaves *„Neue Gruppe anlegen…"* prefilled with the query); the FR-27.15 fold suggestion rows, one per recognised
  group, largest resolved set first; *Positionen* / *Eigene Positionen* rows (name, deviation chips or *Standard*,
  quantity chip, ✕); the quick-add; the FR-27.2 resolution footer, which is **tappable** (FR-27.14):
  *„Alle N Artikel ansehen ›“* opens the FR-27.12 peek sheet on the Vorlage itself — the resolved list, flat and
  alphabetical, each line naming where it came from („aus Makro Fotografie“, „eigene Position“) and marked where a count
  would mislead (*nur 1×* for a merge, *pro Person* instead of a guessed traveler count, the procurement mode, *mit
  Bedingung* for a position the trip may still exclude).
* **Actions:** Add/remove positions and group includes; every change commits immediately (G-5): no save button, the
  FR-25.15 indicator in the sheet header confirms local capture, and is absent until the sheet has written something.
  A refused scope switch answers with an anchored
  toast naming the reason, never a silent no-op.
* **A name that is taken (FR-1.6):** the editable name refuses a rename onto a name another template holds —
  an anchored toast names it and **the field goes back to the stored name**, because G-5's auto-save has no other
  acknowledgement and a refused spelling left in the field reads as saved. *„Neue Gruppe anlegen…"* answers by scope: a
  **Gruppe** of that name is what this picker exists to reference, so it is **included** and the toast says so
  (*„«Kamera» gibt es schon — eingebunden"*); a **Ferien-Vorlage** holding the name cannot stand in for a group, and the
  toast says which scope holds it — a bare "name taken" on a screen that shows only groups reads as a bug.
* **States:** Editing a template used by trips that are not past shows the FR-27.4 blast-radius note naming those trips
  (each is *asked* on its next open — nothing lands silently and past trips are never touched; everyone else sees
  changes at the next trip generation per FR-2.4). The note also appears on a group reached through a Vorlage such a
  trip was generated from.
* **Navigation:** From M7.
* **The save indicator and removal.** The FR-25.15 indicator is one shared `SaveIndicator` in **both** sheets —
  FR-25.15 explicitly rejects "G-2 already says it": offline, captured-here versus reached-the-server is the entire
  story. Its seam is the orchestrator's `capturePending`, which counts this device's own open writes — not the *sync*
  state, which is G-2's and answers `offline` before `syncing`, so offline an open write would render as settled (see
  FR-25.15). A position is removed by the row's ✕, not by swipe — a swipe panel breaks out of the card (the M7 variant
  pass), and M8's rows sit in the same card. The FR-27.4 question a template edit raises is asked at the trip (M2's
  and M4's States, ADR-016).
