# ADR-075: A hold selects on every list, and only the grip drags — vs. keeping M25's hold-to-drag, vs. sharing only the look

**Status:** Accepted
**Related:** FR-7.8, FR-30.9, FR-24.9, FR-24.3, FR-10.2, ADR-060, ADR-066, UI-Spec M6, M25, M9, M11 and M23,
`client/src/composables/useRowSelection.ts`,
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

## Amendment 2026-09-24 — M9 joins, without the grip

The owner asked for the inventory (M9, FR-24.9) to take the same patterns. It was the third list of the shape and the
one where a hold did nothing: its selection was armed from the app bar only, and FR-24.9 had rejected the long press
because the row was a router link. M9 now renders `useRowSelection`, `SelectBox`, `SelectionBar`, `BulkBar` and
`ListGroup`: a hold or a right-click on a row selects it, a tap opens the item outside the mode and picks inside it,
and the row navigates in code so the release after a hold never opens M10.

Two parts of the decision do not carry over, each weighed with the owner:

- **No grip, so no drag.** M9's groups are the *primary* tag. A drop would have to decide, invisibly, whether the tag
  the row leaves stays as a secondary one or goes; the alphabetical order and a search have no groups to drop on at
  all; and on a list of 184 rows a drag across screens is slower than *Tag geben* with its refiling switch, which
  already moves any number of rows. The hold and the tap therefore own the whole row, not only its words.
- **A tap opens a page, not a sheet.** M10 carries too much for a sheet; what is shared is that a tap *opens*.

`ListGroup` gained three opt-in extras only M9 uses — the count, a heading that sticks under a measured offset, and the
heading as the jump control (FR-24.8) — and `useRowSelection.toggleAll` now judges „every" by the keys on screen rather
than by a count, which M9's filter needs and M6/M25 do not notice. The revisit trigger above has not fired: M9's bar
already holds its fourth act behind ⋯ *Mehr*.

## Amendment 2026-09-24 — the tag manager and the browse sheet

The owner asked for the UI to be as consistent as it can be. Two more surfaces take the pieces:

- **M9's tag manager (FR-24.14)** had the last selection of its own — a text entrance, its own bar and checkbox, no
  hold. It renders `useRowSelection`, `SelectBox`, `SelectionBar` and `BulkBar` now; its entrance is a checkbox icon
  in the sheet's head, the way M9's is in the app bar. A tag row carries buttons of its own (rename, merge), so
  the row takes the click in the capture phase: a tap spent on the selection never reaches them. „Alle" is kept,
  although merging every tag is rarely meant, because a bar that differs on one screen is the drift this ADR ends.
  Its *hoch/runter* arrows became the grip too (owner, after trying it): the axis is one drop target whose rows carry
  `data-drop-index`, so `useDragToGroup` reports the gap and `reorderTarget` (`domain/tags.ts`) turns it into an
  index — the within-one-list half the composable was written with, used for the first time. The arrows were the
  keyboard's way to reorder; the grip, like M6's and M25's, has none, which is the cost of the one look.
- **The inventory browse sheet (FR-25.13d)** was grouped like M9 and headed with a caption of its own. It renders
  `ListGroup` with the mark and count, so the same items are filed under the same heading wherever they are read.
  Its hold keeps its own meanings (the name's tooltip, 👥's traveller menu): a sheet built for runs of single taps
  selects nothing.

**M4's group headings stay M4's.** They fold, count *open* or *done/total*, and head a card per group — the packing
screen's shape from the closed concept prototype. Drawing them as `ListGroup` would restyle the central screen, a
design decision of its own rather than a consistency fix; its hold stays the row menu (FR-5.5), as above.

## Amendment 2026-09-24 — where a hold opens a row menu instead

The decision above is about **tag-grouped lists whose rows are acted on in batches** — M6, M25, M9. It does not reach
the lists whose rows are acted on one at a time and whose tap navigates: **M2** (the trip list), **M7** (the templates)
and **M4** (the packing rows, FR-5.5). On those a hold — or a right-click — opens **the row's own action sheet**, and
there is no selection mode to enter. M2 joined that shape on 2026-09-24 (UI-Spec M2, E2E-M2-19): it was the last list
hiding its row actions behind a swipe, and the owner asked for one gesture across the app.

The two meanings do not collide, because no list offers both: a list either has a batch act worth a selection, or its
rows' acts differ per row (a trip's lifecycle step, a template's rename) and are read one at a time. The guard is the
same in both shapes — the row navigates in code, and a tap is ignored while the hold's result is on screen, so the
release after a hold never also opens the row. The revisit trigger above extends to this: a list of the second kind
that gains a batch act asks the question again for itself, rather than growing a second meaning for the hold.

## Amendment 2026-09-24 — M23 and M11 join, as flat lists

The owner asked for the remaining lists that acted one row at a time to select the same way: M23 (hidden master data,
FR-24.3), whose rows each carried *Wiederherstellen* and a delete, and M11's unassigned bucket (FR-10.2), where every
row was one trip through the container picker. Both render `useRowSelection`, `SelectBox`, `SelectionBar` and
`BulkBar`, and an app bar glyph beside the hold and the right-click. **Neither takes the grip, the drag or
`ListGroup`**: both are flat lists with nothing to drop a row into.

What each batch does is the single-row act looped, refusals included. On M11 the one picker opens once and assigns
every selected row. On M23 the two acts keep their refusals: a restore whose name is taken is not prompted for in a
batch — the row stays selected, since a queue of rename dialogs is worse than a list of what is left — and a selection
of one is the single-row restore, prompt and all; a delete touches only the rows that have a delete of their own and
leaves the rest selected. Assigned positions are not selectable on M11, because they are not rows there. The revisit
trigger has not fired: M23's bar holds two acts and M11's one.
