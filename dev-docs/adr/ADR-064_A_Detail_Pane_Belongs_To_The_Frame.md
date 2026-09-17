# ADR-064: A detail pane belongs to the frame — a second pane beside the column vs. a layer over it

**Status:** Accepted
**Related:** G-9 (UI-Spec), M5, ADR-046 (the item is a query on the trip route), ADR-049 (`.ion-page` is its
own containing block), ADR-060 (a banner never moves the page under a finger), FR-21.26, `--jp-panel-w`

**Decision Drivers (in priority order):**

1. **The screen says what it is, and the render agrees.** The UI-Spec promised a two-pane layout for four
   weeks while the built panel covered two thirds of the list. A spec that disagrees with the code is worse
   than none.
2. **The list stays readable while a detail is open.** The pane exists to be read *next to* a row, not
   instead of it.
3. **One measurement, not two.** The frame already owns the rail width, the bar height and the column
   measure; a pane that positions itself against the window is a fourth copy of the frame's geometry
   living in a screen.
4. **Reach the window's edge at all.** Ionic gives `.ion-page` `contain: size layout style`, so anything
   positioned inside a screen is bounded by the content column, not by the window (ADR-049 found the same
   wall from the other side).

---

## Considered Options

### Option A — the pane is the frame's second flex column, teleported into it *(recommended, accepted)*

`App.vue`'s `.app-body` is already a flex row of rail and content column. It gains a third child,
`#app-panel-host`, which collapses with `:empty`. A screen that has a detail pane teleports its `<aside>`
into that host; the pane is laid out, not positioned, so it ends at the window's edge because that is where
the row ends, and `.app-content` — `flex: 1` — shrinks and re-centres its column in what is left.

**Pros**

- No positioning at all: no `fixed`, no `z-index`, no containment to escape, no second copy of the bar
  height or the rail width. The pane's CSS is a width and a background.
- The two panes cannot overlap, because they are siblings in a row. The promise is structural rather than
  arithmetic, so no viewport can falsify it.
- The frame keeps the one place that knows how the window is divided.

**Cons**

- **The column moves when the pane opens.** At 1280 the list shifts 200 px left as it re-centres in the
  narrower space. This is a real cost and is accepted below.
- A teleport is indirection: the pane's markup is in `PackingListPage.vue` and its DOM is in the frame, so
  a page-scoped Playwright locator no longer finds it. Eight call sites across two spec files moved to the
  new `itemDetail(page)` helper, most of them in cases about notifications rather than layout.
- The host is a frame-level id that a screen names by string.

### Option B — keep the pane a layer, anchored to the window instead of the column

Teleport it to `body` and keep `position: fixed; right: 0`, so it reaches the window's edge but stays out
of flow.

**Pros**

- The list never moves when the pane opens — the property the old comment claimed and valued.
- A smaller diff.

**Cons**

- **It does not stop the overlap, which is the whole complaint.** At 1280 the column ends at 980 and a
  window-anchored 400 px pane starts at 880: 100 px still covered. At the 900 px breakpoint the overlap is
  ~290 px. Anchoring alone only moves the problem to narrower windows.
- Making it not overlap means insetting the content by the pane's width from somewhere else — which is the
  frame dividing the window, i.e. option A with extra steps and a fourth copy of the geometry.

### Option C — keep the overlay and correct the spec to describe it

**Pros**

- No code change; the spec stops lying immediately.

**Cons**

- Blesses a 200 px strip of bare item names as the intended desktop experience. Rendered, the pane reads as
  a modal that missed rather than as a pane.

---

## Decision Matrix

| Driver | Weight | A — frame pane | B — window-anchored layer | C — accept overlay |
|---|---|---|---|---|
| Spec and render agree | 5 | 5 — two-pane becomes literally true | 2 — still overlaps below ~1500 px | 3 — true, but describes a poor screen |
| List readable beside the pane | 5 | 5 — no overlap at any width | 2 — 100–290 px covered | 0 — 200 px strip |
| One copy of the frame's geometry | 4 | 5 — the row divides the window | 2 — pane restates bar height and edge | 4 — unchanged |
| List does not move | 3 | 1 — re-centres, 200 px at 1280 | 5 — never moves | 5 — never moves |
| Size of change | 2 | 3 — frame, screen, token, one test | 4 | 5 |
| **Total** | | **78** | 55 | 55 |

---

## Decision

A detail pane is a child of the frame, not of the screen. `.app-body` carries `#app-panel-host` as a third
flex column that collapses when empty; M5's `<aside>` is teleported into it and sized by `--jp-panel-w`.
Nothing about the pane is positioned — it reaches the window's edge because the frame's row does.

## Consequences

**Positive**

- G-9's "two-pane layout … a side panel beside the list" is now what the screen does, at every width the
  pane appears at (measured 900, 1280, 1440).
- The pane spans the full height under the app bar without naming `--jp-app-bar-h`: the row already starts
  there.
- The next screen that wants a detail pane teleports into the same host and inherits all of it.

**Negative / accepted costs**

- **The list re-centres when the pane opens** — 200 px left at 1280. Accepted: it is a pointer-driven,
  deliberate click on desktop, not the unbidden arrival that FR-21.26 and ADR-060 protect against, and the
  alternative at 1280 is covering 100 px of the rows the user is reading. Keeping the column still *and*
  not overlapping is not available at that width.
- **A page-scoped locator no longer sees the pane**, and not only in the cases about layout: the `server`
  project's device is Desktop Chrome, so seven call sites testing notifications, mentions and inventory
  notes broke too. `helpers/page.ts` gains `itemDetail(page)`, which names both homes so a case need not
  know its own width.
- **The sheet and the pane are now mutually exclusive by a written condition rather than by a `v-else-if`.**
  Splitting that chain dropped the guard on the first attempt and rendered both at phone width; E2E-M5-09
  holds the rule explicitly.
- At the 900 px breakpoint the column is 420 px, below `--jp-measure`. The trip view switcher scrolls there,
  which is the behaviour it was built for at 390 px, so this is inside its design range rather than a new
  narrow case.

**Neutral**

- `--jp-panel-w` joins the frame's geometry tokens in `surfaces.css`. It is deliberately not derived from
  `--jp-measure`: one item's fields and a list's reading measure are unrelated quantities.

## Revisit Trigger

A second screen wants a detail pane **and** wants it a different width, or the two panes are wanted
side by side below 900 px — either means the host has to carry a per-screen width instead of one token.
Also revisit if the 200 px re-centre is reported as disorienting in the Track H pilot: the fallback is to
left-align the column in the remaining space rather than centre it, which halves the movement at the cost
of an off-centre list when the pane is closed.
