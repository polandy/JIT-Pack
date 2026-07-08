# UI Specification: „JIT-Pack" — Screens & Interaction Design (v1.9)

**Document Status:** Proposed for Review
**Basis:** Base PRD + Addendum v2.9 (Consolidated)
**Revision Note (v1.9):** Adds Local Mode touchpoints (Addendum 3.19): M19 (First-Launch Mode Selection), a *local* state for the G-2 sync glyph with a storage & backup detail replacing the conflict log, and a Local Mode note in G-8. No other changes from v1.8.
**Platform Targets:** Mobile-first (Capacitor iOS/Android), responsive web — mobile is the primary design target, but every screen must remain fully and comfortably usable on desktop (G-9). All screens must function fully offline (NFR-4.1); sync state is surfaced globally, not per screen.

---

## 0. Global Patterns

These patterns apply to every screen and are specified once.

* **G-1 (Navigation Model):** Bottom tab bar with four tabs: *Dashboard*, *Trips*, *Templates*, *Items*. Everything else is reached contextually (drill-down, bottom sheets, wizards). Settings via avatar in the top bar. In Single-User Mode (Addendum FR-17.2), there is no account to display, so the avatar is replaced by a plain settings-gear icon; it still opens M17.
* **G-2 (Sync Indicator):** A persistent, unobtrusive status glyph in the top bar: synced / syncing / offline (queued changes count). Tapping it opens the sync detail incl. the conflict log (NFR-4.2a). **Local Mode (Addendum 3.19):** the glyph shows a distinct *local* state (device icon) instead of the three network states; tapping it opens the storage & backup detail (FR-19.6: persistence status per NFR-4.11, last portable export, one-tap export) instead of the conflict log — conflicts cannot occur in Local Mode.
* **G-3 (Presence & Locks):** Items locked via *Packing Now* (FR-5.3) render with the locker's avatar and name ("In progress by Andy") and are non-interactive for others except viewing.
* **G-4 (Deep Linking):** Every notification and dashboard entry resolves to `trip/{id}/item/{id}`; the target screen scrolls to the item, flashes it once, and expands attached comments/tasks (FR-6.3).
* **G-5 (Optimistic UI):** All mutations commit locally first and render immediately; server confirmation is silent. Failures surface via the sync indicator, never as blocking dialogs.
* **G-6 (Quantity Stepper):** Wherever quantities appear, a unified stepper component is used: tap = ±1, long-press = complete/zero, unit label per FR-1.8. **Decided: items with quantity = 1 use a plain checkbox instead of the stepper**; the stepper itself only ever appears for quantity > 1.
* **G-7 (Empty States):** Every list screen defines an empty state with a single primary action (e.g., Templates empty → "Create first template" / "Import from spreadsheet").
* **G-8 (Single-User & Demo Mode):** When Demo Mode is active (Addendum FR-17.10), a persistent, dismissible-per-session banner appears at the top of every screen stating that data resets periodically and will not be retained. Single-User Mode alone (without Demo Mode, Addendum FR-17.1) shows no banner — it is visually indistinguishable from normal operation except for the absence of sharing, delegation, and notification UI, hidden per screen as noted in M2, M3, M5, and M17 below. **Local Mode (Addendum FR-19.3)** hides the same collaboration UI the same way and likewise shows no banner; its only visible marker is the G-2 *local* glyph.
* **G-9 (Header & Desktop Navigation):** The top bar shows, left to right: the app logo — a compact mark on mobile, full wordmark from the desktop breakpoint up — followed by the sync glyph (G-2) and the avatar/settings control (G-1) on the right. The logo is a link/tap-target to M1 (Dashboard) from anywhere in the app, including from within a trip, template, or wizard; it is the app's one universal "home" action. **Desktop breakpoint (≥ 900 px, resolving Open UI Decision #4):** the bottom tab bar (G-1) is replaced by a persistent left-side navigation rail carrying the same four tabs (Dashboard/Trips/Templates/Items); the top bar then spans the remaining width and additionally hosts page-level primary actions inline (e.g., M2's "New trip" FAB, M4's KPI strip) instead of floating over content. Below the breakpoint, the mobile layout (bottom tabs, floating FAB, compact logo mark) applies unchanged.
* **G-10 (Trip Presence & Group Sync):** Distinct from G-2, which reflects only *your own* device's connection state, this pattern shows who else is currently on the same trip and whether the *group* is caught up. It lives in the trip-level header (M4's sticky header, not the global app header of G-9), since presence is meaningless outside a specific trip.
  * **Facepile:** overlapping circular avatars of everyone currently viewing/editing this trip (sourced from the `presence` WebSocket event, Sync-API Spec §7). Mobile shows up to 2 avatars plus a "+N" overflow bubble; desktop (≥ 900 px) shows up to 4 before overflow, simply reflecting the wider header.
  * **Group-sync badge:** a small dot on the facepile — green when every present device's last-acknowledged pull cursor matches the trip's current `change_log` head, amber if at least one present device is still catching up. This is a coarse, best-effort signal (it only reflects devices currently connected via WebSocket, not fully offline ones) and is never used to block any action.
  * **Tap/click** opens a bottom sheet (mobile) or popover (desktop) listing each present person by name, avatar, and their individual sync state — the group-level detail view, parallel to G-2's own-device detail view.

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
| M13 | Repack Mode | P2 | 11.1–11.3 |
| M14 | Post-Trip Review Assistant | P2 | 9.1, 9.2 |
| M15 | Import Wizard | P2 | 16.1–16.3, NFR-4.7 |
| M16 | Series & Destination Profile | P2 | 13.1–13.3 |
| M17 | Settings & Notifications | P2 | 6.2, NFR-4.5/4.6 |
| M18 | Portable Import Preview | P2 | Addendum 3.18 |
| M19 | First-Launch Mode Selection | P2 | Addendum 3.19 |

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
* **Elements:** Segmented filter *Active / Planned / Archived*; trips grouped by Trip Series (FR-13.1) with series header showing destination and trip count; per-trip row: name, dates, progress ring (packed/total), participant avatars, and a presence facepile (G-10) showing who's currently active on that trip — the same component as M4's header, not a simplified variant, since concurrent presence on a given trip is rare enough that it won't clutter the row.
* **Actions:** Tap → M4; FAB "New trip" → M3; long-press → context menu (Clone per FR-12.1, Archive, Share, Export per Addendum FR-18.3, Delete — destructive actions require confirmation and Owner role per FR-4.5); tap series header → M16. In Single-User Mode (Addendum FR-17.3), *Share* is omitted from this menu — there is no second account to share with. Overflow menu also offers *Import trip from file* → M18 (alongside the legacy spreadsheet importer, M15).
* **States:** Archived trips render muted with final stats; imported legacy trips (FR-16.2) carry an "Imported" chip.
* **Navigation:** Tab 2.

### M3 — Trip Creation Wizard

* **Purpose:** Generate a trip instance from templates with correct quantities on the first pass.
* **Step 1 — Metadata:** Name, series picker (or "New series"), optional start date and end date (duration auto-computed and displayed when both dates are set, FR-2.1/2.1a), attribute chips: season, transport, accommodation (FR-15.1; prefilled from series defaults).
* **Step 2 — Travelers:** Add travelers (name + Adult/Child, FR-2.5), optionally link to a registered user account; share the trip with user accounts and assign roles: Owner (creator, immutable), Admin (can manage travelers and roles), Editor (default — can edit items but not manage travelers) (FR-4.5/4.7). In Single-User Mode (Addendum FR-17.3), the sharing and role-assignment part of this step is hidden entirely — only traveler add/edit remains, and the sole user is silently the trip's Owner.
* **Step 3 — Templates:** Checkbox list of available templates (own + published, FR-1.6); live preview footer: resulting item count, deduplicated overlaps listed with the applied merge strategy (FR-2.3); items excluded by conditional rules (FR-15.2) shown collapsed with reason ("skipped: season ≠ winter").
* **Step 4 — Quantity Review:** Virtualized list of all generated items; each row: name, computed quantity with formula tooltip, history hint "2024: 5 · 2025: 6 → suggested 6" with one-tap accept (FR-14.1/14.2); destination checklist offer if the series has one (FR-13.3).
* **Actions:** Back/Next per step; "Create trip" commits and opens M4.
* **States:** Draft persists locally between steps (offline-safe); formula errors impossible here (validated at template save, FR-1.5).
* **Navigation:** From M2 FAB or M1 empty state. Cancel returns without residue.

### M4 — Packing List (Trip Detail) — *core screen*

* **Purpose:** The live, collaborative packing workspace. Highest design investment.
* **Elements:**
  * Sticky header: trip name, KPI strip — packed/total items, weight packed/planned (kg), value (CHF/EUR) (FR-8.1), **prep todo counter** "Prep: 3/7" (resolved/total, FR-7.3) — only shown when the trip has any todos; tap KPI → M12; trip presence facepile and group-sync badge per G-10.
  * Grouping switcher (segmented control): *Category / Container / Person / Status*. **Decided: persists per user per trip** (not a global preference) — switching to *Container* view on one trip doesn't affect another trip or another user's view of the same trip.
  * Item rows: checkbox area (stepper per G-6 for quantity > 1, showing "3/5"), name + unit, chips: mode (BUY_BEFORE/BUY_LOCAL), Late Packer flag, assigned traveler avatar, packer avatar, container tag; lock overlay per G-3.
  * **Inline quick-add (FR-5.6):** A persistent "Add item..." trigger below the filter bar. Tapping it expands an inline text input with autocomplete suggestions from the master item inventory (M9). Enter on free text creates a new ad-hoc trip item; selecting a suggestion reuses the master item's metadata (weight, value, category). If the trip is active, new items are auto-flagged *Missing* (FR-9.1). The input stays expanded after adding for rapid entry; Escape or the close button collapses it. No navigation away from M4 required.
  * Collapsed sections: "Consciously skipped" items (FR-5.5), "Late Packers" (pinned to bottom until departure day, then pinned to top), and **"Preparation" (FR-7.3)** — all open prep todos for the trip, grouped by item with traveler avatar. Visible to all trip members; resolving a todo is restricted to the item's assignee or trip owner. Tap item name → M5.
  * Item rows with open prep todos show a small **prep badge** (wrench icon + count) next to the item name. Packed items with open todos use a distinct "packed with open prep" style (e.g., amber checkbox instead of green) to signal incomplete readiness.
  * **Consciously skipped section (FR-5.5):** Collapsed by default at the bottom of the list. Header shows count. Expanding reveals skipped items with strikethrough styling. Swipe-to-unskip restores them to open state with quantity 1. Purpose: explicitly acknowledge that an item was considered but deliberately not packed — distinguishing "forgot" from "decided against."
  * Filter bar: my items only, open only, per traveler.
* **Actions:** Swipe right → *Packing Now* (FR-5.2); swipe left on active item → context options: *assign-to-me* (FR-4.3) or *skip* (marks as consciously skipped, FR-5.5); swipe left on skipped item → *unskip* (restores to open); tap row → M5; long-press checkbox → complete item; toolbar: open shopping views (M6), start Repack (M13, only when trip is active), archive trip (→ triggers M14).
* **States:** Real-time: rows animate on remote changes with actor attribution ("packed by Sarah"); item blocked by open tasks shows a task badge and refuses completion with inline hint (FR-7.2); offline behaves identically (G-5).
* **Navigation:** From M1, M2, notifications. Deep-link anchor target (G-4). **Desktop (≥ 900 px, per G-9): two-pane layout** — M4's list occupies the left/main pane while M5 opens as a **persistent side panel** on the right rather than a bottom sheet; selecting a different row swaps the panel's content in place. Below the breakpoint, M5 remains the mobile overlay sheet described above.

### M5 — Item Detail (Bottom Sheet)

* **Purpose:** Everything about one trip item without leaving context.
* **Elements:** Header: name, quantity stepper, state; assignment section: *Used by* (traveler picker) vs. *Packed by* (user picker) — visually distinct to reinforce FR-4.2; mode selector PACK/BUY_BEFORE/BUY_LOCAL (FR-3.1); container picker (FR-10.2); Late Packer toggle; flags *Unused/Missing* (FR-9.1, visible only on active trips); history sparkline: quantities in previous series trips (FR-14.1); comment/task thread (FR-7.1/7.2) with "flag as task" toggle per comment; **Preparation Todos section (FR-7.3):** dedicated section listing the item's prep todos with checkbox per todo, inline "Add prep todo..." input at the bottom; all trip members see todos, only assignee/owner can resolve. Packed items with open todos show an amber state indicator and "open prep" label.
* **Actions:** Delegate → triggers notification (FR-6.2); resolve/reopen tasks; add/resolve/reopen preparation todos (FR-7.3); "Buy now" on BUY_BEFORE items → mode flips to PACK with undo snackbar (FR-3.3). In Single-User Mode (Addendum FR-17.3), *Delegate* is hidden — the sole user is already every item's *Packed by*.
* **States:** Locked by another user → read-only with lock banner; unsaved edits impossible (every control commits immediately, G-5).
* **Navigation:** Opens over M4/M6; swipe down to dismiss.

### M6 — Shopping Views

* **Purpose:** Focused procurement checklists (FR-3.2).
* **Elements:** Two tabs: *Before departure* (BUY_BEFORE) and *At destination* (BUY_LOCAL); rows grouped by category; destination tab includes standing destination-checklist entries (FR-13.3) visually separated.
* **Actions:** Check off → BUY_BEFORE items transition to PACK and leave this list with animation (FR-3.3); add free-text entry directly into either list.
* **States:** Both lists empty → screen entry point hidden from M4 toolbar badge.
* **Navigation:** From M4 toolbar; deep-linkable.

### M7 — Template List

* **Purpose:** Manage modular master templates (FR-1.2).
* **Elements:** Two sections: *My templates* and *Published on this instance* (FR-1.6, read-only rows with fork icon); per row: name, item count, published toggle (own only).
* **Actions:** Tap → M8; fork published template → editable copy in *My templates*; FAB → new template. Long-press a template in *My templates* → context menu adds *Export* (Addendum FR-18.2), producing a downloadable/shareable YAML file; the FAB's "+" menu also offers *Import from file* → M18.
* **Navigation:** Tab 3.

### M8 — Template Editor

* **Purpose:** Define items, formulas, and conditions of one template.
* **Elements:** Item rows: name (picker from M9 inventory with inline-create), quantity field accepting number or formula with live validation and computed example preview ("for a 7-day trip: 8") (FR-1.3/1.5); per-item controls: assignment type *Per Person / Trip-Global* (FR-1.4), default mode, Late Packer default, dedup strategy (FR-2.3), condition chips (season/transport/accommodation, FR-15.2).
* **Actions:** Add/remove/reorder items; save (blocked while any formula is invalid, with per-row error).
* **States:** Editing a published template warns that consumers see changes on next trip generation only (decoupling per FR-2.4 protects existing trips).
* **Navigation:** From M7.

### M9 — Item Inventory

* **Purpose:** Central item database (FR-1.1).
* **Elements:** Searchable, category-grouped list; per row: name, weight, value, unit chip, consumable chip.
* **Actions:** Tap → M10; FAB → new item; merge duplicates via multi-select (supports FR-16.3 cleanup).
* **Navigation:** Tab 4.

### M10 — Item Editor

* **Purpose:** Edit one master item.
* **Elements:** Name, category picker (inline-create), weight (g), value (instance currency), unit selector *pieces/pairs/per-day* with rate field when per-day (FR-1.8), consumable toggle (FR-1.7).
* **States:** Shows usage footer: "Used in 4 templates, 12 archived trips" — deletion blocked while referenced by templates; archived trip snapshots are unaffected by edits (FR-2.4, stated in UI copy).
* **Navigation:** From M9 or inline from M8.

### M11 — Container Management

* **Purpose:** Define luggage containers and balance weight (3.10).
* **Elements:** Per-trip container list: name, carrier avatar, weight bar (current/max) turning amber at 90 % and red beyond max (FR-10.3); pairing control linking two containers with a live imbalance indicator; "Unassigned items" bucket at bottom (FR-10.2).
* **Actions:** Create/edit/delete containers; drag items (or multi-select + assign) from the unassigned bucket or between containers.
* **Navigation:** From M4 grouping switcher (*Container* mode exposes an "Edit containers" entry) and from M12.

### M12 — Analytics

* **Purpose:** Weight/value insight (3.8) and long-term trends (FR-14.3).
* **Elements:** Dimension switcher *Person / Category / Container* (FR-8.2); stacked bar per dimension value: packed vs. planned weight; value total per dimension; series trend section (archived trips): weight over the years, top *Missing*/*Unused* items.
* **Actions:** Tap any bar segment → M4 filtered to that slice.
* **States:** Items without weight metadata are aggregated as "unweighted (n items)" so totals are honest.
* **Navigation:** From M4 KPI strip; trend section also from M16.

### M13 — Repack Mode

* **Purpose:** Guided return packing (3.11).
* **Elements:** Entry dialog: summary "42 items will be reset to Open; 6 consumables and 3 locally bought items excluded" with expandable exception list and per-item override toggles (FR-11.2); after confirmation M4 switches to a *Repack* banner state; "Nothing left behind" checklist grouped by container/traveler (FR-11.3).
* **Actions:** Confirm reset (any participant, FR-11.1); complete repack → trip returns to normal active state, outbound history retained for M14.
* **States:** Repack banner visible to all participants in real time.
* **Navigation:** From M4 toolbar (active trips only).

### M14 — Post-Trip Review Assistant

* **Purpose:** Close the feedback loop into master templates (FR-9.2).
* **Elements:** Triggered on archive; card stack, one proposal per card: "'Lonely Planet' was flagged Unused on 3 consecutive trips — set quantity to 0 in template 'Base Travel'?" with actions *Apply / Skip / Never ask again*; final summary of applied changes.
* **Actions:** Single-tap apply writes to the user's own templates only (FR-1.6); fork prompt when the source template is published by someone else. **Decided: "Never ask again" scopes to the specific item–template pair**, not the item globally — the same item can still surface a proposal for a different template.
* **States:** No flags recorded → assistant skipped with a brief "nothing to review" toast; assistant is resumable if interrupted.
* **Navigation:** Auto-launch on archive from M4/M2; re-openable from the archived trip.

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

* **Purpose:** Personal preferences within the declarative-infrastructure constraint (Section 2: no admin functions in the UI).
* **Elements:** Profile (read-only, OIDC-sourced); notification preferences per event type: delegation, mention, task assigned (FR-6.2) with channel status (push registered via VAPID/UnifiedPush, NFR-4.6); data section: JSON full export, per-trip CSV export (NFR-4.5); conflict log viewer (G-2 target); app info/version.
* **Single-User Mode variant (Addendum 3.17):** The Profile section replaces the read-only OIDC fields with two editable controls: a display-name text field (max 50 characters, `[A-Za-z0-9._-]` only, inline validation) and an avatar picture control (Addendum FR-17.13) — the user picks a source photo, positions a circular crop overlay on it via pan/zoom, and confirms; the app renders the selected region to a 256×256 px JPEG on-device and uploads only that, with no separate resize/format step exposed to the user. Both controls save immediately (G-5) and are reflected wherever an avatar/name appears (dashboard greeting, "Packed by" tag, presence facepile per G-10) — always rendered as a circle via a display-time mask, never stored as one. The *notification preferences* section is hidden entirely, since there is no second party to notify or delegate to (Addendum FR-17.3). All other elements (data export, conflict log, app info) remain, unchanged from normal mode.
* **Explicitly absent:** user management, instance configuration, OIDC settings — all declarative (Section 2).
* **Navigation:** Avatar in top bar.

### M18 — Portable Import Preview

* **Purpose:** A lightweight, single-screen confirmation for importing a portable YAML template or trip file (Addendum FR-18.4) — deliberately not a multi-step wizard like M15, since the file is our own well-structured format and needs no column mapping.
* **Elements:** File summary header (kind: Template/Trip, name, item count, `schema_version`); item list preview with per-item state: *new* (no local match), *near-duplicate* (name closely matches an existing item, FR-16.3-style), or *matched* (exact name match) — each near-duplicate row offers *merge* or *keep separate*, reusing the same dedup component as M15 Step 3.
* **Actions:** *Import* commits — a template import creates a new, private, owned template (FR-1.6); a trip import creates a new trip in *planning* status (FR-18.4); *Cancel* discards with no residue.
* **States:** A `schema_version` newer than the app understands shows a plain warning but still attempts best-effort import, ignoring unrecognized fields (FR-18.5); a malformed file is rejected before this screen is ever shown, with an inline error at the file-picker step.
* **Navigation:** From M7 (template import) and M2 (trip import).

### M19 — First-Launch Mode Selection

* **Purpose:** One-time choice between Local Mode and Server Mode on first app launch (Addendum FR-19.1). Shown exactly once; the decision is persisted on-device and never re-asked.
* **Elements:** Two large option cards: *"Just on this device"* (Local Mode — one sentence explaining data stays on the device, no account or server needed, single device only) and *"Connect to a server"* (Server Mode — server URL input with connectivity check on confirm). Below the cards, one line noting that Local Mode data can later be moved to a server via export (FR-19.5).
* **Actions:** Selecting Local Mode requests persistent storage (NFR-4.11) and lands on M1 with an empty state (G-7). Selecting Server Mode validates the URL against the server's health endpoint, then proceeds to login (OIDC) or straight to M1 (Single-User instance).
* **States:** Unreachable server URL shows an inline error and keeps the user on this screen; Local Mode has no failure state (a denied persistent-storage request is not blocking — it surfaces later as the NFR-4.11 warning in the G-2 detail).
* **Navigation:** Entry point of the app on first launch only. Not reachable from anywhere afterwards; switching modes later is the explicit migration path of FR-19.5, not a revisit of this screen.



## 3. Cross-Screen Flows (Reference)

1. **Happy path packing:** M1 → M4 → swipe *Packing Now* → check → real-time update on partner's device.
2. **Delegation:** M4 → M5 → set packer → push notification → recipient taps → deep link into M4/M5 (G-4).
3. **Purchase transition:** M6 (Before departure) → check item → appears in M4 as PACK/Open (FR-3.3).
4. **Feedback loop:** M4 flag *Missing* → trip archived → M14 proposes template addition → next M3 run includes the item.
5. **Migration:** M15 import → M2 shows archived series trips → M3 step 4 surfaces historical suggestions (FR-14.2) immediately.

---

## UI Decisions (Resolved)

All decisions originally listed as open here have been resolved and are now recorded directly in their owning pattern or screen: grouping persistence (M4), stepper/checkbox threshold (G-6), "Never ask again" scope (M14), desktop two-pane layout (G-9, M4/M5), and presence on M2 (the full facepile component per G-10, not a simplified dot — concurrent presence on a trip is rare enough not to clutter the row). No open UI decisions remain in this document.
