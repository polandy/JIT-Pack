# Navigation & Overall Concept: „JIT-Pack" — Information Architecture (v1.1)

**Document Status:** Proposed for Review — consolidated IA draft
**Basis:** UI_Spec_v1.10 (screen inventory M1–M20, global patterns G-1–G-11) + the live client router (`client/src/router/index.ts`)
**Revision Note (v1.1):** Added **Part II** — full, code-grounded elaboration of the six structural points (desktop rail, trip-context entries, back-stack, onboarding, empty states, cross-cluster edges). Part II states *As built* vs *Proposal* per point and corrects Part I's "trip toolbar" simplification (the entries are distributed and status-gated, not a single toolbar).
**Revision Note (v1.0):** New document. The per-screen designs already existed in `UI_Spec_v1.10.md`; what was missing was the connective tissue — *how the app is navigated as a whole*. This document is the single home for that. It does not restate each screen's internal design (that stays in the UI Spec); it defines the **structure between** screens: the navigation model, the screen graph, and the routing that realises it.

> An interactive version of this concept (clickable phone prototype + navigation map) is maintained as a Claude Artifact and is the visual companion to this text. This markdown file is the authoritative written form; the two are kept in sync when the IA changes.

---

## 0. The thesis

> **One app, four anchors — everything else is context.**

JIT-Pack has 20 screens. If each were a first-class destination, the app would drown in navigation. Instead the architecture rests on **four permanent anchors** reachable at all times, with every other screen reached *contextually* — by drilling into a parent, opening a sheet, or entering a wizard. This keeps the mental model small (the user is always "in" one of four places) while giving deep features room to exist.

The four anchors map directly to the four nouns the product is built on:

| Anchor | Screen | The noun | Route |
|---|---|---|---|
| Dashboard | M1 | *my tasks right now* | `/tabs/dashboard` |
| Trips | M2 | *a packing effort* | `/tabs/trips` |
| Templates | M7 | *a reusable list* | `/tabs/templates` |
| Items | M9 | *a thing you own* | `/tabs/items` |

Settings (M17) is deliberately **not** a fifth anchor — it lives in the top bar (gear/avatar), because it is chrome, not content (G-1).

> **Forward note (non-binding, see `Vision_NorthStar_v1.0.md`):** The product's north star expands
> a trip from *a packing effort* into *a phased vacation* (Plan/Prepare/During/After). The decided
> consequence for this IA is that new surfaces (Idea Board, Day Plan, Map) enter as **phase sections
> within a trip**, reached by drill-down (§1.3) — **not** as new anchors. The four-anchor skeleton
> and the top-bar chrome are held fixed. Full screen designs come with each cluster; nothing here
> changes until then.

---

## 1. The navigation model

### 1.1 Two form factors, one skeleton

The same four destinations are presented differently by breakpoint; the *structure* never changes (G-1, G-9).

- **Mobile (< 900 px):** a bottom tab bar with the four anchors, thumb-reachable. A floating **＋ FAB** offers the create action for the active tab. The top bar carries the compact logo mark (left), the sync glyph and the settings gear/avatar (right).
- **Desktop (≥ 900 px):** the bottom tab bar is replaced by a persistent **left navigation rail** carrying the same four anchors (plus a Settings entry at the rail's foot). The top bar then spans the remaining width and hosts page-level primary actions *inline* instead of as a floating FAB.

The breakpoint is the only thing that differs. A user who resizes the window moves between these two presentations of the identical graph.

### 1.2 The top bar is global chrome

Left → right (G-9):

1. **Logo** — compact mark on mobile, full wordmark from the desktop breakpoint up. It is a universal "home" tap-target to M1 (Dashboard) from *anywhere*, including inside a trip, template, or wizard.
2. **Sync glyph** (G-2) — `synced` / `syncing` / `offline` / `local`. Tapping opens the sync detail; inside a trip it also exposes the conflict log (NFR-4.2a). In Local Mode it shows a device glyph and opens storage & backup detail instead.
3. **Settings / avatar** (G-1) — the gear (Single-User/Local) or the account avatar (collaborative) opens M17.

**Height & style (concept-review, 2026-07-17):** the top bar is deliberately **low** — a **short, single-line title with no subtitle**, a compact status area, and small logo/gear targets — so it never steals room from content. The **logo is a lightweight line mark** (a suitcase, tinted with the brand accent), not a filled tile. On **M4 (packing list)** the bar additionally participates in a **collapsing-header** interaction: scrolling the list down hides the packing sub-header and **migrates the trip name + presence facepile up into this bar**; scrolling up restores both (see Addendum §3.25 / UI-Spec M4). This collapse is M4-specific for now and may extend to other long lists later.

### 1.3 "Everything else is context" — the three ways down

Every non-anchor screen is reached by exactly one of three motions:

1. **Drill-down** — tapping a row opens its detail (a trip → M4, a template → M8, an item → M10).
2. **Contextual toolbar / sheet** — a screen exposes sibling tools for the thing you're looking at (M4's toolbar → Shopping, Containers, Analytics, …).
3. **Wizard / flow** — a multi-step create/import task on its own route (M3, M15, M18).

There is no global "hamburger" menu and no nested tab bars. Depth is always the result of a deliberate drill from an anchor.

---

## 2. The screen graph

The 20 screens divide into four clusters by **origin** — where you can reach them from. This is the backbone of the IA.

### 2.1 Cluster A — Tab roots (the four anchors + Settings)

Reached from the bottom tabs / nav rail. Always available.

| Screen | Route | Role |
|---|---|---|
| **M1** Dashboard | `/tabs/dashboard` | "My Tasks", trip cards, prep todos (FR-6.1/6.3) |
| **M2** Trip List | `/tabs/trips` | filter, progress rings, grouped by series |
| **M7** Template List | `/tabs/templates` | own & published templates |
| **M9** Item Inventory | `/tabs/items` | search, category groups, photos |
| **M17** Settings | `/tabs/settings` | top-bar entry — profile, data, theme, push |

### 2.2 Cluster B — Trip context (opened from M2 / M4)

A trip is **not** a tab. It is opened from the Trip List (M2) and becomes the hub (M4) that carries its own contextual toolbar. Everything here is scoped to one `:tripId`.

| Screen | Route | Role |
|---|---|---|
| **M3** Trip Wizard | `/trips/new` | 4 steps: metadata → travelers → templates → quantities |
| **M4** Packing List | `/trips/:id` | the trip hub — KPIs, grouping, stepper |
| **M5** Item Detail | `/trips/:id/items/:itemId` | assignment, flags, comments, prep todos |
| **M6** Shopping | `/trips/:id/shopping` | buy-before / buy-local lists |
| **M11** Containers | `/trips/:id/containers` | weights, pairing, assignment |
| **M12** Analytics | `/trips/:id/analytics` | weight/value per dimension, series trend |
| **M14** Review | `/trips/:id/review` | post-trip proposals for the template |
| Clone | `/trips/:id/clone` | trip as a starting point (FR-12) |
| Members | `/trips/:id/members` | roles Owner/Admin/Editor (FR-4.5) |
| Conflict Log | `/trips/:id/conflicts` | via the sync indicator inside the trip |

### 2.3 Cluster C — Master data (opened from M7 / M9)

Reusable across all trips — which is *why* they are their own anchors rather than buried inside a trip.

| Screen | Route | Role |
|---|---|---|
| **M8** Template Editor | `/templates/:id` | item picker, quantity formula, conditions |
| **M10** Item Editor | `/items/:id` | weight, value, unit, photo, companions |
| **M16** Series & Destination Profile | `/series/:id` | default attributes, destination checklist, history |

### 2.4 Cluster D — System & onboarding (outside the tabs)

Neither content nor trip-scoped; entered at the edges of the app.

| Screen | Route | Role |
|---|---|---|
| **M19** Mode Selection | *(before the router)* | first launch: Server / Local Mode (FR-19) |
| Login / OIDC | `/login` · `/auth/callback` | only when the server offers OIDC |
| **M15** Import Wizard | `/import` | spreadsheet import (CSV), dedup |
| **M18** Portable Import | `/portable-import` | restore a YAML backup (FR-18) |
| **M20** Admin | `/admin` | instance user management (FR-23) |

### 2.5 Cross-cluster entry points (the real wiring)

The clusters above describe *primary* origin. In practice several screens are reachable from more than one place — these secondary edges are what make the app feel connected:

- **M1 → M4/M5:** dashboard task cards deep-link straight into a trip item (G-4).
- **M2 → M3:** the FAB / empty state starts the wizard; **M16 → M3** (`?series=`) starts it pre-seeded from a series.
- **M4 sync glyph → Conflict Log;** **M4 toolbar → M6/M11/M12/M14/Members.**
- **M2 slide actions → Clone / Members / Archive→M14 / YAML export.**
- **M7 → M8, M9 → M10** (drill); **M9 empty / M2 title → M15** (import).
- **Logo (everywhere) → M1** (universal home, G-9).

---

## 3. Global patterns (the rules that hold it together)

Navigation is only half of a coherent app. Eleven patterns (G-1–G-11, defined in full in `UI_Spec_v1.10.md` §0) make every screen feel like the same app. Summarised here because they are *cross-navigation* concerns:

| Pattern | In one line |
|---|---|
| **G-1** Navigation model | four tabs, everything else contextual; settings via avatar/gear |
| **G-2** Sync indicator | synced/syncing/offline/local in the top bar; tap → detail + conflict log |
| **G-3** Presence & locks | "Packing Now" items show locker avatar and are non-interactive for others |
| **G-4** Deep linking | every notification resolves to `trip/{id}/item/{id}`, scrolls & flashes |
| **G-5** Optimistic UI | mutations commit locally first; confirmation silent, failures via the indicator |
| **G-6** Quantity stepper | one component; qty=1 as checkbox, qty>1 as ± stepper |
| **G-7** Empty states | every list has an empty state with exactly one primary action |
| **G-8** Single-User / Local | no banner — collaboration UI is simply hidden |
| **G-9** Header & desktop nav | logo = home; ≥900px bottom tabs → left rail |
| **G-10** Trip presence | facepile + group-sync badge in the trip header |
| **G-11** Theming | dark default (Mocha), optional Latte; applied before first paint |

---

## 4. Mode-dependent navigation

The same graph collapses gracefully by deployment mode (G-8):

- **Single-User Mode** (FR-17): no account → the avatar becomes a plain gear; sharing, delegation, notifications, Members (M2/M4), and the Admin entry (M20) are hidden. The four anchors and all trip/master screens remain.
- **Local Mode** (FR-19): no server → the sync glyph shows the `local` state and opens storage/backup; the same collaboration UI as Single-User is hidden; import/export flows work fully offline (client-side).
- **Collaborative (OIDC)** (FR-4/FR-23): the full graph, including Members, presence (G-10), notifications, and — for instance admins — M20.

No mode adds or removes an *anchor*; modes only reveal or hide leaves and top-bar affordances.

---

# Part II — Detailed elaborations

Part I fixed the skeleton. This part fleshes out each structural point in full, **grounded in the shipping code** (`client/src/…`). Where the as-built behaviour and the ideal diverge, both are stated: **As built** = what the code does today; **Proposal** = the recommended target. Nothing here is invented — every "As built" claim traces to a named file.

## 5. Desktop nav-rail

*Source: `components/global/NavRail.vue`, `App.vue`, `views/TabsLayout.vue`.*

**As built.** Below 900 px the bottom tab bar (`TabsLayout.vue`) is shown and the rail is `display:none`; at ≥ 900 px `App.vue`'s media query flips `.desktop-nav` to `display:flex` and Ionic hides the bottom tabs. The rail is a fixed **80 px** column pinned left of the scrolling content area (`.app-body` is a flexbox: rail + `main.app-content{flex:1;overflow:auto}`), sitting *below* the full-width header (header height 56 px). It carries the four anchors only — Dashboard, Trips, Templates, Items — each an icon-over-label link. Active state = primary tint background + primary text, matched by `route.path.includes('/tabs/{match}')`; hover = light surface.

**Gaps & proposals.**

| # | Observation (as built) | Proposal |
|---|---|---|
| 5a | **The rail has no Settings entry** — Settings is reached only via the header gear, in both form factors. The interactive concept sketched a Settings entry at the rail foot; the code does not have one. | Keep Settings in the header (consistent across breakpoints) **or** add a foot-of-rail Settings link for desktop parity. Pick one and make the concept + code agree. Recommendation: add it to the rail foot — desktop has the vertical room and it mirrors the mobile "always-present gear". |
| 5b | **Deep routes lose the highlight.** Inside a trip (`/trips/:id`) or a master editor (`/templates/:id`) the path is not `/tabs/*`, so `isActive()` matches nothing and **no rail item is lit** — the user loses their "you are here" anchor on desktop. | Broaden the active match: light **Trips** for any `/trips/*`, **Templates** for `/templates/*`, **Items** for `/items/*` and `/series/*`. The rail should reflect the *cluster* you're in, not only the exact tab route. |
| 5c | Rail is fixed-width, label-always-visible. | Fine at 80 px; no collapse needed. Revisit only if a fifth destination ever appears (it should not — that breaks the four-anchor thesis). |

**Inline page actions (G-9).** On desktop the FAB is not used; each page mounts its primary actions in its own `IonToolbar`/`IonButtons`. This is already the case (e.g. M4's header buttons). The concept's rule stands: **page-level primary actions render inline in the top bar on desktop, as a floating FAB on mobile.**

---

## 6. Trip-context entry points

*Source: `views/trips/PackingListPage.vue` (M4), `App.vue` (`onSyncTap`), `views/trips/TripListPage.vue` (M2 slide actions).*

**Correction to Part I.** The concept described M4 as carrying "its own contextual **toolbar**". In the shipping code there is **no single toolbar** — the trip-scoped screens are reached from *distributed, gated* affordances on M4 (and two from outside M4). This is the accurate map:

| Entry | Lives on | Gating (as built) | Target |
|---|---|---|---|
| Presence facepile (G-10) | M4 header end | `presenceUsers.length > 1` | presence sheet |
| Archive → Review | M4 header end | `trip.status === 'active'` | archives, auto-opens `/review` |
| Review (sparkles) | M4 header end | `trip.status === 'archived'` | `/trips/:id/review` |
| Shopping | M4 header end | `shoppingCount > 0` (badge) | `/trips/:id/shopping` |
| Analytics | M4 KPI strip | tap on the strip | `/trips/:id/analytics` |
| Edit containers | M4 body | `groupBy === 'container'` | `/trips/:id/containers` |
| Item detail (M5) | M4 list row | always | `/trips/:id/items/:itemId` |
| Conflict log | **top-bar sync glyph** | inside any trip (`onSyncTap`) | `/trips/:id/conflicts` |
| Members | **M2 slide action** | Owner/Admin + OIDC session (G-8) | `/trips/:id/members` |
| Clone | **M2 slide action** | archived trips (also M16) | `/trips/:id/clone` |

**Reading of this.** The status of the trip is the primary gate — an `active` trip shows Archive, an `archived` trip shows Review/Clone. Two capabilities (Shopping, Containers) are content-gated (only appear when there's something to show), honouring G-7's "no dead ends". Members/Clone/Conflicts deliberately live *off* M4. (Note: the M4 toolbar itself is slated for a slim-down redesign — see UI-Spec M4 / Addendum §3.25 — but the entry *set* stays; only its presentation changes.)

**Proposal.** Keep the status-driven gating (it's good), but make the **discoverability** explicit rather than emergent:

- 6a. **A canonical order** for the M4 header cluster, left→right: `presence · shopping · [status action] · overflow`. On mobile, collapse everything past the status action into a single **overflow "⋯" menu** (Analytics, Containers, Members, Clone, Conflict log) so the header never crowds. On desktop (wider bar) show them inline.
- 6b. **Surface Containers without the grouping detour.** Today Containers is only reachable by switching `groupBy` to `container`. Add it to the overflow menu so it's discoverable regardless of grouping.
- 6c. **Badges** are consistent: a count badge on Shopping (open procurement items) and on the prep/KPI counters; presence uses the facepile, never a number badge.
- 6d. **Mode-gating is one rule:** Members and presence appear only with an OIDC session (`collaborative`); in Single-User/Local they vanish with no gap (G-8).

---

## 7. Deep-link & back-stack semantics

*Source: `router/index.ts` (`createWebHistory`), `App.vue` (`onSyncTap`, `onAuthExpired`), `notifications/format.ts` (`notificationRoute`).*

**As built.** History is the browser stack (`createWebHistory`). Back = the platform back gesture / button. Deep links exist for notifications (G-4 → `/trips/:id/items/:itemId?comment=…`) and the sync-glyph → conflict log.

**The three problem cases and the rule for each.**

1. **Wizard/flow completion.** M3 (`/trips/new`) is `push`ed, so after creating a trip the browser back returns *into the finished wizard* — wrong. **Rule:** completing a create/import flow (M3, M15, M18, Clone) must `router.replace` to the result (the new trip/M4), not `push`. Back then skips the consumed wizard.
2. **Cold-start deep link.** A notification opened from a killed app lands on M5 with a one-entry history — "back" has nowhere sane to go. **Rule:** the **logo = home** affordance (G-9) is the guaranteed escape; additionally, a deep-linked detail should ensure its parent trip (M4) is reachable in one step (synthesise the M4 entry, or route detail→M4 on back).
3. **Modal-ish sub-screens** (Conflict log, presence sheet). **Rule:** these `push` and rely on back to dismiss; they must never be a dead end — each has a visible close/back to its origin trip.

**Proposal.** Document a small back-target contract per route class: *tab roots* → OS handles (exit); *drill-downs* → parent list; *flows* → replace-on-done; *deep links* → parent trip guaranteed. This belongs next to the route table in `router/index.ts` as a comment block.

---

## 8. Onboarding path

*Source: `App.vue` (`mode` ref, `chooseMode`, `onMounted`), `ModeSelectionPage.vue` (M19), `auth/` (OIDC).*

**As built — the exact decision tree.**

```
first launch
  └─ localStorage 'jitpack_mode' unset?  ── yes ─▶ M19 ModeSelectionPage
                                                     ├─ "Local Mode"  → persist mode=local
                                                     └─ "Server Mode" → persist mode=server (+ jitpack_server_url)
  └─ mode resolved ▶ mount app (header + rail/tabs + router → M1)
        onMounted, if mode=server AND no tokens AND path∉/auth/*:
            GET {server}/api/v1/auth/config
              ├─ 200 (OIDC offered)      → router.replace('/login') → /auth/callback → M1
              └─ 501 / unreachable        → proceed unauthenticated (Single-User/HS256/offline)
        AUTH_EXPIRED event (IdP rejected refresh) → router.replace('/login')
```

Local Mode never touches auth. Single-User servers answer `/auth/config` with 501, so the client silently proceeds — this is the "log in by opening the app" path the local Docker stack uses.

**Re-entry after a mode switch (FR-19.5).** There is deliberately **no toggle** between Local and Server. Switching modes goes through the export/import path (portable YAML): export from the old mode, re-run M19, import via M18. Part I §4 states this; the onboarding doc is where the *steps* live.

**Proposal.** Two refinements: (8a) M19 should state, per option, what it commits to and how to leave it (sets expectation for the no-toggle rule); (8b) the `auth/config` probe should show a brief "connecting…" state rather than a blank frame, so a slow server doesn't look like a hang.

---

## 9. Empty-state matrix (G-7)

*Source: the `empty-state` blocks across `views/`.*

Every list screen must offer **one** primary action when empty. Audit of the current state:

| Screen | Empty copy (as built) | Primary action today | Verdict |
|---|---|---|---|
| M1 Dashboard | greeting + CTA | **"Plan a trip"** button → `/trips/new` | ✅ explicit |
| M2 Trip List | — | FAB → `/trips/new` | ⚠ relies on FAB, no in-body CTA |
| M7 Templates | "Create your first template…" | hint text + FAB | ⚠ hint, not a button |
| M9 Items | "Add items to build your packing templates" | hint text + FAB | ⚠ hint, not a button |
| M4 Packing | "No items yet — add one above" | inline quick-add | ✅ (points at the add field) |
| M2 Members | pre-sync roster notice | informational | ✅ (correct — nothing to do) |

**Proposal.** Bring M2/M7/M9 up to the Dashboard's standard: an explicit in-body primary button (Templates/Items also carry a secondary "Import from spreadsheet" → `/import`, per the UI-Spec G-7 example). A FAB is a shortcut, not an empty-state answer — G-7 asks for a *single obvious action in the empty body*.

---

## 10. Cross-cluster edge list

The complete reference of navigational edges beyond primary drill-down, for link/route audits. (Primary drills — list→detail — are omitted as implied.)

| From | To | Trigger |
|---|---|---|
| M1 Dashboard | M5 Item / M4 Trip | task card / deep link (G-4) |
| M2 Trips | M3 Wizard | FAB / empty CTA |
| M16 Series | M3 Wizard (`?series=`) | "New trip in series" |
| M2 Trips | Clone / Members / M14 / YAML export | slide actions (status-gated) |
| M2 title / M9 empty | M15 Import | upload icon / empty CTA |
| M7 / M2 title | M18 Portable Import | import entry |
| M4 sync glyph | Conflict log | `onSyncTap` inside a trip |
| M4 KPI strip | M12 Analytics | tap |
| M4 header | M6 / M14 | status-gated buttons |
| M4 grouping | M11 Containers | `groupBy=container` → edit |
| M12 slice | M4 (grouped) | tap a slice |
| M16 | M12 | trends shortcut (newest trip) |
| Logo (any screen) | M1 Dashboard | universal home (G-9) |
| top-bar gear/avatar | M17 Settings | any screen |
| M17 | M20 Admin | `collaborative && is_instance_admin` |

---

*Derived from `client/src/router/index.ts`, `client/src/App.vue`, `client/src/components/global/*`, `client/src/views/**`, and `UI_Spec_v1.10.md`. Proposal for discussion; all 20 screens are already implemented (server + client).*
