# ADR-012: One router outlet — vs. Ionic's `IonTabs` nested outlet

**Status:** Accepted
**Related:** ADR-011 (one header bar), UI-Spec G-1/G-9/G-12, `Navigation_Concept_v1.0.md` §1.2/§7, Addendum §3.25 (M4
full-screen)

**Decision Drivers (in priority order):**

1. **A navigation control must move the screen, not only the URL.** The rail, the tab bar and `‹ back` all changed the
   address while leaving the previous screen painted — the app looked frozen.
2. **One mental model**, the same driver ADR-011 applied to the header: two outlets are two answers to "where does a
   page render?".
3. **Deep links and reloads are first-class** (G-4, FR-19.2): they enter without a history, so nothing may depend on how
   the user got there.

---

## The defect that prompted this

Reported by the maintainer while testing the M4 rebuild: *on the desktop the menu entries sit on the left but do not
work; in the mobile view there is no way to navigate between them at all; and the back button at the top left does
nothing.*

Measured on the running build, from the packing list:

```
click rail "Trips"  → url /tabs/trips   visible page: m4-header   ← the packing list, still
back from M4        → url /tabs/trips   visible page: m4-header
```

The four anchors lived under `/tabs/` as children of an `IonTabs` layout, which brings its **own** `IonRouterOutlet`;
every other route rendered in the root outlet in `App.vue`. Crossing between the two threw `Cannot read properties of
undefined (reading 'classList')` mid-transition and left the outgoing page on screen. A session in August had already
seen that error, reproduced it on the pre-ADR-011 build, and recorded it as *cosmetic* — it was not: it was this.

The mobile complaint is the same defect wearing a different hat. M4 hides the tab bar by design (§3.25), so with `‹
back` also broken the packing list was a screen with no exit at all.

---

## Considered Options

### Option A — One outlet; the tab bar is plain links *(recommended, accepted)*

Delete `TabsLayout`, flatten the four anchors into top-level routes, and render the bottom bar as a sibling of the
single outlet — exactly what `NavRail` already was on the desktop side.

**Pros**

- Cross-outlet transitions cannot happen, because there is one outlet. The error class disappears rather than being
  handled.
- The rail and the bar become two presentations of one list (`router/anchors.ts`), so they cannot disagree about what is
  active.
- Matches ADR-011: the app already renders one header for every screen; now it renders one outlet for every screen.

**Cons**

- **Loses Ionic's per-tab navigation stacks** — each tab no longer remembers its own position and back history.
- Loses the tab-switch transition animation; the bar behaves like the rail.
- `/tabs/` stays in the URLs while no longer naming a layout.

### Option B — Move the drill-downs under `/tabs/`

Make `/trips/:id` a child of the tabs layout so everything shares the *nested* outlet.

**Pros:** keeps per-tab stacks; also removes the crossing.
**Cons:** every trip URL changes (`/trips/x` → `/tabs/trips/x`), breaking bookmarks, the notification deep links (G-4)
and every `meta.parent`; and M4 would render *inside* a layout whose whole job is a bar it hides.

### Option C — Keep both outlets, work around the transition

Catch the error, or force `router.replace` on every crossing.

**Pros:** smallest diff.
**Cons:** the workaround is invisible and unowned — the same error was already dismissed once as cosmetic. It treats the
symptom of having two outlets while keeping two outlets.

---

## Decision Matrix

| Criterion (weight) | A: one outlet | B: nest everything | C: work around |
|---|---|---|---|
| Removes the defect class (×3) | 3 — cannot occur | 3 — cannot occur | 1 — handled, not removed |
| URL / deep-link stability (×2) | 3 — unchanged | 0 — every trip URL moves | 3 — unchanged |
| One mental model (×2) | 3 | 2 — M4 inside a tab layout | 1 — two outlets, plus a rule |
| Keeps per-tab stacks (×1) | 0 | 3 | 3 |
| **Weighted total** | **24** | 19 | 16 |

---

## Decision

There is one `IonRouterOutlet`, in `App.vue`. `TabsLayout` is gone, the four anchors are top-level routes, and the
bottom bar is a sibling of the outlet, as `NavRail` is on the desktop side; both render the one list in
`router/anchors.ts`.

**An anchor is a root navigation, not a push.** The anchors are siblings with no back edge between them, so a
`<router-link>` push stacks a page on every switch that nothing ever pops. It shows only when a switch is interrupted:
Ionic transitions a push over several frames, and tapping the next anchor before it finishes leaves both pages live,
the old one painted over the one the URL names, catching every tap. An anchor therefore calls
`useIonRouter().navigate(href, 'root', 'replace')` in both presentations. The element stays a real `<a>` with its
`href`, so a middle click still opens a tab and assistive technology still reads a link; only the default action is
taken over, and modified clicks are left to the browser. The rule is about the destination, not the control: landing
on a tab root is a root navigation wherever it happens, so M15's and M18's commits navigate the same way.

**An overlay is a state of the screen beneath it, and it replaces.** M5's sheet sits over the packing list, so its URL
must render both — with one outlet, Ionic keeps one page per matched pathname, and a route of the overlay's own would
mount a second live list behind the sheet. The overlay is a query on its screen's route (ADR-046: `?item=` on the
trip's route), opened and closed with `replace`, and the route declares `meta.overlayQuery` so that `‹ back` closes the
overlay before it leaves the screen. On a phone the sheet's backdrop covers the app bar, so ✕ or a swipe is the way out
and the rule governs the desktop panel and the browser's own back button (`router/overlayBackGuard.ts`).

## Consequences

- Per-tab navigation stacks are gone. The cost is small **because ADR-011 already decided back is declared by the
  route** (`meta.parent`), not taken from history — nothing in the app read a per-tab stack.
- `TabBar.vue` hides itself on `/trips/:id` and nowhere else (§3.25's full-screen packing). Every other screen keeps it,
  because a screen you cannot leave is worse than a short list.
- The `classList` transition error is gone, and `navigation.spec.ts` no longer exempts it — an exemption would now only
  hide the next one.
- `client/src/router/anchors.ts` is the single list of anchors, and `isAnchorActive` matches exactly — a substring test
  lights *Items* while the user is inside a trip.
- A root navigation does not remember a position either, so the per-tab cost above is the whole cost.
- A replaced entry is gone from history, so a browser pop with an overlay open would skip the screen beneath it;
  `overlayBackGuard` gives the browser's back the chevron's meaning instead.

## Revisit trigger

If a tab grows a drill-down deep enough that users expect it to remember its own position when they come back to that
tab — a per-tab stack is what Ionic's `IonTabs` buys, and at that point the trade flips. Nothing in the current screen
set is more than two levels deep.
