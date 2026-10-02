# E2E coverage ledger

Which cases from [`ui-test-spec/`](../ui-test-spec/README.md) are actually implemented, and where. The spec says what *should* be covered; this ledger says what *is*. When the two disagree, the ledger is the one that is right.

The implementation lives in [`client/e2e/`](../../client/e2e/), whose README holds the running instructions and selector conventions.

## The rule that comes before the units

**A UI change ships a *passing* Playwright case in the same PR — and the
global patterns count.** Stated by the owner on 2026-08-13 after four
navigation defects were found by hand while both the M3 and M4 units were
green: the rail did nothing, mobile had no navigation at all, `‹ back`
did nothing, and a screen's search icon went on filtering that screen
after the user had left it. A per-screen suite proves the screen and says
nothing about getting to it or leaving it.

Two consequences worth stating as rules of their own, because each was
paid for by one of those defects:

- **Assert what is rendered, never only the URL.** Every one of those
  failures kept `expect(page).toHaveURL(...)` green — the address moved
  and the screen did not. Scope assertions to
  `ion-router-outlet > .ion-page:not(.ion-page-hidden)`.
- **Never wait for a duration.** Where nothing observable exists to wait
  on, that absence is the defect: the G-2 indicator now reports an
  in-flight Local Mode write because E2E-M4-32 needed to know when the
  data was actually on disk.

## Working rule: one unit per PR

A "unit" is one spec file covering one screen or one flow. A feature PR that adds UI adds its unit in the same PR — never as a follow-up.

Keeping it to one unit per PR is not a style preference: two PRs that each add cases tend to collide on the same `data-testid` names and the same shared fixture, and git merges both cleanly while the suite breaks. **After merging `main` into a long-lived branch, re-check that the testids and helper names you added are still unique.**

## Conventions that matter

**They live in [`client/e2e/README.md`](../../client/e2e/README.md), not here.**
That file is the on-ramp: how to run one case on this host, the helper
vocabulary as a table, and the binding rules — `data-testid` only, the visible
page rather than the URL, Ionic's inner `<input>`, scoped `row-*` locators, no
sleeps, the two clicks an archive takes, and the desktop-width trap that costs
an hour. They were written in both places and drifted; the README has them now
and this ledger stays what it is, the record of what the suite covers.

## Order of attack

Following spec §10, adjusted for what is now built:

1. ~~Playwright scaffold + smoke per mode~~ — done.
2. ~~A data-producing unit, so later units have a trip to work with~~ — done (M3; `createTripViaWizard` in `fixtures.ts` is the seed helper).
3. ~~M4 packing list~~ — done; the `data-testid` pass on `PackingListPage.vue` landed with it. **Superseded by the screen audits** (2026-08-30): this list was written when the work was "write the missing cases", and it has been overtaken by reading each screen's promises against the screen — M6, then M4, then M5. The sentence that stood here, *„Next: M5, which both completes its own cases and unlocks the M4 facet cases parked above"*, was wrong in both halves by the time anyone read it again: the M4 facet cases turned out to have been covered as unit tests all along, and M5 had been worked on repeatedly without its catalogue ever being read. **An order of attack goes stale silently** — nothing fails when it does.
4. Global patterns (§3) — they underpin every screen.
5. Local Mode delta: persistence across reload, serverless export, M19 switching.
6. ~~`jitpackd` harness~~ → Single-User cases (largest surface, simplest
   infra). The harness is built (the `single` project, 2026-08-20 — see the
   unit at the end of this file); the per-screen `single` cases remain.
7. Mock IdP → Server/collaboration multi-client cases.
8. Cross-screen flows + non-functional journeys.

## What the suite costs, measured

Numbers from 2026-08-19, taken inside the pinned image on the maintainer's
machine with 2 workers, because the sharding decision needed them:

| | Chromium | WebKit |
|---|---|---|
| Tests | 123 | 123 |
| Wall clock | 3.8 min | 10.6 min |

WebKit is where the budget matters. **16 of its 123 tests take 20 s or more**,
and the slowest passing one took 31.9 s — against Playwright's 30 s default,
which the config had never overridden. That is the cost of §2.4: a unit that
builds its world through M7 → M8 → M3 is worth far more than one that seeds
storage directly, and on WebKit it costs real seconds. The budget is now set
explicitly at 60 s in `playwright.config.ts` with that measurement written
beside it.

Two consequences worth keeping in mind when adding a unit: a new §2.4 unit is
not free, and a WebKit failure reading *"Test timeout of 60000ms exceeded"* at
a different line on each attempt is a unit that outgrew its budget, not a
broken assertion.

**What the FR-27.4 unit covers since 2026-08-18.** E2E-M8-09 runs the whole
question: a group edited after the trip was generated shows up as M2's proposal chip on
a freshly booted app and is *offered* on the trip's next open — the card names the change while the list has not moved —
accepting puts the row on the list, and M2 then carries the "⟳ N Änderungen"
chip naming the group and the item. E2E-M8-19 runs the refusal, and its real
assertion is the return trip: the trip re-derives on every open, so a refusal
held only in memory would ask again the moment you come back. Both were
mutation-proved — restoring the old apply-on-open behaviour turns M8-09 red at
the "offered, not applied" assertion, and a decline that applies the plan
instead of its ledger half turns M8-19 red. The unit moved out of
`template-editor.spec.ts` with the model change: the surface under test is M4
and M2, not the editor.

One thing it does *not* prove: that a **past** trip is never asked. Reaching
one in the browser needs either the planning→active transition no UI ships or
a trip whose end date has gone by, and the wizard's dates are the user's, not
the clock's — so the boundary lives where it can be stood on from both sides,
in the `followsGroups` unit with an injected `today`. E2E-M8-11's
propagation-log half is covered generically by M8-09; the task-specific line
lives in the `groupRefresh` unit. E2E-M8-05 covers the warning surface
that exists today, in both directions (the Vorlage names the trip, and the
group reaches it through the include), plus the absence case *before* the trip
exists — a positive-signal pairing, not a lone not-there assertion. The sheet's
FR-25.15 ●→✓ flip is unit-tested on `SaveIndicator` against a controlled
state; e2e asserts presence and the settled tooltip — racing the transient
● would be a forbidden timing dependency (M8-14 amendment 2026-08-15).

## Files

[`status.md`](status.md) is the table of what is implemented, unit by unit — the file to read and to
update. The dated narratives behind it are in one file per month, each opening with its own index;
search their index lines (`grep -h "^- \[" dev-docs/e2e-ledger/*.md | grep -i <word>`) rather than
reading a file. **A new narrative goes at the bottom of the current month's file**, with an index line.

| Month | Narratives |
|---|---|
| [`2026-08`](2026-08.md) | 91 |
| [`2026-09`](2026-09.md) | 30 |
