# M5 — Item Detail (Bottom Sheet)

* **The sheet is ordered by why it is opened.** The screen is opened for one of three reasons — to pack the thing, to
  note something about it, or to change one attribute — and nine equal sections, every one expanded, would give all
  three the same weight. The order is the order of those reasons: **identity** (name,
  small reference photo, one context line), **packing** as its own block and the largest control on screen, a read-only
  **glance row** for everything the sheet can also change, then **Preparation** and **Notes** with their composers, and
  finally *Details ▾* holding membership, procurement, luggage, the Late-Packer flag, the FR-9.1 flags and the
  FR-25.17/25.19 stamp.
* **A row whose inventory item was renamed says so under its name** (FR-27.16): „Im Inventar heisst
  es jetzt „X"." on the action colour's wash, with *Übernehmen* — the one-row form of M4's ⋮ sheet, reporting through
  M4's snackbar with *Rückgängig*. Absent when the names agree or when the FR-27.4 card is already asking.
* **It is a sheet over M4, and a side panel beside it above the G-9 breakpoint** — one content component either way,
  and *beside* is literal (ADR-064): the pane is a column of the frame, not a layer over the screen. The
  route carries it (`/trips/:tripId?item=:itemId`), which is what makes a notification deep link (G-4) land on the item
  with the list behind it. **The item is a query on the list's own route, not a path** (ADR-046 — to Ionic a
  parameterised path is a page of its own, so every open would mount a second copy of the list behind the sheet), and
  opening or closing *replaces* rather than pushes: the sheet is a state of the screen, and one screen keeps
  one history entry. **On a phone the sheet's ✕ (or a swipe) is the way out** — its backdrop covers the app bar, so `‹
  back` is deliberately unreachable there; with the desktop panel, back closes the panel first (`meta.overlayQuery`).
* **The sheet is as tall as what it holds** (FR-21.25), through the app's own `SheetModal` chrome rather than a third
  copy of the same five modal variables. A fixed height would spend two thirds of the screen on nothing for an item with
  no prep, no notes and *Details* folded away, over the list that could use it (measured on a 390×844 phone: 496 px
  rather than 743 px, growing to the 85 % ceiling once *Details* is unfolded). Weight follows the same reasons: the pack
  control is drawn at a main action's size rather than a row's — it is why the sheet is opened — and the *Add* buttons
  of prep and notes are not the only filled buttons on it, since a fill is what makes a button read as the screen's
  answer. A composer's field and its button share a height and an edge.
* **The context line and the FR-20.4 chips say what the sheet already knows.** The one line under the name
  is category · weight · amount, and the amount goes through the app's one money formatter, so an instance that names
  a currency (FR-21.9) names it here too. The chips that offer a suggested companion write the position the dependency
  describes: its **category**, so the new row is filed where FR-24.2 files it rather than under *Ohne Kategorie*, and
  its **quantity**, as the required-companion path does (FR-20.2). Both facts travel on the suggestion itself rather
  than being looked up again at the tap, so no caller can forget them.
* **The reference photo is small** (44 px beside the title, FR-22.1): it helps recognise the thing without taking the
  top of a screen most rows have no photo for. **The same slot carries the item mark when there is no photo** (G-15,
  Addendum FR-28.4) and stays empty when there is neither — the sheet's identity block is the one place both answers to
  "what is this" can live, and the ladder decides which is shown. The mark is not editable here: it belongs to the
  master item, and M10 is where master data is changed (FR-28.7).

* **Purpose:** Everything about one trip item without leaving context.
* **Concept-review refinements (Addendum §3.25):** the sheet is reorganised with
  **progressive disclosure** — *level 1* shows only the header, a compact read-only **glance-chip row** (who needs it ·
  mode · luggage · ⏰ · packer), the **Preparation** section, and the **Comments** thread **with a visible composer**;
  everything else collapses behind a **"Details ▾"** toggle. Inside Details: (1) delegation is reversible — *Packed by*
  gains a **"niemand"** clear option; (2) the container picker lives here, labelled **"Gepäck · optional"**, default
  none; (3) mode labels are 🧳 Packen · 🛒 Vorher · 📍 Vor Ort with **Late Packer** a *separate ⏰ flag* (FR-25.4); (4) the
  prep lifecycle (add / resolve / reopen, packed-with-open-prep amber) is explicit.
* **No "Used by" attribution; item membership editable:** the free-form *Used by* traveler
  label on a shared row (base FR-4.2) is **not carried** — it earns its keep only for per-person items and
  weight-by-person, and read as noise otherwise. In its place, M5's **"Wer braucht das?"** control edits **per-person
  membership** directly: `Gemeinsam` = one shared row for all; picking travelers turns the item into a **per-person
  item** (FR-1.4/25.1) with one independently-packable row each — so *adding Leonardo puts a "Sonnenbrille" row on his
  list*, removing a traveler drops their row. Consequences: M4 **shared** rows show no for-whom avatar (only
  per-person child rows carry their owner avatar) — their lead slot, the mark, is the door to the for-whom strip
  and names nobody (FR-25.28); person-grouping (M4) and per-person analytics (M12) derive from
  **per-person rows** rather than a shared-row label; the shopping *Used by* idea (FR-25.6) is revisited under this
  model. FR-25.21 is where the multi-select, the per-traveler amounts and the write path live. The control is not
  M5's alone and not a sheet — see *The for-whom strip* under M4 (FR-25.28).
* **On a per-person instance the sheet says which one it is** (FR-25.21): the M5 header names the
  traveler and that instance's amount (*„für Leonardo · 3 Stück"*) and the glance chips carry the traveler beside a `3
  Personen` chip, so it is never ambiguous whether an edit here is the person's or the item's. Membership is the one
  field that is the item's, and it says so: *„Änderungen hier gelten für alle Zeilen dieses Packelements."*
* **Elements — progressive disclosure:** *Level 1 (always):* header (name, quantity stepper, state); a compact
  **glance-chip row** summarising the advanced blocks (membership · mode · luggage · ⏰ late · packer) with a **"Details
  ▾"** toggle; **Preparation Todos (FR-7.3)** (a tick at the end of each line, where M4 ticks the same task, + inline
  "Add prep todo…"); **comment/task thread (FR-7.1/7.2) with a visible composer** and per-comment "flag as task"; packed
  items with open todos show an amber state. **The for-whom strip (FR-25.28)** stands at level 1, under the packing
  block: the toggle line (every name whole, M04's layout), and under it one line per lit traveler with a **quantity
  stepper** — a list rather than a stepper hung under each avatar, because a stepper is wider than a toggle and would
  reach into its neighbours' columns at five travelers on a phone. It closes with the summary *„3 Personen · 6 Stück"*,
  which a standing question replaces. It acts on **every instance** of the item, not only on the row the sheet was
  opened from. **No save button** — every control commits immediately (G-5, FR-25.15). Absent under two travelers (G-8),
  where the membership glance chip is what is left to say *Gemeinsam*; read-only under a foreign claim on any instance
  (G-3). *Level 2 (behind Details ▾):*
  *Packed by* delegation picker **with a "niemand" clear** (FR-4.2/6.2); mode selector (🧳/🛒/📍, FR-3.1); **optional**
  container picker default none (FR-10.2); Late Packer ⏰ flag; *Unused/Missing* flags (FR-9.1, active trips only);
  history sparkline (FR-14.1).
* **The FR-9.1 flags are controls, not a readout.** A readout would leave **no surface in the whole app that could
  mark an item *unused*** — and *unused* is the flag M14's assistant is mostly about (FR-9.2 is written around
  overpacking). They are two toggles with a one-line hint each („Mitgenommen, nie gebraucht" / „Gebraucht und nicht
  dabei"), and both are revocable, because a flag set by mistake is otherwise permanent. **The two have different
  windows (FR-9.3):** *unused* is offered
  while the trip is active **and after it is archived**, because M14 — the first place anyone sees what the flag was
  worth — runs on the archived trip, and FR-9.1's active-only rule was true of setting a judgement in the moment and
  false of correcting it; *missing* keeps the active-only gate, since it is stamped by the FR-5.6 quick-add and a thing
  bought after the trip is not a thing that was missing on it. A planning trip offers neither. Both flags show in the
  glance chip row.
* **The packing block names itself (UX-10).** The stepper/checkbox box carries the same eyebrow label as
  *Vorbereitung* and *Notizen* („Einpacken"): on a quantity-1 row the block would otherwise render as an unlabelled
  outlined box holding only a checkbox and the state chip, readable as anything.
* **"Nicht einpacken" sits beside the stepper (FR-5.5).** A full-width, spelled-out control directly
  under the packing block, flipping to *Doch einpacken* — and picking up the `--jp-done` role — once the row is skipped.
  It is a control rather than a chip because it is a *decision about* the row, not a property of it, and it is spelled
  out because M4's press-and-hold is the fast path while this is the one a user finds without knowing it exists. The
  stepper says *how many*; only this says *none, on purpose*.
* ***Zugewiesen an* is a control, not a readout.** It is the writer of `packer_user_id` (FR-25.19) that every surface
  reading responsibility — M4's row avatar, the „zuständig war …" stamp, FR-25.20's filter and its reveal bar — depends
  on, and the app's way to fire the FR-6.2 delegation notification. It is a picker in *Details ▾* beside the luggage
  one, with **„niemand"** as its clear, and it offers **the trip's members other than yourself** — not the instance
  directory the sheet also carries for naming a packing record, because a row handed to a non-member notifies somebody
  who cannot open the trip (P-3), and a row handed to yourself says nothing. It is therefore **absent** wherever that
  list is empty (G-8), which is the one rule covering all three cases: Local Mode has no members, Single-User has
  exactly one (the store writes a membership row for every trip's creator, there too), and an unshared Server-Mode trip
  has only you. A locked row (G-3) writes nothing.
* **Actions:** edit **membership** (add/remove a traveler → adds/removes that person's packing row, FR-25.1); **mark the
  row deliberately not packed, and take that back** (FR-5.5); set **Zugewiesen an** → notification (FR-6.2) — the
  *packed by* record beside it is written automatically and is not editable (FR-25.19); **clear *Packed by* via
  "niemand"**; expand/collapse **Details**; add a comment (composer); resolve/reopen tasks; add/resolve/reopen prep
  todos (FR-7.3); "Buy now" on *Vorher kaufen* items → mode flips to *Packen* with undo snackbar (FR-3.3). In
  Single-User Mode (Addendum FR-17.3), *Delegate* is hidden — the sole user is already every item's *Packed by*.
* **States:** Locked by another user → read-only with lock banner; unsaved edits impossible (every control commits
  immediately, G-5). **The for-whom strip carries its own lock line** (FR-25.21, FR-25.28, G-3): it is frozen by a claim
  on **any** instance of the item — a conversion rewrites every row of the cluster — so the claim may sit on a row the
  sheet was not opened from, where M5’s own banner is absent. The line names the holder (*„Alice packt gerade eine
  dieser Zeilen."*) and falls back to *„Jemand …"* for a holder the directory does not carry (E2E-G3-04).
* **Navigation:** Opens over M4/M6; swipe down to dismiss.
