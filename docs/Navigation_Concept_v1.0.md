# Navigation & Overall Concept: „JIT-Pack" — Information Architecture (v1.0)

**Document Status:** Proposed for Review — first consolidated IA draft
**Basis:** UI_Spec_v1.10 (screen inventory M1–M20, global patterns G-1–G-11) + the live client router (`client/src/router/index.ts`)
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
| **M13** Repack | `/trips/:id/repack` | return-journey mode (FR-11) |
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
- **M4 sync glyph → Conflict Log;** **M4 toolbar → M6/M11/M12/M13/M14/Members.**
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

## 5. Open points to flesh out

This v1.0 fixes the skeleton. The following are the detailed elaborations to work through next (each will expand into its own subsection or companion note):

1. **Desktop nav-rail state** — exact rail contents, collapsed/expanded behaviour, where inline page actions live per screen.
2. **Trip-context toolbar** — canonical order, overflow behaviour, which entries are mode-gated, badge rules.
3. **Deep-link & back-stack semantics** — what "back" means across drill-downs, wizards, and deep links; history behaviour on `createWebHistory`.
4. **Onboarding path** — the exact first-launch sequence M19 → (Login?) → M1, and re-entry after mode switch (FR-19.5).
5. **Empty-state matrix** (G-7) — the single primary action per list screen.
6. **Cross-cluster edges** — a complete edge list (§2.5 is the seed) as a reference for link/route audits.

---

*Derived from `client/src/router/index.ts` and `UI_Spec_v1.10.md`. Proposal for discussion; all 20 screens are already implemented (server + client).*
