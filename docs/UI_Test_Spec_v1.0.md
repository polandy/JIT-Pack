# UI / End-to-End Test Specification — „JIT-Pack" (v1.0)

**Document Status:** Proposed for Review
**Basis:** UI_Spec_v1.10 (screens M1–M20, patterns G-1–G-11) + PRD_Base + PRD_Addendum_v2.10 (FR/NFR catalogue). M21 (Vorlage aus Reise, §3.27) is specified below ahead of its UI-Spec entry.
**Purpose:** Define *what* the automated headless-browser test suite must cover so that every requirement with a UI surface is exercised through the real, built client. This document is the specification; implementation (Playwright config, fixtures, the tests themselves) follows and is tracked separately.

> This file is authoritative for E2E scope. When a requirement changes, its row in the traceability matrix (§7) must change with it — same discipline as UI_Spec and Sync_API_Spec.

---

## 1. Scope & Philosophy

### 1.1 Layered coverage (decided)

The client already ships **412 Vitest unit/component tests** and a fully unit-tested pure domain layer (`src/domain/`, `src/lib/`, `src/local/`, `src/notifications/`). The E2E suite does **not** re-derive that logic. It sits one layer above:

* **Unit tests own the algorithm** — quantity formulas (FR-1.3/1.5/15.3), dedup/instantiation (FR-2.2/2.3/2.3a), analytics math (FR-8.2/10.4/14.3), clone/review planning (FR-12/9), spreadsheet & portable parsing (FR-16/18), dependency resolution (FR-20), image/avatar geometry (FR-22.2/22.3), HLC + merge (NFR-4.2a). These are proven in isolation and must stay there.
* **E2E owns the journey** — that a real user, in a real browser, driving the real built app, can reach a screen, perform the requirement's action, and observe the correct result *including its persistence and (where relevant) cross-device propagation*. E2E verifies the wiring: store ↔ outbox ↔ WebSocket ↔ server ↔ DOM.

Every FR/NFR in §7 is tagged **E2E** (a browser case exists), **UNIT** (logic already covered; E2E only touches it incidentally through a journey), **SERVER** (backend/API concern with no UI surface — covered by Go tests, listed here for completeness), or **DOC/N-A** (documentation-only or retired).

### 1.2 Tooling (proposed)

**Playwright** (`@playwright/test`), headless Chromium + WebKit. WebKit matters: the Capacitor iOS WebView is WebKit, and it is the only cross-browser runner with real WebKit. Rationale for choosing it over Cypress/Selenium and the CI wiring live in §8; the dependency-footprint justification (NFR-4.3 discipline) is recorded there.

### 1.3 Out of scope for E2E

* Pure algorithmic correctness already covered by unit tests (see §1.1) — E2E asserts the *outcome in the UI*, not every branch.
* Native Capacitor shells (iOS/Android builds), real push-service delivery (APNs/FCM/UnifiedPush), and real OIDC provider integration — replaced by a mock IdP (§2.3).
* Server-internal concerns without a UI surface: resource footprint (NFR-4.3), deployment/exposure guidance (NFR-4.9), JWT-vs-Authelia decoupling internals (NFR-4.4) — owned by Go tests and docs.
* Visual-regression / pixel diffing — explicitly deferred (see §9, Future); this suite asserts behaviour and semantic DOM state, not appearance. (Theming G-11 is checked structurally: correct theme class + token application, not screenshots.)

---

## 2. Test Environments (Run Modes)

All three product run modes are covered (decided), because collaboration requirements (FR-4.x, 6.x, G-3, G-10, M20) have no meaning without a server and a second identity. Each E2E case is tagged with the mode(s) it runs in.

### 2.1 `local` — Local Mode, no backend
Client only, served by `vite preview`. IndexedDB is the store; enqueue/drain/WebSocket are no-ops. M19 selects "Just on this device". Covers offline-first, persistence, and the serverless export/import path. **No `jitpackd` process.**

### 2.2 `single` — Single-User Mode
`jitpackd` started with `api.NewSingleUser` (no `JITPACK_JWT_SECRET`/`JWKS_URL`, no OIDC env). No auth, no membership, collaboration UI hidden (G-8). Boots with zero network to any IdP (NFR-4.8). Covers the full single-writer product surface against a real server + real sync.

> **Client-side note:** there is no distinct "single" client mode. The client persists `jitpack_mode = 'server'` and points `jitpack_server_url` at the Single-User `jitpackd`; because that server's `GET /api/v1/auth/config` advertises no OIDC, `App.vue` skips the login redirect and lands directly on M1 (M19-02). So the `single` vs `server` distinction is purely a *harness* concern: which `jitpackd` the fixture starts and whether OIDC tokens are seeded — the client build is identical.

### 2.3 `server` — Server / Collaboration Mode
`jitpackd` in JWKS/OIDC mode against a **mock IdP** fixture (a tiny in-test HTTP server exposing `/authorize`, `/token`, `/jwks` and signing RS256 tokens with a test keypair — this is a *test fixture*, not a shipped component, so NFR-4.8 is not violated). Enables:
* **Multi-client**: two (or more) browser contexts authenticated as different users (`alice`, `bob`) against the same server, to prove real-time convergence, presence, locks, delegation, and notifications.
* **Membership & roles** (FR-4.5/4.7), **admin** (M20, `JITPACK_ADMIN_EMAILS=alice@…`).

### 2.4 Shared fixtures & conventions
* **`data-testid`** is the required selector strategy for every asserted element — no text/CSS-class selectors (i18n- and refactor-stable). Adding missing `data-testid`s to the Vue components is part of implementation.
* **Seed helpers** drive the app *through its own mutation paths* (create item → template → trip via the orchestrator), never by injecting DB rows — so tests exercise the same code users do. A thin "fast seed" that posts to the sync API directly is allowed only for `server`-mode preconditions that aren't themselves under test.
* **Time control**: HLC/staleness assertions (G-3 15-min lock rule, NFR-4.11 30-day reminder) use injectable clocks / Playwright `clock` — never real `sleep`.
* **Offline simulation**: Playwright `context.setOffline(true)` for NFR-4.1 journeys; server-mode reconnection via toggling offline then draining.

---

## 3. Global Pattern Test Cases (G-1 – G-11)

Global patterns are asserted once as dedicated cases and then relied upon (not re-asserted) inside screen cases.

| ID | Pattern | Mode | What it proves |
|---|---|---|---|
| E2E-G1-01 | G-1 Navigation | all | Four bottom tabs (Dashboard/Trips/Templates/Items) route correctly; Settings reachable via avatar/gear. In `single`/`local` the top-right control is the plain **gear**, not an avatar. |
| E2E-G2-01 | G-2 Sync indicator | single/server | Glyph reflects synced → syncing (queued count) → offline as network toggles; tapping inside a trip opens the conflict log. |
| E2E-G2-02 | G-2 Local glyph | local | Distinct **device** glyph; tap opens storage & backup detail (not a conflict log). |
| E2E-G3-01 | G-3 Presence lock | server | Alice triggers *Packing Now*; on Bob's client the row shows "In progress by Alice", avatar + chip, and is non-interactive. |
| E2E-G3-02 | G-3 Lock staleness | server | A lock older than 15 min (clock-advanced) is no longer treated as locking on the other client. |
| E2E-G4-01 | G-4 Deep link | server | Opening a delegation notification lands on `trip/{id}/item/{id}`, scrolls to, flashes the item once, and expands its comments (also asserts the `?comment=` mention highlight). |
| E2E-G5-01 | G-5 Optimistic UI | single | A mutation renders immediately before server confirmation; a forced failure surfaces only via the sync glyph, never a blocking dialog. |
| E2E-G6-01 | G-6 Stepper/checkbox | all | qty=1 renders a checkbox; qty>1 renders the stepper ("3/5"); tap ±1, long-press completes/zeroes; unit label shown. |
| E2E-G7-01 | G-7 Empty states | all | Each list screen (Trips/Templates/Items/Dashboard) shows its empty state with the single primary CTA. |
| E2E-G8-01 | G-8 Collaboration hidden | single/local | No Share/Delegate/Notification-prefs UI anywhere; no mode banner shown. |
| E2E-G9-01 | G-9 Responsive | all | ≥900px shows the left nav rail + inline actions; <900px shows bottom tabs + FAB. Logo is a home link to M1 from within a trip. |
| E2E-G9-02 | G-9 Two-pane M4/M5 | single | ≥900px: selecting a row opens M5 as a persistent right side-panel and swaps content in place; <900px it is a bottom sheet. |
| E2E-G10-01 | G-10 Trip presence | server | Facepile of others on the trip + group-sync badge (green→amber as a device lags); tap opens the per-person sync list. |
| E2E-G11-01 | G-11 Theming | all | Dark (Mocha) is default before first paint with no preference; M17 toggle switches to Latte and persists device-local across reload; no flash of wrong theme. |
| E2E-G12-01 | G-12 Actions in the app bar | all | On a detail screen (M4, M6) the app bar carries that screen's icon cluster and the settings **gear is hidden**; on a root/tab screen the gear is back and no cluster is shown. Navigating away clears the previous screen's cluster — asserts M6's icons do not linger on the next screen. |
| E2E-G12-02 | G-12 Two clusters, no overflow | all | M4's app-bar cluster is search + filter; Shopping (with open-item count), Luggage and Analytics sit on the trip title line. **No ⋯ exists** — all three destinations are reachable in one tap, which is what §3.25's discoverability directive asked for. M6's app-bar cluster is search + filter. |
| E2E-G12-06 | G-12 Icon-only is still nameable | all | Every unlabelled navigation icon exposes its name via `title`, and a long-press shows it as a bubble on touch. A plain tap **navigates** and shows no bubble — learning a glyph must never cost an extra tap. |
| E2E-G12-03 | G-12 Actions survive the collapsing header | all | Scrolling M4 down collapses its sub-header, and search and filter **remain tappable** in the app bar throughout. This is the reason the cluster lives there rather than on the status line. |
| E2E-G12-04 | G-12 One header line | all | M4's own header renders a single line (name, progress, presence); the search field and the filter chip row appear below it **only** when respectively opened and active, and neither is present in the default state. |
| E2E-G12-05 | G-12 Literal icons | all | Shopping uses a cart glyph and Luggage a suitcase — distinct from each other and from the Inventory cube. Guards the regression where one generic glyph stood for several destinations, which defeats dropping the labels. |

---

## 4. Per-Screen Test Cases (M1 – M20)

Each case is **Given / When / Then**, tagged with mode(s) and the requirement(s) it exercises through the UI. IDs are stable references for the traceability matrix.

### M1 — Dashboard
* **E2E-M1-01** `all` (FR-6.1): with active trips, dashboard shows per-trip cards with my open items (count + next 3) and my open tasks.
* **E2E-M1-02** `all` (FR-7.3): "Prep to do" card lists open prep todos grouped by item; tapping a todo toggles it resolved; tapping the item name navigates to M5.
* **E2E-M1-03** `server` (FR-6.1/6.3/4.4): items delegated to me since last visit are highlighted; badge counts update in real time when the other client delegates (WebSocket, no refresh).
* **E2E-M1-04** `all` (FR-6.3/G-4): tapping a card deep-links into M4 at the item.
* **E2E-M1-05** `all` (G-7): no active trips → "Plan a trip" CTA → M3.
* **E2E-M1-06** `all` (FR-5.4): "Late Packer" section appears only on a trip's departure day (clock-controlled).

### M2 — Trip List
* **E2E-M2-01** `all` (FR-2.1): segmented Active/Planned/Archived filter partitions trips; archived render muted with final stats.
* **E2E-M2-02** `all` (FR-13.1): trips group under series headers with destination + count; tap header → M16.
* **E2E-M2-03** `all` (FR-2.1/8.1): per-trip row shows name, dates, progress ring, participant avatars.
* **E2E-M2-04** `all` (FR-12.1): long-press → Clone → M-clone (ClonePage) opens with fresh dates.
* **E2E-M2-05** `server` (FR-4.5): Delete slide option visible only to Owner; confirm tombstones the trip and it disappears from the list.
* **E2E-M2-06** `single/local` (G-8/FR-17.3): context menu omits *Share*.
* **E2E-M2-07** `all` (FR-18.3): Export slide option produces a portable YAML download with a progress/clean sheet.
* **E2E-M2-08** `all` (FR-16.2): imported legacy trips carry an "Imported" chip.
* **E2E-M2-09** `all` (FR-18.4): overflow → Import trip from file → M18.

### M3 — Trip Creation Wizard
* **E2E-M3-01** `all` (FR-2.1/2.1a/15.1): step 1 metadata — name, dates auto-compute + display duration, attribute chips (season/transport/accommodation) set.
* **E2E-M3-02** `all` (FR-13.1/13.2): series picker incl. inline "New series…"; picking a series prefills empty attribute chips from its defaults.
* **E2E-M3-03** `all` (FR-2.5): step 2 adds travelers with Adult/Child.
* **E2E-M3-04** `server` (FR-4.5/4.7): step 2 sharing — user picker (minus self), Editor/Admin role select; grants applied on create.
* **E2E-M3-05** `single/local` (FR-17.3/G-8): step 2 sharing/role part hidden; only traveler add/edit remains.
* **E2E-M3-06** `all` (FR-2.2/2.3/15.2): step 3 template checkboxes; live footer shows resulting count, deduped overlaps with strategy, and excluded items with reason ("skipped: season ≠ winter").
* **E2E-M3-07** `all` (FR-20.3/20.4): step 3 footer reports auto-pulled companion items; step 4 lists them with their main item, dedup notes, and suggested companions as opt-in checkboxes.
* **E2E-M3-08** `all` (FR-14.1/14.2): step 4 rows show computed quantity + formula tooltip and a one-tap history suggestion ("2024: 5 · 2025: 6 → 6").
* **E2E-M3-09** `all` (FR-13.3): step 4 offers the series destination checklist as opt-out extra items.
* **E2E-M3-10** `all` (FR-2.4/NFR-4.1): draft persists across steps offline; "Create trip" commits and opens M4; cancel leaves no residue.
* **E2E-M3-11** `all` (FR-27.1/27.2): step 3 — a composed template's row lists its groups ("enthält: …"); selecting it plus a group that overlaps it resolves for real: the footer count matches the deduped set and the merge is **named** with both source groups ("Kamera nur 1× — in Makro & Wildlife").
* **E2E-M3-12** `all` (FR-27.3): step 3 — single master items joined via the inventory search: an item **not** in the resolved set raises the footer count by one; an item already in it is reported "bereits enthalten, nicht doppelt" and leaves the count unchanged; added items appear as removable chips.

### M4 — Packing List (core)
* **E2E-M4-01** `all` (FR-8.1/7.3): the single header line shows packed/total, weight and the open-prep count (the latter only when todos exist), and stays **unfiltered** while a filter or search narrows the list below it. Analytics is reached from the 📊 icon on the trip line, not from the header (the KPI-tile entry is gone, G-12).
* **E2E-M4-02** `all` (FR-8.2): grouping switcher Category/Container/Person/Status; selection persists per user per trip (survives reload; a second user/other trip unaffected).
* **E2E-M4-03** `all` (FR-5.1/G-6): item rows show state, stepper/checkbox, mode/late-packer/traveler/packer/container chips.
* **E2E-M4-04** `all` (FR-5.6/9.1): inline quick-add with master-item autocomplete; free text creates an ad-hoc item; on an active trip new items auto-flag *Missing*; input stays expanded.
* **E2E-M4-05** `all` (FR-5.2): swipe right → *Packing Now*.
* **E2E-M4-06** `all` (FR-4.3/5.5): swipe left → assign-to-me or skip; skipped items move to the collapsed "Consciously skipped" section (strikethrough); swipe-to-unskip restores at qty 1.
* **E2E-M4-07** `all` (FR-20.2): skipping cascades co-skip of dependent companions with a reason.
* **E2E-M4-08** `all` (FR-7.3): open prep todos render a prep badge; a packed item with open prep uses the amber "packed with open prep" style.
* **E2E-M4-25** `all` (FR-7.3/25.2): the full lifecycle in one case — an item packed while a prep todo is open stays **visible and amber** and does **not** count as done; **resolving its last todo makes it done and it leaves the list**; revealing packed rows brings it back without a prep badge. Regression guard: the open-prep count must be derived from the todos, not stored on the item, or resolving the last todo leaves the row stuck forever. Second direction: an item that has a todo but never had a stored count must still show its badge.
* **E2E-M4-09** `all` (FR-7.2): an item with open tasks refuses completion with an inline hint.
* **E2E-M4-10** `server` (FR-4.4): remote pack animates in with actor attribution ("packed by Bob"), no refresh.
* **E2E-M4-11** `all` (FR-3.2): toolbar opens M6 (badge hidden when both shopping lists empty); archive → launches M14.
* **E2E-M4-12** `all` (FR-25.8/25.1): quick-add in *per person* mode for two travelers (e.g. "Jacke" — Andy 1, Sia 1) produces **one named cluster** "Jacke" with a `0/2` sub-header and exactly two indented child rows, each showing its traveler and its own check control. Asserts there is **no** second top-level row repeating the name — the regression found on 2026-08-07 was N separate items, where every individual row looked right and only the grouping was wrong, so the assertion must be on the cluster structure and the absence of duplicate top-level rows, not merely on "two rows named Jacke exist".
* **E2E-M4-13** `all` (FR-25.1 flat fallback): the same quick-add for a **single** traveler produces an ordinary flat row labelled with that person ("Mütze · Andy"), **not** a one-child cluster.
* **E2E-M4-15** `all` (FR-25.11a/b): M4 shows a single filter row; tapping it opens the sheet with *Gruppieren nach* plus the five facet groups (Person, Kategorie, Beschaffung, Gepäck, Merkmale). Selecting a person narrows the list, and the selection appears as a removable chip in the collapsed row; tapping the chip's × restores the unfiltered list. Asserts the grouping switcher is **not** present as a second bar in the header.
* **E2E-M4-16** `all` (FR-25.11c): two values inside one facet widen the result (Andy + Sia shows both), while a value from a second facet narrows it (Andy + 🛒 Vorher shows only Andy's purchases). Guards the OR-within / AND-across rule.
* **E2E-M4-17** `all` (FR-25.11d): a facet value's count reflects the other active facets but not its own — selecting Andy leaves the Person counts for Sia and Leonardo readable against Andy's *other* filters, and the mode counts drop to Andy's items. A currently selected value stays listed even when its count falls to 0, so the filter can always be undone from the panel.
* **E2E-M4-18** `all` (FR-25.11e): the "Alles gepackt 🎉" state appears **only** when nothing is narrowing the list. Four cases, all required: **search** with no match, **filter** with no match, **search + filter** together, and genuinely-everything-packed. The first three must all show "Keine Treffer" naming what is in force; only the fourth may celebrate. The reset offered clears **everything** narrowing — after pressing it, both the search term and the filter set are empty and the list is back. Regression guard: searching for a string the list does not contain announced completion, because the check looked at the filter count only.
* **E2E-M4-19** `all` (FR-25.11f): the Person facet lists the shared bucket as **"Gemeinsam"**, first in the list, and never as "Alle".
* **E2E-M4-22** `all` (FR-25.16): tapping a group header folds that group to **its header line alone**, which then reads "‹Gruppe› · N offen" — asserts **no** extra stub line is rendered and that N matches the group's open rows in the model. Other groups stay untouched. The app-bar fold-all control collapses every group to headers with **zero item rows** and flips its label to *Alle aufklappen*; pressing it again restores the full list. The folded set survives a re-render — packing a row must not unfold the rest.
* **E2E-M4-23** `all` (FR-25.16/25.2): a group whose rows are **all** done disappears completely — no header and **no stub** — and reappears only when *Erledigte* is switched on. Asserts folding and doneness stay separate concepts: a folded group with open items is still on the list, an absent group is not.
* **E2E-M4-24** `all` (FR-25.17): with packed rows revealed, each carries **"gepackt von ‹Name› · ‹Tag› ‹Uhrzeit›"** with the packer's avatar. Un-packing a row **clears** the stamp, so it can never outlive the state it describes.
* **E2E-M4-14** `all` (FR-25.1/25.2): packing one instance of a two-person cluster keeps the cluster intact — the packed child drops out (hide-done), the sub-header still reads over the full set (`1/2`), and the remaining instance does **not** re-render as a flat row. Guards the "decide cluster-vs-flat over the full set" rule; getting this wrong makes the list restructure under the user's finger mid-tap.

### M5 — Item Detail
* **E2E-M5-06** `all` (FR-25.14): opening a **per-person** item shows its total as a **read-only chip** ("0/3") with **no** +/− control on it, and one row per traveler each carrying its own check or stepper. Packing one traveler's instance raises the total and leaves the others untouched. Guards the regression where the summed quantity sat in a stepper that could not be operated.
* **E2E-M5-07** `all` (FR-25.15): the sheet has **no Save button**; any edit flips the indicator to amber "Wird gespeichert…" and back to green "✓ Gespeichert" once settled. The *Details* toggle, which only folds the sheet open, must **not** flip it. Asserts the indicator is separate from the G-2 sync glyph.
* **E2E-M5-01** `all` (FR-4.2): distinct *Used by* (traveler) vs *Packed by* (user) sections.
* **E2E-M5-02** `all` (FR-3.1/10.2): mode selector PACK/BUY_BEFORE/BUY_LOCAL; container picker.
* **E2E-M5-03** `all` (FR-9.1): Unused/Missing flags visible only on active trips.
* **E2E-M5-04** `all` (FR-14.1): history sparkline of quantities from previous series trips.
* **E2E-M5-05** `all` (FR-7.1/7.2): comment thread; flag-as-task toggle turns a comment into an open task.
* **E2E-M5-06** `all` (FR-7.3): prep-todo section — add/resolve/reopen; resolve restricted to assignee/owner.
* **E2E-M5-07** `server` (FR-6.2): delegate (set Packed by → other user) triggers a notification on the recipient.
* **E2E-M5-08** `single/local` (FR-17.3/G-8): Delegate control hidden.
* **E2E-M5-09** `all` (FR-3.3): "Buy now" on a BUY_BEFORE item flips mode to PACK with an undo snackbar.
* **E2E-M5-10** `all` (FR-20.1/20.4): Companions hint with one-tap Add (chains required companions).
* **E2E-M5-11** `server` (G-3): item locked by the other user → read-only with lock banner.
* **E2E-M5-12** `all` (FR-22.1): the source master item's photo renders when present.

### M6 — Shopping Views
* **E2E-M6-01** `all` (FR-3.2): two tabs (Before departure / At destination), rows grouped by category; destination tab shows destination-checklist entries separated.
* **E2E-M6-02** `all` (FR-3.3): check off a BUY_BEFORE item → transitions to PACK and leaves the list with animation; BUY_LOCAL → packed.
* **E2E-M6-03** `all` (FR-5.6): free-text add directly into either list.
* **E2E-M6-04** `all` (FR-3.2): both lists empty → M4 toolbar entry/badge hidden.
* **E2E-M6-05** `all` (FR-25.6): a **per-person** item in a buy mode appears in the shopping list at all — the regression was that it did not, because open-ness was decided from the item's own `packed`/`quantity`, which a per-person item does not carry. It renders as **one aggregated row** with the summed quantity ("3 Stk"), the recipients named ("für Sia, Leonardo") and their avatars — **not** one row per traveler.
* **E2E-M6-06** `all` (FR-25.6/3.3): checking off that aggregated row settles **every** instance in one act — a BUY_LOCAL per-person item leaves the list fully packed for all recipients, and a BUY_BEFORE one moves to PACK for all of them. Asserts no instance is left behind.
* **E2E-M6-07** `all` (FR-25.6): a per-item note can be added from the row, is shown inline on it, survives a re-render, and can be edited and cleared — without leaving M6.
* **E2E-M6-08** `all` (FR-25.10): the shopping row offers **no free-form "for whom" control**; the recipients shown are derived from membership only. Guards against reintroducing the attribution FR-25.10 removed.
* **E2E-M6-16** `all` (FR-25.13a) / **E2E-M4-21** `all`: both quick-adds carry a **visible confirm button** in every mode, and adding works by tapping it alone — no keyboard involved. Guards the phone case, where relying on Enter leaves no reachable way to commit.
* **E2E-M6-12** `all` (FR-25.13a): the quick-add offers name, description and a *Zugewiesen an* chip row. Adding with all three set produces a row carrying the description inline and the assignee mark. **Enter commits from the description field too.** Regression guard: tapping an assignee chip must **not** clear an already-typed description — the failure mode of re-rendering the form on selection.
* **E2E-M6-13** `all` (FR-25.13a): after an add, the **assignee stays selected** for the next item while name and description are cleared. Asserts the carry-over is on the assignee only.
* **E2E-M6-17** `all` (FR-25.11i/j): checking off a row hides it; the filter sheet's *Erledigte* section reveals it **dimmed and still interactive**, and tapping its control again restores it to the open list. Covers the **BUY_BEFORE** case specifically, where checking off changes the item's mode and would otherwise make it unreachable from the shopping side; the revealed row states where it went ("auf der Packliste"). Default is hidden.
* **E2E-M6-18** `all` (FR-25.11k): M6 shows **no search field by default**; the magnifier in the tab row reveals and focuses it, typing filters the list, and ✕ **closes** the field rather than merely clearing it. The filter icon sits beside the magnifier and carries the active-count badge. Asserts the list regains its full height when the search is closed.
* **E2E-M6-19** `all` (FR-25.13b): typing at least two characters offers master-item suggestions; picking one fills the name **and adopts that item's category**, including a category this trip has not used yet. Without a pick the category defaults to *Sonstiges* and can be set manually. Regression guard: choosing a suggestion must not clear an already-typed description, and the suggestion strip must redraw **without** re-rendering the form.
* **E2E-M6-20** `all` (FR-25.12): a row with no assignee shows an **edit glyph**, not a plus.
* **E2E-M6-14** `all` (FR-25.11g): M6 shows the same filter bar as M4; its sheet offers *Zugewiesen an*, *Für wen* and *Kategorie* and — unlike M4's — **no grouping section**. Filtering by an assignee narrows the list and shows the removable chip. The unassigned bucket reads "niemand zugewiesen" and leads the list. M4's and M6's filters are **independent**: setting one must not change the other.
* **E2E-M6-15** `all` (FR-25.11h) / **E2E-M4-20** `all`: scrolled to the bottom of the list, the last row's bounding box does **not** intersect the ＋ FAB, on both screens. Guards the case where the right-edge marks (assignee, packer avatar) end up under the button.
* **E2E-M6-09** `all` (FR-25.12): tapping a shopping row opens its sheet with *Zugewiesen an* and *Beschreibung*. Assigning a buyer shows that person on the **right** of the row with the 🛒 badge, while derived recipients stay on the **left** — asserts the two are visually distinct even when the buyer is also a recipient. "niemand" clears the assignment.
* **E2E-M6-10** `all` (FR-25.12): a description entered in the sheet renders inline on the row, survives closing and reopening, and can be cleared. Both buyer and description are optional — a row with neither renders without either mark.
* **E2E-M6-11** `all` (FR-25.13): M6 has **no permanent "add" row**; the ＋ FAB expands an inline quick-add above the list and focuses it, Enter adds to the currently open tab, and an empty field collapses it on blur — the same sequence as M4-04. Asserts no native `prompt()` is used.

### M7 — Template List
* **E2E-M7-01** `all` (FR-1.2): My templates vs Published sections; per-row name + item count.
* **E2E-M7-02** `server` (FR-1.6): fork a published template → editable copy under My templates.
* **E2E-M7-03** `all` (FR-1.2): FAB → name prompt → creates template → opens M8.
* **E2E-M7-04** `all` (FR-18.2): long-press → Export → YAML download.
* **E2E-M7-05** `all` (FR-18.4): FAB "+" menu → Import from file → M18.
* **E2E-M7-06** `all` (G-7): empty state CTA (create / import).
* **E2E-M7-07** `all` (FR-27.1/27.2): a composed template's row shows its group count, its **resolved** item count (not 0 for a template with no own positions), and an "enthält: …" line naming the included groups.

### M8 — Template Editor
* **E2E-M8-01** `all` (FR-1.3/1.5): quantity field accepts a formula with live validation and computed example ("for a 7-day trip: 8"); save is blocked while any formula is invalid with a per-row error.
* **E2E-M8-02** `all` (FR-1.4): per-item assignment type Per Person / Trip-Global.
* **E2E-M8-03** `all` (FR-2.3/15.2): dedup strategy select; condition chips (season/transport/accommodation).
* **E2E-M8-04** `all` (FR-1.1): item picker from M9 with inline-create.
* **E2E-M8-05** `all` (FR-2.4/27.4): editing a published template shows the propagation warning in its FR-27.4 wording — planning trips of consumers update immediately, everyone else sees changes at the next trip generation, running/past trips never.
* **E2E-M8-06** `all` (FR-1.2): add/remove/reorder items; swipe-to-delete.
* **E2E-M8-07** `all` (FR-27.1): "Eingebundene Gruppen" section — include another template via the picker, remove one; the picker **omits** the template itself and any candidate whose inclusion would close a cycle (A→B→A never offered); own positions and groups stay visually separate sections.
* **E2E-M8-08** `all` (FR-27.2): resolution footer shows the resolved item count over groups + own positions and **names** every dedup with its contributing groups ("Kamera nur 1× — in Makro & Wildlife").
* **E2E-M8-09** `all` (FR-27.4): a template used by a *planning* trip shows the blast-radius note naming that trip; adding/removing a position then puts the "⟳ N Änderungen aus Gruppen übernommen" chip **only** on that planning trip's M2 row (never on active/archived rows); expanding the chip lists each change with its source group.

### M9 — Item Inventory
* **E2E-M9-01** `all` (FR-1.1): searchable, category-grouped list; per-row name/weight/value/unit/consumable chips; row thumbnail when a photo exists.
* **E2E-M9-02** `all` (FR-1.1): FAB → name prompt → creates item → opens M10.
* **E2E-M9-03** `all` (FR-16.3): multi-select merge of duplicates.
* **E2E-M9-04** `all` (G-7/NFR-4.7): empty state → import entry (M15).

### M10 — Item Editor
* **E2E-M10-01** `all` (FR-1.1/1.7/1.8): name, category (inline-create), weight, value, unit selector pieces/pairs/per-day (rate field appears for per-day), consumable toggle.
* **E2E-M10-02** `all` (FR-2.4): usage footer ("Used in N templates, M archived trips"); delete blocked while referenced by templates.
* **E2E-M10-03** `all` (FR-20.1): "Depends on" section — add dependency with required/suggested mode; save-time cycle rejection with a readable error; read-only "Companions" list.
* **E2E-M10-04** `all` (FR-22.1/22.4/22.5): Photo section — add/replace/remove with live preview; oversized source is optimized to ≤150 KB JPEG (asserted via the stored/served image).

### M11 — Container Management
* **E2E-M11-01** `all` (FR-10.1): create/edit/delete containers with name, carrier, max weight.
* **E2E-M11-02** `all` (FR-10.3): weight bar goes amber at ≥90%, red beyond max.
* **E2E-M11-03** `all` (FR-10.2): unassigned bucket; assign items into/between containers; deleting a container unassigns its items first.
* **E2E-M11-04** `all` (FR-10.3): pairing control shows a live imbalance indicator against the threshold.

### M12 — Analytics
* **E2E-M12-01** `all` (FR-8.1/8.2): dimension switcher Person/Category/Container; stacked packed-vs-planned weight bars + value totals.
* **E2E-M12-02** `all` (FR-8.2): items without weight aggregate as "unweighted (n)".
* **E2E-M12-03** `all` (FR-14.3): series trend section (weight over years, top Missing/Unused) shown when the trip has a series.
* **E2E-M12-04** `all` (FR-8.2): tap a bar segment → M4 filtered to that slice.

### M13 — Repack Mode — **REMOVED (2026-07-17)**
Feature removed from the product (PRD Addendum §3.11); its E2E cases are retired.

### M14 — Post-Trip Review Assistant
* **E2E-M14-01** `all` (FR-9.1/9.2): archiving a flagged trip auto-launches the card stack; a proposal reads correctly (e.g. "Unused on N trips → set qty 0").
* **E2E-M14-02** `all` (FR-9.2/1.6): Apply writes to the user's own template (asserted in M8); a foreign published source prompts Fork & apply.
* **E2E-M14-03** `all` (FR-9.2): "Never ask again" scopes to the item–template pair (same item still surfaces for another template).
* **E2E-M14-04** `all` (FR-9.2): no flags → "nothing to review" toast; re-openable from the archived trip; applied cards don't reappear (resumability).

### M15 — Import Wizard
* **E2E-M15-01** `all` (FR-16.1): upload/paste CSV → grid preview; mark item column, category rows, per-trip include/name/date/series.
* **E2E-M15-02** `all` (NFR-4.7): noise handling shown inline ("'…?' → item + open task").
* **E2E-M15-03** `all` (FR-16.3): dedup step offers merge/keep-separate against existing master data.
* **E2E-M15-04** `all` (FR-16.2/NFR-4.7): confirm commits (n items, n archived trips, target series); pre-validation blocks a bad file before commit (transactionality approximation).

### M16 — Series & Destination Profile
* **E2E-M16-01** `all` (FR-13.1): series name + default attribute chips editable (the M3 prefill source).
* **E2E-M16-02** `all` (FR-13.3): destination notes + checklist editor on the lazily created profile.
* **E2E-M16-03** `all` (FR-13.2): trip history with per-trip stats; detach/attach trips.
* **E2E-M16-04** `all` (FR-13.2): "New trip in series" → M3 prefilled; trends shortcut → M12.

### M17 — Settings & Notifications
* **E2E-M17-01** `server` (FR-6.2): notification prefs per event type (delegation/mention/task) toggle and persist; changing a pref suppresses the matching notification on the next trigger.
* **E2E-M17-02** `server` (NFR-4.6): "Push on this device" registers via the Push API/VAPID (permission mocked); support detection hides it where unsupported.
* **E2E-M17-03** `all` (NFR-4.5): data section — JSON full export and per-trip CSV download through the auth-header blob path.
* **E2E-M17-04** `single` (FR-17.13): editable display name (inline `[A-Za-z0-9._-]{1,50}` validation) + avatar upload with pan/zoom crop → 256×256 JPEG; reflected in the dashboard greeting.
* **E2E-M17-05** `server` (FR-17.13): profile read-only with an IdP note (no editable name/avatar).
* **E2E-M17-06** `all` (G-11/FR-21.3): Appearance toggle light/dark, device-local, persists across reload.
* **E2E-M17-07** `local` (NFR-4.11): stale-backup warning (never / >30 days, clock-controlled) + storage-details row; cleared after a YAML download.
* **E2E-M17-08** `single/local` (FR-17.3): notification-prefs section hidden.
* **E2E-M17-09** `server` (FR-23.1): Administration row visible only for an instance admin with an OIDC session.

### M18 — Portable Import Preview
* **E2E-M18-01** `all` (FR-18.4/18.5): template YAML → summary header + per-item state (new/near-duplicate/matched); Import creates a new private owned template; a name collision appends " (import)".
* **E2E-M18-02** `all` (FR-18.4): trip YAML → creates a trip in *planning* status; travelers/containers remapped by name.
* **E2E-M18-03** `all` (FR-16.3): near-duplicate rows offer merge/keep-separate (shared dedup component with M15).
* **E2E-M18-04** `all` (FR-18.5): a newer `schema_version` shows a warning but imports best-effort; a malformed file is rejected at the picker (never reaches this screen).

### M19 — First-Launch Mode Selection
* **E2E-M19-01** `local` (FR-19.1): first launch shows the two cards; "Just on this device" requests persistent storage and lands on M1 empty state; shown exactly once (not re-asked after reload).
* **E2E-M19-02** `server/single` (FR-19.1): "Connect to a server" validates the URL against the health endpoint, then proceeds to OIDC login (`server`) or straight to M1 (`single`).
* **E2E-M19-03** `local` (FR-19.1): unreachable server URL → inline error, stays on the screen.

### M20 — User Administration
* **E2E-M20-01** `server` (FR-23.2): admin sees the account list (avatar, name, email, provisioning date, status chip, usage counts, admin chip, "you" marker).
* **E2E-M20-02** `server` (FR-23.3): Deactivate (confirm spells out consequences) revokes the target's access (their next request 403s); reactivate restores; no Deactivate on admins/own row.
* **E2E-M20-03** `server` (FR-23.4): Remove avatar / Reset display name.
* **E2E-M20-04** `server` (FR-23.5/23.1): no delete action anywhere; no role toggle.
* **E2E-M20-05** `server` (FR-23.1/G-8): a non-admin OIDC user cannot route to `/admin` (403 / redirect); hidden entirely in `single`/`local`.

### M21 — Vorlage aus Reise (new screen, §3.27 — UI-Spec entry to follow)
* **E2E-M21-01** `all` (FR-27.5): entry from the trip's *Danach* phase; the screen lists every recognised group with its on-trip item count and a "wird wiederverwendet" marker, and the loose ad-hoc rows (all pre-checked) under "Eigene Artikel".
* **E2E-M21-02** `all` (FR-27.5): a group with on-trip deviations names them ("Auf der Reise ergänzt: Gimbal") and offers **Gruppe aktualisieren** (default) vs. **nur in diese Vorlage**; group positions absent from the trip are reported with the explicit "Gruppe bleibt unverändert" note.
* **E2E-M21-03** `all` (FR-27.5/27.1/27.4): creating with defaults yields a composed template that **references** the recognised groups (not copies), carries the checked loose rows as own positions, and — where *aktualisieren* was chosen — the deviation lands in the group itself and surfaces as an applied change on planning trips using that group. The "Als neue Gruppe speichern" toggle bundles the loose rows into a fresh group instead.

---

## 5. Cross-Screen Flow Tests

These are full end-to-end journeys spanning several screens — the highest-value, lowest-count tests. They mirror UI_Spec §3.

* **E2E-FLOW-01 Happy-path packing** `server`: Alice M1 → M4 → swipe *Packing Now* → check → Bob's device reflects it in real time (locks, actor attribution, presence). (FR-5.x, 4.4, G-3, G-10)
* **E2E-FLOW-02 Delegation** `server`: M4 → M5 → set packer (Bob) → Bob receives push/in-app notification → taps → deep-links into M4/M5. (FR-4.3, 6.2, 6.3, G-4)
* **E2E-FLOW-03 Purchase transition** `single`: M6 Before-departure → check item → appears in M4 as PACK/Open. (FR-3.3)
* **E2E-FLOW-04 Feedback loop** `single`: M4 flag *Missing* → archive → M14 proposes template addition → apply → next M3 run includes the item. (FR-9.1, 9.2, 2.2)
* **E2E-FLOW-05 Migration** `single`: M15 import → M2 shows archived series trips → M3 step 4 surfaces historical suggestions immediately. (FR-16.x, 14.2)
* **E2E-FLOW-06 Offline round-trip** `single`: go offline → make edits (G-5 optimistic) → glyph shows queued → go online → silent sync, edits persist. (NFR-4.1, 4.2, G-2, G-5)
* **E2E-FLOW-07 Local→Server migration** `local`→`server`: export portable YAML in Local Mode → import into a Server instance via M18 → data present. (FR-19.5, 18.x)
* **E2E-FLOW-08 Concurrent-edit convergence** `server`: Alice and Bob edit the same trip offline simultaneously → both reconnect → field-level merge converges; a real conflict appears in the G-2 conflict log. (NFR-4.2a, G-2)
* **E2E-FLOW-09 Template round-trip over a year** `single`: M3 creates a trip from a composed template + one extra overlapping group (camera deduped, named in the preview) → items added ad-hoc during the trip → archive → M21 creates next year's template: groups recognised & referenced, one deviation folded back into its group → the fold-back appears as an applied change on a *planning* trip using that group, while the archived source trip stays untouched → a new M3 run from the new template contains the full learned set. (FR-27.1–27.5, FR-2.3a)

---

## 6. Non-Functional Journeys

| ID | NFR | Mode | Assertion |
|---|---|---|---|
| E2E-NFR-01 | NFR-4.1 Offline-first | single/local | Every read/write works with the network offline; nothing blocks. |
| E2E-NFR-02 | NFR-4.8 Single-User independence | single | Instance boots and is fully usable with no IdP reachable (no OIDC env, network to any IdP blocked). |
| E2E-NFR-03 | NFR-4.11 Persistence | local | Persistent storage requested; storage estimate/persisted surfaced in the G-2 detail. |
| E2E-NFR-04 | NFR-4.2a Conflict resolution | server | See E2E-FLOW-08 — merge + conflict-log UI. |
| E2E-NFR-05 | NFR-4.5 Export | single | JSON full + per-trip CSV download and are well-formed. |
| E2E-NFR-06 | NFR-4.6 Push | server | Web-Push registration round-trip (browser Push API mocked). |
| E2E-NFR-07 | NFR-4.7 Import transactionality | single | A pre-validation failure aborts the import with no partial rows. |

---

## 7. Requirement Traceability Matrix

Coverage tags: **E2E** = a browser case above exercises it through the UI · **UNIT** = algorithm proven by existing Vitest/domain tests; the E2E journey only touches it incidentally · **SERVER** = backend/API concern, no UI surface (owned by Go tests) · **DOC/N-A** = documentation-only or retired.

| Req | Coverage | E2E case(s) / note |
|---|---|---|
| FR-1.1 | E2E | M9-01/02, M10-01, M8-04 |
| FR-1.2 | E2E | M7-01/03, M8-06 |
| FR-1.3 | E2E+UNIT | M8-01 (UI); formula.ts (logic) |
| FR-1.4 | E2E | M8-02 |
| FR-1.5 | E2E+UNIT | M8-01; formula.ts `validateFormula` |
| FR-1.6 | E2E | M7-02, M14-02, M18-01 |
| FR-1.7 | E2E | M10-01 |
| FR-1.8 | E2E | M10-01, G6-01 |
| FR-2.1 / 2.1a | E2E | M3-01, M2-01/03 |
| FR-2.2 | E2E+UNIT | M3-06; instantiate.ts |
| FR-2.3 / 2.3a | E2E+UNIT | M3-06, M8-03; instantiate.ts |
| FR-2.4 | E2E | M3-10, M8-05, M10-02 |
| FR-2.5 | E2E | M3-03 |
| FR-3.1 | E2E | M5-02 |
| FR-3.2 | E2E | M6-01/04, M4-11 |
| FR-3.3 | E2E | M6-02, M5-09, FLOW-03 |
| FR-4.1 | E2E | M3-04 (share on create) |
| FR-4.2 | E2E | M5-01 |
| FR-4.3 | E2E | M4-06, M5-07 |
| FR-4.4 | E2E | M4-10, M1-03, FLOW-01 |
| FR-4.5 | E2E | M2-05, M3-04, TripMembers |
| FR-4.6 | UNIT | members.ts role model; surfaced via M3-04 |
| FR-4.7 | E2E | M3-04 (role select) |
| FR-5.1 | E2E | M4-03 |
| FR-5.2 | E2E | M4-05 |
| FR-5.3 | E2E | G3-01, FLOW-01 |
| FR-5.4 | E2E | M1-06 |
| FR-5.5 | E2E | M4-06 |
| FR-5.6 | E2E | M4-04, M6-03 |
| FR-6.1 | E2E | M1-01/03 |
| FR-6.2 | E2E | M5-07, M17-01, FLOW-02 |
| FR-6.3 | E2E | G4-01, M1-04, FLOW-02 |
| FR-7.1 | E2E | M5-05 |
| FR-7.2 | E2E | M5-05, M4-09 |
| FR-7.3 | E2E | M1-02, M4-08, M5-06 |
| FR-8.1 | E2E | M4-01, M12-01 |
| FR-8.2 | E2E+UNIT | M12-01/04; analytics.ts |
| FR-9.1 | E2E | M5-03, M4-04, FLOW-04 |
| FR-9.2 | E2E+UNIT | M14-01/02/03/04; review.ts |
| FR-10.1 | E2E | M11-01 |
| FR-10.2 | E2E | M11-03, M5-02 |
| FR-10.3 | E2E+UNIT | M11-02/04; containers.ts |
| FR-10.4 | UNIT | analytics.ts (container weight); surfaced M12-01 |
| FR-11.1–11.3 | — | removed (Repack feature dropped, Addendum §3.11) |
| FR-12.1 | E2E | M2-04 |
| FR-12.2 | E2E+UNIT | ClonePage toggles; clone.ts |
| FR-13.1 | E2E | M2-02, M16-01 |
| FR-13.2 | E2E | M16-03/04, M3-02 |
| FR-13.3 | E2E | M3-09, M16-02, M6-01 |
| FR-14.1 | E2E | M3-08, M5-04 |
| FR-14.2 | E2E+UNIT | M3-08; suggestions.ts |
| FR-14.3 | E2E+UNIT | M12-03; analytics.ts |
| FR-15.1 | E2E | M3-01, M16-01 |
| FR-15.2 | E2E+UNIT | M3-06, M8-03; instantiate.ts |
| FR-15.3 | UNIT | formula.ts variable catalogue; surfaced M8-01 |
| FR-16.1 | E2E | M15-01 |
| FR-16.2 | E2E | M2-08, M15-04 |
| FR-16.3 | E2E+UNIT | M15-03, M18-03, M9-03; spreadsheet.ts |
| FR-17.1/17.2 | E2E | G1-01, G8-01 (Single-User surface) |
| FR-17.3 | E2E | M2-06, M3-05, M5-08, M17-08 |
| FR-17.4/17.5 | E2E | M17 profile (single-user bootstrap) |
| FR-17.6–17.10/17.12 | DOC/N-A | Demo Mode — removed in v2.10 |
| FR-17.11 | E2E | G8-01 (feature inert in Single-User) |
| FR-17.13 | E2E+UNIT | M17-04; avatarCrop.ts / imageResize.ts |
| FR-18.1 | UNIT | portable.ts wire types; surfaced via 18.2/18.4 |
| FR-18.2 | E2E | M7-04, M2-07 |
| FR-18.3 | E2E | M2-07 |
| FR-18.4 | E2E | M18-01/02, M2-09, M7-05 |
| FR-18.5 | E2E | M18-04 |
| FR-18.6 | E2E | FLOW-07 (round-trip) |
| FR-19.1 | E2E | M19-01/02/03 |
| FR-19.2 | E2E | NFR-01 (local load path) |
| FR-19.3 | E2E | G8-01 (collab UI gated in Local) |
| FR-19.4 | E2E | G2-02 (local glyph/state) |
| FR-19.5 | E2E | FLOW-07 |
| FR-19.6 | E2E | G2-02, NFR-03 |
| FR-20.1 | E2E+UNIT | M10-03, M5-10; dependencies.ts |
| FR-20.2 | E2E+UNIT | M4-07; dependencies.ts |
| FR-20.3 | E2E+UNIT | M3-07; dependencies.ts |
| FR-20.4 | E2E+UNIT | M3-07, M5-10; dependencies.ts |
| FR-21.1/21.2 | E2E | G11-01 (Mocha default) |
| FR-21.3 | E2E | M17-06 |
| FR-21.4 | E2E | G11-01 (no flash before paint) |
| FR-22.1 | E2E | M10-04, M9-01, M5-12 |
| FR-22.2/22.3 | E2E+UNIT | M10-04; imageResize.ts |
| FR-22.4 | E2E | M10-04 (add/replace/remove) |
| FR-22.5 | SERVER | 150 KB / JPEG enforced server-side; edge asserted M10-04 |
| FR-22.6 | SERVER | item image shared, no trip-role gate (Go test) |
| FR-23.1 | E2E | M17-09, M20-05 |
| FR-23.2 | E2E | M20-01 |
| FR-23.3 | E2E | M20-02 |
| FR-23.4 | E2E | M20-03 |
| FR-23.5 | E2E | M20-04 |
| FR-23.6 | SERVER | deactivation side-effects (push purge, notif suppress) — Go test; access-revocation asserted M20-02 |
| FR-25.1 | E2E+UNIT | M4-12/13/14; packingView.ts (clustering, flat fallback, full-set decision) |
| FR-25.2 | E2E+UNIT | M4-14; packingView.ts (isDone, hidden counts, full-set headers) |
| FR-25.4 | E2E+UNIT | mode glyph rules M4-15/16; packingView.ts — the pill strip itself is superseded by FR-25.11 |
| FR-25.8 | E2E | M4-12, M4-13 |
| FR-25.6 | E2E | M6-05 (aggregated row), M6-06 (settles all instances), M6-07 (notes) |
| FR-25.10 | E2E | M6-08 (no free-form "for whom"); M5 membership control |
| FR-25.12 | E2E | M6-09 (buyer, kept distinct from recipients), M6-10 (description) |
| FR-25.13 | E2E | M6-11; M4-04 (same quick-add sequence on both screens) |
| FR-25.13a | E2E | M6-12 (all three at add time, no wipe on chip tap), M6-13 (assignee carries over), M6-16/M4-21 (visible confirm, no keyboard) |
| FR-25.11 | E2E | M4-15 (panel), M4-16 (OR/AND), M4-17 (counts), M4-18 (empty states), M4-19 (Gemeinsam) |
| FR-25.11g | E2E | M6-14 (same panel, shop facets, independent state) |
| FR-25.11h | E2E | M4-20, M6-15 (last row clears the FAB) |
| FR-25.11i | E2E | M6-17; M4-14 (reveal, dimmed, still interactive) |
| FR-25.11j | E2E | M6-17 (BUY_BEFORE leaves the list and comes back) |
| FR-25.11k | E2E | M6-18, G12-01/04 (collapsed search, filter icon with badge, one header line) |
| G-12 | E2E | G12-01…06 (app-bar placement, two clusters + no overflow, survives collapse, one line, literal icons, nameable glyphs) |
| FR-25.16 | E2E | M4-22 (fold one / fold all), M4-23 (folding vs doneness stay separate) |
| FR-25.17 | E2E | M4-24 (packed-by stamp, cleared on un-pack); M6-05 for the buying counterpart |
| FR-25.14 | E2E | M5-06 (read-only aggregate, per-traveler controls) |
| FR-25.15 | E2E | M5-07 (auto-save indicator, distinct from G-2) |
| FR-25.13b | E2E | M6-19 (autocomplete adopts the category; manual fallback) |
| FR-27.1 | E2E | M8-07 (include/remove, cycle guard), M7-07, M21-03 |
| FR-27.2 | E2E+UNIT | M3-11, M8-08; instantiate.ts (include expansion + named merge) |
| FR-27.3 | E2E | M3-12 |
| FR-27.4 | E2E | M8-05 (warning wording), M8-09 (chip only on planning trips), M21-03, FLOW-09 |
| FR-27.5 | E2E | M21-01/02/03, FLOW-09 |
| NFR-4.1 | E2E | NFR-01, FLOW-06 |
| NFR-4.2 | E2E | FLOW-06 (silent background sync) |
| NFR-4.2a | E2E+UNIT | FLOW-08, NFR-04; sync merge tests |
| NFR-4.3 | SERVER | resource footprint — docker/Go, no UI |
| NFR-4.4 | SERVER | JWT decoupling — Go/api; offline-token touched by FLOW-06 |
| NFR-4.5 | E2E | M17-03, NFR-05 |
| NFR-4.6 | E2E | M17-02, NFR-06 |
| NFR-4.7 | E2E+UNIT | M15-02/04, NFR-07; spreadsheet.ts |
| NFR-4.8 | E2E | NFR-02 |
| NFR-4.9 | DOC/N-A | operator documentation only |
| NFR-4.10 | DOC/N-A | retired (demo rate-limit) |
| NFR-4.11 | E2E | M17-07, NFR-03 |

**No requirement with a UI surface is left uncovered.** Rows tagged SERVER or DOC/N-A are intentionally outside the browser suite, with the reason stated.

---

## 8. CI Integration (proposed)

* **New CI job `e2e`** in `.github/workflows/ci.yml`, `needs`-gated after `client` and `go` build so it runs on a proven client + server.
* **Fixtures**: build the `jitpackd` binary (already built for `docker-build`); a shared harness starts it in `single` or `server` mode per test project. Playwright `webServer` starts `vite preview`.
* **Browsers**: Chromium + WebKit; Playwright browser binaries cached via `actions/cache` keyed on the Playwright version.
* **Artifacts**: on failure, upload `playwright-report/` (HTML report + trace + video) via `actions/upload-artifact`.
* **Supply-chain (per the 2026-07-11 pinning agreement)**: the Playwright dep is pinned in `package-lock.json` (sha512); any new Action in the job is pinned by full commit SHA; `playwright install` pinned to the package version. Dependabot's npm/actions ecosystems keep them fresh.
* **Dependency-footprint justification (NFR-4.3 discipline)**: Playwright is a **dev-only** dependency; it ships nothing to the container or client bundle and pulls no runtime code. Its browser binaries live only in the CI cache. This keeps the runtime footprint unchanged, satisfying the standard-library-first / minimal-footprint working agreement for production while accepting a heavier *test* toolchain.
* **Flakiness budget**: E2E stays journey-focused (this spec is deliberately ~90 cases, not ~400) so the suite is fast and stable; retries limited to 1; no arbitrary sleeps (clock injection only, §2.4).

---

## 9. Out of Scope / Future

* **Visual regression** (screenshot diffing of G-11 themes, layouts) — deferred; would layer on Playwright's `toHaveScreenshot` if desired later.
* **Native shell E2E** (Capacitor iOS/Android via Appium/Detox) — the web build is the coverage vehicle; the native WebView is approximated by WebKit.
* **Real IdP / real push-service delivery** — mocked (§2.3, §6); a smoke test against a real Authelia/UnifiedPush stack is a separate, manual pre-release check.
* **Load/perf** — not part of functional E2E.

---

## 10. Implementation Order (proposed, when we start building)

1. Playwright scaffold + `data-testid` pass on shared components, one smoke test per mode (M19 mode selection, M1 loads).
2. Global patterns (§3) — they underpin everything.
3. Single-User screen cases (largest surface, simplest infra).
4. Local Mode delta (persistence, mode selection, serverless export).
5. Mock-IdP harness + Server/collaboration multi-client cases (FLOW-01/02/08, presence, locks, notifications, admin).
6. Cross-screen flows + non-functional journeys.
7. Wire the `e2e` CI job; make it required once green and stable.
