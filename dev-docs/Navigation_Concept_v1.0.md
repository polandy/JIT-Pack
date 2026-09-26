# Navigation & Overall Concept: „JIT-Pack" — Information Architecture (v1.1)

**Document Status:** Proposed for Review — consolidated IA draft
**Basis:** UI_Spec_v1.10 (screen inventory M1–M20, global patterns G-1–G-11) + the live client router
(`client/src/router/index.ts`)
**Scope:** *how the app is navigated as a whole* — the single home for that. It does not restate each screen's
internal design (that stays in `UI_Spec_v1.10.md`); it defines the **structure between** screens: the navigation model,
the screen graph, and the routing that realises it. Part I is the model; **Part II** elaborates six structural points
(desktop rail, trip-context entries, back-stack, onboarding, empty states, cross-cluster edges) against the code, each
as *As built* vs *Proposal*. The trip-context entries are distributed and status-gated, not a single toolbar. The app
has **one** header bar whose left slot switches between the logo (tab roots) and `‹ back` + title (everything else),
per [ADR-011](adr/ADR-011_One_Header_Bar.md); §7's back-target rules are a **binding contract**.

> An interactive version of this concept (clickable phone prototype + navigation map) is maintained as a Claude Artifact
and is the visual companion to this text. This markdown file is the authoritative written form; the two are kept in sync
when the IA changes.

---

## 0. The thesis

> **One app, four anchors — everything else is context.**

JIT-Pack has 20 screens. If each were a first-class destination, the app would drown in navigation. Instead the
architecture rests on **four permanent anchors** reachable at all times, with every other screen reached *contextually*
— by drilling into a parent, opening a sheet, or entering a wizard. This keeps the mental model small (the user is
always "in" one of four places) while giving deep features room to exist.

The four anchors map directly to the four nouns the product is built on:

| Anchor | Screen | The noun | Route |
|---|---|---|---|
| Dashboard | M1 | *my tasks right now* | `/tabs/dashboard` |
| Trips | M2 | *a packing effort* | `/tabs/trips` |
| Templates | M7 | *a reusable list* | `/tabs/templates` |
| Items | M9 | *a thing you own* | `/tabs/items` |

Settings (M17) is deliberately **not** a fifth anchor — it lives in the top bar (gear/avatar), because it is chrome, not
content (G-1).

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

- **Mobile (< 900 px):** a bottom tab bar with the four anchors, thumb-reachable. A floating **＋ FAB** offers the create
  action for the active tab. The top bar carries the compact logo mark (left), the sync glyph and the settings
  gear/avatar (right).
- **Desktop (≥ 900 px):** the bottom tab bar is replaced by a persistent **left navigation rail** carrying the same four
  anchors (plus a Settings entry at the rail's foot). The top bar then spans the remaining width and hosts page-level
  primary actions *inline* instead of as a floating FAB.

The breakpoint is the only thing that differs. A user who resizes the window moves between these two presentations of
the identical graph.

### 1.2 One header bar, whose left slot switches

**There is exactly one header bar** (ADR-011). `App.vue` renders it on every screen; no screen brings its own. What
changes by route class is the **left slot**:

| Route class | Left slot | Right group |
|---|---|---|
| The four tab roots | logo (home) | sync glyph · settings/avatar |
| Everything else (drill-down, flow, sheet-ish) | `‹ back` + the page title | sync glyph · settings/avatar |

The right-hand group is **unconditional** — it is what makes the bar global. In particular the sync glyph stays on
drill-downs because inside a trip it is the only route to the conflict log (§6), which is exactly where NFR-4.2a needs
it.

*Why this needed deciding:* seventeen screens had shipped a correct `IonBackButton` that no user could reach.
`.app-content` lacked `position: relative`, so Ionic's absolutely-positioned router outlet resolved against `ion-app`
and covered the viewport; each page's own header landed at `y=0` beneath the global one, and a click on the back button
timed out against the occluding bar. The options and their costs are weighed in ADR-011; the accepted cost is the item
below.

Left → right (G-9, ADR-011):

1. **Logo — on the tab roots only.** A "home" tap-target to M1. It is *not* present on drill-downs: `‹ back` occupies
   that slot there, and the guaranteed way out is the back-target contract of §7, not the logo.
2. **Sync glyph** (G-2) — `synced` / `syncing` / `offline` / `local`. Tapping opens the sync detail; inside a trip it
   also exposes the conflict log (NFR-4.2a). In Local Mode it shows a device glyph and opens storage & backup detail
   instead.
3. **Settings / avatar** (G-1) — the gear (Single-User/Local) or the account avatar (collaborative) opens M17.

**Height & style:** the top bar is deliberately **low** — a **short, single-line title with
no subtitle**, a compact status area, and small logo/gear targets — so it never steals room from content. The **logo is
a lightweight line mark** (a suitcase, tinted with the brand accent), not a filled tile. On **M4 (packing list)** the
bar additionally participates in a **collapsing-header** interaction: scrolling the list down hides the packing
sub-header, and scrolling up restores it (see Addendum §3.25 / UI-Spec M4). This collapse is M4-specific for now and may
extend to other long lists later. Nothing migrates *into* the bar as the header goes: the G-12 cluster fills the bar,
so M4 carries its name in its own header line and registers **no** app-bar title at all (G-9). **Full-screen packing:**
on M4 the **bottom tab bar is hidden entirely** — packing runs full-screen for maximum vertical room. This is coherent
with M4 being a drill-down (§Cross-cluster edges, point 1): the **‹ back** chevron is the return path to Reisen, so the
four root anchors need not be shown. The ＋ FAB drops to the screen foot. Mobile only — the desktop left rail is
unaffected.

### 1.3 "Everything else is context" — the three ways down

Every non-anchor screen is reached by exactly one of three motions:

1. **Drill-down** — tapping a row opens its detail (a trip → M4, a template → M8, an item → M10).
2. **Contextual switcher / sheet** — a screen exposes sibling tools for the thing you're looking at (a trip's view
   switcher → Shopping, Tasks, Notes; the bar's ⋮ → Luggage, Analytics; see §6).
3. **Wizard / flow** — a multi-step create/import task on its own route (M3, M15, M18).

There is no global "hamburger" menu and no nested tab bars. Depth is always the result of a deliberate drill from an
anchor.

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

A trip is **not** a tab. It is opened from the Trip List (M2) and becomes the hub (M4); its views are named by the
switcher under the page head and the bar's ⋮ (§6). Everything here is scoped to one `:tripId`.

| Screen | Route | Role |
|---|---|---|
| **M3** Trip Wizard | `/trips/new` | 4 steps: metadata → travelers → templates → quantities |
| **M4** Packing List | `/trips/:id` | the trip hub — KPIs, grouping, stepper |
| **M5** Item Detail | `/trips/:id?item=:itemId` | assignment, flags, comments, prep todos |
| **M6** Shopping | `/trips/:id/shopping` | buy-before / buy-local lists |
| **M11** Containers | `/trips/:id/containers` | weights, pairing, assignment |
| **M12** Analytics | `/trips/:id/analytics` | weight per dimension + trip totals, series trend |
| **M14** Review | `/trips/:id/review` | post-trip proposals for the template |
| **M25** Tasks | `/trips/:id/tasks` | the trip's tasks, in their two phases (FR-7.7) |
| **M26** Notes | `/trips/:id/notes` | the trip's notes, as threads (FR-7.13) |
| Clone | `/trips/:id/clone` | trip as a starting point (FR-12) |
| Members | `/trips/:id/members` | roles Owner/Admin/Editor (FR-4.5) |
| Conflict Log | `/trips/:id/conflicts` | via the sync indicator inside the trip |

### 2.3 Cluster C — Master data (opened from M7 / M9)

Reusable across all trips — which is *why* they are their own anchors rather than buried inside a trip.

| Screen | Route | Role |
|---|---|---|
| **M8** Template Editor | `/templates/:id` | quick-add, quantity stepper, conditions |
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

The clusters above describe *primary* origin. In practice several screens are reachable from more than one place — these
secondary edges are what make the app feel connected:

- **M1 → M4/M5:** dashboard task cards deep-link straight into a trip item (G-4).
- **M2 → M3:** the FAB / empty state starts the wizard; **M16 → M3** (`?series=`) starts it pre-seeded from a series.
- **Sync glyph (inside a trip) → Conflict Log;** **view switcher → M4/M6/M25/M26;** **⋮ → M11/M12;**
  **M4 archived-trip card → M14.**
- **M2 row hold menu / hero → Properties / Clone / Members / Start / Archive (closing pass → M14) / YAML export.**
- **M7 → M8, M9 → M10** (drill); **M9 empty / M2 title → M15** (import).
- **Logo (everywhere) → M1** (universal home, G-9).

---

## 3. Global patterns (the rules that hold it together)

Navigation is only half of a coherent app. Eleven patterns (G-1–G-11, defined in full in `UI_Spec_v1.10.md` §0) make
every screen feel like the same app. Summarised here because they are *cross-navigation* concerns:

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

- **Single-User Mode** (FR-17): no account → the avatar becomes a plain gear; sharing, delegation, notifications,
  Members (M2/M4), and the Admin entry (M20) are hidden. The four anchors and all trip/master screens remain.
- **Local Mode** (FR-19): no server → the sync glyph shows the `local` state and opens storage/backup; the same
  collaboration UI as Single-User is hidden; import/export flows work fully offline (client-side).
- **Collaborative (OIDC)** (FR-4/FR-23): the full graph, including Members, presence (G-10), notifications, and — for
  instance admins — M20.

No mode adds or removes an *anchor*; modes only reveal or hide leaves and top-bar affordances.

---

# Part II — Detailed elaborations

Part I fixed the skeleton. This part fleshes out each structural point in full, **grounded in the shipping code**
(`client/src/…`). Where the as-built behaviour and the ideal diverge, both are stated: **As built** = what the code does
today; **Proposal** = the recommended target. Nothing here is invented — every "As built" claim traces to a named file.

## 5. Desktop nav-rail

*Source: `components/global/NavRail.vue`, `App.vue`, `views/TabsLayout.vue`.*

**As built.** Below 900 px the bottom tab bar (`TabsLayout.vue`) is shown and the rail is hidden; the breakpoint
lives in the component that owns it (`NavRail.vue`), since a rule on `App.vue`'s `.desktop-nav` loses to the rail's own
scoped `.nav-rail`. At ≥ 900 px
`App.vue`'s media query flips `.desktop-nav` to `display:flex` and Ionic hides the bottom tabs. The rail is a fixed **80
px** column pinned left of the scrolling content area (`.app-body` is a flexbox: rail +
`main.app-content{flex:1;overflow:auto}`), sitting *below* the full-width header (header height 56 px). It carries the
four anchors only — Dashboard, Trips, Templates, Items — each an icon-over-label link. Active state = primary tint
background + primary text, matched by `route.path.includes('/tabs/{match}')`; hover = light surface.

**Gaps & proposals.**

| # | Observation (as built) | Proposal |
|---|---|---|
| 5a | **The rail has no Settings entry** — Settings is reached only via the header gear, in both form factors. The interactive concept sketched a Settings entry at the rail foot; the code does not have one. | Keep Settings in the header (consistent across breakpoints) **or** add a foot-of-rail Settings link for desktop parity. Pick one and make the concept + code agree. Recommendation: add it to the rail foot — desktop has the vertical room and it mirrors the mobile "always-present gear". |
| 5b | **Deep routes lose the highlight.** Inside a trip (`/trips/:id`) or a master editor (`/templates/:id`) the path is not `/tabs/*`, so `isActive()` matches nothing and **no rail item is lit** — the user loses their "you are here" anchor on desktop. | Broaden the active match: light **Trips** for any `/trips/*`, **Templates** for `/templates/*`, **Items** for `/items/*` and `/series/*`. The rail should reflect the *cluster* you're in, not only the exact tab route. |
| 5c | Rail is fixed-width, label-always-visible. | Fine at 80 px; no collapse needed. Revisit only if a fifth destination ever appears (it should not — that breaks the four-anchor thesis). |

**Inline page actions (G-9).** On desktop the FAB is not used; each page mounts its primary actions in its own
`IonToolbar`/`IonButtons`. This is already the case (e.g. M4's header buttons). The concept's rule stands: **page-level
primary actions render inline in the top bar on desktop, as a floating FAB on mobile.**

---

## 6. Trip-context entry points

*Source: `lib/tripViews.ts` (the six views), `components/trips/TripViewNav.vue` (the switcher),
`components/global/AppHeader.vue` (the ⋮), `views/trips/PackingListPage.vue` (M4), `App.vue` (`onSyncTap`),
`views/trips/TripListPage.vue` and `domain/trips.ts` (`tripRowActions`, M2's row menu and hero).*

There is **no single trip toolbar**. The trip-scoped screens are reached from a small number of distinct places, each
holding one kind of entry:

| Entry | Lives on | Gating (as built) | Target |
|---|---|---|---|
| Packing, Shopping, Tasks, Notes | view switcher under the page head (FR-21.21) | always; counts as badges | M4 / M6 / M25 / M26 |
| Luggage (*Gepäck*), Analytics (*Auswertung*) | the app bar's **⋮**, heading the sheet (G-12) | packing's views only (M4, M11, M12) | M11 / M12 |
| *Packen abschliessen* (FR-5.10) | M4's ⋮ | trip not archived, packing not closed | closes the packing |
| *Namen aus dem Inventar* (FR-27.16) | M4's ⋮ | renames to take over exist | rename sheet |
| Presence facepile (G-10) | M4's trip head line | `presenceUsers.length > 1` | presence sheet |
| Review (M14) | M4's archived-trip card | `trip.status === 'archived'` | `/trips/:id/review` |
| Item detail (M5) | M4 list row | always | `/trips/:id?item=:itemId` (ADR-046) |
| Conflict log | **top-bar sync glyph** | inside a trip, Server Mode (`onSyncTap`) | `/trips/:id/conflicts` |
| Properties, Start, *Reise abschliessen* | **M2** row hold menu and hero | lifecycle step (`nextLifecycleStep`) | edit / status / M4 closing pass → M14 |
| Members | **M2** row hold menu | OIDC session (`collaborative`, G-8) | `/trips/:id/members` |
| Clone | **M2** row hold menu | archived trips (also M16) | `/trips/:id/clone` |

**Reading of this.** Each place answers one question. The switcher names the views a trip is *worked* in; the ⋮ holds
what belongs to the context it sits in and nothing else (G-12, ADR-051 amendment 2) — on packing's views that is the
two views read off the packing list plus packing's own steps, and M6/M25 have no ⋮ at all. What changes the whole trip
(its properties, starting it, archiving it) is M2's alone, so M4 does not repeat it. The trip's status is the gate for
those lifecycle entries; M14 is reached from the archived trip's card on M4 and from the end of the closing pass.

**Rules that hold the map together:**

- 6a. **Words where a glyph says nothing.** The bar renders at most three glyphs from a page's list; everything else is
  a **word** in the ⋮'s action sheet (G-12, ADR-050). M4's *Suchen*, *Filter* and *Zuklappen* stay glyphs because they
  are tapped while packing. The ⋮ is scoped to its context: it never carries the trip's lifecycle, which is M2's.
- 6b. **Luggage without the grouping detour.** M11 is a ⋮ entry on every packing view, so it is reachable whatever
  `groupBy` is set to; grouping by container is a way of *reading* the list, not the door to M11.
- 6c. **Badges** are consistent: a count badge on a switcher glyph (Shopping's things to buy, open Tasks, Notes'
  unseen entries) and on the prep/KPI counters; presence uses the facepile, never a number badge.
- 6d. **Mode-gating is one rule:** Members and presence appear only with an OIDC session (`collaborative`); in
  Single-User/Local they vanish with no gap (G-8).

---

## 7. Deep-link & back-stack semantics

*Source: `router/index.ts` (`createWebHistory`), `App.vue` (`onSyncTap`, `onAuthExpired`), `notifications/format.ts`
(`notificationRoute`).*

**As built.** History is the browser stack (`createWebHistory`). Back = the platform back gesture / button. Deep links
exist for notifications (G-4 → `/trips/:id?item=:itemId&comment=…`) and the sync-glyph → conflict log.

**The three problem cases and the rule for each.**

1. **Wizard/flow completion.** M3 (`/trips/new`) is `push`ed, so after creating a trip the browser back returns *into
   the finished wizard* — wrong. **Rule:** completing a create/import flow (M3, M15, M18, Clone) must `router.replace`
   to the result (the new trip/M4), not `push`. Back then skips the consumed wizard.
2. **Cold-start deep link.** A notification opened from a killed app lands on M5 with a one-entry history — "back" has
   nowhere sane to go. **Rule (ADR-011):** the logo is not on screen here, so it cannot be the escape.
   The declared parent is: `‹ back` routes to the parent trip (M4) even when history is empty, and from there to M2. The
   contract below is what guarantees it.
3. **Modal-ish sub-screens** (Conflict log, presence sheet). **Rule:** these `push` and rely on back to dismiss; they
   must never be a dead end — each has a visible close/back to its origin trip.
4. **Browser back with a route-driven overlay open.** M5's sheet *replaces* the trip's history entry (deliberately —
   the sheet is a state of the screen, and one screen keeps one entry; ADR-046), so an unguarded history pop skips M4
   and lands on the trip list, two screens back. **Rule:** a pop leaving a
   route whose `meta.overlayQuery` is set closes the overlay instead — the same meaning the chevron already gives it.
   Mechanically (`router/overlayBackGuard.ts`): the pop is allowed to *complete* and the overlay parent is then pushed.
   Not intercepted in `beforeEach`, because Ionic reads the pending pop direction when a navigation confirms, and an
   aborted pop leaves that info stale to poison the corrective navigation — the wrong screen renders under the right
   URL. Letting both confirm keeps Ionic coherent and rebuilds the natural list → trip chain, so the *next* back lands
   on the list. Known, accepted gap: a back arriving **during** the sheet's enter animation still races Ionic's
   transition queue (E2E-M5-13 waits for the presentation to settle for exactly this reason); a human back needs a
   visible sheet first, so the window is not reachable by intent.

**The back-target contract (binding, ADR-011).** With no logo on drill-downs, `‹ back` is *the* way out, so
every non-root route must know where "out" is. Each route declares its parent; the header derives the back target from
it rather than from history alone, which is what makes a cold-start deep link survivable.

| Route class | Back target | Rule |
|---|---|---|
| Tab roots | none — the platform handles it (exit / OS back) | the bar shows the logo, not `‹` |
| Drill-downs (M4, M5, M8, M10, containers, analytics, …) | the declared parent, *not* whatever is on the history stack | a deep-linked child still goes to its parent trip |
| Flows (M3, M15, M18, Clone) | the origin the flow was entered from | completing the flow `replace`s, so back never re-enters a consumed wizard |
| Modal-ish (conflict log, presence) | the trip they were opened from | never a dead end |
| **Global actions & multi-entry flows** (Settings, M15, M18, admin) | the path they were entered from, with the declared parent as the fallback | offered from every screen, so no single parent is true |

The declaration lives with the route in `router/index.ts` (a `meta.parent`), so adding a screen without a back target is
a visible omission rather than a silent one.

**The fifth class, and why it exists** (ADR-011 amendment). The gear is offered on *every* screen (G-1, deliberately —
it is what keeps the conflict log reachable from inside a trip), so no single static parent is true for Settings: with
`/tabs/settings` declaring `/tabs/dashboard`, the gear tapped inside a trip and then `‹` would land on the dashboard.
The flows row's promise — "the origin the flow was entered from" — needs a mechanism for the same reason; without one,
M18 entered from the trip list returns to Settings.

The mechanism (`router/originStamp.ts`): a route in this class carries `meta.acceptsFrom`, and the router stamps the
path it was entered from into `?from=` on the way in — a redirect that replaces rather than appends. `backTarget()`
prefers that origin and falls back to `meta.parent` when it is absent or does not validate as an internal path.
Validation happens twice, in the two places that can each see half of it: `backTarget()` — pure, no router — rejects
anything that is not a path inside this app, and the guard additionally rejects one that names no route of this app,
replacing it with the real origin rather than leaving `‹` pointing at a screen that renders nothing.

Three properties worth naming, because each is load-bearing:

- **The router stamps it, not the links.** The gear alone is one call site on every screen, and the two import flows are
  already entered from five places; a per-link origin works until the sixth link forgets.
- **The origin is stored encoded**, so a chain unwinds hop by hop: trip → gear → admin → `‹` → Settings → `‹` → trip.
  Unencoded, the nested origin's own `?`/`&` would end the query value it lives in.
- **A cold-start deep link is unchanged.** It carries no origin, so the declared parent answers — which is the whole
  reason ADR-011 decoupled back from history in the first place. The class *narrows* history-independence rather than
  reverting it, and only for routes that declare it: a drill-down ignores `?from=` entirely, so a crafted link cannot
  redirect one.

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

Local Mode never touches auth. Single-User servers answer `/auth/config` with 501, so the client silently proceeds —
this is the "log in by opening the app" path the local Docker stack uses.

**Re-entry after a mode switch (FR-19.5).** There is deliberately **no toggle** between Local and Server. Switching
modes goes through the export/import path (portable YAML): export from the old mode, re-run M19, import via M18. Part I
§4 states this; the onboarding doc is where the *steps* live.

**Proposal.** Two refinements: (8a) M19 should state, per option, what it commits to and how to leave it (sets
expectation for the no-toggle rule); (8b) the `auth/config` probe should show a brief "connecting…" state rather than a
blank frame, so a slow server doesn't look like a hang.

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

**Proposal.** Bring M2/M7/M9 up to the Dashboard's standard: an explicit in-body primary button (Templates/Items also
carry a secondary "Import from spreadsheet" → `/import`, per the UI-Spec G-7 example). A FAB is a shortcut, not an
empty-state answer — G-7 asks for a *single obvious action in the empty body*.

---

## 10. Cross-cluster edge list

The complete reference of navigational edges beyond primary drill-down, for link/route audits. (Primary drills —
list→detail — are omitted as implied.)

| From | To | Trigger |
|---|---|---|
| M1 Dashboard | M5 Item / M4 Trip | task card / deep link (G-4) |
| M2 Trips | M3 Wizard | FAB / empty CTA |
| M16 Series | M3 Wizard (`?series=`) | "New trip in series" |
| M2 Trips | Properties / Clone / Members / M4 closing pass → M14 / YAML export | row hold menu and hero (status-gated) |
| M2 title / M9 empty | M15 Import | upload icon / empty CTA |
| M7 / M2 title | M18 Portable Import | import entry |
| M4 sync glyph | Conflict log | `onSyncTap` inside a trip |
| any trip view | M4 / M6 / M25 / M26 | view switcher under the page head (FR-21.21) |
| M4 / M11 / M12 app bar | M11 Luggage / M12 Analytics | ⋮ entries (G-12) |
| M4 archived-trip card | M14 Review | *archived* status |
| M12 slice | M4 (grouped) | pick slices, then *In der Packliste zeigen* |
| M16 | M12 | trends shortcut (newest trip) |
| Logo (any screen) | M1 Dashboard | universal home (G-9) |
| top-bar gear/avatar | M17 Settings | any screen |
| M17 | M20 Admin | `collaborative && is_instance_admin` |

---

*Derived from `client/src/router/index.ts`, `client/src/App.vue`, `client/src/components/global/*`,
`client/src/views/**`, and `UI_Spec_v1.10.md`. Proposal for discussion; all 20 screens are already implemented (server +
client).*
