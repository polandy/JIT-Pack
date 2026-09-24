# ADR-075: A hold selects on every list, and only the grip drags — vs. keeping M25's hold-to-drag, vs. sharing only the look

**Status:** Accepted
**Related:** FR-7.8, FR-30.9, ADR-060, ADR-066, UI-Spec M6 and M25, `client/src/composables/useRowSelection.ts`,
`client/src/components/global/{DragGrip,SelectBox,SelectionBar,BulkBar,ListGroup}.vue`

**Context.** M6 (the shopping list, FR-30.9) and M25 (a trip's tasks, FR-7.8) are the same shape: tag headings, rows
under them, a grip at the leading edge that drags a row into another heading, a tick at the trailing edge. They were
built a day apart and drifted. The owner first asked for M25's grip to look like M6's (PR #582), then for the two
lists to share one component, and then — on being told that the *behaviour* differed — for the behaviour to be unified
too. The conflict is one gesture: **a hold on a row**. On M6 it starts a selection, and a bar retags the selection in
one act. On M25 it lifted the row for a drag, which the grip also did. The same finger on two lists of the same shape
did two different things.

**Decision Drivers (in priority order):**
1. **One gesture means one thing.** Two lists that look alike and answer a hold differently teach the reader that the
   app is unpredictable, and the reader who learned M6 first loses a row mid-scroll on M25.
2. **Every act keeps a way to do it.** Whatever the hold stops doing must still be reachable, and not only by a
   gesture a reader has to know about.
3. **The shared code is shared, not copied.** A second transcription of a gesture drifts; that is how the two lists
   came apart in the first place.

---

## Considered Options

### Option A — a hold selects on both, the grip alone drags *(recommended, accepted)*

M25 learns M6's selection: a hold on a task's words (or a right-click, or the app bar's icon) selects, a bar gives the
selection a tag or a phase. The grip remains the only way to drag. The selection, its box, both bars and the grouped
headings become kernel components that both screens render.

**Pros**
- One meaning for the hold across both lists, and the batch act M25 lacked (ten tasks into *Während der Reise* was ten
  sheets).
- Nothing is lost: dragging still exists, on a control that says so, and a batch of one is also a retag.

**Cons**
- M25's hold-to-drag goes. A reader who dragged by holding anywhere on the row now has to find the grip.
- A hold on M25 no longer does anything on M4's window, where the same task list renders without a selection.

### Option B — keep M25's hold-to-drag, share only the look

Extract the components for the look, leave each screen's gestures as they were.

**Pros**
- No behaviour changes; no one's habit breaks.

**Cons**
- The conflict the owner asked to remove stays: the same hold does two things on two lists of the same shape.
- M25 still has no batch act.

### Option C — a hold drags on both, selection by the app bar only

Make M6 behave like M25.

**Pros**
- Dragging from anywhere on a row is the more direct gesture.

**Cons**
- M6's selection loses its gesture, which the owner asked for by name (FR-30.9, 2026-09-22), and the bar icon alone is
  the less discoverable way in.
- A drag started by a hold anywhere competes with a scroll on a long list; the grip exists because a control that only
  drags has nothing to disambiguate.

---

## Decision Matrix

| Driver | Weight | A: hold selects | B: look only | C: hold drags |
|---|---|---|---|---|
| One gesture means one thing | 3 | 3 — the same on both | 0 — unchanged conflict | 3 — the same on both |
| Every act keeps a way | 2 | 3 — drag stays on the grip, batch added | 2 — nothing gained | 1 — M6's selection loses its gesture |
| Shared, not copied | 1 | 3 — one component per piece | 2 — look only | 2 — gestures still per screen |
| **Total** | | **18** | 6 | 13 |

---

## Decision

On M6 and M25 a hold on a row's words selects it (`useRowSelection`), and only the grip (`DragGrip`) drags. The
selection box, the selection bar, the floating bulk bar and the grouped headings with their drop frame are one
component each, rendered by both screens.

## Consequences

**Positive**
- M25 gains a batch act: a tag or a phase for any number of tasks, undone in one step (FR-7.8).
- A later list of the same shape (the planner, §3.29) starts from the same five components.

**Negative / accepted costs**
- M25's hold-to-drag is gone; the grip is the only way to drag a task.
- M4's window renders the same task rows without a selection, so a hold there does nothing.

**Neutral**
- `SheetModal` became a two-root fragment on the way (implementation log, 2026-09-24): the first screen to show a bar
  *after* its batch sheet had been open found that Ionic moves a presented modal out of place, which broke the insert
  of any sibling that appears later.

## Revisit Trigger

A third list takes the selection and needs an act the bar cannot hold as one more button — then the bar becomes a
menu, and the question of what a hold means is asked again for all of them at once.
