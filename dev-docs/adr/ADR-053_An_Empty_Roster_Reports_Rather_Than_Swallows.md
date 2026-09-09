# ADR-053: A per-person position with nobody to belong to — report it vs. forbid the state

**Status:** Accepted
**Related:** FR-1.4 (assignment types), FR-2.5/2.5a (travellers and their defaults), FR-25.1 (per-traveler instances),
FR-27.4 (group refresh), FR-27.10 (adding a group to a running trip), ADR-036 (keep-and-repoint per-person),
`client/src/domain/instantiate.ts`, `client/src/domain/groupAdd.ts`

**Decision Drivers (in priority order):**

1. **Nothing a template said may disappear without being said out loud.** §3.27's whole stance is that a composition
   *reports* — merges are named, duplicates are named, conditions are named. A position that fans out to zero rows was
   the one thing that left no trace at all: the preview simply counted lower than the group contains.
2. **The empty roster is a legitimate state, not a mistake to be corrected.** Step 2 accepts it, says so in its own
   empty hint, and it is what a fresh device starts the wizard in, because FR-2.5a's defaults are empty until somebody
   configures them. A solo trip whose owner never types their own name is an ordinary trip.
3. **The same answer has to hold on every generation path.** M3 is one of three: FR-27.10 adds a group to a trip that
   already exists, and FR-27.4 re-resolves one. A fix that only a wizard step can carry fixes a third of the defect.
4. **The report has to name the remedy.** "Something is missing" is worth little; "these need a traveller" is
   actionable, and the action is one step away.

---

## Considered Options

### Option A — generation reports what it could not place *(recommended, accepted)*

`generateTripItems` gains a fourth report beside `excluded`, `merged` and `alreadyIncluded`: the per-person positions
an empty roster left with nobody to belong to. M3's step-3 preview renders it as an open block naming the items and the
step to go back to; FR-27.10's report gains a sixth outcome so a group of per-person positions answers *"needs a
traveller"* instead of *"contributes nothing to this trip"*.

**Pros**

- It is the shape §3.27 already uses for every other thing a composition decides, so it needs no new idea — one more
  list on a result that is already three lists.
- Every caller inherits it, because the rule lives in the resolution rather than in a screen. That is what makes it
  cover the group-add path without a second implementation.
- It leaves the state alone. A trip with nobody on it stays creatable, and the per-person positions of a group that is
  added to it stay a fact the user is told about rather than a decision made for them.
- The report filters like the exclusion report does: an item another position placed trip-global is on the list, so
  asking for a traveller on its account would be work with nothing behind it.

**Cons**

- A report is not a guard. The user can read it and create the trip anyway, and the positions are then genuinely not
  there — recoverable only by adding a traveller and taking FR-27.4's refresh, which is a longer road than the wizard.
- One more thing the preview says, on a screen that already says five.
- It does not reach FR-27.4. Its plan is a diff, with nowhere to put a line about something that was never placed —
  and the refresh's rule is a different one anyway (see *Consequences*).

### Option B — make an empty roster invalid in step 2

Step 2's gate learns that a trip needs at least one traveller, the way it already refuses an unnamed one.

**Pros**

- The defect becomes unreachable on the M3 path rather than reported, which is always the stronger fix.
- No new vocabulary, no new preview block: one clause in an existing validity computation.

**Cons**

- It forbids a state the product supports everywhere else, for the benefit of a case that may not apply: a trip picking
  only trip-global positions has no use for a roster, and demanding a name for it is a question asked of the user for
  nothing — the reasoning that retired the Adult/Child field with FR-25.9.
- It fixes one of three paths. A trip's roster can be emptied after creation, and FR-27.10 then adds a group to it with
  no wizard step anywhere in sight.
- It moves the failure earlier without explaining it. The user is stopped on step 2 for a reason that lives in a group
  they have not picked yet, on a step that does not know which groups those will be.

### Option C — fall back to trip-global when the roster is empty

A per-person position with no travellers places one trip-global row instead of none.

**Pros**

- Nothing is lost and nothing has to be read: the item reaches the list.

**Cons**

- It silently changes what the item means. Four toothbrushes for a family that has not typed their names yet becomes
  one, and the row says nothing about having been demoted.
- It collides with ADR-036. Turning a row per-person is a decision with an owner and a writer (FR-25.21's membership
  sheet); this would be a second, implicit writer of the same transition, running in the opposite direction and
  triggered by a state rather than by a person.
- It makes FR-27.4 incoherent. Once travellers are named, the refresh finds a trip-global row where a per-person one
  belongs and has to decide between adopting it and adding beside it — a reconciliation the model does not owe today.

---

## Decision Matrix

| Driver | Weight | A — report it | B — forbid the state | C — fall back to trip-global |
|---|---|---|---|---|
| Nothing disappears unsaid | 5 | 5 — named on every path that generates | 4 — unreachable on M3, silent elsewhere | 2 — nothing disappears, but the meaning does |
| The empty roster stays legitimate | 4 | 5 — untouched | 1 — the state is removed | 4 — untouched |
| Holds on all three paths | 4 | 4 — M3 and FR-27.10; FR-27.4 excepted | 1 — M3 only | 3 — all three, wrongly |
| The remedy is named | 3 | 5 — the items and the step | 3 — a gate, not a reason | 1 — nothing to remedy, nothing said |
| **Total** | | **76** | **44** | **47** |

---

## Decision

Generation reports the per-person positions an empty roster cannot place, as its own category rather than as an
exclusion — no condition decided against them, and what they lack is a traveller rather than a different trip. M3's
step-3 preview names them in an open block; FR-27.10's group add answers *"needs a traveller"* rather than
*"contributes nothing to this trip"*. The empty roster stays a valid state on every screen that has one.

## Consequences

**Positive**

- The M3 preview's item count and the group it resolves can no longer disagree without the screen saying why.
- FR-27.10's report stops making a false statement. A group whose every position is per-person previously answered
  *"contributes nothing to this trip"*, which is wrong about the group and unactionable besides.
- The rule is in the resolution, so a fourth caller inherits it for free.

**Negative / accepted costs**

- **FR-27.4's refresh does not report it**, and that is deliberate rather than pending. The refresh's rule is that the
  roster is part of the plan — a traveller added gets the per-person positions, one removed takes their untouched rows
  with them — so a trip whose roster went empty is *supposed* to lose those rows, and a report there would contradict
  the removal it is planning beside it. The gap is that a trip which *never* had travellers and follows a group is
  told nothing at refresh time either; that is the first revisit trigger below.
- The user can still create a trip that is missing the positions. The report is a sentence, not a gate.
- Sixth outcome in `groupAdditionMessage`, and a fourth block in the M3 preview.

**Neutral**

- Mode-invariant by construction: generation is client-side in all three modes (invariant 4), and the report is a field
  on its result.

## Revisit Trigger

- **The first time somebody loses rows at an FR-27.4 refresh rather than at generation** — that is the path this
  decision deliberately left uncovered, and the fix is a line in `RefreshPlan` rather than a re-argument of this ADR.
- **If step 2 ever gains a required roster for an unrelated reason**, the M3 half of this becomes unreachable code and
  should be removed rather than left standing as a claim about a state that no longer exists.
