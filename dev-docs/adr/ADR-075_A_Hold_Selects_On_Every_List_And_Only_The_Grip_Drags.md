# ADR-075: A hold selects on every list, and only the grip drags — vs. keeping M25's hold-to-drag, vs. sharing only the look

**Status:** Accepted
**Related:** FR-7.8, FR-30.9, FR-24.9, FR-24.14, FR-25.13d, FR-24.3, FR-10.2, FR-5.5, ADR-060, ADR-066, UI-Spec M6,
M25, M9, M11, M23, M2, M7 and M4, `client/src/composables/shared/useRowSelection.ts`,
`client/src/components/global/{DragGrip,SelectBox,BulkBar,ListGroup}.vue`,
`client/src/composables/shared/useHeaderSelection.ts` (UI-Spec G-20)

**Context.** M6 (the shopping list, FR-30.9) and M25 (a trip's tasks, FR-7.8) are the same shape: tag headings, rows
under them, a grip at the leading edge that drags a row into another heading, a tick at the trailing edge. They were
built a day apart and drifted. The owner first asked for M25's grip to look like M6's (PR #582), then for the two
lists to share one component, and then — on being told that the *behaviour* differed — for the behaviour to be unified
too. The conflict is one gesture: **a hold on a row**. On M6 it starts a selection, and a bar retags the selection in
one act. On M25 it lifted the row for a drag, which the grip also did. The same finger on two lists of the same shape
did two different things. Once the two agreed, the owner asked for the rest of the app to follow: the inventory (M9,
FR-24.9), where a hold did nothing and FR-24.9 had rejected the long press because the row was a router link; its tag
manager (FR-24.14) and the inventory browse sheet (FR-25.13d), each with a selection or a heading of its own; the lists
that acted one row at a time — M23's hidden master data (FR-24.3) and M11's unassigned bucket (FR-10.2); and M2, the
last list hiding its row actions behind a swipe.

**Decision Drivers (in priority order):**
1. **One gesture means one thing.** Two lists that look alike and answer a hold differently teach the reader that the
   app is unpredictable, and the reader who learned M6 first loses a row mid-scroll on M25.
2. **Every act keeps a way to do it.** Whatever the hold stops doing must still be reachable, and not only by a
   gesture a reader has to know about.
3. **The shared code is shared, not copied.** A second transcription of a gesture drifts; that is how the two lists
   came apart in the first place.

---

## Considered Options — M6 and M25

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

## Considered Options — the lists beyond M6 and M25

- **M9 with the grip** — rejected. M9's groups are the *primary* tag: a drop would have to decide, invisibly, whether
  the tag the row leaves stays as a secondary one or goes; the alphabetical order and a search have no groups to drop
  on; and on a list of 184 rows a drag across screens is slower than *Tag geben* with its refiling switch, which
  already moves any number of rows.
- **M4's folding headings drawn as `ListGroup`** — rejected. They fold, count *open* or *done/total*, and head a card
  per group, the packing screen's shape from the closed concept prototype; restyling the central screen is a design
  decision of its own, not a consistency fix.
- **A selection on every list, M2, M7 and M4 included** — rejected. Their rows' acts differ per row (a trip's
  lifecycle step, a template's rename, a packing row's skip) and are read one at a time; there is no batch act worth a
  selection, so on them the hold opens the row's own action sheet.
- **The selection count as a strip in the list's flow** (`SelectionBar`) — rejected after it was built: it was inserted
  when a selection began and every row under it moved down, so the row just held left the finger (owner, 2026-09-24).
  The app bar turns into the strip instead (G-20), which moves nothing.

---

## Decision Matrix — M6 and M25

| Driver | Weight | A: hold selects | B: look only | C: hold drags |
|---|---|---|---|---|
| One gesture means one thing | 3 | 3 — the same on both | 0 — unchanged conflict | 3 — the same on both |
| Every act keeps a way | 2 | 3 — drag stays on the grip, batch added | 2 — nothing gained | 1 — M6's selection loses its gesture |
| Shared, not copied | 1 | 3 — one component per piece | 2 — look only | 2 — gestures still per screen |
| **Total** | | **18** | 6 | 13 |

---

## Decision

A hold means one of two things, and no list offers both.

- **On a list whose rows are acted on in batches**, a hold — or a right-click, or the app bar's glyph — selects
  (`useRowSelection`, `SelectBox`, `BulkBar`). These are M6 and M25, M9 and its tag manager, and the flat lists M23 and
  M11. While a selection lasts, the page registers it with the frame (`setHeaderSelection`) and the **app bar** shows
  the count, its ✕ and *„Alle N"*; the tools above a list stay in place. The tag manager is a sheet with no app bar,
  and its head carries the count. A batch is the single-row act looped, refusals included: M11's picker opens once and
  assigns every selected row; on M23 a restore whose name is taken leaves its row selected rather than queueing rename
  dialogs (a selection of one is the single-row restore, prompt and all), and a delete touches only the rows that have
  one. M11's assigned positions are not selectable, since they are not rows there.
- **On a list whose rows are acted on one at a time** — M2, M7 and M4 (FR-5.5) — a hold or a right-click opens the
  row's own action sheet, and there is no selection mode.

In both shapes the row navigates in code, and a tap is ignored while the hold's result is on screen, so the release
after a hold never also opens the row. Outside a selection a tap opens — a sheet on M6 and M25, M10's page on M9, which
carries too much for a sheet — and inside one it picks.

**Only the grip (`DragGrip`) drags**, and only where there is somewhere to drop: into another heading on M6 and M25,
and to another place on the tag manager's axis, which is one drop target whose rows carry `data-drop-index` so
`useDragToGroup` reports the gap and `reorderTarget` (`domain/tags.ts`) turns it into an index. M9, M23 and M11 take no
grip; on M9 the hold and the tap own the whole row, not only its words.

**The grouped headings are `ListGroup`** on M6, M25 and M9 and in the browse sheet, so the same items are filed under
the same heading wherever they are read. Three opt-in extras serve M9 — the count, a heading that sticks under a
measured offset, and the heading as the jump control (FR-24.8) — and the browse sheet takes the mark and the count. The
browse sheet selects nothing: built for runs of single taps, its hold keeps its own meanings (the name's tooltip, 👥's
traveller menu). M4's headings stay M4's.

## Consequences

**Positive**
- M25 gains a batch act: a tag or a phase for any number of tasks, undone in one step (FR-7.8).
- A later list of the same shape (the planner, §3.29) starts from the same five components.

**Negative / accepted costs**
- M25's hold-to-drag is gone; the grip is the only way to drag a task.
- M4's window renders the same task rows without a selection, so a hold there does nothing.
- M9 has no drag; a row changes group through *Tag geben*.
- The tag manager's *hoch/runter* arrows are gone, and with them the keyboard's way to reorder tags: the grip, like
  M6's and M25's, has none, which is the cost of the one look. Its row carries buttons of its own (rename, merge), so
  it takes the click in the capture phase and a tap spent on the selection never reaches them.
- The tag manager keeps *„Alle"*, although merging every tag is rarely meant, because a bar that differs on one screen
  is the drift this ADR ends.

**Neutral**
- `useRowSelection.toggleAll` judges „every" by the keys on screen rather than by a count, which M9's filter needs and
  the other lists do not notice.
- `SheetModal` became a two-root fragment on the way (implementation log, 2026-09-24): the first screen to show a bar
  *after* its batch sheet had been open found that Ionic moves a presented modal out of place, which broke the insert
  of any sibling that appears later.

## Revisit Trigger

A list takes the selection and needs an act its bar cannot hold as one more button (M9's already holds its fourth
behind ⋯ *Mehr*) — then the bar becomes a menu, and the question of what a hold means is asked again for all of them
at once. A list whose hold opens a row menu that gains a batch act asks the question again for itself, rather than
growing a second meaning for the hold.
