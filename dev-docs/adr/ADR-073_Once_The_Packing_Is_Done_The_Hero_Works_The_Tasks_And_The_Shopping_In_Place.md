# ADR-073: Once the packing is done the hero works the tasks and the shopping in place — vs. keeping M1 read-only, vs. only removing the line

**Status:** Accepted
**Related:** FR-7.9, FR-5.10, FR-7.4, FR-7.7, FR-30.7, FR-30.8, ADR-066, ADR-071, ADR-060, UI-Spec M1,
`client/src/components/trips/TripHero.vue`, `client/src/lib/tripCards.ts`,
`dev-docs/UI_Concept_DashboardAfterPacking.html`

**Context.** FR-5.10 let a finished packing recede into one line on the dashboard. The owner found the line too large
for what it says and asked that the phase be shown in the date line instead. Taking the line out leaves the hero's
second half empty, and he asked for it to carry what is still owed — the trip's tasks and its shopping — with the count,
the next entries, an add field and a check-off in each, folding, and a link into the full screen. Two standing rulings
sit in the way: M1 *reports, takes no actions* (FR-7.4, 2026-09-18), with one named exception for the shopping card
(FR-30.7), and the hero is one link (`RouterLink`), which a control cannot be nested in.

**Decision Drivers (in priority order):**
1. **What is owed is done where it is seen.** The dashboard is opened to tick something off or to write something down,
   in a shop or at the door; a screen that shows the list and sends you elsewhere to act is the detour FR-30.7 already
   refused for shopping.
2. **A mis-tap must be cheap.** Controls move under a hand that is also carrying something: large targets on one side,
   and a way back.
3. **Height.** The phone shows one screen of the hero; what is added must earn its rows and may be folded away.
4. **One rule for the two lists.** Tasks and shopping should not be a workable card and a read-only one on the same
   page.
5. **Three modes, no new data.** Nothing new is written; the block reads and writes what M25 and M6 do.

---

## Considered Options

### Option A — Workable blocks inside the hero *(recommended, accepted)*

The hero's head is the link into the trip. Below it, two blocks — *Aufgaben* (four rows) and *Einkauf* (seven) — each
with an add field, check boxes on the right, its own fold and a link into M25 / M6, then a *Packliste öffnen* control.
Shopping reaches the hero through `lib/tripCards.ts` as before, which grows a slot contract; M1 imports neither module.

**Pros**
- Both open lists are one glance and one tap from done or added; the packing line is out of the way and one tap back.
- One rule for the two lists (driver 4).

**Cons**
- **Reverses FR-7.4's read-only ruling for tasks.** The cost it named — an empty composer on every dashboard — is now
  paid on the hero, and the fold is what softens it.
- `TripHero` is no longer one link; its slots must keep the head the only link, and the hero's keyboard and
  screen-reader order is now several stops, not one.
- The hero is taller: up to eleven rows plus two fields.

### Option B — Keep the hero read-only, show shopping as FR-30.7's sibling card *(rejected)*

Lines and counts as text, tasks read-only, the shopping card unchanged under the hero.

**Pros**
- No ruling is reversed; the hero stays one link.

**Cons**
- The hero's second half stays empty and the two lists still differ in kind. It answers *what is open* and asks the
  person to go somewhere else to act on it.

### Option C — Remove the line, add nothing *(rejected)*

**Pros**
- Smallest change.

**Cons**
- The owner saw it in the mockup and said (translated) that it looks a bit empty. A hero of a name and a date is a
  poorer dashboard than the one it replaces.

---

## Decision Matrix

| Driver | Weight | A | B | C |
|---|---|---|---|---|
| Done where it is seen | 5 | 5 — in place | 2 — a detour | 1 |
| A mis-tap is cheap | 4 | 4 — large targets, *Rückgängig* | 3 | 5 — nothing to mis-tap |
| Height | 3 | 2 — taller, foldable | 3 | 5 |
| One rule for both lists | 2 | 5 | 2 | 4 |
| Three modes, no new data | 2 | 4 | 5 | 5 |
| **Total** | | **65** | **45** | **58** |

---

## Decision

Option A. Once a trip's packing is declared finished the hero carries the phase in its date line, a day counter, and two
blocks that are worked in place; only its head is a link. FR-7.9 has the details; FR-7.4's ruling that M1 takes no
actions is amended to say *except the shopping card and the hero's two blocks*.

## Consequences

**Positive**
- The dashboard after the packing shows what is left to do and lets it be done.
- The phase label, M6's tab and the shopping block read one rule (`listInFocus`).

**Negative / accepted costs**
- M1 is no longer read-only for tasks; every later dashboard feature has one exception more to argue against.
- A fold state exists per user and block, with an open question on where it lives (FR-7.9).
- The hero's tab order is longer than before; the Playwright cases must walk it.

**Neutral**
- No schema change and no new table; the portable backup is unaffected.

## Revisit Trigger

The owner asks for the packing list's own rows to be worked from the dashboard as well — that would put a third workable
list into the hero and is the point at which one screen holding three would need a different shape — or the hero is
measured taller than one phone screen on a trip with a full list.
