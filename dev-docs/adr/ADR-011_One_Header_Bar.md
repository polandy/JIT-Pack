# ADR-011: One header bar whose left slot switches — vs. a global bar plus per-screen headers

**Status:** Accepted
**Related:** UI-Spec G-1/G-2/G-9/G-12, `Navigation_Concept_v1.0.md` §1.2/§1.3/§7, FR-19.3, NFR-4.2a (conflict log
reachability)

**Decision Drivers (in priority order):**

1. **A drill-down must offer a visible way back.** Seventeen screens shipped an `IonBackButton` that no user could see
   or tap — the defect this ADR answers.
2. **Vertical room is scarce** (Addendum §3.25: the bar is deliberately low so it never steals space from content; M4
   goes as far as hiding the tab bar to gain height).
3. **Global status must stay reachable where it is needed.** The sync glyph (G-2) is the *only* route to the conflict
   log while inside a trip (Navigation_Concept §6) — precisely a drill-down.
4. **One mental model.** G-9 describes one top bar; two stacked bars are a second model nobody chose.

---

## The defect that prompted this

`App.vue` renders the global `AppHeader`, then `.app-body` containing `ion-router-outlet`. `.app-content` has no
`position: relative`, so Ionic's absolutely-positioned outlet resolves against `ion-app` instead and covers the whole
viewport. Measured on the running instance:

```
.app-body      0,56  430x844      correct, below the header
.app-content   position: static   ← the cause
ion-page       0,0   430x900      escapes, covers the full window
```

Every drill-down's own `ion-header` therefore lands at `y=0`, underneath the global one. A `click()` on the back button
times out: it is occluded, not merely invisible. The page titles were never visible either.

Note what this is *not*: adding `position: relative` alone would fix the escape and leave two stacked bars, 112 px of
chrome. The layout bug forced the architectural question rather than being the whole of it.

---

## Considered Options

### Option A — One bar, left slot switches *(recommended, accepted)*

`AppHeader` renders in `App.vue` for every screen and keeps its right-hand group — sync glyph (G-2) and settings/avatar
(G-1) — everywhere. Its left slot is what changes: the logo on the four tab roots, `‹ back` plus the page title on a
drill-down. The seventeen per-screen `IonHeader` blocks are deleted; a screen contributes its title and any page-level
actions through the router meta and a small slot API.

**Pros**

- One bar, 56 px, on every screen; the drill-downs gain a back affordance without losing anything on the right.
- The conflict log stays reachable inside a trip, which is the only place it exists (driver 3).
- Deletes seventeen duplicated header blocks; the back-target rule lives in one place instead of being restated per
  screen.
- M4's collapsing header (§1.2 — trip name and presence migrate *into the top bar* on scroll) becomes unambiguous: there
  is only one bar to migrate into. **Overtaken 2026-08-19**, without touching this ADR's decision: the migration was
  never built, and M4's G-12 cluster left the bar 54 px for a title. M4 now names itself in its own header line and
  registers no app-bar title — the one bar stays one bar, and G-9 gained the case of a screen with no title in it.

**Cons**

- **The logo is not visible on drill-downs.** G-9 currently promises it as "the app's one universal home action, from
  anywhere, including inside a trip, template, or wizard", and §7's cold-start case leans on exactly that. G-9 must be
  rewritten and the escape re-guaranteed by the back-target contract instead.
- Touches all seventeen screens at once — a wide, if mechanical, diff.
- Page-level actions must move to a slot/meta API rather than each screen composing its own toolbar freely.

### Option B — Hide the global bar on drill-downs

`App.vue` renders `AppHeader` only on the four tab roots; the seventeen screens keep the headers they already have.

**Pros**

- Smallest change: one `v-if`, no screen touched.
- Matches the stock Ionic pattern where each page owns its toolbar.

**Cons**

- **Drops the sync glyph and settings on every drill-down**, taking the only path to the conflict log with it (driver
  3). NFR-4.2a's surfacing would need a new home.
- G-2 stops being a *global* status indicator, contradicting its own definition.
- Leaves seventeen header blocks to keep consistent by hand — the back-target contract cannot be enforced centrally.

### Option C — Stack the page header below the global one

Add `position: relative` to `.app-content` and nothing else.

**Pros**

- One line. Everything keeps working; the back button appears.

**Cons**

- 112 px of chrome on every drill-down, against the explicit "the bar is deliberately low" decision (driver 2) — on M4,
  which hides the tab bar to buy height, this gives the height straight back.
- Two bars is a second navigation model, chosen by accident rather than designed.

---

## Decision Matrix

| Driver | Weight | A — one bar, switching slot | B — hide global bar | C — stack both |
|---|---|---|---|---|
| Visible way back | 5 | 5 — back in a bar that is always painted | 5 — page header becomes visible | 5 — page header becomes visible |
| Vertical room | 4 | 5 — stays at 56 px | 5 — stays at 56 px | 1 — 112 px, worst on M4 |
| Global status reachable | 5 | 5 — sync and settings on every screen | 1 — both lost on drill-downs, conflict log stranded | 5 — both kept |
| One mental model | 3 | 5 — a single bar, one rule | 3 — two bar species by route class | 1 — two bars at once |
| Cost to build | 2 | 2 — seventeen screens touched | 5 — one `v-if` | 5 — one CSS line |
| **Total** | | **84** | **59** | **60** |

---

## Decision

There is exactly one header bar, rendered by `App.vue` on every screen. Its right-hand group — sync glyph and
settings/avatar — is unconditional. Its left slot carries the logo on the four tab roots and `‹ back` plus the page
title on every other screen. The seventeen per-screen `IonHeader` blocks are removed, and `.app-content` gets the
`position: relative` it was missing so the outlet stops escaping its container.

Because the logo is no longer present on drill-downs, **G-9's "home from anywhere" promise moves to the back-target
contract**: every non-root route declares a parent, so `‹ back` always leads somewhere real, and a cold-start deep link
synthesises its parent chain rather than relying on the logo being on screen.

## Consequences

**Positive**

- The back affordance is visible and reachable on all seventeen drill-downs — the defect is closed by construction, not
  screen by screen.
- The conflict log keeps its only entry point inside a trip.
- One place owns the bar, so the back-target contract is enforceable rather than a convention.

**Negative / accepted costs**

- G-9 is rewritten: the logo is a home affordance *on the tab roots*, not from anywhere. Reaching the dashboard from
  three levels deep is now several taps, or the tab bar / rail.
- Seventeen screens change in one PR. Mechanical, but wide, and each needs its title and actions re-homed.
- Screens lose the freedom to compose an arbitrary toolbar; page-level actions go through a defined slot. M4's G-12
  cluster is the demanding case and sets the shape of that API.

**Neutral**

- Desktop is unaffected in structure: the rail keeps the four anchors, and `‹ back` appears in the same slot at both
  breakpoints.
- The Local/Single-User gating of the right-hand group is unchanged (G-8): what is hidden today stays hidden.

## Amendment (2026-08-14): the "small slot API" is a registry, not a `<Teleport>`

The first implementation teleported a page's buttons into a
`<span id="header-actions">` inside the header's `ion-buttons`. Ionic's web
components relocate slotted DOM after mount, so on a cold boot straight into a
drill-down Vue patched a teleported subtree whose container had moved and threw
`Cannot read properties of null (reading 'emitsOptions')` mid-patch — which
aborts the render. The screen came up empty, and it was reported as lost data.

Pages now **describe** their actions (`useHeaderActions`:
`{ id, icon, label, onClick, badge, active }`) and the header renders its own
DOM from that, keyed by route path exactly as `useHeaderTitle` already was. The
decision of this ADR is unchanged; only the mechanism behind "a small slot API"
is. It settled a second defect on the way: actions belong to a path, so one
screen's search icon can no longer linger in the bar of the next.

## Amendment (2026-08-21): a screen reachable from anywhere carries its origin

This ADR replaced the history stack with a **declared** back target, because a
cold-start deep link has no history to read. The declaration is one static
`meta.parent` per route, and for a drill-down that is exactly right: M5's parent
is its trip whichever way the user arrived.

It is wrong for a screen that can be entered from anywhere. The owner hit it in
the obvious place: inside a trip, tap the gear, tap `‹`, land on the dashboard.
The gear is unconditional on every screen — that is a decision of this ADR, and
it is what keeps the conflict log reachable from inside a trip — so
`/tabs/settings` has no one true parent to declare. Two neighbours had the same
shape: `/portable-import` is entered from M2, M7 and Settings, `/import` from M2
and M9. And Navigation_Concept §7's *flows* row promised "the origin the flow was
entered from" while nothing in the router implemented it — the promise was four
words in a table with no mechanism behind them.

**What was weighed.**

| | A — the route carries its origin | B — Settings becomes modal-ish |
|---|---|---|
| Back is correct from anywhere | yes, for every route that declares the class | yes, by construction — a sheet returns to what is under it |
| Gives the flows row its missing mechanism | yes, the same one | no — M15/M18 are not sheets, so they stay broken |
| Cold-start deep link | unchanged: no origin, so `meta.parent` answers | a sheet has nothing under it on a cold start |
| Blast radius | one guard, one branch in `backTarget`, five route entries | M17's sub-routes (admin, file import, gallery) all declare `/tabs/settings` as parent and would need re-homing |
| Cost | the origin is visible in the URL, and it is attacker-controlled input | a large screen inside a sheet on a phone |

**A, accepted.** B is the cleaner story for Settings alone and does nothing for
the two import flows, which is half the defect.

**The cost, stated plainly.** `?from=` is now part of some URLs and reaches the
app from outside, so it is validated rather than trusted: only a path inside this
app is accepted (`//host` and a backslash both look internal and are not), a path
that matches no route is replaced rather than kept — `‹` would otherwise land on
a screen that renders nothing — and a route that does not declare
`meta.acceptsFrom` ignores the parameter entirely, so no drill-down can be
redirected by a crafted link. The origin is stored encoded
so a chain of origins unwinds hop by hop.

**What did not change.** Back is still declared rather than derived from history.
An entry with no origin — a notification deep link, a pasted URL — falls back to
`meta.parent` exactly as before, and E2E-G1-05 is the case that holds that half
in place.

Mechanism: `router/originStamp.ts` (the stamp, applied by the router rather than
by each link, because the next link would forget) and `router/backTarget.ts`.
Table: Navigation_Concept §7.

## Revisit Trigger

A screen appears that genuinely cannot express its chrome through the slot API — concretely, one needing a second
toolbar row that is not a filter/chip row, or a bar taller than 56 px. At that point the single-bar rule is costing more
than the duplication it removed.
