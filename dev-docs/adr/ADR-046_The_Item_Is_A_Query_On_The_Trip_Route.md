# ADR-046: The item over the packing list is a query on the trip's route — vs. a path alias vs. local state

**Status:** Accepted (2026-09-05)
**Revises:** ADR-012's amendment of 2026-08-14 (the item path as an alias of the trip route) and its amendment of
2026-08-21 (the scroll memory that compensated the remount the alias caused)
**Related:** ADR-011 (one header bar, the overlay's back), ADR-012 (one outlet, one live page), UI-Spec M4 / M5, G-4
(deep links), `Navigation_Concept_v1.0.md` §7 case 4, E2E-M5-12, E2E-M4-45, E2E-G4-01, E2E-M5-13

**Context.** E2E-M5-12 (the desktop panel) went red on the WebKit shard three times in twenty-four hours — twice on
PR #374, once on `main` at `9561ec69` — and never once on an idle machine: fifteen runs on 2026-08-31, eight more
on 2026-09-05, all green. Each failure was the same line: the visible-page locator's `m4-header` resolving to **two**
elements for over five seconds. The failed run's screenshot and ARIA snapshot show one M4 painted and a second one in
the DOM, `ion-page-invisible`, not `ion-page-hidden`. The cause is in `@ionic/vue-router`'s `findViewItemByPath`: a
route record whose path carries a parameter matches an existing page only when the *pathname* is identical, so
`/trips/t1/items/i2` — the alias the trip route carried since ADR-012's 2026-08-14 amendment — was a **second page**
to Ionic, mounted fresh on every open. The swap between the two is a `replace`, so it runs with duration 0, which is
why nothing showed on an idle machine; but the outlet's `commit()` waits for every Ionic child of the entering page to
report ready, and on a loaded runner that wait exceeded the assertion's five seconds while both pages stood unhidden.
The router's comment claimed the opposite — *"with an alias only the params change, so the list stays the one the
user was already looking at"* — and every later document repeated it. The cost was paid on every open, not only under
load: a full second render of M4 with its own subscription and drain, and a per-trip scroll memory whose only job was
to carry the offset across a remount.

**Decision Drivers (in priority order):**
1. **One live page per screen** — ADR-012's invariant, checked after every e2e case by the `oneLivePage` fixture. A
   second mounted list is a page that eats taps meant for the one on screen.
2. **The item stays in the URL.** A notification deep link (G-4) lands on it, a reload keeps it, and `‹ back` and the
   browser's back close it (ADR-011, Navigation Concept §7 case 4). Whatever is chosen keeps all three.
3. **Opening an item does not re-render the list.** A forty-row list mid-pack returning to the top was the screen's
   most expensive small failure (UI-Spec M4); a memory that puts it back is a repair, not the absence of the defect.
4. **Small.** The route, the two back rules and the three e2e cases exist; the change should move one value, not add a
   mechanism.

---

## Considered Options

### Option A — The item is a query on the trip's own route: `/trips/:tripId?item=…` *(recommended, accepted)*

The trip route loses its alias. The item id travels as `?item=`, the comment a notification names as `&comment=`
(both keys declared once in `router/paths.ts`, beside the path parameters). M4 reads the query off `useRoute()` rather
than off a prop, because Ionic caches a page's route props for the page's lifetime — the whole point is that the page
keeps living. `meta.overlayParam` becomes `meta.overlayQuery`; `backTarget` and `overlayBackGuard` read the query
instead of the params. The scroll memory and its `data-scroll-restored` signal are deleted.

**Pros**
- Ionic's own rule, stated in the matcher's comment: */page/1 and /page/1?query=1 should match to the same view item.*
  No second page is ever created, so driver 1 holds by construction rather than by timing.
- Drivers 2 and 3 hold: the URL still names the item; the list never leaves the screen, so it never leaves its offset.
- Driver 4: one route entry, two readers of `meta`, one builder; the e2e cases keep their promises and lose a signal.

**Cons**
- The URL loses its REST shape. `/trips/t1/items/i2` read as a resource; `/trips/t1?item=i2` reads as a view state —
  which is what it is, but three documents and the service worker named the old shape.
- The service worker mirrors the shape by hand (`public/sw.js` has no imports), so a future change of the key has to
  be made twice. It already mirrored the path the same way.

### Option B — Keep the alias; make the case tolerate the second page

Wait for the swap to settle before asserting, or widen the timeout.

**Pros**
- No production change.

**Cons**
- The mount is the defect; the red case is only its messenger. Every open would keep paying a second render, and the
  `oneLivePage` fixture would keep seeing two pages for a load-dependent window.
- A wider timeout is a wait-and-hope (working agreement); the next loaded runner finds the new edge.

### Option C — Local state: the sheet opens without touching the URL

**Pros**
- Trivially one page; no router involvement.

**Cons**
- Loses driver 2 entirely: no deep link, no reload, and `‹ back` has nothing to read. ADR-011's overlay rule and
  E2E-G4-01/E2E-M5-13 would go with it.

### Option D — Patch the matcher so a parameterised record reuses its page

**Pros**
- The URL keeps its shape.

**Cons**
- A patched copy of the framework's routing for one screen, carried through every Ionic bump (invariant 8) — and the
  matcher's behaviour is deliberate: `/page/1` and `/page/2` *must* be two pages, or M10's `/items/:id` would reuse a
  page across two items and keep the first one's props.

---

## Decision Matrix

| Driver | Weight | A — query | B — tolerate | C — local state | D — patch Ionic |
|---|---|---|---|---|---|
| One live page | 4 | 4 — by construction | 1 — two pages per open | 4 | 4 |
| The item stays in the URL | 3 | 4 — same three behaviours | 4 | 0 — none of the three | 4 |
| No re-render on open | 3 | 4 — the page never leaves | 1 — remount plus a memory | 4 | 4 |
| Small | 2 | 3 — one value moved, docs renamed | 4 | 2 — rewrites the back rules | 0 — a framework fork |
| **Total** | | **46** | 27 | 32 | 40 |

---

## Decision

The item shown over the packing list is `?item=` on the trip's route, read by the page itself; the alias is gone, and
so is the scroll memory that existed to survive the remount the alias caused.

## Consequences

**Positive**
- Every open of an item is one page; E2E-M5-12 asserts it by element identity — the page showing the panel *is* the
  element that showed the list — which a remount reddens deterministically, on an idle machine too.
- `lib/scrollMemory.ts`, its spec, the deaf-while-restoring scroll handler and `data-scroll-restored` are deleted.
  E2E-M4-45 keeps its promise without them: the offset is a settled state of a page that was never replaced.
- The router comment that made a framework claim is replaced by the rule the framework actually has.

**Negative / accepted costs**
- The URL shape changes; the notification link and the worker's mirror of it change with it. No release has shipped a
  link, so nothing outside the repository holds the old form.
- The worker's copy of the shape stays hand-written.

**Neutral**
- Opening and closing still *replace* — the sheet is a state of the screen, and one screen keeps one history entry — so
  `overlayBackGuard` stays exactly as it was, with the query as its signal.

## Revisit Trigger

Revisit when a second screen needs a route-driven overlay of its own: `overlayQuery` is then a pattern to name in the
Navigation Concept rather than M5's one-off. And re-read this decision if `@ionic/vue-router`'s `findViewItemByPath`
changes how a parameterised record is matched — the whole of Option A rests on that one function.
