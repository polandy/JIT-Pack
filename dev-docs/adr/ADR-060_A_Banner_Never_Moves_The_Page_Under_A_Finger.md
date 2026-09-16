# ADR-060: A banner never moves the page under a finger — overlay vs. reserved space vs. bottom shelf

**Status:** Accepted
**Related:** FR-19.7 (the one-press update offer), FR-19.8 (the migration bar), ADR-044 (the update is
applied from a press), G-19 (UI-Spec), `dev-docs/e2e-tests.md` — *„Owed: a WebKit case lost its click to
the FR-19.7 banner (2026-09-09)"*

**Decision Drivers (in priority order):**
1. **A control must not move between the moment it is aimed at and the moment it is pressed.** This is
   not a test problem: the suite merely observed it first, and observed it as a click Playwright
   *reported as a success* on a page that had not moved on.
2. **The offer stays where FR-19.7 put it** — under the app bar, visible without opening the G-2 sheet.
   A fix that hides the announcement solves the reflow by removing the feature.
3. **The frame pays, not the screens.** Twenty-three screens must not each learn a rule about banners.
4. **Nothing permanent for something occasional.** A new build is announced rarely; the layout must not
   carry the cost of it at all other times.

---

## Considered Options

### Option A — the banner gets its own layer, over the content *(recommended, accepted)*

`UpdateBanner` moves out of the app's flex column into `.app-banner-layer`, a fixed layer pinned to the
line where the body column starts (`--jp-app-bar-h`) and inset past the desktop rail
(`--jp-nav-rail-w`). Appearing and disappearing changes no other element's box. It is the decision M5's
desktop panel already made for the same reason — *„fixed to the right edge rather than squeezing the
list, so opening a detail never re-flows the rows underneath the finger that opened it"*.

**Pros**
- Nothing below it moves, ever — an invariant a test can state as an equality rather than a tolerance.
- The banner keeps the position, the width and the pixels it has today.
- One rule in the frame; no screen changes.

**Cons**
- While it is up it **covers** the top band of the content — on a list, the page head or the first row.
- A press aimed at that band during the moment the banner arrives lands on the banner instead. That is a
  real misfire, and the honest comparison is: the target is *visible under the pointer* when it is hit,
  where a reflowed dispatch lands on something the user never saw there, does nothing they can observe,
  and reads as an app that ignored them.

### Option B — reserve the space permanently

The banner slot keeps its height whether or not a banner is in it.

**Pros**
- Nothing ever moves, and nothing is ever covered.

**Cons**
- A permanent empty band under the app bar on every screen, for an event that happens on the days a new
  build ships. It pays the full cost of the feature at all times, which driver 4 rejects.

### Option C — a shelf at the bottom, above the tab bar

The announcement arrives where the snackbars do.

**Pros**
- The top of the content — the page head, the back target — is never covered.

**Cons**
- It still moves something: the body column shrinks, so a viewport-anchored FAB and the tab bar move,
  and a scrolled-to-bottom list is re-anchored by the browser. The property the decision is about is
  *not* obtained; it is only relocated to a different set of targets.
- It collides with the FAB and with the snackbar that already lives there (`usePackAnnouncer`).
- It leaves FR-19.7's placement decision behind without re-arguing it.

### Option D — leave it, and keep the suite away from it

The state of things: `531d5c3b` blocks service workers on the WebKit Playwright project, so the suite
stopped seeing the banner.

**Pros**
- Free, and legitimate on its own terms — WebKit under Playwright never exercised real worker behaviour
  anyway, so blocking it removes an artifact rather than a coverage.

**Cons**
- It is a change to the *observer*. Every real device keeps the defect, Chromium keeps it in CI, and the
  next occurrence arrives with nothing written down about why the suite cannot see this class of bug.

---

## Decision Matrix

| Driver | Weight | A — own layer | B — reserved space | C — bottom shelf | D — mute the observer |
|---|---|---|---|---|---|
| Nothing moves under a finger | 5 | 5 — provably nothing moves | 5 — nothing moves | 2 — moves the FAB, the bar and a bottom-anchored list | 0 — unchanged for every user |
| FR-19.7's placement survives | 3 | 5 — identical pixels | 5 — identical | 2 — a new placement, undecided | 5 — untouched |
| The frame pays, not the screens | 3 | 5 — one rule in App.vue | 5 — one rule | 4 — one rule, plus the FAB's | 5 — none |
| Nothing permanent for the occasional | 4 | 5 — the layer is empty when idle | 1 — a band on every screen forever | 4 — empty when idle | 5 — nothing |
| **Total** | | **75** | **59** | **44** | **45** |

---

## Decision

The FR-19.7 banner renders in `.app-banner-layer`, a fixed layer over the content that starts at the app
bar's lower edge and, past G-9's breakpoint, at the rail's right edge. Its arrival and its dismissal
change no other element's geometry, which `E2E-PWA-06` asserts as an equality of the content box before
and after.

FR-19.8's migration bar deliberately stays **in** the column: `switchToServer` reloads, and the flag is
read at boot, so that bar is either present from the first paint or never — it cannot appear under a
finger. The rule is therefore about *when a banner can arrive*, not about banners, and it is written in
the frame beside the two of them (G-19).

## Consequences

**Positive**
- The class of defect is closed for every browser and every real device, not only for the suite.
- `--jp-app-bar-h` and `--jp-nav-rail-w` become tokens; the app bar's height had been written out three
  times and the rail's width twice (§4a).
- The desktop rail no longer shifts its four anchors down when a new build is announced.

**Negative / accepted costs**
- The banner covers the top band of the content while it is up, and a press aimed there during its
  arrival hits it. Bounded by what it can do: *Update* reloads onto the waiting build with unsent
  changes kept (they live in the outbox), and *Später* dismisses.
- **What „the top band" is, measured** (2026-09-16, M4 with six rows at 390 × 844; the PR's own
  screenshots were all empty states and forms, so the band it covers was never in one). The banner
  occupies y 64 → 120.78. It therefore hides **the page title outright** (`header-title`, y 62 →
  97.69) and **13.1 px of the view switcher's 25** (`trip-views`, y 107.69 → 132.69) — just over half
  of a live control row. The progress figure at y 155.81 is clear, and so is every row.
  Two things the same run settles: **nothing moves** — head, switcher, figure and scroll geometry are
  identical to the hundredth of a pixel before and after, which is what this ADR bought and what
  E2E-PWA-06 pins one box lower — and **the layer swallows no taps**: `elementFromPoint` at the
  switcher's own top edge returns the chip's `BUTTON.view` both before and after, so the failure mode
  the desktop rail had at `left: 0` does not repeat on the chips.
  Whether hiding the page's name for the life of the announcement is acceptable is a judgement to make
  against the rendered picture rather than against the phrase; it is recorded here so the next reader
  inherits the pixels instead of re-measuring them.
- A future banner added to that slot has to decide which of the two it is. The template comment beside
  both says so, and G-19 is the written rule; neither is a type.

**Neutral**
- The layer is above M5's desktop panel (z-index 20) and far below Ionic's overlays, so a modal still
  covers it — a modal has the screen.

## Revisit Trigger

A **second** surface that arrives unbidden over a screen in use — a global error bar, a presence toast
from another device — or a phone viewport where the banner's band overlaps a control that has no other
way to be reached. The 2026-09-16 measurement above is the nearest miss on that last clause: the view
switcher *is* overlapped, by half its height, and stays reachable only because its lower half and its
tap target both survive. Either makes this a layout with two occupants and the placement worth re-deciding as
one.
