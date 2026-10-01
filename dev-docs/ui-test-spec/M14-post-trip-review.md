# M14 — Post-Trip Review Assistant

The assistant is a **list** whose proposals target **groups** (FR-27.11). Every id is read clause by clause against
the built screen and against `ReviewPage.spec.ts`, which is where most of M14's rules actually live. **M14 is a screen
of derived proposals, so the domain answers for which proposals exist and the component test for what the list does with
them**; what e2e alone establishes is that archiving
arrives here, that the row's controls write, and that the group is read back from M8.

* **The closing card teases the proposals** (UI-Spec M14's *Navigation* line: *„teases the first two proposals and
  links to the full list"*): `ArchivedTripCard`'s `m4-closing-teaser` names them, asserted by E2E-M14-07 and, for a
  trip with nothing to review, E2E-M14-08.

* **E2E-M14-01** `all` (FR-9.1/9.2) — **implemented** (`e2e/review.spec.ts`): archiving a flagged trip
  auto-launches the assistant; a proposal reads correctly (kind chip *ungenutzt*/*fehlte*, the item name, the why line —
  "auf {n} Reisen nicht gebraucht" when the series history says so). **The last clause is the component's:** the why
  line has two branches and this trip is in no series, so `historyCount` returns 1 and only the singular branch is
  reachable here; the *domain* takes the count as a parameter (`flaggedTripCount`, unit-covered) and the function that
  computes it from the series is the page's own. It is asserted in `ReviewPage.spec.ts`, both directions: an archived
  sibling in the same series carrying the same flag makes the line read *2*, and an archived trip in a **different**
  series does not. Not
  e2e, deliberately — the world is E2E-M12-03's two-trip lifecycle staging, which is the suite's most expensive, for one
  sentence.
* **E2E-M14-02** `all` (FR-9.2/1.6) — **implemented**, both halves read back out of M8: Apply writes directly
  to the row's target **group** — shared instance-wide per the FR-1.6 MVP simplification; **no fork prompt exists** —
  which is a statement about FR-1.6's model rather than an assertable behaviour, since there is no fork code in any mode
  for a case to find absent (the clause is kept as the reason apply is one tap, not as coverage). An
  *unused* apply zeroes the position, a *missing* apply adds one (creating the master item first for an ad-hoc name).
* **E2E-M14-03** `all` (FR-9.2) — **implemented for the pair scope and its persistence**: "Never ask again"
  removes that row and only that row, and the dismissal outlives the visit (the assistant is recomputed from current
  state, so this is the only piece of it that is stored). The second clause — *the same item still surfaces for another
  group* — needs the same item flagged twice under two groups, which one trip cannot produce; it stays unit-owned in
  `domain/__tests__/review.spec.ts`, and this sentence is its revisit trigger.
* **E2E-M14-04/04b** `all` (FR-27.11) — **implemented**, split in two cases (`E2E-M14-04` for the targets,
  `E2E-M14-04b` for the blast radius, which needs a second planning trip following the group): every proposal names a
  **group** as its target and the picker offers groups only — never a Ferien-Vorlage (**that half is unit-owned**: this
  case's world contains two groups and no Vorlage, so the absence is of something absent;
  `ReviewPage.spec.ts` and `retargetGroups` in `domain/__tests__/review.spec.ts` both assert it against a world that has
  one); an *unused* row's picker offers only groups that actually carry the item, since zeroing a position that does not
  exist would apply as nothing. An *unused* proposal defaults to the group the row came from; a *missing* ad-hoc row
  defaults to the trip's dominant group (**the dominant-group default is the domain's**, `buildReviewProposals — missing
  flags default to the dominant group`: the e2e reads the picker's *options*, not its current value). Applying writes to
  that group; the row states the FR-27.4 blast radius ("Wirkt auf N geplante Reisen …") when planning trips use the
  target. *(The FR-27.4 applied-change entry on each planning trip is produced by the refresh: M14 writes to the group,
  and the trips following it log the change on their next open — one mechanism, so M14 owes no push of its own.)* **The
  FR-27.12 peek** — the chevron beside the picker, which opens the target group's
  resolved contents before the proposal is written into it — is covered here: the case opens it on the *missing* row,
  reads the group's two positions out of it, asserts the proposed item is **not** among them — which is why there is a
  proposal — and closes it. Red-proved by pointing the trigger at `null`.
* **E2E-M14-05** `all` (FR-27.11, FR-9.4) — **implemented**: the assistant renders as a
  **list with an open count**, not a card stack; applied and skipped rows remain visible and marked rather than
  disappearing, and "nie mehr fragen" removes the row for that item–group pair only. The case also pins (FR-9.4)
  **where** a handled row is: out of *Offen*, into the *Erledigt* block, counted once on each side — and the finished
  state reached by handling both rows rather than by dismissing them.
* **E2E-M14-07** `all` (FR-9.4) — **implemented** (`review.spec.ts`): the archived trip's closing card names the
  proposals it would offer. It lives in the review spec rather than beside the closing pass because **a proposal needs a
  row with provenance** — an ad-hoc row judged *unused* proposes nothing, since there is no position to zero — and that
  world is `review.spec.ts`'s own fixture.
* **E2E-M14-08** `all` (FR-9.4) — **implemented** (`closing-pass.spec.ts`): a trip with nothing to review says so on
  the card. The positive signal is the card itself, on screen either way — listing nothing and *saying* nothing are the
  same pixel otherwise, and the second reads as "not loaded".
* **E2E-M14-06** `all` (FR-9.2) — **implemented**: no flags → archiving
  skips the assistant with a "nothing to review" toast; opened directly, the screen shows the honest empty state;
  applied rows don't reappear on a later visit (resumability). The case archives rather than navigating straight to
  `/review`: it takes the trip through *Reise starten* → the closing pass →
  *Fertig* and asserts that the trip **is** archived and the assistant was **not** opened, read off the archived M4's
  own closing card. **The trap:** `review.nothingToast` and `review.empty` are
  character-identical in both catalogues (*„Nothing to review — no flags were set."*), so a case asserting only the
  toast's text would pass just as well on the screen the clause is about not reaching. The toast is also filtered by
  that text rather than located as *a* toast — *Reise gestartet* is still on screen seconds earlier, and two matches are
  a strict-mode failure that presents as a flake. **The third clause is (a): already asserted elsewhere.** Resumability
  is not stored state — `buildReviewProposals` recomputes from current state, and both halves of "an applied row stops
  appearing" are pinned in `domain/__tests__/review.spec.ts` (*yields nothing when the group position is already
  zeroed*, *skips items the default group already contains*), which is the arithmetic an applied proposal produces.
