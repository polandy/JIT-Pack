# ADR-051: The trip's views are a switcher in the page — vs. entries behind the bar's ⋮

**Status:** Accepted
**Related:** ADR-050 (the page names itself, the bar's three-glyph budget), ADR-011 (one header bar, the back-target
contract), ADR-046 (one live page per route), ADR-077 (excursions), ADR-078 (the planner), ADR-092 (the meal plan),
UI-Spec G-9, G-12, G-13, M2, M4, M6, M11, M12, M25, M26, PRD §3.25, §3.29, FR-7.13, FR-9.3, FR-21.17, FR-21.18,
FR-21.21, FR-25.6, FR-31, UX-04, E2E-G12-05, E2E-G12-06, E2E-G12-07, E2E-G12-08, E2E-M4-11, E2E-M6-04,
`dev-docs/trip-note-threads-concept.md` §7a, `UI_Concept_TripNoteThreads_variants.html` and
`UI_Concept_PlannerNav_variants.html` at `6b148419`

**Context.** ADR-050 capped the bar at three glyphs and sent M4's shopping, luggage and analytics entries into the ⋮,
recording the cost in its own consequences: *"§3.25's 'one tap each' for the trip's three views is spent."* The M4
review of 2026-09-07 read what that bought, off a render rather than off the code: the bar spends three of its seven
slots on view options (search, filter, fold), two on controls that belong to no trip (the sync glyph and the gear),
and the five places a reader actually goes — shopping, luggage, analytics, the trip's properties, the next lifecycle
step — sit behind one glyph with no word on it.

Two further facts changed since that decision. FR-21.17 made the page head collapse on downward scroll, so a band
under the name no longer costs a long list its height permanently. And there was never a way **sideways**: from the
shopping list to the luggage meant going back to M4 first, because the ⋮ only ever carried M4's own list.

The trip's views did not stay at four. A trip now has ten: the ideas it is planned from (§3.29), the packing list, the
shopping list, the tasks (FR-7.7), the notes (FR-7.13), the excursions (FR-31), the day plan and the meal plan
(FR-29.15, §3.33) — each a place the family works in, returned to across a trip — and the luggage and the analytics,
each read about once a trip. Any answer has to hold for that many.

**Decision Drivers (in priority order):**
1. **Discoverability (§3.25).** Every view a trip is *worked in* must be visible without opening anything, and every
   view must be nameable on demand. This is the driver ADR-050 scored a 2 on and paid with. It does not ask that a
   view read once a trip be as loud as the list being packed: a row that is equally loud everywhere says nothing
   about where the work is.
2. **The bar keeps its size.** Whatever the answer is, it must not put glyphs back on the bar — the budget is what
   stopped seven from becoming eight.
3. **Told once.** Every trip screen carries this. A rule each of them has to remember is a rule one of them will
   forget (UX-17, FR-21.18 — superseded by FR-21.26, which this decision is what triggered).
4. **Sideways, not just down.** A trip's views are peers; the reader moves between them. A menu, though, acts on the
   screen it opens on (the owner's call, from using the app): an entry with nothing to do with the screen reads as a
   junk drawer, and costs a thought about whether it applies here.
5. **Height and width are not free.** A phone has 844 px, and M4's own head and header line already take 190 of them.
   The row is laid out for the Pixel 9 Pro's 410 CSS px, the phone the family packs with, and its tap targets stay at
   G-13's size.

---

## Considered Options

### Option A — A switcher in the page head, rendered by the frame *(recommended, accepted)*

`TripViewNav` renders inside `PageHead`'s body, from `meta.tripView` in the route table: a pill per worked-in view,
the current one marked and inert, every other one tap. Because it is inside the head's body, it yields with the name
on a screen that collapses its head.

**Pros**
- Every worked-in view is shown on every trip screen, with no screen deciding anything.
- The step from a sibling to a sibling is one tap — the thing the ⋮ never offered at all.
- The bar gains nothing; the ⋮ shrinks to what belongs to the screen it is on.
- Where you are is part of the same control, so the row says both things at once.

**Cons**
- ~35 px of head on every trip screen, and on M4 it is inside the band that collapses — so it is gone while
  scrolling, and comes back on any upward scroll.
- Ten views do not fit a phone's row in any shape that keeps a tap target; see *The row's shape* below.
- `App.vue` imports a trips component. The frame knew only frame-level components before this.

### Option B — Promote shopping to the bar's third glyph, leave the rest in the ⋮

**Pros**
- No new surface, no height at all; the one entry with a count becomes visible.

**Cons**
- Fails driver 1 for every view but one and driver 4 entirely.
- It re-opens the argument the budget settled: which single view deserves the slot, answered per screen and per
  reviewer, which is exactly how seven glyphs happened.

### Option C — A tab bar for the trip, replacing the app's own while inside one

**Pros**
- The strongest discoverability, and the shape a phone user reaches for.

**Cons**
- Two conflicting tab bars, or an app-level anchor set that changes meaning inside a trip (G-3, ADR-012's four
  anchors). That is a navigation-model change, not a screen change.
- Costs 56 px at the bottom of every trip screen and never collapses, and holds five entries, not eight.

### The row's shape, within Option A

Each was mocked or rendered against the running palette and chosen by the owner off the render.

- **Which views earn a pill.** Every view as a pill fills a 390 px row with destinations all equally loud, two of
  which are read once a trip. Rejected besides the chosen *worked-in views as pills, the luggage and the analytics
  as ⋮ words*: a *Mehr* pill opening a popover, the luggage hung off the weight M4's header line already shows, and
  two cards at the foot of the list.
- **Words or glyphs.** A row of word pills was measured in headless Chromium with the component's own metrics
  (German, *Einkaufen (12)*, *Aufgaben (7)*, two new notes; negative is overflow):

  | Row | 360 px | 390 px | 430 px |
  |---|---|---|---|
  | Three word pills, on M4 | +47 | +77 | +117 |
  | Three word pills, standing on *Auswertung* | −50 | −20 | +20 |
  | Four word pills, on M4 | −42 | −12 | +28 |
  | One word and three glyphs, on M4 | +70 | +100 | +140 |
  | One word and four glyphs, standing on *Auswertung* | −1 | +29 | +69 |

  Four words do not fit a 390 px phone once the fourth has something to say; one word and glyphs do, until the row
  grows past six. A row of glyphs that marked nothing in words was refused: it stops saying where you are.
- **How a glyph tells its name.** A phone has no hover. A tap that shows a bubble and a second tap that goes was
  drawn and not taken: it charges every switch a tap to spare a reader one look at the page title the switch lands
  on. A held press shows the bubble instead.
- **When the row does not fit.** Six pills fill the Pixel 9 Pro's row to the edge, and the luggage or the analytics
  joining while you stand there overflows it; the sample trip's row needs 458–547 px against 380 at 412 px and 328 at
  360. *Slimmer glyph pills* were rejected: 40 px pills are still 41 px too wide for M4 at 412 px, and fitting eight
  takes 32–36 px, below G-13's tap target. *No pill for a ⋮ view* — the packing pill stays marked and the title names
  *Gepäck* — was rejected because the row would stop marking where you are. Scrolling at a hard edge alone was
  rejected on the render (UX-04): a glyph cut there reads as a layout bug, and the views beyond it sit behind a
  gesture nothing invites.
- **Where the ⋮ views are offered.** On every trip screen — so that shopping → luggage is one tap plus the menu — was
  rejected by driver 4's second half: a ⋮ holds its own screen's context.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| Discoverability §3.25 | 5 | 5 — every worked-in view, always visible | 2 — one view | 5 — same, up to five |
| The bar keeps its size | 4 | 5 — untouched | 3 — a glyph returns | 5 — untouched |
| Told once | 4 | 5 — the route table says it | 5 — one page | 2 — a second anchor model |
| Sideways | 3 | 4 — any pill from any screen; the ⋮ views via packing | 1 — M4 only | 5 — same |
| Height and width are not free | 3 | 3 — ~35 px, collapses on M4; scrolls | 5 — nothing | 1 — 56 px, permanent |
| **Total** | | **83** | 58 | 71 |

---

## Decision

The trip's views are a pill row inside the page head, rendered once by the frame from `meta.tripView`.

**The pills are the views a trip is worked in**, in `TRIP_VIEW_PILLS`' order: the ideas first, because a trip is
planned before it is packed, then the packing list, the shopping list, the tasks, the notes, the excursions, the day
plan and the meal plan. The day plan and the meal plan stand only while the trip has both dates (`absentViews`). The
luggage and the analytics are words in the bar's ⋮ — and while you stand on one of them its pill joins the row, so
the row always marks where you are.

**The current view keeps its word**, beside its glyph at `--jp-icon-sm`; it carries `aria-current="page"` and does
nothing when tapped. **Every other view is its glyph** at `--jp-icon-md`, the step for an icon that is its own tap
target, and its count is a badge. Its whole label with the count (*„Einkaufen (12)"*) is its `aria-label` and its
`title`, so a screen reader and a hovering pointer are told what the eye reads off the badge. **A held press shows
the name in a bubble; a tap navigates**, and the release that ends a hold swallows its click. G-12's struck bubble
comes back here and only here, by that ruling's own revisit trigger — *a glyph that cannot move behind the ⋮*: these
are the destinations that left the ⋮, and a pill carries no other hold.

A sibling is `router.push`; the packing list — the declared parent of the others — is
`navigate(..., 'back', 'replace')`, the same call the bar's chevron makes, so returning to it does not mount a second
copy (ADR-046).

**The counts.** The shopping pill's is `buyRowCount` from `domain/shoppingView.ts` — **things to buy**, the
aggregation FR-25.6 defines and M6's own segments use. The ideas count the ones nobody has decided on yet and the
excursions the ones ahead with something open, both grey. The notes count only what is new for me, never the total,
and wear the action colour (`TripViewEntry.countIsNew`).

**One table, two shapes.** `lib/tripViews.ts` holds each view's word, glyph and path; the switcher and the bar's ⋮
both render from it, and a menu entry keeps the id its pill has, so a view cannot be renamed in one shape and not the
other.

**A ⋮ holds its own context.** *Gepäck* and *Auswertung* are packing's, so the frame offers them only on packing's
views (M4, M11, M12), ahead of packing's own entries — where you can go, then what you can do; `tripViewMenu`
returns nothing anywhere else, and M6 and M25 have no ⋮. What changes the whole trip — *Reise-Eigenschaften* and the
lifecycle step — lives on M2, in the trip's row menu and its hero; M2's *Reise abschliessen* opens M4 in FR-9.3's
closing pass (`?closing=1`) rather than archiving past it.

**The row scrolls sideways and says so.** It is laid out for 410 px and never wraps; the glyph pills keep their
48 px. Where it holds more than it shows, a 24 px fade stands on each side that has more and on no other,
`scroll-snap-type: x proximity` brings a swipe to rest on a whole pill, and the current pill is scrolled to the row's
centre as near as the ends allow — on the row's own scroll offset, never the page's, and again whenever the pills
change, since the day plan and the meal plan join only once the trip has loaded (`useEdgeFades`, the one rule for
every row that scrolls sideways, G-13).

## Consequences

**Positive**
- §3.25's directive is met, and better than before ADR-050: every view the trip is worked in, reachable from each
  other.
- M6, M11 and M12 gain a way out that is not the back chevron.
- The count disagreement between the switcher and M6's segments is impossible to write: one function, two readers.
  It existed in the ⋮ entry and nothing found it, because the two numbers were never on one screen.

**Negative / accepted costs**
- The luggage and the analytics are two taps rather than one, behind an unlabelled glyph — the shape ADR-050 was
  criticised for. Affordable here because it is two entries rather than five, and the two nobody reaches while
  packing. From the shopping list or the tasks they are one screen further: the packing pill, then the ⋮.
- The glyphs carry meaning alone, so E2E-G12-05's pairwise-distinct vocabulary is load-bearing. The one pair a reader
  may confuse is the packing list's list and the tasks' checkbox, both checklists; accepted.
- On the phone it is laid out for, the row does not show every destination at once, and a pill under a fade is cut.
- On M4 the switcher is inside the collapsing head, so it is not on screen while the reader is scrolled into the
  list. Accepted: it is navigation, and any upward scroll brings it back.
- `App.vue` imports one trips component.

**Neutral**
- `openTripView` in the e2e helpers knows which shape a view is in: a pill is one click from any trip screen, the
  luggage and the analytics go through the ⋮ of packing's views.
- E2E-G12-07 measures the row at 360 and 412 px: resting at its start on the packing list (faded at the end), at its
  end on the luggage (faded at the start), and centred on the notes (faded on both sides). E2E-G12-08 pins the hold
  and that it goes nowhere.

## Revisit Trigger

- A new view of a trip. It arrives as a ⋮ entry of the context it belongs to by default; what earns it a pill is
  being worked in rather than read.
- The ⋮ on a trip screen growing back past three entries. Two destinations behind an unlabelled glyph is the
  judgement made here; five was ADR-050's, and it did not hold.
- The packing list's glyph and the tasks' proving unlearnable as a pair. Then one of the two changes its glyph, not
  the row its shape.
