# ADR-054: „Für alle" is a third verb on the line — vs. a mode, an inline roster, or an offer after the add

**Status:** Accepted (2026-09-09)
**Related:** ADR-036 (membership is keep-and-repoint), FR-25.8 (the composer's per-person mode), FR-25.13d/e/f (the
browse-sheet and its two verbs), FR-25.21/25.21c (the membership editor and its *Alle Reisenden* shortcut), FR-2.5b /
ADR-053 (a per-person position with an empty roster), UI-Spec M4, G-8, G-11, E2E-M4-78, E2E-M4-79

**Context.** The browse-sheet is where a trip is assembled out of the inventory, one tap per item, and since FR-25.13f
each line also carries ✓ *gepackt* and ✕ *nicht einpacken*. What it cannot say is **who needs the item**. A family
trip's answer is usually *everybody*, and the only route to it was FR-25.8's composer mode, which writes the row and
then opens the membership editor — per item. The owner's request (2026-09-09) names exactly that cost: *"otherwise you
always have to do it afterwards, per item."*

Four variants were rendered as mockups before anything was built, in the app's own tokens, and the owner chose from the
pictures rather than from the description.

**Decision Drivers (in priority order):**
1. **One tap for the common case.** The request is about a run of items that all belong to everybody.
2. **No mode that can be silently wrong.** FR-25.13f's own round rejected a verb-mode bar for this reason; the
   decision here changes per *item*, not per run.
3. **Nothing moves under the finger.** FR-25.13e paid for this rule: a row that reflows takes the next tap with it and
   deletes the only feedback the sheet has.
4. **It must not destroy anything.** The sheet has no room for a confirm, and ADR-036's conversions can delete rows
   that carry packing progress or a comment thread.
5. **The line stays readable on a phone.** 390 px, a name that must not be reduced to an ellipsis.

---

## Considered Options

### Option A — A *Gemeinsam / Pro Person* segment in the sheet head

The FR-25.8 segment, moved into the sheet; every tap in the run adds one row per traveler.

**Pros**
- One tap per item, and no new control on the line at all.
- Reuses the composer's exact vocabulary, so the two postures agree.

**Cons**
- A mode you can be in without looking (driver 2). A run that is mostly shared and occasionally per-person pays for
  the switch on nearly every line.
- The failure is silent: the wrong mode writes the wrong rows and says nothing.

### Option B — A third verb on the line, 👥 *(recommended, accepted)*

**Pros**
- The decision is made where it arises, per item, with no state to remember.
- It is the same grammar FR-25.13f established: one tap, one write, the line reports what it did.
- Works on a free line (add and distribute) and on a carried one (give the travelers who have none a row).

**Cons**
- A third square beside the name. Measured at 390 px it leaves the name ~190 px, which the render shows is enough —
  but the budget is now spent, and a fourth verb has nowhere to go.
- On a line the run itself has just added the ledger already owns the right-hand side, so the spread is offered only
  after the sheet is reopened.

### Option C — The roster unfolds inside the line

Tapping 👥 opens the trip's travelers as chips in the row, *Alle* preselected, with a commit button.

**Pros**
- The only variant that buys a *subset* — „Nina and Mila, not Andy" — in the sheet.

**Cons**
- It reorders the list under the finger, which driver 3 forbids and FR-25.13e paid to establish.
- Two taps for the common case, to buy a case the membership editor already covers (FR-25.21c) — a second
  implementation of a roster picker, which invariant 4 exists to prevent.

### Option D — A *Für alle* offer beside *Rückgängig*, after an ordinary add

**Pros**
- Costs nothing when unused, and appears exactly when the thought occurs.
- Would also cover the one case B leaves out: correcting the line the run just added.

**Cons**
- Two taps for the common case, and the offer exists only while the line still says *hinzugefügt*.
- A run of twenty per-person items pays the second tap twenty times.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C | Option D |
|---|---|---|---|---|---|
| One tap for the common case | 5 | 5 — one tap | 5 — one tap | 2 — two taps, plus a panel | 3 — two taps |
| No silent mode | 5 | 1 — a mode is the whole design | 5 — none | 5 — none | 5 — none |
| Nothing moves under the finger | 4 | 5 — nothing moves | 5 — nothing moves | 1 — the row grows | 4 — the state line grows |
| Never destructive | 4 | 4 — same planner | 4 — same planner | 4 — same planner | 4 — same planner |
| The line stays readable | 3 | 5 — no new control | 3 — a third square | 2 — a panel in the row | 4 — a third control, briefly |
| **Total** | | 74 | **89** | 57 | 79 |

---

## Decision

The line gains **👥 *für alle*** as a third verb, before ✓ and ✕. One tap gives every traveler a row at amount one; an
amount somebody already chose is kept, and only the travelers who have none are added — `everyoneMembers`, the rule
FR-25.21c's shortcut already owns. The rows are ADR-036's keep-and-repoint, so the existing row *becomes* the first
traveler's and its comments, todos and progress survive.

**No editor opens.** FR-25.8's mode has to close the sheet before its editor can be presented; this verb ends in the
sheet, which is what lets the taps run.

**The spread only ever adds, and that is checked twice.** A row belonging to somebody who has left the trip is
filtered out of the plan rather than swept into it — the planner would otherwise read it as a member nobody asked for
and delete it. And a plan that still comes back carrying a delete of any kind is not written at all, because the undo
this verb offers restores fields and removes inserts: a row a spread deleted is one *„Rückgängig"* could not bring
back. The screen reports the refusal.

**Absent, not disabled** (G-8), below two travelers — the number that decides FR-25.8's mode, now named once as
`MIN_TRAVELERS_FOR_PER_PERSON` — on a line that already reaches everybody, on settled and locked lines, and in a sheet
that renders no verbs at all (M6, M8).

## Consequences

**Positive**
- The request is answered in one tap, and the membership editor stops being the only door to a per-person row.
- The carried case doubles as the correction path: a shared row that turns out to be everybody's is one tap from
  being three rows, with nothing lost.
- `browseRowStates` now reports how much of the roster an item reaches, which is a fact the sheet had no way to ask
  for and which any later „who has this?" surface can read.

**Negative / accepted costs**
- Three squares on the line. The name gets what is left, and a fourth verb is now out of the question — the
  concept's own `⊕` already stepped aside for the first two.
- **Option D's one advantage is given up**: on a line this run just added, the offer is *Rückgängig* alone. The
  spread returns when the sheet is reopened. This is what E2E-M4-79 has to work around, and it is written down there.
- The sheet reports the tap from its own ledger, so in the one case the caller declines to spread — the destructive
  plan above — the line briefly says *„für alle"* while the sheet is already reporting that nothing was distributed.
  Accepted rather than solved: the alternative is a round trip through the caller for every tap.

**Neutral**
- `offerPerPerson` on the composer became `travelerCount`, because two controls now ask the same question of the same
  number and a second boolean would have been the same rule written twice.

## Revisit Trigger

A request for a *subset* in the sheet — „these two, not the third". That is option C, and it is the point at which the
roster has to unfold somewhere; the answer then is not a fourth verb but a decision about whether the sheet still is a
run surface at all.
