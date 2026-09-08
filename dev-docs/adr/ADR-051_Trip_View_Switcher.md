# ADR-051: The trip's views are a switcher in the page — vs. entries behind the bar's ⋮

**Status:** Accepted (2026-09-08)
**Related:** ADR-050 (the page names itself, the bar's three-glyph budget), ADR-011 (one header bar, the back-target
contract), ADR-046 (one live page per route), UI-Spec G-9, G-12, M4, M6, M11, M12, PRD §3.25, FR-21.17, FR-21.18,
FR-21.21, FR-25.6, E2E-G12-05, E2E-G12-07, E2E-M4-11, E2E-M6-04

**Context.** ADR-050 capped the bar at three glyphs and sent M4's shopping, luggage and analytics entries into the ⋮,
recording the cost in its own consequences: *"§3.25's 'one tap each' for the trip's three views is spent."* The M4
review of 2026-09-07 read what that bought, off a render rather than off the code: the bar spends three of its seven
slots on view options (search, filter, fold), two on controls that belong to no trip (the sync glyph and the gear),
and the five places a reader actually goes — shopping, luggage, analytics, the trip's properties, the next lifecycle
step — sit behind one glyph with no word on it.

Two further facts changed since that decision. FR-21.17 made the page head collapse on downward scroll, so a band
under the name no longer costs a long list its height permanently. And there was never a way **sideways**: from the
shopping list to the luggage meant going back to M4 first, because the ⋮ only ever carried M4's own list.

**Decision Drivers (in priority order):**
1. **Discoverability (§3.25).** The trip's other views must be visible without opening anything. This is the driver
   ADR-050 scored a 2 on and paid with.
2. **The bar keeps its size.** Whatever the answer is, it must not put glyphs back on the bar — the budget is what
   stopped seven from becoming eight.
3. **Told once.** Four screens carry this. A rule each of them has to remember is a rule one of them will forget
   (UX-17, FR-21.18).
4. **Sideways, not just down.** Four views of one trip are peers; the reader moves between them.
5. **Height is not free.** A phone has 844 px, and M4's own head and header line already take 190 of them.

---

## Considered Options

### Option A — A switcher in the page head, rendered by the frame *(recommended, accepted)*

`TripViewNav` renders inside `PageHead`'s body, from `meta.tripView` in the route table: four pills, the current one
marked and inert, the other three one tap. Because it is inside the head's body, it yields with the name on a screen
that collapses its head.

**Pros**
- Every view is named on every one of the four screens, with no screen deciding anything.
- The step from a sibling to a sibling is one tap — the thing the ⋮ never offered at all.
- The bar gains nothing; the ⋮ shrinks to what *changes* the trip.
- Where you are is part of the same control, so the row says both things at once.

**Cons**
- ~35 px of head on four screens, and on M4 it is inside the band that collapses — so it is gone while scrolling,
  and comes back on any upward scroll.
- Four pills fill a 390 px row to within six pixels; the glyphs only fit from 480 px up, so the row has two
  appearances.
- `App.vue` imports a trips component. The frame knew only frame-level components before this.

### Option B — Promote shopping to the bar's third glyph, leave the rest in the ⋮

**Pros**
- No new surface, no height at all; the one entry with a count becomes visible.

**Cons**
- Fails driver 1 for two of the three views and driver 4 entirely.
- It re-opens the argument the budget settled: which single view deserves the slot, answered per screen and per
  reviewer, which is exactly how seven glyphs happened.

### Option C — A tab bar for the trip, replacing the app's own while inside one

**Pros**
- The strongest discoverability, and the shape a phone user reaches for.

**Cons**
- Two conflicting tab bars, or an app-level anchor set that changes meaning inside a trip (G-3, ADR-012's four
  anchors). That is a navigation-model change, not a screen change.
- Costs 56 px at the bottom of every trip screen and never collapses.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| Discoverability §3.25 | 5 | 5 — all four, always visible | 2 — one of three | 5 — same |
| The bar keeps its size | 4 | 5 — untouched | 3 — a glyph returns | 5 — untouched |
| Told once | 4 | 5 — the route table says it | 5 — one page | 2 — a second anchor model |
| Sideways | 3 | 5 — from any of the four | 1 — M4 only | 5 — same |
| Height is not free | 3 | 3 — ~35 px, collapses on M4 | 5 — nothing | 1 — 56 px, permanent |
| **Total** | | **86** | 58 | 71 |

---

## Decision

The trip's four views are a pill row inside the page head, rendered once by the frame from `meta.tripView`. The
current view is marked with `aria-current="page"` and does nothing when tapped; a sibling is `router.push`, and the
packing list — the declared parent of the other three — is `navigate(..., 'back', 'replace')`, the same call the
bar's chevron makes, so returning to it does not mount a second copy (ADR-046). The ⋮ keeps the trip's properties and
the one lifecycle step that is next.

The shopping pill's count is `buyRowCount` from `domain/shoppingView.ts` — **things to buy**, the aggregation
FR-25.6 defines and M6's own segments already used.

## Consequences

**Positive**
- §3.25's directive is met for the first time since ADR-050, and better than before it: four views, not three, and
  reachable from each other.
- M6, M11 and M12 gain a way out that is not the back chevron.
- The count disagreement between the switcher and M6's segments is now impossible to write: one function, two
  readers. It existed in the ⋮ entry and nothing found it, because the two numbers were never on one screen.

**Negative / accepted costs**
- The pills carry their glyphs only from 480 px up. E2E-G12-05, which pins that four destinations did not reach for
  one icon, reads them at the desktop width for that reason.
- On M4 the switcher is inside the collapsing head, so it is not on screen while the reader is scrolled into the
  list. Accepted: it is navigation, and any upward scroll brings it back.
- `App.vue` now imports one trips component.

**Neutral**
- `openTripView` in the e2e helpers is one click again rather than open-menu-then-click, and works from any of the
  four screens.

## Revisit Trigger

A fifth view of a trip. Five pills do not fit a 390 px row even as words, and the answer then is not a smaller pill
but a decision about which of them is a *view* and which is an action — the same question the bar's budget asks.
