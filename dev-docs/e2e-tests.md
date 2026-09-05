# E2E coverage ledger

Which cases from [`UI_Test_Spec_v1.0.md`](UI_Test_Spec_v1.0.md) are actually implemented, and where. The spec says what *should* be covered; this file says what *is*. When the two disagree, this file is the one that is right.

The implementation lives in [`client/e2e/`](../client/e2e/), whose README holds the running instructions and selector conventions.

## Index

One line per section, so this file can be scanned before any of it is read. The
reference sections come first, then the Status table, then the dated narratives in
the order they were written; the parenthesised note says what you would come looking
for. `scripts/log-index-gate.mjs` holds this list against the file.

- [The rule that comes before the units](#the-rule-that-comes-before-the-units) — why a UI change ships a *passing* case in the same PR, and the two rules the four navigation defects paid for.
- [Working rule: one unit per PR](#working-rule-one-unit-per-pr) — why two case-adding PRs collide even when git merges both cleanly.
- [Conventions that matter](#conventions-that-matter) — the binding selector rules — `data-testid` only, Ionic's inner `<input>`, scoped `row-*`, no sleeps, the two clicks …
- [Order of attack](#order-of-attack) — the §10 sequence, and why an order of attack goes stale silently.
- [What the suite costs, measured](#what-the-suite-costs-measured) — the 2026-08-19 measurement behind the 60 s budget; what a §2.4 unit costs on WebKit.
- [Status](#status) — **the table** — which spec cases are implemented, in which mode, in which file.
- [E2E-M15-05 — the spreadsheet import, and M15's first case of any kind (2026-08-23)](#e2e-m15-05--the-spreadsheet-import-and-m15s-first-case-of-any-kind-2026-08-23) — what four written-but-unimplemented cases and fake-backed unit tests hid.
- [E2E-G2-04 — the durable outbox (2026-08-21)](#e2e-g2-04--the-durable-outbox-2026-08-21) — the queue survives a reload while still offline.
- [E2E-G2-05 — a refused mutation is parked (2026-08-22)](#e2e-g2-05--a-refused-mutation-is-parked-2026-08-22) — the first case to drive the parked surface against a real `jitpackd`, and the two honesty notes on it.
- [E2E-M4-49/50 — a claim can be given back (2026-08-23)](#e2e-m4-4950--a-claim-can-be-given-back-2026-08-23) — the G-3 claim gains an end; why the note is asserted at all.
- [E2E-G2-07 — a merge announces itself (2026-08-22)](#e2e-g2-07--a-merge-announces-itself-2026-08-22) — `merged` was on the wire and in no client code path.
- [E2E-M18-09 — the status survives the round trip (2026-08-23)](#e2e-m18-09--the-status-survives-the-round-trip-2026-08-23) — the backup's read half was dropping every trip to `planning`; the marks-and-tags half deliberately left out.
- [E2E-G2-08/09 — what the eyeball found (2026-08-23)](#e2e-g2-0809--what-the-eyeball-found-2026-08-23) — two defects that came from rendering a PR rather than reading it, and the sheet that was in no baseline.
- [E2E-G2-06 — the master partition's conflict log (2026-08-22)](#e2e-g2-06--the-master-partitions-conflict-log-2026-08-22) — reading a loss from outside the losing device; how the row is asserted as *read*.
- [E2E-G2-10 — the loss can be taken back (2026-08-22)](#e2e-g2-10--the-loss-can-be-taken-back-2026-08-22) — manual revert; what costs nothing to wait for, and the scoping rule read backwards.
- [E2E-M22-08 — an edited trip is still on M2 (2026-08-22)](#e2e-m22-08--an-edited-trip-is-still-on-m2-2026-08-22) — the partial upsert, and why where the assertion goes is the whole case.
- [E2E-FLOW-10 — the pull cursor only comes from a pull (2026-08-22)](#e2e-flow-10--the-pull-cursor-only-comes-from-a-pull-2026-08-22) — a push hint adopted as a pull cursor; the case asserts the request, not the screen.
- [E2E-M7-06 — why it stopped being partial (2026-08-30)](#e2e-m7-06--why-it-stopped-being-partial-2026-08-30) — an empty-state CTA the screen deliberately does not have — the clause was retired, not owed.
- [E2E-M7-07 — one clause short of what it claimed (2026-08-30)](#e2e-m7-07--one-clause-short-of-what-it-claimed-2026-08-30) — the row's resolved count, the only arithmetic the row does, untested while the id read as complete.
- [E2E-M7-04 — how the case is split, and why](#e2e-m7-04--how-the-case-is-split-and-why) — the `contextmenu` handler, and the guard asserted both ways.
- [The visual unit — the only one that asserts appearance](#the-visual-unit--the-only-one-that-asserts-appearance) — why it is a separate project outside `npm run test:e2e`, and what surfaces, colour and typography each do *not* prove.
- [What the M4 unit deliberately leaves out (rewritten 2026-08-30)](#what-the-m4-unit-deliberately-leaves-out-rewritten-2026-08-30) — two waits that ended without anybody noticing — the paragraph that stood here was wrong in both halves.
- [Corrected 2026-08-13 — an empty screen that read as lost data](#corrected-2026-08-13--an-empty-screen-that-read-as-lost-data) — a wrong diagnosis worth keeping: a render crash read as lost rows, with a real fire-and-forget write underneath.
- [M21 — template from trip (`e2e/template-from-trip.spec.ts`, 2026-08-19)](#m21--template-from-trip-e2etemplate-from-tripspects-2026-08-19) — the unit had to build the lifecycle step it needed.
- [M9/M10 — inventory and item editor (`e2e/inventory.spec.ts`, 2026-08-16)](#m9m10--inventory-and-item-editor-e2einventoryspects-2026-08-16) — the painted result of the two grouping rules, and the two saved-item sections nothing had rendered.
- [M11 — containers (`e2e/containers.spec.ts`, 2026-08-16)](#m11--containers-e2econtainersspects-2026-08-16) — pairing write semantics — both sides at once, exclusive, released.
- [E2E-M5-13 — browser back with the sheet open (2026-08-16)](#e2e-m5-13--browser-back-with-the-sheet-open-2026-08-16) — why the history must be built in-SPA rather than by `page.goto`.
- [M12 — analytics (`e2e/analytics.spec.ts`, 2026-08-16)](#m12--analytics-e2eanalyticsspects-2026-08-16) — the facet handoff asserted by what disappears, not by the chip.
- [M14 — review assistant (`e2e/review.spec.ts`, 2026-08-16)](#m14--review-assistant-e2ereviewspects-2026-08-16) — why the count was deliberately two, and what blocked the positive cases.
- [M14 — the positive half, and the two blocks that hid a defect (2026-08-20)](#m14--the-positive-half-and-the-two-blocks-that-hid-a-defect-2026-08-20) — a second, unrecorded block — and the defect underneath it.
- [M3 — composed templates (`e2e/trip-composition.spec.ts`, 2026-08-16)](#m3--composed-templates-e2etrip-compositionspects-2026-08-16) — why Local Mode is where a missing client-side rule shows.
- [FR-27.12 — looking inside a group (2026-08-16)](#fr-2712--looking-inside-a-group-2026-08-16) — one behaviour on three screens, covered where its absence hurt most.
- [Plain-HTTP instances (`e2e/insecure-context.spec.ts`, 2026-08-16)](#plain-http-instances-e2einsecure-contextspects-2026-08-16) — `crypto.randomUUID` does not exist outside a secure context — found from an iPad, not from a test.
- [FR-27.14 — a Vorlage's resulting items (2026-08-17)](#fr-2714--a-vorlages-resulting-items-2026-08-17) — why the case joins M8's unit instead of starting one.
- [E2E-M5-14 — the sheet header's two round controls (2026-08-16)](#e2e-m5-14--the-sheet-headers-two-round-controls-2026-08-16) — an owner-flagged 4 px, and what only a rendered phone showed.
- [G-2 — the sync detail (2026-08-17)](#g-2--the-sync-detail-2026-08-17) — why a global pattern's cases live in `global-nav.spec.ts`.
- [M18 — the restore half of the backup (2026-08-17)](#m18--the-restore-half-of-the-backup-2026-08-17) — written as a coverage audit of merged PRs: the restore branch had shipped with nothing driving it.
- [FR-5.5 — deliberately not packed (`e2e/skip-item.spec.ts`, 2026-08-18)](#fr-55--deliberately-not-packed-e2eskip-itemspects-2026-08-18) — two paths and one cascade, each able to break unnoticed.
- [FR-27.10 — a whole group onto a running trip (`e2e/group-to-trip.spec.ts`, 2026-08-19)](#fr-2710--a-whole-group-onto-a-running-trip-e2egroup-to-tripspects-2026-08-19) — one tap with three outcomes, two of them reports rather than rows.
- [App shell offline (`e2e/pwa-offline.spec.ts`, 2026-08-20)](#app-shell-offline-e2epwa-offlinespects-2026-08-20) — the NFR-4.13 shell cache, and why the unit is Chromium-only.
- [Single-User backend sync (`e2e/single/server-sync.spec.ts`, 2026-08-20)](#single-user-backend-sync-e2esingleserver-syncspects-2026-08-20) — the first backend-backed unit: a real `jitpackd` behind the client's `server` mode.
- [M4 — the scroll position across the M5 overlay (2026-08-21)](#m4--the-scroll-position-across-the-m5-overlay-2026-08-21) — ADR-012's carried cost, paid.
- [M12 — the positive trend half (2026-08-21)](#m12--the-positive-trend-half-2026-08-21) — a whole past trip built by hand, because the trend needs one.
- [NFR-4.12 — the language actually changes the app (`e2e/i18n.spec.ts`, 2026-08-21)](#nfr-412--the-language-actually-changes-the-app-e2ei18nspects-2026-08-21) — two strings the migration had to move that were on no screen.
- [M22 — a trip's properties and its travellers (`e2e/trip-properties.spec.ts`, 2026-08-21)](#m22--a-trips-properties-and-its-travellers-e2etrip-propertiesspects-2026-08-21) — the consequence rule runs client-side, so a break shows here rather than in Go.
- [Fixed: the losing-offline-edit case was never flaky (2026-08-22)](#fixed-the-losing-offline-edit-case-was-never-flaky-2026-08-22) — a case marked flaky was a product defect — read this before writing off an intermittent.
- [M8/M4 — the composer's chip rows (2026-08-21)](#m8m4--the-composers-chip-rows-2026-08-21) — FR-25.13c, and the focus assertion that turned around with it.
- [M8/M4/M6 — the inventory browse-sheet (2026-08-22)](#m8m4m6--the-inventory-browse-sheet-2026-08-22) — FR-25.13d, and the division of labour it repeats.
- [FR-27.15 — the fold suggestion (2026-08-22)](#fr-2715--the-fold-suggestion-2026-08-22) — why one sentence became two tests sharing one world.
- [§3.28 — the item mark (`e2e/item-mark.spec.ts`, 2026-08-22)](#328--the-item-mark-e2eitem-markspects-2026-08-22) — three things the first red run taught, none visible from the source.
- [E2E-G3-01 (partial) + E2E-G3-03 — the lock goes one tap deeper (2026-08-22)](#e2e-g3-01-partial--e2e-g3-03--the-lock-goes-one-tap-deeper-2026-08-22) — backlog 14(d): a padlock that named nobody and stopped at the row.
- [E2E-G3-02 — the half of a takeover that a single identity can prove (2026-08-24)](#e2e-g3-02--the-half-of-a-takeover-that-a-single-identity-can-prove-2026-08-24) — what was left to assert once FR-5.7 removed the staleness window.
- [The `server` project — two accounts, and what one identity was hiding (2026-08-24)](#the-server-project--two-accounts-and-what-one-identity-was-hiding-2026-08-24) — ADR-029's harness, and the two screens nobody had ever rendered.
- [FR-9.3/9.4 — the closing pass, and what its cases had to be careful about (2026-08-24)](#fr-9394--the-closing-pass-and-what-its-cases-had-to-be-careful-about-2026-08-24) — three drafts that were green against the unfixed build.
- [E2E-FLOW-02 — delegation, and the control it turned out to need (2026-08-25)](#e2e-flow-02--delegation-and-the-control-it-turned-out-to-need-2026-08-25) — writing the case is what found that `packer_user_id` had no writer.
- [FR-1.6 — a name that is already taken (2026-08-25)](#fr-16--a-name-that-is-already-taken-2026-08-25) — why the duplicate-name cases are `local`: no constraint behind the client there.
- [The refusal lost its only UI path (2026-08-25)](#the-refusal-lost-its-only-ui-path-2026-08-25) — `still_referenced` — the client learns to say it, then to undo it.
- [The restore's hard case is the one only a rendered test could show (2026-08-25)](#the-restores-hard-case-is-the-one-only-a-rendered-test-could-show-2026-08-25) — retire frees the name, and what that does to a restore.
- [M20 and G-10 — the two areas the `server` project named as owed (2026-08-28)](#m20-and-g-10--the-two-areas-the-server-project-named-as-owed-2026-08-28) — the admin surface and presence, both rendered for the first time.
- [What rendering it found](#what-rendering-it-found) — the facepile initialled a random hex id — a defect no unit test could see.
- [G-10 was rebuilt rather than completed (2026-08-28)](#g-10-was-rebuilt-rather-than-completed-2026-08-28) — an owner call answered by not building the thing that was asked for.
- [What is deliberately not covered](#what-is-deliberately-not-covered) — and the one entry that was reversed once the seam turned out to point the other way.
- [The avatar upload itself has never been driven](#the-avatar-upload-itself-has-never-been-driven) — recorded rather than quietly left: what is covered, and what is not.
- [E2E-M4-59 — hiding what is already in (FR-25.13e, 2026-08-29)](#e2e-m4-59--hiding-what-is-already-in-fr-2513e-2026-08-29) — what the component test pins, and what only e2e can.
- [FR-25.21 — the three cases, and the four traps they cost (2026-08-29)](#fr-2521--the-three-cases-and-the-four-traps-they-cost-2026-08-29) — all three red-proved; the four traps are the reusable part.
- [FR-25.6 — one buy row for a per-person item (2026-08-29)](#fr-256--one-buy-row-for-a-per-person-item-2026-08-29) — the item is made per-person the way a person makes one.
- [E2E-G3-04 — the lock reaches the cluster, and says whose it is (2026-08-30)](#e2e-g3-04--the-lock-reaches-the-cluster-and-says-whose-it-is-2026-08-30) — one claimed child row, read from a different unclaimed one.
- [FR-21.9 — the amount finally says what it is in (2026-08-30)](#fr-219--the-amount-finally-says-what-it-is-in-2026-08-30) — a four-link chain only a real backend can drive.
- [M6's twenty-two promises, read against the screen (2026-08-30)](#m6s-twenty-two-promises-read-against-the-screen-2026-08-30) — 17 of 22 ids had no test and none was marked unimplemented — the audit shape the later screens follow.
- [The real provider — what a machine checks, and what a person must (2026-08-30)](#the-real-provider--what-a-machine-checks-and-what-a-person-must-2026-08-30) — ADR-029's accepted cost, paid: the opt-in Go test, and the checklist a person runs before a release.
- [The mechanical half](#the-mechanical-half) — `realprovider_test.go` — four read-only GETs behind an issuer env var.
- [The half that needs a person](#the-half-that-needs-a-person) — the pre-release manual pass against the family instance.
- [M5 — six numbers that each meant two things (2026-08-30)](#m5--six-numbers-that-each-meant-two-things-2026-08-30) — a catalogue with two blocks that never met; the first audit whose finding was not a missing case.
- [M18 — the branch the backup never took (2026-08-30)](#m18--the-branch-the-backup-never-took-2026-08-30) — seven ids all driving one branch, four unwritten ones all on the other.
- [M8 — twenty-four ids, and a control nothing had ever clicked (2026-08-30)](#m8--twenty-four-ids-and-a-control-nothing-had-ever-clicked-2026-08-30) — the first screen with no unwritten ids — read clause by clause instead.
- [The four inherited id collisions, read against their screens (2026-08-30)](#the-four-inherited-id-collisions-read-against-their-screens-2026-08-30) — the debt register emptied, and why a loser is struck through rather than renumbered.
- [M1 and M19 — the front door nobody had opened (2026-08-30)](#m1-and-m19--the-front-door-nobody-had-opened-2026-08-30) — every spec passes through both screens and none of them asserts either.
- [M15 — the step nobody had opened, and the screen that opens once (2026-08-30)](#m15--the-step-nobody-had-opened-and-the-screen-that-opens-once-2026-08-30) — and the correction: the „opens once" half was the navigation anchors, not M15.
- [The subscription helper was not deterministic, and said it was (2026-08-30)](#the-subscription-helper-was-not-deterministic-and-said-it-was-2026-08-30) — a doc comment claiming determinism over a buffered frame — the race and its fix.
- [M14 and M16 read against their screens (backlog item 6, 2026-08-30)](#m14-and-m16-read-against-their-screens-backlog-item-6-2026-08-30) — two screens at opposite ends: everything implemented, and nothing at any layer.
- [An id in the title is a case you can run (2026-08-31)](#an-id-in-the-title-is-a-case-you-can-run-2026-08-31) — a comment cannot be run with `-g`; 16 of 18 ids were quotations rather than coverage.
- [The switch nobody interrupted (2026-08-31)](#the-switch-nobody-interrupted-2026-08-31) — a page pushed that nothing popped — the larger half of an M15 symptom.
- [Three promises about saying, not doing (2026-08-31)](#three-promises-about-saying-not-doing-2026-08-31) — three owner decisions with one shape that no gate finds.
- [Two sections nobody had built, and the pixel that changed one (2026-08-31)](#two-sections-nobody-had-built-and-the-pixel-that-changed-one-2026-08-31) — FR-27.8/27.9 specified in July, in three documents, in no build.
- [A picker that had to offer a year outside its own window (2026-08-31)](#a-picker-that-had-to-offer-a-year-outside-its-own-window-2026-08-31) — why M22's year picker cannot reuse the other two.
- [A screen that aggregated rows it had never loaded (2026-08-31)](#a-screen-that-aggregated-rows-it-had-never-loaded-2026-08-31) — M1's largest finding was none of its three owner decisions.
- [Two faces, because three cost a line (2026-08-31)](#two-faces-because-three-cost-a-line-2026-08-31) — a column with a writer and no reader, and how the pile is sized.
- [Two silences, and where each case had to live (2026-08-31)](#two-silences-and-where-each-case-had-to-live-2026-08-31) — a helper that returned nothing and a caller that asked nobody.
- [The baseline for the screen the pixel found (2026-08-31)](#the-baseline-for-the-screen-the-pixel-found-2026-08-31) — why M16's baseline was deliberately recorded last.
- [The baseline had recorded a scroll position (2026-08-31)](#the-baseline-had-recorded-a-scroll-position-2026-08-31) — a 6 % diff on a docs-only commit — what a baseline must not capture.
- [One shard was red, and it was not this change (2026-08-31)](#one-shard-was-red-and-it-was-not-this-change-2026-08-31) — kept for the reasoning: a strict-mode violation visible only in the artefact.
- [Two ways to wedge the `single` project (2026-08-31)](#two-ways-to-wedge-the-single-project-2026-08-31) — two hangs that name nothing — the run simply never ends.
- [Three intermittents, one signature (2026-08-31)](#three-intermittents-one-signature-2026-08-31) — measured rather than retried; what a loaded shard does to three specific cases.
- [E2E-FLOW-04 — the loop that did not close (2026-08-31)](#e2e-flow-04--the-loop-that-did-not-close-2026-08-31) — and FLOW-03, which was covered and did not know it.
- [E2E-FLOW-05 — a history worth nothing on the second device (2026-08-31)](#e2e-flow-05--a-history-worth-nothing-on-the-second-device-2026-08-31) — every part built and unit-tested, the journey broken.
- [E2E-FLOW-07 — the migration whose first step is not in the app (2026-08-31)](#e2e-flow-07--the-migration-whose-first-step-is-not-in-the-app-2026-08-31) — FR-19.5's promise that Local Mode is not a trap.
- [E2E-FLOW-09 — the world that could not falsify its own clause (2026-08-31)](#e2e-flow-09--the-world-that-could-not-falsify-its-own-clause-2026-08-31) — every step covered, the loop not — and a clause the world could not falsify.
- [The NFR journeys — five modes read off the wrong thing (2026-09-01)](#the-nfr-journeys--five-modes-read-off-the-wrong-thing-2026-09-01) — §6's journeys, and the difference between reading a mode off the screen and off the request.
- [Two files, one account, two workers (2026-09-02)](#two-files-one-account-two-workers-2026-09-02) — a red `e2e-server` that was not the Dependabot patch: two defects that only meet on a schedule.
- [E2E-M5-12 — the flake was a second mount (2026-09-05)](#e2e-m5-12--the-flake-was-a-second-mount-2026-09-05) — three red WebKit runs, zero local ones; an element identity turns a load-dependent window into an assertion.

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

- **`data-testid` only.** Never text or CSS-class selectors. Adding the missing testids to a component is part of writing the case, and the attribute is the contract — renaming one is a breaking change to the suite.
- **Ionic inputs need `.locator('input')`.** `getByTestId('x')` finds the `<ion-input>` host; the fillable element is the `<input>` inside it.
- **Seed through the app, not around it** (spec §2.4). Use `createTripViaWizard` and friends. A fast-path that writes rows directly is allowed only for `server`-mode preconditions that are not themselves under test.
- **No sleeps, ever.** Playwright's `expect` retries on its own; assert the outcome, never wait a fixed time for it. If a case can only pass by waiting and hoping, the fault is in the production code — give it a deterministic seam. This is the same rule the Go suite follows and it is not negotiable in either.
- **Tags:** `@smoke`, `@local`, `@single`, `@server`, plus `@mNN` per screen. Run a slice with `npm run test:e2e -- --grep @local`.
- **A `row-*` locator is always scoped** (2026-08-30). `QuantityStepper` renders `row-check`/`row-minus`/`row-plus` and is used by M4's rows, M5's packing block and M8 alike — the ids name the *control*, not the screen, which is right, and a rename would be a breaking change across three units. While M5 is open the list behind it is still painted, so an unscoped `getByTestId('row-check')` is genuinely ambiguous. Scope to `m5-sheet` or to `m4-row-<name>`, never to the page. The suite has always done this; it was a habit rather than a rule until the M5 audit found no line saying so.
- **A uuid in a DOM `id` is not always a missing testid** (2026-08-30). `ItemDetailSheet`'s note articles carry `id="comment-<uuid>"` because that is production's own scroll target for the G-4 `?comment=` deep link. It stays, and the addressable handle sits beside it as `m5-note-<body>`. Recorded so the next audit does not re-file it as the pattern the M4 audit named.
- **An archived trip takes two clicks, not one** (FR-9.3, 2026-08-24). `m4-archive` no longer archives: it opens the closing pass, and **`m4-pass-finish` is what archives**. Every case that needs an archived trip — M14's, M21's, M12's trend, the backup unit — goes `m4-start` → `m4-archive` → `m4-pass-finish`. Skipping the pass without marking anything is a supported path, so a case that only wants the archived state needs no extra staging. This is written here because it is the kind of change that breaks *other* people's units: three specs kept clicking the one control and failed across three shards, and the `server` cases that were still owed when this was written — delegation, presence, M20, all landed since — will all reach for an archived trip eventually.

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

## Status

| Unit | Spec cases | Mode | File |
|---|---|---|---|
| Harness smoke | E2E-M19-01 (full since 2026-08-30 — the choice itself, the persistence request and the reload), E2E-M19-04, E2E-G7-01 (the Dashboard's half) | `local` | [`smoke.spec.ts`](../client/e2e/smoke.spec.ts) |
| M1 dashboard (populated) | E2E-M1-01 (card, open count, three previews, the remainder, and the card into M4), E2E-M1-02 (the prep card, and that ticking resolves on the trip), E2E-M1-06/06b (the departure-day section), E2E-M1-07 (the prep name opens its row), E2E-M1-03b (no delegation section without accounts), E2E-M1-08 (the planned-trips section, and that starting a trip moves it) | `local` | [`dashboard.spec.ts`](../client/e2e/dashboard.spec.ts) |
| Navigation / one header bar | E2E-G9-03 … E2E-G9-08 | `local` | [`navigation.spec.ts`](../client/e2e/navigation.spec.ts) |
| M3 trip creation | E2E-M3-01, E2E-M3-03, E2E-M3-14 (incl. the FR-25.9 absence check), E2E-M3-05, E2E-M3-10, E2E-M3-19, E2E-M1-05, E2E-M3-20 (FR-2.1d date bound) | `local` | [`trip-creation.spec.ts`](../client/e2e/trip-creation.spec.ts) |
| Global navigation & app bar | E2E-G9-09, E2E-G9-17, E2E-G1-06, E2E-G9-10, E2E-G9-11, E2E-G9-12, E2E-G9-13, E2E-G9-14, E2E-G9-15, E2E-G9-16 (UX-17 content column), E2E-G1-01 (partial), E2E-G1-02, E2E-G1-03, E2E-G1-04, E2E-G1-05, E2E-G12-01 (partial), E2E-G12-02, E2E-G8-02, E2E-G2-02, E2E-G2-03, E2E-G2-08, E2E-G2-09, E2E-G7-02, E2E-G12-05, E2E-G12-06, E2E-G12-07, E2E-M3-15, E2E-M3-16, E2E-M4-32 | `local` | [`global-nav.spec.ts`](../client/e2e/global-nav.spec.ts) |
| M5 item detail | E2E-M5-09 … E2E-M5-14, E2E-M5-17, E2E-M5-05 (a note becomes a task), E2E-M5-23 (the companion offer), E2E-G8-01 (no delegation picker), E2E-G4-01 (the notification's landing) | `local` | [`item-detail.spec.ts`](../client/e2e/item-detail.spec.ts) |
| M4 packing list | E2E-M12-06, E2E-M4-01, E2E-M4-04, E2E-M4-36, E2E-G6-02, E2E-M4-18 (both directions), E2E-M4-20, E2E-M4-21, E2E-M4-22, E2E-M4-23, E2E-M4-44, E2E-M4-45, E2E-M4-46, E2E-M4-47, E2E-M4-15 (partial), E2E-M4-02 (partial), E2E-M4-28 (partial), E2E-M4-56 (UX-9 name column), E2E-M4-57 (UX-13 bar overflow), E2E-M4-59 (FR-25.13e hide-carried), E2E-M4-60 … E2E-M4-63 (FR-25.13f: the browse-sheet's two verbs, on a free line and a carried one, and the line's own undo), E2E-M4-25 (+ E2E-M4-08, the prep lifecycle), E2E-M4-24 (the stamp's time, and that it clears), E2E-M4-11 (the shopping count), E2E-M4-19 (the shared bucket's word), E2E-G12-03, E2E-G12-04, E2E-G6-01 (the hold, and the row gesture that was swallowing it), E2E-M4-66 (FR-20.4: the quick-add names the companions it pulled), E2E-M4-67 (FR-25.4a: only the unusual mode is drawn) | `local` | [`packing-list.spec.ts`](../client/e2e/packing-list.spec.ts) |
| FR-25.21 membership · FR-25.8 per-person quick-add | E2E-M5-18, E2E-M5-19, E2E-M5-20, E2E-M5-21 (the state follows the numbers — implemented since 2026-08-30 and missing from this row until the M5 audit), E2E-M4-12/E2E-M4-58 (one cluster, not N items), E2E-M4-14 (packing one instance does not flatten the other), E2E-M4-64 (G-8: the mode is absent), E2E-M4-65 (the browse-sheet path) | `local` | [`membership.spec.ts`](../client/e2e/membership.spec.ts) |
| G-3 packing claim | E2E-M4-49, E2E-M4-50 | `local` | [`lock-claim.spec.ts`](../client/e2e/lock-claim.spec.ts) |
| FR-9.3 judging a trip | E2E-M4-51 … E2E-M4-55 | `local` | [`closing-pass.spec.ts`](../client/e2e/closing-pass.spec.ts) |
| Typography | E2E-G13-01, E2E-G13-02, E2E-G13-03, E2E-G13-04 | `local` | [`typography.spec.ts`](../client/e2e/typography.spec.ts) |
| Colour anchors | E2E-G11-02, E2E-G11-03, E2E-G11-04, E2E-G11-05 | `local` | [`colour-anchors.spec.ts`](../client/e2e/colour-anchors.spec.ts) |
| Visual baselines | E2E-VIS-01 … E2E-VIS-09 | `local` | [`visual.spec.ts`](../client/e2e/visual.spec.ts) |
| Pack-out & undo | E2E-M4-33, E2E-M4-34, E2E-M4-35 | `local` | [`pack-out.spec.ts`](../client/e2e/pack-out.spec.ts) |
| Deliberately not packed | E2E-M4-37 … E2E-M4-42, E2E-M5-16 | `local` | [`skip-item.spec.ts`](../client/e2e/skip-item.spec.ts) |
| Surfaces | E2E-G14-01, E2E-G14-02, E2E-G14-03 | `local` | [`surfaces.spec.ts`](../client/e2e/surfaces.spec.ts) |
| M7 template scopes | E2E-M7-04, E2E-M7-05 (the header icon into M18), E2E-M7-06 (both empty states), E2E-M7-07 (three tests here plus the include half in the M8 unit), E2E-M7-08, E2E-M7-09, E2E-M7-10 (two tests) | `local` | [`template-list.spec.ts`](../client/e2e/template-list.spec.ts) |
| M8 template editor | E2E-M8-01, E2E-M8-02, E2E-M8-03, E2E-M8-04, E2E-M8-05, E2E-M8-06 (its own test only since the 2026-08-30 audit), E2E-M8-07 (incl. E2E-M7-07's include half), E2E-M8-08, E2E-M8-10, E2E-M8-11 (editor half), E2E-M8-12, E2E-M8-13, E2E-M8-14, E2E-M8-15, E2E-M8-16, E2E-M8-17, E2E-M8-21, E2E-M8-22, E2E-M8-23 (two tests), E2E-M8-18, E2E-M8-24 (two tests) | `local` | [`template-editor.spec.ts`](../client/e2e/template-editor.spec.ts) |
| M6 shopping (composer wiring, FR-25.11j reveal, FR-25.6 aggregation) | E2E-M6-21, E2E-M6-17 (**with E2E-FLOW-03**, whose journey it already was — since 2026-08-31 it also reads the state the row arrives in), E2E-M6-22, E2E-M6-05, E2E-M6-06 | `local` | [`shopping.spec.ts`](../client/e2e/shopping.spec.ts) |
| M9/M10 inventory & item editor | E2E-M9-01, E2E-M9-06, E2E-M9-05, E2E-M9-08 (tag-axis clearance, UX-4), E2E-M9-10 (search filters), E2E-M9-04 (empty state → M15), E2E-M10-07, E2E-M10-08, E2E-M10-10 (renumbered 2026-08-30 — they ran as M10-01 … M10-05), E2E-M10-03, E2E-M10-04 (new 2026-08-30), E2E-M10-13 (German-seeded), E2E-M10-16 | `local` | [`inventory.spec.ts`](../client/e2e/inventory.spec.ts) |
| FR-24.3 lifecycle delete | E2E-M10-14, E2E-M10-15, E2E-M7-11 | `local` | [`lifecycle-delete.spec.ts`](../client/e2e/lifecycle-delete.spec.ts) |
| FR-24.3 restore (M23) | E2E-M23-01, E2E-M23-02, E2E-M23-03, E2E-M23-04 (the Vorlage half) | `local` | [`restore-retired.spec.ts`](../client/e2e/restore-retired.spec.ts) |
| §3.28 the item mark | E2E-M10-11, E2E-M10-12, E2E-M9-07, E2E-M4-48, E2E-G15-01, E2E-G15-02, E2E-M5-15 | `local` | [`item-mark.spec.ts`](../client/e2e/item-mark.spec.ts) |
| M11 containers | E2E-M11-02, E2E-M11-04, E2E-M11-05 (incl. M11-01's create/edit and, since 2026-08-30, FR-25.15's absent Save button), E2E-M11-06 (incl. M11-01's delete, M11-03 folded in), E2E-M5-22 (M5 moves an item between two of them), E2E-M11-07 (UX-8 empty state) | `local` | [`containers.spec.ts`](../client/e2e/containers.spec.ts) |
| M12 analytics | E2E-M12-01 (rewritten 2026-08-30: the Gepäck dimension over a real bag, FR-10.4), E2E-M12-02 (incl. the UX-11 tile absences), E2E-M12-03 (both halves since 2026-08-21), E2E-M12-04, E2E-M12-05, E2E-M12-07 | `local` | [`analytics.spec.ts`](../client/e2e/analytics.spec.ts) |
| M2 trip list rows | E2E-M2-12 (locale dates, UX-5), E2E-M2-08 (the *Imported* chip), E2E-M2-03 (the traveller pile), E2E-M2-02 (series grouping → M16), E2E-M2-16 (the empty state) | `local` | [`trip-list.spec.ts`](../client/e2e/trip-list.spec.ts) |
| M2 row actions (the slide menu) | E2E-M2-06 (no Share without a session), E2E-M2-07 (export, both branches) | `local` | [`trip-list.spec.ts`](../client/e2e/trip-list.spec.ts) |
| M2 opening segment (FR-2.8) | E2E-M2-13, E2E-M2-13b, E2E-M2-13c, E2E-M2-13d | `local` | [`trip-list.spec.ts`](../client/e2e/trip-list.spec.ts) |
| FR-27.4 group changes | E2E-M8-09, E2E-M8-19 | `local` | [`group-refresh.spec.ts`](../client/e2e/group-refresh.spec.ts) |
| M3 composed templates | E2E-M3-11, E2E-M3-13, E2E-M3-18 | `local` | [`trip-composition.spec.ts`](../client/e2e/trip-composition.spec.ts) |
| FR-27.10 group into a running trip | E2E-M4-26 (two cases), E2E-M4-27, E2E-M8-20 | `local` | [`group-to-trip.spec.ts`](../client/e2e/group-to-trip.spec.ts) |
| M15 spreadsheet import | E2E-M15-06, E2E-M15-07, E2E-M15-08, E2E-M15-10 (G-17 file trigger), E2E-M15-03, E2E-M15-11, E2E-M15-12 (all three new 2026-08-30), E2E-M15-13, E2E-M15-02, E2E-M15-04b (the three promises built 2026-08-31), **E2E-NFR-07** (the state behind the refusal, 2026-09-01) | `local` | [`spreadsheet-import.spec.ts`](../client/e2e/spreadsheet-import.spec.ts) |
| M2 trip progress | E2E-M2-10 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| Clone without opening the source | E2E-M2-11 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| Sync paging | E2E-SYNC-01 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| G-5 optimistic write, refused | E2E-G5-01 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| M2 opening segment, settled guard | E2E-M2-14 | `single` | [`single/opening-segment.spec.ts`](../client/e2e/single/opening-segment.spec.ts) |
| Single-User is discovered, not configured (invariant 5) | E2E-M19-02 **/ E2E-NFR-02** (the `single` destination; the `server` one is `loginAs`) | `single` | [`single/mode-discovery.spec.ts`](../client/e2e/single/mode-discovery.spec.ts) |
| Editable display name and profile circle (FR-17.13, FR-23.4a) | E2E-M17-04 | `single` | [`single/settings-profile.spec.ts`](../client/e2e/single/settings-profile.spec.ts) |
| Avatar pan/zoom crop and upload (FR-17.13) | E2E-M17-12 | `single` | [`single/settings-profile.spec.ts`](../client/e2e/single/settings-profile.spec.ts) |
| Profile under an OIDC session: picture editable, name not (FR-17.13, revised 2026-08-29) | E2E-M17-05, E2E-M17-05b | `server` | [`server/settings-profile.spec.ts`](../client/e2e/server/settings-profile.spec.ts) |
| M18 backup & restore (restore list) | E2E-M18-05, E2E-M18-06, E2E-M18-07, E2E-M18-08, E2E-M18-09, E2E-M18-10, E2E-M18-11, E2E-M18-12 | `local` | [`backup-restore.spec.ts`](../client/e2e/backup-restore.spec.ts) |
| M18 portable import (merge preview) | E2E-M18-01, E2E-M18-02, E2E-M18-03, E2E-M18-04 | `local` | [`backup-restore.spec.ts`](../client/e2e/backup-restore.spec.ts) |
| M14 review | E2E-M14-01, E2E-M14-02, E2E-M14-03 (pair scope), E2E-M14-04 (+04b, and the FR-27.12 peek since 2026-08-30), E2E-M14-05, E2E-M14-06 (both the archive that skips and the empty state, since 2026-08-30), **E2E-FLOW-04** (the loop closing, since 2026-08-31) + a G-9 back case | `local` | [`review.spec.ts`](../client/e2e/review.spec.ts) |
| M16 series & destination profile | E2E-M16-01, E2E-M16-02, E2E-M16-03, E2E-M16-04 + a G-9 back case | `local` | [`series.spec.ts`](../client/e2e/series.spec.ts) |
| M21 template from trip | E2E-M21-01, E2E-M21-02 (+02b), E2E-M21-03 (+03b, +03c), E2E-M21-04, E2E-M21-05, E2E-M4-43, **E2E-FLOW-09** (the year-long round trip, since 2026-08-31) | `local` | [`template-from-trip.spec.ts`](../client/e2e/template-from-trip.spec.ts) |
| M22 trip properties | E2E-M22-01, E2E-M22-02, E2E-M22-03, E2E-M22-04, E2E-M22-05, E2E-M22-07, E2E-M22-08, E2E-M22-09 (toast geometry), E2E-M22-10, E2E-M22-11, E2E-M22-06 (in `global-nav.spec.ts`) | `local` | [`trip-properties.spec.ts`](../client/e2e/trip-properties.spec.ts) |
| App shell offline (NFR-4.13) | E2E-PWA-01, E2E-PWA-02 (rewritten 2026-09-01), E2E-PWA-03, **E2E-PWA-04** (the update policy, new 2026-09-01), **E2E-PWA-05 / E2E-PWA-05b** (FR-19.7 — applying it now, and *Später*, new 2026-09-02), **E2E-NFR-01** (the offline *write*, 2026-09-01) | `local` | [`pwa-offline.spec.ts`](../client/e2e/pwa-offline.spec.ts) |
| Storage durability (NFR-4.11) | E2E-NFR-03, E2E-NFR-03b | `local` | [`storage-durability.spec.ts`](../client/e2e/storage-durability.spec.ts) |
| Web Push registration (NFR-4.6) | E2E-NFR-06 | `server` | [`server/push.spec.ts`](../client/e2e/server/push.spec.ts) |
| Two accounts on one instance | E2E-FLOW-01 (server half: convergence, membership, attribution), **E2E-FLOW-01b** (the member's pack on the owner's screen, since 2026-09-01), E2E-G3-01 (identity half) + E2E-G3-03 (identity half), E2E-G3-02 (takeover half), E2E-G3-04 (membership lock), E2E-FLOW-02 (delegation, and with it E2E-M4-30 + E2E-M4-31's header guard), E2E-M4-10 / E2E-M4-24 (attribution, inside FLOW-01), E2E-M2-05 (delete is the owner's alone), E2E-M17-01 (a preference silences one kind) | `server` | [`server/multi-user.spec.ts`](../client/e2e/server/multi-user.spec.ts) |
| Notifications speak the recipient's language (NFR-4.12) | E2E-NOTIFY-01 | `server` | [`server/multi-user.spec.ts`](../client/e2e/server/multi-user.spec.ts) |
| M17 API tokens (FR-23.7) | E2E-M17-13, E2E-M17-13b | `server` | [`server/api-token.spec.ts`](../client/e2e/server/api-token.spec.ts) |
| M20 instance administration | E2E-M17-09, E2E-M20-01, E2E-M20-02, E2E-M20-03 (name half), E2E-M20-03b (avatar half), E2E-M20-04, E2E-M20-05 (the OIDC non-admin half; the `single`/`local` half is hidden by construction and unassertable), E2E-M20-06 | `server` | [`server/admin.spec.ts`](../client/e2e/server/admin.spec.ts) |
| G-10 trip presence | E2E-G10-01 (facepile, the in-sync badge, the tap), E2E-G10-02 (the lagging half over the wire) | `server` | [`server/presence.spec.ts`](../client/e2e/server/presence.spec.ts) |
| Instance currency | E2E-M9-09 | `single` | [`single/instance-currency.spec.ts`](../client/e2e/single/instance-currency.spec.ts) |
| Single-User backend sync | E2E-FLOW-01 (partial), E2E-FLOW-06, E2E-G2-01, E2E-FLOW-08 / E2E-NFR-04 (partial), E2E-G2-04, E2E-G2-05, E2E-G2-06, E2E-G2-07, E2E-G2-10, E2E-G2-11, E2E-G2-12, E2E-FLOW-10, E2E-G3-01 (partial) + E2E-G3-03, E2E-G3-02 (mode gate only), E2E-M15-05, E2E-M15-09, **E2E-FLOW-05** (the migrated history on a second device, since 2026-08-31), **E2E-FLOW-07** (the move off Local Mode, since 2026-08-31), **E2E-G2-13** / **E2E-G2-14** (a dead socket is dialled again, and coming back pulls at once — since 2026-09-01) | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| Language choice (NFR-4.12) | E2E-M17-10, E2E-M17-11 | `local` | [`i18n.spec.ts`](../client/e2e/i18n.spec.ts) |
| M17 device settings (theme, backup reminder, G-8) | E2E-M17-06, E2E-M17-07, E2E-M17-07b, E2E-M17-08, **E2E-M17-14b** (FR-19.8's guard, both directions, since 2026-09-02) | `local` | [`settings.spec.ts`](../client/e2e/settings.spec.ts) |
| M17 leaving Local Mode (FR-19.8, ADR-045) | **E2E-M17-14** (the whole move on one device, read back from the server), **E2E-M17-14c** (skip is not restore) — both since 2026-09-02 | `single` | [`single/leave-local-mode.spec.ts`](../client/e2e/single/leave-local-mode.spec.ts) |
| M17 data export under a session (NFR-4.5) | E2E-M17-03 **/ E2E-NFR-05** | `server` | [`server/data-export.spec.ts`](../client/e2e/server/data-export.spec.ts) |

**What this table does and does not say.** Every row names the cases that exist; it
does not claim the screen behind it is finished. Since the 2026-08-30/09-02 audits
every screen has been read promise by promise against the build, and spec §3's global
patterns, §5's ten flows and §6's non-functional journeys all have cases — but a
promise that turned out not to be assertable through the UI was **retired in the
spec** rather than covered here, and each retirement is recorded in the sections
below. Read those before concluding that a missing case is owed.

**A green `e2e` job is not a verified UI.** It says the implemented cases passed.

## E2E-M15-05 — the spreadsheet import, and M15's first case of any kind (2026-08-23)

**E2E-M15-05 — the spreadsheet import, added 2026-08-23, and M15's first
case of any kind.** Until it, M15 had **no** e2e coverage — four written
cases, none implemented — and its unit tests ran against fakes with no
schema. What that combination hid: `createImportedTrip` never wrote `year`,
which `trips` declares NOT NULL, so the server refused every trip the wizard
imported. Nothing on the importing device could notice, because the
optimistic row was already in its own store and M2 rendered the migration
that had not happened. The case therefore asserts from a **second browser
context**, which never saw the optimistic write; the assertion on page A
alone is green against the defect. Rebuild before mutating (`npm run build`)
— Playwright drives the built bundle, so a source-only revert proves nothing.

Two smaller things the case had to learn about the screen it drives: an
`ion-checkbox` contributes a hidden `input` to its row, so the two IonInputs
are addressed as `ion-input` and not as `input`; and FR-16.2 imports rows
already packed, so on M4 they are behind the done bar rather than in the list.

## E2E-G2-04 — the durable outbox (2026-08-21)

**E2E-G2-04 — the durable outbox (B2, NFR-4.1), added 2026-08-21.** A new
case in the `single` unit: pack a row offline, reload the page *while still
offline*, and the queue is still there — count on the glyph, sentence in the
G-2 sheet — then drains when the trip is opened with a network again, and a
device that never saw the change reads it back. The app shell for that
offline reload is the PWA's (E2E-PWA-01); the case asserts the back button
rather than E2E-PWA-01's logo, because inside a trip the app bar carries no
logo. **Proved red against the unfixed build**: with the outbox store
unwired the count is simply absent after the reload.

## E2E-G2-05 — a refused mutation is parked (2026-08-22)

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

## E2E-M4-49/50 — a claim can be given back (2026-08-23)

**E2E-M4-49/50 — a claim can be given back, added 2026-08-23.** The G-3
claim has worked for a long time; what it could not do was *end*. Nothing
released it but packing the row or the §7 window passing, so a tap made by
mistake held the row against everyone else for a quarter of an hour.

**The note is asserted because my own claim locks nothing for me.** That is
the whole asymmetry: the device holding the row is the one device that sees
no padlock, so it is the one that has to be told in words. The release is
then asserted twice over — the note gone *and* the row still present — since
a note that disappeared together with its row would satisfy the first half
on its own.

The menu case counts its buttons rather than only naming one, so an option
added later cannot slip in unnoticed; what it excludes is *skip*, which on a
row you are mid-way through packing is not a thing anyone means. Both
mutation-proved by making the menu blind to its own claim.

## E2E-G2-07 — a merge announces itself (2026-08-22)

**E2E-G2-07 — a merge announces itself, added 2026-08-22.** `merged` is an
outcome the wire has always carried and the client read in no code path: a
mutation that lost a field left the queue exactly like one that applied
cleanly, so nothing ever told the user. The assertion lives inside the
existing losing-edit case because that is the one place in the suite where a
real server merges a real edit away — building a second world to produce one
would buy nothing.

**The toast is asserted first and dismissed by hand.** It auto-dismisses on
a timer, so asserting it after the case's M5 steps would race that timer —
the first draft did exactly that. Nothing after the dismissal depends on it;
what the later steps assert is the sheet's standing line, which has no
timer.

## E2E-M18-09 — the status survives the round trip (2026-08-23)

**E2E-M18-09 — the status survives the round trip, added 2026-08-23.** The
backup's read half gained the thing it had been quietly dropping: every
restored trip was `planning` (FR-18.4), so a device of archived history came
back as plans. The case takes a trip through the app's own lifecycle, backs it
up, and restores it onto a second context — and asserts both halves, that it is
on *Archived* **and** that it is not on *Planned*, because Planned is exactly
where it used to be and an assertion that only checked Archived would have
passed against a segment picked for it rather than derived from it.

Two things it had to learn, both cheap and both invisible from the source:

- **A single-document backup never reaches the restore branch.** A device with
  one trip and no template produces one document, and M18 then shows the
  per-item merge preview instead — `portable-restore-commit` never appears. The
  case builds a template as well, which is what a real device has anyway.
- **`segment-button-after-checked` contains the word "checked".** The regex
  guards the full `segment-button-checked`, and a looser one would have matched
  the *neighbour* of the selected segment.

**What is deliberately not here:** the marks-and-tags half of ADR-024. It is
unit-covered at the same boundary this case crosses — `buildBackup` into
`commitPortableRestore` on a fresh store — and building a tagged, marked
inventory item through M10 would double this case to assert what is already
asserted. Recorded rather than assumed, so nobody reads the id list as a claim
that the whole ADR is e2e-covered.

## E2E-G2-08/09 — what the eyeball found (2026-08-23)

**E2E-G2-08 and E2E-G2-09 — what the eyeball found, added 2026-08-23.** Both
came out of rendering PR #160 rather than out of reading its diff, and both are
the same shape: a rule that held everywhere it was written down, and a rendered
result that was still wrong.

The sheet's state glyph sat **14.5 px above its title**. `.head` aligned the
38 px circle to the top of the *title block*, and the `h1` inside carried a
20 px top margin nothing had asked for — `.jp-sheet-title` names a type role
and no spacing at all, so those pixels were an inherited user-agent default the
component never reset. Two fixes were built and measured against each other
before either was chosen: resetting the margin alone lands at **+5.5 px**,
because a 38 px circle and a 29 px line flush at the top cannot centre on each
other and the residual moves again with the title's size; giving the glyph and
the title their own centred row lands at **+0.9 px** and has nothing to re-tune.
The second was chosen at a visible cost — the ✕ comes down onto the title's
line, and the explanation, no longer squeezed beside it, wraps one word later.

The master log's empty state **ran from edge to edge**, because the page had
copied the house empty state without its `padding` and `text-align`. Nothing
noticed while the only sentence it held fit one line: a shrink-to-fit flex item
looks centred. The master log's names three things, wraps, and the wrapped
paragraph then started at x=0 under a centred icon. The new string exposed a
defect that had been there all along.

**The G-2 sheet was in no visual baseline either**, though it is the one
surface reachable from every screen in every mode. E2E-VIS-08 closes that and
cost no existing baseline. But it is **not** the guard for this defect, and the
review had to correct a first draft that said it was: mutating the fix back
leaves the new baseline **green** at 591 differing pixels, ratio 0.0018, under
the 0.002 the gate allows. That tolerance is the owner's deliberate 2026-08-19
setting — *"this gate catches layout changes, not small ones"* — so the offset
is the geometry case's job and the baseline guards the sheet around it.

## E2E-G2-06 — the master partition's conflict log (2026-08-22)

**E2E-G2-06 — the master partition's conflict log, added 2026-08-22.** The
audit NFR-4.2a promises had one endpoint and two partitions: every
master-partition loser — a group renamed twice, a trip's own dates — was
written with `trip_id NULL` and read by a query that filters on `trip_id`.
The case renames one trip on two devices and reads the loss from **outside**
any trip, which is the part that could not work before.

**Two things it had to learn.** The losing device cannot be navigated to by
its own trip name — the name is exactly what it lost, so `reopenTrip` looked
for a row that no longer existed and the case timed out against correct
code. And the master queue does not move on a trip open: a trip open drains
the *trip* partition, and this rename is queued on the master one. The drain
here is the app start the durable outbox gave it (B2) — a reload, not a
navigation. Mutation-proved by pointing the query back at `trip_id`.

**Widened 2026-08-24 — the row is read, so it is asserted as read.** Both
G-2 log cases were asserting that the row said *something*, and both were
green while it said the wrong thing.

- **E2E-G2-01** asserted `trip_items · assigned_traveler_id` and then, of
  the two values, only that neither was empty — with the comment that
  *which* string they were was not the case's business. They were two raw
  uuids. It now pins `Seil-x · Assigned to` with `Mia → Andy`.
- **E2E-G2-06** used `toContainText` for the losing and winning names. The
  column stores the JSON of a mutation field, and `"Engadin 7 B"` *contains*
  `Engadin 7 B`: the assertion was green against exactly the quoted form it
  looked like it was catching. It is `toHaveText` now.
- The same row asserts the **timestamp is in the app's language**. The suite
  runs a de-CH device with the app pinned to English, so the unfixed
  `toLocaleString()` rendered `24.8.2026, 00:42:54` — measured, not assumed.

Each of the three was mutation-proved separately, because the first two live
in one test and the earlier failure hides the later assertion.

## E2E-G2-10 — the loss can be taken back (2026-08-22)

**E2E-G2-10 — the loss can be taken back, added 2026-08-22.** NFR-4.2a
promises audit *and* manual revert in one sentence; only the audit existed,
so the page named a value it could do nothing about. The case is
E2E-G2-06's scenario carried one step further: B loses the rename, reads it
in the master log, taps *Revert*, and the name B wanted is what the trip is
called again — read back **from M2**, not from the log page, because that
is the half that proves the restore travelled. B's own copy was holding A's
name a moment earlier and only the pull changed it.

**What it costs nothing to wait for.** There is no timer and no drain to
hope for: `revertConflict` drains the partition it wrote before it
resolves, so the assertion lands on a repainted screen. **The negative half
is a positive signal** — the button is asserted *gone* only beside an
assertion that the *Reverted* note is there, because a row that failed to
render at all would satisfy the absence on its own. The refusals the server
distinguishes (`already_reverted`, `row_deleted`, `revert_refused`) stay
where they can be stated exhaustively, in `store/conflict_revert_test.go`
and `api/conflict_revert_test.go`: no screen can delete a row on a second
device or pack an item mid-revert inside one case.

**The first run failed, and the reason is a rule for every later case
here.** The row was located by `trips · name`, the way E2E-G2-06 does —
and found two, then three. **The master partition is shared for the whole
run** (one database, named in this unit's harness notes), so every case
that loses a rename leaves a row that matches. E2E-G2-06 was passing only
because it ran first; both cases now filter by the value *their own* trip
lost, which the per-test `uniq()` suffix makes unique. A conflict-log
assertion in this unit must never identify its row by table and field
alone.

**The second failure was the scoping rule read backwards.** Getting out of
the log used `visiblePage(page).getByTestId('header-back')` — and the one
header bar lives *outside* the router outlet (ADR-011), so the scoped
locator waits forever on a control that is on screen. The rule is "assert
what is rendered, scoped to the visible page"; the header is the standing
exception, and every other case in this file already addresses it
unscoped.

**Testids added with it**, per the ledger's own selector rule:
`conflict-revert` (the control), `conflict-reverted` (the note that
replaces it), `conflict-revert-error` (the per-row refusal sentence) and
`conflict-revert-hint` (the line saying a revert is a new change).

## E2E-M22-08 — an edited trip is still on M2 (2026-08-22)

**E2E-M22-08 — an edited trip is still on M2, added 2026-08-22.** The trip
editor sends a partial upsert on purpose — an upsert of the whole row would
hand back a value another device changed meanwhile, which the field-level
merge exists to avoid. The *optimistic* row applied locally was built from the
same fields, and a store applies a change by replacing the row it has: saving
a name therefore dropped `status`. M2 lists by status, so the trip left every
segment at once, and Local Mode has no pull to bring it back.

**Where the assertion goes is the whole case.** M4 still shows the trip, its
name correctly changed, and E2E-M22-01 — which reopens exactly that screen —
stays green against the defect. Only M2 can see it. The vitest sibling in
`tripProperties.spec.ts` had the matching blind spot in a second way worth
remembering: it asserted `year === 2026` under the comment *"untouched fields
stay"*, and `rowToTrip` defaults a missing year to the current one, so the
assertion held while the field was being dropped. It reads `2031` now.

## E2E-FLOW-10 — the pull cursor only comes from a pull (2026-08-22)

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

## E2E-M7-06 — why it stopped being partial (2026-08-30)

**Why E2E-M7-06 stopped being partial (2026-08-30).** The case asks for an
empty-state *CTA* (create / import). The screen has neither as a button: create
is the FAB and import is the header icon, both already on screen, and the
UI-Spec records that as a decision rather than an omission — so the clause is
retired rather than owed. What the case was missing is the screen's *other*
empty state: M7's States line has always promised two sentences, and both are
painted into one element, so *„Keine Vorlage gefunden"* with the segment still
in place is what tells a narrowed search from an empty instance. Nothing had
typed into M7's search until this case — the twin of E2E-M9-10, found on the
next screen the same day, and the same lesson: a screen's search is usually
covered as far as *opening the field*.

## E2E-M7-07 — one clause short of what it claimed (2026-08-30)

**E2E-M7-07 was called complete since the M8 unit, and was one clause short
(corrected 2026-08-30).** The clause is the row's *resolved* item count, which
is the only arithmetic the row does — and the M8 case cannot see it, because
every group in the composition it builds is empty, so the raw count and the
resolved count are both 0. A row that read its own positions instead would have
been green there for as long as the case has existed. `template-list.spec.ts`
now gives the group a position and reads the composed row.

The rest of the original note stands: Its include-dependent half — the
*"N Gruppen ·"* prefix and the *enthält: …* line — needed a Ferien-Vorlage
that actually includes a group, a write only the M8 rebuild could make; the
M8-07 case now builds that composition through the app and asserts both lines
on the M7 row. The resolution arithmetic itself stays covered where it lives, in
`client/src/domain/__tests__/templates.spec.ts` — what the new case adds is the
*wiring*, which no domain test can see. **E2E-M7-05 is the FAB menu's entry, and the FAB has no menu** — the surface
does not exist, and the clause was **struck 2026-08-31 (owner decision)**: a
second door to a function that already has one buys nothing.
The *function* it names does exist, on the header icon, and since 2026-08-30 it
has a case: nothing in the suite had ever tapped that icon. E2E-G9-12 asserts
M18's return-to-origin rule for the entrance from M2 and names M7 in its own
comment without covering it, which is exactly the entrance that could have kept
returning to M18's declared parent, Settings.

## E2E-M7-04 — how the case is split, and why

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

## The visual unit — the only one that asserts appearance

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

## What the M4 unit deliberately leaves out (rewritten 2026-08-30)

**What the M4 unit deliberately leaves out, and why — rewritten
2026-08-30.** The paragraph that stood here said the facet cases
E2E-M4-16/-17/-19 were waiting for a screen that could produce
categorised, assigned rows, and that -24/-30/-31 were waiting for a
second account. Both waits ended without anybody noticing, in two
different ways, and the audit of item 6 is what found it.

The facet cases had **already been written** — as unit tests in
`domain/__tests__/packingView.spec.ts`, where the arithmetic lives.
OR-within/AND-across, the counts taken against the other facets, the
dead-end rule, the selected-at-zero rule, the shared bucket leading its
facet: all nine of them, none carrying an E2E id, so the ledger went on
reporting a gap that a `git grep` of the id could confirm and a reading
of the suite could not. **The blocked entry outlived its blocker and
nothing connected them**, which is a different failure from the one
recorded under E2E-M4-12/-13 — there, the case unblocked and had to be
re-read; here, it was covered and had to be re-*found*.

The second-account cases were genuinely blocked and are now written
(ADR-029's `server` project). E2E-M4-24 split rather than moved: its
*name* half is FLOW-01's, its *time and clearing* half needs no account
at all and is Local Mode's. E2E-M4-30 needed the rule to leave
`PackingListPage.vue` first — see the entry below. E2E-M4-26/-27 landed
with FR-27.10 in 2026-08-19.

What is left out of the M4 unit on purpose is now one line: the
`server`-only cases, which live in `e2e/server/`. **E2E-M4-12/-13 arrived 2026-08-29**
with FR-25.8's per-person quick-add, and neither landed where it was
waiting: -12 is one case with -58, because the two entries describe one
rendered outcome and the second would only re-run it, and -13's premise —
*„the same quick-add for a single traveler"* — no longer exists, since
G-8 makes the mode absent on a trip with one traveler. The state it
promised is reached by a membership of one, which E2E-M5-19 already walks
through, so the case is one assertion added there rather than a trip
built to reach it. A blocked case is worth re-reading when it unblocks:
what unblocks it is often not the thing it was written against.

E2E-M4-28 covers the *session* half of FR-25.18 by leaving M4 and coming
back; the *fresh session* half is a unit test on `usePackingFilter`,
because reaching it in the browser needs a reload — see the finding
below.

## Corrected 2026-08-13 — an empty screen that read as lost data

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

Eight cases, Local Mode; six landed with the M21 screen (FR-27.5) and two with
the 2026-08-30 audit. Notes worth carrying forward:

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
7. **Read clause by clause on 2026-08-30** (backlog item 6). Nothing here
   describes a removed surface and no id sits on the wrong test — this
   catalogue was written with its implementation. Three things it did not
   cover, all of them inside sentences that read as implemented:
   **(a)** the word *checked*. Every case leaves the loose rows in their
   pre-checked state, so no test had ever operated one of those checkboxes —
   a create that took every loose row was green, and so was a checkbox wired
   to nothing (**E2E-M21-04**).
   **(b)** the blast note's number. E2E-M21-02 asserts it *visible*, in a
   world with no trip following the group, where it can only say „no trip
   follows it right now" — the same shape as E2E-M7-07's resolved count:
   a case whose world cannot tell the rule from its negation. The number is
   asserted in **E2E-M21-03c**, the one case that has a following trip, and
   the mutation that proves it leaves M21-02 green.
   **(c)** the FR-1.6 name refusal, added to the screen on 2026-08-25 —
   five days after its cases landed and never revisited by them. Neither the
   note, the disabled *Vorlage erstellen*, nor the rule that exists nowhere
   else (the Vorlage and the bundle group written in one pass must have
   different names) had ever been rendered; the view's own unit spec returns
   *no collision* from its orchestrator double, so it only paints the
   accepting branch (**E2E-M21-05**). **A rule that arrives after a screen's
   cases do is invisible to every one of them.**

**Audited 2026-08-30** (backlog item 6). What each promise is kept by:

| Promise | Kept by | Note |
|---|---|---|
| the closing card leads here from an archived trip, and only from one | E2E-M21-01 + E2E-M4-43 | The negative half is M4-43's, on both earlier statuses. |
| every recognised group, with its on-trip count and the *wird wiederverwendet* marker | E2E-M21-01 + `templateFromTrip.ts` (unit) | One group on screen; *every*, and the order two devices must agree on, are the domain's. |
| the loose ad-hoc rows, all pre-checked, under *Eigene Artikel* | E2E-M21-01 | |
| a deviation names itself and defaults to *Gruppe aktualisieren* | E2E-M21-02 | Ionic marks the chosen segment with a class, not `aria-checked`. |
| the blast line spells out what an accepted deviation reaches | **E2E-M21-03c** | Moved there 2026-08-30: M21-02's world has no following trip, so the note can only produce its *none* branch. |
| an absent group position is reported and offers no choice | E2E-M21-02b | |
| recognised groups are referenced, not copied | E2E-M21-03 (+03b) | M8's includes section is the proof; 03b adds that the Vorlage owns *no* positions, which is what tells an include from a copy. |
| the **checked** loose rows become own positions | **E2E-M21-04** | **New 2026-08-30.** No test had ever operated one of those checkboxes. |
| the deviation marked *aktualisieren* lands in the group | E2E-M21-03 | |
| the deviation marked *own* leaves the group untouched | `templateFromTrip.ts` + `createTemplateFromTrip` (unit) | Both layers; M21-04 proves the screen's choices reach the write. |
| the bundle toggle makes a fresh group instead | E2E-M21-03b | |
| a taken name is refused where it is typed, for **both** names this screen writes | **E2E-M21-05** | **New 2026-08-30.** Added to the screen 2026-08-25, five days after its cases; nothing had rendered the note, the disabled button, or the two-names-must-differ rule. |
| pressing create twice writes one Vorlage | `TemplateFromTripPage.spec.ts` (unit) | A real thumb can provoke it; an e2e case cannot, reliably. |


## M9/M10 — inventory and item editor (`e2e/inventory.spec.ts`, 2026-08-16)

Twelve cases, Local Mode; eight landed with the §3.24 tag rebuild and four with the
2026-08-30 audits (two M9, two M10). What they cover is deliberately what a unit test
cannot: the *painted* result of the two grouping rules, the shape of the creation form,
and the two saved-item sections nothing had ever rendered.

| Case | Spec id | What it pins |
|---|---|---|
| an item on two tags renders once, under its primary tag | E2E-M9-01 | FR-24.2's whole guarantee. A naive "file under every tag" passes every unit test of the store and fails this. |
| the tag axis filters on any tag, not only the primary one | E2E-M9-06 | The axis filters *wider* than the list groups — the two rules differ only in what is rendered. |
| the list is lean until the properties sheet says otherwise | E2E-M9-05 | FR-24.4 end to end: the weight exists on the item, is absent from the row, and appears after the toggle. Asserted on the row, not on `localStorage`. |
| creating hides the sections an item cannot have yet | E2E-M10-07 | FR-24.5 "absent, not emptied", plus the "Mehr ▾" fold. |
| a missing name is answered with a hint, not a dead button | E2E-M10-07 | The button stays live and says why — the failure mode a disabled control hides. |
| a duplicate name is reported before it reaches the push | E2E-M10-10 | The consequence of `UNIQUE(name)` (ADR-014) reaching the user as a sentence rather than a failed sync. |
| an unmatched tag name is created and assigned in one step | E2E-M10-08 | Filter-or-create, including the *second* item finding the tag instead of duplicating it. **Since 2026-08-30 it also pins that an assigned chip survives a filtering query** — the clause is stated in the UI-Spec and in the id, and every case had read the chip with an empty query, which is the one state that cannot tell the rule from its absence. |
| unassigning a tag refiles the item | E2E-M10-08 | The store's cascade mirroring, seen from the list. |
| an empty tag query offers a capped shelf, and search reaches past it | E2E-M10-16 | UX-14: eight chips plus a tail naming the rest, the cap lifted by a query, the tail handing focus to the search — and, at phone width in German, that the placeholder fits its box, measured by rendering it as the value (`scrollWidth`), not by a canvas re-measure that used the wrong font and could not fail. |
| the search filters the list and says so when nothing matches | E2E-M9-10 | **New 2026-08-30.** M9-01's sentence carried the word „searchable" and no assertion; G12-02 opens the field on this screen but never types. Also pins that the emptied group's *heading* goes with its rows, and that a miss is the no-match state rather than G-7's empty one. |
| an empty inventory offers the spreadsheet import | E2E-M9-04 | **New 2026-08-30**, and the first time this state was ever rendered by a test — `m9-empty` existed in the suite only as E2E-G9-13's *absence* assertion. G-7 plus NFR-4.7's return path, which lands on M9 rather than on M15's other parent. |
| a circular dependency is refused in words, and the reverse list only reads | E2E-M10-03 | **New 2026-08-30.** The *„Hängt ab von"* section has existed since §3.20 with no assertion on any of its rules: two other cases *drive* it as setup and M10-13 reads its heading. Pins the default mode, the read-only companion row, and the cycle named hop by hop — the refusal asserted against the companion row still being there, so „no dependency" cannot come from a page that rendered nothing. |
| a photo is added, replaced and removed | E2E-M10-04 | **New 2026-08-30**, the second section with no `data-testid` anywhere. The replace is asserted on `naturalWidth` rather than on the object URL, which a rewrite changes whether or not the image did; the item is left and reopened before the removal, which is what says the bytes were stored rather than previewed. The 150 KB cap stays in `imageResize.spec.ts` and the three server layers. |
| the sections an existing item owns follow the app language | E2E-M10-13 | NFR-4.12 on the half of M10 that only exists after the save. **Seeded in German, and that is the case**: the suite's app language is English, and against English a catalogue lookup and the hard-coded word it replaced render identically — so an English assertion here could not fail. Its negative counterpart above moved off the headings' words onto test ids for the same reason. |

**Seven of these tests carried the wrong id until 2026-08-30**, in two batches with
one cause. The table above
has always named E2E-M9-05 and E2E-M9-06 correctly; the *test names* in the
spec file said `E2E-M9-02` and `E2E-M9-03`, which are two entirely different
promises (the FAB's creation mode, and multi-select merge). Both halves
shipped in the §3.24 rebuild commit, so this was never drift — it was wrong
from the first day, and for a year two ids read as covered while their
behaviours had no test at all. Nothing mechanical could have caught it: each
id is used exactly once, so a duplicate-id gate is green, and the totals are
identical either way. **The only check that finds a swap is reading the id's
sentence against the body of the test under it.**

The M10 half, found the same day, is the same commit and the larger version: five tests
were written under **E2E-M10-01 … E2E-M10-05** while the spec entries the commit marked
*implemented* were **M10-07, M10-08 and M10-10** — and M10-01 … M10-05 were live entries
describing five different promises (the creation form's fields, the FR-2.4 usage footer,
the dependency section, the photo, the „Enthalten in" list). This table has named 07/08/10
correctly since the day it was written, which is the part worth keeping: **the ledger was
right and everything else was wrong**, so a reader checking the suite against the
UI-Test-Spec would have been misled, and one checking it against this file would not have
been. Renumbered 2026-08-30, tests unchanged apart from the clause additions noted above.

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
   recur silently. That comparison is also what found it: the duplicate-name
   case (E2E-M10-10 since the 2026-08-30 renumbering, E2E-M10-03 when this
   was written) passes the identical sequence, which ruled the navigation
   itself out.

## M11 — containers (`e2e/containers.spec.ts`, 2026-08-16)

Six cases, Local Mode: four landed with the M11 rebuild, E2E-M11-07 with the
UX-8 pass and E2E-M5-22 with the 2026-08-30 audit round. The pairing *write
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
   is swallowed. `closeContainerSheet()` (in `fixtures.ts` since 2026-08-30)
   therefore waits for `ion-modal.show-modal`
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

**Audited 2026-08-30** (backlog item 6). What each promise is kept by:

| Promise | Kept by | Note |
|---|---|---|
| create a container, name and limit commit with no Save button | E2E-M11-05 | The *„no Save button"* half was asserted on 2026-08-30; the FR-25.15 matrix row had credited this case with it since the rebuild while the body asserted only that the indicator is present. The indicator is the positive signal the absence stands against. |
| the carrier can be set … | E2E-M11-05 | Set on the chip, read back off the card. |
| … and taken off again | `ContainerSheet.spec.ts` (unit) | **New 2026-08-30.** FR-10.1 calls the carrier optional and nothing at any layer had ever cleared one; a chip that could only hand the bag on was indistinguishable from one that toggles. A write rule, so it is asserted at the write layer. |
| the weight bar's amber and red grades | E2E-M11-02 + `containers.ts` (unit) | The boundary is the domain's; that the grade reaches the painted bar is the e2e's. |
| paired containers report their imbalance, and a delete releases the survivor | E2E-M11-04 | Both cards, and the skew is what makes the release assertable at all. |
| ~~the threshold is configurable per trip~~ | **nothing, and nothing is owed** | `imbalanceThreshold()` honoured `attributes.imbalance_threshold`, and no screen ever wrote that key: the wizard writes three attributes and `tags`, M16 the series' defaults of the same three, M22 none. **Struck 2026-08-31 (owner decision):** FR-10.3 is a fixed 15 %, and the dead attribute branch went with the clause — the reader is now the constant `IMBALANCE_THRESHOLD_PERCENT`. There was never anything here to test. |
| the unassigned bucket is rows, the picker shows loads, a delete unassigns | E2E-M11-06 | FR-25.5's *„never blocks packing"* is not restated here — every M4 case that packs an unassigned row keeps it. |
| the bucket is absent when there is nothing to say | E2E-M11-07 | UX-8. |
| moving an item between two bags | E2E-M5-22 | M11 offers no path to it — see E2E-M11-03. |

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

**Audited 2026-08-30** (backlog item 6), and this unit is where the audit paid
for itself. M12 derives everything it shows, so most of its promises are
`domain/analytics.ts`'s and only their *rendering* is e2e work — but the
rendering is exactly where a screen of derived numbers can go quietly wrong,
and E2E-M12-01 had two clauses that could not fail:

1. **A world where packed equals planned cannot tell you the KPI is the
   pair it claims.** One weighted item, packed, gave `5.0 kg / 5.0 kg`; a
   template printing `plannedWeight` on both sides of the slash satisfied it
   for as long as the case existed. The fix is a second, unpacked row — two
   different numbers — and it costs nothing.
2. **A dimension switch asserted against a locator both dimensions
   render is not an assertion.** The case clicked *Gepäck* and expected
   `analytics-slice-none`, which the *Kategorie* view it started on already
   showed for the same uncategorized item: the absence bucket is keyed `''`
   in every dimension, so the same element was on screen before and after
   the click. Under that sat **FR-10.4** — containers are the Gepäck
   dimension's data source — credited to this case since the rebuild while
   **no test had ever put an item in a bag and opened this screen**. It now
   creates one through M11's own FAB and asserts two slices where Kategorie
   had one, the bag named and carrying its load: a segment that changes
   nothing fails on the count alone.

The M11 helpers (`openLuggage`, `createContainer`, `assignToContainer`,
`closeContainerSheet`) moved into `fixtures.ts` for it rather than being
copied — the M9 unit's lesson about two copies of one navigation sequence,
one of which was missing a wait.

| Promise | Kept by | Note |
|---|---|---|
| bars per dimension value, heaviest first | `analytics.ts` (unit) | Order is arithmetic; the e2e asserts the bars are there and what they say. |
| the switcher reaches Person / Kategorie / Gepäck | E2E-M12-01 (Gepäck, Kategorie), E2E-M12-04/05 (Person) | Rewritten 2026-08-30 — see above. |
| the KPI is packed *within* planned | E2E-M12-01 | Two different numbers since 2026-08-30. |
| the value tile stands only with a value | E2E-M12-07 | Unit-less in `local`; the currency half is E2E-M9-09 on `single` (FR-21.9), same `formatValue`. |
| an unweighted item is counted, never drawn | `analytics.ts` (unit) + E2E-M12-02 | The e2e world has no bars at all, so *„one bar, not two"* is the domain's; the counter and the empty line are the screen's. |
| a tapped bar becomes M4's facet, clearing the others | E2E-M12-04 + `usePackingFilter.spec.ts` (unit) | The e2e never has a second facet in force, so *„clearing the others"* could not fail there. |
| per-person rows contribute per person and sum back | E2E-M12-05 + `analytics.ts` (unit) | No `undefined` bucket, totals equal across dimensions. |
| the series trend and its flags | E2E-M12-03 (both halves) + `analytics.ts` (unit) | |
| ~~M11 is reachable from M12~~ | **nothing, and nothing is owed** | UI-Spec M11 claimed it since before the rebuild; `AnalyticsPage.vue` pushes one route, `/trips/{id}`. **Struck 2026-08-31 (owner decision)** — and the route it does push is the more useful landing anyway, since tapping a *Gepäck* bar sets the container facet on M4, putting the reader on the rows the bar was about. |

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
  manifest content (name, standalone, maskable purpose), the `theme-color`
  against the flavour's own `--ct-base` (added 2026-09-01 — the one tag of the
  declaration that is not static) and that every declared icon URL resolves.
  Red-proved by pointing the manifest link at a file that does not exist.
* **E2E-PWA-04** (added 2026-09-01) drives the **update policy**, which had no
  case of any kind: a second worker is put on the origin by registering a
  different script URL on the same scope — a registration is keyed by scope, so
  it installs into the registration the app already holds and fires the app's
  own `updatefound`. It waits (no `skipWaiting`), the glyph carries the dot and
  the sheet the sentence, the running page is neither reloaded nor taken over,
  and after the last client goes the new script is the active one. Red-proved
  twice: `watchForUpdate` unwired (nothing is announced) and `self.skipWaiting()`
  in the install handler (the takeover counter reaches 1).
* **E2E-PWA-05 / E2E-PWA-05b** (added 2026-09-02, FR-19.7) are PWA-04's mirror:
  the same waiting worker, applied because somebody pressed for it. **The pair
  is the policy** — PWA-04 says nothing happens on its own, PWA-05 says the
  press is what changes that — and neither can stand in for the other, which is
  the point worth carrying: deleting the worker's `message` handler leaves
  PWA-04 green, and moving `skipWaiting()` back into `install` leaves PWA-05
  green. PWA-05's settled state is the **reload** — a `window` marker no reload
  survives, then the controller of the page that came up — so nothing here waits
  on a duration. Its first draft asserted the bar and the dot *gone* after the
  reload instead, and that was green only by being early: the relaunched app
  registers `/sw.js` again, a *third* script URL in this fixture, which installs
  as a new waiting worker and brings the dot back (measured 2026-09-02, and
  PWA-04's closing assertion had the same shape — both dropped). **A fixture
  that produces a version by changing the script URL produces another one
  every time the app boots**, so „nothing is announced" cannot be asserted in
  that world. 05b exists because *Später* could otherwise
  be wired to the same handler as the press with every other assertion staying
  green: it asserts the old worker is still the controller and the offer is
  still on the dot and in the sheet.

**What the 2026-09-01 read of this unit found, and it was in E2E-PWA-02:** the
old case asserted that no cache entry appeared for `/health`, and **the worker
writes no runtime cache entries at all** — so that assertion was green against a
build whose `bypassed()` body had been replaced by `return false` (measured, not
reasoned). The red-prove in this file was honest and still missed it, because it
used a *combined* mutation — bypass removed **and** a `cache.put` added — and
only the second half of that pair was doing the work. The rewritten case asserts
the half the rule is actually about, that the worker never *answers* those paths,
with a **planted response** as the seam: a marker body put into a cache of the
test's own, which `caches.match` would find on the origin if the worker stopped
bypassing. The general form is worth keeping beside the other absence lessons:
**an absence needs a positive signal that the mechanism which would produce the
presence exists at all** — here, the same plant on a path the rule does not
cover, which does come back.

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
half), the G-2 sheet outside a trip, the master-partition log (E2E-G2-06)
and its revert (E2E-G2-10).

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

**A surface that was recorded as out of e2e reach, and was not** (written
2026-08-22, corrected 2026-09-01): this said the avatar crop modal (FR-17.13)
opens only after the browser's own file picker, which Playwright cannot drive.
`setInputFiles` fills a hidden `<input type=file>` without any picker, so the
modal was always reachable — and the sentence is what kept E2E-M17-12 open for
ten days while the stage carried a defect no other layer could see. It is
driven now, from `single/settings-profile.spec.ts`. Its shell — placement, the
canvas crop, the object-URL release on both exits, and its four catalogue
labels — stays pinned in
[`src/components/settings/__tests__/AvatarCropModal.spec.ts`](../client/src/components/settings/__tests__/AvatarCropModal.spec.ts),
which is the layer that cannot see rendered geometry: it asserts the inline
`width` the browser then refused to apply.

## M22 — a trip's properties and its travellers (`e2e/trip-properties.spec.ts`, 2026-08-21)

Ten cases, Local Mode; the screen landed with four (FR-2.7) and grew the rest
over the following nine days. The whole consequence rule runs client-side
(invariant 4), so a broken rule shows up here rather than behind a round trip.

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
leans on the positive signals the screen renders anyway: the ✕ is **gone**
rather than disabled — the owner overruled the first, disabled version in the
hand on 2026-08-21 — and the reason is a visible note under the roster.
*(This paragraph still described the disabled control until 2026-08-30; the
UI-Test-Spec recorded the reversal the same day it happened and the ledger
did not, which is how a note about a positive signal came to describe the
thing that was removed.)*

**Read clause by clause on 2026-08-30** (backlog item 6). Every written id is
implemented and none of them drifted. Four things the reading found:

1. **A state nobody had rendered.** UI-Spec M22's *States* line has promised
   since the screen shipped that an archived trip's editor is read-only
   throughout; no test had ever opened it on an archived trip, and
   `TripEditPage.spec.ts` pins only the two `DateField`s. **E2E-M22-10**
   covers it — and found that the screen says *nothing* about it: the note
   under the roster is gated on the trip not having started, so an archived
   trip loses the ✕, the add row and the explanation together. Owner
   decision, recorded in UI-Spec M22.
2. **An affordance nobody had operated.** The roster row offers three things —
   rename in place, ＋, ✕ — and until **E2E-M22-11** only two of them had ever
   been driven in a browser. What it asserts is FR-2.7's rule rather than the
   new string: a rename is never a removal plus an addition, so the renamed
   traveller's part-packed share survives with its `1/2`.
3. **Two assertions that could not fail.** The FR-27.4 report was asserted as
   the digit `1`, which is equally true of „1 item removed"; and
   „*Alles entfernen* deletes rather than unassigns" had nothing that could
   tell those apart, since an unassigned row carries neither the traveller's
   name nor a child test id. Both tightened in place.
4. **A race in five cases, which had already been paid for once.** Point 3 of
   E2E-M22-03's history above is exactly it — navigate straight after
   confirming and `page.goto` outruns the write — and the repair was applied
   to that one case only. E2E-M22-08 does the same thing after a name commit
   and **failed against correct code** during this audit's mutation runs: the
   reload discards the optimistic store and the trip was on no M2 segment.
   Every `page.goto` in the file now waits on the G-2 indicator returning to
   *on this device* first. **A fix written into one case is not a fix to the
   file**: the note said what to do and the other five cases never got it.

**Two elements UI-Spec M22 lists and the screen does not render** were found
the same way, by reading the element list against the template rather than
against the ids. The **year** has no field anywhere after creation — FR-2.1b
makes it the one *required* temporal fact and only M3's wizard and the clone
form write it, so a wrong year is permanent: **owner decision**, and not a
test gap. The **series** is edited on **M16** (`setTripSeries` has one caller,
`SeriesPage.vue`), so that clause is simply on the wrong screen and is
corrected there.

What each promise is kept by:

| Promise | Kept by | Note |
|---|---|---|
| M4's cluster opens the editor, its chevron gives the trip back | E2E-M22-06 (`global-nav.spec.ts`) | Getting to a screen and leaving it are global behaviours. |
| the name commits on blur and comes back through the store | E2E-M22-01 | |
| the two dates are `DateField`s and bound each other | E2E-M22-01 (the picker and its locale display) + `TripEditPage.spec.ts` (the bound, both directions and an inverted range still repairable) | |
| the year | **E2E-M22-12** | **Built 2026-08-31.** Until then UI-Spec M22 listed it and `TripEdit`'s only callers were M3's wizard and the clone form, so a wrong year was permanent. The case reads it back through **M2**, not through the field — placing the trip is the year's whole job, and a select repainting its own value satisfies an assertion on itself. |
| **the series it belongs to** | **M16**, not M22 | `setTripSeries` has one caller, `SeriesPage.vue`. The UI-Spec clause is on the wrong screen and is corrected there. |
| ＋ extends the per-person rows immediately, and the screen reports it | E2E-M22-02 | The report is the settled state, and since 2026-08-30 it is asserted as its sentence rather than as the digit. |
| ✕ takes their rows and never a sibling's | E2E-M22-03 | The case this file exists for; three false-green versions are recorded above. |
| a packed row of theirs is asked about, and *Alles entfernen* deletes | E2E-M22-05 | The count of surviving rows is what separates a delete from an unassign (2026-08-30). |
| **rename in place** | **E2E-M22-11** | **New 2026-08-30.** The third roster affordance, never operated in a browser; it asserts that a rename is not a removal plus an addition. |
| removal ends at departure — no ✕, and one sentence saying why | E2E-M22-04 + E2E-M22-07 | The positive half is what keeps „no ✕" from passing against a screen that renders none. |
| an archived trip's editor is read-only throughout | **E2E-M22-10** | **New 2026-08-30, and it says why since 2026-08-31.** The note sits above both cards: rendering it inside the travellers card made a sentence about the whole screen read as a rule about people — found by looking, not by asserting. |
| an edit is a partial write and the trip stays on M2 | E2E-M22-08 | |
| the confirmation toast clears the tab bar | E2E-M22-09 | Geometry, because a screenshot cannot tell a covered toast from a translucent one. |

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

**Acted on 2026-09-04 (T-8): `retries: 0` on CI as locally**, with
`trace: 'retain-on-failure'` so a failure can still be replayed. The first run
without retries turned one shard red — E2E-M6-01 on WebKit — and the trace
named a defect the error message pointed away from: a spec-local copy of
`createItem` typed into the editor before it had finished opening, so the tag
name landed in the *name* field. Five such copies existed; two skipped the
shared helper's settle and its `toHaveValue`. The helpers gate now catches a
copy under a different name.

**Acted on again 2026-09-05:** two more shards went red on WebKit in the
following days, both inside shared helpers and both the same species — an
instruction Ionic accepts and drops. `setDateField` took its first month hop
before `ion-datetime` had attached the scroll listener that recomputes the
header (it does so in `markReady()`, and the arrows are clickable long before
that, because only `.calendar-body` is held transparent); measured eight times
out of eight, the picker was visible, hydrated and **not** `datetime-ready` at
the moment the old helper clicked. It now waits for that class, which is the
mechanism and not a duration. `openTripSwipe` awaited `open('end')`, which
returns *before* the `requestAnimationFrame` that does the work, and asserted
only that an option was visible; it now runs the readiness handshake in the
page and asserts the class the component renders when it believes it is
open — so a silent no-op fails on the line that names it. Both postconditions
were mutation-proved by making Ionic drop the instruction on purpose.

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

## E2E-G3-01 (partial) + E2E-G3-03 — the lock goes one tap deeper (2026-08-22)

Backlog item 14(d). G-3 promises two things a padlock on M4's row was not
delivering: that a locked row **names its holder**, and that it is
"non-interactive for others except viewing". `ItemDetailSheet` had no lock
awareness at all, so the row that could not be packed from the list was
fully editable from the sheet one tap below it — and that is the worse of
the two, because the sheet *accepted* the edit and the other device simply
lost it at the next merge. No screen ever named the holder either, which is
the one question a padlock raises.

**What the new case in `single/server-sync.spec.ts` actually proves.** Both
contexts there are the same Single-User identity, so it does not prove
*whose* name is rendered. It proves the mechanism, which is the half that
was broken: device B never claimed the row, so B's client treats the claim
as foreign exactly as it would a second account's — the row carries the
holder line, the sheet carries the banner, its packing/skip/note/prep
controls are absent and *Details* is disabled, while name, quantity and
state stay readable. The holder's own sheet is asserted **untouched** in
the same case, because "locked for everyone including me" is the obvious
wrong fix and nothing else would catch it. The identity half stays with
E2E-G3-01 on the mock-IdP `server` project that does not exist yet.

**Proven able to fail.** The suite runs against `dist`, so a source-only
mutation proves nothing (the M10 lesson). Making `lockHolder` return `null`
unconditionally and rebuilding reddens the case at the row's holder line —
8 passed, 1 failed — and restoring it turns it green again. One trap on the
way: the first mutation was `if (true) return null`, which makes TypeScript
treat the rest of the function as unreachable, drop its narrowing, and fail
`vue-tsc` before a bundle is ever built. A mutation has to keep the build
honest to be worth anything.

**Why the whole sheet, not the packing block.** G-3's words are "except
viewing", and a mode where the quantity is frozen but the container is not
is a third state with no mental model behind it. The cost is real and
accepted: a note cannot be left on a row while somebody packs it. Each
write path is guarded in the handler *as well as* disabled in the template
— a control that flips back on its own is worse than one that never moved,
and the guard is what a vitest case can assert without depending on how
Ionic renders a disabled toggle.

**The 15 minutes stopped being a client constant.** Sync-API §7 had decided
the staleness window is "configurable via an environment variable"; the only
place it existed was `LOCK_TIMEOUT_MS` in the orchestrator.
`JITPACK_LOCK_TIMEOUT` now names it and `GET /api/v1/config` serves it. The
vitest case for it is written so it can only pass if the served value
arrived: the row is five minutes old — stale under the test's 60-second
window, fresh under the built-in default — so a client that ignored the
answer would keep the row locked and fail.

**What was checked and deliberately not built.** The backlog item also said
"the server neither expires a lock nor refuses a push for one". §7 does not
promise either: it makes locks advisory, persisted as ordinary
`packing_now` mutations, ignored by *clients* past the window. Server-side
refusal would be a different concurrency model, not a bug fix — it would put
a permanent 4xx in front of an offline device that packed a row somebody
claimed after it went offline, which is the outbox-wedge shape PR #156 had
just removed. That is an owner decision, and it is left as one.

## E2E-G3-02 — the half of a takeover that a single identity can prove (2026-08-24)

FR-5.7 removed the staleness window, so the case that used to advance the
clock past `JITPACK_LOCK_TIMEOUT` had nothing left to assert. What replaced
the window is the takeover, and **the takeover cannot be driven here at all**.

The reason is not a missing fixture. The `single` project's two browser
contexts are the same Single-User identity — that is exactly the trick
E2E-G3-03 relies on, since B never claimed the row and therefore treats the
claim as foreign. A takeover is different: it asks the *server* who holds the
row, and the server sees one user on both sides. `TakeOverClaim` refuses a
takeover of one's own claim, correctly, so the case would assert a 409.
Seeding a token changes nothing — the backend stamps its single user either
way.

So the case asserts the promise that *is* reachable and is a requirement in
its own right: **where there is no second account, a claimed row offers no
action at all** (G-8 — absent, not shown and then refused). Its positive
signal is the lock note on B's row, so "no action sheet" means the mode gate
rather than a row that never arrived or was never claimed.

The rest of E2E-G3-02 is owed by the future mock-IdP `server` project, beside
E2E-G3-01's identity half, which has been waiting at the same wall since
2026-08-22. Until then the takeover's mechanism is covered by Go API tests
(the claim moves, the holder is notified, each refusal answers its own code)
and by orchestrator units (nothing is written optimistically, a refusal leaves
the claim where it was) — and the *screen* is covered by neither. Saying so
here is the point of this ledger.

## The `server` project — two accounts, and what one identity was hiding (2026-08-24)

MVP-plan Track B step 2. The harness is ADR-029: a mock IdP fixture, a
second `jitpackd` in OIDC mode, a second `vite preview` in front of it, and
two browser contexts that log in as *different people* through the app's own
login page. Three cases land with it, and each of them asserts something no
`local` or `single` case can express.

**What it caught on its first green run — and this is the reason the
project exists.** The takeover case failed on Alice's screen: Bob took her
row over, her toast said *„Bob took „Trockenanzug" over from you"*, and her
row went on saying *„You are packing this — the others cannot change it"*.
The notification and the row disagreed, and the row was still fully
interactive, so both of them could pack the same thing — the exact failure
FR-5.3 exists to prevent.

The cause is that a claim is a *device* flag. `myLocks` has to be, because
Local and Single-User Mode have no second account to compare against, and
`lockHolder` returned `null` for anything in that set unconditionally. So
the one event that moves a claim to somebody else had no way to revoke it,
and the WS handler made it worse by ignoring `item.locked` outright for rows
in `myLocks`. A claim now stops being this device's when the holder the
server names is a *different account* — identity taken from the session
token's subject, which is `null` in exactly the two modes where the device
rule must stand alone. Two traps on the way:

- **The optimistic claim writes `current-user`.** The first fix read that
  placeholder as a foreign account and revoked every claim the instant it
  was made — one vitest case went red immediately, which is the only reason
  it did not ship as "the row never says it is mine".
- **`getToken` is async in the running app** (`refresher.freshToken()`),
  so it cannot answer a question a render asks. The identity comes from the
  stored session instead, behind an injectable seam, which is also what
  lets the unit cases name an account without a token.

**Proven able to fail**, both directions. Before the fix the takeover case
failed on the assertion above; after it, all three pass in 27 s. And with
`displayNameClaim` mutated so the IdP's name never reaches the app, **all
three** go red — which is the point of the project: every one of them
depends on an identity that came through the login, not on anything the
client invented.

**What this unit deliberately does not cover**, so the green does not read
as more than it is:

- **Presence (G-10)** — `server`-only and still unwritten. *(Delegation,
  E2E-FLOW-02, was in this list until 2026-08-25; see the section below.)*
- **The `lock_events` record** ADR-028 writes: asserted by Go tests, not by
  the screen.
- **The M2 Share entry is asserted as present in the DOM, not as visible** —
  it lives behind Ionic's slide gesture, which no case in this suite drives.
  What that assertion proves is the `collaborative` gate (G-8's positive
  half), and nothing about the gesture.
- **The admin surface (M20)** — the mock IdP's `alice` is the instance
  admin and `JITPACK_ADMIN_EMAILS` names her, so the subject exists; the
  cases do not.
- **A real provider.** ADR-029 accepts this outright: an Authelia-specific
  defect still ships green, and Track H's deployment is where it gets paid.
  **Half of that bill is now mechanical** (2026-08-30) — see the section at
  the end of this file — and the half that is not has a written procedure
  instead of an intention.

## FR-9.3/9.4 — the closing pass, and what its cases had to be careful about (2026-08-24)

Five new cases in `closing-pass.spec.ts` (E2E-M4-51 … 55) and one rewritten
M14 case. Three things are worth keeping, because each of them made a first
draft green against the unfixed build.

**E2E-M14-05 asserted the defect.** Its last line read „the empty state does
not take over a list that has decided rows" — which is exactly the behaviour
FR-9.4 removes. The case was written when the empty state could only be
reached by dismissing every proposal for good, and it pinned that as the
promise. A test that encodes the shape of a defect is not neutral about the
fix: it makes the fix look like a regression. Renaming the assertion was the
whole of the work, but finding it was not — it was found by running the suite,
not by reading it.

**„Nothing happened" needed a positive control, and the control needed the
right moment.** E2E-M4-55 asserts that press-and-hold is inert inside the
pass. On its own that is true of a list that never rendered, of a row that was
never added and of a broken gesture — so the case opens the menu on the *same
row* one moment earlier and closes it again. The first draft did that *after*
packing the row, and it failed: a packed row leaves the list (FR-25.2), so the
control was asserting against a row that was not there. The order matters as
much as the control does.

**A mark is read back off the row, never off the control that made it.**
E2E-M4-54's first draft asserted the pass toggle's own `aria-pressed`, which a
control with purely internal state would satisfy without a single write. It now
navigates back to the trip afterwards, reveals the packed rows and reads the
mark from the row — which is the same place the M14 assistant reads it.

*(The earlier draft of the pass used an `IonCheckbox` for the row's toggle. It
was replaced for two reasons found by rendering it: a checkbox is M4's *packed*
idiom sitting beside rows that say „packed · today", and Ionic's checkbox
keeps its own checked state, which drifted from the row on the very first tap.
The control now renders straight off `flag_unused`.)*

**E2E-M18-10 — the same file, twice, added 2026-08-24.** A restore is what you
run when you are not sure the last one worked, so running it again is the
normal case and not the odd one. Until ADR-030 the second run built a second
copy of every trip, silently, with the first still on screen — and a second
copy of every Ferien-Vorlage under a `(import)` suffix, which is why the case
carries all three document kinds rather than only the trip.

Three things worth keeping from writing it:

- **The assertion is `toHaveCount(1)`, not "no second row".** A case that only
  checked for the absence of a duplicate would be equally green against a
  restore that deleted the trip it already had — the exact failure the rule is
  supposed to make impossible.
- **The chip and the rule are two call sites, and both are asserted.** The
  restore list answers the question before the button is pressed (`findTripByIdentity`
  read straight from the trip store), and the import answers it again while
  writing. Mutating the rule reddens the count but *not* the chip, which is
  what tells you they are independent paths rather than one assertion twice.
- **Rebuild between the two mutation runs.** The suite drives `dist`; the first
  attempt at the red proof ran `npm run build-only` from the wrong directory,
  the build failed, and the "mutated" run passed against the old bundle — the
  trap already written down for e2e work, walked into again.

**E2E-M18-11 — the other branch of the same screen, added 2026-08-25.** Found by
this PR's own review rather than while building: M18-10 covers the restore
list, and M18 has a *second* branch for a file holding one document — the merge
preview, with its own note and its own commit. Both were written and neither
was run.

Two things it settled:

- **The file comes from the app, not from the fixture.** A device with one trip
  and no template backs itself up as exactly one document, which is both the
  branch this case needs and a way to keep the trip's *year* out of the test —
  hand-writing the YAML would have pinned whatever `new Date()` said that day.
- **The suite's app language is English, and the assertion now says so.** The
  first draft matched `/schon vorhanden|already here/i`, which looks
  locale-agnostic and is not: `seed()` pins `jitpack_locale` to `en`, the German
  half could never match, and the English half happened to appear in one
  catalogue string and not the other. It failed for the right reason and the
  alternation was replaced by the exact text.

**E2E-M18-12 — the record the backup did not carry, added 2026-09-02.** FR-25.11j's
own text had recorded the gap since 2026-08-25: the portable format wrote the
mode and the count of a row and not `bought_from`, so a Local Mode backup and
restore — the one door NFR-4.11 gives that mode — put a bought row back on the
packing list with the shopping side knowing nothing about it. The case buys
the half a user sees, M6's bought bar on the restored device; the format and
the importer are unit-covered in `portable.spec.ts` and `portableImport.spec.ts`.

Two things it settled:

- **Where a row was bought is progress, not composition.** It travels with
  `packed_count` under `includeProgress` and is dropped with it: a trip shared
  without progress has nothing bought in it, and a row that comes back on the
  list it was bought from is the right reading of a file that says nothing.
- **A device with one trip and no template backs itself up as one document**,
  so the first draft waited on the restore list's button while the screen had
  opened the merge preview — the branch E2E-M18-11 already names, walked into
  from the other side. The fixture is kept that way rather than padded with a
  template, because the preview's *Import* lands on the trip itself, which is
  where the assertions are.

## E2E-FLOW-02 — delegation, and the control it turned out to need (2026-08-25)

Writing this case is what found that **`packer_user_id` had no writer**. The
server has always fired `notifyDelegation` on a push carrying that column and
Go tests cover it; every client surface *read* it — M4's edge avatar, the
„zuständig war …" stamp, FR-25.20's filter and its reveal bar — and nothing
set it, because it was written once when a row was generated and never again.
So the whole FR-6.2 delegation path was unreachable by using the app, and the
case could not be written until M5 gained the FR-25.19 picker.

Worth keeping, because it generalises: **a case that cannot be written is a
finding about the product, not about the suite.** The two before it followed
the same shape — *unused* had no writer until FR-9.3, and a takeover had no
second identity until ADR-029.

**What the case asserts, deliberately as one chain rather than four units:**
the assignment lands, the toast on the *other* account names the actor and the
item, its *Open* button lands on the **rendered sheet** (never the URL), and
Alice's own list then hides the row and names Bob in the FR-25.20 reveal bar.
Any of those four could pass alone while the chain is broken.

**What it does not cover, so the green is not read as more:** the **OS**
notification. This is the in-app channel — NFR-4.6's universal fallback — and
Web Push needs a browser permission this harness does not grant. The service
worker's own copy of the wording (`client/public/sw.js`) is therefore still
covered by nothing, which is also where backlog item 19's second copy lives.

**E2E-SYNC-01 — a partition bigger than one page, added 2026-08-25.** The
defect it pins was found by *using* the app, not by testing it: after importing
a decade of real trips into the `:3000` instance, a fresh browser said
„Keine archivierten Reisen" with the sync glyph green. The pull took the first
500 changes, ignored `has_more`, and the trips sat behind them in `change_log`.

Three things worth keeping:

- **Every fixture in the suite was under one page**, which is why nothing caught
  it. A test for a paging rule has to build a partition big enough to page, and
  that means pushing rows at the API rather than driving the UI — 520 items
  through M10 would be a different, much slower test about a different thing.
- **The request count is asserted next to the visible row.** Without it the case
  quietly stops proving anything the day `PULL_PAGE_SIZE` grows past the seed:
  one page would still show the row, and the name of the test would be a lie.
- **Persisting the cursor made it worse, and the unit case now says so.**
  Outside Local Mode the pulled rows are not kept either, so a device that
  remembered its read position and not the rows asked for the changes after it,
  got none, and rendered an empty app. Measured while building the fix: "the
  first 500 rows" became "no rows at all".

**Read again 2026-09-01 (the SYNC row of backlog item 6), and the finding was
a second implementation, not a missing test.** §4's paging rule lived in two
places — `SyncOutbox.drain`, which every browser runs and E2E-SYNC-01 covers,
and `usePull.pullMasterAll`/`pullTripAll`, which only the FR-18.7/18.8 command
line runs. The implementation log had recorded the duplication on the day it
was created (*„Not fixed, still true"*, 2026-08-25) and it had drifted exactly
where that note predicted: the **progress guard** — stop when `next_cursor`
does not advance, or a server that claims more without moving it spins the loop
for ever — was the drain's alone, so `jitpack import` against such a server
never returns. The rule is named once now (`client/src/sync/pullProtocol.ts`)
and both callers ask it. Its twin found the mirror image: §3's **observe step**
(advance the device clock to every clock a pull carries) was asserted *only* on
the command line's copy, so the drain every browser runs had no case for it —
which is how it managed to be dead code for a year, the server never having
sent the field, with nothing red. Both callers now have cases, and the
command-line ones use a fake that **refuses a fourth call** rather than
answering for ever: the unfixed loop otherwise fails by exhausting the heap and
takes the runner with it instead of naming the rule.

**E2E-G2-11 — a refusal the user can read, added 2026-08-25.** E2E-G2-05
proved that a refused mutation is *parked*; this one proves the user can find
out **why**. It drives the motivating case end to end against a real
`jitpackd`: a group is built in M7/M8, a trip is generated from it, and the
group is then deleted from M7 — which the server refuses, because FR-9.2 keeps
`trip_items.source_template_id` pointing at it.

It has to run in the `single` project because nothing else produces the
refusal. **The client cannot pre-empt it**: it holds the trip partitions it has
opened, never every trip's, so an M7 pre-check would call the delete safe in
exactly the case that then fails. M7's existing guard is no help either — it
covers a group another *Vorlage* includes (FR-27.6), which the master partition
can see.

Proved by mutation: dropping `Error: string(res.Reason)` from the push
handler's result construction leaves `sync-detail-parked` green with its count
of 1 and makes `sync-detail-parked-reason` not exist — which is precisely the
defect the case was written for, a number where a sentence belongs.

The case ends on a second context that never saw the delete and still finds
the group. That is the positive signal the sheet's sentence is asserted
against, and it is also the divergence itself on record: the deleting device
removed the row optimistically and the server kept it. **Closing that gap —
putting the refused row back on the device that tried to delete it — is
E2E-G2-12 below, built the next day.**


**E2E-G2-12 — the refusal repairs the row, added 2026-08-25 (ADR-031).**
E2E-G2-11 ends at the divergence and records it: the group is gone from the
deleting device and still on the server. That state used to be *permanent* —
the server row had not changed, so its `change_log` entry was already behind
that device's cursor and no pull would ever offer it again. This case drives
the same refusal and asserts the two things that close it: the toast naming
how many changes were undone and why, and the group back in M7's list.

Proved by mutation: with the re-log removed from the store's
`still_referenced` branch (`internal/store/master.go`), the toast is still
green and the row assertion fails — the announcement without the repair, which
is exactly the state before this change.

**The row assertion counts the group's positions, and that is the case's
second finding.** It first read `toBeVisible()` on the group row, which was
green against a repair that put the Vorlage back **empty**: the client mirrors
the server's cascade when it deletes a template, so its positions had gone
optimistically too and re-logging the named row alone did not bring them back.
Only rendering it showed "0 items". The store now re-logs the cascade's rows
as well, and the case asserts `1 item` rather than mere visibility.


**E2E-M6-17 / E2E-M6-22 — what M6 hides is counted, named and reversible,
added 2026-08-25 (FR-25.11j).** Buying a BUY_BEFORE row changes its mode, so
the row leaves *both* tabs: every "it disappeared" assertion here is worth a
positive one beside it, and the bar counting what disappeared is that signal.
M6-17 walks the whole way — bar absent while nothing is bought, `Show 1
bought` after the tap, the revealed row naming where it went, and its checkbox
putting it back on the list it was bought from. M6-22 does the destination
tab, where the mode never changes and `bought_from` is the only thing keeping
the two reveals apart.

Proved by mutation: with the previous check-off restored
(`setMode`/`packComplete`, no record written) the bar never appears and both
cases fail on it, while E2E-M6-21 beside them stays green.

Two traps paid for, both cheap to hit again. **ADR-012 leaves M4 mounted and
*visible* behind M6**, so `visiblePage` resolves to two pages and every shared
testid — the composer's above all — is ambiguous; the cases scope through an
`m6-page` testid instead. And a **segment button swallows a click aimed at its
own `ion-label`**, the same finding `packing-list.spec.ts` already carries: the
tabs got their own testids rather than being reached by text.

## FR-1.6 — a name that is already taken (2026-08-25)

Four tests in the two template units, all `local`, because Local Mode is the
run mode with **no constraint behind the client** — whatever the client fails
to catch there is never caught at all.

| Case | What it drives | File |
|---|---|---|
| E2E-M7-10 | the create sheet names the scope holding the name, disables *Anlegen* and *Öffnen* navigates to that row; a free name still writes | `template-list.spec.ts` |
| E2E-M7-10 | the rename alert refuses, keeps the typed name, and the row keeps its own | `template-list.spec.ts` |
| E2E-M8-24 | *„Neue Gruppe anlegen…"* includes the group that already holds the name; a Vorlage holding it is reported as the different thing it is | `template-editor.spec.ts` |
| E2E-M8-24 | M8's own name field refuses a rename and the field goes back to the stored name | `template-editor.spec.ts` |

Three things worth carrying forward:

- **Every refusal is paired with the same field doing the write.** "Nothing was
  created" is equally true of a button that does nothing, so each test ends by
  putting a free name into the same control and asserting the row it produces.
- **`toBeDisabled()` is wrong on an `ion-button`.** The host carries
  `aria-disabled`; the native attribute sits on its shadow child, and
  Playwright reads the host. The first draft of E2E-M7-10 failed against a
  button whose own DOM dump in the error said `disabled`.
- **"Exactly one Kamera" has to be counted on the row title.** Once the group
  is included, the Vorlage's row *names* it in the `enthält: …` line, so a
  row-level `hasText` filter finds two rows and the assertion fails for the
  reason it was meant to prove.

**Still owed and not covered here:** FR-13.1's half — M3's *neue Serie* note
and M16's rename — has unit coverage
(`composables/__tests__/nameCollision.spec.ts`) but no Playwright case. It
belongs with the M16 unit, which does not exist yet.

## The refusal lost its only UI path (2026-08-25)

E2E-G2-11 and E2E-G2-12 were written around `still_referenced`: the user
deletes a group a trip generated from, the server refuses, and the client
first learns to *say* so (Sync-API §5) and then to *undo* it (ADR-031). Both
drove that through M7's delete, because it was the only place in the app where
a refusal could be produced on purpose.

FR-24.3 took that place away. A master item or Vorlage is now retired instead
of refused, and the other entities the refusal still governs are unreachable:
a series has no delete control at all, and container and traveler deletes
unassign their rows first, precisely so the refusal never happens. **There is
no UI path to a refusal any more.**

Both cases were therefore retargeted onto the behaviour the same tap now
produces — the retire being accepted with nothing parked, and the trip keeping
its rows on a device that never saw the delete. What they used to prove is
asserted where it is still reachable, and is named here so it is not mistaken
for lost:

- the server's re-log of a refused row and its children —
  `internal/store/rejection_repair_test.go` (on a series);
- the reason reaching the wire — `internal/api/rejection_reason_test.go`;
- the client's toast, its parked count and reason, and the repaired row
  replacing the optimistic one — `client/src/composables/__tests__/rejectionRepair.spec.ts`
  and `durableOutbox.spec.ts`.

If a UI path to a refusal ever returns — a series delete control is the likely
one — it should carry an e2e case again, because the client half of that path
is the half these two were written to protect.

## The restore's hard case is the one only a rendered test could show (2026-08-25)

M23's three cases are the way back from a retire, and the middle one is the
reason the file exists. Retiring frees the name (the unique indexes are
partial over the active rows), so the sequence *retire → someone re-creates
the name → restore* is ordinary, and the restore then cannot have its old
name back. The unit tests state that rule in both places it runs; what they
cannot see is **when** the user meets it. A restore that is enqueued and
refused by the push looks, on screen, like a row that comes back and then
vanishes again a drain later — ADR-031's repair doing exactly its job. Only a
rendered case distinguishes that from the refusal arriving *before* the tap
takes effect, which is what E2E-M23-02 asserts by finding the row still on
M23 behind the alert.

Two traps were paid for while writing these, both worth keeping:

- **A `page.goto` after a Local Mode write reloads before the write lands.**
  The first run restored a row and then found the inventory without it,
  because the assertion that settled the *optimistic* state (the row leaving
  M23) says nothing about IndexedDB. Every reload here now waits for the
  sync indicator to read `local` first, the seam that exists for this.
- **An `ion-alert` input does not reliably take `pressSequentially`.** The
  first run typed "Kamera (alt)" and restored a row named **"K"** — and every
  count in the case was still satisfied by it, because one row is one row.
  The input's value is asserted before the button is clicked.

**The fourth case, added 2026-08-30 (backlog item 6).** Reading the three
against the screen found nothing wrong with them and one thing missing around
them: all three retire an **item**, and M23 builds its two lists from two
different row builders. Nothing had ever put a row on the Vorlagen segment —
E2E-M23-01 asserts that segment *empty* as a positive control, which is only
worth something if it can be non-empty — and the Vorlage **retire** branch was
unrendered anywhere, because E2E-M7-11 covers the remove branch and stops
there, on the stated grounds that reaching the other one costs a whole trip.
E2E-M23-04 pays that cost once and gets both: the retire confirm's other
sentence, the Vorlagen list, the purge button correctly absent while the trip
holds the row, and the restore. It is mutation-proved by pointing the template
row's `restore` callback at `restoreMasterItem` — the two have the same shape,
so it is the copy-paste this screen is exposed to — which reddens the new case
and leaves the three item cases green.

putting the refused row back on the device that tried to delete it — is not in
this case and not built**; the refusal is announced, not undone.

**E2E-M2-10 — progress on a trip nobody opened, added 2026-08-25.** The row
summed a partition that was not on the device and printed `0/0 packed`, which
on the family's imported archive meant a decade of finished holidays reported
as untouched (ADR-033).

Two things the run taught, one of them by failing:

- **The second browser context is the assertion.** On the context that built
  the trip the rows are already in the store, so the case would pass against a
  screen that fetches nothing at all. Same reason E2E-M18-05 restores onto a
  fresh device.
- **`scrollIntoViewIfNeeded` is the rule, not a workaround — and only the full
  suite said so.** Run alone, the trip is the only one on the list, sits in the
  first screenful, and the assertion passed without scrolling. Run with the
  suite, the shared master partition has other tests' trips above it, the row
  is below the fold, and ADR-033 deliberately has not fetched it: the summary
  stayed on „Loading items …" for thirty seconds. A case that passes alone and
  fails in company was, that time, telling the truth about the feature.

**E2E-M2-11 — cloning a trip nobody opened, added 2026-08-26.** The same
absence E2E-M2-10 caught on the list reached further on ClonePage: the preview
summed rows that were never pulled and read `0 items, 0 travellers`, and the
button cloned exactly that — an empty trip, silently, with no error anywhere.
`cloneTrip` now refuses while the source's rows are not on the device
(the same "not pulled ≠ empty" guard the group refresh and FR-27.10 already
carry), and the page fetches the partition via `ensureTripData`, shows
„Loading items …" until it lands, and keeps the button locked. The case
asserts on a second context: preview text with the real counts, then the
clone opened with both source rows visible. The component halves (the loading
line, the locked button, the guard's `null`) are unit-tested in
`ClonePage.spec.ts` and `clone.spec.ts`.

## M20 and G-10 — the two areas the `server` project named as owed (2026-08-28)

When the `server` project landed it named three things it had not reached:
delegation, presence and the admin surface. Delegation came with FR-25.19's
control; these are the other two, and both were in the same state — fully
built, fully unit-tested, and carrying **not one `data-testid` between
them**, which is the plainest available statement that no test had ever
rendered either one.

Neither could have been covered anywhere else. Every rule in M20 is a rule
about *another account* — who may be deactivated, whose row says "(you)",
who is refused the overview — and every G-10 assertion needs a second person
on the same trip, which is exactly what `single`'s two contexts cannot be.

**The mock IdP grew a third account, `carol`.** These cases *change* the
account they act on, and one backend serves the whole run with
`admin.spec.ts` and `multi-user.spec.ts` free to land on two workers.
Deactivating `bob` mid-run would have reached sideways into the other unit's
trips. Carol exists to be administered and does nothing else. The one
irreversible action — resetting a display name — is deliberately the last
step of the last test that touches her, because the row is addressed *by*
that name.

### What rendering it found

**G-10 named nobody.** The facepile initialled `PresenceUser.user_id`, and
`users.id` is `lower(hex(randomblob(16)))` — so the faces read as two random
hex characters, different on every run. The component's own comment said
initials "stand in for avatars until user profiles sync to the client",
which had stopped being true: M4 already resolves names for the packing
stamps, and G-10 now takes the same `participants` directory. The case
asserts the initials `AL` and `BO` rather than the faces' presence, because
neither `L` nor `O` is a hex digit — the assertion is red against any build
that initials the id, whichever ids that run happens to mint.

**The group-sync badge could never appear.** This is the one that only a run
could have found, and it did: the case went red on `presence-in-sync` with
everything above it green. `sendCursor` dropped the report when the socket
was not yet open, while `subscribe` beside it queued — and on a cold page
load the HTTP drain regularly returns before the WebSocket handshake
finishes. So the server never learned the device had caught up, `in_sync`
stayed false for everyone, and "everyone has the latest state" was a badge
with no reachable state. The cursor is held and flushed on open now, newest
seq per trip winning: two drains racing to open must not leave the server
told the older of the two. Subscriptions flush first, since only a
subscribed connection is in the presence list the cursor informs.

**A deactivated account was told nothing.** FR-23.3 is enforced per request
in the auth middleware and the Go tests cover it thoroughly — but the
client had no branch on `account_deactivated` at all, and the tokens stay in
`localStorage` looking valid, so nothing expired them. The app went on
booting, every request 403'd, and the screen was indistinguishable from an
offline one. The session now ends on that error code and the screen is the
login again, which is what makes E2E-M20-02's access half assertable on a
rendered page instead of on a status code. It narrows on the **code**, not
the status: a 403 is also how the server refuses a non-admin the M20
endpoints, and logging that person out would have been the worse defect —
E2E-M20-05 stands on Bob's session surviving exactly that.

**And a fourth, found by looking at the screenshot rather than the run.**
M20's provisioning date came from a bare `toLocaleDateString()`, which
follows the *device*: on the suite's de-CH device with the app pinned to
English the overview read `Provisioned 28.8.2026` under English copy. It is
the same defect E2E-G2-01 found on the conflict log on 2026-08-24, in the one
other place the codebase still called `toLocale*` without a locale — the two
were the complete set. It goes through `formatDate()` now, and E2E-M20-01
pins a month abbreviation, which the numeric German form cannot produce.

**And a fifth, raised as an owner call and answered the same day.** An
account that never uploaded an avatar rendered the browser's torn-picture
glyph on M20. The answer needed no design decision, because the design
already existed and was already shipped: `UserAvatar` (FR-25.3) draws a
person as a coloured circle of initials and M4 and M5 have used it for
weeks. M20 had hand-rolled an `<img>` instead — and so, it turned out, had
**M17**, where the `@error` handler hides the element and leaves a 64 px
hole, with the `personCircleOutline` placeholder written for exactly that
case sitting behind `v-if="avatarUrl"`, a condition that is never false. The
placeholder had never rendered in its life.

`UserAvatar` now takes an optional `src` and lays it **over** the initials,
so the letters are the ground rather than a fallback: still loading, absent
and refused all show a person instead of a gap. Both screens use it, and two
hand-rolled circles are gone. The four states (none, present, failed,
re-uploaded) are exhaustive in `UserAvatar.spec.ts` — including the retry on
a changed URL, without which FR-17.13's cache-busting query would leave a
freshly uploaded picture hidden behind the previous failure.

**Both screens are asserted, not one.** The defect was written into two
templates, so one screen keeping the fix says nothing about the other:
E2E-M20-01 pins the circle and the absent picture element on the admin
overview, and E2E-M17-04 pins the same pair on the profile — and, after the
rename it already performed, that the circle is initialled from the *new*
name, so the two halves of the profile cannot drift apart. Both
mutation-proved by putting the bare `<img>` back.

### G-10 was rebuilt rather than completed (2026-08-28)

The review left the per-person sheet standing as an owner call. The owner
asked for it to be solved, and the answer was not to build it.

**The gap was never only the tap.** G-10 had three sub-bullets and all three
diverged: the facepile rendered every present user with no cap and no "+N";
the badge was a labelled chip beside the pile that appeared *only* when
everyone was in sync, with no amber; and nothing opened. A fourth
divergence sat one screen away — UI-Spec M2 asked for the facepile on the
trip rows, two lines after G-10 says presence is meaningless outside a
trip. The spec contradicted itself, and the wire settles it: presence is
broadcast per *subscribed* trip, so M2 would have to subscribe every listed
row to draw circles. That line is deleted.

**What the pattern can say is three fields** — `user_id`, `device_count`,
`in_sync` — and it is exactly what the hover `title` already said. On a
phone there is no hover, and that is the whole of the real gap: when the
badge goes amber the only useful question is *who*, because you turn to that
person. So the state moved onto the faces (an amber ring on whoever is
catching up) and the tap kept only the half a hover cannot give a touch
device — the name, in a line under the pile. The sheet was rejected for
putting that one actionable fact one tap deeper than a pile already on
screen; the device count was dropped outright.

**The badge is a glyph with a bubble, not a labelled chip** (owner,
2026-08-28). The first build spelled *„1 catching up"* out beside the pile;
the app already has a grammar for exactly this — G-2's `SyncIndicator`
carries its queue as a count on the glyph's corner — and a header that
already holds the trip's name has no room for a second sentence. The words
survive as the element's accessible name, so the colour is not the only
thing carrying the state, and `presence-behind-count` is asserted separately
from the name for that reason.

**One decision came from rendering it, not from writing it.** The first
build ringed everyone who *was* caught up, in green. On screen that makes
the ordinary state loud, repeats what the badge beside it says, and leaves
the one person worth noticing marked by an *absence*. Ringing the exception
in amber inverts all three, and it is the vocabulary G-10's own badge
already used.

**Where each half is tested, and why it is not all in one place** *(the
premise below was refuted on 2026-08-30 — see E2E-G10-02)*. A device
is "behind" only while its reported pull cursor sits below the trip head,
and the client reports one the moment its pull returns — so no Playwright
case can produce a lagging device without racing it, which this project
forbids. E2E-G10-01 therefore owns what a real run can hold still: the pile,
both people named, the badge in sync, the badge's counterpart absent, and
the tap in both directions. Amber, the ordering rule and the overflow are
stated against props in `PresenceFacepile.spec.ts`, and the three states are
in the dev gallery so they can be looked at. The ordering rule earns its own
case: **the "+N" bubble must never hide somebody who is behind**, or the
pile would summarise away the fact it exists to show and the badge would
count a person with no face to point at.

### What is deliberately not covered

- ~~**Amber for a lagging device, end to end.**~~ **Reversed 2026-08-30 —
  E2E-G10-02.** The seam was already there and pointing the other way: a
  lagging device is one whose pull has *not* returned, and Playwright can
  stop a request without any production code being invented for it. What
  made this read as impossible is that it was written as "holding a pull
  open", which is indeed a race; blocking one is a settled state.
- ~~**E2E-M20-03's avatar half.**~~ **Written 2026-08-30 — E2E-M20-03b**, and
  the sentence under it was wrong twice. There is no placeholder: the avatar
  endpoint **404s** for an account with no picture and the initials are the
  ground (FR-23.4a). And *Remove avatar* changed no pixel for a reason that
  was a defect rather than a fixture gap — the row is keyed by user id, so
  the same `<img>` keeps the same `src` across the reload and the browser
  never asks again, under a `max-age=3600` that would answer it if it did.
  M17 has had the cache-busting query since FR-17.13; M20 now has it too.
- **The two reasons a row offers no Deactivate.** FR-23.3 exempts admins and
  the own row, and this instance has exactly one admin — so the rendered case
  can only assert the row that is both. The split is exhaustive in
  `domain/__tests__/admin.spec.ts`.

**E2E-M2-13/14 — the opening segment, added 2026-08-29 (FR-2.8).** M2 always
opened on *Active*, which for most of the year is the one empty segment: the
family's device greeted „No active trips" while twenty-nine trips sat one tap
away. Three notes from building the cases:

- **Where the walk can be asserted at all is decided by the database.** The
  `single` project shares one jitpackd database for the whole run, so other
  tests' trips are in the list this device shows and no walk *target* is
  predictable there. The targets are `local` cases, on a device whose entire
  trip world the test built; the `single` case asserts only what needs a real
  wire — that nothing is decided before the list arrives — and, afterwards,
  that whatever segment it chose is one holding trips.
- **The held pull is a promise, not a wait.** `page.route` on the master pull
  parks the first one until the test resolves its own promise, so „before the
  list arrives" is a state the test *holds* rather than a window it hopes to
  hit.
- **The visual gate did not see a truncated label.** When the count moved into
  brackets beside the label (owner, 2026-08-29), the German *ARCHIVIERT (29)*
  was cut off at 390 px — and `make visual` passed, because the changed pixels
  stayed under the per-image tolerance. Rewriting the baseline needed
  `--update-snapshots=all -g "trips"`; plain `--update-snapshots` writes only
  over-tolerance diffs and reported nothing to write. Second time this exact
  blindness has cost a finding (see the M2/M4 head-alignment note): a baseline
  answers for a *layout*, and three cut-off words are apparently not one.
- **Only one of the four `local` legs exercises the re-entry.** The other
  three decide on mount, which is a different hook — the tab is left for
  another one and returned to precisely so the `onIonViewWillEnter` half is
  covered, since a rule that only fires on a cold start would pass all three
  of them.

## The avatar upload itself has never been driven

Recorded rather than quietly left, because the ledger's whole point is that a
green `e2e` job is not the same as a verified UI.

**What is covered:** that the picture control is *offered* to an OIDC account
(E2E-M17-05), which is the branch the 2026-08-29 revision changed, and that the
display name stays the provider's (E2E-M17-05b). The gate itself is also driven
as a component test in `SettingsPage.spec.ts`, both assertions
mutation-proven — reverting the flag reddens the picture case, making the name
editable reddens the other.

**What is not, and why the reason given here was wrong** (corrected
2026-09-01): picking a file, positioning the crop and uploading was recorded as
unreachable — no `data-testid` on `AvatarCropModal.vue`, and a canvas with no
settled signal, so a case *could only wait-and-hope*. Neither held.
`setInputFiles` needs no dialog and no test id (the modal's own markup is
addressable — it has ids now, added with the case, because a style class is not
a seam), and the settled signal is the uploaded picture appearing on the
profile row. **E2E-M17-12 is implemented** in `single/settings-profile.spec.ts`,
and rendering the stage for the first time found the defect the owner reported
the same day. It is not claimed for `server`: what that project owns is whether
the control is *offered* under an OIDC session (E2E-M17-05); the crop is the
same component in both.
The fix belongs in the production code — a completion signal on the modal, the
same seam the G-2 indicator grew for in-flight Local Mode writes — and that is a
change of its own rather than a rider on a one-flag PR.

**E2E-NOTIFY-01 — the notification's language, added 2026-08-29 (NFR-4.12).**
Two things it cost, both of them about a notification being addressed to a
*person* rather than to a page:

- **Two cases on the same account fight over the toast.** Adding a second
  notification case turned E2E-FLOW-02 red: a notification reaches every
  session its recipient has open, so with two workers Bob's other page
  carried a second `ion-toast` and the unfiltered locator became a
  strict-mode violation rather than an assertion. Both cases filter by their
  own item name now, which is what each of them meant in the first place —
  the fix is not serialising the file.
- **The mutation has to go through a build.** The suite drives `dist`, so
  putting `describeNotification` back on its English literal proves nothing
  until `make e2e-server` rebuilds. It does, and then exactly this case
  reddens while the other ten stay green.


## E2E-M4-59 — hiding what is already in (FR-25.13e, 2026-08-29)

The browse-sheet's opt-in switch is otherwise a component-test subject: the
counting, the two "everything is already in" sentences and the persistence are
pinned in `InventoryBrowseSheet.spec.ts`. **Six of its seven cases are proven
red** against a build with the filter disabled; the seventh is the *default off*
case, which asserts the unfiltered sheet and is right to stay green there.

Two of the six only became red on the second pass, and both for the same
reason: they asserted the **tappable** rows, which look identical whether a
carried row is hidden or merely rendered as *„schon drin"*. The list that
separates the two is the carried one, and that is what they assert now. A
count of red cases is worth nothing without knowing which assertion earned
it.

**What only the rendered case can pin** is the rule the whole feature stands on:
with the switch on, a row tapped during the run **stays on screen** and reads
*added*. The obvious implementation — filter the carried set on every render —
passes every "the carried rows are gone" assertion and fails exactly here, with
the row vanishing from under the finger and the next row sliding into the tap
point. So the case asserts the presence of `browse-added-now` after the tap, not
the absence of something, and it also asserts the count line does **not** tick
up, which is the same clock stated twice.

The snapshot is taken in the component's *setup*, not in `onMounted` — found by
the persistence test, which mounted with the switch already on and caught the
first paint rendering the carried rows as freshly added. That makes each
*creation* of the sheet a new pass, and the case's second half asserts exactly
that by re-opening it: the previous run's add is hidden with the rest. The id
is **E2E-M4-59**, not 58 — 58 is claimed by the open FR-25.21 work.

The re-opening half cost one red pipeline before it settled anything: the
edit that added it matched a tail E2E-M4-47 has verbatim, so the block landed
in **both** tests, and a local run filtered to the new id could not see it.
Two shards found it. The lesson is the filter, not the edit — a change to a
shared file is verified by running the neighbours it could have touched.

It also settled a question the first draft got wrong. It was
written assuming `SheetModal` keeps its slot mounted, so `QuickAddItem` keyed
the sheet per opening to force a fresh snapshot. Removing that key left the case
**green**: Ionic destroys the modal's content when it is dismissed, so the
sheet is created afresh anyway. The key was deleted rather than kept as
insurance — and this case is what would catch it if a future Ionic changed its
mind.
## FR-25.21 — the three cases, and the four traps they cost (2026-08-29)

`e2e/membership.spec.ts`, three cases, all three red-proved. **E2E-M5-18** is the
one that owns the feature: mutating `planMembership` to give every member the
same amount reddens it, and nothing else in the suite noticed.

Four things the cases cost, each worth more than the case:

- **Five callers drove a control this PR deleted.** `m5-traveler`, M5's old
  single-select, was driven by `skip-item`, `analytics` and `single/server-sync`
  — three helpers with the same body plus two read-back assertions. `make ci`
  stayed green through all of it, because e2e is not in it. A redirected action
  needs **every** e2e caller, and grep is the only thing that finds them.
- **The bundle is what runs.** `membership-close` existed in the source and the
  case timed out waiting for it: `scripts/e2e.sh` drives `dist`, and the testid
  had been added after the last build. Rebuild between editing production code
  and running a case, always — the same rule a mutation proof needs.
- **A quantity of one has no stepper** (G-6), so `0/1` is text that never
  renders. Asserting the *control* — a checkbox for Mia, a stepper for Andy — is
  both the honest assertion and a stronger one: it shows the amounts differ.
- **An Ionic overlay stays mounted.** `expect(alert).toHaveCount(0)` after a
  cancel never passes; `toBeHidden()` is the assertion. The count reads the
  element, not the state.

And one case shape worth copying: **E2E-M5-19 asserts the cancel**, not only the
confirm. A destructive control that fires on the first tap and one that asks are
indistinguishable from the confirmed path alone. It also asserts the *silent*
half — a traveler whose row carries nothing leaves without a question — and that
half needs the disappearing amount as its positive signal, because "no dialog
appeared" is true of a build where the checkbox does nothing at all.

**What the review pass added, and why it was missing.** Two of the three cases
were written to their own shape rather than to the spec sentence they carry, and
reading the two side by side is what found it:

- **E2E-M5-20 promised that a preparation todo written before the conversion is
  still there afterwards** — and asserted only the summed quantity. That clause
  is not decoration: it is the entire reason ADR-036 chose keep-and-repoint over
  delete-and-recreate, and a collapse that recreated the row would have summed
  the amounts just as correctly. Deleting the content ladder from `survivorOf`
  now reddens M5-20 and nothing else; before, it reddened nothing.
- **E2E-M5-19 described three travelers and asserted two.** Harmless in itself,
  but it is the same defect in a smaller costume — a spec sentence nobody read
  back against the test body.

The general form: **a case id in the UI-Test-Spec is a list of promises, and each
clause has to be findable as an assertion.** The id existing is not the coverage,
and a green case named after the promise is exactly what hides its absence.

## FR-25.6 — one buy row for a per-person item (2026-08-29)

**E2E-M6-05 / E2E-M6-06**, both `local`, in `shopping.spec.ts`. The item is made
per-person the way a person makes one — M5's membership editor, three travelers,
2 / 3 / 1 — and only then looked at from the shop, so the case runs the whole
chain rather than a fixture shaped like its own answer.

**The mode is set before the conversion, on purpose.** The membership fan-out
copies the surviving row's fields onto the rows it creates (ADR-036), so
`buy_before` set once reaches all three; setting it afterwards from M5 would
have set it on **one** instance, and the other two would never have arrived on
M6 at all. That is a property of the product, not of the test: a per-person
item's procurement mode is still a per-row decision, and nothing yet changes it
for the whole cluster in one act.

**What makes M6-06 a real assertion.** "Every instance is settled" cannot be
read off a disappearance: two instances left behind would aggregate into a row
of their own and the list would still show something. The positive signals are
the **empty state** after the tap and the **restored `6×`** after the undo —
under a check-off that settled only the first instance, the first fails and the
second reads `4×`.

Proved by mutation in the unit layer rather than the container: with the
previous `ShoppingPage.vue` restored, four of the five new component cases go
red — the row count, the tab count, the fan-out and the aggregated reveal — and
the fifth, which asserts a *shared* row is left alone with exactly one call,
stays green in both builds. That last one is the guard against an aggregation
that swallows the ordinary case.

## E2E-G3-04 — the lock reaches the cluster, and says whose it is (2026-08-30)

**E2E-G3-04**, `server`, in `server/multi-user.spec.ts`. Alice claims **one**
child row of a per-person item; Bob opens the membership editor from a
**different**, unclaimed child. Both halves are asserted on the way in: M5
itself is *not* locked there (`m5-lock` count 0), so a green run cannot be the
old, row-scoped rule quietly passing.

**The case found a missing surface rather than a broken one.** The rule it
asserts had shipped the day before; what had not was any way to *see* it. Every
other G-3 surface names the holder, and this one could inherit nothing: M5's
banner is absent on the unclaimed row the editor is opened from, and the editor
is a modal *above* M5 in any case, so the banner would be covered even where it
exists. A frozen editor with no sentence is indistinguishable from a broken one
— which is exactly what the positive half of this case is written against.

**Alice releases the row instead of packing it** (FR-5.7). Packing would end the
claim too, but it also removes the row from the list Bob is looking at; the
release leaves everything in place except the claim, so what the assertion
measures afterwards is the lock and nothing else. The recovery is asserted on
the **still-open** sheet, and the write that follows — Leonardo's amount
stepping to 2 — is the positive signal.

**A helper changed shape for it:** `claimRow` now takes a test id rather than an
item name. A per-person item has no `m4-row-<name>` at all — it is a cluster
head with child rows — so the two-argument convenience of the older cases could
not address the row this one has to claim.

## FR-21.9 — the amount finally says what it is in (2026-08-30)

**E2E-M9-09**, `single`, in `single/instance-currency.spec.ts`. The chain is
four links long — the operator's `JITPACK_CURRENCY`, the endpoint, the
client's fetch at boot, `formatValue` — and only a rendered row crosses all
four. A unit test covers the last link and would stay green against a broken
first one.

**Why `single` and not `all`.** Local Mode has no server to ask, so its
amounts stay unit-less; that is the feature's stated cost, not a gap in the
case. The project's backend is started with `JITPACK_CURRENCY=CHF` in
`playwright.config.ts`, which makes the setting ambient for every `single`
case: a screen that renders an amount and drops the currency turns some case
red rather than passing quietly.

**Two clauses, both asserted.** `CHF` proves the label arrived; `129.50`
proves nothing converted it. The second is the one worth having — a currency
feature that quietly rescaled amounts would satisfy the first assertion
perfectly.

**Three Ionic traps, paid in three red runs:**

- A **header action is not inside the router outlet**. `visiblePage(page)`
  scopes to `ion-router-outlet > .ion-page:not(.ion-page-hidden)`, and the one
  app bar (ADR-011) lives outside it, so `m9-properties` is reached unscoped.
- **Escape does not dismiss an Ionic sheet modal.** The case clicks the
  backdrop, which is also what a person does.
- **`toHaveCount(0)` never arrives for a dismissed modal.** The test id sits on
  the `ion-modal` host, which Ionic keeps mounted and only empties, so the
  assertion is `toBeHidden()`.

**The case id was taken.** E2E-M9-08 already belongs to the UX-4 heading-gap
case; this is the second time a fresh id has collided with `main`. Grep the
spec *and* the ledger *and* `client/e2e` before claiming one.
## M6's twenty-two promises, read against the screen (2026-08-30)

Backlog item 6 says a green `e2e` job is not a verified UI, and M6 is where that
gap is widest: **17 of its 22 case ids had no test**, and not one of them was
marked *not implemented* — every one read as a description of built behaviour.
Before writing any of them, all 22 were held against `ShoppingPage.vue` rather
than against the spec. They fall into three heaps, and only the first is a
testing task.

**True and untested (7).** The two tabs with category grouping and their
FR-25.6 counts (M6-01), the check-off that moves a BUY_BEFORE row to *pack* and
a BUY_LOCAL row to *packed* (M6-02), the free-text add landing on the open tab
(M6-03), M4's shopping badge (M6-04), the visible confirm on M6's own template
(M6-16), the suggestion that adopts a master item's category (M6-19), and the
negative half of FR-25.10 — recipients are derived and there is no control to
re-enter them (M6-08).

**Stale wording, corrected in the spec rather than encoded in a test (4).**
Writing these as specified would have pinned behaviour the app deliberately does
not have:

- **M6-11** promised *„the ＋ FAB expands an inline quick-add and focuses it …
  an empty field collapses it on blur"*. M6 has **no FAB** — its composer
  carries its own trigger — the focus was removed by FR-25.13c because the
  keyboard covers the chips, and the blur-collapse by FR-25.13a because it
  reflows the list under the next tap. Three clauses, three deliberate
  reversals, all still standing in the spec.
- **M6-04** promised the M4 *„entry/badge hidden"*. The entry stays: the code
  says why where the count is computed — the destination exists either way and
  G-12's bar has no overflow to hide it in. A test written to the old sentence
  would have demanded that an empty trip cannot reach M6 at all.
- **M6-01**'s separated destination-checklist entries are FR-13.3 standing
  entries, waiting on trip series.
- **M6-15** guards a row colliding with the ＋ FAB. M4's half carries the rule;
  M6 has no FAB for a row to collide with.

**The surface does not exist (8).** M6-07 (a per-row note), M6-09/10/20
(FR-25.12's row sheet with *Zugewiesen an* and *Beschreibung*, and the edit
glyph that opens it), M6-12/13 (FR-25.13a's composer with a description field
and an assignee chip row that carries over), M6-14 (FR-25.11g's filter bar),
M6-18 (FR-25.11k's search). `ShoppingPage.vue` is 304 lines and imports two
components; there is one route, no sheet, no filter, no search. These are
**not a coverage gap** — writing them is building four features — and they are
marked in the UI-Test-Spec as an open owner decision rather than quietly
rewritten.

**What this pass is for, beyond M6.** The count of unwritten ids says nothing
about which of them *should* be written: a third of M6's turned out to describe
a screen nobody built, and two more would have frozen a rule the app had already
reversed on purpose. **Reading the promise against the screen has to come before
reading it against the test** — the id existing means somebody once meant it,
not that anything answers to it.

## The real provider — what a machine checks, and what a person must (2026-08-30)

ADR-029 kept a real Authelia out of the Playwright suite and wrote down the
cost: *„an Authelia-specific defect still ships green"*, to be paid by a
manual pre-release check against the family instance. That check existed as
an intention. This is it, split by what each half can actually establish.

### The mechanical half

`internal/api/realprovider_test.go`, opted into with an issuer:

```bash
JITPACK_REAL_IDP_ISSUER=https://auth.example.com go test ./internal/api/ -run RealProvider -v
```

Four read-only GETs against published metadata — no client secret, no
account, nothing written — so it is safe to point at production, which is
the only place the real answers are. Skipped without the variable, so `make
ci` and the pipeline are untouched: neither can reach a homelab, and a check
that needs the network must never be why a build goes red.

**It runs the shipped resolver, not a second reading of it.** The discovery
case calls `api.FetchDiscovery`, so the issuer-equality rule is asserted by
the code that runs at start-up.

**What it protects, and why each one is worth a case.** A provider does not
refuse an unsupported capability loudly; it grants less, and the failure
surfaces much later wearing a different costume. `offline_access` missing is
a session that stops renewing days after anyone would connect the two. A
missing `name`/`preferred_username` is an account provisioned with a blank
display name. An unpublished `email_verified` is an instance admin who
silently never gets the role, because an unasserted flag reads as false
(FR-23.1). Each failure names that consequence rather than only the gap.

**Falsified, not assumed.** Green against the real instance proves nothing
on its own, so the check was run twice more: against the same issuer with a
trailing slash, which is the trap `docs/authentication.md` names and which
fails with the mismatch printed; and against a locally served copy of the
real document degraded in three places (no `offline_access`, `plain`
instead of `S256`, `claims_supported` cut to `sub` and `email`, a JWKS
holding one non-signing key). Every assertion failed, each naming its
consequence. A conformance check that has never been red is a green light
wired to nothing.

**First run against the family instance** (2026-08-30, `https://auth.1-0.io`):
all four cases pass. The endpoints resolve under `/api/oidc/`, the signing
key is `kid=b4108f-rs256`, and every scope the client asks for is advertised.

### The half that needs a person

These are behind a real user session and no metadata document describes
them. Run them by hand against the family instance before a release, with a
real account:

1. **The login itself** — password page, the second factor Authelia's
   `family_two_factor` policy requires, and any consent screen. The mock IdP
   models none of this: it renders an account chooser and grants
   immediately.
2. **The round trip lands back in the app** — `/auth/callback` on the app's
   origin, the dashboard greeting carrying the display name UserInfo
   supplied. Authelia sets `authorization_response_iss_parameter_supported`,
   so the callback carries an `iss` parameter the mock never sends; what is
   being checked is that it is ignored rather than tripped over.
3. **The session renews** — leave the app open past the access token's
   lifetime, or clear it, and confirm the refresh grant works. This is the
   one `offline_access` buys, and the metadata check only proves it was
   *offered*.
4. **A deactivated account loses access** — the asymmetry the MVP plan
   records (ADR1): marking a user disabled in Authelia blocks new logins
   and **keeps honouring refresh tokens already issued**. Deactivate in
   JIT-Pack, or revoke at Authelia; confirm which one you did and that it
   took effect. This is the single most important item here, because the
   safe-looking action is the one that does nothing.

## M5 — six numbers that each meant two things (2026-08-30)

The third screen through the audit of backlog item 6, after M6 and M4, and
the first whose finding was not about a missing case at all.

**M5's catalogue had two blocks that never met.** Lines 262–277 of the
UI-Test-Spec were the set written for the §3.25 rebuild; 278–286 were the
original v1.0 list, never renumbered. Six ids — `E2E-M5-06`, `-07`, `-09`,
`-10`, `-11`, `-12` — carried one promise in each. The suite implements the
rebuild's meaning of `-09`…`-12`, so **four green tests read as coverage of
four promises nothing asserted**, and §7 pointed FR-3.3, FR-4.3, FR-6.2,
FR-7.3, FR-20.1, FR-20.4 and FR-22.1 at the invisible half.

It was not a slip anybody could have caught by reading a diff. `19d9826`
(2026-08-09) defined `-06` and `-07` twice **inside one commit** — the new
FR-25.14/25.15 entries were appended above the catalogue they duplicated —
and `dd560d4` (2026-08-14) added `-09`…`-12` on top of an existing
`-09`…`-12`. Both diffs are pure additions to a long list.

**Why the shadowed entries are struck in place rather than renumbered.**
Renumbering moves ids that eleven live artefacts already cite in their new
sense — the suite, this ledger, the matrix, four log sections, three commit
messages. And it destroys what the retirement convention exists for: a
reader arriving from an old commit that says "E2E-M5-10" has to land on a
line explaining what happened. The rule applied instead: **a number means
what the suite implements**, the loser is struck through and re-headed
*(v1.0 catalogue, shadowed)*, and only a promise that survives *and* has
nowhere to live gets a fresh number. Two did: `E2E-M5-22` and `E2E-M5-23`.

**It is a gate now.** `scripts/case-id-gate.mjs` fails on any id with more
than one live definition, because nothing about this class is visible to a
reviewer: both offending commits were pure additions to a long bulleted list,
one of them defined the same id twice *inside a single commit*, and every
automatic signal moved the reassuring way — the count of ids with a test rose
each time. Writing the gate immediately found **four more**, `E2E-M3-11`,
`-12`, `-13` and `E2E-M4-32`, all live pairs with two different promises. They
went into the gate as a shrink-only debt register — **and out of it the same
day**, see *The four inherited id collisions* below. The register is gone with
them; the gate carries one rule and no escape hatch.

**Held against the screen, the twelve sorted the way the two earlier audits
did** — four already asserted elsewhere (the G-3 lock banner, the delegation
notification, the master photo, the prep lifecycle), four describing a
screen that had moved on (the *Used by* section, *Buy now*, the per-person
layout, a duplicate of M5-17), one never built (FR-14.1's sparkline, retired
by the owner rather than left owed), and three real remainders.

**The three, and what each cost.**

*E2E-M5-05* — the note that becomes a task. One record, two sections, and
the assertion that carries it is that the row **left** one as it entered the
other: a case looking only for the todo passes against a build that renders
it in both. M4's prep badge is the third reader, which is what makes the
promotion a trip-level fact rather than sheet-local memory.

*E2E-M5-22* — moving an item between containers. E2E-M11-03 had deferred
this to M5 **in writing** ("re-assignment lives in M5's container control,
and belongs to that screen's cases") and nothing followed; `m5-container`
was asserted visible and never once operated. The readback is on M11 and by
weight, because the two cards are the only surface that states where the
thing actually is. Mutating `onContainerChange` to ignore a write onto an
already-assigned row reddens it and leaves E2E-M11-06 green — that case only
ever assigns out of the bucket.

*E2E-M5-23* — the companion offer, which was M5-10's shadowed promise. It is
the one entry that described something **built, visible on screen, and
asserted nowhere**: the section had been in the sheet since the rebuild with
no `data-testid` anywhere in it, which is the same signature the M20 audit
named. Two traps: a free-text quick-add row carries no `source_item_id` and
therefore no dependencies at all, so the world has to be built through the
*suggestion*; and `addItemDependency` defaults to `required`, so reaching
the suggested mode meant giving M10's dependency-mode select an id.

**The finding underneath the collision.** FR-25.15 says the sheet's save
indicator is *„deliberately distinct from G-2 … offline that difference is
the entire story, so the two indicators must not be merged into one"*, and
`SaveIndicator.vue`'s doc comment repeated it. All four sheets carrying it
passed it `syncStatus.state` — G-2's own state. That computed answers
`offline` **before** `syncing`, so a write still open on a device with no
network rendered as *saved*, and a background pull on a device with one
rendered as *saving*. The one case the requirement was written for is the
one it got wrong, and no case had ever caught it because the indicator's own
unit test asserted the consequence as the rule: *"reads every non-syncing
state as settled — offline is a G-2 story, not this one"*. Offline is
precisely this story.

It is now `capturePending`, counting this device's own open writes — the
Local Mode save, and the outbox's append to IndexedDB — and nothing else.
`SaveIndicator` takes a boolean and no longer imports `SyncState`, which is
what had tied the two together.

**Where that is asserted, and where it deliberately is not.** Five cases in
`composables/__tests__/captureState.spec.ts` and three in
`ItemDetailSheet.spec.ts`, all three of which redden when the sheet is
pointed back at `syncStatus.state`. **No e2e claims it**: the ● is transient
by construction, so a browser case could only race it, and the ledger's own
rule says a case that can pass by waiting-and-hoping is worse than no case.
What the e2e does assert is the half that holds still — E2E-M5-11 now checks
that the sheet carries no save control, beside the indicator that stands
instead of one.

**And the rule is pinned at the call sites, not on one screen.** The
indicator is mounted by four sheets and all four carried the same wrong
line, so a behavioural case on M5 would have proved M5 and nothing else —
the §4.0 trap, one rule written into N templates. `saveIndicatorWiring.spec.ts`
scans every file under `client/src` instead: no call site may be handed the
sync state, all must take `capturePending`, and the component itself must not
import `SyncState`. It **counts the call sites before judging them**, because
a source scan whose glob quietly matches nothing passes every assertion it
makes. Proved by rewiring one of the other three sheets — it reddens and
names the file.

**One promise was retired for the reverse reason.** FR-7.3 ends *"Resolution
is restricted to the item's assignee or the trip owner"* — enforced nowhere,
client or server, and contradicting the same FR's own sentence two lines
earlier that todos are visible to every trip member. Struck with the owner's
decision rather than left standing as a rule the app has never followed.
## M18 — the branch the backup never took (2026-08-30)

Backlog item 6, M18. Seven of its eleven ids were implemented and all seven
drive the **restore list** — the branch a multi-document backup file opens. The
four that were not written are all on the **merge preview**, the branch a file
holding *one* document opens, and that branch had no rendered coverage at all:
`packing-list.spec.ts` walks through it twice, but as a *fixture* for a trip
with quantities — it clicks `portable-preview` and `portable-commit` in
consecutive lines and asserts nothing about either.

So the sorting here came out unlike the earlier screens': **no id was retired
and none described an unbuilt screen.** Every one of the four described built
behaviour that nothing had ever painted, on the screen where the file is the
only copy of the data. All four are written.

| the promise | case | what it took |
|---|---|---|
| the header names the document, and every item carries its state | E2E-M18-01 | The inventory the states are computed against is built by an import of its own — M18 is the screen that turns a file into master items, so the second document meets exactly what the first left behind. Asserts that a *decided* state offers no choice, which is what keeps the near row's segment meaningful. |
| a trip arrives in the status its file names | E2E-M18-02 | Not a new rule — ADR-024's — but on the branch nobody drove. |
| merge and keep-separate decide the inventory | E2E-M18-03 | Two near-duplicates in one document, one left on the default and one switched, so the row kept apart is the positive signal for the row that was merged. |
| an unreadable file is refused here; a newer one still imports | E2E-M18-04 | The parser's rules are exhaustively unit-covered and **neither message was rendered by anything**. |

**Three sentences were the defect, not the coverage.** The audit's actual value
was in reading the clauses rather than counting the ids:

- *„a trip import creates a new trip in **planning** status"* stopped being true
  on 2026-08-23 (ADR-024). The stale wording had spread to four places — this
  case id, UI-Spec M18's *Actions* line, its restore-branch paragraph and two
  comments in `importPortableDocument`, one of them three lines above the code
  that reads `doc.status`. A comment that contradicts the line under it is worse
  than no comment: it is the one a reader trusts.
- *„reusing the same dedup component as M15 Step 3"* was never true. M15 and M18
  each render their own list and hold their own `mergeChoices` map; what they
  share is `findDuplicates` and two catalogue keys. Somebody acting on that
  sentence would have gone looking for a component to change.
- *„a malformed file is rejected before this screen is ever shown"* describes the
  refusal as happening somewhere else. It happens in M18's own picker step —
  which is the point, because the pasted text is still in the field to correct.

**And one word had reached the code.** E2E-M18-01 promised a *„private owned
template"*; `templates.owner_id` is creator metadata the server stamps and every
template is visible to every account (FR-1.6 MVP). The word was in the case, in
`importPortableDocument`'s doc-comment and in the unit spec's docblock and test
name — four places, none of them a property any template has ever had.

**Red proofs**, one production line each, rebuilt between runs: the state chip
forced to `matched` (M18-01 red, M18-03 green — the two are genuinely different
subjects), `commit()` merging every match regardless of the choice (M18-03),
`{ status: undefined }` in `importPortableDocument` (M18-02), and two for M18-04
— `newerSchema` forced false, then the parse error's own string dropped.

**The production diff is six test ids and four corrected comments.** The screen
itself was right; only what was written about it was wrong.


## M8 — twenty-four ids, and a control nothing had ever clicked (2026-08-30)

Backlog item 6, sixth screen. M8 was the first with **no unwritten ids at
all**: every one of its twenty-four numbers already carried a test, so the
read was clause by clause rather than id by id — and that is the only reading
that could have found what it found.

**E2E-M8-06 has read *implemented* since `8dc89d8`, and nothing in the suite
ever removed a position.** `m8-position-remove-*` occurs in no test; the page
has no component test either, so the ✕ on a position row — a destructive
control — had never been clicked by anything. The name sort beside it was in
the same state.

Why it survived a year is worth keeping. The ✕ was a **decision** that same
commit made: the M7 variant pass had just rejected the swipe panel, and the
replacement went into UI-Spec M8, into this id's amendment note and into the
ledger row on the day it was chosen. The entry then reads *"add/remove
positions — remove via the row's ✕ (amended 2026-08-15: …)"*, and everything
after the bracket is news. **A clause that arrives as news is not checked the
way a clause that arrives as a requirement is** — the amendment was reviewed,
the sentence it amended was not.

| Case | What it drives | File |
|---|---|---|
| E2E-M8-06 | positions render name-sorted, the row's ✕ takes that row alone, the removal survives reopening, and the last removal reaches the empty state | `template-editor.spec.ts` |

Written out of alphabetical order on purpose: `template_items` has no order
column, which is *why* the clause says name-sorted, and an insertion-ordered
list would satisfy any check made on one or two rows.

**Four clauses of other ids were unasserted and went in with it**, each folded
into the case that already owns its world rather than starting a case of its
own:

- **E2E-M8-12's „nothing auto-opens"** — the rest of that sentence was
  covered; this half is the whole of "one tap", since an editor presenting
  itself after every commit makes the FR-25.7 defaults a suggestion.
- **E2E-M8-13's „autocomplete after two characters"** — `MIN_SEARCH_LENGTH`
  had no assertion anywhere, e2e or unit, and it is shared with M3 step 3.
  The gate is asserted with the **free-text hint absent alongside the
  suggestions**: that hint renders exactly when a long-enough query matches
  nothing, so without it "nothing offered" is equally true of an empty result.
- **E2E-M8-03's clear-on-retap** — FR-15.2 gives each axis one value, so the
  active chip is also the way to clear it, and that `delete` was the only
  branch of `toggleCondition` nothing reached.
- **E2E-M8-05's sentence itself was the defect**, the M17 shape: it promised
  that a followed trip *updates immediately* and that running trips are never
  touched, which is the model FR-27.4 replaced on 2026-08-18. The screen has
  said *proposed* since, and the test asserted that word; only the case
  sentence still specified the old behaviour.

**Three clauses were checked and left alone**, which is the other half of the
job. *Trip-Global* (M8-02) is the FR-25.7 default and E2E-M8-12 asserts it as
the state a fresh row is in. *„scrim tap closes"* (M8-14) named Ionic's
`backdropDismiss`, not this screen — both user-reachable dismissals of the one
`@did-dismiss` handler are already asserted — and the clause was struck rather
than tested. And M8-15 drives the item-name hit only because the **group-name**
match and the diacritics fold are `searchGroups`' rules, asserted exhaustively
in `domain/__tests__/templates.spec.ts` down to the `föhn`/`fohn` pair.

**Filing note found while reading:** E2E-M8-20, E2E-M8-21 and E2E-M8-22 are
defined in the UI-Test-Spec's **M4** block, beside the M4 twins they were
written with. They are M8's ids on M8's tests; moving them would define a
number twice for the length of a merge, so the M8 block carries a pointer
instead.


## The four inherited id collisions, read against their screens (2026-08-30)

The M5 audit's gate opened with a debt register of four: `E2E-M3-11`, `-12`,
`-13` and `E2E-M4-32`, each a live pair carrying two unrelated promises. This
is that register emptied. **It is now empty and must stay empty** — a new
collision is a build failure, not a line here.

**In all four the suite carried the *first* meaning**, and the shadowed half
was the v1.0 catalogue's. Three of them turned out to be plain duplicates of
ids that are implemented under their own number: M3-11's date-less trip is
**E2E-M3-15**, M3-12's *Mehr Optionen* fold is **E2E-M3-16**, M3-13's default
travellers are **E2E-M3-14**.

**M3-13 is the one worth remembering, because it nearly went through as a
summary.** Its shadowed text promised three things the live entry states in
one clause — the M17 configuration, the *order*, and that removing a traveller
still works. Only reading E2E-M3-14's **test body** showed all three are
actually asserted there (`names.first()` is Andy; the remove drops the count to
two). A retirement justified by a sentence that merely sounds equivalent is how
a promise gets lost.

**M4-32 did not retire cleanly, and its clauses split three ways.** The
required pull and the co-skip are E2E-M4-40. That *suggested* companions do not
join unasked became covered only on 2026-08-30 — by **E2E-M5-23**, written the
day before this — so for as long as the collision stood, that promise was
genuinely unasserted *and* unreadable as a gap, because the number rendered as
implemented while the suite carried the FR-19.2 cold-open case instead. That is
the collision's cost made concrete rather than argued.

**And the third clause was never built.** *„…pulls its required companions onto
the trip **and reports it**"*: `addRequiredCompanions` returns nothing and no
caller raises a snackbar, so the companion simply appears on the list. FR-20.2's
*skip* does name what it took along — which is what makes the silence on the add
look like an omission rather than a decision. Left as an owner decision with no
case, the same treatment the M2 audit gave its three unkept promises.

**The gate got a guard on itself.** It reported `ok — 0 case ids` when it found
nothing, so renaming the spec or changing its bullet character would have
switched the check off silently while the build stayed green — the same
false-green shape a test asserting that something did not happen has. It now
refuses an empty scan. Proved by changing `* **E2E-` to `- **E2E-` throughout:
exit 1, with a message naming both plausible causes.

**What this pass deliberately did not fix.** Of 300 case ids in the suite, **78
appeared only in a comment above a test rather than in its title** — done since,
see *An id in the title is a case you can run* below.

## M1 and M19 — the front door nobody had opened (2026-08-30)

The app's first two screens, read the way backlog item 6 reads a screen. They
share a failure mode that no id count can see: **every spec in the suite passes
through both of them to get anywhere, and passing through is not asserting.**

**M19 had never been *used*.** `seedMode` writes `jitpack_mode` into
localStorage before the app boots, which is right — a suite that clicked
through the first-launch choice in all 40 files would be testing it 40 times
and the screen under test never. But the consequence stood for a year: the two
cards were asserted *visible* and neither had ever been *clicked*, so nothing
covered what the screen exists to do. E2E-M19-01 says so itself — the ledger
called it *partial*, and the missing part was the whole action. It is one case
now: the card lands on M1's empty state, the device asks the browser to keep
what is now its only copy (NFR-4.11), and a reload does not ask again.

Two things that case had to be careful about. The persistence request is not
made in the click handler — `chooseMode` persists the choice and *reloads*, and
`connect()` asks on the way back up — so an assertion in between would have
proved nothing; and `navigator.storage` is replaced wholesale in an init
script, with `persisted()` answering false, because otherwise the case asserts
what the CI browser's storage policy happens to be.

**M1's populated state had never been rendered.** Three `data-testid`s on the
screen, all three in its empty state; the visual baseline is `/tabs/dashboard`
on a fresh Local Mode with no trips; `global-nav`, `typography` and
`pwa-offline` all land on it and read the greeting. The signature is the one
#242 read on M20 — an absence of test ids is what a screen nobody has driven
looks like. Two cases now cover what it does with an active trip, and one of
them found that **"the next 3" names an ordering nothing defines**: the preview
is the first three of the store's array, and after a reload that array is in
IndexedDB key order over random ids. The case flaked on the wording before it
was rewritten to assert the rule the screen keeps — three of four, and the
fourth counted.

**And three of M1's six promises are not built.** Delegation highlighting and
live badge counts (M1-03) — there is no badge on M1 at all; the "Late Packer"
section (M1-06), whose entry also cited FR-5.4, *Partial Quantities*, where the
flag is FR-5.1, so the matrix had that requirement traced to a case about
something else; and the item name in the prep card that should reach M5. With
them, the two clauses that *read* like coverage: FR-6.1's "my" — M1 filters by
nobody, and a filter would empty the screen in the two modes that have no
account — and M1-04's "at the item", where the card is the only affordance.
None of them is fixed here.

**The `single` case is the third one written**, and it exists because of what
mutating its rule does. `E2E-M19-02`'s Single-User destination is invariant 5's
whole mechanism: the client persists `jitpack_mode = 'server'` like any other
server device and learns which instance it has from one 501 on
`/auth/config`. Every `single` spec depends on that and none asserted it —
flipping the condition turns `E2E-M2-14` red too, with a message about a
segment label, which is precisely the argument for a case that fails saying
*"this instance was sent to a login it cannot complete"*. The mutation cannot
be narrowed below that: the branch is one `if` on the app's boot path.

## M15 — the step nobody had opened, and the screen that opens once (2026-08-30)

> **The „opens once" half is fixed (2026-08-31), and it was not M15's.** The cause was
> the navigation anchors, which pushed a page nothing popped — see *„The switch nobody
> interrupted"* at the end of this file and ADR-012's third amendment. E2E-M15-03 runs
> without the `page.reload()` described below.

Backlog item 6, M15. Four of its ten ids were unwritten, and they sorted into
three different things at once — which is why the id count said nothing useful
here: **one was a real remainder, one was six promises in one sentence, and two
described behaviour the wizard has never had.**

| the promise | case | what it took |
|---|---|---|
| merge and keep-separate decide the inventory | E2E-M15-03 | Step 3 has existed since the wizard was built and **no test had ever opened it**: every fixture in the unit imports into an empty device, where there is nothing to be a duplicate *of*. The inventory is built by an import of its own, and the five-row count afterwards is what makes the merge legible. |
| the category-*row* layout, end to end | E2E-M15-11 | The layout this wizard exists for. Everything the unit drove had its category in a column, and the only case that committed imported a sheet with no trip and no headings — so `analyzeGrid`'s heading branch had never produced a row anybody could see. |
| the mapping gate, and the include toggle past it | E2E-M15-12 | The note existed in the suite only as M15-08's *absence*, and the per-trip include checkbox had never been clicked. |

**The clause that could not fail.** E2E-M15-06 promises that a detected
category column files the items under it *„and no item turned into one"*. With
a category column the analysis claims **no** category rows at all — so no item
was ever a candidate, and that half of the sentence is green by construction.
It is falsifiable only in the rows layout, which is where it now lives: the
mutation that stops claiming heading rows turns both headings into items and
E2E-M15-11 reads „5 new items, 0 categories". Same shape as E2E-M12-01's
absence bucket, arrived at from the other direction — not an assertion that was
true before the click, but an assertion in a world that cannot break it.

**Two promises the wizard never kept**, both unbuilt and both open with the
owner rather than quietly retired:

- **The grid preview.** UI-Spec M15 Step 1 says *„parser preview of detected
  grid"* and E2E-M15-01 repeats it. Step 1 is a file button, a paste box and
  *Analyze*; step 2 shows lists *derived* from the grid and never the grid.
- **The noise handling is done and never shown.** NFR-4.7's trailing `?`
  genuinely becomes an item plus an open task — `buildImportPlan` strips it,
  `commitImport` writes the todo, and both halves are unit-covered. What
  E2E-M15-02 promises is that the wizard **says so inline**, and no step does;
  the user meets the tasks inside the trip. Recorded with it, because it is the
  same sentence: the task's body is a hard-coded English string in
  `commitImport`, which NFR-4.12 would put on the catalogue.

Two smaller ones went the same way: the confirm names no **target series**
(the picker is on step 2 and the commit writes `series_id`), and the *„failure
rolls back completely"* in UI-Spec Step 4 has never been true — the commit is
an approximation, validated before anything is enqueued, with no rollback and
no progress. Neither reached the code as a defect; both were sentences describing
a screen nobody had re-read.

**The defect the new case found, which is not a coverage question at all.**
E2E-M15-03 needs two imports in one session, and the second one could not be
driven: after any M15 commit, the `router.replace` onto a tab root leaves that
tab's page **unhidden in the root outlet**, so a later push renders M15
*underneath* it — visible, fillable, and every click intercepted. Three probes
pinned it: M2 → M15 on a fresh boot is fine, and the same click after a commit
is not, whichever screen the commit landed on. The case reloads between the two
imports and says why; **M18's restore replaces exactly the same way**, and its
cases never come back for a second file. Open with the owner.

Two things the reload had to learn. The three rows are re-asserted after it
because they are also this case's **settled signal** — the dedup step reads
`master.itemList`, and a boot that has not finished loading offers no
duplicates at all, which would skip step 3 and leave the case green against
nothing. And the reload waits for the **G-2 glyph** to read `local` first: in
Local Mode `syncing` outranks it while a write is open, and reloading without
that wait dropped the import's last row once in five runs. Both are the seam
the production code already had; neither is a wait on time.

**One honesty note on a case nobody touched.** E2E-M15-09 promises that a name
the sheet listed twice *„is there once"*, and its body asserts the name is
visible without counting. It cannot pass against a duplicate — Playwright's
strict mode throws on two matches — so it is coverage; it just does not read
like it, and the next person to relax that locator would silently lose the
assertion.

**The production diff is five test ids on step 3.** The screen was right about
everything it does; three of the four things written about what it does *not*
do were wrong.
## The subscription helper was not deterministic, and said it was (2026-08-30)

`wsSubscribed` waited for the hub's `presence` frame to prove a page's trip
subscription existed, and its own doc comment called that *"Deterministic, not
hopeful"*. It was hopeful. Playwright buffers no frames from before a listener
is attached, and the helper attached one only when the caller awaited it —
while **every** caller had the same shape:

    const wsBob = bob.waitForEvent('websocket')   // resolves at socket open
    await bob.goto(tripPath)
    await expect(row).toBeVisible()               // seconds
    await wsSubscribed(bob, wsBob)                // listener attaches HERE

The frame arrives during the render wait and is dropped. The test then waits
out its 180 s timeout for a *second* presence broadcast, which only another
account's arrival produces — and in E2E-NOTIFY-01 that arrival is on the line
*after* the wait. So the case passed only while the server round trip was
slower than the render, which is why it failed on CI under load and never
locally.

**The fault was the API's shape, not the timing.** The caller created the
promise and chose when to consume it, so the gap was the caller's to open and
all twelve opened it. `watchSubscribed(page)` takes the page instead and owns
both steps, attaching the listener one microtask after the socket exists.

**Proved, not argued.** Locally the race does not occur — the machine wins the
other way and the case passes in 12.3 s. Inserting a deliberate 3 s wait before
the old helper reproduces the CI failure exactly; with the same probe in place
the new helper passes in 15.1 s, which is 12.3 plus the probe. Probe removed
before landing; both backend projects then run green (17 `server`, 21 `single`).

**The general shape, for the next helper.** This is the third finding this week
of the same kind — a comment asserting a property the code does not have
(FR-25.15's indicator, the case-id gate's empty scan, and now this). A doc
comment agreeing with the intent is evidence about the author, never about the
behaviour. What makes it worse here is that the claim was *load-bearing*: the
suite's rule against waiting for durations is exactly what this helper existed
to satisfy, so nobody looked again.

## M14 and M16 read against their screens (backlog item 6, 2026-08-30)

Two screens at opposite ends of the coverage range: M14 had all six ids
implemented and a component test carrying most of its rules, and M16 had
**nothing at any layer** — four unwritten ids, no spec file, no unit, and not
one `data-testid` in `SeriesPage.vue`.

**M14: three clauses that had no assertion, two of which could not have had
one where they stood.**

1. **The why line's plural branch had never been rendered.** E2E-M14-01
   promises *„auf {n} Reisen nicht gebraucht" when the series history says so*,
   and its trip is in no series — so `historyCount` returns 1 and only the
   singular branch is reachable. The split is what hid it: the **domain** takes
   the count as a parameter (`flaggedTripCount`, unit-covered both ways) and the
   function that derives it from the series' archived trips is `ReviewPage`'s
   own, tested nowhere. Two component cases now pin it in both directions —
   an archived sibling in the same series makes the line read *2*, one in a
   different series does not. Red-proved separately (`return 1`, then dropping
   the series filter). Not e2e: the world is E2E-M12-03's two-trip lifecycle,
   the most expensive staging in the suite, for one sentence.
2. **The FR-27.12 peek on a proposal's target group had coverage at no layer
   and no id claiming it.** `m14-peek-*` occurred in no test and in no spec
   sentence — on a screen where every other control was covered, which is why
   an id count could not find it. Folded into E2E-M14-04, where the target
   picker already is.
3. **E2E-M14-06 asserted one of its three clauses.** *„Archiving skips the
   assistant with a toast"* was never exercised — the case navigated straight to
   `/review`. Writing it turned up the trap worth keeping: **`review.nothingToast`
   and `review.empty` are the same sentence in both catalogues**, so asserting
   the toast's text alone would have passed just as well on the screen the clause
   is about *not* reaching. The case reads the archived M4's own closing card
   instead, and filters the toast by its text — *Reise gestartet* is still on
   screen and two matches are a strict-mode failure that presents as a flake.
   The third clause, *„applied rows don't reappear"*, is (a): the recompute is
   pinned in `domain/__tests__/review.spec.ts` and needs no e2e.

**M16: the first screen with no coverage at all, and rendering it found a
control that did not work.**

The checklist's add-row `ion-input` rendered at **zero width**. Ionic gives
`ion-select` `width: 100%`, which as a flex item is a flex-basis of the whole
row; the free space is already negative, so the input beside it — basis 0 —
grows by nothing and shrinks to nothing. The `＋` and the mode picker were on
screen and the field was not, so FR-13.3's editor could not be typed into at
all. **No assertion could have caught it**: the native input is in the DOM and
`getByTestId` resolves it; only Playwright's *visible* check — and the
screenshot beside it — says it has no box. Fixed by content-sizing the select.

Two more things M16 is worth remembering for:

* **`toContainText` on an `ion-select` matches its options, not its value.**
  `toContainText('Summer')` is true of a season select nobody has ever touched,
  because every option's text is inside the host. The assertion that caught it
  was the *untouched second series*, asserted first for exactly that reason; the
  value is read from `.select-text`.
* **The detach control sits on a row that is itself a link to the trip.** Its
  `@click.stop.prevent` is the whole thing keeping the gesture from opening the
  trip, so the case asserts M16 is still the rendered page afterwards.

| M16 promises | kept by | note |
|---|---|---|
| the name is editable | E2E-M16-01 | read back after leaving the screen. |
| a rename onto a taken name is refused | E2E-M16-01 (the screen) + `nameCollision.spec.ts` (the rule) | the field reverts and the toast names the holder; the header is the read-back. |
| the three defaults are editable | E2E-M16-01 | `.select-text`, not the host — see above. |
| the defaults are M3's prefill source | E2E-M16-04 | asserted before *and* after the default exists. |
| the destination profile is created lazily | E2E-M16-02 | the read-back after leaving is what proves the row exists. |
| notes and checklist editor | E2E-M16-02 | and the field it types into did not render until this unit. |
| trip history with per-trip stats | E2E-M16-03 | a trip in no series is absent from it. |
| detach / attach | E2E-M16-03 | attach read back on M2's series count. |
| the trends shortcut opens M12 | E2E-M16-04 | the *section* there is E2E-M12-03's, on both halves. |
| a series with no trips at all | nothing — deliberately | one `v-if` over the list M16-03 already moves; an id for it would be inflation. |
| the clone entry (FR-12.1) | E2E-M2-04 owns the screen it links to | left untested here on purpose. |

**One unbuilt promise, owner decision owed.** UI-Spec M14's *Navigation* line
says the archived trip's closing card *„teases the first two proposals"*. It
renders a heading, a hint and two buttons and reads no proposal. No case id
claims it, so nothing is red; the UI-Spec sentence is struck rather than
reworded, the treatment the M2 and M11 audits gave their unkept promises.

## An id in the title is a case you can run (2026-08-31)

The deferred half of the id work. `git grep <id>` already found a case whose id
sat in a comment, so traceability was not the problem; what the comment cannot
do is **run**. Every audit drove single cases with `-g "E2E-M5-05"`, and a case
whose id is only in a comment does not answer to that — nor does a CI failure
name the promise that broke, only the prose title.

**The count was not the work.** 83 ids were comment-only, and reading where each
one actually sits split them four ways:

| | |
|---|---|
| 56 | one id in the comment, none in the title — safe, the claim already exists |
| 9 | several ids over one untitled test — all of them belong, the test covers them |
| 7 | titles abbreviating the ids they already claimed (`E2E-M8-07/13/12`) |
| 11 | `test.describe` blocks — a group must not carry one case's id |
| 15 | prose: file headers, cross-references inside a body, notes on what is *not* built |

Only the first three were touched. **The fourth and fifth are the point:** an id
in a title is a claim that the test covers it, so the eighteen cases whose
comment names *other* ids were held to a reading rather than a rule. **Sixteen
of the eighteen turned out to be citations** — "covered on M8 (E2E-M8-19)", "the
*facet* half of the tap is E2E-M12-04", "same second-context rule as
E2E-M2-10" — and promoting those would have written false coverage into sixteen
titles while the number improved.

**Two were real, and they were only found by reading all eighteen.** The
container-creation case covers `E2E-M11-01` as well as `-05` (its comment says
so in the abbreviated form, which the title expansion never saw because it only
looked at `test(` lines), and the preparation-lifecycle case covers `E2E-M4-08`
beside `E2E-M4-25`. Both now say so. A third, `E2E-M1-04`, was deliberately not
added: its comment claims only *"the built half"*, and a title asserts the
whole.

**A sample was read before the sweep, not after.** Eight of the 56 were checked
against their test bodies to confirm the comment's id describes that test rather
than an adjacent one. All eight held, and the titles turned out to be prose
restatements of the id — so `G-11: the brand and its rgb twin…` becomes
`E2E-G11-05: the brand and its rgb twin…`, the redundant screen prefix dropped
because the id already names the screen.

319 of 332 ids now sit in a title. The remaining 13 are the prose ones, and they
are right where they belong.

## The switch nobody interrupted (2026-08-31)

Found while chasing M15's *„the wizard opens only once per session"* (backlog item 6,
2026-08-30), and it turned out to be the smaller half of something else.

**What the symptom was.** After any M15 commit, opening the wizard again in the same session
rendered it *underneath* the page on screen: visible in the DOM, fillable by a script, and
every click intercepted. E2E-M15-03 needs two imports and could only be written with a
`page.reload()` between them, carrying a note that said so.

**What it actually was.** Reading the outlet at each step — `ion-router-outlet > .ion-page`
with its class list and computed `z-index` — the wizard was never the cause. The four
navigation anchors were plain `<router-link>`s (ADR-012 Option A, *„the tab bar is plain
links"*), so **every anchor switch pushed a page nothing ever popped**. That alone is
harmless while each transition finishes. Interrupt one — tap the next anchor before Ionic is
done — and both pages stay live:

    boot on /tabs/items                      m9-empty   z=0
    items→trips→templates→items→trips        m9-empty   z=100  (hidden)
      tapped without waiting                 m2-…       z=100
                                             m7-…       z=101   ← on top of M2

The URL reads `/tabs/trips`, M2 is the page the user sees, and M7's page is what receives the
taps. Waiting between taps produces one visible page every time, which is why nothing caught
it: **E2E-G9-09 and E2E-G1-01 each make exactly one settled switch.**

**Three things worth carrying.**

*A probe that does not wait measures a different app than one that does — and both are real.*
The first probe run here used `waitForFunction(() => location.pathname === …)`, which resolves
when the URL changes and not when the transition ends, and it produced a corrupted outlet on
what looked like four ordinary clicks. That over-stated the defect, and the correction matters
in both directions: the settled path is clean, and the interrupted path is what a person
tapping through a bar actually does. The case therefore taps without waiting *on purpose* and
asserts a settled outcome at the end.

*The routerAction was not the lever.* Four variants of the commit's own navigation were
measured — `router.replace`, and `navigate` with `root`/`replace`, `back`/`replace`,
`back`/`pop`. None fixed it and two made it worse, leaving the wizard mounted on top with the
destination never appearing. Three of those builds were spent before the probe was pointed at
the *anchors* instead of at the wizard, which is the general lesson: when a fix at the reported
site keeps missing, the reported site is the symptom.

*A cost accepted in an ADR can be under-specified rather than wrong.* Option A's *„plain
links"* was the right decision and one word short — a link is a push, and between siblings a
push is what nothing pops. The amendment says *root navigation* and keeps the element a real
`<a>`, so the pros the option was chosen for are untouched.

**And M15 needed no fix of its own.** With the anchors resetting the stack, its commit's
`replace` no longer collides; E2E-M15-03 runs without the reload, and that removal is this
change's second proof rather than a case of its own.

## Three promises about saying, not doing (2026-08-31)

M15's audit (2026-08-30) left three owner decisions, and all three were ruled *build it*. What
they have in common is worth naming, because it is not a coverage shape and no gate finds it:
**each was about the wizard saying something, and in every case the doing was already built and
unit-covered at both levels.** NFR-4.7's trailing `?` did become an item plus an open task;
`commitImport` did write `series_id`; the parser did read the grid. Nothing was red, nothing was
missing from the domain, and the user met none of it.

**The one that needed a decision was the grid** (ADR-041). The other two are a sentence each.
A grid is wide and a phone is not, so it is the only one where showing the truth costs something:
measured at 390 px, ten columns render as a 358 px box over 617 px of content. The alternatives
both fail the question the step exists for — truncation hides the *right-hand* columns, which is
where a delimiter error shows up, and a column-header list is step 2 written twice and cannot
show a ragged row at all. The preview therefore renders `parseSpreadsheet` output and nothing
derived: it has to stay truthful exactly when the analysis is wrong.

**Two things the writing found.**

*A locale assertion in the default locale asserts nothing.* The noise task's body moved from a
hard-coded English string onto the catalogue (NFR-4.12). Asserted in English, `t()` and the
literal it replaced are indistinguishable — the test passes against the unfixed code. The unit
switches to `de` and asserts the German word, which also cost the spec its `node` environment: the
subject reaches `document.documentElement.lang` through `setLocale`, so the file now declares
`// @vitest-environment jsdom`. That is CLAUDE.md's rule arriving from its loud side for once —
here the missing docblock threw rather than quietly taking a `catch`.

*A confirm row that always says the same thing is half a test.* E2E-M15-04b asserts the series
line **before** choosing a series as well as after, because *„keine Serie"* on every row would
satisfy the promise's second half on its own.

## Two sections nobody had built, and the pixel that changed one (2026-08-31)

FR-27.8 and FR-27.9 were specified in July, clicked through in the concept prototype's fourth
and fifth rounds, written into three documents, and existed in no build — found 2026-08-30 by
the M10 audit, ruled *build it* the next day. What the writing produced beyond the two features:

**A finding only the render could make.** The scope chip was copied from M7, where a *group*
row wears a filled chip and a Ferien-Vorlage wears nothing — correct there, because the two
live in separate sections and the section is the label. In M10 they share one list, and the
first screenshot showed a 42 px unmarked note beside a 20 px chip: an asymmetry that reads as
an inconsistency rather than as a rule. Both wear the chip now (measured: 65 px and 52 px wide,
both 20 px high). **No assertion would have found it** — a test written against the copied
markup asserts the asymmetry as the specification, which is the shape the M5 save-indicator
audit named a week earlier.

**And a case that could have passed on the wrong screen.** E2E-M10-17's first draft asserted the
*group* chip alone, which is satisfied by a screen that marks nothing else. It creates a
Ferien-Vorlage as well now, so the list is mixed and both chips are asserted — the positive
signal the group chip's presence stands against.

**Three rules settled in the domain rather than in the component**, all of them cheap to get
wrong later:

- The comment join is the **foreign key and nothing else**. An ad-hoc row has no source item, and
  matching by name would put one item's remark on another — the argument FR-27.5 already makes
  against fuzzy folding, arriving here from the other end.
- An **undated comment sorts last**. `created_at` is nullable; the epoch buries the one row
  nobody can date at the bottom of a list read from the top, and *now* crowns it. Last, and the
  row simply carries no date.
- **Own positions only.** The list is the navigable half of FR-2.4's count, and a list that also
  walked includes would answer a different question than the number it sits under. The seeded
  screenshot shows the pairing working: two templates listed, *„Used in 3 places"* on the card
  below, the third being the trip row.

## A picker that had to offer a year outside its own window (2026-08-31)

M22's two owner decisions, built. Both are small, and each left one thing worth keeping.

**The year picker cannot simply offer the same six years the other two do.** M3 and the clone form
choose a year for a trip that does not exist yet, so *last year through four ahead* covers every
case. M22 edits a trip that may be **any** year — the owner's instance carries a decade of imported
history — and a picker offering six years to a 2014 trip is not merely unhelpful: selecting nothing
is impossible in an `ion-select` that has a value outside its options, so the field would either
render empty or silently offer to move the trip. It therefore prepends the trip's own year when
that lies outside the window. The rule the three now share is one function with the current year as
a *parameter*, so it is testable without a clock — `YEAR_SPAN` had been written three times, once
as a bare `6`. And the reviewing pass caught two things in the new code: the out-of-window year was
*prepended*, so a 2040 trip would have sorted before 2025; and the case read the select through a
`data-value` attribute added to production markup for no product reason, where the suite already had
the right way (`.select-text`, from `series.spec.ts` — an assertion on the host matches every option,
not the value).

**And the note found its place by being looked at.** Put in the travellers card — beside the ✕ and
the add row it explains — the sentence *„this trip is finished, so nothing here can be changed"*
reads as a rule about people rather than about the screen, sitting as it does under the heading
*Travellers*. It is above both cards now. The traveller hint below it (*„a traveller who joins gets
the per-person items straight away"*) went with the controls it explains: on an archived trip it
describes a capability that no longer exists, which is a second sentence contradicting the first.
Neither would have failed an assertion — both are correct text in the wrong place.

## A screen that aggregated rows it had never loaded (2026-08-31)

M1's three owner decisions, built — and the largest thing in the commit is none of them.

**The defect the first probe found.** Building the delegation section meant asking, for the
first time, whether M1's rows are actually *on the device*. They are not. A trip partition
arrives when its trip is opened (M4 calls `ensureTripData`), and **M1 never asked**: in Server
Mode every active trip rendered with *„0 offen"*, no preview rows and no prep card, until the
user had visited each trip in that page session. It survived for two reasons, and both are
familiar shapes:

- **Local Mode never shows it.** Everything there is rehydrated from IndexedDB on boot, so the
  whole local suite — which is where M1's two cases live — is green against an aggregation that
  has nothing to aggregate anywhere else.
- **The pull-to-refresh already pulled exactly this.** `handleRefresh` calls `drainAll`, so the
  data path existed and worked; the screen simply never used it on arrival. A capability
  reachable by a gesture reads, in the code, as a capability the screen has.

Two calls fix it, and the second is what FR-4.4 needed anyway: `ensureTripData` per active trip
**and** `subscribeTrip`. Only M4 had ever subscribed to a trip channel, so a device sitting on
the dashboard heard nothing about the trips it was displaying — the *„updates in real time"*
half of E2E-M1-03 was not merely unbuilt, it was unreachable. A **watcher** rather than a mount
hook: the trip list arrives with the master partition, which on a cold boot has not landed when
`onMounted` runs, so a one-shot call would have asked for nothing — and asked *silently*.

**Two more things the writing settled.**

*„Since the last visit" is a set, not a timestamp.* FR-6.1 asks what arrived since the screen was
last read, and a row carries no assignment time — the HLC that ordered the write is the server's
and never reaches the client as a date. A device-local **set of row ids** answers the question
the requirement actually asks (has this device shown me this yet?) and answers it identically
after a clock change, a timezone move, or a device that was off for a week. It stays small on its
own, because it is replaced rather than added to: an id whose row was reassigned is simply gone.

*A screen has two exits and Vue knows about one.* Marking the highlights read `onUnmounted`
covers an in-app navigation and nothing else — the browser leaving the document tears the page
down without running a single Vue hook, so a delegation stayed *new* for ever on a device whose
user left by a real link or closed the tab. `pagehide` is the other half. **The e2e case is what
found it**, because it navigates with `page.goto`, which is a real navigation; every in-app
assertion would have passed.

**And a trap in the case itself.** The first draft asserted *„no delegation section"* before the
assignment. The `server` project runs every case against one instance as the same two accounts,
so a sibling case delegating something else to Bob puts a section on this screen — the assertion
failed on the retry, not on the first attempt, which is exactly how this kind of coupling
presents. Scoped to the case's own row now, which is the treatment E2E-FLOW-02's toast filter
already records one screen away.

**One seam was added on purpose and one was removed.** The row carries `data-new`, because the
highlight it marks is expressed as a **colour** and a colour is the one thing a Playwright
assertion cannot read honestly — the same reason `sync-indicator` has carried `data-state` since
the G-2 work. It earns its place a second time as an `aria-label`, so the state a sighted reader
gets from the border is also announced. That is the distinction the M22 review drew the same
day: a `data-value` duplicating text the DOM already exposes is a test seam with no product
reason, and this is not one.

## Two faces, because three cost a line (2026-08-31)

M2's two row promises, built on the owner's ruling. The chip is a one-line render of a column
that had a writer and no reader since M15 shipped; the faces are the interesting half.

**The pile's size is a measurement, and the first guess was wrong.** Three faces before the „+N"
bubble looked obviously right — the presence facepile defaults to four, and the row has an end
slot doing nothing. Rendered at 390 px with a four-traveller trip it is 64 px wide, and it pushes
*„Sommerferien im Tessin 2027"* onto a second line: **the row goes from 87 px to 106 px**, on the
app's main entry, for every long-named trip in the list. Two faces plus „+2" is 61 px and the name
stays on one.

Three points worth keeping from that:

- **Three pixels decided it.** 64 → 61 is the whole difference, which means this is the wrap
  *boundary* and not a comfortable margin: a longer name wraps either way. That is fine and it is
  written into the constant's comment, so the next reader does not mistake the number for headroom.
- **Nothing would have failed.** Both piles render, both are visible, both are addressable; a case
  written against the three-face version asserts the wrap as the specification. Only the rendered
  row and a line count say which is better — the same lesson M10's scope chip taught two PRs
  earlier, arriving through size rather than through symmetry.
- **The comparison had to be built.** The measurement is meaningless without the same name on a
  trip with *no* travellers: 1 line, 288 px. A single number would have said the row is 106 px
  tall and left the cause unattributed.

**The faces follow the ring's honesty rule, found on review.** A trip's travellers arrive with
its partition, so in Server Mode a fresh boot would have shown every unopened trip as being for
nobody. The row already draws that distinction for the progress ring — `tripDataKnown`, a „·"
rather than 0 % — and the pile draws it by being **absent**, which is also what a trip with
genuinely no travellers looks like. The two are indistinguishable on the row on purpose: neither
is a claim, and the alternative is a third visual state for „we have not looked yet".

**And the chip's case creates its trip through M15.** `trips.imported` has exactly one writer, and
a fixture setting the column directly would assert the chip against a state the app cannot
produce — which is the failure this audit programme has now found in five different costumes.

## Two silences, and where each case had to live (2026-08-31)

The last two owner decisions of the screen pass, both about a surface that had the information
and did not say it.

**The quick-add's companions.** `addRequiredCompanions` returned nothing and no caller raised
anything, so a required companion simply appeared on the list — while FR-20.2's *skip* names
exactly what it took with it. The fix is not the snackbar, it is the **shape**: the action returns
what it added and the *screen* says it, which is what `skipItem` has done since FR-5.5 (it returns
every row it affected, snapshotted before the write, because the undo needs the same list the
sentence does). A toast raised from the orchestrator would have been a second pattern for one
rule, and the one that drifts is the newer one.

**The closing card.** It rendered a heading, a hint and two buttons and asked the review generator
nothing, so it said the same thing whether eleven suggestions were waiting or none — the one
question the tap answers. It calls the same `buildReviewProposals` M14 calls: an approximation
here would be the review implemented twice, and invariant 4's whole argument is that the summary
is the copy that drifts.

**Where the case had to live turned out to be the finding.** E2E-M14-07 was written first in
`closing-pass.spec.ts`, whose fixture builds a trip with **ad-hoc** rows, and it failed reporting
*„Nothing to review"* — correctly. A proposal needs a row with **provenance**: an ad-hoc row
judged *unused* proposes nothing, because there is no template position to zero. The case moved
to `review.spec.ts`, where a group-generated trip is the fixture. The transferable form: **a case
that fails on its own setup is telling you the rule's precondition**, and the temptation is to
weaken the assertion rather than to move the case.

**And the reviewing pass caught a tautology in the new case.** E2E-M14-07's first draft asserted
`not.toContainText('…and')` to mean *„two, not everything"* — a string the teaser never renders in
any state, so the assertion could not fail. It asserts **both** of the fixture's proposals now,
which says the card reads the generator rather than showing the first thing it finds; the *cap
itself* is deliberately unasserted, because the fixture produces exactly two and a case that
cannot distinguish two from all is worth less than saying so. This is E2E-M12-01's shape —
*would the assertion have passed before the action?* — arriving in code written the same hour it
was read.

**One mutation proof was invalid before it was valid.** The first attempt renamed the catalogue
key, which broke the type-check — so `npm run build` failed, the *old* bundle stayed on disk, and
the case went red for a reason that had nothing to do with the change. A mutation has to compile;
`if (false && …)` on the report was the one that proved anything.

## The baseline for the screen the pixel found (2026-08-31)

M16 gets a visual baseline — the last thing the screen pass left owed, and deliberately last in
the batch: every earlier PR could have moved a pixel, and a baseline recorded before them would
have been rewritten by the next merge.

**Why this screen and not another.** M16 is where the programme's clearest pixel-only defect was
found: FR-13.3's checklist input rendered at **width 0**, because Ionic gives `ion-select`
`width: 100%` and as a flex item that is a flex-basis of the entire row. Every assertion passed —
the input is in the DOM, `getByTestId` resolves it, its computed flex and height are correct — and
only the rendered box said it was empty. A baseline is the only gate that would have caught it,
and until now the screen had none.

**The capture has content on both sides on purpose.** An empty row of the same geometry looks
identical whether the input has width or not; the select carries a value and the input carries
text, so a collapse shows up as the text disappearing rather than as nothing changing. That is the
same reasoning E2E-VIS-02's *„the load is real"* note records for the weight bar — **a baseline of
an empty control checks nothing**.

**What it does not guard**, stated so it is not discovered again: the ADR-013 tolerance is 0.002,
which E2E-VIS-08's own entry already documents as blind to a 591 px offset on a full-page shot.
This gate catches the row collapsing, not a few pixels of drift in it.

### The baseline had recorded a scroll position (2026-08-31)

Two days later `E2E-VIS-09` failed on `visual-mobile` with a 6 % diff — on a **docs-only
commit**, and stably across both retries, which is what ruled a rendering flake out. The two
images carry the same screen: the baseline sits 102 px lower.

The cause is in the case, not in M16. `fill()` focuses a field, and the browser scrolls a
focused field into view on its own schedule, so where the page stood at capture time was a
race the baseline had frozen one side of — and `settled()` waits for fonts, which says nothing
about scroll. `visual-desktop` never showed it, because at that height there is nothing to
scroll.

Fixed by making the scroll a decision instead of an outcome: blur, then set the `ion-content`
scroller to 0 before the shot, and the mobile baseline re-recorded at the top. **The general
form — a baseline is only as deterministic as the state the case leaves the screen in**, and a
capture taken right after typing is not that state. Nothing else in this file's baselines types
before it shoots.

### One shard was red, and it was not this change (2026-08-31)

Recorded because the *reasoning* is reusable, not because the failure was. `e2e (6)` failed on
this PR's first run with `E2E-M5-12`: `m4-header` resolving to **two** elements inside the
visible-page locator — the two-live-pages shape ADR-012's amendment 3 fixed the same morning,
which is exactly the coincidence that makes a re-run the wrong first move.

What was checked before re-running, in order:

1. **Can this diff reach the e2e projects at all?** `playwright.config.ts` gives `chromium` and
   `webkit` `testIgnore: ['**/visual.spec.ts', …]`, so a new case in `visual.spec.ts` changes
   neither their test list nor their **shard boundaries**; the only other edit is a comment in
   `series.spec.ts`. The answer is no.
2. **Is `main` red?** Its own run on the identical e2e code is green on all eight shards.
3. **Does it reproduce here?** `E2E-M5-12` alone, and the whole `item-detail` spec, ran green
   three times each against `origin/main` in the pinned container.

Only then the re-run, which passed. So: an intermittent under CI load, on code this PR does not
touch — the third such observation in two days (`E2E-M4-32`, `E2E-M17-01`, and this). **Three
different cases failing intermittently only under a loaded shard is a pattern worth a
measurement of its own**, and it is not one a green re-run should be allowed to close.

## Two ways to wedge the `single` project (2026-08-31)

Both were paid for while writing E2E-G5-01, and neither produces a message
that names itself — the run simply never ends, and the `line` reporter shows
the test's own title as the last thing it printed.

**An unresolved `page.route` handler stops the world.** A handler that awaits
something the test only resolves later looked like the clean way to assert
"rendered before the server answered": hold the push, assert the row, release.
It wedges the whole run instead — Playwright's own 60 s test timeout never
fires, so there is no failure to read and no artefact to open. The case was
rewritten to *refuse* the push every time it is attempted, which establishes
the same thing (a row that is on screen cannot have been waiting for an answer
that never came) and leaves nothing pending. Count the refusals: without that,
the case also passes in a world where nothing was ever sent.

**The plain `page` fixture in this project is not seeded.** Every existing case
here builds its page with `bootPage(context)`, which seeds `server` mode before
the first navigation; a test that takes the `page` fixture instead lands on M19
and waits for a screen that will never arrive. It reads as a hang for the same
reason as above — the reporter is buffered, so the timeout report only appears
once the run is over, and the run is what is stuck.

## Three intermittents, one signature (2026-08-31)

`E2E-M4-32`, `E2E-M17-01` and `E2E-M5-12` each failed once under a loaded
shard in two days and each passed on the re-run. The ledger recorded them as
a pattern worth a measurement rather than something a green re-run should
close. This is the measurement.

**One of the three has a captured cause, and it is not flakiness.** `main` at
`4dab0d46` failed `e2e (6)` on E2E-M5-12 under webkit with

```
strict mode violation: locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
  .getByTestId('m4-header') resolved to 2 elements
```

— two **unhidden** M4 pages at once, one listing the row and one not. That is
ADR-012's page-stacking leak, the same class the four navigation anchors had,
surviving on a path this pass did not touch. It shows only under load because
load is what interrupts a transition, which is exactly why three different
cases have "flaked" and why each green re-run looked like it settled the
question. The case's own comment records an earlier round of the same thing,
answered then by scoping the locator to the visible page — and the failure is
that even the scoped locator now matches two.

**It does not reproduce here.** Fifteen runs of E2E-M5-12 on webkit, up to
four workers, with the box deliberately loaded to ~9: all green. So the fix is
not written blind — what is written instead is the thing that makes the next
occurrence name itself.

**Every case now ends with ADR-012's invariant checked.** `oneLivePage` in
`fixtures.ts` is an automatic fixture: after each case that passed, the outlet
must be showing at most one page, and the failure names the pages it found.
Two properties are load-bearing:

- **It polls.** A page on its way out is unhidden for the length of its
  animation, so a one-shot read fails every case whose last act was a
  navigation — measured, on the first run: E2E-G9-17 and E2E-G1-06 both
  reported two pages, M2 under a just-pushed M15, and both were transitions
  rather than leaks. A leaked page stays for good; the poll is what tells
  them apart.
- **It skips a failed case.** A case that failed has its own story, and this
  would only bury it.

What it buys: a leak is invisible from inside the case that produces it — the
URL is right and the screen looks right — and surfaces later as somebody
else's strict-mode violation. From here it surfaces at the case that caused
it, with the pages named.
## E2E-FLOW-04 — the loop that did not close (2026-08-31)

The cross-screen flows are the last of backlog item 6, and the first two read
apart in opposite directions.

**FLOW-03 was already covered and did not know it.** Its journey — buy on M6's
before-departure tab, find the row on M4 — is E2E-M6-17's second half, written
because the revealed row's *„on the packing list"* is a sentence about a screen
nobody had looked at. What was missing is one clause: the row arrives as
**PACK/Open**. Bought is not packed, and `buyItem` flips only the mode, so
`m4-progress` reading `0/1` is the assertion; a row that had arrived packed
would have been hidden by FR-25.2 and the visibility check alone would have
gone on passing for the wrong reason.

**FLOW-04 was not covered, and writing it found the defect the M14 cases could
not see.** Every one of them stops at M8 — E2E-M14-02 asserts that the group
holds the harvested item and that the unused position reads `0×`. Whether next
year's trip is any different for it is a question only *generation* answers,
and nothing had asked it. It was not: `applyReviewProposal` called
`addTemplateItem` with no options, so the position took the mutation's default
`assignment: 'per_person'` — the one field that decides **how many** rows
generation makes. Every other writer in the app passes `trip_global`
explicitly (M8's editor, M21's fold); M14 was the only caller living off the
default. A shared item harvested from a trip therefore came back as one row
per traveler, and on a trip with no travelers as **nothing at all** — the loop
the write exists to close, silently open.

Three things kept it invisible, and they are the transferable part:

- **A default is not a decision, and it reads like one.** The call site says
  nothing, so there is nothing to review; the diff that introduced it is
  correct in every line it contains.
- **The unit asserted the neighbouring field.** `review.spec.ts` checked the
  quantity of the added position and never its assignment — the shape the
  screen audits kept finding, one clause down.
- **M8 renders `1×` either way.** The position looks identical in the one
  screen the existing cases read it back from.

Fixed at the call site, with the unit assertion beside the quantity one, and
the e2e case as the outer proof — red against the unfixed build, green after,
in that order.

## E2E-FLOW-05 — a history worth nothing on the second device (2026-08-31)

FLOW-05 is the migration flow: import a decade of spreadsheets, and the next
trip proposes the amounts that decade agrees on. Everything in it was built —
`suggestions.ts` is exhaustively unit-tested, M3 renders the hint, `?series=`
preselects — and the flow had never been walked.

Walking it found that **the hint is the only feature in the app that reads
another trip's rows**, and it read them without asking for them. Those rows
live in each trip's own partition, and Server and Single-User Mode pull a
partition only when its trip is *opened* (ADR-033). Every other reader of a
foreign partition asks first — M2's progress ring, M1's dashboard cards, the
clone page all call `ensureTripData` — and this one went straight to
`tripStore.getItems`. So the migrated history was worth something on exactly
one device: the one that did the import, where the optimistic rows were
already in the store.

Three things about it are worth keeping:

- **An absent partition does not read as absent.** `getItems` of a trip
  nobody pulled returns `[]`, which is indistinguishable from a trip that
  packed none of that item. So the failure is not "no hint" — it is a hint
  computed over whichever subset happens to be on the device, stated with the
  same confidence as one computed over all three years. That is why the fix
  is two parts and not one: ask for the partitions, and offer nothing until
  every one of them has arrived. The guard is the same doctrine ADR-033 wrote
  for the ring and the clone page; this screen simply had not been told.
- **The device that did the work is not evidence.** E2E-M15-05 learned this
  for the wire and it is the same shape here: on the importing device the
  screen is right for a reason that does not travel. Only a second context
  can say whether the feature exists for anybody else.
- **A pure function's unit tests can be complete and prove nothing about the
  feature.** `suggestions.spec.ts` covers the median, the normalization and
  the ordering; the producer that turns the store into its input had no test
  at any layer, and that is where the whole feature was lost.

Two smaller findings came out of writing the case, both about the *sheet*
rather than the screen:

- **Two text columns are a choice the mapping makes for you.** The first
  draft's CSV had a category column beside the item column, and the wizard
  filed the items under the *item* names and made the categories the items —
  the mapping's detection swapped them, and nothing in the flow says so until
  the inventory is read back. The case now imports a sheet with one text
  column and asserts the summary line's "1 new item" before committing.
- **`getByText` on M9 is not "the item is in the inventory".** The first
  attempt asserted the item's name was visible on `/tabs/items` and it
  *matched* — twice, on the tag heading and the segment the swap had created.
  `getByTestId('m9-row').filter({ hasText })` is the assertion that says what
  it means.

## E2E-FLOW-07 — the migration whose first step is not in the app (2026-08-31)

FLOW-07 is the promise that Local Mode is not a trap: FR-19.5 makes leaving it
one step — the NFR-4.11 backup carries every template and trip, and importing
it while the app points at a server moves the lot (ADR-015). Since ADR-025 the
server has no importer of its own, so what reaches it is exactly what the
client's restore pushes; that is the whole mechanism, and nothing had ever
walked it.

Three things came out of writing it.

- **The third device is the case.** E2E-M18-05 already restores a backup, and
  it restores it *locally*, where the assertion cannot tell a landed row from
  a pushed one. On the importing device every restored row is in the store
  optimistically, so its screen is right whether or not a single mutation ever
  left the outbox — the same trap E2E-M15-05 and E2E-FLOW-05 are built around.
  A device that has only ever talked to the server can see nothing the server
  was not told, and it is the only witness that says the migration happened.
  Mutation-proved: with `drainAfterImport` removed from `commitPortableRestore`
  the third device's trip row is gone and the case reddens.
- **The arrow `local`→`server` does not exist in the app.** `jitpack_mode` is
  written in exactly one place — M19's first-launch choice (`App.vue`) — and
  M17 only *states* which mode this is; there is no control anywhere that
  leaves Local Mode. FR-19.1 says the move "goes through the explicit
  migration path of FR-19.5, never through a toggle", which reads as a
  restriction and is in fact the entire implementation. The case therefore
  models the migration the way a user can actually perform it: the file plus a
  device that is already in server mode (a second device, or a reinstall).
  **Ruled 2026-09-02 (owner): M17 grows the three-step move** — FR-19.8,
  ADR-045, E2E-M17-14/14b/14c. The switch is a function of two device-local
  stamps (the last backup, the last Local Mode write), so it cannot happen
  before a backup that covers the device; a bar in the FR-19.7 shape carries
  the restore after the reload. This case keeps the third-device assertion,
  which is still the only witness that a restore reached the server.
- **The defect it found: a restore pushed the master partition and nothing
  else.** `commitPortableRestore` called `drainAfterImport(null)`, whose trip
  half is reached only with a trip id — the single-document import's — so every
  packing list in the file stayed queued on the importing device, whose own
  screen looked exactly like a migration that had worked. It passed locally and
  failed on CI, which is the honest shape of it: the rows travelled only if the
  device happened to do something else that drained their partition. Fixed by
  draining the partition of every trip the file brought; driven by a unit in
  `composables/__tests__/portableImport.spec.ts` (red without the fix).
- **G-2 `synced` does not mean the outbox is empty.** `state` is computed from
  the connection and whether a push is in flight, and never from
  `pendingCount` — so the indicator said *Synced* over a whole queued trip
  partition. The case therefore reads the sheet's queue line and asserts it is
  absent, which is both the honest assertion and the settled signal the third
  device needs before it looks.


## E2E-FLOW-09 — the world that could not falsify its own clause (2026-08-31)

FLOW-09 is the last of the §5 flows, and the one whose *steps* were all covered while its
**loop** was not: M3 generates from a composition, the trip learns something, M21 folds that
back into the groups, and next year's M3 run has to arrive at the full learned set. Seven steps,
one case, and nothing in the suite had ever gone round.

Two clauses were corrected against the app before a line was written, and neither is a defect:

- **`single` → `local`.** Generation, recognition, the fold-back plan and the FR-27.4 question
  all run client-side (invariant 4), and the flow has one device — a backend would add a
  partition to pull and not one rule to this chain. Local is also the stricter run.
- **"the fold-back appears as an *applied change* on a planning trip"** describes the model
  FR-27.4 had until 2026-08-18. It arrives as a *question*, and E2E-M21-03c has asserted that
  since M21 shipped. The same sentence had already been corrected once on E2E-M8-05.

**The finding is the world, not the screen.** The clause with no assertion anywhere was the
other half of that sentence — *the archived source trip stays untouched* — which
E2E-M21-02's own comment has stated since M21 shipped ("a past trip is never asked to follow
along") with nothing behind it. Written the obvious way it is **green and unfalsifiable**:
deleting the archived guard from `followsGroups` left the case passing. The reason is in the
setup rather than in the rule — the fold-back makes the group match the harvested trip, so
that trip has nothing to be offered *whatever* `followsGroups` answers, and the absence being
asserted was the absence of a change that does not exist.

The fix is a change **neither** trip carries: the group grows a position after the fold-back,
the still-planning trip is asked about it, and the archived one is not. With that world the
mutation turns the case red on exactly that line (`Expected: 0, Received: 1`), and the rule is
the only thing separating the two trips.

**The transferable rule: for an absence, the positive signal has to be the *same event* reaching
somewhere else.** A rendered page and a sibling assertion are not enough on their own — this
draft had both — if the event being asserted about never happened in that world. The check that
finds it is the one E2E-M12-01 produced in a different costume: *would this assertion have
passed before the rule existed?*

Two smaller things the round trip is the only case that can say: M21 recognises **both** groups
of a composition from provenance alone (the shared camera can point at only one of them, so
Wildlife is recognised through the telephoto), and the harvested Vorlage *references* the
groups rather than copying them — proved by a position added to a group **after** the Vorlage
was written arriving in next year's generation anyway.

## The NFR journeys — five modes read off the wrong thing (2026-09-01)

§6's seven non-functional journeys are the last cross-cutting rows of backlog
item 6. One (NFR-04) was already carried by E2E-FLOW-08; the other six were
read clause by clause against the app, and the pass produced five cases plus
a correction to nearly every sentence in the table.

**The recurring error was the mode.** Four of the seven entries named a mode
that cannot exercise the promise, and each was wrong the same way: the mode was
read off *the screen the case would use* rather than off *the request the case
has to make*.

- NFR-05 (export) said `single`. M17's data section exists in all three modes,
  but the promise is about `downloadExport` and its auth header, and in
  `single` there is no token to send. It is `server`, and E2E-M17-03 — the case
  that already drives it — had had exactly this correction applied to it during
  the M17 audit. The catalogue kept the old answer for its own copy of the same
  sentence.
- NFR-07 (import) said `single`. The wizard is client-side by invariant 4, so
  the assertion is about the device, not the instance: `local`.
- NFR-01 said `single/local` and was in practice only ever `single`.

**Two sentences described something unbuildable or unbuilt, and both narrow
rather than grow a test.** NFR-02 asked for the instance to boot "with no IdP
reachable (no OIDC env, network to any IdP blocked)" — but a Single-User
instance names no issuer, so there is no host to block and a route rule would
assert against a request the app never makes. The clause is struck; the 501 on
`/auth/config` is the whole assertable promise, and E2E-M19-02 already renders
it. NFR-07's "imports are transactional" is an approximation the NFR itself
admits to (validate in full, then enqueue; nothing rolls back), so the case
asserts the clause that *is* built.

**The finding worth carrying is NFR-06's**: the M17 push toggle had **no
`data-testid`** — by now a reliable signature that no test has ever operated a
control. Web Push had coverage at both ends and none in between: the browser
dance is unit-covered with a fake PushManager, and delivery is
`internal/api/push_test.go` signing against a fake push service. What neither
could establish is that the subscription produced by the first reaches the
instance the second reads from. E2E-NFR-06 replaces the push *service* only —
`subscribe()` would otherwise have to reach an endpoint no CI run can — grants
the notification permission for real, and asserts the server's own answer on
the owner-scoped route. Removing `api.registerSubscription(...)` from
`registerPush` turns it red.

**Three more notes from writing them:**

- **E2E-NFR-01 had to prove its own premise.** A case that flips
  `setOffline(true)` and then drives the app proves nothing unless the network
  really is the thing that is gone; dropping the service-worker wait makes it
  fail on the first navigation, which is the evidence that the flag bites.
- **E2E-NFR-03 asserts a call, not a pixel.** The three rendered states of the
  storage block were already unit-covered, and all three look the same whether
  the app asked for persistence and lost or never asked. The stub counts the
  asks, which is the only place that clause can live.
- **E2E-NFR-07 follows the FLOW-09 rule.** Its first half is an absence — the
  device is untouched behind a blocked mapping — and it is worth something only
  because the second half commits the identical sheet through the answered
  gate, with the same locators. The locators are proven by the half that
  expects them to resolve.

**E2E-G2-13/14 and E2E-FLOW-01b — the socket that died was never dialled again, added
2026-09-01.** Found by using the app, like E2E-SYNC-01: two people packing one trip on the
family instance, and only one direction arriving. The nginx capture of the repro showed the
receiving device making *no request at all* after the other's write and holding *no*
WebSocket — the nightly backup had restarted the backend under its tab, and the client's
whole handling of a closed socket was `socket = null`. Sync-API P-1 had promised a reconnect
since v1.0 and §9 a client ping; neither was built, on either side.

Three things worth keeping from writing the cases:

- **The subscription signal is read off the route, not off `page.on('websocket')`.**
  Whether Playwright reports a routed socket through that event is not something the case
  should depend on; the presence frame passes through the route's server side anyway
  (`cuttableSocket` in `single/server-sync.spec.ts`), which is `watchSubscribed`'s signal
  from the other end of the wire.
- **A routed socket that is not connected to the server *opens* for the page** — that is
  what mocking is for — so "refuse the dial" cannot be "do nothing in the handler": the
  client would see `onopen`, report itself live and run its catch-up. Refusing is
  `ws.close()` inside the handler, before the page side ever opens, which the client sees
  as a failed dial exactly as it would a proxy that is restarting.
- **The gap is held open on purpose while the other device packs.** With a redial allowed
  straight away, the row could arrive through a live `trip.changed` and the case would be
  green against a client that pulls nothing on reconnect. Refusing every redial until the
  pack has happened is what makes the catch-up pull the only path — and E2E-G2-14 then
  keeps refusing *through* the assertion, so the socket is provably not the reason the
  row arrived.

E2E-FLOW-01b is the same defect stated as the user states it: E2E-FLOW-01 packs on the
owner's device and reads the member's, and a year of green runs said nothing about the
other direction, which is the one that broke.


## Two files, one account, two workers (2026-09-02)

The `e2e-server` job went red twice on a Dependabot PR that changed one Vue
patch version, and green on the same tree a third time. Not the patch: **two
defects that only meet under a particular scheduling**, which is what made it
look like a flake.

**The first is in the fixture.** `carol` was added on 2026-08-30 with one
stated job — to be administered by the M20 cases, so that deactivating an
account would not reach sideways into `multi-user.spec.ts`'s trips. Two days
later E2E-M17-01 needed an account whose notification preference it could
switch without breaking Bob's cases, and took Carol *because* she was the
spare — its comment says she "exists for exactly this kind of reach-across",
the original reason turned on its head. The `server` project runs its files
on two workers, so when `admin.spec.ts` and `multi-user.spec.ts` overlap,
E2E-M20-02's *Deactivate* ends Carol's session under E2E-M17-01 (her socket
dies — the `webSocket.waitForEvent: Socket error` in the first red run), and
every later `loginAs(…, 'carol')` is refused with the FR-23.3 sentence until
M20-02 reaches its *Reactivate* step — which, on the failing run, it never
did. That is the cascade: one red case, then three more at the login, each
one's error-context snapshot showing *„This account is deactivated"*.

The rule the fixture now states in `mockIdp.mjs`: **an account a file
*changes* is logged in by that file alone.** `dave` is the fourth account and
belongs to `admin.spec.ts`; Carol is E2E-M17-01's. Nothing about what the
cases assert changed.

**The second is in the app, and it is why M20-02 itself failed first.** The
case reloads the deactivated account's page and expects the login. What it
got was the dashboard with the G-2 glyph on *Offline*. `App.vue` attached
its `AUTH_EXPIRED_EVENT` listener inside `onMounted`, after two awaited
fetches — and M1's `onMounted` runs *before* App's (children mount first)
and sends `me`, the first authed request. When that 403 came back before
App's second fetch had, `endSession()` cleared the tokens and dispatched an
event nobody was listening to; the boot then went on without a token, every
request failed as if the network were gone, and the screen said so. Which of
two round trips lands first is not a property a test can pin, so the seam is
`onSessionEnded` in `auth/refresh.ts`: a latch that hands the end to a
handler attached after the fact, plus App attaching in setup. The unit case
is the ordering the screen could not fix — *a handler attached after the
session ended is still reached* — and it is red without the latch.

Worth carrying: **a job that is red on a dependency bump and green on
`main` is not evidence about the bump** when the job is scheduled on two
workers. The green `main` runs had the same two defects; the bump's runs
were the first to hit the overlap twice in a row.

## E2E-M5-12 — the flake was a second mount (2026-09-05)

The ledger's 2026-08-31 measurement left E2E-M5-12 with a captured cause it could not reproduce — two unhidden M4 pages,
fifteen green local runs — and a fixture (`oneLivePage`) to make the next occurrence name itself. It occurred three more
times in a day: twice on #374, once on `main` at `9561ec69`, always this case, always the same line, never on an idle
machine (eight more green runs here). What closed it was not a run but a read of `@ionic/vue-router`'s
`findViewItemByPath`: a parameterised record matches an existing page only on an identical pathname, so the item's alias
path was a second page to Ionic on every open — the router's comment had claimed the opposite, and every document after
it repeated the comment. ADR-046 moves the item into the query.

Three things worth carrying:

* **A load-only failure on the same line each time is a window, not noise; ask what sits in it.** Here the window was
  the outlet's `commit()` waiting for the entering page's Ionic children to be ready, during which both pages were
  unhidden — a few frames idle, over five seconds on a loaded runner. The fix is not to wait longer but to assert the
  thing whose *width* the load was varying: the page showing the panel is the same element that showed the list. A
  second mount is a different element however fast it settles, so the case now goes red on an idle machine too, and the
  mutation (`:key` on the page, a remount on open) proved it.
* **My first hypothesis did not reproduce, and the source did.** A two-second poll straight after the click saw one page
  eight times out of eight; the transition-window story was wrong in its mechanism and right only in its symptom. A
  comment that asserts a framework property ("Ionic keeps a page per matched record, an alias only changes the params")
  is an unverified claim until the framework's function is read — the same lesson as the `hydrated`-is-not-ready pair of
  pull request 372.
* **E2E-M4-45 is the case that catches the remount by its cost.** It was written for the scroll memory that compensated
  the remount; with the remount gone the memory is deleted and the case keeps the promise it was repairing, now without
  a signal to wait on. The mutation reddens it at offset 0 — which is what the screen showed every user for three weeks
  before the memory, and what it would show again the day someone reintroduces a path.
