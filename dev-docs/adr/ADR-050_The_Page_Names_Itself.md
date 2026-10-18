# ADR-050: The page names itself, and the bar carries at most three glyphs — vs. a title in the app bar

**Status:** Accepted
**Related:** ADR-011 (one header bar, the back-target contract), ADR-012 (the four anchors), ADR-049 (one Ionic mode),
ADR-051 (the trip's views in the page), ADR-064 (the detail pane), UI-Spec G-9, G-12, G-13, M1, M2, M4, M7, M9,
PRD §3.25, FR-21.2, FR-21.26, FR-24.9, FR-25.20, invariant 9, UX-05, UX-14, the design concept *Bergluft* (step 4 of
five), E2E-M4-44, E2E-M4-71, E2E-G12-02, E2E-G12-04, E2E-G12-05, E2E-G12-06, E2E-G12-07, E2E-G9-11

**Context.** Step 4 of the concept is "Kopf der Seite und Leiste": the page's name moves out of the app bar and into the
page, and the bar stops being a place where glyphs accumulate. The review counted seven of them on M4 — search, filter,
fold, and the trip's three other views — beside the sync glyph and the gear, over a title the same bar was also
supposed to carry.

The app had already reached this answer once, screen by screen, without generalising it. M4 gave its bar title up in
2026-08 because beside six icons at 390 px "Samedan Sommer" rendered as "S…", and put the name in its own header line
instead; the three tab roots had each written a display-face `h1` into their content by hand, one copy per screen, with
the screen's import control beside it. Meanwhile four trip sub-screens were composing `${t('…')} · ${trip.name}` into
one string, each with its own separator, so that the bar could say both things at the one size it has.

So the question is not whether a page can name itself — three screens already did — but whether that is the rule or the
exception, and who pays for it.

**Decision Drivers (in priority order):**
1. **A name is not chrome.** What screen this is, and what it belongs to, is the first thing to read on arriving. A
   19 px line squeezed between a chevron and six glyphs is not that.
2. **Told once, for every screen.** The 960 px content column is one rule in `App.vue` precisely because a screen that
   has to remember is a screen that will forget (UX-17). A page head is the same kind of rule.
3. **The bar has to have a size.** Every one of M4's seven glyphs arrived one at a time, and each was defensible on its
   own, because nothing said what full looked like. The tab roots are the family's first row on every visit, which is
   where an unreadable glyph costs most.
4. **Discoverability (§3.25).** The trip's other views were put on M4 as glyphs on purpose: they must not become
   invisible.
5. **The suite must not be rewritten to prove a look.** 76 assertions read the page's title.

---

## Considered Options

### Option A — One head in the frame, and a glyph budget in the bar *(recommended, accepted)*

`PageHead` renders once in `App.vue`, above the outlet and inside the content column, from the head every screen
already registers (`useHeaderTitle`, extended from one string to a title and a meta line). The bar renders no page
title at all; on a tab root it keeps the logo, on every other screen the chevron alone. Its action cluster is capped at
three glyphs — one on a tab root — and anything past the cap joins the ⋮ in registration order.

**Pros**
- Every screen is named, at the display size, without a single view deciding anything — including the twenty
  drill-downs that had never had a head of their own.
- The four hand-composed `· ${trip.name}` titles become a title and a second line, and the separator stops being
  written four times.
- The budget is a rule rather than a habit: the seven-glyph bar cannot come back by accident.
- The testid the 76 assertions use moves with the element, so the suite reads the page's name where the reader does.

**Cons**
- The head is a fixed band above the scroller, not part of it, so it costs roughly 60 px of height on every screen and
  does not scroll away. M4's own header line already collapses on scroll; the head does not.
- Whatever the cap sends to the ⋮ is one tap further away. For M4's three trip views that was against §3.25's
  directive; ADR-051 gave them a place in the page instead.
- `App.vue`'s content area becomes a column with a positioned outlet inside it rather than a positioned box; ADR-011's
  seventeen-unreachable-back-buttons trap lives exactly there.

### Option B — A head per view

Give every screen a `PageHead` inside its own `ion-content`, the way the three tab roots already did.

**Pros**
- The head scrolls with the content, which is what a phone wants on a long list.
- No layout change in `App.vue`.

**Cons**
- Twenty-six views to edit, and twenty-six chances to forget — the exact failure mode UX-17's one rule was written
  against. A screen added next year starts unnamed and nothing says so.
- The registry that already knows every screen's title would be left with one consumer and no purpose.

### Option C — Keep the title in the bar, restyle it

Leave `ion-title` where it is and give it the display face at a larger size.

**Pros**
- No structural change, no baseline churn beyond type.

**Cons**
- The size a bar can give a title is the thing that failed: it is what turned "Samedan Sommer" into "S…" and what made
  four screens compose two facts into one line. The concept's first finding about the bar stands unaddressed.

### Where the budget and the cluster stand, within Option A

Both were put to the owner on renders, the first at 412 and 360 px, the second on the live build.

- **A tab root's budget.** The cap of three was written for the drill-downs, where M4 had stood at seven, and the
  roots filled up under it: M2 carried search, a document (the portable import) and a cloud-upload (the spreadsheet
  import); M9 an eye (the properties sheet), ↕ (the sort), ✓✓ (the selection) and the ⋮. The imports are done a few
  times a year, and the eye and the double tick have no literal reading — against G-12's own rule that a glyph must
  be literal (UX-05). *Leaving the roots at three and moving the glyphs page by page* was rejected: it is how the roots
  filled up, because nothing said a root was different, and the next root action would land as a glyph again.
- **Where the cluster stands on desktop.** The bar spans the window, but since FR-21.26 the content is one
  `--jp-measure` column centred in what the rail and a detail pane leave (ADR-064). Beside the gear, the cluster's
  right edge stood 20 px past the column's at 900 px, 210 at 1280 and 530 at 1920 — 310, 410 and 730 with M5 open,
  over the pane rather than the list its glyphs act on (UX-14). *The cluster in the page head, on the title's line*
  was rejected: M4's head yields on scroll (FR-21.17), so search and filter would leave with it mid-task — the reason
  G-12 put the cluster in the bar — or need a sticky rule of their own, and the cluster would have one place on a
  phone and another on desktop.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| A name is not chrome | 5 | 5 — display size, its own line | 5 — same | 1 — the constraint is unchanged |
| Told once, every screen | 5 | 5 — one render site | 2 — 26 sites, silent when missed | 4 — one site |
| The bar has a size | 4 | 5 — budget enforced | 3 — budget possible, unrelated | 1 — the title still competes |
| Discoverability §3.25 | 3 | 2 — three views one tap deeper | 2 — same if the budget is kept | 5 — untouched |
| Suite not rewritten | 2 | 4 — testid moves, ~40 e2e lines | 4 — same | 5 — nothing moves |
| **Total** | | **91** | 70 | 55 |

---

## Decision

The page's name lives in the page. `PageHead` renders once in the frame, above the outlet and inside the content
column, for every screen that registers a head; the head is a title in the display role plus an optional meta line for
what the screen belongs to. The app bar renders no page title. Its per-page glyph cluster is capped at three, and the
surplus becomes words in the ⋮; a count rides in the word, because an action sheet renders no badge. The trip's views,
the case that set the cap, are a switcher in the page head instead (ADR-051).

**A tab root carries one glyph.** M1, M2, M7 and M9 show at most the magnifier and the ⋮ before the sync glyph. The
imports are words in the ⋮ (*Datei importieren* — M18's own title — and *Tabelle importieren*); M9's sort and shown
properties head the sheet behind its tag chips, *Ansicht & Filter* (*Ansicht* while there is no tag, so the view never
depends on a tag existing), as a segment and toggle chips; M9's selection starts on a row's hold, which FR-24.9
offers. The budget is held by `AppHeader` (`MAX_BAR_ACTIONS`, `MAX_ROOT_BAR_ACTIONS`, read off the left slot: no back
target means a root), not by the pages, so an action registered tomorrow becomes a word without anyone remembering
the rule.

**The bar's two ends are the frame's, its cluster is the page's.** Back or the logo keep the left corner and the sync
glyph and the gear the right one: they mean the same on every screen. From the 900 px breakpoint up, the page's
glyphs and its ⋮ end at the content column's right edge, in the bar, and follow the column when a detail pane
re-centres it; below it the column is the window and nothing moves. The bar is not the body's sibling, so it cannot
be laid out by the body: `AppHeader` restates the body's geometry from the same tokens — `--jp-nav-rail-w`,
`--jp-measure`, and the pane's width, which `App.vue` publishes as `--jp-frame-pane-w` keyed on the same `:empty`
that hides the pane host.

## Consequences

**Positive**
- Twenty drill-downs are named for the first time, and M4's name no longer depends on the viewport width.
- `.jp-screen-title`, a role written for M4's one in-content title, is retired: the head uses `.jp-page-title`, and the
  new `.jp-meta` role gives the second line a definition rather than a per-screen `font-size`.
- M4's header line drops from two rows to one on a phone, which is roughly what the head costs.

**Negative / accepted costs**
- ~60 px of fixed head on every screen; a long list gets that much less of the viewport. The revisit trigger below is
  written for exactly this, and M4 — the longest list — already lets its head yield on downward scroll (FR-21.17).
- Every action a tab root registers past the magnifier is one tap further away, and M9's selection has a single,
  gestural entrance. E2E-G12-02 reads the bar of every root at both widths and finds each moved action as its ⋮ word.
- On a desktop screen whose cluster is only a ⋮ (M9), that ⋮ stands alone mid-bar.
- A change to the body's columns not made through the shared tokens moves the column without the cluster; E2E-M4-71
  measures the two together at 1280 and 1920 px, with and without the pane.

**Neutral**
- The three tab roots stop writing their own `h1` and register a title like everything else; their import controls
  become ⋮ words.

## Revisit Trigger

The first screen on which the fixed head measurably costs more than it gives — a list where the head plus M4's own
line leaves less than half the viewport for rows on a 390 px phone. The answer then is to let the head collapse on
downward scroll the way M4's header line already does, which is a change to one component rather than to any screen.
