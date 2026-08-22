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
| M3 trip creation | E2E-M3-01, E2E-M3-03, E2E-M3-14 (incl. the FR-25.9 absence check), E2E-M3-05, E2E-M3-10, E2E-M3-19, E2E-M1-05 | `local` | [`trip-creation.spec.ts`](../client/e2e/trip-creation.spec.ts) |
| Global navigation & app bar | E2E-G9-09, E2E-G9-10, E2E-G9-11, E2E-G9-12, E2E-G1-01 (partial), E2E-G1-02, E2E-G1-03, E2E-G1-04, E2E-G1-05, E2E-G12-01 (partial), E2E-G12-02, E2E-G8-02, E2E-G2-02, E2E-G2-03, E2E-M3-15, E2E-M3-16, E2E-M4-32 | `local` | [`global-nav.spec.ts`](../client/e2e/global-nav.spec.ts) |
| M5 item detail | E2E-M5-09 … E2E-M5-14, E2E-M5-17 | `local` | [`item-detail.spec.ts`](../client/e2e/item-detail.spec.ts) |
| M4 packing list | E2E-M12-06, E2E-M4-01, E2E-M4-04, E2E-M4-36, E2E-G6-02, E2E-M4-18 (both directions), E2E-M4-20, E2E-M4-21, E2E-M4-22, E2E-M4-23, E2E-M4-44, E2E-M4-45, E2E-M4-46, E2E-M4-47, E2E-M4-15 (partial), E2E-M4-02 (partial), E2E-M4-28 (partial) | `local` | [`packing-list.spec.ts`](../client/e2e/packing-list.spec.ts) |
| Typography | E2E-G13-01, E2E-G13-02, E2E-G13-03, E2E-G13-04 | `local` | [`typography.spec.ts`](../client/e2e/typography.spec.ts) |
| Colour anchors | E2E-G11-02, E2E-G11-03, E2E-G11-04, E2E-G11-05 | `local` | [`colour-anchors.spec.ts`](../client/e2e/colour-anchors.spec.ts) |
| Visual baselines | E2E-VIS-01 … E2E-VIS-07 | `local` | [`visual.spec.ts`](../client/e2e/visual.spec.ts) |
| Pack-out & undo | E2E-M4-33, E2E-M4-34, E2E-M4-35 | `local` | [`pack-out.spec.ts`](../client/e2e/pack-out.spec.ts) |
| Deliberately not packed | E2E-M4-37 … E2E-M4-42, E2E-M5-16 | `local` | [`skip-item.spec.ts`](../client/e2e/skip-item.spec.ts) |
| Surfaces | E2E-G14-01, E2E-G14-02, E2E-G14-03 | `local` | [`surfaces.spec.ts`](../client/e2e/surfaces.spec.ts) |
| M7 template scopes | E2E-M7-04, E2E-M7-06 (partial), E2E-M7-07 (completed by the M8 unit), E2E-M7-08, E2E-M7-09 | `local` | [`template-list.spec.ts`](../client/e2e/template-list.spec.ts) |
| M8 template editor | E2E-M8-01, E2E-M8-02, E2E-M8-03, E2E-M8-04, E2E-M8-05, E2E-M8-06 (as amended), E2E-M8-07 (incl. E2E-M7-07's include half), E2E-M8-08, E2E-M8-10, E2E-M8-11 (editor half), E2E-M8-12, E2E-M8-13, E2E-M8-14, E2E-M8-15, E2E-M8-16, E2E-M8-17, E2E-M8-21, E2E-M8-22, E2E-M8-23 (two tests), E2E-M8-18 | `local` | [`template-editor.spec.ts`](../client/e2e/template-editor.spec.ts) |
| M6 shopping (composer wiring) | E2E-M6-21 | `local` | [`shopping.spec.ts`](../client/e2e/shopping.spec.ts) |
| M9/M10 inventory & item editor | E2E-M9-01, E2E-M9-02, E2E-M9-03, E2E-M10-01 … E2E-M10-05 (this row was owed since the unit landed), E2E-M10-13 (German-seeded) | `local` | [`inventory.spec.ts`](../client/e2e/inventory.spec.ts) |
| §3.28 the item mark | E2E-M10-11, E2E-M10-12, E2E-M9-07, E2E-M4-48, E2E-G15-01, E2E-G15-02, E2E-M5-15 | `local` | [`item-mark.spec.ts`](../client/e2e/item-mark.spec.ts) |
| M11 containers | E2E-M11-02, E2E-M11-04, E2E-M11-05 (incl. M11-01's create/edit), E2E-M11-06 (incl. M11-01's delete, M11-03 folded in) | `local` | [`containers.spec.ts`](../client/e2e/containers.spec.ts) |
| M12 analytics | E2E-M12-01, E2E-M12-02, E2E-M12-03 (both halves since 2026-08-21), E2E-M12-04, E2E-M12-05 | `local` | [`analytics.spec.ts`](../client/e2e/analytics.spec.ts) |
| FR-27.4 group changes | E2E-M8-09, E2E-M8-19 | `local` | [`group-refresh.spec.ts`](../client/e2e/group-refresh.spec.ts) |
| M3 composed templates | E2E-M3-11, E2E-M3-13, E2E-M3-18 | `local` | [`trip-composition.spec.ts`](../client/e2e/trip-composition.spec.ts) |
| FR-27.10 group into a running trip | E2E-M4-26 (two cases), E2E-M4-27, E2E-M8-20 | `local` | [`group-to-trip.spec.ts`](../client/e2e/group-to-trip.spec.ts) |
| M18 backup & restore | E2E-M18-05, E2E-M18-06, E2E-M18-07, E2E-M18-08 | `local` | [`backup-restore.spec.ts`](../client/e2e/backup-restore.spec.ts) |
| M14 review | E2E-M14-01, E2E-M14-02, E2E-M14-03 (pair scope), E2E-M14-04 (+04b), E2E-M14-05, E2E-M14-06 + a G-9 back case | `local` | [`review.spec.ts`](../client/e2e/review.spec.ts) |
| M21 template from trip | E2E-M21-01, E2E-M21-02 (+02b), E2E-M21-03 (+03b, +03c), E2E-M4-43 | `local` | [`template-from-trip.spec.ts`](../client/e2e/template-from-trip.spec.ts) |
| M22 trip properties | E2E-M22-01, E2E-M22-02, E2E-M22-03, E2E-M22-04, E2E-M22-05, E2E-M22-07, E2E-M22-06 (in `global-nav.spec.ts`) | `local` | [`trip-properties.spec.ts`](../client/e2e/trip-properties.spec.ts) |
| App shell offline (NFR-4.13) | E2E-PWA-01, E2E-PWA-02, E2E-PWA-03 | `local` | [`pwa-offline.spec.ts`](../client/e2e/pwa-offline.spec.ts) |
| Single-User backend sync | E2E-FLOW-01 (partial), E2E-FLOW-06, E2E-G2-01, E2E-FLOW-08 / E2E-NFR-04 (partial), E2E-G2-04, E2E-G2-05, E2E-FLOW-10 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |

**E2E-G2-04 — the durable outbox (B2, NFR-4.1), added 2026-08-21.** A new
case in the `single` unit: pack a row offline, reload the page *while still
offline*, and the queue is still there — count on the glyph, sentence in the
G-2 sheet — then drains when the trip is opened with a network again, and a
device that never saw the change reads it back. The app shell for that
offline reload is the PWA's (E2E-PWA-01); the case asserts the back button
rather than E2E-PWA-01's logo, because inside a trip the app bar carries no
logo. **Proved red against the unfixed build**: with the outbox store
unwired the count is simply absent after the reload.

**E2E-G2-05 — a refused mutation is parked, added 2026-08-22.** The first case
that ever drove the parked surface against a real `jitpackd`. It could not
have existed before: the client read the rejection under `status`, a key no
server has ever sent, so `parkedCount` stayed 0 whatever the server answered
— and both unit suites agreed with it, because their fakes answered `status`
too. Proved by mutation: pointing the client back at `.status` makes
`sync-detail-parked` not exist at all.

Two honesty notes. **The refusal it drives is the trip-confinement one**
(a partial upsert on a row deleted elsewhere names no trip), not a database
constraint; the constraint refusals of the same code path are covered in Go
(`store/trip_constraint_test.go`, `api/push_refusal_test.go`), because no
screen can delete a container or cut a quantity below its packed count on a
second device inside one case. **The removal has to pack the row first**: a
traveller leaving takes only her *packed* rows with her — an untouched row is
detached, not deleted — which is the detail the first draft of this case got
wrong and the run corrected. The destructive alert button is located by its
Ionic role class rather than its label, so the case does not depend on which
catalogue the alert renders in.

**E2E-FLOW-10 — the pull cursor only comes from a pull, added 2026-08-22.**
The push response's `pull_hint.next_cursor` names the seq *that push* wrote;
the client was adopting it as its pull cursor, which — the cursor being an
exclusive lower bound that only moves forward — stepped over everything
another device had written while this one was offline, permanently and with
no symptom.

**This case asserts the request, not the screen, and that is the finding.**
The first draft asserted the obvious thing: B's row must appear on A. It
passed against the unfixed build. Logging A's traffic explained why — three
drains overlap on a reconnect, and each reads the cursor when it *starts*, so
one of them was still holding the pre-push value and pulled the gap by
accident. The rows arrive; the bug is real; the screen cannot see it. The
wire can: every `cursor` A sends must be one a pull returned, and a `5` after
the server has only ever answered `3` is the whole defect in one number.
The screen is still asserted — B's row does arrive — as the positive signal that the pulls carried anything at all, so the cursor check is not passing over a dead connection. Proved 3/3 red without the fix and 3/3 green with it.

Two traps the harness itself carried. **A `page.route` observer has to be
installed before the first request it judges**, or a cursor served earlier
reads as invented — the first version failed on a perfectly legal `3`. And
**`route.fetch()` runs outside the browser context, so it sails straight
through `setOffline`**: the handler has to honour the flag itself, otherwise
the device never goes offline and the case tests nothing.

Two things this unit still does *not* cover, both by decision:

- **No reconnect drain exists**, so none is tested. The queue moves on the
  app's next own action — a mutation, a trip open, a WS ping — or on the next
  app start, which is what the durable outbox added. An `online`-event drain
  was deliberately left out of Track C.
- **A parked mutation has no e2e.** Provoking one needs a push the server
  refuses permanently, which the app has no way to produce through its own
  UI (it only ever sends columns the server knows). The parking rules are
  covered in `client/src/composables/__tests__/useSyncOutbox.spec.ts`
  instead, and G-2's rendering of them in the SyncDetailSheet component test.
| Single-User backend sync | E2E-FLOW-01 (partial), E2E-FLOW-06, E2E-G2-01, E2E-FLOW-08 / E2E-NFR-04 (partial) | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| Language choice (NFR-4.12) | E2E-M17-10, E2E-M17-11 | `local` | [`i18n.spec.ts`](../client/e2e/i18n.spec.ts) |

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
part of `npm run test:e2e`.** It is a separate Playwright project, run by
`make visual` and by its own CI job. Both it and the behaviour suite execute
inside the digest-pinned Playwright image (ADR-013) — the behaviour suite
joined it on 2026-08-19, so the image is no longer what distinguishes the
two; the project selection is. For the baselines the image is load-bearing,
because outside it the images mean nothing; for the behaviour suite it is
only how the browsers get there. The behaviour suite is additionally split
across four CI legs by Playwright's own sharding, so it reports as
`e2e (1)` through `e2e (4)`; the browser is in the test name, not the job
name. What it does *not* cover: the
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

## M21 — template from trip (`e2e/template-from-trip.spec.ts`, 2026-08-19)

Six cases, Local Mode, landed with the M21 screen (FR-27.5). Notes worth
carrying forward:

1. **The unit had to build the lifecycle step it needed.** Every M21 case
   starts from an *archived* trip, and no path in the app produced one —
   the same gap recorded above under M12-03 and M14. E2E-M4-43 covers the
   step itself: a planning trip offers *start* and not *archive*, an
   active one the reverse.
2. **The deviation is produced the way it actually happens.** The spec
   pictures a row "added on the trip under a group", which the app cannot
   write — a quick-add row carries no provenance. What produces a real
   deviation is the *group* changing after generation, so E2E-M21-02
   archives first and then removes the position, since a past trip is
   never asked to follow along (FR-27.4).
3. **Two false-green locators were found and are worth remembering.**
   Ionic marks the chosen segment button with a *class*
   (`segment-button-checked`), not with `aria-checked` — asserting the
   attribute passes against nothing. And `ion-toggle` **is** the switch:
   `getByTestId(...).getByRole('switch')` looks for a descendant and finds
   none.
4. **Getting there and leaving are both asserted**, inside this unit rather
   than in `global-nav.spec.ts`: reaching M21 needs an archived trip, which
   costs a group, a wizard run and two lifecycle taps to build, and the
   global unit would have to carry all of it for one chevron. The rule the
   working agreement is protecting — that leaving a screen is a behaviour,
   asserted on the rendered page and never on the URL — is kept; only the
   file differs, and this note is why.
5. **One spec sentence was wrong and was corrected, not tested around.**
   E2E-M21-03's text promised the fold-back "surfaces as an applied change
   on planning trips using that group". Since the FR-27.4 revision of
   2026-08-18 it does not: the edit is *offered* at each following trip and
   becomes an applied change only on acceptance. The UI-Test-Spec sentence
   now says that, and E2E-M21-03c asserts the proposal.
6. **Mutation-proved**, as the standing rule requires: dropping the
   `addTemplateInclude` loop, flipping `DEFAULT_DEVIATION_CHOICE` and
   ungating the archive action each felled exactly the cases that claim
   them.

**Not yet covered:** everything else in spec §3 (global patterns G-1–G-15), §4 (M1–M21 beyond the above), §5 (cross-screen flows) and §6 (non-functional journeys). The `single` mode has its first unit since 2026-08-20 (the harness and its four cases, see below) — everything screen-shaped in `single` beyond it is still open. The `server` mode (mock IdP, multiple identities) has no coverage at all (spec §10 step 5).

This is a small fraction of the specified suite. Do not read a green `e2e` job as "the UI is verified".

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

## Order of attack

Following spec §10, adjusted for what is now built:

1. ~~Playwright scaffold + smoke per mode~~ — done.
2. ~~A data-producing unit, so later units have a trip to work with~~ — done (M3; `createTripViaWizard` in `fixtures.ts` is the seed helper).
3. ~~M4 packing list~~ — done for what M4 can produce on its own (see above); the `data-testid` pass on `PackingListPage.vue` landed with it. **Next: M5**, which both completes its own cases and unlocks the M4 facet cases parked above.
4. Global patterns (§3) — they underpin every screen.
5. Local Mode delta: persistence across reload, serverless export, M19 switching.
6. ~~`jitpackd` harness~~ → Single-User cases (largest surface, simplest
   infra). The harness is built (the `single` project, 2026-08-20 — see the
   unit at the end of this file); the per-screen `single` cases remain.
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
| the sections an existing item owns follow the app language | E2E-M10-13 | NFR-4.12 on the half of M10 that only exists after the save. **Seeded in German, and that is the case**: the suite's app language is English, and against English a catalogue lookup and the hard-coded word it replaced render identically — so an English assertion here could not fail. Its negative counterpart above moved off the headings' words onto test ids for the same reason. |

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
   **That path shipped on 2026-08-19** with M21 (see below): M4's app bar
   and M2's swipe both offer *start* on a planning trip. The positive half
   was written on **2026-08-21** and the debt is closed; what it needed
   beyond the lifecycle step is recorded under "M12 — the positive trend
   half" below.
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
   **Unblocked 2026-08-19** by the lifecycle step M21 needed (E2E-M4-43):
   an archived trip — and with it an FR-9.1 flag — is now reachable
   through the app. M14-01/-02/-04/-05 are owed rather than impossible.
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

## M14 — the positive half, and the two blocks that hid a defect (2026-08-20)

The section above recorded M14's positive cases as *unblocked but unwritten*
since M21 shipped the lifecycle step. Writing them found a **second** block
nobody had recorded, and then a defect underneath it:

1. **`unused` had no writer anywhere in the app.** *Missing* is stamped by the
   quick-add on an active trip; *unused* was a read-only note in M5's Details
   block. FR-9.2's assistant is written around overpacking, so its main input
   was unreachable and M14 had only ever been exercised by the dev fixture. The
   control is built in this PR (E2E-M5-17), which is what made every case here
   possible. **The lesson generalises: "unblocked" was checked against one
   half of the precondition.** M21 proved *archived* was reachable; nobody
   asked whether the *flags* were.
2. **An ordinary M5 edit erased the row's provenance.** The optimistic update
   carries a whole row and both the store and IndexedDB *replace* rather than
   patch, so the hand-maintained projection (`itemRow`) silently dropped
   `source_template_id`, `packed_by_user_id`, `packed_at` and
   `packing_now_at`. Flagging a generated row detached it from its group —
   permanently in Local Mode — and the *unused* proposal it should have
   produced never appeared. Found because the first run of E2E-M14-01 showed
   one proposal instead of two. The guard is written against the whole
   `TripItem` type rather than the four columns
   (`composables/__tests__/masterActions.spec.ts`), so the next column added is
   covered the day it is added. Mutation-proved: removing the one line turns
   E2E-M14-01 and -02 red.
3. **The retarget picker listed groups in storage order.** Chromium and the
   second run disagreed, which is the same class of finding as FR-27.2's
   include order: an order that comes from the storage layer is no order at
   all. `retargetGroups` sorts by name now, with a domain case behind it —
   the e2e assertion was the symptom, the domain rule is the fix.
4. **The picker is dismissed by choosing the value it already has**, not by
   Escape: dismissal is then Ionic's own path and the wait is on a state the
   app reaches by itself. Escape left the popover up often enough to be seen
   in a repeat run.
5. **What is still not e2e-covered, deliberately:** E2E-M14-03's second clause
   — the same item surfacing for *another* group — needs one item flagged
   twice under two groups, which a single trip cannot produce. It stays
   unit-owned, and the UI-Test-Spec sentence says so rather than claiming the
   id is fully covered.

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

**E2E-G2-01 is live since 2026-08-20** in the `single` unit (see below): the
queue, its drain, the conflict log behind the sheet's button, and the
outside-a-trip hint are all driven against a real `jitpackd`. What the
component test alone used to carry is now also rendered coverage.

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

**E2E-M18-08** (2026-08-21, FR-27.4) is the second half of "a backup is
complete": the file has to carry *how* a trip follows its groups, not only what
is on it. The case answers the group twice on the first device — once *yes*
(which writes the applied-changes log) and once *no* (which lives **only** in
the ledger; a refused position leaves no row and no other record) — then
restores onto a fresh context and asserts that both answers survived.

The design problem here was that everything this case proves is an *absence*:
no proposal, no refused row. Three positive signals carry it instead.

1. The restore list itself says the trip *follows 1 group* — rendered proof
   that the section reached the file, before anything is imported.
2. M2's applied chip and log name the change that was accepted, with the
   timestamp it originally had.
3. The load-bearing one: after the restore, a **new** position is added to the
   group on the restored device, and the proposal that appears names it and
   only it. Without the restored sources nothing would be proposed at all;
   without the restored ledger the refused position would be proposed beside
   it. That single assertion is what makes the two "not offered" assertions
   mean something.

Red-proved against the unfixed build, where the trip restores with no
`follows:` at all: the restore-list assertion falls first, and with it dropped,
the refused position is offered again.

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

## FR-27.10 — a whole group onto a running trip (`e2e/group-to-trip.spec.ts`, 2026-08-19)

Three cases for one tap, because the tap has three outcomes and two of them
are reports rather than rows.

* **The dedup case types the row by hand** rather than picking the quick-add
  suggestion, and that is the whole point of it: a picked suggestion carries
  the master item's id, which the group would have matched on anyway. Only a
  free-text row forces the name match — the rule that would silently double
  „Kamera" if it broke. **Mutation-proved:** dropping the name half of the
  presence test doubles the row and reddens exactly this case.
* **The repeat-add case reloads between the two adds.** Two toasts live at
  once otherwise, and `ion-toast` then resolves to two elements — a strict-mode
  violation that is really a race against the first toast's three seconds. A
  fresh document leaves no overlay behind, so the second assertion reads its
  own report.
* **Two halves are unit tests, on purpose.** The added rows carrying no FR-9.1
  *Missing* flag, and a past trip registering no source, both need a trip that
  is **active** or **archived** — and nothing user-facing moves a trip out of
  *planning* yet. Asserted here they would pass on a planning trip whatever the
  production code did, which is the definition of false green; they live in
  `client/src/composables/__tests__/groupToTrip.spec.ts` and move back when the
  North-Star phase supplies the transition.
* **The fourth case guards the other screen.** `QuickAddItem` is one
  component with a prop, and M8 reuses it — so M4 gaining groups could hand
  them to the editor, where FR-27.1 forbids nesting a group at all. The
  absence is asserted beside a positive signal (the free-text hint, which M4
  hides when groups match), and mutation-proved by switching the prop on in
  M8: both browsers redden.
* **A distractor group is part of the world.** „Typing filters them" cannot be
  asserted with one group on the device: any query that offers it offers
  everything there is, and „always offers the first group" would pass. The
  second group is what makes the claim falsifiable, and both directions are
  asserted.
* **The FR-27.4 tail is deliberate.** The last case does not stop at „nothing
  was added": it edits the group afterwards and watches the change arrive at
  the trip as a proposal. The registration is invisible on the screen that
  writes it, so the only honest assertion of it is the effect it has later.

## App shell offline (`e2e/pwa-offline.spec.ts`, 2026-08-20)

The NFR-4.13 shell cache, driven in Local Mode because that is the mode where
"the data was offline-first but the app needed the network to boot" was an
actual gap. **Chromium only**: Playwright hosts service workers only there;
the worker is identical in every engine.

* **E2E-PWA-01** waits on the worker's own lifecycle (`ready`, then
  `controllerchange` if the page is not yet controlled — real events, no
  timeouts), cuts the network, reloads, and asserts the *rendered* chrome.
  Red-proved by unregistering the worker's fetch handler: the offline reload
  paints nothing and the case fails.
* **E2E-PWA-02** guards the never-cache rule (`/api`, `/ws`, `/health`) at its
  observable edge: it fetches `/health` with the worker in control and asserts
  no cache entry appears — beside the positive signal that the same cache,
  read the same way, does hold `/index.html`. Red-proved with a
  runtime-cache-everything mutation (bypass removed, `cache.put` on fetch).
* **E2E-PWA-03** asserts the install declaration end to end: head tags,
  manifest content (name, standalone, maskable purpose) and that every
  declared icon URL resolves. Red-proved by pointing the manifest link at a
  file that does not exist.

One platform lesson recorded in `sw.js` itself: static servers answer assets
with `Vary: Origin`, and Vite's `crossorigin` module scripts request them
*with* an Origin header while install-time `addAll` fetched without one — so
strict cache matching missed every asset and the offline reload painted a
blank page. The worker matches with `ignoreVary: true`; correct here because
every shell file is content-hashed and has exactly one representation.

## Single-User backend sync (`e2e/single/server-sync.spec.ts`, 2026-08-20)

The first backend-backed unit: a real `jitpackd` in Single-User
configuration (spec §2.2), the client in its `server` mode. Four cases —
the two-context convergence smoke (E2E-FLOW-01, partial), the offline
queue round-trip (E2E-FLOW-06 + E2E-G2-01's queue half), the losing-edit
conflict (E2E-FLOW-08/E2E-NFR-04, partial, + E2E-G2-01's conflict-log
half) and the G-2 sheet outside a trip.

**The harness, for the units that will extend it** (Track C's durable
outbox is the named next tenant):

* The `single` Playwright project and a second `webServer` entry exist only
  under `E2E_BACKEND=1` (`playwright.config.ts`) — they need the CGO-free
  binary prebuilt at the repo root, a prerequisite the default run and the
  four shard legs deliberately do not have. `make e2e-single` builds and
  runs the whole thing; CI has its own `e2e-single` job in the same pinned
  image.
* **One jitpackd per run, not per worker — decided, not defaulted.** The
  API is same-origin-only (no CORS, like every real deployment), so every
  context reaches it through the `vite preview` proxy (`vite.config.ts`),
  whose target port is fixed when the config loads; and the multi-context
  cases need one shared server anyway. The database is a fresh temp file
  per run, the project runs serially, and each test builds its world under
  unique names — the master partition is shared state here, unlike in the
  `local` units, and a repeated item name would trip ADR-014's
  `UNIQUE(name)` on the second test.
* Chromium only, deliberately: the surface under test is the sync wire, not
  the engine; the screens keep their WebKit coverage in the `local` units.

**Honest limits, named rather than implied:**

* **Both contexts are the same Single-User identity.** Convergence over the
  wire is proven; locks, attribution and membership (G-3, G-10, FLOW-01's
  full text) wait for the mock-IdP `server` project.
* **There is no reconnect drain, and the case says so.** The queue moves
  only on the app's next own action — a mutation, a trip open, a WS ping —
  so the offline case drives the user path (re-opening the trip) rather
  than asserting an automatic drain that does not exist. The durable outbox
  and the reconnect story are Track C's; when it lands, this case grows the
  reload-survival half.
* **The WS subscription is waited on, not hoped for.** The hub answers a
  subscribe with a `presence` broadcast that reaches the subscriber itself,
  so the smoke case waits for that frame before the other context packs —
  without it, a pack racing the subscription would be a flake by design.
* **The conflict is ordered by construction.** The offline context edits
  the field *first* (strictly older HLC), the online one after — and the
  server holding the winner is proven by a read-back from a third context
  before the loser drains, because "A's push probably arrived" is exactly
  the kind of hope this suite forbids. The merge's direction rules
  (packed-beats, additive flags) stay covered where they live, in
  `internal/sync`.
* **`ConflictLogPage` got its testids with this unit** (`conflict-row`,
  `conflict-field`, `conflict-losing`, `conflict-winning`,
  `conflict-empty`) — it had none, and the ledger's own selector rule makes
  adding them part of writing the case.

## M4 — the scroll position across the M5 overlay (2026-08-21)

E2E-M4-45, in `packing-list.spec.ts` under its own describe. It pays off
ADR-012's overlay amendment, which recorded losing M4's scroll position as a
carried cost and named the repair without building it. Four things came out of
writing it, and each one is a rule the next scroll-shaped case will need:

1. **A `<script setup>` top-level binding is per *instance*, not per module.**
   The first implementation kept the remembered offset in a `Map` declared at
   the top of `PackingListPage.vue` — which the replace re-creates along with
   everything else, so the memory was always empty by the time anything read
   it. The map lives in `lib/scrollMemory.ts` now, with its own unit tests.
2. **The position is an offset *and* a header state.** M4's header line holds
   84 px of the scrolled content, so restoring the number under a re-opened
   line lands on different rows. Both halves travel together, and the header
   state is applied during setup so the first painted frame is already right.
3. **The list's own re-render reports its way back from the top**, and those
   scroll events read as the user's: they re-open the header and overwrite the
   offset about to be re-applied. The screen stops listening to itself between
   opening the sheet and finishing the restore.
4. **Two engine-specific traps, both of which made the case measure nothing
   while passing its earlier assertions.** Playwright scrolls whatever it is
   told to click into view, so the row the case opens has to be *wholly inside
   the content's box* — a row under the app bar is on the page without being
   on screen, and asking for that one scrolled WebKit's list back to the top.
   And the header's max-height transition changes the height of the scrolled
   content, which the browser answers with a scroll adjustment that the screen
   then reads as an upward scroll: the line flipped open and shut for as long
   as anyone watched. `overflow-anchor: none` on the scroll part removes the
   adjustment, and the case runs with motion reduced — the app's own instant
   path, honoured now in `prefers-reduced-motion`, rather than a test that
   switches off the thing it is watching.

Mutation-proved: dropping the `scrollToPoint` while keeping the signal reddens
it on both engines.

## M12 — the positive trend half (2026-08-21)

E2E-M12-03's second case, owed since the lifecycle step landed on 2026-08-19
and written now. It builds a whole past trip by hand — quick-add from a
weighted master item, *Reise starten*, pack the row, type the thing that was
missing, archive — and then a second trip in the same series, whose M12 draws
one column for last year.

Three things worth carrying forward:

1. **The trend counts what was *carried*, so the row has to be packed.** A
   generated row alone puts a 0 kg column on the chart, which would have passed
   a "the section exists" assertion and asserted nothing. The case names the
   kilos and the year.
2. **The flag is read back before it is relied on.** `seriesTopFlagged` reports
   an empty list for "nothing was flagged" and for "the flag was never
   written" alike, so the case opens M5 on the ad-hoc row and asserts the
   *Missing* chip first. Without that it would have been an absence dressed as
   a positive.
3. **M14 is not the signal it looks like.** The first version asserted the
   assistant's open count after archiving, which read `0` — a *missing*
   proposal needs a group to target and this world has no templates at all.
   The review assistant's own coverage lives in `review.spec.ts`, which builds
   those groups; M12's case has no business depending on them.

Mutation-proved twice: pointing `seriesWeightTrend` at *active* trips, and
dropping *missing* from `seriesTopFlagged`, each redden it.

## NFR-4.12 — the language actually changes the app (`e2e/i18n.spec.ts`, 2026-08-21)

One case, and it exists because two of the strings the i18n migration had to
move were **not on any screen**: a nav anchor stored its finished English label
(`NAV_ANCHORS[].name`) and a route stored its finished English title
(`meta.title`). Both fed the chrome — the four anchors and the one header bar —
so no language choice could reach either, on any screen, in either mode. A unit
test cannot see that: the defect lives in the wiring between the route table,
the chrome and the catalogue, and each of the three was individually fine.

The case switches M17's Language row to German and asserts, on the *visible*
page, the anchor labels — **both presentations**, since the tab bar and the
desktop rail read one list and only one of them exists at a given width — the
header bar's route title and M2's own segment words; then reloads and asserts the same, because the choice is device-local
(FR-21.3's pattern). It asserts the **English** words first — without that,
"the German word is there" would pass on a build that had rendered neither.

**Two things the run taught, both already-known lessons paid for again.**

*The viewport decides which presentation of the anchors exists.* The `chromium`
project runs at desktop width, where G-9 hides the tab bar and the rail carries
the anchors — and `toHaveText` does not require visibility, so the first two
assertions passed against an element `display: none` while the click on the
same element hung for the full 60 s budget. The case pins a mobile viewport and
opens with `toBeVisible()`, so the thing asserted is the thing on screen.

*Overlay dismissal is part of the interaction.* `ion-select-popover` goes hidden
a frame before Ionic tears down the popover host and its backdrop, and until it
does, nothing behind them is clickable. Waiting on the inner element was not
enough; the wait is on the host's absence, which is a state the app reaches by
itself.

Mutation-proved: with `nav.trips` set to `Trips` in the German catalogue the
case fails on the rendered label, twice, including the retry.

**One surface stays out of e2e reach, and is covered instead** (2026-08-22):
the avatar crop modal (FR-17.13) opens only after the browser's own file
picker, which Playwright cannot drive through the app. Its shell — placement,
the canvas crop, the object-URL release on both exits, and its four catalogue
labels — is pinned in
[`src/components/settings/__tests__/AvatarCropModal.spec.ts`](../client/src/components/settings/__tests__/AvatarCropModal.spec.ts).
Named here rather than left silent: the ledger's job is to say what *is not*
covered by a run as much as what is.

## M22 — a trip's properties and its travellers (`e2e/trip-properties.spec.ts`, 2026-08-21)

Four cases, Local Mode, landed with the M22 screen (FR-2.7). The whole
consequence rule runs client-side (invariant 4), so a broken rule shows up here
rather than behind a round trip.

**E2E-M22-03 is the case this file exists for, and it was green for the wrong
reason three times.** Each version is worth knowing, because each mistake is
available to the next screen that owns sibling rows:

1. *Count plus surviving name.* An over-broad removal detaches every row of the
   position, and the FR-27.4 refresh then re-resolves and **generates the
   sibling's row again** — same name, same count, different row, and everything
   done to it gone. The mutation (detach by position instead of by traveller)
   left the case green.
2. *Pack the sibling to prove identity.* A fully packed row leaves the list
   through the FR-25.2 pack-out, so the signal walked off screen. The seeded
   position now carries **quantity 2** and the row is packed **once**: a
   part-packed row keeps its place, and its `1/2` is what has to survive.
3. *Navigate straight after confirming.* `page.goto` outran the removal and the
   case failed against correct code. It now waits on the roster losing the row
   — rendered, settled state.

Two smaller traps, both costing a run each. A template position is
**trip-global by default**, so a per-person case has to set the assignment in
M8 or it silently tests one unassigned row. And a traveller row is addressed by
its **name** through a `data-testid`, because Ionic sets an input's value as a
property rather than an attribute — `input[value="Zoe"]` never matches.

E2E-M22-04 asserts an absence (removal is refused on a started trip), so it
leans on the positive signals the screen renders anyway: the control is present
and `aria-disabled`, and the reason is a visible note.

## Fixed: the losing-offline-edit case was never flaky (2026-08-22)

`a losing offline edit converges and lands in the conflict log` was recorded
here on 2026-08-21 as flaky — failing its first attempt, passing on the retry,
measured on `main` as well as on the branch that reported it. CI stayed green
only because the retry saved it.

**It was not flaky; it was deterministic, and the retry hid that.** Run with
`--retries=0` it fails on *every* attempt, three out of three. The retry
passed because the first attempt had meanwhile warmed the master partition of
the run's shared database — the second attempt was answering a question the
first had already paid for.

The cause was the one guessed here a day earlier, and the note stands: a page
booted straight at a trip URL loads only the **trip** partition, while M2's
list comes from the **master** one, and with no reconnect drain (Track C) a
master pull that had not landed before the context went offline may never
land at all. `reopenTrip` then searched an empty list and reported the
absence as a sync failure.

The repair is a precondition rather than a change to what the case proves:
`warmTripList` walks the second page through M2 **while it is still online**
and asserts the rendered trip row. The two repairs rejected a day earlier are
still rejected — re-entering by `goto` would demonstrate the durable outbox
instead of the drain-on-trip-open, and re-entering by history broke the
sibling case that shares the helper. Proved both directions: 3/3 red without
the call, 3/3 green with it, `--retries=0` throughout.

**The lesson is about `retries: 1`, not about this case.** A retry cannot tell
a racing test from a broken one, and against a suite whose database outlives
the run it actively manufactures green: the retry is a *second* attempt
against state the first attempt created. Any case that reads shared master
state after going offline should establish it while online rather than trust
the run's history.

## M8/M4 — the composer's chip rows (2026-08-21)

E2E-M8-21 in `template-editor.spec.ts` and E2E-M4-46 in
`packing-list.spec.ts`, written with FR-25.13c. E2E-M8-13's focus assertion
turned around in the same change: the FAB expands the composer but no longer
focuses it, and the case asserts `not.toBeFocused()` *after* the confirm
button has rendered — by then the old `open()`'s awaited focus would have
landed, so the unfixed build fails there instead of racing past.

What each case is actually for:

1. **E2E-M8-21 owns the shared behaviour** — the related row headed by the
   contributing tag, the recents trail crossing scopes, a chip landing an
   FR-25.7 Standard row. Every "not offered" claim rides a positive signal in
   the same row: the chosen Zahnbürste's absence is asserted beside the
   rendered Shampoo chip, and the emptied chip area beside the two rows it
   just produced.
2. **E2E-M4-46 owns only M4's wiring** — the trip passing its contents into
   `excludeItemIds` at all. The shared component cannot see a dropped prop,
   so its own suite stays green through exactly the defect this case exists
   for. The positive signal for the absent suggestion is the free-text hint,
   which renders precisely when nothing is offered.
3. **Tagged inventory comes through M10's own path** (`createTaggedItem`,
   local to the spec): the name-only helper other specs use cannot produce a
   primary tag, and the related row keys on nothing else.

Mutation-proved: restoring the focus in `open()` plus forcing the chip rows
off reddens E2E-M8-07/13/12 and E2E-M8-21; dropping the `exclude-item-ids`
prop in M4 reddens E2E-M4-46.

## M8/M4/M6 — the inventory browse-sheet (2026-08-22)

E2E-M8-22 in `template-editor.spec.ts`, E2E-M4-47 in `packing-list.spec.ts`
and E2E-M6-21 in the new `shopping.spec.ts`, written with FR-25.13d. The
division of labour repeats the FR-25.13c split: **M8-22 owns the shared
sheet's behaviour** (tag axis on *any* tag, the run with rows flipping to
„schon drin" in place, the input-free sheet whose free-text line hands back
to the composer's field), the sheet's own rules beyond that live in
`InventoryBrowseSheet.spec.ts`, and **M4-47 and M6-21 own only the wiring**
— the trip's contents reaching the sheet as the carried state, which no
shared-component test can see dropped. M6-21 is the *first* M6 e2e case at
all; its file header says why it pins wiring and nothing more.

One trap paid for here: the free-text line first called the composer's
focus directly after flipping `is-open` off, and lost — Ionic's modal
teardown restores focus after dismissal, so the assertion found the field
`inactive`. The fix is a seam, not a wait: the focus now runs in the
modal's own `didDismiss` handler, gated by a pending flag, so the test
asserts settled state instead of racing the teardown.

Mutation-proved: forcing the carried branch off (`v-if="false"`) reddens
all three cases; dropping M6's `exclude-item-ids` prop reddens E2E-M6-21.

## FR-27.15 — the fold suggestion (2026-08-22)

E2E-M8-23 is **two tests in `template-editor.spec.ts`** sharing one world
(two groups plus a Vorlage carrying all three items), rather than one walk
covering the spec's whole sentence. The split is not cosmetic: the
dismissal half needs a reload and a *changed group*, and appending those to
the fold walk pushed it past the budget on WebKit — the same reason
E2E-M8-15 carries `test.slow()`.

Two things the case pins that the screen alone would not show:

- **The fold is proved by the resolution count, not by the rows.** Before
  the tap the footer states N; after it, the same N. Asserting only "the
  positions are gone and the group is there" would stay green against a
  fold that silently dropped or duplicated an item, which is the one
  failure this feature could plausibly have.
- **The guards need a positive signal beside them.** "No row for *Solo*"
  is an absence; it is only evidence because the *Erste Hilfe* row is
  asserted visible in the same frame, which proves the detector ran.

Mutation-proved both halves, rebuilding between runs: `GROUP_MATCH_MIN_POSITIONS`
2→1 reddens the one-item guard clause, and dropping `removeTemplateInclude`
from the undo handler reddens the restore.

One trap paid for here: closing the FR-27.12 peek with `Escape` and then
asserting `ion-modal.show-modal` is gone passed *before the sheet had
finished presenting*, and the still-live overlay swallowed the next tap on
WebKit. The sheet's own close button plus the same assertion is
deterministic. `page.locator('ion-modal')` is not the fix — five of them
sit in the DOM permanently; only `.show-modal` marks a presented one.

## §3.28 — the item mark (`e2e/item-mark.spec.ts`, 2026-08-22)

Six cases in one file, plus E2E-M8-18 in `template-editor.spec.ts` because
the group's mark is set in M8 and the walk needs M8's world anyway.

Three things the first red run taught, none of which is visible in the
source:

- **The picker's search is a plain `<input>`, not an Ionic field.** The
  shared `fillIonic` helper waits for `hydrated`, which never arrives on
  it, and the failure reads as a timeout on a control that is plainly on
  screen. Anything not built out of `ion-input` gets `fill()` directly.
- **`page.accessibility` is gone from the current Playwright API.** The
  seam for "the mark is out of the accessibility tree" is
  `locator.ariaSnapshot()`, and asserting on that is also more readable
  than a JSON blob.
- **An empty box with a width and no height is `hidden`.** E2E-G15-01's
  promise is that the empty slot *holds the column*, and the slot only had
  a width — so Playwright correctly refused to call it visible. The fix is
  in the production component (the slot sets both), which is the right
  place: a slot with no height was not holding anything.

**E2E-M8-18 paid for itself twice.** M3 step 3 has *two* pickable columns —
Ferien-Vorlagen and Gruppen — and the mark had been added to the first one
only. Nothing in the diff says so, the screen renders correctly for a
Vorlage, and the case is what named it. It also caught its own bad locator on
the way: a Vorlage's M7 row lists the groups it contains in its own subtitle
(FR-27.1), so `filter({ hasText: 'Camping Basis' })` matched the Vorlage
rather than the group as soon as one existed. The row helper filters on the
row's *heading*, and the walk asserts the M7 surface before creating the
Vorlage that would shadow it.

The case also carries a **reload** between the third and fourth surface. That
was added while diagnosing the above — a mark is master data, and Local Mode
rebuilds its whole store from IndexedDB on every navigation, so "it renders"
and "it is still there" are two claims.

And one that is about the feature rather than the harness:

- **M4's composer has two paths and only one of them can inherit a mark.**
  The suggestion carries `source_item_id`; the free-text confirm creates an
  ad-hoc row by design (FR-28.7). The first draft added *Zelt* by free text
  and asserted its mark — a correct failure. Both paths are now in the
  case, because "this row shows no mark" only means something beside a row
  that shows one.
