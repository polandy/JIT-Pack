# ADR-069: Finishing the packing is a stamp on the trip — and a half-packed row keeps what is in the bag

**Status:** Accepted (2026-09-20)
**Related:** FR-5.10, FR-5.5 (the skip this writes), FR-30.8 (which reads the stamp), FR-25.31 (the one undo),
ADR-033 (an absence is not an answer), ADR-067 (the schema change this costs), `internal/store/schema.sql`,
`client/src/domain/closePacking.ts`, `client/src/lib/tripPhase.ts`

**Decision Drivers (in priority order):**
1. **A decision must survive the next thing the user does.** The owner's own requirement for this feature
   (2026-09-20) is that the list stays workable afterwards: *„wenn ich auf der Reise etwas hinzufügen möchte, das ich
   eingepackt, aber vergessen hatte aufzunehmen"*. Whatever records „packing is finished" has to survive that row.
2. **Nothing the app says about the bag may be untrue.** Four of six socks are in the bag; no write may claim
   otherwise, and no figure may be completed by denying them (FR-25.22's reading of progress).
3. **A second screen reads this.** M6 and the dashboard card open on the list that is *now* (FR-30.8), so „closed"
   has to be a fact one function can ask about, not a sentence each screen re-derives.
4. **Cheapest change that holds.** Pre-ADR-067 a schema change costs every development database and a hand-carried
   upgrade of the live instance, so a column is bought, not assumed.

---

## Considered Options

### Option A — a stamp: `trips.packing_closed_at` *(recommended, accepted)*

One nullable TEXT column on `trips`, written alone through the master partition (NFR-4.2a merges it on its own), read
through `isPackingClosed` in the kernel so both sides of the FR-30.3 module boundary ask the same question. Closing
writes the rows and then the stamp; reopening writes `null`.

**Pros**
- Survives an addition, which is the feature's own requirement (driver 1).
- Carries a *moment*, so the list can say when it was closed and offer *Wieder öffnen*.
- One fact, one reader — M4, M6 and M1's card cannot drift (driver 3).
- The undo can take the decision back as a whole: the batch and the stamp are written together and lifted together.

**Cons**
- A schema change, which under invariant 2 means every development database is deleted and reseeded, and the live
  instance is carried across by hand until ADR-067's migration chain exists.
- One more column on the master feed, and one more field a future exporter has to decide about (it is deliberately
  *not* in the portable backup — progress never is).

### Option B — derive it: „nothing is open"

No schema change. A trip counts as closed while no row is open or partially packed.

**Pros**
- Free. No column, no reseed, no hand-carried upgrade.
- Cannot disagree with the rows, because it *is* the rows.

**Cons**
- **The next row added revokes it** — and adding a row afterwards is the point of the feature, not an edge case. The
  card would vanish, the ⋮ would offer the step again, and M6 would fall back to *Vor der Abreise*.
- There is no moment to show and nothing to reopen: „closed" that nobody recorded cannot be dated or lifted.
- A trip whose rows have not arrived yet reads as closed (ADR-033's failure, in a new place).

---

## Decision Matrix

| Driver | Weight | A · stamp | B · derived |
|---|---|---|---|
| Survives the next addition | 5 | 5 — the row is irrelevant to the stamp | 1 — the row silently revokes it |
| Can be shown and lifted | 4 | 5 — a moment, and *Wieder öffnen* | 1 — nothing to show |
| One fact, one reader | 3 | 5 — `isPackingClosed`, kernel-side | 3 — each screen re-derives from rows |
| Cheapest change | 2 | 2 — a column, a reseed, a hand-carried upgrade | 5 — free |
| **Total** | | **4.5** | 1.9 |

---

## Decision

Closing the packing writes `trips.packing_closed_at` and leaves the lifecycle alone; every screen reads the stamp
through one kernel predicate. And the rows it decides are written in **two** shapes, not one: a row nothing was packed
of becomes FR-5.5's skip (quantity 0), while a **half-packed row keeps what is in the bag** — its quantity shrinks to
`packed_count` and it reads as packed (variant P1 of the rendered round).

The two alternatives for that second half were weighed on the same drivers and lost to driver 2:

- **P2 — skip the whole row** (what M4's row menu already writes): denies four socks that travelled, and takes four
  packed rows away from M14's review.
- **P3 — `state='skipped'` beside the untouched numbers**: the most truthful record, and FR-5.5 already makes the row
  shape legal. It loses on cost: `packState.unitsOf` reads the numbers alone, so the trip line would sit at 4/6 for
  ever unless that rule learned the state — a change under every figure in the app, for a fact nothing displays yet.

---

## Consequences

**Positive**
- „Packing is finished" is a decision with a time, reversible in one tap, and readable by one function.
- The list stays fully workable afterwards: an addition lands *packed* while the packing is closed, so the record of
  the bag can be completed after the fact without reopening anything.
- FR-30.8 gets the trigger it needs for the case the trip's phase cannot express — the bag shut the evening before, on
  a trip nobody has tapped *Reise starten* on.

**Negative / accepted costs**
- Every development database was deleted and reseeded for this column, and the live instance needs the hand-carried
  `ALTER TABLE` of ADR-067 until the chain exists.
- **P1 records no remainder.** After closing, the socks row says four were wanted and four are packed; that two were
  left behind is gone. Reopening cannot restore the original amount, which is why *Wieder öffnen* lifts the stamp only
  and the snackbar's undo is the one path that restores the numbers.
- The stamp is a trip-level field that no conflict UI explains: two devices closing and reopening resolve by field-level
  LWW like every other column, and the loser sees no sentence about it.

**Neutral**
- The stamp is not in the portable backup, like every other piece of progress and like FR-7.3/7.4's todos.
- No actor is recorded: naming a person would need a server-side stamp (invariant 3), and Local Mode has nobody.

## Revisit Trigger

Either of these:

1. **Somebody asks what was left behind on a half-packed row** — a review proposal, an M14 column, or a question from
   the owner about „how many did we not take". That is P3's fact, and the moment it has a reader, `unitsOf` learning
   the state becomes worth its cost.
2. **A second trip-level decision needs the same shape** (a *Reise vorbereitet*, a *Rückreise gepackt*): two nullable
   moment columns on `trips` is the point at which a general „trip milestones" record beats a column per decision.
