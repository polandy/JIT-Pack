# ADR-094: What travels with a dragged row — a chip above the finger vs. a copy of the row under it

**Status:** Accepted
**Related:** G-21 (UI-Spec), ADR-060 (nothing moves under a finger), ADR-075 (the grip lifts, a hold selects),
FR-7.8/FR-7.17 (M25), FR-30.9/FR-30.13 (M6), FR-24.10 (M9's tag manager), FR-33.15 (M31),
`client/src/composables/useDragToGroup.ts`, `client/src/composables/dragToGroup.css`, the "Mahlzeit verschieben"
mockup (owner's choice of 2026-10-05)

**Decision Drivers (in priority order):**
1. **The place a row is aimed at stays in sight.** Moving a meal to another day on a phone, the owner found the
   carried row covering the very day it was meant for: one could not see that the day under the finger was the
   target. A drag that cannot be aimed by eye is made blind.
2. **One gesture everywhere.** The owner's rule for M31 was that moving a meal must feel the same as moving a line on
   the shopping list or a task; whatever fixes driver 1 fixes it on every screen that drags, or the screens drift.
3. **Nothing moves under the finger** (ADR-060): the lifted row stays in its list, only dimmed.
4. **No screen draws its own drag.** The frame and its words come from the one composable and its one stylesheet.

---

## Considered Options

### Option A — a chip above the fingertip that says where the drop lands *(accepted)*

The composable no longer clones the row. It builds a compact chip — the grip's glyph, what is carried, a quiet tag
where the screen has one, and a line saying where a drop would put it (*„→ Do., 15.10."*) or that it stays — and
floats it with its bottom edge 22 px above the fingertip, its grip over the finger, inside the screen. The finger
aims; the place under it is framed. Each screen hands the composable its words (`DragCarry`: `title`, `tag`,
`target`, `stays`), and a place carries its own name as `data-drop-label`, a heading's title by default.

**Pros**
- The target is never under what is carried; a place the hand itself covers is still named on the chip.
- The chip's words remove the last doubt about a covered or small target (a 44 px free-day row under a thumb).
- It is the pattern of the platforms' own drags (a small preview beside the finger), so it reads as dragging.
- Small and of one shape, so it is the same on every screen, whatever the row it came from looks like.

**Cons**
- Every screen that drags owes the chip its words: four `carry` blocks, and a new screen cannot drag without one.
- The row's own look — its tick, its avatar, its ring — does not travel; the chip is a summary, not the row.
- The chip is DOM the composable builds by hand (`createElement`, an `ion-icon`), outside any component.

### Option B — keep the copy of the row, flush with the list under the finger

What was built first: a clone of the row, moved up and down only, stepped in by the grip's width so M6's insert line
starts where the clone never covers it.

**Pros**
- No words to supply; the carried thing looks exactly like what was lifted.
- Already built and covered.

**Cons**
- A full-width row under the finger covers the place it is carried to — the heading, the day, the gap. On a list
  of headings the frame still shows round the clone's edges; on M31's free days, one row each, nothing does.
- Fixing it for M31 alone (a chip there, a clone elsewhere) breaks driver 2.

### Option C — the copy of the row, offset above the finger

The clone kept, but floated above the fingertip.

**Pros**
- No words to supply; the target is no longer covered by the clone.

**Cons**
- A full row floating above the finger covers the rows above the target instead — where the eye goes next when the
  finger moves up the list — and hides the screen's own heading for a long carry.
- It still says nothing about where the drop lands; the eye has to find the frame under the hand.

---

## Decision Matrix

| Driver | Weight | A: chip above | B: row under | C: row above |
|---|---|---|---|---|
| Target in sight | 4 | 3 — never covered, and named | 0 — covered | 2 — uncovered, unnamed, rows above hidden |
| One gesture everywhere | 3 | 3 — one chip for all | 1 — only if M31 keeps it too | 3 — one clone for all |
| Nothing moves under the finger | 2 | 3 | 3 | 3 |
| No screen draws its own | 1 | 2 — the screens supply words | 3 | 3 |
| **Total** | | **29** | **12** | **26** |

---

## Decision

`useDragToGroup` carries a chip, built from the screen's `DragCarry` words, above the fingertip: grip, title, tag, and
*„→ <place>"* or the screen's *stays* line. A place whose `target` is null — a drop there would change nothing — is
neither framed nor dropped on. M6, M25, M9's tag manager and M31 all supply their words; G-21 states the gesture.

## Consequences

**Positive**
- Moving a meal, a line, a task or a tag reads the same, and the target is always visible and named.
- M31's free days, a slim row each, are usable targets under a thumb.

**Negative / accepted costs**
- Four screens carry a `carry` block; the composable owns a little hand-built DOM.
- The carried row's own detail is gone from the drag; the chip says only what and where.

**Neutral**
- The tests' handles stay: `data-drag-ghost` is the chip, `data-drag` the state; the chip adds `data-carry-title` and
  `data-carry-where`.

## Revisit Trigger

A screen whose drag needs the row itself to be seen while carrying it (a thumbnail, a colour that decides where it
goes), or a report that the chip is lost above a finger near the top of the screen.
