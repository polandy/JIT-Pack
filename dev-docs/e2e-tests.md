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
| M3 trip creation | E2E-M3-01, E2E-M3-03, E2E-M3-14 (incl. the FR-25.9 absence check), E2E-M3-05, E2E-M3-10, E2E-M1-05 | `local` | [`trip-creation.spec.ts`](../client/e2e/trip-creation.spec.ts) |
| Global navigation & app bar | E2E-G9-09, E2E-G9-10, E2E-G9-11, E2E-G1-01 (partial), E2E-G1-02, E2E-G1-03, E2E-G12-01 (partial), E2E-G12-02, E2E-G8-02, E2E-G2-02, E2E-G2-03, E2E-M3-15, E2E-M3-16, E2E-M4-32 | `local` | [`global-nav.spec.ts`](../client/e2e/global-nav.spec.ts) |
| M5 item detail | E2E-M5-09 … E2E-M5-14 | `local` | [`item-detail.spec.ts`](../client/e2e/item-detail.spec.ts) |
| M4 packing list | E2E-M12-06, E2E-M4-01, E2E-M4-04, E2E-M4-36, E2E-G6-02, E2E-M4-18 (both directions), E2E-M4-20, E2E-M4-21, E2E-M4-22, E2E-M4-23, E2E-M4-15 (partial), E2E-M4-02 (partial), E2E-M4-28 (partial) | `local` | [`packing-list.spec.ts`](../client/e2e/packing-list.spec.ts) |
| Typography | E2E-G13-01, E2E-G13-02, E2E-G13-03, E2E-G13-04 | `local` | [`typography.spec.ts`](../client/e2e/typography.spec.ts) |
| Colour anchors | E2E-G11-02, E2E-G11-03, E2E-G11-04, E2E-G11-05 | `local` | [`colour-anchors.spec.ts`](../client/e2e/colour-anchors.spec.ts) |
| Visual baselines | E2E-VIS-01 … E2E-VIS-07 | `local` | [`visual.spec.ts`](../client/e2e/visual.spec.ts) |
| Pack-out & undo | E2E-M4-33, E2E-M4-34, E2E-M4-35 | `local` | [`pack-out.spec.ts`](../client/e2e/pack-out.spec.ts) |
| Deliberately not packed | E2E-M4-37 … E2E-M4-42, E2E-M5-16 | `local` | [`skip-item.spec.ts`](../client/e2e/skip-item.spec.ts) |
| Surfaces | E2E-G14-01, E2E-G14-02, E2E-G14-03 | `local` | [`surfaces.spec.ts`](../client/e2e/surfaces.spec.ts) |
| M7 template scopes | E2E-M7-04, E2E-M7-06 (partial), E2E-M7-07 (completed by the M8 unit), E2E-M7-08, E2E-M7-09 | `local` | [`template-list.spec.ts`](../client/e2e/template-list.spec.ts) |
| M8 template editor | E2E-M8-01, E2E-M8-02, E2E-M8-03, E2E-M8-04, E2E-M8-05, E2E-M8-06 (as amended), E2E-M8-07 (incl. E2E-M7-07's include half), E2E-M8-08, E2E-M8-10, E2E-M8-11 (editor half), E2E-M8-12, E2E-M8-13, E2E-M8-14, E2E-M8-16, E2E-M8-17 | `local` | [`template-editor.spec.ts`](../client/e2e/template-editor.spec.ts) |
| M9/M10 inventory & item editor | E2E-M9-01, E2E-M9-02, E2E-M9-03, E2E-M10-01 … E2E-M10-05 (this row was owed since the unit landed) | `local` | [`inventory.spec.ts`](../client/e2e/inventory.spec.ts) |
| M11 containers | E2E-M11-02, E2E-M11-04, E2E-M11-05 (incl. M11-01's create/edit), E2E-M11-06 (incl. M11-01's delete, M11-03 folded in) | `local` | [`containers.spec.ts`](../client/e2e/containers.spec.ts) |
| M12 analytics | E2E-M12-01, E2E-M12-02, E2E-M12-03 (absence half only, see below), E2E-M12-04, E2E-M12-05 | `local` | [`analytics.spec.ts`](../client/e2e/analytics.spec.ts) |
| M3 composed templates | E2E-M3-11, E2E-M3-13, E2E-M3-18 | `local` | [`trip-composition.spec.ts`](../client/e2e/trip-composition.spec.ts) |
| M18 backup & restore | E2E-M18-05, E2E-M18-06 | `local` | [`backup-restore.spec.ts`](../client/e2e/backup-restore.spec.ts) |
| M14 review | E2E-M14-06 (empty-state half only, see below) + a G-9 back case | `local` | [`review.spec.ts`](../client/e2e/review.spec.ts) |

**Why E2E-M7-06 is partial.** The case asks for an empty-state *CTA*
(create / import). The screen has neither as a button: create is the FAB and
import is the header icon, both already on screen. The case asserts what the
empty state does say and that the segment is absent; the UI-Spec now records
the missing CTAs as a decision rather than an omission.

**E2E-M7-07 is complete since the M8 unit.** Its include-dependent half — the
*"N Gruppen ·"* prefix and the *enthält: …* line — needed a Ferien-Vorlage
that actually includes a group, a write only the M8 rebuild could make; the
M8-07 case now builds that composition through the app and asserts both lines
on the M7 row. The resolution arithmetic stays covered where it lives, in
`client/src/domain/__tests__/templates.spec.ts`. One M7 case stays
unimplemented because the surface does not exist: **E2E-M7-05** (Import from
the FAB menu; import is a header icon).

**How E2E-M7-04 is split, and why.** The e2e case drives the menu through
`contextmenu` — the same handler the touch hold fires into — and asserts the
guard both ways: a row click is inert while the menu lives (the sheet staying
up is the positive signal), and the next tap after dismiss opens the row.
The 500 ms themselves are unit-tested in
`client/src/composables/__tests__/useLongPress.spec.ts` with fake timers,
**not** e2e-tested: a real-time hold is a forbidden timing dependency, and
`page.clock` turned out unable to drive Ionic's overlay presentation
deterministically on a warm app (the sheet nondeterministically failed to
attach under the faked clock — observed on chromium repeat runs and, wedged
differently, on webkit, where an infinite spinner animation also defeats any
`getAnimations()`-based settle). What this leaves untested is the one-line
wiring from the row's `pointerdown` to the composable — accepted and stated
here rather than covered by a wait-and-hope. The guard's first version was
in fact wrong (a stale one-shot swallow-next-click flag that ate the next
legitimate tap because the hold's release click usually lands on the
overlay, not the row); the red case that caught it is the dismissed-then-tap
assertion that survives in the contextmenu case.

**The visual unit is the only one that asserts appearance, and it is not
part of `npm run test:e2e`.** It runs under `make visual` and in its own CI
job, inside the digest-pinned Playwright image both sides use (ADR-013);
outside that image the images mean nothing. What it does *not* cover: the
dev gallery, which is `import.meta.env.DEV`-only and therefore absent from
the bundle these baselines drive, so component states are guarded by nobody.
That is a deliberate trade — the alternative was shipping a developer
surface into every self-hosted instance to make it screenshottable.

Two things had to be made deterministic before any of it was worth having,
and both are recorded at the top of the spec: ids are stubbed (Ionic paints
avatar colours from a hash of a `crypto.randomUUID()` seed, so every run
would otherwise differ), and the clock is **not** frozen — freezing it stops
a pack from reaching the store, which no baseline needed and one state could
not survive.

**What the surfaces unit does *not* prove, and the one thing only it
could.** It proves a card is painted a different plane than its page and
that its shadow survives the flavour switch. It does not prove the *depth
is right* — that a card looks lifted rather than floating — which stays an
eyeball matter until the baselines land. What makes it worth having is the
opposite direction: this defect was **invisible to the stylesheet**. The
card asked for `--ct-mantle`, a real palette token, and passed the colour
invariant and its unit suite while being the same colour as the page. A
rendered pixel was the only witness.

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

**Not yet covered:** everything else in spec §3 (global patterns G-1–G-15), §4 (M1–M21 beyond the above), §5 (cross-screen flows) and §6 (non-functional journeys). The `single` and `server` modes have no coverage at all — they need a real `jitpackd` harness and, for `server`, a mock IdP (spec §10 steps 3 and 5).

This is a small fraction of the specified suite. Do not read a green `e2e` job as "the UI is verified".

**What the M8 unit deliberately leaves open.** E2E-M8-09 (the "⟳ N Änderungen"
chip on M2) and E2E-M8-11's propagation-log half assert the FR-27.4
*applied-changes log*, which needs the planning-trip refresh — that is the
§3.27 client package, not the editor. E2E-M8-05 covers the warning surface
that exists today, in both directions (the Vorlage names the trip, and the
group reaches it through the include), plus the absence case *before* the trip
exists — a positive-signal pairing, not a lone not-there assertion. The sheet's
FR-25.15 ●→✓ flip is unit-tested on `SaveIndicator` against a controlled
state; e2e asserts presence and the settled tooltip — racing the transient
● would be a forbidden timing dependency (M8-14 amendment 2026-08-15).

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

## M9/M10 — inventory and item editor (`e2e/inventory.spec.ts`, 2026-08-16)

Eight cases, Local Mode, landing with the §3.24 tag rebuild. What they cover
is deliberately what a unit test cannot: the *painted* result of the two
grouping rules, and the shape of the creation form.

| Case | Spec id | What it pins |
|---|---|---|
| an item on two tags renders once, under its primary tag | E2E-M9-01 | FR-24.2's whole guarantee. A naive "file under every tag" passes every unit test of the store and fails this. |
| the tag axis filters on any tag, not only the primary one | E2E-M9-06 | The axis filters *wider* than the list groups — the two rules differ only in what is rendered. |
| the list is lean until the properties sheet says otherwise | E2E-M9-05 | FR-24.4 end to end: the weight exists on the item, is absent from the row, and appears after the toggle. Asserted on the row, not on `localStorage`. |
| creating hides the sections an item cannot have yet | E2E-M10-07 | FR-24.5 "absent, not emptied", plus the "Mehr ▾" fold. |
| a missing name is answered with a hint, not a dead button | E2E-M10-07 | The button stays live and says why — the failure mode a disabled control hides. |
| a duplicate name is reported before it reaches the push | E2E-M10-10 | The consequence of `UNIQUE(name)` (ADR-014) reaching the user as a sentence rather than a failed sync. |
| an unmatched tag name is created and assigned in one step | E2E-M10-08 | Filter-or-create, including the *second* item finding the tag instead of duplicating it. |
| unassigning a tag refiles the item | E2E-M10-08 | The store's cascade mirroring, seen from the list. |

**Not covered here, on purpose:** the device-local *reload* half of FR-24.4
is unit-tested in `composables/__tests__/inventoryProperties.spec.ts`, where
the storage seam actually is — an e2e reload assertion would test the browser
more than the preference. The ordering arithmetic behind the grouping lives
in `domain/__tests__/tags.spec.ts`, mutation-proven: filing an item under
every tag instead of its primary one drops two of those cases.

**Four traps this suite paid for, all in one sitting.**

1. The first run was green-looking nonsense: `npm run build` ran from the
   wrong directory, failed silently, and Playwright drove the *previous*
   bundle. Missing testids read exactly like broken selectors. Rebuild from
   `client/`, and check the build actually said so.
2. The ledger's own "`data-testid` only" rule earned its keep — the first
   draft asserted on `.group-head` and on a chip's visible text, which would
   have broken on any restyle and on the German catalogue respectively.
3. **A rendered assertion must not encode a styling decision.** Group
   headings wear `.jp-eyebrow`, which uppercases in CSS, so `allInnerTexts()`
   returns "KLEIDUNG". The helper lower-cases: the casing is the type role's
   business, the word is the test's.
4. **Scope every locator to the painted page, including the FAB.** An
   unscoped `getByTestId('m9-fab')` resolves the *outgoing* page's button
   during a transition, and a button that is still animating never becomes
   stable — which surfaces as a 30 s click timeout, not as a wrong-element
   error. The `visible()` helper exists for exactly this and has to be used
   everywhere, not only where an assertion looked ambiguous.
5. **`fill()` on an Ionic input can lose its event, and the damage shows up
   nowhere near the cause.** `fill()` dispatches a single DOM `input` event
   that the component must re-emit as `ionInput` for Vue to see. On WebKit
   that one event is occasionally lost: the field shows the text while the
   bound ref stays empty. On M10's tag search that means *neither* a match
   chip nor a create chip renders — both are derived from the query — and it
   surfaces 30 s later as "element not found", on a screen that looks
   correctly filled in. Waiting for Ionic's own `hydrated` class was not
   enough: it still failed once in fourteen runs. The helper now types with
   `pressSequentially`, which gives the component one event per character;
   losing all of them is not a race that exists. 14 consecutive clean runs
   across both engines, past the run at which the hydration-only version
   broke. The lesson generalises: **when a test depends on an Ionic input's
   *bound state* rather than its displayed value, type it.**
6. **A settle wait belongs in a helper, not inline.** Committing the
   creation form does a `router.replace`, and going back immediately
   overlaps two outlet transitions — after which `ion-router-outlet`
   intercepts pointer events and the *next* tap never lands, 30 s later,
   with nothing resembling a navigation error. One case created its item
   inline and so missed the wait the shared helper already had; the two
   cases were byte-for-byte identical in navigation and differed only in
   that. It is now `commitNewItem()`, used by both, so the omission cannot
   recur silently. That comparison is also what found it: E2E-M10-03 passes
   the identical sequence, which ruled the navigation itself out.

## M11 — containers (`e2e/containers.spec.ts`, 2026-08-16)

Four cases, Local Mode, landing with the M11 rebuild. The pairing *write
semantics* (both sides at once, exclusive, released on delete) are unit
territory — `src/domain/__tests__/containers.spec.ts` — so the e2e cases
assert only what the user can see of them: the pair set in one sheet and
read back as selected in the *other* container's sheet, and cleared on both.
That cross-sheet read is mutation-proved — reverting `pairContainer` to the
pre-rebuild one-sided write fails E2E-M11-05.

What the unit cost to learn:

1. **Playwright CSS pierces shadow DOM.** The "no button grid" assertion of
   E2E-M11-06 counted `button` inside the unassigned rows and found one —
   `ion-item`'s own tap surface is a native button *in its shadow root*. The
   rejected design was one `ion-select` per row, so that is what the
   assertion counts.
2. **An overlay's dismissal is part of the interaction.** A tap that arrives
   while the previous sheet is still animating out lands on the backdrop and
   is swallowed. `closeSheet()` therefore waits for `ion-modal.show-modal`
   to be gone, not merely for the sheet's content to detach — the same
   settled-not-arrived rule the M7 unit paid for, one layer down.
3. **A spec sentence is a list of promises, and each one needs its own
   assertion.** The unit landed marking E2E-M11-05 implemented while its text
   promised the pairing is released "when cleared **or when one side is
   deleted**" — only the first half was asserted. The second was moved to
   E2E-M11-04, because that is where it is *visible*: with both containers
   empty a released and an un-released survivor render identically, so the
   assertion would have passed either way. Found by reading the spec text
   against the test body, which `/pr-review` now requires.
4. **Playwright drives `dist/`, so a mutation proof needs a rebuild.** The
   first attempt at proving the delete-release assertion edited the
   orchestrator and re-ran the case, which stayed green — not because the
   assertion was weak but because `npm run preview` was still serving the
   previous bundle. Test-side edits need no rebuild; production-side edits
   always do, and forgetting it turns every mutation proof into a
   rubber stamp.
5. **Real weights come through the app's own paths** (spec §2.4): the master
   item is created in M10's minimal form with a weight, and the trip row
   inherits it by picking the quick-add *suggestion* — which got its
   `data-testid` with this unit; free-text quick-add creates weightless
   items and would have made the FR-10.3 grades untestable.

## E2E-M5-13 — browser back with the sheet open (2026-08-16)

Joined the M5 unit with the `overlayBackGuard` fix (Navigation Concept §7
case 4). Two things the case had to get right:

1. **The history must be built in-SPA.** A `page.goto` per step creates a
   *document* per step, and back across documents reboots the app instead of
   reaching the router — the unfixed build then "fails" for a reason the fix
   cannot address. The case walks list → trip → sheet through the UI, which
   is also exactly the owner's repro.
2. **Back must wait for the sheet's presentation to settle.** A pop during
   the enter animation races Ionic's transition queue and loses regardless
   of the guard — a real, documented gap (see the concept doc), accepted
   because a human back needs a visible sheet first. The wait is on
   observables (the modal's `show-modal` class and running animations
   excluding spinners), not a duration.

## M12 — analytics (`e2e/analytics.spec.ts`, 2026-08-16)

Landed with the M12 rebuild. What the unit had to get right:

1. **The facet handoff is asserted by what disappears.** E2E-M12-04's chip
   assertion alone would pass with a chip that filters nothing; the case
   also asserts that a row outside the tapped slice is gone from M4, which
   is the regression the 2026-08-08 concept round found (grouping set, list
   unfiltered, the tapped number nowhere on screen).
2. **E2E-M12-03 covers only the absence half — the positive half is
   blocked, and the block is a product gap, not a test gap.** The trend
   needs an archived trip in the trip's series, and no UI path can produce
   one: the wizard creates *planning* trips, and both archive affordances
   (M2's swipe action, M4's app-bar entry) are gated on *active* — a status
   only `activateTrip` assigns, which nothing user-facing calls (the parked
   North-Star Plan/During phases own that transition). Until that lands,
   `seriesWeightTrend`/`seriesTopFlagged` are unit-owned and the e2e case
   asserts the section is *absent, not empty* without history. When an
   activate path ships, the positive M12-03 case is owed alongside it.
3. **Weighted rows come through the app's own paths** (spec §2.4), reusing
   the M11 unit's route: master item with weight in M10's minimal form,
   quick-add via the *suggestion*. Traveler assignment goes through M5's
   popover select — the app's one way of making a row somebody's — driven
   by clicking the option inside `ion-select-popover`, since the select
   itself swallows synthetic `ionChange` events.
4. **The wizard grew a series seed** (`fixtures.ts`): `TripSeed.series`
   drives the "New series…" popover path (testids `wizard-series`,
   `wizard-series-name` added for it) and reuses an existing series of the
   same name on later seeds — needed by E2E-M12-03 and by every future
   series-scoped case (M16).

## M14 — review assistant (`e2e/review.spec.ts`, 2026-08-16)

Landed with the M14 rebuild (FR-27.11: a list targeting groups). Two cases,
Local Mode — deliberately few, and the honesty about why matters more than
the count:

1. **Every positive M14 case is blocked by the same product gap as
   E2E-M12-03's history half.** A proposal needs an FR-9.1 flag; the only
   flag writer the UI has is the quick-add's auto-*Missing*, which stamps
   only on an *active* trip — and nothing user-facing moves a trip from
   planning to active. So E2E-M14-01 (auto-launch on archive),
   -02 (apply writes to the group), -04 (targets, blast radius) and
   -05 (marked rows) cannot be built through the app today (spec §2.4
   forbids injecting the rows). When a planning→active path ships, those
   cases are owed alongside it, exactly like the positive M12-03.
2. **The list semantics are pinned in a component test instead** —
   `src/views/trips/__tests__/ReviewPage.spec.ts`: one row per proposal
   with the open count, the groups-only picker (and the unused-row
   restriction to groups that carry the item), apply/skip marking rows in
   place, pair-scoped "never ask again", the FR-27.4 blast-radius line,
   and the empty state. The proposal arithmetic itself is domain-owned
   (`domain/__tests__/review.spec.ts`).
3. What the e2e unit *does* pin: the screen renders as a list with an
   open count even when that count is 0 (the empty state is framed, not
   blank), and `‹ back` renders the packing list again (G-9) — asserted
   on the visible page, not the URL.

## M3 — composed templates (`e2e/trip-composition.spec.ts`, 2026-08-16)

Landed with the §3.27 generation package. Two cases, Local Mode — the mode
without a server is where a missing client-side rule shows, and include
expansion, the merge report and task materialisation are all client-side
(invariant 4). Both build their composition through M7/M8 rather than
injecting rows (spec §2.4), which is why the M7/M8 helpers moved into
`fixtures.ts` instead of being copied a third time.

1. **E2E-M3-11** — the two scopes as separate sections, a Vorlage counted by
   what it *resolves* to (3, where its own positions are 0), the deduped
   footer count, and the merge named with both groups. **E2E-M3-13** — the
   preview's task count, and the task arriving on the generated row as an
   FR-7.3 todo that M4 counts in its header and lists in the prep section.
2. **The unit immediately found a real defect, and it was WebKit-only by
   accident rather than by browser.** The merge read „in Wildlife & Makro"
   there and „in Makro & Wildlife" on Chromium, from identical data:
   `template_includes` carries no sort order, so the rows arrive in whatever
   order storage produced. That order is not cosmetic — it decides a merged
   item's *first contributor*, and therefore which group's attributes and
   `source_template_id` the generated row carries, which is exactly what
   FR-27.5 and FR-27.11 read back a year later. Fixed in the domain
   (`includedTemplatesOf`, ordering by group name with the include id as
   tie-break) and pinned by unit cases that feed the include rows in both
   orders. The superseded `templates.spec.ts` case asserting "the order they
   were included" was rewritten: that order does not exist in the data.
   *A rendered run found it; neither the component tests nor the previously
   green domain suite could have.*

## FR-27.12 — looking inside a group (2026-08-16)

Rides in the M3 composition unit as **E2E-M3-17** rather than as a unit of its
own: the peek is one behaviour offered on three screens, and the wizard is the
screen where its absence hurt most (leaving for M8 costs the draft).

The case asserts both halves — the row's summary and the sheet's resolved list
— plus the two things that make it a *look*: the sheet's only button closes it,
and step 3 is still standing behind it afterwards. The sheet's own semantics
(resolved through a Vorlage's composition, empty state, read-only) are pinned
in `src/components/templates/__tests__/GroupPeekSheet.spec.ts`, the way M11's
container sheet is — a sheet is testable directly, and driving it through a
page's modal would test Ionic rather than the sheet.

**One existing assertion had to be tightened, not adjusted.** E2E-M3-11 checked
scope separation with `not.toContainText('Makro')` on the Ferien-Vorlagen
section. Since a Vorlage's row now *names its items*, "Makro-Objektiv" appears
there legitimately, and the substring check would have read that as a stray
group row. It now asserts the row titles. The lesson is the recurring one: an
assertion that happens to pass for the wrong reason fails the moment the screen
says more than it used to.

## Plain-HTTP instances (`e2e/insecure-context.spec.ts`, 2026-08-16)

The owner opened the app from an iPad on `http://192.168.1.35:3000` and could
not create anything: **`crypto.randomUUID is not a function`**. That function
exists only in a *secure context*, and every id the client mints came from it —
so on a self-hosted plain-HTTP instance, which is a first-class deployment for
this product, item creation, trip creation, tags and templates were all dead.

**The suite could never have caught it, and that is the interesting part.**
Playwright serves from `localhost`, which *is* a secure context. Every case in
the suite ran in the one environment where the bug does not exist. Four cases
now remove `randomUUID` before the app boots — the LAN situation, reproduced
deterministically — and E2E-NFR-SEC-01 asserts that premise, so the unit cannot
quietly go back to testing nothing if a browser ever changes.

Red-proved by reverting `newId()` to `crypto.randomUUID()` and rebuilding:
SEC-02/03/04 fail, SEC-01 (the premise) still passes, which is exactly the
signature a real reproduction should have.

Two lessons, both paid for here: **the toast came first.** The button had no
feedback, so the failure looked like a dead control for two sessions; the
moment it reported, the message named the cause in one line. And **the run mode
that matters is the one the owner uses** — localhost is not it.

## FR-27.14 — a Vorlage's resulting items (2026-08-17)

**E2E-M8-16** joins the M8 unit rather than starting one: the footer that opens
the list is part of that editor, and the sheet behind it is FR-27.12's, already
covered as a component. The case asserts the three things the number could not
say — the items themselves, where each came from, and the marks — plus the two
that make it a look: one button, and the editor still standing behind it.

**Both M8 describes had to declare `test.slow()`.** Adding a fifth
composition-building case pushed WebKit past the 30 s default and *four* cases
failed, three of them untouched by the change — the same arithmetic the M3
composition unit hit on 2026-08-16, and the same misleading signature: failures
land wherever the clock runs out, so one slow addition reads as several
unrelated bugs. Two consecutive 20/20 runs after declaring the budget.

## E2E-M5-14 — the sheet header's two round controls (2026-08-16)

Owner-flagged from a rendered phone: the FR-25.15 save indicator was 26 px
next to the ✕'s 34 px, both hung from the same top edge, so their centres sat
4 px apart. Two things this case had to get right:

1. **It measures geometry, not CSS.** The gap is invisible in a stylesheet —
   both circles are correct in isolation — and obvious once rendered, which
   is the same lesson G-14 was written for. The assertion reads the two
   boxes' sizes and centre lines.
2. **Both boxes are read in one frame.** Two separate `boundingBox()` calls
   land in different frames of the sheet's enter animation and reported a
   5 px difference on an *aligned* header — a false red the first draft
   produced under parallel load. One in-page `evaluate` returns both rects
   from the same frame, so the shared transform cancels out and the
   comparison is exact whenever it runs. Red-proved against the 26 px build.

## G-2 — the sync detail (2026-08-17)

**E2E-G2-02** and **E2E-G2-03** are live, in `global-nav.spec.ts` because G-2 is a
global pattern and the bug it guards was "the glyph does nothing on the screens
that are not a trip" — a per-screen suite is exactly what could not see it.
G2-02 opens the detail from the trip list (no trip open, the silent case) and
asserts the Local Mode half including the *absence* of the conflict-log entry;
G2-03 drives the one-tap backup and asserts the download plus the backup line
moving from *Never backed up* to *Last backup today*.

**E2E-G2-01 stays unbuilt**: the queue and the conflict log need a server, and
the backend-backed projects do not exist yet. The Server Mode half of the sheet
is covered by the component test only, which is stated here rather than left to
look like coverage.

## M18 — the restore half of the backup (2026-08-17)

Written as a coverage audit of the day's merged PRs, not as a feature. #101
shipped the backup with unit cases for `commitPortableRestore` and an e2e for
the *download*; the restore branch of M18 — the screen a user actually restores
through — had nothing driving it. In Local Mode the file is the only copy, so a
backup that cannot be read back is not a backup, which put this above the other
gaps the audit found.

**E2E-M18-05** takes a real backup through the G-2 detail and restores it in a
**second browser context** — a device that has never seen the data. That is the
load-bearing part of the design: restoring onto the device that wrote the file
would pass against an importer that does nothing, because every assertion would
already be satisfied by what is on screen. The file has to hold *two* documents
to reach the restore branch at all (a single document is the ordinary merge
preview), so the case builds a group and a trip through the app's own paths.

**It found a real defect on its first run.** `commitRestore` replaced to
`/trips`, which is not a route — only `/trips/new` and `/trips/:tripId` are — so
the restore happened and the user was left on the import form with the file
still pasted into it. Nothing said anything had been imported. Fixed to
`/tabs/trips` in the same PR.

Two traps paid for while writing it, both worth repeating:

1. **A bare text match read the textarea.** `getByText('Samedan 2026')` was
   green *because* the pasted YAML was still on screen — the exact failure the
   redirect defect caused. Asserting on `trip-row-<name>` is what made the case
   able to see it. A test that reads the input it just filled proves nothing.
2. **A restored trip is *planning*.** M2 opens on *Active*, so the case selects
   the Planned segment. Noted rather than designed around: a restore currently
   ends on a screen that says "No active trips", which is an owner call.

**E2E-M18-06** is the failure path ADR-015 promises — one damaged document is
reported in its place, marked *skipped*, and the intact ones still import.
Red-proved by making `preview()` filter unreadable documents out: the count
assertion falls to 2.

## FR-5.5 — deliberately not packed (`e2e/skip-item.spec.ts`, 2026-08-18)

Five cases, and the reason there are five rather than two is that the
feature is two paths and one cascade, and each of them can break without
the others noticing.

* **The gesture is driven through `contextmenu`, not a held pointer.** Both
  reach the same handler; the 500 ms themselves are unit-tested with fake
  timers in `useLongPress`, and a suite that waited out a real hold would
  be depending on a duration.
* **The mark is asserted, not the disappearance.** A skipped row leaving the
  list proves only FR-25.2, which was already true of a packed one. What
  E2E-M4-37 is actually for is the revealed row *saying* it was left behind
  on purpose — the distinction the requirement exists to keep. This was a
  real gap when the work started: M4 rendered nothing there, though the
  backlog note claimed it badged the row.
* **The undo is checked against the reveal bar's absence**, which is a
  positive signal: the bar exists only while something is done, so its
  absence proves the row came back *open* rather than into the done section.
* **The cascade case builds its dependency through M10** (§2.4) and picks the
  quick-add *suggestion* rather than typing free text — a row with no master
  item behind it has no dependencies at all, and the case would have passed
  by proving nothing. That mis-step is why the helper carries a comment.
* **The gesture lives in two templates**, the ordinary row and the per-person
  child row, so it has two cases (E2E-M4-37 and E2E-M4-42). The second was
  missing on the first pass and the review's own file-by-file table is what
  found it — the child-row half would have shipped untested.
* **Two testids were added to M10 for it** (`m10-add-dependency`,
  `m10-dependency-main-<name>`); the dependency editor had none.

**Mutation-proved, both halves, rebuilding between runs** (Playwright drives
the built bundle, so a source-only edit proves nothing): removing the menu's
*Nicht einpacken* entry reddens all four M4 cases and leaves E2E-M5-16
green; removing the M5 control reddens E2E-M5-16 alone; removing the child
row's handler reddens E2E-M4-42 alone. That split is the
point — two paths that can fail independently, and did not share a test.
