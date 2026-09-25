# ADR-051: The trip's views are a switcher in the page — vs. entries behind the bar's ⋮

**Status:** Accepted (2026-09-08); amended 2026-09-20 and 2026-09-25
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
   (UX-17, FR-21.18 — superseded by FR-21.26, which this decision is what triggered).
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

**Amendment 1 (2026-09-20) — two of the four earn a pill; the other two are words in the ⋮ again.** The row
renders **the packing list and the shopping list**, plus whichever view is being looked at when it is neither of
them. The luggage and the analytics are entries in the bar's ⋮, which `AppHeader` fills from `meta.tripView` — so
they still render on all four screens, and driver 4 still holds: shopping → luggage is one tap plus the menu, not a
detour through M4.

The judgement is the owner's, made off a render on 2026-09-20: *the luggage is not important enough to stand in the
badges at the top of the packing list, and neither is the analytics.* Four options were mocked against the running
palette — the two-pill row with the rest in the ⋮, a third "Mehr" pill opening a popover, the luggage hung off the
weight the header line already shows, and two cards at the foot of the list — and this is the one chosen.

What changes about the decision, and what does not:

- **Driver 1 is re-weighted rather than re-scored.** ADR-051 read "discoverability" as *every view visible*. The
  render says what that costs: four pills fill a 390 px row to within six pixels, so a view read once a trip is
  exactly as loud as the list being packed, and a row that is equally loud everywhere says nothing about where the
  work is. Two pills say it.
- **The row still answers "where am I".** A screen whose view has no pill would otherwise mark nothing as current,
  which is half of what the switcher is for — so the current view joins the row while you stand in it. That makes
  the row two or three pills wide, never four.
- **One table, two shapes.** `lib/tripViews.ts` now holds each view's word, glyph and path; the switcher and the
  bar's ⋮ both render from it, and a menu entry keeps the id its pill had. Written twice, a view could have been
  renamed in one shape and not the other, and nothing would have failed.
- **What the ⋮ keeps** is still what *changes* the trip — properties, the next lifecycle step — but the sheet now
  leads with where you can go and follows with what you can do. A lifecycle step in the middle of a list of places
  reads as neither.

Accepted cost: the luggage and the analytics are two taps rather than one, and behind an unlabelled glyph — the
exact shape ADR-050 was criticised for. It is affordable here and was not there because it is now **two** entries
rather than five, and because the two it holds are the two nobody reaches while packing.

**Amendment 2 (2026-09-25) — a ⋮ holds its own context; the luggage and the analytics are packing's.** The owner's
call, from using the app: the three-dot menu on a screen should act on *that* screen's area — packing, shopping,
tasks — and may not be needed at all in some. So the frame offers *Gepäck* and *Auswertung* only on packing's views
(M4, M11, M12), and **M6 and M25 have no ⋮**; `tripViewMenu` returns nothing there. In the same move M4's ⋮ gave up
what changes the whole trip — *Reise-Eigenschaften* and the lifecycle step — which now live on M2 only, the trip's
row menu and its hero; M2's *Reise abschliessen* opens M4 in FR-9.3's closing pass (`?closing=1`) rather than
archiving past it.

What this reverses, stated: **driver 4's sideways step** — shopping → luggage in one tap plus the menu — which this
ADR bought and Amendment 1 kept. From the shopping list or the tasks the luggage is now the packing pill, then the
⋮: one screen further. Accepted, because the alternative the owner rejected is the one this ADR's Context started
from — a menu whose entries have nothing to do with the screen it opens on reads as a junk drawer, and every entry
in it costs the reader a thought about whether it applies here. The E2E-G12-07 walk now goes through M4.

## Consequences

**Positive**
- §3.25's directive is met for the first time since ADR-050, and better than before it: four views, not three, and
  reachable from each other.
- M6, M11 and M12 gain a way out that is not the back chevron.
- The count disagreement between the switcher and M6's segments is now impossible to write: one function, two
  readers. It existed in the ⋮ entry and nothing found it, because the two numbers were never on one screen.

**Negative / accepted costs**
- The pills carry their glyphs only from 480 px up. E2E-G12-05, which pins that four destinations did not reach for
  one icon, reads them at the desktop width for that reason — and since Amendment 1 it reads two of the four inside
  the ⋮, where the same glyph has to be the one the reader learned on the pill.
- On M4 the switcher is inside the collapsing head, so it is not on screen while the reader is scrolled into the
  list. Accepted: it is navigation, and any upward scroll brings it back.
- `App.vue` now imports one trips component.

**Neutral**
- `openTripView` in the e2e helpers is one click again rather than open-menu-then-click, and works from any of the
  four screens.

## Revisit Trigger

A fifth view of a trip, or a third view that earns a pill. Amendment 1 answers the first form of the question the
original trigger asked — which of them is a *view* and which is a destination read once — but it answers it for
four. A fifth arrives as a ⋮ entry by default; what would reopen the decision is a view that is worked in rather
than read, because three pills plus a current one is the width the row was already at its limit with.

A second trigger, from Amendment 1's accepted cost: the ⋮ growing back past three entries on a trip screen. Two
destinations behind an unlabelled glyph is the judgement made here; five was ADR-050's, and it did not hold.
