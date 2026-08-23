# ADR-012: One router outlet — vs. Ionic's `IonTabs` nested outlet

**Status:** Accepted (2026-08-13)
**Related:** ADR-011 (one header bar), UI-Spec G-1/G-9/G-12, `Navigation_Concept_v1.0.md` §1.2/§7, Addendum §3.25 (M4 full-screen)

**Decision Drivers (in priority order):**

1. **A navigation control must move the screen, not only the URL.** The rail, the tab bar and `‹ back` all changed the address while leaving the previous screen painted — the app looked frozen.
2. **One mental model**, the same driver ADR-011 applied to the header: two outlets are two answers to "where does a page render?".
3. **Deep links and reloads are first-class** (G-4, FR-19.2): they enter without a history, so nothing may depend on how the user got there.

---

## The defect that prompted this

Reported by the maintainer while testing the M4 rebuild: *on the desktop the menu entries sit on the left but do not work; in the mobile view there is no way to navigate between them at all; and the back button at the top left does nothing.*

Measured on the running build, from the packing list:

```
click rail "Trips"  → url /tabs/trips   visible page: m4-header   ← the packing list, still
back from M4        → url /tabs/trips   visible page: m4-header
```

The four anchors lived under `/tabs/` as children of an `IonTabs` layout, which brings its **own** `IonRouterOutlet`; every other route rendered in the root outlet in `App.vue`. Crossing between the two threw `Cannot read properties of undefined (reading 'classList')` mid-transition and left the outgoing page on screen. A session in August had already seen that error, reproduced it on the pre-ADR-011 build, and recorded it as *cosmetic* — it was not: it was this.

The mobile complaint is the same defect wearing a different hat. M4 hides the tab bar by design (§3.25), so with `‹ back` also broken the packing list was a screen with no exit at all.

---

## Considered Options

### Option A — One outlet; the tab bar is plain links *(recommended, accepted)*

Delete `TabsLayout`, flatten the four anchors into top-level routes, and render the bottom bar as a sibling of the single outlet — exactly what `NavRail` already was on the desktop side.

**Pros**

- Cross-outlet transitions cannot happen, because there is one outlet. The error class disappears rather than being handled.
- The rail and the bar become two presentations of one list (`router/anchors.ts`), so they cannot disagree about what is active.
- Matches ADR-011: the app already renders one header for every screen; now it renders one outlet for every screen.

**Cons**

- **Loses Ionic's per-tab navigation stacks** — each tab no longer remembers its own position and back history.
- Loses the tab-switch transition animation; the bar behaves like the rail.
- `/tabs/` stays in the URLs while no longer naming a layout.

### Option B — Move the drill-downs under `/tabs/`

Make `/trips/:id` a child of the tabs layout so everything shares the *nested* outlet.

**Pros:** keeps per-tab stacks; also removes the crossing.
**Cons:** every trip URL changes (`/trips/x` → `/tabs/trips/x`), breaking bookmarks, the notification deep links (G-4) and every `meta.parent`; and M4 would render *inside* a layout whose whole job is a bar it hides.

### Option C — Keep both outlets, work around the transition

Catch the error, or force `router.replace` on every crossing.

**Pros:** smallest diff.
**Cons:** the workaround is invisible and unowned — the same error was already dismissed once as cosmetic. It treats the symptom of having two outlets while keeping two outlets.

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

## Consequences

- Per-tab navigation stacks are gone. The cost is small **because ADR-011 already decided back is declared by the route** (`meta.parent`), not taken from history — nothing in the app read a per-tab stack.
- `TabBar.vue` hides itself on `/trips/:id` and nowhere else (§3.25's full-screen packing). Every other screen keeps it, because a screen you cannot leave is worse than a short list.
- The `classList` transition error is gone, and `navigation.spec.ts` no longer exempts it — an exemption would now only hide the next one.
- `client/src/router/anchors.ts` becomes the single list of anchors, and `isAnchorActive` matches exactly: the old substring test lit *Items* while the user was inside a trip.

## Amendment (2026-08-14): an overlay is an alias, and it replaces

M5 is a sheet *over* the packing list (UI-Spec M5), so its URL has to render
both. As its own route record it mounted a **second copy of the list** behind
the sheet, because with one outlet Ionic keeps a page per matched *path*. The
item path is therefore an **alias** of the trip route, and opening or closing
the sheet uses `replace`, not `push`.

**What it costs:** replacing re-renders the list, so opening an item returns it
to the top. Pushing would preserve the scroll offset and mount a second live
list — two subscriptions, and the list you were reading hidden under its own
twin. The cheaper repair is on the other side: remember M4's offset per trip.
Recorded here rather than left to be rediscovered.

**Second consequence:** `‹ back` now means two things on one screen, so the
route declares which via `meta.overlayParam` — close the overlay, then leave
the screen. On a phone the sheet's backdrop covers the app bar, so ✕ or a swipe
is the way out and back never comes into it; the rule governs the desktop panel
and the browser's own back button.

## Amendment (2026-08-21): the carried cost is paid

The repair the amendment above named — *"remember M4's offset per trip"* — is
built: `client/src/lib/scrollMemory.ts` holds the position across the replace,
M4 writes it on the way into the sheet and puts it back on the way out
(E2E-M4-45). The decision itself is untouched; only its cost is settled.

Two things the implementation found, both worth stating because neither is
obvious from this document:

- **The position is more than a number.** M4's header line occupies 84 px of
  the *scrolled* content, so restoring the offset under a re-opened line shows
  different rows. The collapsed state therefore travels with the offset, and
  is applied during setup so the first frame after the sheet is already right.
- **The list's own re-render reports its way back from the top.** Those scroll
  events, read as the user's, both re-open the header and overwrite the offset
  about to be re-applied — so the screen stops listening to itself between
  opening the sheet and finishing the restore.

## Revisit trigger

If a tab grows a drill-down deep enough that users expect it to remember its own position when they come back to that tab — a per-tab stack is what Ionic's `IonTabs` buys, and at that point the trade flips. Nothing in the current screen set is more than two levels deep.
