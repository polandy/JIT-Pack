# E2E coverage ledger

Which cases from [`UI_Test_Spec_v1.0.md`](UI_Test_Spec_v1.0.md) are actually implemented, and where. The spec says what *should* be covered; this file says what *is*. When the two disagree, this file is the one that is right.

The implementation lives in [`client/e2e/`](../client/e2e/), whose README holds the running instructions and selector conventions.

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

## Status

| Unit | Spec cases | Mode | File |
|---|---|---|---|
| Harness smoke | E2E-M19-01 (partial), E2E-M19-04, E2E-G7-01 | `local` | [`smoke.spec.ts`](../client/e2e/smoke.spec.ts) |
| Navigation / one header bar | E2E-G9-03 … E2E-G9-08 | `local` | [`navigation.spec.ts`](../client/e2e/navigation.spec.ts) |
| M3 trip creation | E2E-M3-01, E2E-M3-03, E2E-M3-13 (incl. the FR-25.9 absence check), E2E-M3-05, E2E-M3-10, E2E-M1-05 | `local` | [`trip-creation.spec.ts`](../client/e2e/trip-creation.spec.ts) |
| Global navigation & app bar | E2E-G9-09, E2E-G9-10, E2E-G1-01 (partial), E2E-G1-02, E2E-G1-03, E2E-G12-01 (partial), E2E-G12-02, E2E-G8-02, E2E-M3-11, E2E-M3-12, E2E-M4-32 | `local` | [`global-nav.spec.ts`](../client/e2e/global-nav.spec.ts) |
| M5 item detail | E2E-M5-09 … E2E-M5-12 | `local` | [`item-detail.spec.ts`](../client/e2e/item-detail.spec.ts) |
| M4 packing list | E2E-M12-06, E2E-M4-01, E2E-M4-04, E2E-G6-02, E2E-M4-18 (both directions), E2E-M4-20, E2E-M4-21, E2E-M4-22, E2E-M4-23, E2E-M4-15 (partial), E2E-M4-02 (partial), E2E-M4-28 (partial) | `local` | [`packing-list.spec.ts`](../client/e2e/packing-list.spec.ts) |
| Typography | E2E-G13-01, E2E-G13-02 | `local` | [`typography.spec.ts`](../client/e2e/typography.spec.ts) |
| Colour anchors | E2E-G11-02, E2E-G11-03, E2E-G11-04 | `local` | [`colour-anchors.spec.ts`](../client/e2e/colour-anchors.spec.ts) |

**What the colour unit does *not* prove.** That the palette is *pleasant* —
only that each role landed on the component it belongs to and that the three
stay apart. It also asserts nothing about contrast: the ratios *were*
measured while choosing Latte's brand (they are in
`design-foundation-plan.md`), but nothing re-checks them when a token
moves. Making that a gate belongs to the baselines step.

**What the typography unit does *not* prove.** That the type is *right* —
only that both faces reach the screen and that neither is fetched from
somebody else's server. Appearance is untestable here by design (spec §3);
the baselines that make "looks right" assertable are the fifth step of
`design-foundation-plan.md`, and until they land the eyeball pass is the
gate.

**What the M4 unit deliberately leaves out, and why.** Every facet case
beyond the panel's own structure — E2E-M4-16 (OR-within/AND-across),
-17 (counts), -19 (the *Gemeinsam* bucket) — needs rows carrying a
category, a traveler or a buy mode, and **none of those can be set from
M4**: the quick-add produces uncategorised, unassigned `pack` rows. Spec
§2.4 forbids injecting such rows around the app, so these cases arrive
with the screens that can produce them (M5, and the M9/M10 rebuild).
Likewise E2E-M4-12/-13 (per-person clusters) need FR-25.8's per-person
quick-add, -26/-27 need FR-27.10's group add, and -24/-30/-31 need a
second account: all unbuilt or `server`-only today.

E2E-M4-28 covers the *session* half of FR-25.18 by leaving M4 and coming
back; the *fresh session* half is a unit test on `usePackingFilter`,
because reaching it in the browser needs a reload — see the finding
below.

**Corrected 2026-08-13.** An earlier version of this file reported that
Local Mode loses a trip's items on reload. That diagnosis was wrong, and
the way it was wrong is the useful part: the rows were written *and*
loaded correctly, but the packing list crashed while rendering them (its
app-bar actions were teleported into DOM that Ionic relocates), so an
empty screen read as lost data. A second, real defect sat underneath —
the Local Mode write was fire-and-forget, so a reload immediately after
adding a row cancelled the transaction. Both are fixed and both are
covered by **E2E-M4-32**, which waits on the sync indicator settling
rather than on a duration.

**Not yet covered:** everything else in spec §3 (global patterns G-1–G-12), §4 (M1–M21 beyond the above), §5 (cross-screen flows) and §6 (non-functional journeys). The `single` and `server` modes have no coverage at all — they need a real `jitpackd` harness and, for `server`, a mock IdP (spec §10 steps 3 and 5).

This is a small fraction of the specified suite. Do not read a green `e2e` job as "the UI is verified".

## Order of attack

Following spec §10, adjusted for what is now built:

1. ~~Playwright scaffold + smoke per mode~~ — done.
2. ~~A data-producing unit, so later units have a trip to work with~~ — done (M3; `createTripViaWizard` in `fixtures.ts` is the seed helper).
3. ~~M4 packing list~~ — done for what M4 can produce on its own (see above); the `data-testid` pass on `PackingListPage.vue` landed with it. **Next: M5**, which both completes its own cases and unlocks the M4 facet cases parked above.
4. Global patterns (§3) — they underpin every screen.
5. Local Mode delta: persistence across reload, serverless export, M19 switching.
6. `jitpackd` harness → Single-User cases (largest surface, simplest infra).
7. Mock IdP → Server/collaboration multi-client cases.
8. Cross-screen flows + non-functional journeys.

## Conventions that matter

- **`data-testid` only.** Never text or CSS-class selectors. Adding the missing testids to a component is part of writing the case, and the attribute is the contract — renaming one is a breaking change to the suite.
- **Ionic inputs need `.locator('input')`.** `getByTestId('x')` finds the `<ion-input>` host; the fillable element is the `<input>` inside it.
- **Seed through the app, not around it** (spec §2.4). Use `createTripViaWizard` and friends. A fast-path that writes rows directly is allowed only for `server`-mode preconditions that are not themselves under test.
- **No sleeps, ever.** Playwright's `expect` retries on its own; assert the outcome, never wait a fixed time for it. If a case can only pass by waiting and hoping, the fault is in the production code — give it a deterministic seam. This is the same rule the Go suite follows and it is not negotiable in either.
- **Tags:** `@smoke`, `@local`, `@single`, `@server`, plus `@mNN` per screen. Run a slice with `npm run test:e2e -- --grep @local`.
