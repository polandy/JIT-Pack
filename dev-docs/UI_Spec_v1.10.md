# UI Specification: „JIT-Pack" — Screens & Interaction Design (v1.10)

**Document Status:** Proposed for Review
**Basis:** Base PRD + Addendum v2.10 (Consolidated)
**Revision Note (v1.10):** Demo Mode removed (Addendum v2.10): G-8 loses the demo reset banner and is now Single-User/Local only. No other changes from v1.9.

**Amendment (2026-08-13, M4 built):** M4 is implemented from this spec, and three points are corrected against what the screen actually does — a spec that disagrees with the running code is worse than no spec. (1) M4's *"Consciously skipped"* collapsed section is **superseded by FR-25.2**: a skipped row *is* a done row, revealed by the same *Erledigte* switch as a packed one. Two mechanisms for one class of rows would show them twice with both switched on. (2) The header line **no longer migrates the trip name into the app bar** on scroll — ADR-011 put the name there permanently, so there is nothing to migrate; the line simply yields on the way down and returns on any upward scroll. (3) M4's app-bar cluster carries **archive** beside search, filter and fold-all: it is not in the mock, which never modelled archiving anywhere, and it is the only path to M14 today. It moves when the M2 trip actions are rebuilt.

**Amendment (2026-08-13, M4 built):** M4 is implemented from this spec; three points are corrected against what the screen actually does, because a spec that disagrees with the running code is worse than no spec. (1) The *"Consciously skipped"* collapsed section in M4's Elements is **superseded by FR-25.2**: a skipped row is a done row, revealed by the same *Erledigte* switch as a packed one. Two mechanisms for one class of rows would show them twice with both switched on. (2) The header line **no longer migrates the trip name into the app bar on scroll** — ADR-011 put the name there permanently, so there is nothing left to migrate; the line simply yields and returns. (3) M4's app-bar cluster carries **archive** beside search, filter and fold-all. It is not in the mock, which never modelled archiving anywhere, and it is the only path to M14 today; it moves when the M2 trip actions are rebuilt.
**Platform Targets:** Mobile-first (Capacitor iOS/Android), responsive web — mobile is the primary design target, but every screen must remain fully and comfortably usable on desktop (G-9). All screens must function fully offline (NFR-4.1); sync state is surfaced globally, not per screen.

---

## 0. Global Patterns

These patterns apply to every screen and are specified once.

* **G-1 (Navigation Model):** Bottom tab bar with four tabs: *Dashboard*, *Trips*, *Templates*, *Items*. Everything else is reached contextually (drill-down, bottom sheets, wizards). Settings via avatar in the top bar. In Single-User Mode (Addendum FR-17.2), there is no account to display, so the avatar is replaced by a plain settings-gear icon; it still opens M17.
* **G-2 (Sync Indicator):** A persistent, unobtrusive status glyph in the top bar: synced / syncing / offline (queued changes count). Tapping it opens the sync detail incl. the conflict log (NFR-4.2a). **Local Mode (Addendum 3.19):** the glyph shows a distinct *local* state (device icon) instead of the three network states — but it reports *syncing* while a write to IndexedDB is still open (added 2026-08-14): FR-19.2 calls an applied change durable, and saying "on this device" before the transaction closed was a promise made before it was kept, which a reload in that window turned into apparent data loss; tapping it opens the storage & backup detail (FR-19.6: persistence status per NFR-4.11, last portable export, one-tap export) instead of the conflict log — conflicts cannot occur in Local Mode.
* **G-3 (Presence & Locks):** Items locked via *Packing Now* (FR-5.3) render with the locker's avatar and name ("In progress by Andy") and are non-interactive for others except viewing.
* **G-4 (Deep Linking):** Every notification and dashboard entry resolves to `trip/{id}/item/{id}`; the target screen scrolls to the item, flashes it once, and expands attached comments/tasks (FR-6.3).
* **G-5 (Optimistic UI):** All mutations commit locally first and render immediately; server confirmation is silent. Failures surface via the sync indicator, never as blocking dialogs.
* **G-6 (Quantity Stepper):** Wherever quantities appear, a unified stepper component is used: tap = ±1, long-press = complete/zero (units retired with FR-1.8, 2026-08-08 — quantities are bare numbers). **Decided: items with quantity = 1 use a plain checkbox instead of the stepper**; the stepper itself only ever appears for quantity > 1.
* **G-7 (Empty States):** Every list screen defines an empty state with a single primary action (e.g., Templates empty → "Create first template" / "Import from spreadsheet").
* **G-1 icons (2026-08-14):** the four anchors are Dashboard · **Trips (a train)** · Templates · Items. The plane it shipped with said something untrue about the household: these are ground journeys, and the anchor icon is the first statement the app makes about itself. The same list feeds the desktop rail and the mobile bar (`router/anchors.ts`), so the two cannot drift.
* **G-8 (Single-User Mode):** Single-User Mode (Addendum FR-17.1) shows no banner — it is visually indistinguishable from normal operation except for the absence of sharing, delegation, and notification UI, hidden per screen as noted in M2, M3, M5, and M17 below. **Local Mode (Addendum FR-19.3)** hides the same collaboration UI the same way and likewise shows no banner; its only visible marker is the G-2 *local* glyph. (A demo reset banner lived here through v1.9; Demo Mode was removed in Addendum v2.10.)
* **G-9 (Header & Desktop Navigation):** The top bar shows, left to right: the app logo — a compact mark on mobile, full wordmark from the desktop breakpoint up — followed by the sync glyph (G-2) and the avatar/settings control (G-1) on the right. The logo is a link/tap-target to M1 (Dashboard) and occupies the bar's left slot **on the four tab roots**. On every other screen that slot carries **`‹ back` and the page title** instead, and the way out is the back-target contract rather than the logo (ADR-011; the earlier "from anywhere, including from within a trip, template, or wizard" is superseded). The right-hand group — sync glyph and avatar/settings — is present on **every** screen, which is what keeps the conflict log reachable inside a trip. There is exactly one header bar in the app; no screen supplies its own. **Desktop breakpoint (≥ 900 px, resolving Open UI Decision #4):** the bottom tab bar (G-1) is replaced by a persistent left-side navigation rail carrying the same four tabs (Dashboard/Trips/Templates/Items); the top bar then spans the remaining width and additionally hosts page-level primary actions inline (e.g., M2's "New trip" FAB, M4's G-12 action cluster) instead of floating over content. Below the breakpoint, the mobile layout (bottom tabs, floating FAB, compact logo mark) applies unchanged.
* **G-10 (Trip Presence & Group Sync):** Distinct from G-2, which reflects only *your own* device's connection state, this pattern shows who else is currently on the same trip and whether the *group* is caught up. It lives in the trip-level header (M4's sticky header, not the global app header of G-9), since presence is meaningless outside a specific trip.
  * **Facepile:** overlapping circular avatars of everyone currently viewing/editing this trip (sourced from the `presence` WebSocket event, Sync-API Spec §7). Mobile shows up to 2 avatars plus a "+N" overflow bubble; desktop (≥ 900 px) shows up to 4 before overflow, simply reflecting the wider header.
  * **Group-sync badge:** a small dot on the facepile — green when every present device's last-acknowledged pull cursor matches the trip's current `change_log` head, amber if at least one present device is still catching up. This is a coarse, best-effort signal (it only reflects devices currently connected via WebSocket, not fully offline ones) and is never used to block any action.
  * **Tap/click** opens a bottom sheet (mobile) or popover (desktop) listing each present person by name, avatar, and their individual sync state — the group-level detail view, parallel to G-2's own-device detail view.
* **G-11 (Theming, Addendum 3.21):** The app defaults to a dark theme styled on the Catppuccin **Mocha** palette (catppuccin.com), in every mode including Local Mode, independent of OS color-scheme preference. Background depth (`crust`/`mantle`/`base`), surfaces (`surface0`–`surface2`), and text hierarchy (`text`/`subtext0`/`subtext1`) follow Catppuccin's own layering; the accent set is mapped onto the app's existing color-coded states rather than introducing new colors — e.g. G-6's packed state, G-3's lock chip, M11's amber/red weight thresholds, and M4's mode chips all draw from the same token set. A light theme (Catppuccin **Latte**) is available as an opt-in toggle in M17 (Addendum FR-21.3); the choice is a device-local preference, applied before first paint to avoid a flash of the wrong theme (FR-21.4).
* **G-12 (Screen Actions in the App Bar — new 2026-08-07, from concept testing of M6 and M4):** A screen carries its actions as a **compact icon cluster in the global app bar (G-9)**, never as additional full-width rows of controls below it. Established on M6, adopted as the house pattern, and **M4 was converted to it**: two stacked control rows (a labelled filter bar plus a "grouped by" line) made the product's core working screen restless beside it.
  * **Placement — the app bar, replacing the gear on detail screens.** On any screen reached with the back chevron (M4, M6, …) the cluster occupies the app bar's right side and the **settings gear is hidden there**; the gear is a global, rarely-used destination and has no claim on a screen you are working on. Root/tab screens keep the gear and show no cluster. Rationale beyond tidiness: M4's sub-header **collapses on scroll** (Addendum §3.25), so a cluster living in that sub-header would slide away mid-task — in the app bar the actions stay reachable while packing.
  * **Order and meaning:** 🔍 **search**, collapsed — the field appears below only when the icon is tapped, and its ✕ *closes* it rather than merely emptying it, since an empty open field gives back the row the icon just reclaimed. Then the **filter** icon, carrying its active-value count as a badge (Addendum FR-25.11a/k).
  * **Two clusters, split by what they act on (refined 2026-08-07).** The app bar carries actions on **this list** — search and filter. Navigation to **other views of the same entity** sits as icons on the screen's own header line instead: on M4 that is Shopping (with its open count), Luggage and Analytics, on the trip title line. **No overflow menu.** Hiding three destinations behind an unlabelled ⋯ is precisely the discoverability failure §3.25 recorded, and testing confirmed it: an ⋯ tells you nothing about what is inside, so nobody opens it.
  * **Icon-only controls must still be nameable.** Dropping the labels is only acceptable if the name is retrievable: every such icon carries a `title` for desktop hover **and** shows the same name as a bubble on **long-press** for touch. Never on tap — tapping must act, so learning what a glyph means may never cost an extra tap.
  * **What stays out of the cluster:** identity and progress. The screen's own header line keeps the trip name, packed/total, weight and open-prep, **unfiltered** — real progress must remain visible regardless of the current view.
  * **Active state still shows below.** When a filter is set, the removable chip row (FR-25.11a) appears under the header; when nothing is filtered, no row is drawn at all. The cluster is an entry point, not a status display — the badge says *that* something is filtered, the chips say *what*.
  * **Icons must be literal.** Concept testing rejected a generic cube standing in for both Shopping and Luggage: a cart means buying, a suitcase means luggage, and one glyph for two destinations defeats the point of shrinking labels away.
  * **Budget.** With back chevron, logo, title and the cluster, M4 reaches six elements in the bar — treat that as the ceiling. A screen needing more moves the surplus behind ⋯ rather than widening the cluster.

---

## 1. Screen Inventory

| # | Screen | Priority | Primary FRs |
|---|--------|----------|-------------|
| M1 | Dashboard "My Tasks" | MVP | 6.1, 6.3 |
| M2 | Trip List | MVP | 2.1, 13.1 |
| M3 | Trip Creation Wizard | MVP | 2.1–2.3, 14.2, 15.1 |
| M4 | Packing List (Trip Detail) | MVP | 3.x, 4.x, 5.x, 8.1 |
| M5 | Item Detail Sheet | MVP | 4.2, 4.3, 7.x, 14.1 |
| M6 | Shopping Views | MVP | 3.1–3.3 |
| M7 | Template List | MVP | 1.2, 1.6 |
| M8 | Template Editor | MVP | 1.3–1.5, 15.2 |
| M9 | Item Inventory | MVP | 1.1 |
| M10 | Item Editor | MVP | 1.1, 1.7, 1.8 |
| M11 | Container Management | P2 | 10.1–10.3 |
| M12 | Analytics | P2 | 8.1, 8.2, 14.3 |
| ~~M13~~ | ~~Repack Mode~~ — removed (§3.11) | — | — |
| M14 | Post-Trip Review Assistant | P2 | 9.1, 9.2 |
| M15 | Import Wizard | P2 | 16.1–16.3, NFR-4.7 |
| M16 | Series & Destination Profile | P2 | 13.1–13.3 |
| M17 | Settings & Notifications | P2 | 6.2, NFR-4.5/4.6 |
| M18 | Portable Import Preview | P2 | Addendum 3.18 |
| M19 | First-Launch Mode Selection | P2 | Addendum 3.19 |
| M20 | User Administration | P3 | Addendum 3.23 |
| M21 | Vorlage aus Reise (Template from Trip) | MVP | Addendum 3.27 (27.5, 27.1, 27.4) |

---

## 2. Screen Specifications

### M1 — Dashboard "My Tasks"

* **Purpose:** Single entry point answering "what do I have to do right now?" across all active trips (FR-6.1).
* **Elements:** Greeting header with sync glyph (G-2); grouped card list per active trip: my open packing items (count + next 3), my open tasks (FR-7.2), items delegated to me since last visit (highlighted); global "Late Packer" section that appears only on a trip's departure day. **Preparation Todos section (FR-7.3):** a dedicated "Prep to do" card listing open preparation todos across all active trips, grouped by item (e.g., "Camera: charge battery, format SD card"). Tapping a todo toggles it resolved; tapping the item name navigates to M5.
* **Actions:** Tap card → deep link into M4 at the item (G-4); swipe an item row → quick-complete (increments per G-6); pull-to-refresh forces sync.
* **States:** Empty (no active trips) → CTA "Plan a trip" → M3; offline → cached data with glyph; badge counts update in real time via WebSocket (FR-4.4).
* **Navigation:** Tab 1. Deep-link target from notifications.

### M2 — Trip List

* **Purpose:** Overview and entry to all trips.
* **Elements:** Filter bar (search + segmented *Active / Planned / Archived*, the shared list-filter pattern); per-trip row: name, dates, progress ring (packed/total), participant avatars, and a presence facepile (G-10) showing who's currently active on that trip — the same component as M4's header, not a simplified variant, since concurrent presence on a given trip is rare enough that it won't clutter the row.
* **Default ordering (concept-review 2026-07-17, realised and refined 2026-08-08):** **one flat list, not grouped by Trip Series.** M2 is the app's main entry since the phase hub was dropped, and what belongs on top is the trip you are packing for, not a taxonomy of your holidays. Ordering is by usefulness rather than literally newest-first: the **active** trip leads, then **upcoming trips soonest first** — a trip in three weeks matters more than one in eighteen months, which pure date-descending would put above it — then **archived newest first**, because history reads backwards. The series stays visible as a **chip on the trip row** and remains the way into M16; the optional series-grouped view was dropped as unnecessary once the list is short and sorted.
* **Actions:** Tap → M4; FAB "New trip" → M3; long-press → context menu (Clone per FR-12.1, Archive, Share, Export per Addendum FR-18.3, Delete — destructive actions require confirmation and Owner role per FR-4.5); tap series header → M16. In Single-User Mode (Addendum FR-17.3), *Share* is omitted from this menu — there is no second account to share with. Overflow menu also offers *Import trip from file* → M18 (alongside the legacy spreadsheet importer, M15).
* **States:** Archived trips render muted with final stats; imported legacy trips (FR-16.2) carry an "Imported" chip.
* **Navigation:** Tab 2.

### M3 — Trip Creation Wizard

* **Step 2 opens with the default travellers (FR-2.5a, 2026-08-14)** from M17, editable there like any other traveller.
* **Step 1 folds its optional fields (FR-2.1c, 2026-08-14):** name and year stand alone; dates, series and attributes live behind one *Mehr Optionen ▾* row that states what is set behind it.
* **Step 1 requires a name and a year (FR-2.1b, 2026-08-14).** The year is a picker that opens on the current one, so the required field is satisfied on arrival; both dates are marked optional and neither gates *Next*. The duration line appears only when both dates are set.

* **Purpose:** Generate a trip instance from templates with correct quantities on the first pass.
* **Step 1 — Metadata:** Name, series picker (or "New series"), optional start date and end date (duration auto-computed and displayed when both dates are set, FR-2.1/2.1a), attribute chips: season, transport, accommodation (FR-15.1; prefilled from series defaults).
* **Step 2 — Travelers:** Add travelers (name only — the Adult/Child type was removed 2026-08-08 with FR-25.9, FR-2.5), optionally link to a registered user account; share the trip with user accounts and assign roles: Owner (creator, immutable), Admin (can manage travelers and roles), Editor (default — can edit items but not manage travelers) (FR-4.5/4.7). In Single-User Mode (Addendum FR-17.3), the sharing and role-assignment part of this step is hidden entirely — only traveler add/edit remains, and the sole user is silently the trip's Owner.
* **Step 3 — Templates:** Checkbox list of all templates (shared instance-wide, FR-1.6 MVP simplification 2026-08-08); live preview footer: resulting item count, deduplicated overlaps listed with the applied merge strategy (FR-2.3); items excluded by conditional rules (FR-15.2) shown collapsed with reason ("skipped: season ≠ winter"). **Implemented (Addendum 3.20):** the footer additionally reports companion items pulled in automatically ("+ 2 companion items (battery, screwdriver)"); step 4 lists them with their main item, notes FR-20.3 dedups ("already on the list, not duplicated"), and offers suggested companions as opt-in checkboxes (FR-20.4).
* **Step 4 — Quantity Review:** Virtualized list of all generated items; each row: name, the template quantity with a stepper, history hint "2024: 5 · 2025: 6 → suggested 6" with one-tap accept (FR-14.1/14.2; formulas retired 2026-08-08); destination checklist offer if the series has one (FR-13.3).
* **Actions:** Back/Next per step; "Create trip" commits and opens M4.
* **States:** Draft persists locally between steps (offline-safe).
* **Navigation:** From M2 FAB or M1 empty state. Cancel returns without residue.

### M4 — Packing List (Trip Detail) — *core screen*

* **Purpose:** The live, collaborative packing workspace, and — decided 2026-08-08 — **the trip screen itself**: tapping a trip in M2 or M1 opens M4 directly, with no hub in between. Highest design investment.
* **No phase hub in the MVP (decided 2026-08-08).** A four-phase trip hub (*Planen · Vorbereiten · Unterwegs · Danach*) was mocked and then dropped. Two reasons: three of its four panels were North-Star content with nothing behind them (idea board, day plan, expenses — `Vision_NorthStar_v1.0.md` §2 marks Plan and During as ❌ new), and its remaining entries duplicated the ones M4 already carries on its trip line since G-12. A hub with two dead tabs claims a structure the app does not have, and every later design question would have had to ask "hub or M4?". **Re-entry point, so this stays deliberate rather than forgotten:** when the Plan and During phases acquire real content, they attach *here* as a phase frame above M4 — M4 becomes the *Vorbereiten* phase rather than being replaced.
* **Redesign complete (Addendum §3.25) — mocked and settled 2026-07-17 … 2026-08-08.** The screen was re-mocked from scratch to give the actual packing far more room. The full reasoning per decision lives in the addendum; what M4 *is* now:
  * **One header line** — trip name · packed/total · weight · open-prep, plus the presence facepile — and nothing else. It stays **unfiltered**, so real progress is visible whatever the current view shows. On scroll-**down** it hides and the trip name + facepile migrate into the top app bar, returning on any upward scroll.
  * **Actions live in the app bar (G-12), not in the header:** search (collapsed behind its icon), filter (badge = active facet count), fold-all. The trip's *other views* — 🛒 Shopping with its open count, 🧳 Luggage, 📊 Analytics — are icons on the trip line. **There is no ⋯ overflow** (FR-25.11k, G-12).
  * **Faceted filter panel** (FR-25.11) replaces the old grouping bar + mode pill strip: a bottom sheet holding *Gruppieren nach*, an *Erledigte* switch, and the facets Person / Kategorie / Beschaffung / Gepäck / Merkmale. OR within a facet, AND across facets; active values appear as removable chips under the header.
  * **Rows assigned to someone else are hidden by default** (FR-25.20; "Zugewiesen an" is the term everywhere, M4/M5 and M6 alike): M4 opens on your own work. Unassigned rows stay — they belong to everyone. A reveal bar names the count and the people, and the switch sits in the filter panel beside *Erledigte*; the header keeps counting the whole trip regardless.
  * **Done rows drop out** (FR-25.2) — fully packed *or* consciously skipped, but never a row with open preparation (FR-7.3). Revealed via the *Erledigte* switch, dimmed but interactive, each showing **who packed it and when** (FR-25.17). A fully-done group disappears header-and-all.
  * **Groups fold** (FR-25.16): tapping a header collapses the group to that line, which then carries its open count; fold-all turns the list into a table of contents.
  * **Per-person items render as a named cluster** (FR-25.1) — item name once with `done/total`, one indented child row per traveler; a lone instance (notably when grouped by traveler) falls back to a flat "Item · Person" row. Cluster-vs-flat is decided over the *full* set, so packing one instance never restructures the list.
  * **One avatar at the right edge** (FR-25.3/25.19), set apart from the traveler avatar on the left: it shows the **assignee** while the row is open (blue ring) and **who actually packed it** once it is packed (green ring + check). Never both — the left avatar already answers *for whom*, and a third circle makes the row unreadable.
  * **Procurement glyph on the two buy modes only** (🛒 / 📍; 🧳 stays silent so the exceptions stand out), once per cluster header; **Late Packer** stays a separate ⏰ flag (FR-25.4).
  * **Quick-add** stays inline, collapses on blur, and is opened *and focused* by the ＋ FAB, which also carries a **visible confirm button** — a phone has no reachable Enter (FR-25.13/13a). It also adds **whole groups** (FR-27.10, new 2026-08-08): typing filters groups alongside items under *„Ganze Gruppe hinzufügen“*, and one tap expands the group into the trip — deduped against what is already there, provenance stamped, FR-27.7 tasks materialised, result reported, and deliberately **not** flagged *Missing*.
  * **Full-screen:** the bottom tab bar is hidden here, the FAB drops to the screen foot, and the list scrolls clear of the FAB's whole footprint so nothing sits permanently underneath it (FR-25.11h).
  * Container assignment defaults to none and is de-emphasized so it never blocks packing (FR-25.5).
  * **An archived trip leads with a closing card** (the one real remnant of the dropped *Danach* phase): "🧩 Reise abgeschlossen" with **"Vorlage aus dieser Reise erstellen →"** (M21, FR-27.5) and the M14 review suggestions beneath it. The packed list stays visible below as the trip's record.
* **Group presentation (added 2026-08-14, owner report):** a category **heads** the rows under it and must look like it — it shipped as uppercase micro-type *smaller* than the item names it introduced, which inverts the hierarchy it exists to state. Three levels, three weights: the group heading, then a per-person cluster's name (FR-25.1), then the rows. And **each group is its own block** — a bordered card carrying its rows — because with nothing but a gap between them, two categories run into each other on a long list. The concept mock had the card from the start; the first implementation dropped it.
* **Elements:**
  * Sticky header: trip name, packed/total, weight (FR-8.1), **open-prep count** (FR-7.3), trip presence facepile and group-sync badge per G-10. *(The former KPI tile strip is gone — Analytics is now a labelled icon on the trip line rather than a tap on a tile, which testing found undiscoverable.)*
  * Grouping switcher: *Category / Container / Person / Status*, now inside the filter sheet's *Gruppieren nach* section rather than as its own bar. **Decided: persists per user per trip** (not a global preference) — switching to *Container* view on one trip doesn't affect another trip or another user's view of the same trip.
  * Item rows: checkbox area (stepper per G-6 for quantity > 1, showing "3/5"), name, chips: mode (BUY_BEFORE/BUY_LOCAL), Late Packer flag, assigned traveler avatar, packer avatar, container tag; lock overlay per G-3.
  * **Inline quick-add (FR-5.6):** A persistent "Add item..." trigger below the filter bar. Tapping it expands an inline text input with autocomplete suggestions from the master item inventory (M9). Enter on free text creates a new ad-hoc trip item; selecting a suggestion reuses the master item's metadata (weight, value, category). If the trip is active, new items are auto-flagged *Missing* (FR-9.1). The input stays expanded after adding for rapid entry; Escape or the close button collapses it. No navigation away from M4 required.
  * Collapsed sections: "Consciously skipped" items (FR-5.5), "Late Packers" (pinned to bottom until departure day, then pinned to top), and **"Preparation" (FR-7.3)** — all open prep todos for the trip, grouped by item with traveler avatar. Visible to all trip members; resolving a todo is restricted to the item's assignee or trip owner. Tap item name → M5.
  * Item rows with open prep todos show a small **prep badge** (wrench icon + count) next to the item name. Packed items with open todos use a distinct "packed with open prep" style (e.g., amber checkbox instead of green) to signal incomplete readiness.
  * **Consciously skipped section (FR-5.5):** Collapsed by default at the bottom of the list. Header shows count. Expanding reveals skipped items with strikethrough styling. Swipe-to-unskip restores them to open state with quantity 1. Purpose: explicitly acknowledge that an item was considered but deliberately not packed — distinguishing "forgot" from "decided against."
  * Filtering: the faceted panel described above (FR-25.11), reached from the app-bar filter icon. *(Supersedes the earlier "my items only / open only / per traveler" bar — "open only" is now the Erledigte switch and "per traveler" the Person facet.)* **Decided: the filter, the Erledigte switch and the grouping persist per trip for the session** (FR-25.18) — deliberately session-scoped where grouping is durable, since a forgotten filter hides rows; a fresh session starts unfiltered and the chip row keeps the active filter visible throughout.
* **Actions:** Swipe right → *Packing Now* (FR-5.2); swipe left on active item → context options: *assign-to-me* (FR-4.3) or *skip* (marks as consciously skipped, FR-5.5); swipe left on skipped item → *unskip* (restores to open); tap row → M5; long-press checkbox → complete item; toolbar: open shopping views (M6), archive trip (→ triggers M14). **Implemented (Addendum 3.20):** skipping an item cascades to co-skip its dependent companion items into the same "Consciously skipped" section with a reason (e.g., "skipped: drone not on this trip", FR-20.2); a quick-add that matches a master item pulls its missing required companions in automatically (FR-20.4).
* **States:** Real-time: rows animate on remote changes with actor attribution ("packed by Sarah"); item blocked by open tasks shows a task badge and refuses completion with inline hint (FR-7.2); offline behaves identically (G-5).
* **Navigation:** From M1, M2, notifications. Deep-link anchor target (G-4). **Desktop (≥ 900 px, per G-9): two-pane layout** — M4's list occupies the left/main pane while M5 opens as a **persistent side panel** on the right rather than a bottom sheet; selecting a different row swaps the panel's content in place. Below the breakpoint, M5 remains the mobile overlay sheet described above.

### M5 — Item Detail (Bottom Sheet)

* **Rebuilt 2026-08-14 (owner: the detail view is unattractive and cluttered).** The screen is opened for one of three reasons — to pack the thing, to note something about it, or to change one attribute — and the build gave all three the same weight: nine equal sections, every one expanded. The order is now the order of those reasons: **identity** (name, small reference photo, one context line), **packing** as its own block and the largest control on screen, a read-only **glance row** for everything the sheet can also change, then **Preparation** and **Notes** with their composers, and finally *Details ▾* holding membership, procurement, luggage, the Late-Packer flag, the FR-9.1 flags and the FR-25.17/25.19 stamp.
* **It is a sheet over M4, and a side panel beside it above the G-9 breakpoint** — one content component either way. The route carries it (`/trips/:tripId/items/:itemId`), which is what makes a notification deep link (G-4) land on the item with the list behind it. **The list's route and the item's are one record with an alias**, and opening or closing *replaces* rather than pushes: Ionic keeps a page per matched path, so pushing mounted a second copy of the list behind the sheet. **On a phone the sheet's ✕ (or a swipe) is the way out** — its backdrop covers the app bar, so `‹ back` is deliberately unreachable there; with the desktop panel, back closes the panel first (`meta.overlayParam`).
* **The reference photo is small** (44 px beside the title, FR-22.1): it helps recognise the thing without taking the top of a screen most rows have no photo for.

* **Purpose:** Everything about one trip item without leaving context.
* **Concept-review refinements — realised in the concept 2026-07-18 (Addendum §3.25):** the sheet is reorganised with **progressive disclosure** — *level 1* shows only the header, a compact read-only **glance-chip row** (who needs it · mode · luggage · ⏰ · packer), the **Preparation** section, and the **Comments** thread **with a visible composer**; everything else collapses behind a **"Details ▾"** toggle. Inside Details: (1) delegation is reversible — *Packed by* gains a **"niemand"** clear option; (2) the container picker lives here, labelled **"Gepäck · optional"**, default none; (3) mode labels are 🧳 Packen · 🛒 Vorher · 📍 Vor Ort with **Late Packer** a *separate ⏰ flag* (FR-25.4); (4) the prep lifecycle (add / resolve / reopen, packed-with-open-prep amber) is explicit.
* **"Used by" attribution removed; item membership editable (decided 2026-07-18):** the free-form *Used by* traveler label on a shared row (base FR-4.2) is **dropped** — it earned its keep only for per-person items and weight-by-person, and read as noise otherwise. In its place, M5's **"Wer braucht das?"** control edits **per-person membership** directly: `Gemeinsam` = one shared row for all; picking travelers turns the item into a **per-person item** (FR-1.4/25.1) with one independently-packable row each — so *adding Leonardo puts a "Sonnenbrille" row on his list*, removing a traveler drops their row. Consequences: M4 **shared** rows no longer show a for-whom avatar (only per-person child rows carry their owner avatar); person-grouping (M4) and per-person analytics (M12) derive from **per-person rows** rather than a shared-row label; the shopping *Used by* idea (FR-25.6) is revisited under this model.
* **Elements — progressive disclosure:** *Level 1 (always):* header (name, quantity stepper, state); a compact **glance-chip row** summarising the advanced blocks (membership · mode · luggage · ⏰ late · packer) with a **"Details ▾"** toggle; **Preparation Todos (FR-7.3)** (checkbox per todo + inline "Add prep todo…"); **comment/task thread (FR-7.1/7.2) with a visible composer** and per-comment "flag as task"; packed items with open todos show an amber state. *Level 2 (behind Details ▾):* **"Wer braucht das?"** membership control (`Gemeinsam` / per-traveler multi-select, FR-1.4/25.1, replacing *Used by*); *Packed by* delegation picker **with a "niemand" clear** (FR-4.2/6.2); mode selector (🧳/🛒/📍, FR-3.1); **optional** container picker default none (FR-10.2); Late Packer ⏰ flag; *Unused/Missing* flags (FR-9.1, active trips only); history sparkline (FR-14.1).
* **Actions:** edit **membership** (add/remove a traveler → adds/removes that person's packing row, FR-25.1); set **Zugewiesen an** → notification (FR-6.2) — the *packed by* record beside it is written automatically and is not editable (FR-25.19); **clear *Packed by* via "niemand"**; expand/collapse **Details**; add a comment (composer); resolve/reopen tasks; add/resolve/reopen prep todos (FR-7.3); "Buy now" on *Vorher kaufen* items → mode flips to *Packen* with undo snackbar (FR-3.3). In Single-User Mode (Addendum FR-17.3), *Delegate* is hidden — the sole user is already every item's *Packed by*.
* **States:** Locked by another user → read-only with lock banner; unsaved edits impossible (every control commits immediately, G-5).
* **Navigation:** Opens over M4/M6; swipe down to dismiss.

### M6 — Shopping Views

* **Purpose:** Focused procurement checklists (FR-3.2).
* **Concept-review additions (Addendum §3.25 / FR-25.6, proposed 2026-07-17):** each shopping row can be **assigned to a traveler** (*Used by*, FR-4.2) from here, and can carry a **per-item comment/note** (FR-7.1) — e.g., "war im Migros Eigerplatz, gab es dort nicht" — so where-looked / unavailable / substitution context lives on the item. **Note (2026-07-18):** free-form *Used by* was removed (FR-25.10); this "assign to a traveler" is to be reframed (per-person shopping row or lightweight "for whom" note) when M6 is re-mocked.
* **Elements:** Two tabs: *Before departure* (BUY_BEFORE) and *At destination* (BUY_LOCAL); rows grouped by category; destination tab includes standing destination-checklist entries (FR-13.3) visually separated; per row optionally a traveler chip and a note indicator (§3.25).
* **Actions:** Check off → BUY_BEFORE items transition to PACK and leave this list with animation (FR-3.3); add free-text entry directly into either list; **assign a row to a traveler**; **add a per-item comment/note** (§3.25).
* **States:** Both lists empty → screen entry point hidden from M4 toolbar badge.
* **Navigation:** From M4 toolbar; deep-linkable.

### M7 — Template List

* **Purpose:** Manage modular master templates and the groups they are built from (FR-1.2, §3.27).
* **Elements:** One shared instance-wide list (FR-1.6 MVP simplification 2026-08-08 — no my/published split, no publish toggle), segmented **Alle · Ferien-Vorlagen · Gruppen** (FR-27.6). *Alle* renders the two scopes as sections, vacation templates first — they are what a trip starts from, groups are the building blocks — and group rows carry a *Gruppe* chip. Per row: name, item count; a composed template counts its **resolved** set (own positions + included groups, deduped), so "2 Gruppen · 16 Artikel" rather than "0 Artikel".
* **Actions:** Tap → M8 (every template is editable by every account); **FAB asks which scope to create** (two-option chooser with one-line explanations, FR-27.6). Long-press a row → context menu with *Export* (Addendum FR-18.2), producing a downloadable/shareable YAML file; the FAB's "+" menu also offers *Import from file* → M18.
* **Navigation:** Tab 3.

### M8 — Template Editor

* **Purpose:** Define the positions of one template — and, for a Ferien-Vorlage, which groups it is built from (FR-1.2, FR-27.1).
* **Redesign complete (Addendum §3.25/§3.27) — mocked and settled 2026-08-08.** The editor is now **scope-shaped** and follows the same capture grammar as the packing list:
  * **A Gruppe shows only *Positionen*** — there is nothing to nest, since the hierarchy is deliberately two levels (FR-27.1). **A Ferien-Vorlage additionally shows *Gruppen***, whose picker offers groups only and carries **"Neue Gruppe anlegen…"** inline, so a missing building block never forces a detour through M7. A resolution footer states what the composition actually yields after dedup.
  * **The scope is switchable but guarded** (FR-27.6): a Vorlage that still includes groups cannot become a Gruppe, and an included Gruppe cannot be promoted — the editor names the consumers ("Eingebunden in: …") instead of failing opaquely.
  * **Adding a position is the packing list's quick-add, verbatim** (FR-25.13, extended to M8 2026-08-08): ＋ FAB expansion, master-item autocomplete, a visible scope-labelled confirm, Enter, the field stays open, blur-collapses when empty, a duplicate is reported rather than added twice, and free text creates the master item (FR-1.1).
  * **Editing a position is the M5 bottom sheet** (2026-08-08): glance chips, the FR-25.15 auto-save chip, **Menge und Vorbereitung first**, everything else behind "Details ▾". The former inline expanding row form is gone.
  * **Progressive disclosure on the parameters** (FR-25.7): sensible defaults (quantity 1, trip-global, mode *Packen*, dedup *max*, no conditions, no Late Packer) mean a typical position is one tap; assignment (FR-1.4), default mode, Late Packer, dedup (FR-2.3) and condition chips (season/transport/accommodation, FR-15.2) live behind "Mehr Optionen". A per-person position carries **one quantity for everyone** — the Adult/Child split was removed with FR-25.9 (2026-08-08); concrete per-person numbers are set on the trip (FR-25.8).
  * **Preparation tasks on a position** (FR-27.7): a free-text list under progressive disclosure with a count chip on the collapsed row. Each task instantiates as an FR-7.3 todo on the generated trip item, and an open prep todo keeps that item from counting as done (FR-25.2).
* **Elements:** Scope selector; *Gruppen* section (Ferien-Vorlage only) with resolution footer; *Positionen* / *Eigene Positionen* list with quantity stepper (formulas retired with FR-1.3/1.5) and prep-task count chip; quick-add trigger.
* **Actions:** Add/remove positions and group includes; every change auto-saves (FR-25.15).
* **States:** Editing a template used by *planning* trips shows the FR-27.4 blast-radius note (those trips update immediately; running/past trips are frozen; everyone else sees changes at the next trip generation per FR-2.4).
* **Navigation:** From M7.

### M9 — Item Inventory

* **Purpose:** Central item database (FR-1.1) — the master-data screen for every item that can be packed.
* **Elements:** Filter bar (search + tag chip axis, the shared list-filter pattern) plus the **eye icon → "Angezeigte Eigenschaften" sheet** (FR-24.4); tag-grouped list — grouped by each item's **primary tag** so a row appears once (FR-24.2, proposed); per row **lean by default**: primary-tag avatar + name; tags/weight/price appear only when enabled in the property sheet (device-local). Logically-deleted items (FR-24.3) are hidden.
* **Actions:** Tap → M10; FAB → new item; merge duplicates via multi-select (supports FR-16.3 cleanup). **Swipe row → delete (proposed, 2026-07-17):** delete directly from the list without opening M10, applying the FR-24.3 lifecycle rule — an item ever used is tombstoned (logical), a never-referenced item is removed physically. The swipe reveal states which of the two will happen (distinct label, e.g. "Ausblenden" vs. "Endgültig löschen") so the user is never surprised; an undo snackbar covers slips in both cases. Complements the delete inside M10, same rule, same wording.
* **Navigation:** Tab 4.

### M10 — Item Editor

* **Purpose:** Edit one master item.
* **Elements:** Name, **multi-tag selector** — a search field filters the tag chips (assigned tags pinned), ＋/Enter creates an unmatched name as a new tag and assigns it (FR-24.1, filter-or-create; supersedes the single category picker), weight (g), price (instance currency) — units retired (FR-1.8, 2026-08-08). **Creation mode (FR-24.5):** minimal form — name (focused), tags, Gewicht/Preis behind "Mehr ▾"; the existing-item sections (Enthalten in, Kommentare, Löschen) are absent until the item exists. **Implemented (Addendum 3.20):** a "Depends on" section listing this item's declared dependencies with a required/suggested mode toggle per row, an add-picker with save-time cycle rejection, and a read-only "Companions" list of items depending on this one (FR-20.1/20.4).
* **States:** Shows usage footer: "Used in 4 templates, 12 archived trips"; archived trip snapshots are unaffected by edits (FR-2.4, stated in UI copy). **Lifecycle-aware delete (FR-24.3, proposed):** the footer states which deletion will occur — an item **ever used** deletes *logically* (tombstoned, kept for history/analytics), an item **never referenced** deletes *physically*; the earlier "deletion blocked while referenced" rule is replaced by this.
* **Navigation:** From M9 or inline from M8.

### M11 — Container Management

* **Purpose:** Define luggage containers and balance weight (3.10).
* **Concept round 2026-08-08.** M11 was in the prototype but had never been through a round: containers could not be created or edited at all, the FR-10.3 pairing indicator was unreachable code (the seed had no pair), and assigning an item rendered *one button per container per row* — a wall that grows with containers × items and buries the item name.
* **Elements:** Per-trip container list: name, carrier, weight bar (current/max) turning amber at 90 % and red beyond max (FR-10.3); the pairing imbalance line on paired containers; "Unassigned items" bucket at the bottom (FR-10.2), **one tappable row per item** rather than a grid of buttons.
* **Editing is the M5 bottom sheet**, the same grammar as M8's position sheet: header with the container's load, then name, carrier, weight limit and the pairing selector, with the FR-25.15 auto-save chip — no Save button. **Pairing is exclusive and set on both sides at once**, and clearing or deleting one side releases the other; a half-set pair would render an imbalance against a container that does not consider itself paired.
* **Creating is the FR-24.5 minimal form:** the ＋ FAB creates the container with a placeholder name and opens its sheet, so a name is enough to start and carrier/limit are filled in afterwards.
* **Assigning:** tapping an unassigned row opens the same sheet as a **container picker**, each option showing its current load — so "which bag?" is answered where the load is visible. Assignment stays optional and never blocks packing (FR-25.5).
* **Actions:** Create/edit/delete containers; assign items from the unassigned bucket via the picker. **Deleting a container unassigns its items rather than removing them** — items outlive their bag, and deleting rows with it would silently shorten the packing list.
* **Navigation:** From M4 grouping switcher (*Container* mode exposes an "Edit containers" entry) and from M12.

### M12 — Analytics

* **Purpose:** Weight/value insight (3.8) and long-term trends (FR-14.3).
* **Elements:** Dimension switcher *Person / Category / Container* (FR-8.2); stacked bar per dimension value: packed vs. planned weight; value total per dimension; series trend section (archived trips): weight over the years, top *Missing*/*Unused* items.
* **Concept round 2026-08-08.** Two defects found by clicking: tapping a bar only changed M4's *grouping* — the list arrived unfiltered, so the number you tapped was nowhere on screen — and per-person items (FR-25.1), which carry no top-level traveler or quantity, were bucketed under `undefined` in the Person view and counted with an undefined quantity elsewhere.
* **Actions:** Tapping a bar **sets the FR-25.11 facet** for that value and opens M4, where the chip row names the filter (FR-25.11a) and the session keeps it (FR-25.18); the grouping follows the dimension so the slice sits together.
* **Per-person items are expanded into shares** before aggregation — one (traveler, quantity, packed) share per traveler. By *Person* that is one contribution each; by *Category* or *Container* the shares sum back into a single bucket. Items with no traveler count as *Gemeinsam* (FR-25.11f's term).
* **States:** Items without weight metadata are aggregated as "unweighted (n items)" so totals are honest.
* **Navigation:** From M4 KPI strip; trend section also from M16.

### M13 — Repack Mode — **REMOVED (2026-07-17)**

Screen removed together with the Repack feature (PRD Addendum §3.11, removed by owner decision — not wanted). The M-number is retired and must not be reused. No repack entry appears in the M4 toolbar.

### M14 — Post-Trip Review Assistant

* **Purpose:** Close the feedback loop into master templates (FR-9.2).
* **Concept round 2026-08-08 (FR-27.11).** Two changes against the 2026-07 draft: the assistant is **a list, not a card stack**, and its proposals target **groups**, not the composed vacation template.
* **Elements:** One row per proposal: a kind chip (*ungenutzt* / *fehlte*), the item name, why it is being proposed ("auf dieser Reise nicht gebraucht", "unterwegs nachgekauft — fehlte auf der Liste"), and the **target group named in a picker that offers groups only** (FR-27.11). When the target group is used by planning trips, the row states the blast radius ("Wirkt auf N geplante Reisen …", FR-27.4). Per row: *Übernehmen · Überspringen · ✕ (nie mehr fragen)*. A header states how many are still open; applied and skipped rows stay in place, marked, and a footer counts what was written.
* **Actions:** Single-tap apply writes directly to the target group (shared instance-wide, FR-1.6 MVP simplification — no fork prompt) and logs an FR-27.4 applied change on every planning trip using it. **Decided: "Never ask again" scopes to the specific item–group pair**, not the item globally — the same item can still surface a proposal for a different group.
* **States:** No flags recorded → assistant skipped with a brief "nothing to review" toast; assistant is resumable if interrupted.
* **Navigation:** Auto-launch on archive from M4/M2; afterwards from the **closing card at the top of M4 on the archived trip**, which teases the first two proposals and links to the full list. Sits beside the M21 entry there — M21 folds back structure, M14 folds back individual items.

### M15 — Import Wizard

* **Purpose:** Migrate legacy spreadsheet history (3.16).
* **Step 1 — File:** Upload CSV/XLSX; parser preview of detected grid.
* **Step 2 — Mapping:** Mark the item-name column and category rows; per trip column: include-toggle, trip name, date (or year), target series (FR-16.1); noise handling per NFR-4.7 shown inline (e.g., "'Regenschutz Rucksack?' → item + open task").
* **Step 3 — Dedup:** Near-duplicate suggestions against existing master data with merge/keep-separate choice (FR-16.3).
* **Step 4 — Confirm:** Summary (n items, n archived trips, target series); transactional commit with progress; failure rolls back completely (NFR-4.7).
* **Navigation:** From M9 empty state, M2 overflow menu, and M17.

### M16 — Series & Destination Profile

* **Purpose:** Manage recurring-trip context (3.13).
* **Elements:** Series name, default attribute chips (FR-15.1); destination notes; destination checklist editor (FR-13.3); trip history list of the series with per-trip stats; shortcut to series trends (M12).
* **Actions:** Edit profile; create new trip in series (→ M3 prefilled); detach/attach trips.
* **Navigation:** From M2 series headers.

### M17 — Settings & Notifications

* **Default travellers (FR-2.5a, 2026-08-14):** a named list, added and removed inline, shown in every mode and stored on the device. Its hint says both things that matter: this device only, and changeable per trip.

* **Purpose:** Personal preferences within the declarative-infrastructure constraint (Section 2: no administrative *infrastructure* changes via the UI; application-level user administration lives in M20, proposed per Addendum 3.23).
* **Elements:** Profile (read-only, OIDC-sourced); notification preferences per event type: delegation, mention, task assigned (FR-6.2) with channel status (push registered via VAPID/UnifiedPush, NFR-4.6); data section: JSON full export, per-trip CSV export (NFR-4.5); conflict log viewer (G-2 target); app info/version. Appearance section with a dark (default, Catppuccin Mocha) / light (Catppuccin Latte) toggle (G-11, Addendum 3.21) — shown in every mode, device-local. An Administration row → M20, rendered only for instance admins with an OIDC session (FR-23.1).
* **Single-User Mode variant (Addendum 3.17):** The Profile section replaces the read-only OIDC fields with two editable controls: a display-name text field (max 50 characters, `[A-Za-z0-9._-]` only, inline validation) and an avatar picture control (Addendum FR-17.13) — the user picks a source photo, positions a circular crop overlay on it via pan/zoom, and confirms; the app renders the selected region to a 256×256 px JPEG on-device and uploads only that, with no separate resize/format step exposed to the user. Both controls save immediately (G-5) and are reflected wherever an avatar/name appears (dashboard greeting, "Packed by" tag, presence facepile per G-10) — always rendered as a circle via a display-time mask, never stored as one. The *notification preferences* section is hidden entirely, since there is no second party to notify or delegate to (Addendum FR-17.3). All other elements (data export, conflict log, app info) remain, unchanged from normal mode.
* **Explicitly absent:** instance configuration, OIDC settings, admin-role assignment — all declarative (Section 2). User administration (deactivate, profile moderation) is application data, not infrastructure, and lives in M20 (Addendum 3.23).
* **Navigation:** Avatar in top bar.

### M18 — Portable Import Preview

* **Purpose:** A lightweight, single-screen confirmation for importing a portable YAML template or trip file (Addendum FR-18.4) — deliberately not a multi-step wizard like M15, since the file is our own well-structured format and needs no column mapping.
* **Elements:** File summary header (kind: Template/Trip, name, item count, `schema_version`); item list preview with per-item state: *new* (no local match), *near-duplicate* (name closely matches an existing item, FR-16.3-style), or *matched* (exact name match) — each near-duplicate row offers *merge* or *keep separate*, reusing the same dedup component as M15 Step 3.
* **Actions:** *Import* commits — a template import creates a new template, shared instance-wide like every other (FR-1.6 MVP); a trip import creates a new trip in *planning* status (FR-18.4); *Cancel* discards with no residue.
* **States:** A `schema_version` newer than the app understands shows a plain warning but still attempts best-effort import, ignoring unrecognized fields (FR-18.5); a malformed file is rejected before this screen is ever shown, with an inline error at the file-picker step.
* **Navigation:** From M7 (template import) and M2 (trip import).

### M19 — First-Launch Mode Selection

* **Purpose:** One-time choice between Local Mode and Server Mode on first app launch (Addendum FR-19.1). Shown exactly once; the decision is persisted on-device and never re-asked.
* **Elements:** Two large option cards: *"Just on this device"* (Local Mode — one sentence explaining data stays on the device, no account or server needed, single device only) and *"Connect to a server"* (Server Mode — server URL input with connectivity check on confirm). The URL field arrives **pre-filled with the page's own origin**, which is the correct answer for every self-hosted instance: the SPA and the API share one origin because the API sets no CORS headers. An explicit build-time `VITE_API_URL` wins over it, and the Vite dev server keeps its split-origin backend. Below the cards, one line noting that Local Mode data can later be moved to a server via export (FR-19.5).
* **Actions:** Selecting Local Mode requests persistent storage (NFR-4.11) and lands on M1 with an empty state (G-7). Selecting Server Mode validates the URL against the server's health endpoint, then proceeds to login (OIDC) or straight to M1 (Single-User instance).
* **States:** Unreachable server URL shows an inline error and keeps the user on this screen; Local Mode has no failure state (a denied persistent-storage request is not blocking — it surfaces later as the NFR-4.11 warning in the G-2 detail).
* **Navigation:** Entry point of the app on first launch only. Not reachable from anywhere afterwards; switching modes later is the explicit migration path of FR-19.5, not a revisit of this screen.

### M20 — User Administration

**Implemented (Addendum 3.23).**

* **Purpose:** The small instance-level user management of Addendum 3.23 — see who is provisioned, revoke access, moderate profiles. Application-data administration only; who *holds* the admin role stays declarative (`JITPACK_ADMIN_EMAILS`, FR-23.1) and is deliberately not editable here.
* **Elements:** List of all provisioned accounts: avatar, display name, e-mail, provisioning date, status chip (active / deactivated), lightweight usage indicators (trips as member, owned templates) per FR-23.2. Instance admins are marked with a chip; the own account's row carries a "you" marker.
* **Actions:** Per-account ActionSheet: *Deactivate* (confirmation dialog spelling out the FR-23.3 consequences: access revoked, data and attributions untouched, JIT login does not restore access) / *Reactivate*; *Remove avatar* and *Reset display name* (FR-23.4). The own row and rows of instance admins offer no *Deactivate* (FR-23.3); there is no delete action anywhere (FR-23.5) and no role toggle (FR-23.1).
* **States:** Deactivated rows render dimmed with the status chip; empty state cannot occur (the viewing admin is always listed).
* **Visibility:** Rendered and routable only for instance admins with an OIDC session; hidden entirely in Single-User and Local Mode (FR-17.3/FR-19.3, G-8). Non-admin API access is rejected with 403 — the screen is access-controlled, not merely unlinked.
* **Navigation:** Administration row in M17 (only visible under the same conditions).

### M21 — Vorlage aus Reise (Template from Trip)

**Concept closed 2026-08-08 (Addendum §3.27, FR-27.5) — mocked in `UI_Concept_Prototype.html`, not implemented.**

* **Purpose:** Turn a finished trip back into a reusable template, so the year's learning ends up in the templates instead of in the archive. The screen exists because the naive "save as template" (copy everything flat) destroys composition: the trip's rows came *from* groups, and a copy would fork them, so next year two divergent camera lists exist. M21 is that recognition step, and it is the closing half of the FR-27.1 round-trip (M3 instantiates a template into a trip, M21 folds a trip back into templates).
* **Entry:** The closing card at the top of **M4 on an archived trip** — "🧩 Reise abgeschlossen", one line of explanation, one button "Vorlage aus dieser Reise erstellen →" (it sat in the trip's *Danach* phase until that hub was dropped, 2026-08-08). Nothing else in the app links here. Full-screen with a back chevron, no FAB, no G-12 cluster (there is no list to search or filter).
* **Elements (top to bottom):**
  * One explanatory line stating the screen's contract: recognised groups are **referenced, not copied**, and stay independently maintainable.
  * **Name der Vorlage** — a text field, prefilled with a next-occurrence guess derived from the trip name.
  * **Erkannte Gruppen · N** — one card per group the trip's rows trace back to (`source_template_id` provenance), each with the group's name, "*n* Artikel dieser Reise stammen daraus", and a green **"wird wiederverwendet ✓"** chip. Group membership is a fact of the data, not a user choice: recognised groups are always referenced, so there is no per-group opt-out here.
  * **Per-group deviations.** A group whose trip rows contain additions names them literally — "Auf der Reise ergänzt: **Gimbal**" — followed by a two-option segment: **Gruppe aktualisieren** (default) vs. **Nur in diese Vorlage**. While *aktualisieren* is selected, a muted line spells out the blast radius: the change reaches everything that includes the group and planning trips take it immediately (FR-27.4). Defaulting to *update* is deliberate and matches M14's stance — a change made on the trip is treated as learned truth, not as an accident.
  * **Absent positions are reported, never acted on.** Group positions the trip did not carry get one muted line ("… waren auf dieser Reise nicht dabei — Gruppe bleibt unverändert"). A skipped tripod is trip history; silently pruning the group over it would make every incomplete trip erode the master data.
  * **Eigene Artikel · n von m** — the loose ad-hoc rows (no group provenance), each a checkbox row with its category and "ohne Gruppe hinzugefügt", **all pre-checked**. Unchecking is how trip-specific one-offs stay out of the template.
  * **"Als neue Gruppe speichern"** toggle — bundles the checked loose rows into a *fresh group* (name field appears below, prefilled) instead of dropping them in as own positions, for the case where they form a reusable unit. Off by default: the common case is a handful of unrelated extras, and a group per trip would breed clutter.
  * Primary action **"Vorlage erstellen ✓"**.
* **Actions / result:** Creating writes, in this order — (1) deviations marked *aktualisieren* into their group, each recorded in the group's change history with its origin ("aus Reise „…“"), (2) the checked loose rows plus every deviation marked *nur in diese Vorlage* as own positions — or the loose rows into the new group when the toggle is on, (3) the composed **Ferien-Vorlage** itself (FR-27.6 scope, referencing the recognised groups and any freshly created one). Ad-hoc rows are matched to master items by tolerant name match (FR-16.3-style, the same fold M14 does); an unmatched name creates the master item first (FR-9.2 mechanics). A confirmation snackbar names the template, and the screen hands off **directly into M8** on the new template — creation ends where editing continues, and it is also the immediate proof that the groups were referenced rather than copied.
* **States:** No recognised groups (a purely ad-hoc trip) → the *Erkannte Gruppen* section is absent and the screen degrades to "name it, pick the rows"; no loose rows → the *Eigene Artikel* card shows its empty line and the bundle toggle is inert. The source trip is **never modified** by this screen, archived or not.
* **Navigation:** From M4's closing card on an archived trip; exits into M8 on success, back chevron to the packing list otherwise.

---

## 3. Cross-Screen Flows (Reference)

1. **Happy path packing:** M1 → M4 → swipe *Packing Now* → check → real-time update on partner's device.
2. **Delegation:** M4 → M5 → set packer → push notification → recipient taps → deep link into M4/M5 (G-4).
3. **Purchase transition:** M6 (Before departure) → check item → appears in M4 as PACK/Open (FR-3.3).
4. **Feedback loop:** M4 flag *Missing* → trip archived → M14 proposes template addition → next M3 run includes the item.
5. **Migration:** M15 import → M2 shows archived series trips → M3 step 4 surfaces historical suggestions (FR-14.2) immediately.
6. **Template round-trip (§3.27):** M3 creates a trip from a Ferien-Vorlage plus extra groups (overlaps deduped in the preview) → items are added ad-hoc while packing → trip archived → M21 recognises the groups, folds the chosen deviations back into them → planning trips using those groups show the applied-changes chip on M2 (FR-27.4) → next year's M3 run starts from the new composed template.

---

## UI Decisions (Resolved)

All decisions originally listed as open here have been resolved and are now recorded directly in their owning pattern or screen: grouping persistence (M4), stepper/checkbox threshold (G-6), "Never ask again" scope (M14), desktop two-pane layout (G-9, M4/M5), and presence on M2 (the full facepile component per G-10, not a simplified dot — concurrent presence on a trip is rare enough not to clutter the row). No open UI decisions remain in this document.
