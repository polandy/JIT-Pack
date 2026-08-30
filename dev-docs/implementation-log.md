# Implementation log

What has been built, in the order it was built, with the reasoning decided
along the way. This is **history**: append to it, don't restructure it.

`CLAUDE.md` is the orientation document — what the project is, where things
live, and the invariants that must hold. It deliberately no longer carries this
log, because a file that grows with every shipped feature stops working as the
thing you read first. If something recorded here is still load-bearing for
_future_ work, it belongs in `CLAUDE.md`'s invariants or in an ADR as well —
this log alone is not where a binding rule should live.

## What earns an entry

The log is now large enough that writing everything makes it unreadable, so an
entry has to earn its place. **If the diff and the commit message tell the same
story, don't write one** — the code is a better account of what was built than a
paragraph restating it, and it cannot drift.

Write the entry when the work produced something the code cannot show:

- an **option that was weighed and rejected**, and what it cost to reject it —
  otherwise the next person reopens a settled question;
- a **premise that turned out to be wrong** — a diff shows the fix, never the
  belief that made the bug possible;
- a **cost knowingly accepted** — an unrecorded deliberate regression reads as a
  defect and gets "fixed";
- a **trap with a price attached** — the measurement, the framework behaviour, the
  ordering that has to hold;
- **who decided what, and on what evidence** — owner calls, rendered variant
  rounds, measurements.

An ADR is the better home when the tradeoff is _load-bearing for future work_
(`adr/README.md` decides); the log holds the narrative around it. New entries go
at the bottom, and **get a line in the index below** — `scripts/log-index-gate.mjs`
(`make ci`, CI client job) fails the build for a section the index does not name,
because the index is read _instead of_ this file and an unlisted section is
unreachable.

## Index

One line per section, so this file can be scanned before any of it is read.
Newest at the bottom; the parenthesised note says what you would come looking for.

- [Current state](#current-state) — **stale by design**: a July snapshot of what existed, kept as history. `CLAUDE.md` is the current orientation; do not trust this section's CI, migration or branch-protection claims.
- [Deviations](#deviations) — D-001 (CGO SQLite) resolved; none open since.
- [Concept phase, 2026-08-07/08 — the packing MVP](#concept-phase-2026-08-0708--the-packing-mvp) — the bounding of an open-ended concept phase, and the reasoning behind every "Not built yet" item.
- [MVP scope (owner decision, 2026-08-07)](#mvp-scope-owner-decision-2026-08-07) — what was cut to make the MVP finite; why FR-1.3/1.5 formulas and FR-1.6 fork/publish went.
- [Basics audit, 2026-08-08 — one toolchain](#basics-audit-2026-08-08--one-toolchain) — audit-and-harden rather than rework; why the toolchain had to be pinned before anything else.
- [Basics audit, 2026-08-08 — FR-23.1 required an unverified claim](#basics-audit-2026-08-08--fr-231-required-an-unverified-claim) — a live privilege-escalation path: admin re-derived per request from a claim the client controlled.
- [Basics audit, 2026-08-08 — first-party sessions (ADR-007)](#basics-audit-2026-08-08--first-party-sessions-adr-007) — Authelia is the reference IdP; why passing the IdP token set through was wrong at the root.
- [Basics audit, 2026-08-09 — failure-path coverage](#basics-audit-2026-08-09--failure-path-coverage) — green gates hid uncovered _rejection_ branches; coverage total ≠ coverage of the rules.
- [Basics audit, 2026-08-09 — supply-chain pinning (NFR-4.3 / invariant 8)](#basics-audit-2026-08-09--supply-chain-pinning-nfr-43--invariant-8) — the docs restructure had opened an unpinned surface nobody was watching.
- [M19: the server URL arrives pre-filled (FR-19.1)](#m19-the-server-url-arrives-pre-filled-fr-191) — found by deploying, not by reading: first launch demanded an address the app already knew.
- [Migrations 018/019: the two schema debts the concept left open (FR-25.9, FR-25.19)](#migrations-018019-the-two-schema-debts-the-concept-left-open-fr-259-fr-2519) — why `packed_by` and `packer` are two columns; the owner's "pragmatic, still in development" steer.
- [Brand mark: Check-Latch → Packed Backpack (2026-08-12)](#brand-mark-check-latch--packed-backpack-2026-08-12) — six directions rendered; why the first mark was rejected.
- [Navigation: the back button that was built but unreachable (ADR-011)](#navigation-the-back-button-that-was-built-but-unreachable-adr-011) — seventeen headers, none of them the one on screen; measured rather than read off the stylesheet.
- [One header bar, built (ADR-011)](#one-header-bar-built-adr-011) — the single `ion-header` in `App.vue` and what the per-screen headers cost.
- [A pre-existing Ionic transition error, found by asserting for it](#a-pre-existing-ionic-transition-error-found-by-asserting-for-it) — a known, deliberately open Ionic `classList` throw on outlet-back; don't re-diagnose it.
- [M4, built from the mock](#m4-built-from-the-mock) — the first screen rebuild and the shape the rest follow.
- [What hand-testing M4 turned up — and why the suite had not](#what-hand-testing-m4-turned-up--and-why-the-suite-had-not) — four navigation defects two green suites missed; the origin of the "running Playwright case" rule.
- [The filter panel, reworked from mockups](#the-filter-panel-reworked-from-mockups) — filters bite on tap, no apply button; why the sheet needed a plane of its own.
- [The list's own hierarchy](#the-lists-own-hierarchy) — the parent category rendered smaller than its children; hierarchy is a type decision.
- [A trip needs a year, not a date (FR-2.1b)](#a-trip-needs-a-year-not-a-date-fr-21b) — owner call: only the year is required, current year preselected.
- [Trip creation, folded (FR-2.1c)](#trip-creation-folded-fr-21c) — optional parameters recede rather than disappear.
- [Default travellers (FR-2.5a)](#default-travellers-fr-25a) — configurable, prefilled in the wizard, still editable there.
- [M5, rebuilt as a sheet](#m5-rebuilt-as-a-sheet) — the concept was never the problem; the sheet over the list, and the scroll-position cost it carries (ADR-012).
- [Post-#73 review remediation (2026-08-14)](#post-73-review-remediation-2026-08-14) — a single failed IndexedDB write silenced the session; two review claims that did not survive checking.
- [The app gets its own two faces (FR-21.5/21.6, G-13)](#the-app-gets-its-own-two-faces-fr-215216-g-13) — the client declared **no** `font-family` at all; one file that touches every view.
- [The three colour anchors (FR-21.7, G-11)](#the-three-colour-anchors-fr-217-g-11) — the palette was never the problem, the roles were; why `--ion-color-primary` stays blue.
- [Surfaces: three planes, a radius scale, and a gate (FR-21.8, G-14, invariant 9b)](#2026-08-14--surfaces-three-planes-a-radius-scale-and-a-gate-fr-218-g-14-invariant-9b) — the card painted in the page's own colour: a valid token, a passing rule, and no card. Why the gate exists.
- [The type migration: 170 declarations onto the scale (FR-21.5, G-13)](#2026-08-15--the-type-migration-170-declarations-onto-the-scale-fr-215-g-13) — why icons needed their own `--jp-icon-*` table rather than the text scale.
- [The pack-out: a row that leaves, and one undo (FR-25.2)](#2026-08-15--the-pack-out-a-row-that-leaves-and-one-undo-fr-252) — the app's first motion of any kind; two defects the new cases caught.
- [Visual baselines, and the end of the design foundation (ADR-013)](#2026-08-15--visual-baselines-and-the-end-of-the-design-foundation-adr-013) — "looks right" was untestable; the pinned image, and why a bump rewrites every baseline.
- [M7 gets its two scopes (§3.27, FR-27.1/27.6)](#2026-08-15--m7-gets-its-two-scopes-327-fr-271276) — scope had been in the schema for two migrations and no client read it.
- [M7's two open decisions, settled by rendered variants](#2026-08-15--m7s-two-open-decisions-settled-by-rendered-variants) — built as working variants instead of argued in prose; the swipe lost here first.
- [M8 rebuilt: the scope-shaped editor (§3.27, FR-27.2/27.4/27.6/27.7)](#2026-08-15--m8-rebuilt-the-scope-shaped-editor-327-fr-272274276277) — the client could read §3.27's schema but not write it.
- [M9/M10 — the inventory on a tag set (§3.24, 2026-08-16)](#m9m10--the-inventory-on-a-tag-set-324-2026-08-16) — the owner's "we do it with tags", and an explicitly allowed destructive migration.
- [M11 — containers rebuilt on the concept round (FR-10.1–10.3, 2026-08-16)](#m11--containers-rebuilt-on-the-concept-round-fr-101103-2026-08-16) — a screen rejected in concept without ever having been rendered.
- [Browser back with the M5 sheet open (Navigation Concept §7 case 4, 2026-08-16)](#browser-back-with-the-m5-sheet-open-navigation-concept-7-case-4-2026-08-16) — the sheet _replaces_ its history entry on purpose; `overlayBackGuard.ts` is the fix.
- [M11 joins the visual baselines, and the image gets a platform (2026-08-16)](#m11-joins-the-visual-baselines-and-the-image-gets-a-platform-2026-08-16) — which screens earn a baseline, and on what argument.
- [What "covered by e2e" was not covering (2026-08-16)](#what-covered-by-e2e-was-not-covering-2026-08-16) — all test ids present and green, three real gaps anyway; why `e2e-tests.md` is a ledger.
- [M12 — analytics rebuilt on the concept round (FR-8.1/8.2/14.3, 2026-08-16)](#m12--analytics-rebuilt-on-the-concept-round-fr-8182143-2026-08-16) — the slice tap filters rather than groups; the honest unweighted bucket.
- [M14 — review assistant rebuilt on the concept round (FR-9.2/27.11, 2026-08-16)](#m14--review-assistant-rebuilt-on-the-concept-round-fr-922711-2026-08-16) — "the dominant template" replaced by group-aware retargeting.
- [§3.27 generation: composed templates actually reach the packing list (2026-08-16)](#327-generation-composed-templates-actually-reach-the-packing-list-2026-08-16-pr-pending) — include order is **derived, not inherited from storage**; the rows arrive unordered and provenance depends on it.
- [FR-27.12: a group stops being a name with a number (2026-08-16)](#fr-2712-a-group-stops-being-a-name-with-a-number-2026-08-16-pr-pending) — the variant round the unfolding row lost, because it solves M3 only.
- [The dev seed grows a master partition (2026-08-16)](#the-dev-seed-grows-a-master-partition-2026-08-16) — the standing rule that new master-data features extend the seed.
- [Plain HTTP could not write at all (2026-08-16)](#plain-http-could-not-write-at-all-2026-08-16) — one line, everywhere: a browser API that silently needs a secure context. Found on an iPad, not in CI.
- [The dev-only surfaces were not dev-only (2026-08-16)](#the-dev-only-surfaces-were-not-dev-only-2026-08-16) — the doc, the comment and CLAUDE.md all repeated a claim that was false; a `v-if` ships the code.
- [FR-27.14: the footer stops being the whole answer (2026-08-17)](#fr-2714-the-footer-stops-being-the-whole-answer-2026-08-17) — a count answers _how many_ and never _what_.
- [The ＋ answers where it is (2026-08-17)](#the--answers-where-it-is-2026-08-17) — the FAB follows the scope instead of asking.
- [The sheet header's two round controls (2026-08-16, FR-25.15 / G-14)](#the-sheet-headers-two-round-controls-2026-08-16-fr-2515--g-14) — 26 px against 34 px, measured from a render rather than guessed.
- [§3.28: the packing row gets a mark, decided on pixels (2026-08-17, spec only)](#328-the-packing-row-gets-a-mark-decided-on-pixels-2026-08-17-spec-only) — the icon library lost **on the pixels**, not on the argument. Don't reopen the round.
- [G-2's detail, and the Local Mode backup behind it (2026-08-17, FR-19.6/NFR-4.11)](#g-2s-detail-and-the-local-mode-backup-behind-it-2026-08-17-fr-196nfr-411) — that the glyph had to be asked about was the defect (ADR-015).
- [FR-2.6 variant A: the review step reviews (2026-08-17)](#fr-26-variant-a-the-review-step-reviews-2026-08-17) — dropping a row is FR-5.5 _skipped_, never deletion; nothing may become wizard-only.
- [Coverage audit of 2026-08-17's merged PRs — the two gaps it found](#coverage-audit-of-2026-08-17s-merged-prs--the-two-gaps-it-found) — `commitRestore` ran silently into nothing; a feature only half in the diff marked ✅.
- [The review step that let both gaps through, and what changed in it](#the-review-step-that-let-both-gaps-through-and-what-changed-in-it) — process, not code: the origin of `/pr-review`'s §4.0 changed-file → driving-test table.
- [The restore landing (owner call, 2026-08-17)](#the-restore-landing-owner-call-2026-08-17) — a restore landed on a tab that hid everything it had just written.
- [FR-5.5 — "bewusst nicht einpacken" gets a control (2026-08-18)](#fr-55--bewusst-nicht-einpacken-gets-a-control-2026-08-18) — two of the backlog note's three premises were wrong; the swipe was removed rather than repaired.
- [FR-27.4: a planned trip follows the groups it was made from](#2026-08-18--fr-274-a-planned-trip-follows-the-groups-it-was-made-from) — ADR-016: a ledger, not a snapshot column; "not loaded ≠ empty".
- [The §4a pass that came with it](#the-4a-pass-that-came-with-it) — the owner stopped the PR twice on the same literal; how CODING_PRINCIPLES §4a came to exist.
- [FR-27.4, revised the day after it landed: the group _asks_](#fr-274-revised-the-day-after-it-landed-the-group-asks-2026-08-18) — declining = advancing the snapshot, which is why there is no pending state to sync.
- [FR-27.3 — single items in M3 (2026-08-18)](#fr-273--single-items-in-m3-2026-08-18) — they resolve _after_ the composition; that ordering is what makes "already included" decidable.
- [Portable YAML learns the composition (2026-08-18, ADR-017)](#portable-yaml-learns-the-composition-2026-08-18-adr-017) — a shared file used to import a Vorlage that resolved to nothing.
- [The identity rule was half a rule (2026-08-18, ADR-017)](#the-identity-rule-was-half-a-rule-2026-08-18-adr-017) — identity belongs to the group, not to where a file happens to list it.
- [The Go test suite spent 96 % of its time replaying migrations](#the-go-test-suite-spent-96--of-its-time-replaying-migrations) — measured per package, not guessed; the pre-migrated template.
- [The development phase drops DDL migrations (2026-08-19, ADR-018)](#the-development-phase-drops-ddl-migrations-2026-08-19-adr-018) — owner decision _against_ the recommendation on the desk, and what the recommendation was actually about.
- [The e2e job moves into the pinned Playwright image and shards (2026-08-19)](#the-e2e-job-moves-into-the-pinned-playwright-image-and-shards-2026-08-19) — 1124 s of a 29-minute job was `playwright install --with-deps`.
- [The e2e job loses its gate and gains two shards (2026-08-19)](#the-e2e-job-loses-its-gate-and-gains-two-shards-2026-08-19) — the whole pipeline was one path; every other job finished under 90 s.
- [FR-27.10 — a whole group onto a trip that already exists (2026-08-19)](#fr-2710--a-whole-group-onto-a-trip-that-already-exists-2026-08-19) — dedup by master item _and_ by name, so a hand-typed row is recognised. Six review findings.
- [M21 — Vorlage aus Reise (FR-27.5), 2026-08-19](#m21--vorlage-aus-reise-fr-275-2026-08-19) — needed a lifecycle step nobody had built; only a _Gruppe_ can be recognised; a fuzzy match without a confirmation step.
- [M4's trip name leaves the app bar (2026-08-19)](#m4s-trip-name-leaves-the-app-bar-2026-08-19) — width decides where a title lives; the visual-gate tolerance stays 0.002 (owner call).
- [M14's positive tests, and the flag nobody could set (2026-08-20)](#m14s-positive-tests-and-the-flag-nobody-could-set-2026-08-20) — _unused_ had no writer anywhere in the app, and an ordinary M5 edit erased `source_template_id`.
- [M4 comes back where it was left, and the header line stops flipping (2026-08-21)](#m4-comes-back-where-it-was-left-and-the-header-line-stops-flipping-2026-08-21) — a `<script setup>` top-level binding is per _instance_; a scroll position on M4 is an offset _and_ a header state; the collapsing line fed its own layout change back as a user scroll. Closes E2E-M12-03's positive half too.
- [A build image's major is a toolchain version, and a gate says so (2026-08-21)](#a-build-images-major-is-a-toolchain-version-and-a-gate-says-so-2026-08-21) — a Node major merged green because no check builds anything with that image.
- [Dependabot skips the Node majors that can never be taken (2026-08-21)](#dependabot-skips-the-node-majors-that-can-never-be-taken-2026-08-21) — odd Node majors never reach LTS; Dependabot only ever offers the newest, so from October 2026 it would chase 27 past the 26 that becomes LTS. Bundler syntax, because that is what the docker ecosystem parses.
- [The sync outbox survives a reload (2026-08-21)](#the-sync-outbox-survives-a-reload-2026-08-21) — MVP Track C / blocker B2: the queue moved to IndexedDB and is replayed before the first pull. Replay safety is the server's `mutation_id` memo, not the merge algorithm; a permanently refused mutation is parked so it cannot wedge a partition.
- [The device backup carries the FR-27.4 refresh state (2026-08-21)](#the-device-backup-carries-the-fr-274-refresh-state-2026-08-21-mvp-track-f) — a restored device kept everything visible and forgot every answer it had given its groups; the restore re-keys by identity, not by name, because a renamed row is exactly the row the user has made theirs.
- [A trip stops being frozen (FR-2.7 / M22, 2026-08-21)](#a-trip-stops-being-frozen-fr-27--m22-2026-08-21) — the consequence rule already existed in FR-27.4 and refresh.ts, so the new module was deleted; two defects only a render could see; the sibling e2e was green for the wrong reason three times.
- [The chevron learns where it came from (2026-08-21)](#the-chevron-learns-where-it-came-from-2026-08-21) — the gear inside a trip went back to the dashboard: a gap in ADR-011's route table, not a bug under it. §7 had promised the flows mechanism for months and nothing implemented it; the new e2e case was false-green because `toHaveURL` matched the _query's_ tail.
- [A refusing control is worse than an absent one (2026-08-21)](#a-refusing-control-is-worse-than-an-absent-one-2026-08-21) — M22's ✕ shipped present-but-disabled on a written-down argument; the owner overruled it in the hand. The e2e prefix locator also counted the explanation as a button.
- [M17 was the last screen, and the trap was a constant (2026-08-22)](#m17-was-the-last-screen-and-the-trap-was-a-constant-2026-08-22) — finished text in a module-level constant is evaluated once at import, so no language switch reaches it; the section it hid in is unreachable by either Playwright project, so it is covered by a component test or not at all.
- [The i18n migration, closed except for M15 and M17 (2026-08-21)](#the-i18n-migration-closed-except-for-m15-and-m17-2026-08-21) — NFR-4.12: a nav anchor and a route title stored finished English text, so no language choice could reach the chrome; what is on the catalogue now and what is not.
- [The composer offers chips before it asks for typing (2026-08-21)](#the-composer-offers-chips-before-it-asks-for-typing-2026-08-21) — FR-25.13c decided on a rendered three-way round (ADR-020): chips now, browse-sheet as FR-25.13d, tag tiles rejected; the autofocus removal is the accepted cost, and two e2e case numbers were already taken by specs not yet built.
- [The composer's second posture: the browse-sheet (2026-08-22)](#the-composers-second-posture-the-browse-sheet-2026-08-22) — FR-25.13d: _Erfassen_/_Zusammenstellen_ landed at zero rollout cost because the sheet lives inside the shared composer; „schon drin" is derived feedback, not bookkeeping; focusing after a modal loses to Ionic's teardown; M6 excludes the trip's whole contents; the E2E-M8-21 collision paid by renumbering FR-27.15's case to M8-23.
- [FR-27.15: the editor learns to recognise its own duplicates (2026-08-22)](#fr-2715-the-editor-learns-to-recognise-its-own-duplicates-2026-08-22) — the FR’s stated sentence named the quantity, and following it literally would have let the fold turn a per-person position trip-global in silence; the dismissal is keyed to the item set because that is what makes „has it changed“ decidable without a schema; `ion-modal` never leaves the DOM, and an `Escape` assertion that passes before the sheet has presented leaves a live overlay eating the next tap.
- [The i18n gap that was a measurement error (2026-08-22)](#the-i18n-gap-that-was-a-measurement-error-2026-08-22) — `vue-tsc --noEmit` on a solution-style tsconfig checks nothing and exits 0, which is where the belief came from that a wrong `MessageKey` in a template ships silently; `strictTemplates` measured at 1104 errors; the real gap was the avatar crop modal, which no Playwright project can open.
- [§3.28: the mark gets built (2026-08-22, FR-28.1–28.11, ADR-021)](#328-the-mark-gets-built-2026-08-22-fr-2812811-adr-021) — the self-hosted face is about _agreement_ (🧥 is a trench coat here and a peacoat on both platforms), not availability; the substring rule was unproven until „Reise" turned up an ice cube; the seed may only speak the index's vocabulary; and a master-item edit had been silently dropping the reference photo in Local Mode.
- [The trip partition was never confined to its trip (2026-08-22)](#the-trip-partition-was-never-confined-to-its-trip-2026-08-22) — membership was checked for the endpoint's trip while every statement addressed its row by primary key, so any member of any trip could read, rewrite, delete and seed every other trip's rows; the master partition had carried the equivalent check since its first day, which is why nothing looked missing.
- [Two halves of one refusal path (2026-08-22)](#two-halves-of-one-refusal-path-2026-08-22) — the trip partition answered 500 where the master answered `rejected`, and a 5xx is the one status the outbox retries, so one bad row wedged a partition forever; the client meanwhile read a `status` key no server has ever sent, which made the whole parked surface dead code that its own fakes kept green.
- [The pull cursor came out of the push (2026-08-22)](#the-pull-cursor-came-out-of-the-push-2026-08-22) — the client took `pull_hint.next_cursor` as its pull cursor, stepping permanently over everything another device wrote while it was away; the e2e case that should have caught it was green against the defect, because three overlapping drains repair the skip by accident, so the assertion moved from the screen to the wire.
- [An optimistic row is a whole row (2026-08-22)](#an-optimistic-row-is-a-whole-row-2026-08-22) — a partial upsert's fields were applied as the optimistic row, which a store applies by replacing what it holds: saving a trip's name dropped its `status` and took the trip off M2 for good in Local Mode; two of the three lost fields had tests that said otherwise, one of them green only because the seeded year was the current one.
- [The conflict log had two partitions and one query (2026-08-22)](#the-conflict-log-had-two-partitions-and-one-query-2026-08-22) — NFR-4.2a's audit filtered on `trip_id`, so every master-partition loser was written and read by nothing; the case that makes it matter is `trips`, whose own fields merge there, and the sheet's helpful-sounding hint was what hid it.
- [`merged` was a quieter `applied` (2026-08-22)](#merged-was-a-quieter-applied-2026-08-22) — the push response's `conflicts[]` was read by no code path, so a mutation that lost a field left the queue exactly like one that applied; one toast per push (never per conflict) plus a standing line in the G-2 sheet, and the e2e assertion had to move because it was racing the toast's own dismissal timer.
- [A claim had no way out (2026-08-23)](#a-claim-had-no-way-out-2026-08-23) — a G-3 claim could only end by packing or by ageing out, and the device holding a row is the one device that sees no padlock; releasing derives the state from the packed count rather than remembering it, and an expired claim never leaves the data, so it had to start saying so.
- [The revert was already half-built, in a column nobody used (2026-08-22)](#the-revert-was-already-half-built-in-a-column-nobody-used-2026-08-22) — NFR-4.2a's second verb, built as a new mutation rather than an undo (ADR-022); the schema change the work was budgeted for did not exist, and a single-connection pool turned an obvious visibility check into a deadlock against itself.
- [M10 was not done, and the test said it was (2026-08-22)](#m10-was-not-done-and-the-test-said-it-was-2026-08-22) — the i18n migration reported itself complete while the half of M10 that only exists after the save was still English; the e2e case guarding it asserted the English heading, so translating the screen would have turned it green; the suite's app language is English by design, which makes a catalogue lookup and the literal it replaced indistinguishable; and the e2e run serves the built bundle, so a mutation proof without a rebuild proves nothing.
- [Field-level LWW was row-level, and "packed always wins" was hiding it (2026-08-22)](#field-level-lww-was-row-level-and-packed-always-wins-was-hiding-it-2026-08-22) — the store kept one `updated_hlc` per row where §6 says per field-group, so an offline pack lost to any unrelated later edit; the backlog's "packed beats everything" branch was the compensation for exactly one state, and narrowing it to the spec alone would have kept the fault and dropped the mask; ADR-022 ships a clock per field and the narrow rule together, and the conflict log now names the losing push and its actor.
- [The sheet's glyph rode half a line high (2026-08-23)](#the-sheets-glyph-rode-half-a-line-high-2026-08-23) — an eyeball of the merged conflict-log work found two rendering defects that every gate had passed: a state glyph aligned to a title _block_ whose `h1` carried a 20 px margin nothing asked for, and an empty state that had copied the house pattern without its padding; the review corrected the entry's own first answer — a visual baseline would **not** have caught the offset either, at 591 px against a 0.002 gate, so what let both live is that nothing measured them.
- [The lock stopped at the row (2026-08-22)](#the-lock-stopped-at-the-row-2026-08-22) — G-3's padlock was on M4's row and nowhere else, so the row you could not pack from the list was fully editable one tap deeper, and the sheet _accepted_ the edit before the next merge threw it away; no screen named the holder; and §7's promised environment variable for the staleness window had never existed as anything but a client constant. What the backlog also asked for — server-side lock enforcement — is what §7 deliberately does not do, and it is left to the owner rather than built.
- [A backup gave back plans instead of history (2026-08-23)](#a-backup-gave-back-plans-instead-of-history-2026-08-23) — the portable file carried neither a trip's status nor an item's tags, so a restore turned archived history into plans and dropped every master item no template also used; the field that made the fix possible is the one that says whether a trip row came from the inventory at all, and the change quietly falsified a _constant_ two screens away.
- [A year is a quantity, and that is why M15 could not find its header (2026-08-23)](#a-year-is-a-quantity-and-that-is-why-m15-could-not-find-its-header-2026-08-23) — the legacy spreadsheet importer wrote no `year`, so a NOT NULL column made the server refuse every trip it imported while the importing device rendered the migration anyway; underneath sat two layout assumptions a real family sheet broke, and the rule for finding the header block had to stop asking about quantities.
- [The store that already agrees with you (2026-08-23)](#the-store-that-already-agrees-with-you-2026-08-23) — three defects in one import path, all of the same shape: the client applies its own write optimistically, the server refuses it, and no screen on the importing device can tell the difference. Found by importing into the real instance instead of a test double, which is a different act from running the suite.
- [Every spec paid for a DOM, and one of them was green for the wrong reason (2026-08-23)](#every-spec-paid-for-a-dom-and-one-of-them-was-green-for-the-wrong-reason-2026-08-23) — the suite built a jsdom window for all 114 spec files when 32 use one, costing ~48 % of its wall-clock; the premise that started the work was itself wrong (a cold-cache run read 252 s where the warm figure is 88 s), and the interesting find is the failure mode of the fix: a missing `@vitest-environment jsdom` is _not_ reliably a red test, because production code that reads a DOM global inside a `try` takes the `catch` instead and the spec passes while exercising the error path.
- [A hidden element is not a small element (2026-08-23)](#a-hidden-element-is-not-a-small-element-2026-08-23) — the toast-on-the-tab-bar fix was three lines; what it cost was two wrong measurements, both from a box of height zero: a `display: none` anchor makes Ionic subtract a whole viewport instead of clearing the bar, and the geometric test that should have caught the defect first failed against a hidden bar at the origin, where _every_ overlap assertion resolves in both directions.
- [The importer nobody called, and the exporter behind it (2026-08-23)](#the-importer-nobody-called-and-the-exporter-behind-it-2026-08-23) — ADR-025. The server had its own reader _and_ writer for the portable format, reachable from no product surface, and both had drifted: the import wrote no change-log entry, so a `curl` import existed in the database and on no screen. Found by rendering, not by testing. The fix was deletion, and the precondition for it was getting the rules out of a 3600-line composable — where ADR-008 had always said they were not.
- [The manual said it, the shipped config did not (2026-08-23)](#the-manual-said-it-the-shipped-config-did-not-2026-08-23) — the sync WebSocket never connected on the `:3000` stack: nginx forwarded `Host $host`, which drops the port, and the handshake's same-origin check compares the browser's port-carrying `Origin` against it. The manual had already written the rule and then broke it in its own copy-paste block, and its verification `curl` sent no `Origin` at all — a check that could not fail. Nothing in Go or Playwright loads an nginx config, so the guard is a gate.
- [The wire was described twice, and the second description was fiction (2026-08-23)](#the-wire-was-described-twice-and-the-second-description-was-fiction-2026-08-23) — NFR-4.14/ADR-026. The envelope was already uniform; what was not a contract was two independent descriptions of one wire, and the mechanism found two more drifted types on its first run. Three things the code cannot show: why both suites were blind (a fake agrees with its author), why the gate generates beside the tree rather than over it, and the trap that a generated file under `client/src` must be prettier-clean or `make fmt` fails the gate on a file nobody edited.
- [A conflict is an overwrite, not a lost race (2026-08-23)](#a-conflict-is-an-overwrite-not-a-lost-race-2026-08-23) — the conflict log had been logging fields nobody overwrote, so it read `2026 → 2026` and offered a revert for it, and the outcome `merged` announced the loss to a user who had none. Two things the code cannot show: it was found by rendering a merged, reviewed feature that no one had looked at, and the fix's real difficulty is that the two values being compared arrive from different type systems — JSON on one side, SQLite on the other.
- [The conflict log was showing the wire (2026-08-24)](#the-conflict-log-was-showing-the-wire-2026-08-24) — the three findings the previous entry left standing, plus one only the render found: the log's values were two uuids either side of an arrow. Two things the code cannot show: which limits are deliberate (a name this device does not know, a column with no word for it) and why the e2e case that "covered" the row was green against every one of these.
- [A route names its scope first (2026-08-24)](#a-route-names-its-scope-first-2026-08-24) — NFR-4.14's third point/ADR-027. Four things the code cannot show: the backlog item's own complaint had gone stale (ADR-025 had already deleted two of the four shapes it named, so it was re-measured before it was acted on), why the sync endpoints were widened into a scope the owner's question did not name, the trap that a router's 404 and a handler's 404 are the same status — which made the first negative test green on the two revert routes for the wrong reason — and the latent defect that typed route builders exposed.
- [The gate protected what the file happened to declare (2026-08-24)](#the-gate-protected-what-the-file-happened-to-declare-2026-08-24) — NFR-4.14's coverage half. Three things the code cannot show: that the rule needed a _check_ rather than eleven more types, that the check has a blind spot which the very handler that motivated it fell into — and how that was closed rather than papered over — and why a request body is allowed to stay a map where a response body is not.
- [A path stopped being written twice (2026-08-24)](#a-path-stopped-being-written-twice-2026-08-24) — NFR-4.14's last half: the routes joined `wire.go` and the client's builders are generated from it. What the code cannot show: why ADR-027's revisit trigger was discharged _before_ the drift it waits for, why the version prefix is deliberately spelled out on every line, why a pin on a generated file is not redundant, and the trap that a generator must emit prettier's own line breaks or the drift gate fails on a file nobody edited.
- [A column everything read and nothing wrote (2026-08-25)](#a-column-everything-read-and-nothing-wrote-2026-08-25) — FR-25.19/E2E-FLOW-02. Three things the code cannot show: how the gap survived four screens and a spec that named it, why the fix was one control rather than a feature, and the test assertion that would have passed with or without the rule it was written for.
- [A trip could be judged only one row at a time (2026-08-24)](#a-trip-could-be-judged-only-one-row-at-a-time-2026-08-24) — FR-9.3/9.4. Three things the code cannot show: how many affordances a "one posture, one question" screen turns out to have once it is rendered, why a handled proposal became a record line rather than a dimmed card, and the control that was replaced twice before it rendered the row rather than itself.
- [A claim stops having a lifetime (2026-08-24)](#a-claim-stops-having-a-lifetime-2026-08-24) — FR-5.7/ADR-028. Four things the code cannot show: why the option that looked like the compromise was the most expensive one, why the takeover is the one lock action with no optimistic write, why it has no reachable Playwright case and will not until a second identity exists, and the two-day-old work that was deleted rather than adapted.
- [A second account arrives, and finds a claim nobody could revoke (2026-08-24)](#a-second-account-arrives-and-finds-a-claim-nobody-could-revoke-2026-08-24) — MVP-plan Track B step 2 / ADR-029: the mock-IdP `server` project. Four things the code cannot show: why a real Authelia was weighed and lost to a 250-line fixture, why the ordering of two processes is a design decision rather than a script detail, the defect the project found on its first run — a takeover that the loser's screen contradicted — and why the identity behind the fix cannot come from the token provider the rest of the client uses.
- [A decade of packed trips, all reading zero (2026-08-25)](#a-decade-of-packed-trips-all-reading-zero-2026-08-25) — FR-2.3/ADR-033: M2 loads the partitions of the rows on screen and says _unknown_ until they arrive. Four things the code cannot show: the option that is free for ever and was turned down anyway, the number that decided between loading everything and loading what is visible, the bug that only rendering could find, and the test that was right to fail in company.
- [A device only ever got the first page (2026-08-25)](#a-device-only-ever-got-the-first-page-2026-08-25) — Sync-API §4: the pull ignored `has_more`. Four things the code cannot show: why every fixture in the suite was too small to catch it, why the obvious second half of the fix — remembering the cursor — made the app _emptier_, why the correct implementation was already in the repo and unused, and what found it in the end.
- [A drain could land on top of a drain (2026-08-25)](#a-drain-could-land-on-top-of-a-drain-2026-08-25) — Sync-API §4: one drain per partition at a time. Three things the code cannot show: why the doubled traffic I thought I had measured was my own eyeball script rebooting the app, why the obvious guard — hand the running drain back to the late caller — silently loses a mutation, and why this only became worth fixing once the pull was paged.
- [The restore could be run twice, and the manual said it could not (2026-08-24)](#the-restore-could-be-run-twice-and-the-manual-said-it-could-not-2026-08-24) — FR-18.4/ADR-030: an imported document is a second copy when its name matches, plus the year for a trip. Five things the code cannot show: the documentation that had described the item rule as if it were the whole rule, why the database constraint that looks like the obvious enforcement is the worst of the four options, why the trips were invisible to a view called `master`, how ADR-017's Vorlage exception was reversed by a measurement rather than an argument, and the cost the family's own data pays for the rule.
- [The clock the client was told to read, and never received (2026-08-25)](#the-clock-the-client-was-told-to-read-and-never-received-2026-08-25) — a data-model review's sync half. Four things the code cannot show: how a rule implemented correctly on both sides never once ran, why a deleted trip's _master_-partition children are the tombstones that matter while its trip-partition ones need none, a review finding that was wrong and how far I built it before opening the citation, and why a connection-scoped pragma is not a schema rule.
- [What a constraint costs when the outbox drops a refusal (2026-08-25)](#what-a-constraint-costs-when-the-outbox-drops-a-refusal-2026-08-25) — the same review's schema half. Four things the code cannot show: why the two-level rule was a two-step formality, the lens every candidate constraint was decided by and the two that failed it, why a per-owner unique name contradicted the FR above it, and the dead schema that was kept on purpose.
- [A refusal that could not be read (2026-08-25)](#a-refusal-that-could-not-be-read-2026-08-25) — Sync-API §5 / FR-9.2. Four things the code cannot show: why the foreign key that started the finding was never the defect, why the reason is asked for instead of read out of the driver's error, why M7 does not pre-empt a delete it cannot judge, and the divergence this PR announces without closing.
- [A purchase that could not be taken back (2026-08-25)](#a-purchase-that-could-not-be-taken-back-2026-08-25) — FR-25.11j, the review's last item. Three things the code cannot show: the column that was weighed and not added, why the reveal declines the persistence FR-25.18 would seem to hand it, and the round trip left open on purpose because the file that closes it belongs to somebody else.
- [A refusal that only announced itself (2026-08-25)](#a-refusal-that-only-announced-itself-2026-08-25) — Sync-API §5 / ADR-031: the divergence the entry above left open. Four things the code cannot show: why a whole-partition resync scored well and still lost, why the insert/update asymmetry turned out to be the server's question and not the client's, the one refusal that must repair nothing, and the repair that came back empty and was only visible in a screenshot.
- [A name that could only be refused by the server (2026-08-25)](#a-name-that-could-only-be-refused-by-the-server-2026-08-25) — FR-1.6 / FR-13.1: the mitigation the constraint owed. Four things the code cannot show: the one surface that could have adopted the existing row and deliberately does not, the rule that was already live for items in a single view, why the return type was the actual work, and how the diacritics question was settled.

- [A delete that could only be refused](#a-delete-that-could-only-be-refused-2026-08-25) — FR-24.3 unparked: the refusal already held the discriminator; why the filtering keeps `itemList` complete; the rule written twice with only one copy allowed to be wrong; the usage endpoint designed and dropped.
- [The restore was free, the name was not](#the-restore-was-free-the-name-was-not-2026-08-25) — FR-24.3 / ADR-034 / M23: the entry above closed by naming restore as owed, and this is the day after. Four things the code cannot show: the promise the FR made that the schema had already broken, why the collision is refused on the _client_ when ADR-032 had just argued the opposite, the surface chosen against three that were rejected, and the defect only a rendered case found — twice, in one test.
- [Two actor columns a client could still name (2026-08-25)](#two-actor-columns-a-client-could-still-name-2026-08-25) — invariant 3 / FR-4.2, FR-5.7. Three things the code cannot show: why an edit may not re-stamp the author it can no longer forge, why the obvious shape of the claim fix would have left every packed row claimed, and the evidence that decided which op a comment is allowed to be born from.
- [A name rule the system's own names could not pass (2026-08-26)](#a-name-rule-the-systems-own-names-could-not-pass-2026-08-26) — FR-17.13's charset rejected the server's seeded "Demo User" and every IdP name with a space or diacritic, and the FR contradicted itself in one sentence; the mid-word gap in M17's traveller label was Chromium rounding glyph runs under the stacked label's `scale(0.75)`, not an i18n defect — measured intact, painted broken; and the G-9/G-12 gear contradiction resolved toward G-9's origin-return amendment.
- [An invariant that lived at eighty-seven call sites (2026-08-25)](#an-invariant-that-lived-at-eighty-seven-call-sites-2026-08-25) — the optimistic `PullChange` gets one builder. Four things the code cannot show: the throwing probe that turned "the table and the id always match the mutation" from a reading into a measurement, the field a hand-built row had been dropping since it was written, why the same duplication had already crossed a module boundary into the FR-18.7 command, and why the twelve ids the cleanup freed are evidence rather than tidying.
- [A field nobody had ever written (2026-08-26)](#a-field-nobody-had-ever-written-2026-08-26) — the four remaining row builders get their completeness cases. Three things the code cannot show: why `duration_days`' absence is correct and `series_name`'s is a defect, that `Trip.series_name` has been `null` on every device since it was typed so FR-14.3's trend heading has only ever named the trip, and why the guard that matters here is a compile error rather than an assertion, and the two holes a 66-run mutation sweep found in the suite itself — a one-field action cannot defend the field it changes, and a fixture equal to its mapper's default is a false green.
- [The orchestrator starts coming apart (2026-08-26)](#the-orchestrator-starts-coming-apart-2026-08-26) — R-4's first cut: the row builders and the container group leave the 3,215-line composable, bound to a `SyncContext` that carries only what a moved group needs. Three things the code cannot show: why the extraction needed its own spec even though the group was already covered through the facade, why the context is grown per group rather than declared up front, and that the file holds **fourteen** row builders where R-3 defended the nine its review had listed.
- [The five builders the list had hidden (2026-08-26)](#the-five-builders-the-list-had-hidden-2026-08-26) — R-3's remainder: `memberRow`, `commentRow`, `todoRow`, `profileRow`, `checklistItemRow`. Three things the code cannot show: that none of the five was actually dropping a column, so what landed is the guard and not a fix; why `commentRow` cannot be read back through the store at all and which two of its columns are therefore unreachable — a hard-coded column is only as defended as the writer that contradicts it; and that the mutation sweep reported all twenty columns undefended because its own red-detection was broken, which is what a sweep measuring itself looks like.
- [Three more groups leave, and the context stops being free (2026-08-27)](#three-more-groups-leave-and-the-context-stops-being-free-2026-08-27) — R-4's second cut: comments/todos, item dependencies, series/destinations and the shared name guards. Three things the code cannot show: why comments and todos are one group and not two, that growing `SyncContext` broke the existing seam spec at compile time and that this is the design working rather than a cost, and why the name guards are shared context rather than one group's private helper.
- [The first group that has to know which mode it is in (2026-08-27)](#the-first-group-that-has-to-know-which-mode-it-is-in-2026-08-27) — R-4's third cut: tags, master items and Vorlagen. Why FR-24.3 makes those three one group, why the item photo stayed behind despite sharing the table, what `SyncContext` grew a `local` field for, and the allowlist that caught a moved read nothing else could see.
- [The seam's queue started applying what it was handed (2026-08-27)](#the-seams-queue-started-applying-what-it-was-handed-2026-08-27) — R-4's fourth cut: the packing group. Why G-3's claim stayed behind, the test double that had to start applying optimistic changes before a two-write group could be tested at all, and the sweep mutation that stayed green because the case only ever passed one of M6's two lists.
- [A group that needed another group (2026-08-27)](#a-group-that-needed-another-group-2026-08-27) — R-4's fifth cut: the FR-27.4 refresh. The first group edge — passed as an argument rather than added to the spine — the two seams the context grew instead of a closure, an alias that turned out to be its own import, and a guard that no test can hold because the domain already applies it.
- [The trip's own life, and a doc comment that had been written twice (2026-08-27)](#the-trips-own-life-and-a-doc-comment-that-had-been-written-twice-2026-08-27) — R-4's sixth cut: the trip after it exists. Why creation stayed behind, the group edge that became a named `deps` object once there were three of them, and the two small repairs a move makes visible — a duplicated doc block sitting on the wrong function, and the status trio comparing its own vocabulary against string literals.
- [The group that runs the other way round (2026-08-27)](#the-group-that-runs-the-other-way-round-2026-08-27) — R-4's seventh cut: M14's proposals and M21's fold. Why those two are one group, the guard that has to refuse *before* the first write, and a test comment that promised more folding than `foldName` does.
- [A test that was red on every first attempt (2026-08-27)](#a-test-that-was-red-on-every-first-attempt-2026-08-27) — the trip whose end preceded its start: what `retries: 1` had been hiding on `main`, why the answer was a bound rather than a validation, and the grid geometry that made the wrong date look like a random one.
- [A menu entry that navigated made the next screen invisible (2026-08-28)](#a-menu-entry-that-navigated-made-the-next-screen-invisible-2026-08-28) — B10's content column and the M4 bar's ⋮. The trap under the second one: an action run from inside an Ionic overlay's own handler races the teardown that clears `aria-hidden` on the router outlet, so the screen that opens is painted, clickable and absent from the accessibility tree — and every pixel assertion stays green through it.
- [A version that was named in a fourth place (2026-08-28)](#a-version-that-was-named-in-a-fourth-place-2026-08-28) — the Go 1.27 move: the toolchain gate was right to refuse the lone image bump, and then the linter turned out to name the language version too. Why the gate now holds the linter's two pins to each other but deliberately refuses to judge whether the pinned release is new enough.
- [Two screens nobody had ever rendered (2026-08-28)](#two-screens-nobody-had-ever-rendered-2026-08-28) — M20 and G-10, the last two areas the `server` project named as owed. Three defects that only a rendered multi-identity test could reach: a facepile initialling a random hex key, a group-sync badge whose state was unreachable because one frame was dropped while the socket was still opening, and a deactivated account whose app looked offline instead of saying so.
- [The sheet learns to put finished rows away (2026-08-29)](#the-sheet-learns-to-put-finished-rows-away-2026-08-29) — FR-25.13e reverses FR-25.13d's "a carried item stays listed" for an opt-in switch. The rule that made the reversal affordable is that hiding is a **snapshot**, not a filter: what the run adds is never hidden, because a row vanishing under the finger reflows the list into the next tap and deletes the sheet's only feedback.
- [The per-person model finally gets a writer (2026-08-29)](#the-per-person-model-finally-gets-a-writer-2026-08-29) — FR-25.21/ADR-036. Why a feature whose model had been complete since FR-25.1 still took a PR; the option that would have lost a comment thread on every membership edit; the tab that, as an action, could only assign the item to whoever is first in the roster; why a specification written against a mockup got the save button wrong; and the two case texts nobody had read back against their test bodies.
- [The sheet learns two verbs (2026-08-29)](#the-sheet-learns-two-verbs-2026-08-29) — FR-25.13f. The decision made in front of the wardrobe — *already packed* / *staying home* — cost three screens per item. Two variants were rendered and rejected before one was built, and the case that mattered most is the one no failing test asked for: which signal wins when the run's own verb and FR-25.13e's derived *added* describe the same line.
- [The quick-add gets a mode, and two waiting cases did not land where they waited (2026-08-29)](#the-quick-add-gets-a-mode-and-two-waiting-cases-did-not-land-where-they-waited-2026-08-29) — FR-25.8. Why the row is written *before* the membership editor opens rather than the mode collecting a draft; and the two e2e cases that had been parked on this feature since the concept round, one of which turned out to be a second run of another and the other to have lost its premise to G-8.
- [The shop stops asking three times for one purchase (2026-08-29)](#the-shop-stops-asking-three-times-for-one-purchase-2026-08-29) — FR-25.6. The premise that made M6's aggregation invisible for three weeks, why the buy row is keyed by M4's own function rather than a second one, and the two places that had to follow the aggregation once it existed — the reveal and the tab counts.
- [A rule that was complete and invisible (2026-08-30)](#a-rule-that-was-complete-and-invisible-2026-08-30) — E2E-G3-04. The G-3 cluster lock shipped correct and unobservable: every other G-3 surface names its holder, and the one surface that could inherit none of them said nothing at all. Why writing the two-identity case is what found it, and why the release — not the pack — is what the positive half needs.
- [A row kept saying it was skipped after it had stopped being (2026-08-30)](#a-row-kept-saying-it-was-skipped-after-it-had-stopped-being-2026-08-30) — where FR-25.13f's ✕ meets FR-25.21's editor. Why the fix is a derivation rather than a policy, why only one of the two cases is worth a confirm, and the two fields deliberately left alone.
- [Seventeen unwritten cases, two worth writing (2026-08-30)](#seventeen-unwritten-cases-two-worth-writing-2026-08-30) — backlog item 6, taken screen by screen instead of by the count. What M6's unwritten ids turned out to be, why a coverage number is not a backlog, and the four promises the app had already reversed.
- [A blocked case that had quietly unblocked, and one that had quietly been covered (2026-08-30)](#a-blocked-case-that-had-quietly-unblocked-and-one-that-had-quietly-been-covered-2026-08-30) — backlog item 6, M4. A rule that was correct and unreachable, an entry waiting on a blocker that was gone, and nine cases that had been written as unit tests with no E2E id on them.
- [Nine promises, three tests and three things that were never built (2026-08-30)](#nine-promises-three-tests-and-three-things-that-were-never-built-2026-08-30) — backlog item 6, M2. The audit's fifth verdict: an unwritten case that is not a missing test but an unbuilt promise, three times over — including a settled 2026-08-08 decision the screen has never matched.
- [A promise that was its own defect (2026-08-30)](#a-promise-that-was-its-own-defect-2026-08-30) — backlog item 6, M17. A case sentence describing the bug as the specification, a toggle nobody had ever pressed, and two scope labels that meant a different screen than they said.
- [A row gets a door of its own, and the app keeps its old one (2026-08-30)](#a-row-gets-a-door-of-its-own-and-the-app-keeps-its-old-one-2026-08-30) — FR-24.4/ADR-038. Why "the frontend should use the same API" cannot be honoured by an offline-first client, the error code that nothing could emit and the test that replaced it, and a test whose two failures were both correct behaviour.
- [The amount finally says what it is in (2026-08-30)](#the-amount-finally-says-what-it-is-in-2026-08-30) — FR-21.9. Why the endpoint that already existed could not carry an instance setting, why the currency is not a device preference, and the Local Mode cost that was accepted rather than designed around.
- [A credential that nothing remembers (2026-08-30)](#a-credential-that-nothing-remembers-2026-08-30) — FR-23.7/ADR-039. How checking one sentence about refresh tokens deleted a table, a schema change and a whole screen; the hole a ninety-day credential made reachable in `authed`; and why refusing a token the right to mint another is not the scope the concept rejected.
- [Six numbers that each meant two things (2026-08-30)](#six-numbers-that-each-meant-two-things-2026-08-30) — backlog item 6, M5. How one screen's catalogue came to define six ids twice, why the suite's meaning wins and the loser is struck rather than renumbered, and the requirement that was quoted verbatim in the code violating it.
- [An assertion that was true before the click (2026-08-30)](#an-assertion-that-was-true-before-the-click-2026-08-30) — backlog item 6, M11/M12. A screen where every id was implemented and two clauses still had no test: an assertion whose locator both dimensions render, a KPI checked where its two halves were equal, and the question that finds the shape. Plus two promises with a reader and no writer.
- [The debt register empties, and one clause of it was never built (2026-08-30)](#the-debt-register-empties-and-one-clause-of-it-was-never-built-2026-08-30) — the four inherited id collisions read against their screens. Three were plain duplicates; the fourth split three ways and left a promise the quick-add has never kept.
- [Two ids on the wrong tests (2026-08-30)](#two-ids-on-the-wrong-tests-2026-08-30) — backlog item 6, M9. Two case ids sitting on tests that implement two other promises, wrong since the commit that wrote both; why no gate can see a swap; the merge M9 never had, and the argument that leans on it.
- [A row that could not count, and a segment nobody filled (2026-08-30)](#a-row-that-could-not-count-and-a-segment-nobody-filled-2026-08-30) — backlog item 6, M7 and M23. Why a case can assert a composition and still not see the one number the row computes, the spec sentence that described an unbuilt menu as built, and the cost one screen declined that the next screen could pay once for both.

## Current state

> **Repack (Return-Trip Mode) is REMOVED (owner decision, 2026-07-17).** Spec retired (PRD Addendum
> §3.11, UI-Spec M13, UI-Test-Spec M13 cases) and client code + tests deleted (`domain/repack.ts`,
> `RepackPage.vue`, the router route, `startRepack`/`completeRepack`/`resetForRepack`, all view
> references). The `outbound_packed` column and the `repack` value in the trips-status CHECK remain
> as inert dead schema in already-applied migrations 001/004 — applied migrations are never edited.
> **Do not reintroduce repack.**

`go test -race ./...` → all green, 194 tests. Client: 407 vitest tests (52 files).

**CI/CD** (`.github/`, modeled on skipper-cd, 2026-07-10): `ci.yml` — Go job (build, vet, `-race` tests, coverage gates 75 % overall / 90 % `internal/sync`, `go mod tidy` check), golangci-lint (config in `.golangci.yml`: errcheck excludes for deferred-cleanup/response-writing idioms, staticcheck all minus QF1001, `client/` excluded), client job (`npm ci`, oxlint + eslint _without_ `--fix`, `npm run build` = type-check + vite, `vitest run`), **autoformat job** (gofmt + prettier, commits `style: apply automatic formatting` back to the branch; skipped on fork PRs; GITHUB_TOKEN pushes don't retrigger CI — fine, formatting is semantics-free), docker-build check. `docker.yml` — ghcr.io push on `v*` tags (semver + sha + latest). `release.yml` — release-please (go) maintains the release PR from Conventional Commits; authenticates with a PAT (`secrets.RELEASE_PLEASE_TOKEN`, falls back to `GITHUB_TOKEN` if unset) so the release PR gets CI and the release tag it creates triggers docker.yml directly (GITHUB_TOKEN-raised events never trigger workflows — that's why the old explicit docker dispatch existed; removed 2026-07-11 to avoid a double build once the PAT lands). PAT is a fine-grained token on this repo with contents:write + pull-requests:write + workflows. Dependabot weekly (gomod, npm in /client, actions, docker) + auto-merge for patch/minor. Client `src/` is fully prettier-formatted since 2026-07-10 — keep it that way or the autoformat bot will. Branch protection/rulesets are **unavailable** (free-plan private repo, API returns 403 "Upgrade to GitHub Pro or make this repository public") — Dependabot merging is instead gated by the `dependabot-merge` job in ci.yml (`needs` all check jobs, so it waits for green by construction; majors stay open for review). The Actions setting "allow GitHub Actions to create and approve pull requests" is enabled (2026-07-10, release-please needs it). If the repo ever goes public: add real branch protection on `main` with go/go-lint/client/docker-build as required checks.

**Built:**

- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O.
- `internal/store` — SQLite repositories: change_log/conflict_log, pull with tombstone+compaction, push with idempotent mutation replay (trip partition: trip_items, travelers, containers, comments), Single-User bootstrap, avatar + display-name, template/trip export+import. Membership with three-tier role model (owner/admin/editor, FR-4.5/4.7). Master-partition sync (`master.go`, spec §4/§5): `ApplyMasterMutation`/`PullMaster` for categories, items, templates, template_items, trips — authorization enforced (trips by member, delete owner/admin; templates/template_items shared instance-wide since the FR-1.6 MVP simplification), `owner_id`/`created_by` stamped server-side on insert and never rewritten, trip insert auto-creates owner membership, template delete tombstones cascaded template_items, FK violations → outcome `rejected`, pull visibility per user (member trips; categories/items/templates instance-wide). Migrations tracked via `PRAGMA user_version` (reopen-safe). Series in the master partition since migration 006 (M16): trip_series (owner_id stamped, owner-only visibility), destination_profiles/destination_checklist_items authorized+visible via the series-owner chain (`ownsAll`/`ownedBy`), series/profile deletes tombstone their FK cascade (`cascadeChildren`). trip_members in the master partition since migration 009 (FR-4.5/4.7): single-column `id` + `updated_hlc` (natural key kept as UNIQUE(trip_id, user_id)), managed only by Owner/Admin, clients can never grant `owner`, the creator's row is immutable (any mutation of a role=owner row rejects), duplicate adds reject via the broadened `isConstraintViolation` (FK+UNIQUE+CHECK → outcome `rejected`); trip insert logs the auto-created owner membership, and a member grant re-logs the `trips` row so a late-added member's cursor picks the trip up (`memberTrip` touch); roster rows visible to every member of their trip. `ListUsers` directory for the M3 sharing picker.
- `internal/api` — HTTP handlers: pull/push for both partitions (`/sync/trips/{id}` + `/sync/master`), JWT auth (HS256 shared secret or RS256 via JWKS from IdP), trip-membership enforcement, Single-User Mode (`api.NewSingleUser`, bypasses auth _and_ membership per FR-17.3), avatar upload/download with ETag, display-name endpoint. WebSocket hub (`hub.go`/`ws.go`): spec-§7 wire protocol (`?token=` query-param auth for browser dials, `{"subscribe": ["trip:<id>"]}`/`unsubscribe`/`{"cursor": {trip_id, seq}}` client frames, `{type, payload}` envelope), per-trip subscriptions, `trip.changed` broadcast on push, `master.changed` to the pusher's own connections only (lazy discovery for others, spec §8), presence as `users:[{user_id, device_count, in_sync}]`. Portable YAML export/import endpoints for templates and trips. JWKS provider (`jwks.go`): fetches RSA public keys on startup, refreshes every 5 min, key lookup by `kid`.
- `internal/portable` — YAML wire types for portable template/trip export/import (FR-18.1–18.6). Pure marshal/unmarshal, no I/O deps. `gopkg.in/yaml.v3`.
- Two-client end-to-end tests (`internal/api/e2e_test.go`) proving concurrent offline edits converge per NFR-4.2a over real HTTP.

**Not built yet, in the order I'd tackle them:**

1. ~~**`cmd/jitpackd` main wiring**~~ — **DONE.** `cmd/jitpackd/main.go` + `config.go`: env-based Config, picks `api.New` vs `api.NewSingleUser`, graceful shutdown. 5 table-driven config tests.
2. ~~**Dockerfile / docker-compose.yml**~~ — **DONE.** Multi-stage build (golang:1.22-alpine → alpine:3.21), docker-compose with healthcheck, mem_limit, homelab conventions. Smoke-tested.
3. ~~**WebSocket hub + presence**~~ — **DONE.** `internal/api/hub.go` + `ws.go`: in-memory hub, per-trip subscriptions, `trip.changed` on push, presence with `in_sync` (cursor vs `store.HeadSeq`). `github.com/coder/websocket`. 10 new tests (6 hub unit + 4 WS integration). `item.locked`/`item.unlocked` implemented (2026-07-09): server stamps actor columns on push (`stampActor` in server.go — comment `author_id` on insert, `packing_now_by`+`packing_now_at` on state packing_now, `packer_user_id` on state packed per FR-4.2; client placeholders like 'current-user' are never trusted, which also prevents FK 500s) and emits the ephemeral lock events before `trip.changed`. Client: `packingNow` action (M4 swipe right), all pack/skip transitions clear the claim, `isLockedByOther` merges ephemeral locks + synced packing_now state with the §7 15-min staleness rule; locked rows are non-interactive with lock chip (G-3); own-device claims tracked in `myLocks` because the client doesn't know its user id pre-OIDC. `notification.created` done (2026-07-10, see item 8).
4. ~~**Portable YAML export/import**~~ — **DONE.** `internal/portable` (YAML types + marshal/unmarshal), `internal/store/export.go` (template/trip export+import), `internal/api/export.go` (four endpoints: `GET /templates/{id}/export`, `POST /templates/import`, `GET /trips/{id}/export.yaml`, `POST /trips/import`). `gopkg.in/yaml.v3`. 19 new tests (8 portable, 6 store, 5 API). Item dedup/near-duplicate prompts (FR-16.3-style) not yet implemented — requires the master item matching UI.
5. ~~**RS256/JWKS against a real IdP**~~ — **DONE.** `internal/api/jwks.go`: JWKS provider with background refresh, RSA public key parsing from JWK, key lookup by `kid`. `api.NewWithJWKS(st, jwks)` constructor for RS256 mode. Config: `JITPACK_JWKS_URL` (mutually exclusive with `JITPACK_JWT_SECRET`). HS256 remains available for tests and simple setups. **OIDC exchange (2026-07-09):** the server brokers code+PKCE (`auth.go`: `POST /api/v1/auth/token|refresh`, `GET /api/v1/auth/config`; env `JITPACK_OIDC_TOKEN_URL`/`_AUTHORIZE_URL`/`_CLIENT_ID`, requires JWKS) — verifies the IdP token via JWKS, JIT-provisions (`store.EnsureOIDCUser`), passes the token set through. In JWKS mode `authed` maps token sub (OIDC subject) → `users.id` per request, so attribution is always `users.id` (spec §2 updated). Client: PKCE helpers (`src/auth/pkce.ts`, RFC-7636-vector-tested), token persistence (`src/auth/tokens.ts`), `/login` + `/auth/callback` pages, App.vue redirects to login when the server offers OIDC and no session exists. **Token auto-refresh (2026-07-09):** `src/auth/refresh.ts` (`createAuthRefresher`) refreshes proactively 30 s before expiry and reactively on 401 (APIClient retries the failed request once via the `onUnauthorized` hook — all four request paths incl. blob/raw), single-flight for concurrent callers, keeps the old refresh token when the IdP doesn't rotate, network failure ≠ logout (keeps current token — offline is normal); only an IdP rejection clears tokens and fires `jitpack:auth-expired`, which App.vue answers with a redirect to `/login`. `getToken` is now a possibly-async `TokenProvider` throughout (APIClient, WS dial awaits it). Spec §2 documents the client behavior.
6. ~~**Vue 3 + Capacitor client**~~ — **IN PROGRESS.** 407 client tests passing. Built so far:
   - **Scaffold:** Ionic Vue + Capacitor + Pinia + Vitest + TypeScript. Router with tab layout + detail routes.
   - **Sync layer:** HLC generator (TS port), APIClient, SyncOutbox, WebSocket composable, Auth composable (single-user + OIDC).
   - **Stores:** `tripStore` (trips, trip_items, travelers, containers, todos/prep, KPIs, grouping), `masterStore` (categories, items, templates, template_items, search).
   - **Sync orchestrator:** Wires stores ↔ outbox ↔ WebSocket. Optimistic UI (G-5): mutations apply locally first, drain fires in background. Pull changes auto-route to correct store. WebSocket `trip.changed`/`master.changed` trigger drains. Todo actions (add/resolve/reopen FR-7.3).
   - **Domain layer (`src/domain/`, pure, no I/O):** `instantiate.ts` — template instantiation (FR-2.2/2.3a/1.4/15.2): conditions filter with preview reasons, plain integer quantities (`formula.ts` and the FR-1.3/1.5 engine were **removed 2026-08-08**, owner decision — see the Open-items record), per_person expansion to one row per traveler, dedup across templates (max default, sum if any side requests it), merged/excluded reported for the M3 preview footer. Client-side by design so Local Mode gets it for free.
   - **Global patterns:** G-2 sync indicator (synced/syncing/offline/local), G-6 quantity stepper (checkbox for qty=1, +/- for qty>1), G-9 responsive layout (desktop nav rail ≥900px, mobile bottom tabs), G-10 presence facepile + group-sync badge in M4 (fed by WS presence events; client reports its pull cursor after each trip drain so the server can compute `in_sync`; hidden with ≤1 user, so inert in Single-User/Local per G-8). G-2 conflict log: `GET /trips/{id}/conflicts` (documented in spec §8), ConflictLogPage at `/trips/:tripId/conflicts`, opened by tapping the sync indicator inside a trip; Local Mode resolves empty without network (single writer).
   - **Screens:** M1 Dashboard (greeting, trip cards, KPIs, prep todos FR-7.3), M2 Trip List (filter, progress rings, FAB; Share slide option → TripMembersPage at `/trips/:tripId/members` per FR-4.5/4.7 — roster with role select (Editor/Admin) and remove for Owner/Admin, read-only for Editors, owner row immutable, add-picker from `GET /users`; pure view logic in `src/domain/members.ts` `buildRosterView`, mirrors the server rules; Share hidden without an OIDC session per G-8), M3 Trip Creation Wizard (4 steps: metadata + attribute chips FR-15.1, travelers FR-2.5, template selection with live dedup/exclusion preview, quantity review with overrides; `createTripFromWizard` cascade: trips → master partition first, then travelers/trip_items → trip partition, because the server grants creator membership on the master push; series picker in step 1 with inline "New series…" — inline series enqueue _before_ the trip in the same master queue, a separate drain could race; picking a series prefills empty attribute chips from its defaults, `?series=` preselects from M16; step 4 offers the series' destination checklist (FR-13.3) as opt-out extra trip items; sharing/role step in step 2 (FR-4.5/4.7): user picker from `GET /users` minus self, Editor/Admin role select, grants enqueued _after_ the trips insert in the same master queue (server authorizes against the fresh trip), rendered only with an OIDC session per G-8 — Single-User/Local hide it), M4 Packing List (KPI strip with prep counter, grouping, stepper, skip/unskip, inline quick-add FR-5.6, collapsible prep section, item prep badges), M5 Item Detail (stepper, mode, assignment, flags, preparation todos section, comment thread FR-7.1 with flag-as-task FR-7.2 — flagged comments become todos in the same comments table; note: FR-7.2's hard completion-block is superseded by FR-7.3's "packed with open prep" state; trip-level comments modeled in the store, UI deferred), M6 Shopping Views (two tabs buy_before/buy_local grouped by category, check-off: BUY_BEFORE → mode pack per FR-3.3, BUY_LOCAL → packed; quick-add per list via `addTripItem` mode opt; M4 toolbar entry with badge, hidden when empty; FR-13.3 destination checklists are offered in M3 step 4, not here), M11 Container Management (FR-10.1–10.3: CRUD with carrier/max-weight/pairing on `containers` incl. `paired_container_id`; pure weight math in `src/domain/containers.ts` — planned weight × quantity, amber ≥90 %/red >max, pairing imbalance vs heavier side with 15 % default overridable per trip via `attributes.imbalance_threshold`; unassigned bucket with assign select; `deleteContainer` unassigns items first — plain FK would reject the delete; entry from M4's container grouping; no threshold-setting UI yet), M12 Analytics (FR-8.2/10.4/14.3: `src/domain/analytics.ts` pure — `analyzeByDimension` person/category/container with planned/packed weight, value totals, honest "unweighted (n)" bucket; `seriesWeightTrend` + `topFlagged` over archived trips synced to the device; page at `/trips/:tripId/analytics` with stacked bars, dimension segment, trend section when the trip has a series; tap slice → M4 grouped by that dimension — per-slice deep filters not built; entry: tap the M4 KPI strip), M13 Repack Mode — **removed 2026-07-17, see the note at the top of this section** (one survivor of that work is kept because it was never repack-specific: the outbox chunks pushes at the 200-mutation server cap and only drops pushed chunks, so large wizard trips no longer wedge the queue), M14 Post-Trip Review Assistant (FR-9.1/9.2: `src/domain/review.ts` pure `buildReviewProposals` — unused-flagged templated items → "set quantity to 0 in the source template", missing-flagged items → "add to the trip's dominant template" (the one that contributed most items), dedup against items the template already contains, ad-hoc names matched to master items case-insensitively (unmatched → apply creates the master item first); proposals are recomputed from current state, so applied cards vanish = resumability for free; runs client-side like generation, spec §8 archive/review rows marked superseded; `archiveTrip` = plain `trips.status` mutation, `applyReviewProposal` writes ordinary master mutations straight to the source template (the fork path went with the FR-1.6 MVP simplification, 2026-08-08); "Never ask again" scoped to the item–template pair in a device-local localStorage store (`src/local/reviewDismissals.ts`) — deliberate: no synced table for UI mutings, another device asks at most once more; flag history counted over archived series trips synced to the device (M12-style honesty); page at `/trips/:tripId/review` = card stack Apply/Skip/Never + applied-changes summary; M4 toolbar: archive on active trips auto-launches review, sparkles re-entry on archived trips. Open: NFR-4.2a conflict-log compaction on archive has no server trigger now that archiving is a plain status mutation — noted in spec §8), M7 Template List (one shared list, item count), M8 Template Editor (item picker, quantity, swipe-to-delete), M9 Item Inventory (search, category groups, unit chips), M10 Item Editor (name, category, weight, value, unit), M16 Series & Destination Profile (FR-13.1–13.3: page at `/series/:seriesId` — name + default attribute chips (M3 prefill source), destination notes and checklist editor on the lazily created unique profile (`ensureDestinationProfile`), trip history with per-trip stats and detach, attach-select over series-less trips, "New trip in series" → M3 `?series=`, trends shortcut → newest trip's M12; M2 groups trips by series with tappable header → M16; orchestrator: createSeries/updateSeries/setTripSeries/ensureDestinationProfile/updateDestinationProfile/add-update-deleteChecklistItem, all master partition), Trip Cloning (FR-12.1/12.2: `src/domain/clone.ts` pure `planClone` — curated list with fresh pack state (skips travel with the clone as list curation, pack progress/flags don't), three carry-over toggles (traveler assignments / packer delegations / container assignments; containers only copied when their toggle is on), quantities carry over unchanged (formula re-evaluation retired with FR-1.3/1.5); `cloneTrip` cascade mirrors the wizard (trips→master first; container _pairing_ set in a second upsert pass — a forward pair reference would violate the FK); ClonePage at `/trips/:tripId/clone` with fresh dates + toggles + live preview; entries: M2 slide option on archived trips (slide-archive on active trips now actually works → M14), M16 "Clone last trip" on the newest archived series trip per FR-12.1; spec §8 clone row superseded), M15 Import Wizard (FR-16.1–16.3/NFR-4.7: `src/domain/spreadsheet.ts` pure — CSV parser with ,/;/tab auto-detect + quotes, `analyzeGrid` suggests item column/trip columns/category rows, `parseQuantity` (x/✓ → 1), `normalizeTripDate` (bare year → Dec 31), `findDuplicates` (exact-normalized auto-merge + Levenshtein ≤2 prompts, FR-16.3), `buildImportPlan` (category grouping, trailing '?' → open task); `commitImport` cascade: categories reused case-insensitively then created, master items merged per dedup decision, trips archived+`imported` with original quantities as packed rows, '?' noise → todo comment on the row; page at `/import` 4 steps (file/paste → mapping with select-all-default trip toggles + per-trip series target → dedup merge/keep-separate → confirm); entries: M2 title-row upload icon, M9 empty state. Scope cuts, documented in spec §8: CSV only (XLSX = export to CSV; parser dep fails NFR-4.3), NFR-4.7 transactionality approximated by pre-validation + parents-first idempotent enqueue — no cross-mutation server transaction), M17 Settings (page at `/tabs/settings`, header gear now resolves — it was a dead link; profile per FR-17.13: editable display name (inline `[A-Za-z0-9._-]{1,50}` validation) + avatar upload with on-device 256×256 JPEG center-crop when _no_ OIDC session exists (single-user server), read-only IdP note otherwise, plain note in Local Mode; identity via new `GET /api/v1/me`; data section: NFR-4.5 full-JSON + per-trip-CSV downloads through `downloadExport` (auth-header blob), portable-YAML note in Local Mode; conflict-log pointer (G-2 lives on the trip sync indicator), about section. Deliberate gap: avatar pan/zoom crop positioning deferred, center-crop only. Notification prefs + Web-Push toggle live in the Notifications section since 2026-07-10 (item 8). Server: `internal/api/backup.go` + `internal/store/backup.go` (ExportFull visibility-filtered, UserDisplayName, CSV from the portable ExportTrip document); APIClient gained put/putRaw/getBlob and tolerates empty 200 bodies), M18 Portable Import Preview (FR-18.4/18.5: `src/domain/portable.ts` pure — YAML parse via the `yaml` package (already a transitive Vite dep, zero added footprint) with validation (malformed rejected at the picker), forward compatibility (unknown fields ignored, newer `schema_version` → warning + best-effort), `matchPortableItems` reuses the M15 `findDuplicates` for new/matched/near states; `commitPortableImport` client-side — **decided: import runs client-side** because the portable export is Local Mode's backup (NFR-4.11) and restore must work serverless, and the FR-16.3 merge prompts need decisions before commit; the server's POST import endpoints remain for API use. Template → new shared template (FR-1.6 MVP, name collision → " (import)" suffix, unmatched items create master items, conditions/dedup/late_packer carried); trip → _planning_ trip, travelers/containers remapped by name, progress preserved via state derivation (open/partial/packed/skipped), unmatched trip rows stay ad-hoc; single-screen page at `/portable-import` (summary header, state chips, merge segments, schema warning); entries: M7 + M2 title rows. `addTemplateItem` mutation now carries conditions. **Portable export UI (FR-18.2/18.3)**: `serializeTemplate`/`serializeTrip` in portable.ts write the exact server format (field names, omit-empty, by-name ordering — round-trip tested against `parsePortable`), generated **client-side from the stores** so Local Mode backups work without a server (NFR-4.11) and FR-19.5's migration path is complete in both directions; M7 download button per template, M2 slide option with progress/clean ActionSheet per FR-18.3, M17 Local-Mode data section offers trip+template YAML downloads; shared `src/lib/download.ts`).
   - **Persistence wiring:** all editor mutations go through the orchestrator — M8/M10 master edits (`createMasterItem`/`updateMasterItem`/`deleteMasterItem`/`updateTemplate`/`addTemplateItem`/`updateTemplateItem`/`deleteTemplateItem` actions on the master partition), M5 assignment controls (`assignTraveler`/`assignContainer`/`setLatePacker` on the trip partition). No store-local placeholder mutations remain.
   - **M2 Delete (FR-4.5, done 2026-07-11):** destructive slide option with confirm, shown only to the trip Owner (`canDelete`: non-collaborative modes always, else the roster is checked against `fetchMe`); `deleteTrip` mutation + orchestrator action tombstone the trip on the master partition, server enforces Owner/Admin and cascades, local store drops the trip + child rows.
   - **M7/M9 creation UI (done 2026-07-11):** the New Template (M7) and New Item (M9) FABs prompt for a name, create the row (`createTemplate` — new orchestrator action, owner_id server-stamped; `createMasterItem` — existing), and open the editor (M8/M10).
   - **G-4 deep-link highlight (done 2026-07-11):** mention/task notifications carry the comment id (`?comment=` in `notificationRoute` + the `sw.js` mirror); M5 watches the thread and scrolls to + flashes that message once it's synced in.
   - **FR-14.2 history suggestions (done 2026-07-11):** M3 step 4 offers a one-tap default per item — duration-normalized median of the series' last three trips ("2024: 5 · 2025: 6 → use 6"). `src/domain/suggestions.ts` (pure, tested), computed client-side from synced series trips like generation/analytics/review (works in Local Mode; supersedes the planned `GET /suggestions` endpoint, spec §8 struck through).
   - **NFR-4.11 export reminder (done 2026-07-11):** Local Mode M17 warns when the portable-YAML backup is stale (never, or >30 days — `src/local/exportReminder.ts`, pure/tested, device-local timestamp cleared on each YAML download) + a Storage-details row (navigator.storage estimate/persisted).
   - **M17 avatar pan/zoom crop (done 2026-07-11):** `AvatarCropModal` (drag to pan, slider to zoom over a circular viewport) replaces the center-only crop; geometry in `src/lib/avatarCrop.ts` (pure/tested), output the same 256×256 JPEG.
   - **Not yet built:** OIDC login flow UI polish (token auto-refresh is done, see item 5). Rosters of trips created before migration 009 never enter the master feed (no backfill — consistent with 005/006; recreate or re-share affected trips). M15 XLSX support (CSV only, see spec §8 — deliberate NFR-4.3 cut). TypeScript 7 bump blocked by vue-tsc incompatibility (dependabot PR #4 left open).

7. ~~**Local Mode — backend-free client (Addendum 3.19, UI-Spec M19/G-2 local state).**~~ — **DONE** (2026-07-09):
   - `src/local/persistence.ts` — IndexedDB adapter, rows as `table/id → row` in `PullChange` shape; `requestDurability()` per NFR-4.11.
   - Local Mode is a config variant of `useSyncOrchestrator` (`local: IndexedDBPersistence`), not a parallel composable: `onPullChanges` is the single funnel and persists every change; enqueue/drain/WS are no-ops; `connect()` loads from IndexedDB through the same `applyChanges` path as a server pull (FR-19.2).
   - M19 `ModeSelectionPage` rendered by `App.vue` before the router until a mode is persisted (`jitpack_mode`, plus `jitpack_server_url` for Server Mode); switching later requires the FR-19.5 export/import path, no toggle.
   - G-2 shows the `local` state (new `SyncState` value, phone glyph, FR-19.6).
   - Test infra: `fake-indexeddb` (dev dep — jsdom has no IndexedDB).
   - Still open: FR-19.3 collaboration-UI gating is trivially satisfied today (no collaboration UI exists yet) — gate it when sharing/presence UI lands. NFR-4.11 export reminder (>30 days) + storage-detail popover done 2026-07-11 (client item 6). FR-19.5 migration is complete in both directions: M18 imports and the client-side YAML exports (M7/M2/M17) both work serverless.

8. ~~**Notification system (FR-6.2, NFR-4.6, UI-Spec M17).**~~ — **DONE** (2026-07-10), three commits (server core, Web Push, client):
   - **Server detection** (`internal/api/notifications.go`, hooked into `handlePush` after `trip.changed`): three kinds — `delegation` (a push sets `packer_user_id` to another member; state=packed never triggers because `stampActor` self-stamps), `mention` (`@display-name` in a comment body, case-insensitive, names may contain spaces, word-boundary after the name), `task` (task comment on an item whose packer is another member; a packer who is also mentioned gets only the task). Skipped entirely in Single-User Mode (FR-17.3) and on solo trips. Store: `internal/store/notifications.go` (rows in the existing `notifications` table, payload = FR-6.3 deep-link context incl. `actor_name`/`item_name`/`preview`), per-kind prefs as JSON on `users.notification_prefs` (NULL/missing key = enabled) checked at _creation_ time. Migration 007.
   - **API**: `GET /notifications` (`?unread=1`), `POST /notifications/{id}/read` (owner-scoped, idempotent), `GET/PUT /me/notification-prefs`. WS `notification.created {notification_id}` goes to all connections _authenticated_ as the target (no `user:` subscription needed — the frame is accepted but redundant, spec §7 updated).
   - **Web Push (NFR-4.6)**: `internal/api/push.go` + `internal/store/push.go`, migration 008 (`push_subscriptions`, `server_keys`). VAPID keypair self-generated on first use, persisted first-writer-wins in `server_keys`. `GET /push/vapid-key`, `POST /push/subscriptions` (endpoint = identity, rebinds on re-register), `DELETE /push/subscriptions` (owner-scoped). Sends run in a detached goroutine, RFC 8291 `aes128gcm`; 404/410 from the push service drops the subscription. Env `JITPACK_PUSH_CONTACT` (VAPID sub). Dependency `github.com/SherClockHolmes/webpush-go` (RFC 8291 encryption + VAPID signing — crypto not to hand-roll; only pulls x/crypto). UnifiedPush/FCM/APNs not implemented (no native build exists); WS is the universal in-app fallback.
   - **Client**: `src/notifications/format.ts` pure (`describeNotification` wording + `notificationRoute` deep link — mirrored in `public/sw.js`, which can't import modules); `src/notifications/push.ts` (browser dance: permission → SW register → `pushManager.subscribe` with the VAPID key → server registration; server half injected as `PushServerAPI` = `orchestrator.pushApi`). Orchestrator: `onNotification` config callback, `notification.created` → fetch unread → surface each id once (`surfacedNotifications` set), `connect()` also surfaces unread missed while away; `markNotificationRead`/`fetchNotificationPrefs`/`saveNotificationPrefs` actions; APIClient gained `delete`. App.vue: toast per notification (top, 6 s, "Open" → deep link route), read stamped on dismiss — deliberate: no inbox screen exists in the UI spec, the toast is the delivery. M17: Notifications section (three kind toggles + "Push on this device" with support detection), only rendered with an OIDC session (`collaborative`) per FR-17.3/FR-19.3/G-8.
   - G-4 deep-link highlight implemented 2026-07-11 (mention/task → M5 flashes the referenced comment; see client item 6). `public/sw.js` is push-only — no caching, offline remains the state-sync story.

9. ~~**Theming / Dark Mode Default (Addendum 3.21, FR-21.1–21.4, UI-Spec G-11).**~~ — **DONE** (2026-07-10). `client/src/theme/catppuccin.css` is the single FR-21.2 token table: Mocha on `:root` (dark default in every mode, FR-21.1), Latte behind the `jitpack-latte` root class; Ionic's variables (all 9 colors incl. rgb/contrast/shade/tint, background/text, stepped colors via `color-mix()` from the two anchors) consume the same `--ct-*` custom properties — no parallel color system. Semantic mapping: primary=blue, secondary=teal, tertiary=mauve, success=green, warning=peach, danger=red, light=surface0, medium=overlay1, dark=text; app bg=mantle, cards/items=base. `client/src/theme/theme.ts` (`initTheme`/`setTheme`/`resolveTheme`, key `jitpack_theme`) flips the class; `dark.system.css` removed from `main.ts`. FR-21.4 twice: inline pre-paint script in `index.html` + synchronous `initTheme()` before mount — dark is the stylesheet default, so a missing preference can't flash. M17 gained an Appearance section (light-theme toggle, every mode, device-local). The claude.ai/design project "JIT-Pack Design System" shows the same token table on every card (Mocha/Latte side by side).
10. ~~**Instance User Management (Addendum 3.23, FR-23.1–23.6, UI-Spec M20).**~~ — **DONE** (2026-07-10), two commits (server, client):

- **Server**: migration 010 (`users.is_instance_admin`, `deactivated_at`). Admin role is declarative (FR-23.1): `JITPACK_ADMIN_EMAILS` (comma-separated, `cmd/jitpackd/config.go` `splitList`) matched case-insensitively against the token's `email` claim (`isAdminEmail`), stamped authoritatively in both directions by `EnsureOIDCUser` on every login — which now also stamps `users.email` (empty claim leaves it alone) and re-stamps a reset ('') display name from the IdP claim, all in one conditional UPDATE that keeps the per-request hot path read-only. Deactivation (FR-23.3, `internal/store/admin.go`): 403 `account_deactivated` in `authed` (covers `wsAuth` — it delegates), push subscriptions deleted, `CreateNotification` suppressed at the single source, hidden from `GET /users`, JIT login never resurrects; data/attributions untouched; admins → 409 `admin_undeactivatable` (remove from the env list first). `/api/v1/admin/` surface behind `adminOnly` (layered on `authed` like `member`): overview with usage counts (`AdminUsers`), deactivate/reactivate, avatar + display-name reset (FR-23.4). `GET /me` gained `is_instance_admin`. No delete anywhere (FR-23.5, anonymization is the revisit path). Single-User bypasses `authed` → whole feature inert (FR-17.11/G-8).
- **Client**: `email` scope added to the authorize request (`pkce.ts` — prerequisite for the claim). `src/domain/admin.ts` pure `adminActionsFor` (no Deactivate on admins/own row, Reactivate on deactivated rows, resets always, mirrors the server). Orchestrator: `fetchAdminUsers`/`deactivateUser`/`reactivateUser`/`adminResetAvatar`/`adminResetDisplayName`, `fetchMe` typed with the admin flag. M20 `AdminPage` at `/admin`: account list (avatar, email, provisioning date, usage counts, Admin/Deactivated chips, "(you)" marker, dimmed deactivated rows), per-row ActionSheet, FR-23.3 consequences spelled out in the deactivation confirm; M17 gained the Administration row (rendered only `collaborative && me.is_instance_admin`).

11. ~~**Item Dependencies / "Companion Items" (Addendum 3.20, FR-20.1–20.4).**~~ — **DONE** (2026-07-10), four commits (server, domain, wiring, UI):

- **Server**: migration 011 `item_dependencies` (`item_id` depends on `depends_on_item_id`, mode `required`/`suggested`, optional `quantity` (plain integer since migration 014); UNIQUE pair, CHECK against self-reference). Master partition via whitelist only — shared like `items` (anyone writes, everyone sees); item deletes cascade both directions and tombstone the relations (`cascadeChildren`). No server-side cycle check — that's save-time client validation per the addendum, and the resolver tolerates synced cycles.
- **Domain** (`client/src/domain/dependencies.ts`, pure): `resolveDependencies` runs after `generateTripItems` — required companions join transitively (BFS, visited-set cycle guard), suggested surface as one-tap candidates, anything already on the list dedups by `source_item_id` per FR-20.3 (two mains requiring the same companion merge at max, FR-2.3a — the relation carries no dedup attribute). Companion quantities reuse `computeQuantity` (plain integer since the FR-1.3/1.5 removal). `dependentsOf` = transitive co-skip set; `dependencyCycleError` = save-time validator with readable path.
- **Wiring**: masterStore `item_dependencies` case + `dependencyList`/`getItemDependencies`/`getCompanionDependencies`; orchestrator `addItemDependency`/`updateItemDependency`/`deleteItemDependency` (master partition), `skipItem` co-skips transitive dependents in the same push (FR-20.2), `quickAddItem` with a `sourceItemId` auto-adds missing _required_ companions (FR-20.4: required never prompts).
- **UI**: M10 "Depends on" section (picker excludes self+existing, mode select, inline cycle error) + read-only "Companions" list; M3 step-3 chip "+ N companion items (…)", step-4 companion list with via-item, FR-20.3 dedup notes ("already on the list, not duplicated"), suggested companions as opt-in checkboxes (checkbox = the one tap; accepted rows commit with `source_template_id: null` — `TripWizardDraft.items` widened accordingly); M5 "Companions" hint with one-tap Add (via quickAdd, which chains required companions of the accepted suggestion); M4 skipped section shows the co-skip reason ("skipped: Kamera not on this trip").

12. ~~**Item Images (Addendum 3.22, FR-22.1–22.6).**~~ — **DONE** (2026-07-11), three commits (server, client core, UI):

- **Server**: migration 012 `item_images` (`item_id` PK → `items(id) ON DELETE CASCADE`, `image BLOB`, `mime` CHECK `image/jpeg`, `CHECK length ≤ 153600`, `updated_at`) + `items.image_hash TEXT` (nullable, added to `syncableColumns["items"]`). The BLOB is deliberately outside the sync envelope (ADR-002); only `image_hash` flows through the master feed. Store `SetItemImage`/`GetItemImage`/`DeleteItemImage` (`internal/store/itemimage.go`) stamp `image_hash` through the master change-log with a fresh **server-side HLC** — new `Store.hlc` generator (random per-process device id; wall-clock ms keeps HLCs increasing across restarts) since there's no client mutation behind the fact. `withImageTx` bumps `items.updated_hlc` + appends the change_log entry in one tx; a missing item → `ErrItemNotFound`. API (`internal/api/itemimage.go`): `GET /items/{id}/image` (public, ETag = hash, like avatars), `PUT`/`DELETE` behind `s.authed` **only** — FR-22.6 forbids a trip-role gate on shared item data. 150 KB / JPEG validated at handler + store + CHECK (defense-in-depth). `master.changed` pinged to the actor's own devices. 13 tests (7 store, 6 api).
- **Client core**: `src/lib/imageResize.ts` — zero-config optimizer (FR-22.2/22.3): `fitDimensions` (longer edge ≤ 1024, no crop, no upscale) + `backoffEncode` (pure, injected-encoder tested; steps JPEG quality 0.82→0.4, then shrinks dims 15 %/round until ≤150 KB) + `canvasEncoder`/`optimizeItemImage` (browser `createImageBitmap` + `toBlob`). `src/local/persistence.ts` gained an IndexedDB `images` store (DB v2) keyed by item id, blobs kept as `ArrayBuffer` for cross-runtime structured-clone safety. Orchestrator `setItemImage`/`deleteItemImage`/`itemImageUrl`: Server Mode uploads then `drainMaster()` pulls the stamped `image_hash` back; Local Mode writes the blob + a client-computed hash (`hashBlob`, sha256[:8] to match the server) through the same `onPullChanges` funnel; `itemImageUrl` returns the public GET URL (`?v=hash` cache-buster) or a Local Mode object URL. `MasterItem.image_hash` carried through `rowToItem`. 11 tests.
- **UI**: M10 ItemEditorPage "Photo" section (add/replace/remove, live preview, object-URL lifecycle managed); reusable `ItemThumbnail.vue` (resolves the URL via the orchestrator, owns its lifecycle, renders nothing without a photo); M9 ItemInventoryPage row thumbnails; M5 ItemDetailPage shows the source master item's photo.
- Open: avatar-style pan/zoom crop is intentionally absent (a reference photo keeps its aspect ratio, FR-22.3). Revisit trigger unchanged from ADR-002 — filesystem/object storage if photos grow past ~150 KB or the deployment leaves home-lab scale.

13. ~~**Single-origin deployment (nginx client container).**~~ — **DONE** (2026-07-14). `client/Dockerfile` builds the SPA and serves it from nginx; `client/nginx.conf` reverse-proxies `/api`, `/ws` and `/health` to the backend, so the deliberately CORS-less API is reached same-origin. `docker-compose.yml` gained a `web` service on `:3000` and the `app` service became internal-only. Single-User Mode is now a genuine open-and-use path: open the app, pick Server Mode, no login. Shipped with `fix(singleuser)`: `EnsureLocalSingleUserID` (`internal/store/singleuser.go`) seeds the configured `JITPACK_LOCAL_USER_ID` row on startup — the single-user server attributes every request to that id, so without the row the first write failed on the `owner_id` foreign key (trips, memberships). Idempotent, and it preserves a display name the user later changed (FR-17.2).
14. ~~**Playwright E2E harness scaffold.**~~ — **SCAFFOLD ONLY.** `client/playwright.config.ts`, `client/e2e/` (`fixtures.ts`, `smoke.spec.ts`, `README.md`), a CI job, and `dev-docs/UI_Test_Spec_v1.0.md` (per-screen cases + FR/NFR traceability matrix). The **cases themselves are not written** — and per the Open-items note above they should wait for the M4/M5/M6/M8 concept lock, since the redesign rewrites them.
15. **Concept & direction documents** (2026-07-12 – 2026-07-18) — the current phase's output, all _specification_, no code:
    - `dev-docs/UI_Concept_Prototype.html` — the clickable prototype every §3.25 decision was tested against. `dev-docs/UI_Concept_Overview.html` — M1–M20 coverage overview.
    - `dev-docs/Navigation_Concept_v1.0.md` — information architecture: nav rail, trip entry points, back-stack, onboarding, empty states, edge cases.
    - `dev-docs/Vision_NorthStar_v1.0.md` — directional expansion from packing app to family vacation companion (Plan/Prepare/During/After). **Not authoritative over shipped scope**, drives no implementation. Flags **ADR-007 (outbound fetching)** as the gate for planning features — note that ADR is referenced but **not yet written**, and its number has since been taken — ADR-007 is now Session Brokering — so the outbound-fetching decision gets the next free number when written.
    - PRD Addendum gained §3.24 (item tags, lifecycle delete), §3.25 (packing-screen refinements, FR-25.1–25.10), §3.26 (calendar feed) and NFR-4.12 (i18n) — §3.24/§3.25/§3.26 **status: proposed**, NFR-4.12 **accepted 2026-08-07**. §3.11 (Repack) retired.
16. **i18n (NFR-4.12)** — **FOUNDATION DONE** (2026-08-07), migration open. `client/src/i18n/`: `index.ts` (locale resolution, `t`, `Intl` wrappers) + `messages/en.ts` and `messages/de.ts`. **English is the primary/default locale and also the fallback; German is fully supported** (owner decision — the client was already written in English, so German is an addition, not a rewrite). **No `vue-i18n`**: two locales need only key lookup, `{placeholder}` interpolation and a one/other plural rule, and date/number formatting is `Intl` — justification and revisit trigger recorded in NFR-4.12. The call shape stays vue-i18n-compatible (`t('key', { n })`) so swapping the module later does not touch call sites.
    - Keys are **flat and dot-namespaced** (`packing.itemsLeft`), not nested — a missing translation is a one-line diff, and the catalogue-integrity test can compare key sets directly. That test fails the build if an English key has no German counterpart, so a string cannot ship untranslated.
    - Locale is a Vue `ref`, so `t()` in a template re-evaluates on language change — no reload. Resolution order: persisted choice → browser locale if German → English. Persisted device-local under `jitpack_locale`, the same pattern and failure handling as the theme (FR-21.3); `initLocale()` runs before mount in `main.ts` next to `initTheme()`, and sets `document.documentElement.lang`. An unknown key renders as the key itself rather than blank, so gaps are visible in review.
    - Plural rule is `n === 1` → singular, everything else plural (so zero takes the plural form, correct for both locales). An unmatched `{placeholder}` is left verbatim — a visible `{n}` is a bug report, "undefined" reads as data loss.
    - M17 gained a Language row (IonSelect, English/German) beside the Appearance toggle. 24 tests.
    - **Open:** the ~300 existing hard-coded English strings across 35 `.vue` files are **not yet externalized** — only the new Language row uses `t()`. Until that migration lands, switching to German changes very little on screen. Sequenced after the M4/M5 rebuild on purpose (see the MVP order above).
17. **M4/M5 rebuild (§3.25, FR-25.1–25.10)** — **IN PROGRESS** (started 2026-08-07).
    - **Done: the pure view model** `client/src/domain/packingView.ts` (26 tests). `buildPackingView` turns items + travelers + containers into groups of entries, where an entry is either a flat row or a per-person **cluster**. It owns the three behaviours that are pure list arithmetic: FR-25.1 clustering, FR-25.2 hiding done rows, FR-25.4 the multi-select mode filter. `isDone` is the single definition of "done" — fully packed **or** skipped, but _never_ a packed row with an open preparation todo (FR-7.3), because hiding that is exactly the false "all done" the state exists to prevent.
    - Invariant worth keeping: **headers count over the full set, lists render the filtered set.** Group headers, cluster headers and the mode pills all tally over every row, so a group reading "3/8" while showing five rows is honest. Two consequences are deliberate and tested: cluster-vs-flat is decided over the full set (packing one instance must not restructure the list), and mode counts are taken over _open_ rows before filtering (so the pills do not renumber as you toggle them).
    - Not yet built: the screen itself — lean header + overflow, full-screen (hidden tab bar), collapsing header, pack-out animation + undo snackbar, packer avatar (FR-25.3), quick-add FAB behaviour.

## Deviations

None open. D-001 (CGO SQLite driver) was resolved 2026-07-09: `internal/store` now uses the pure-Go `modernc.org/sqlite`, builds with `CGO_ENABLED=0`, and the Dockerfile needs no C toolchain. History in `DEVIATIONS.md`.

## Concept phase, 2026-08-07/08 — the packing MVP

Recorded here because it is history: what was decided, mocked and specced, and
why. The remaining _work_ is listed in CLAUDE.md under "Not built yet"; this
section is the reasoning behind it. Everything below was settled in the clickable
prototype (`dev-docs/UI_Concept_Prototype.html`, driven headless by
`dev-docs/UI_Concept_Prototype.verify.mjs`) before being written up.

Explicitly flagged as open in the entries below — the natural feed for `/next`:

### MVP scope (owner decision, 2026-08-07)

**The goal is a running MVP with the packing feature completely finished — not more
specification.** The concept phase (§3.24–§3.26, North Star) had grown open-ended; it is now
bounded. Two decisions fix the scope:

1. **The surrounding features stay as they are.** M1/M2/M3/M7/M9/M10/M16/M17/M20, Local Mode,
   import/export and the whole backend are _not_ reworked to the new concept (no top-bar
   slim-down, no `Navigation_Concept` rebuild) — they already work. Only what packing needs gets
   touched.
2. **i18n ships with the MVP** (NFR-4.12, now _accepted_): **English is the primary/default
   language, German is fully supported.** The client is currently hard-coded English, so this is
   externalizing ~300 existing strings plus a German catalogue — done _before_ the M4/M5 rebuild
   so the new screens are localized from the start rather than retrofitted. Implemented in-house,
   no `vue-i18n` (footprint justification and revisit trigger in NFR-4.12).

**Sequencing decision (owner, 2026-08-08) — concept first, then the foundation:**

1. **Everything around packing is finished conceptually and as a mockup _before_ effective
   implementation starts.** Reason: every concept round so far has invalidated code that was
   already written — units, quantity formulas, consumables and publish/fork were each built and
   then removed again. Implementing a moving target is the expensive failure this rule prevents.
   Concept and mockup rounds (per the mockup-first agreement) are the work until the owner
   declares the packing concept closed.
2. **When implementation starts, it starts with the domain-free basics** — login, users, code
   base — not with packing features. Note for that moment: much of this already exists
   (OIDC/JWT/JWKS, sync, store, CI); the question to raise then is audit-and-harden vs. rework,
   not build-from-scratch.

Work done _before_ this decision on 2026-08-08 (FR-1.6 relaxation, migration 016) is kept, not
reverted — it is green, and the schema it adds is what the closed §3.27 concept calls for.

**In the MVP, in order:**

- **i18n foundation** — module + both catalogues + M17 switch **done 2026-08-07** (item 16).
- **M4/M5 — concept CLOSED 2026-08-08.** Both are fully mocked and settled; the decisions live in
  §3.25 (FR-25.1–25.17) and UI-Spec G-12, with E2E cases written. Implementation is still open:
  the pure view model (`src/domain/packingView.ts`) exists, the screen itself is not rebuilt yet
  and must be built from the mock and localized with `t()` from the first line.
- **Translate the surrounding screens** — the ~300 existing hard-coded English strings across
  M1/M2/M3/M7/M9/M10/M16/M17/M20. Deliberately sequenced _after_ the M4/M5 rebuild (owner
  decision 2026-08-07): those two screens are being replaced anyway, so translating their old
  markup first would be thrown away.
- **M6** — re-mocked 2026-08-07, **FR-25.6 resolved**: "for whom" is derived from membership and
  shown on one aggregated buy row, not re-entered and not split per traveler. Per-item notes in.
  Grew from there: faceted filter (FR-25.11g), assignee + description at add time (FR-25.12/13a),
  category with master-item autocomplete (FR-25.13b), reveal-bought with who/when (FR-25.11i/j).
- **G-12 (UI-Spec) — new pattern, 2026-08-07:** screen actions live as an icon cluster **in the
  app bar**, replacing the settings gear on detail screens; search collapses behind its icon and
  the filter carries its count. M4 was converted to it and is back to a one-line header. The
  app-bar placement matters beyond tidiness: M4's sub-header collapses on scroll, so a cluster
  sitting there would slide away mid-task (measured, E2E-G12-03).
- **M8 — concept CLOSED 2026-08-08.** FR-25.7 (progressive disclosure, sensible defaults),
  FR-25.13 quick-add, M5-sheet position editing, FR-27.6 scope shaping and FR-27.7 tasks are all
  mocked; the UI-Spec M7/M8 entries were rewritten to match on 2026-08-08 (they still carried the
  "redesign pending" note). Implementation open, sequenced behind the concept per the decision
  above.

- **FR-25.9 Erwachsen/Kind-Mengen — REMOVED (owner decision 2026-08-08,** "es gibt keine
  Unterscheidung von Erwachsenen- und Kind-Mengen"**), and with it the traveler _type_ itself
  (FR-2.5):** a per-person position carries one quantity for everyone; concrete per-person numbers
  are set on the trip (FR-25.8), where the actual people are known. The Adult/Child field was the
  only thing FR-25.9 read, so it went too — asked and confirmed rather than assumed. Prototype,
  PRD (FR-25.9 stub + FR-2.5), UI-Spec M3/M8 and E2E-M3-03 updated. **Implementation open** (not
  started, per the concept-first decision): migration dropping `travelers.profile`, sync whitelist,
  client traveler type and the M3 step-2 control.
- **§3.27 Template composition ("Gruppen") + trip→template round-trip — added to the MVP by
  owner decision 2026-08-08** (explicitly asked whether to park it per the 2026-08-07 scope rule;
  answer: "no, that belongs in the MVP" — this amends decision 1 above for M3/M7/M8). **Concept
  CLOSED 2026-08-08:** mocked end-to-end in the prototype (M7 composition display, M8 groups
  section with cycle guard + resolution footer + blast-radius note, M3 real dedup preview with
  named merges + single-item picker, M2 applied-changes chip, new M21 "Vorlage aus Reise"),
  verified headless (41 assertions), written up as FR-27.1–27.5 with E2E cases M3-11/12, M7-07,
  M8-07/08/09, M21-01…03, FLOW-09. **Second round same day (owner proposal): explicit scopes**
  — every template is a `Gruppe` (items only, includable) or a `Ferien-Vorlage` (groups + own
  items), declared at creation, guarded scope switch; two levels, so include cycles are
  structurally impossible (FR-27.1 refined, FR-27.6 new; M7-08/M8-10 added; 49 assertions).
  **Third round: preparation tasks on template positions** (FR-27.7, owner request) — tasks
  defined at the position instantiate as FR-7.3 todos on the generated trip item (open prep
  blocks "done" via the existing FR-25.2 rule); edits propagate per FR-27.4; M8-11/M3-13
  added. **Fourth round:** FR-25.7 realised in M8 (one-tap add, collapsed "Standard" row,
  Menge + Vorbereitung first, rest behind "Mehr Optionen"; M8-12) and FR-27.8 new (M10
  "Enthalten in" back-references with tap-through, per-trip usage history deliberately
  deferred; M10-05). **Fifth round: cross-trip comment history in M10** (FR-27.9, owner
  request — "die Packliste kontinuierlich von Ferien zu Ferien verbessern"): comments from
  this item's packing rows aggregated with author/trip/timestamp, client-side over synced
  trips, read-only; M10-06. **Sixth round: FR-1.6 publish/fork removed from the MVP** (owner
  decision 2026-08-08, "Jeder sieht einfach alles") — templates/groups are shared
  instance-wide like master items (FR-22.6 model), owner_id stays as creator metadata;
  publish toggle, my/published split and all fork paths gone from prototype and specs
  (parked in the FR-1.6 stub with revisit trigger). **Seventh round: FR-25.13 extended to M8**
  (owner directive, "identisch wie in der Packliste") — the position picker replaced by the
  M4/M6 quick-add pattern verbatim (FAB expansion, master autocomplete, visible scope-labelled
  confirm, Enter, stays open, blur-collapse when empty, duplicate report instead of double
  add, free text creates the master item); M8-13 added, M8-04/M8-12 reworded. **Eighth round:
  position editing = the M5 sheet** (owner directive, "gleich wie in der Packliste-Ansicht")
  — tapping a position opens the M5-pattern bottom sheet with glance chips, FR-25.15
  auto-save chip, Menge + Vorbereitung first and "Details ▾" for the rest; the inline
  expanding row form is gone; M8-14 added. 74 assertions headless.
  **FR-1.6 relaxation IMPLEMENTED end-to-end 2026-08-08:** server — `master.go` pull filter
  and mutation authorization treat templates/template_items like master items (shared;
  `owner_id` still stamped on insert, never rewritten by an editor), `is_published` off the
  sync whitelist and out of the backup filter (the column _stays_ in the schema, dormant, so
  the parked stub needs no migration to come back); client — `Template.is_published` gone
  from the type, store, mutations and portable export, `forkTemplate`/`requiresFork` and the
  `applyReviewProposal({fork})` branch removed, M7 is one shared list without the publish
  toggle, M8's published warning and M14's fork card are gone. Docs (Sync-API §4/§8, UI-Spec
  M18, FR-18.2/18.4) follow. **Schema + sync wiring IMPLEMENTED 2026-08-08 (migration 016):**
  `templates.kind` (`CHECK ('group','template')`, default `template` so existing rows become
  Ferien-Vorlagen), `template_includes` (unique pair, self-include CHECK, index on the
  included side) and `template_item_tasks` (a row per task, _not_ a JSON column — field-level
  LWW would treat a blob as one field and lose concurrent edits); all three on the master
  partition whitelist, shared visibility, FR-27.1's two-level rule enforced in
  `validInclude` (a Gruppe including a Gruppe rejects like any invalid mutation), and a
  template delete now tombstones tasks → positions → includes on both sides. Implementation
  open: `instantiate.ts` include expansion + task
  materialisation, planning-trip refresh diff, M21 screen, portable YAML for includes/tasks
  (FR-18.2), and the M7/M8 client rework. **UI-Spec entry for M21 written
  2026-08-08** (screen inventory + full entry + cross-screen flow 6 in `UI_Spec_v1.10.md`,
  documenting the mocked screen; the test spec's "entry to follow" note is gone).

- **A group onto a running trip (FR-27.10, owner request 2026-08-08) — mocked + specced,
  implementation open:** the M4 quick-add adds **whole groups**, not only items (the owner asked
  to be able to add a group of packing elements while already on the trip, macro photography for
  instance).
  Group suggestions filter as you type under _„Ganze Gruppe hinzufügen“_; one tap runs the same
  resolution M3 does at generation — dedup against the trip's existing rows, provenance stamped
  (so FR-27.5 still recognises them), FR-27.7 tasks materialised as prep todos — and reports the
  outcome. Not flagged _Missing_ on purpose: an added group is a grown plan, not a forgotten item,
  and the flag would feed M14 a false signal. E2E M4-26/27.

- **The packing filter survives the session (FR-25.18, owner request 2026-08-08) — mocked +
  specced, implementation open:** filter, _Erledigte_ switch and grouping are remembered per trip
  for the session (restored before first paint, so M4 never flashes unfiltered). Session-scoped on
  purpose where grouping is durable — a filter hides rows, and a forgotten one reads as "nothing
  left to do" (FR-25.11a); a fresh session starts unfiltered. The search term is not restored.
  E2E M4-28.

- **Phasen-Hub gestrichen, M4 _ist_ der Reise-Screen (owner decision 2026-08-08) — mocked +
  specced:** a trip opens straight into its packing list; the four-phase hub
  (Planen/Vorbereiten/Unterwegs/Danach) is gone from the prototype. Three of its four panels were
  North-Star content with nothing behind them (idea board, day plan, expenses), and its entries
  duplicated M4's G-12 trip line. What was real about _Danach_ survives as M4's **closing card on
  an archived trip**: "Vorlage aus dieser Reise" (M21/FR-27.5, whose entry moved here) plus the
  M14 suggestions. Re-entry point recorded in UI-Spec M4 and `Vision_NorthStar_v1.0.md` §2 so the
  phase model is picked up deliberately when Plan/During get content — the frame then goes _above_
  M4. E2E M4-29, M21-01 reworded.

- **M14 Review-Assistent — Konzeptrunde nachgeholt 2026-08-08 (FR-27.11), mocked + specced:**
  the screen existed only as two hard-coded rows in the dropped phase hub. Now a real screen:
  proposals derived from the trip's FR-9.1 flags, **each targeting the Gruppe the item came from**
  (picker offers groups only; an ad-hoc "fehlte" row defaults to the trip's dominant group), with
  the FR-27.4 blast radius on the row and an applied-change log entry on every planning trip using
  it. **A list with an open count, not a card stack** — that 2026-07-17 decision is superseded:
  a stack hides how much is left, which is what FR-25.11a rejects on the packing list. Applied and
  skipped rows stay visible and marked. Reached from M4's closing card (teaser of two + "Alle N
  prüfen →"), beside the M21 entry: M21 folds back structure, M14 folds back single items.
  E2E M14-04/05. Implementation open.

- **M11 luggage & containers — concept round caught up 2026-08-08, mocked + specced:** three real
  gaps closed. Containers could not be **created or edited** at all (the FAB did nothing here);
  they now use the M5 sheet grammar — name, carrier, limit, pairing, delete, auto-save chip — and
  creation is the FR-24.5 minimal form (FAB creates with a placeholder name and opens the sheet).
  **Pairing was unreachable code** — the seed had no pair, so FR-10.3's imbalance indicator had
  never rendered; the seed now has two paired suitcases, and pairing is set and released on _both_
  sides (a half-set pair renders an imbalance against a container that disagrees). **Assignment
  was a button wall** (one button per container per row, growing with containers × items); it is
  now one tappable row opening the container picker, each option showing its current load.
  Deleting a container **unassigns** its items instead of taking them down with it. E2E M11-05/06.
  Implementation open.

- **M12 Auswertung — Konzeptrunde nachgeholt 2026-08-08, mocked + specced:** two defects found by
  clicking. Tapping a bar only set M4's **grouping**, never the filter — you tapped "Technik ·
  3,2 kg" and got the whole list, with the number you tapped nowhere on screen; it now sets the
  FR-25.11 facet, so the chip names it (FR-25.11a) and the session keeps it (FR-25.18).
  And **per-person items were bucketed under `undefined`**: they carry no top-level `trav`/`qty`
  (those live on the pp entries, FR-25.1), so the Person view invented a group and the weight math
  used undefined quantities. Aggregation now expands each item into (traveler, qty, packed) shares
  — one contribution per traveler by Person, summed back into one bucket by Kategorie/Gepäck.
  E2E M12-04/05. Implementation open.

- **Responsibility ≠ packing record (FR-25.19, owner correction 2026-08-08) — mocked + specced:** the M5
  control read _„Gepackt von · Person“_ but assigned the row (its own hint said „Delegieren löst
  Push aus“), and the FR-25.3 avatar plus FR-25.17 stamp read that same field as a record — so
  delegating to Sia and packing it yourself claimed Sia had packed it. Now two things:
  **Verantwortliche Person** is assigned (push, FR-6.2), **who packed it** is written automatically
  from the acting user and cleared on un-pack. The row keeps **one** right-edge avatar (responsible
  → blue ring, packer → green ring + check); both are named in the sheet and the stamp where they
  differ. M1's "Dir zum Packen übergeben" now reads responsibility. **Implementation open:** a
  second nullable column beside `packer_user_id` for the record. E2E M4-30.

- **Prototype defect found by clicking, 2026-08-08 (pre-existing):** in the M5 sheet a
  per-person item is rendered from a **derived aggregate copy** (`{...raw, …}`), and the action
  handler wrote item-level edits to that copy — so on exactly those rows _responsibility, mode,
  luggage, late-packer, the unused/missing flags and the buy-now undo_ silently did nothing and
  reverted on the next render. Fixed by writing to the stored item; for a plain item the two are
  the same object, which is why it never showed there. **Method note:** the verify suite had
  asserted what the sheet _does to the model_ by setting fields directly, so no assertion ever
  clicked the control — that is how it survived. The new cases drive real clicks.

- **Rows assigned to somebody else are hidden by default (FR-25.20, owner request 2026-08-08) —
  mocked + specced:** M4 opens on your own work; rows whose FR-25.19 responsible person is someone
  else are filtered out, unassigned rows always stay (nobody claimed them, so they are everyone's).
  Never silent — a reveal bar at the foot names the count and the people, mirroring FR-25.2's done
  bar, and the switch joins _Erledigte_ in the filter panel (both render from one shape now). The
  header stays unfiltered per G-12, which is what makes a short list safe. Session-scoped like the
  rest of the view (FR-25.18). E2E M4-31. Implementation open.

- **Konsistenz-Durchgang 2026-08-08 (owner request).** Method: every visible control on every
  screen was clicked in isolation on a freshly loaded page and checked for _any_ effect on DOM,
  view or model — 258 controls; then the specs' concrete claims were probed against the mockup.
  Note on method: the first pass compared DOM _lengths_ and therefore missed class swaps (a
  segment moving its `sel`), which produced false positives until it compared the DOM exactly.
  **Two dead controls found and fixed:** the M3 "+ Neue Serie…" chip opened a native `prompt()` —
  the only place in the app that left the inline-capture pattern (FR-25.13), and on a phone the
  modal interruption the concept avoids everywhere else; and the FR-14.2 history suggestions in
  M3 step 4 offered "→ 6 übernehmen" next to a 6, a button that could not change anything, now
  rendered as a confirming line instead. **Three questions raised for the owner** (see below /
  session notes): §3.20 item dependencies are implemented in code but absent from the concept;
  M2's ordering contradicts its own spec entry; "Verantwortliche Person" (M5) and "Zugewiesen an"
  (M6) name the same thing differently. Everything else the specs claim is realised was found
  clickable.

- **Die drei Fragen des Konsistenz-Durchgangs, beantwortet 2026-08-08 (owner) und umgesetzt:**
  - **§3.20 dependencies stay — mocked after the fact.** M10 lists _Hängt ab von_ with a
    nötig/empfohlen toggle and, read-only, _Wird gebraucht von_; the M4 quick-add pulls required
    companions onto the trip and says so, and skipping an item co-skips them with the reason
    naming the parent (FR-20.1/20.2/20.4). The feature had been shipped since 2026-07 but was
    invisible in the concept, so the rebuild would have dropped it.
  - **M2 wird flach.** No series grouping; ordering by usefulness rather than literal
    newest-first: active trip on top, upcoming **soonest first** (a trip in three weeks beats one
    in eighteen months, which date-descending would rank above it), archived newest first. The
    series moves onto the row as a chip and stays the entry to M16; the optional grouped view is
    dropped. E2E M2-06.
  - **Ein Begriff: „Zugewiesen an“** in M4/M5 and M6 alike, replacing „Verantwortliche Person“ from
    the FR-25.19 round the same day. The substance of FR-25.19 — assignment vs. automatic record —
    is unchanged; only the word is now shared with the shopping list, which had it first.

- **Inventar-UX-Runde (owner directives 2026-08-08, mocked + specced):** M9 is **lean by
  default** (primary-tag avatar + name); which extras show (Tags/Gewicht/Preis) is a
  device-local preference behind an eye icon with a settings sheet (FR-24.4 new). M10
  **creation is a minimal form** (name + tags, Gewicht/Preis behind "Mehr ▾"; the
  existing-item sections Enthalten-in/Kommentare/Löschen are absent until the item exists
  — FR-24.5 new). Tag capture is a **filter-or-create search field** (FR-24.1 refinement; typing filters chips, ＋/Enter creates unmatched names). E2E M9-01/05, M10-01/07/08 + matrix. Implementation of the two FRs is open
  (client M9/M10 rework).

- **FR-1.8 Units — REMOVED end-to-end (owner decision 2026-08-08, "we only have
  pieces"):** `items.unit` dropped (migration 015), sync whitelist trimmed, portable YAML
  `unit` field gone (legacy files import fine — unknown fields ignored, FR-18.5), client
  type/editor/inventory/quick-add cleaned, prototype unit chips and M10 segment removed,
  G-6 unit-label clause void. All suites green.

- **FR-1.3/1.5 Mengenformeln — REMOVED end-to-end (owner decision 2026-08-08,** "entferne
  all das Formel-Zeugs"**):** quantities are plain integers everywhere. Migration 014 rebuilds
  `template_items` (`quantity_formula` → `quantity INTEGER NOT NULL DEFAULT 1`) and
  `item_dependencies` (`quantity_formula` → nullable `quantity`), numeric legacy values carried
  over, formula strings folded to 1; sync whitelists renamed; portable YAML `quantity` is a
  number with FR-18.4-tolerant import of legacy strings (Go `portable.Quantity` unmarshaller +
  client `coerceQuantity`); client `formula.ts` deleted, `computeQuantity` simplified,
  clone re-evaluation retired (quantities carry over), M8 gets a numeric stepper; prototype
  formula engine removed (stepper in the M5-sheet, wizard step 4 shows template quantities +
  FR-14.2 history suggestions); docs: FR-1.3/1.5/15.3 retirement stubs, FR-2.1a/12.2/18.2/20.x
  adjusted, test spec M8-01/M3-08 + matrix updated. All suites green (go -race, 428 vitest,
  build, lint, 76 prototype assertions).

- **FR-1.7 Consumables — REMOVED end-to-end (owner decision 2026-08-08, "I don't need that
  feature"):** consumable flag _and_ the per-day unit/rate it fed. Migration 013
  rebuilds `items` without `is_consumable`/`per_day_rate` (unit CHECK narrowed to
  pieces/pairs, `per_day` rows folded to pieces), sync whitelist trimmed, client UI (M9
  chip/filter, M10 toggle + rate field), `instantiate.ts` per-day branch, prototype and all
  docs updated (FR-1.7 removal stub, FR-1.8 narrowed). Per-day needs are plain quantities now,
  adjusted per trip in M3 step 4. All suites green after removal.

**Parked until the MVP ships** (specified, not deleted — do not start these):

- **§3.24 Item tags & lifecycle-aware delete** (FR-24.1–24.3) — needs a migration and changes the
  item model without making packing better.
- **§3.26 Calendar reminders / iCalendar feed** (FR-26.1–26.6) — own endpoint, own security model,
  four open questions.
- **North-Star phases** (`Vision_NorthStar_v1.0.md`) — directional only, drives nothing now.

Independent of the MVP:

- **UI test suite (Playwright E2E)** — `dev-docs/UI_Test_Spec_v1.0.md` is written and the harness is
  scaffolded (`client/e2e/`, `playwright.config.ts`, smoke spec, CI job); the per-screen cases are
  not implemented. Sequencing note: the M4/M5/M6/M8 cases get rewritten by the redesign, so writing
  them before the concept locks is wasted work.
- **OIDC login flow UI polish** — token auto-refresh is done (item 5); the login/callback pages are functional but unpolished.
- **NFR-4.2a conflict-log compaction on archive** — no server trigger since archiving became a plain `trips.status` mutation (M14 note, spec §8).
- **FR-16.3 dedup prompts for the server-side YAML import endpoints** — the client M18 flow has them; the raw `POST /templates/import` / `POST /trips/import` API does not (item 4).
- **M11 imbalance threshold UI** — the per-trip override (`attributes.imbalance_threshold`) exists, but no UI sets it.
- **M12 per-slice deep filters** — tapping an analytics slice opens M4 grouped by that dimension, but not filtered to the slice.
- **TypeScript 7 bump** — blocked by vue-tsc incompatibility (dependabot PR #4 left open).

Deliberate cuts (revisit only with cause): M15 XLSX support (CSV only, NFR-4.3, spec §8); avatar-style pan/zoom crop for item photos (FR-22.3 keeps aspect ratio); no backfill for rosters of trips created before migration 009 (recreate or re-share affected trips, consistent with 005/006).

## Basics audit, 2026-08-08 — one toolchain

Owner decision after the concept merged (PR #51 / `259fdac`): the build starts with the
domain-free basics, and because login/users/sync/CI already exist and are green, the mode
is **audit-and-harden, not rework**. First finding, and the one that had to go first
because it is the _verification_ command everything else leans on:

- **`flake.nix` and `mise.toml` pinned the same three tools to different versions.** Worse
  than the "two mechanisms for one job" the backlog item described. The devShell listed only
  `x86_64-linux` and `aarch64-linux`, so on the maintainer's darwin machine it could never
  have worked at all; it pinned `go_1_25` where `mise.toml` said 1.26; and it took
  `golangci-lint` unpinned from `nixos-unstable`, which is the bare-tag pattern invariant 8
  forbids everywhere else. **`flake.nix` + `flake.lock` deleted**, mise is the single
  mechanism, and its comment now names which CI field each version mirrors.

- **The local toolchain diverged from CI, latently.** `ci.yml` resolves Go through
  `go-version-file: go.mod` (1.25.0) while mise installed 1.26 — both green, so nothing was
  failing, but the Makefile exists precisely to keep local and CI in step, and `gofmt` output
  has changed between Go releases before. A `fmt-check` that can be green locally and red in
  CI defeats the target's whole purpose. Resolved in the direction the owner chose:
  **`go.mod` 1.25.0 → 1.26.0**, so CI, mise and the `golang:1.26-alpine` build image now
  agree. `go mod tidy` was a no-op beyond that line and `go.sum` did not move.

- **`make ci` now works from a plain shell in a fresh clone**, which is what CLAUDE.md
  promises. The Makefile probes for `go gofmt golangci-lint node npm`; if all are present it
  calls them directly (`RUN` empty, recipes unchanged), otherwise it prefixes every recipe
  with `mise exec --`, and if mise is missing too it stops at parse time with an instruction
  to install it instead of `go: No such file or directory`. All three paths were exercised
  with a stripped `env -i` PATH, including really building through the re-exec, not just
  `make -n`.

No ADR: the choice was forced rather than weighed — one of the two mechanisms could not run
on the maintainer's platform and violated an existing invariant.

## Basics audit, 2026-08-08 — FR-23.1 required an unverified claim

Second finding of the auth-path audit, and a live privilege-escalation path rather
than a latent one.

`authed` (`server.go`) re-derived the instance-admin role on **every** request from
`s.isAdminEmail(emailClaim(claims))`, and `email_verified` did not appear anywhere in
the repository. OIDC Core §5.7 is explicit that `email` carries no verification
guarantee by itself — `email_verified` does — so against an IdP with self-service
profiles, any account could set its address to the one in `JITPACK_ADMIN_EMAILS` and
be stamped `is_instance_admin = 1` on its next request, with the admin surface
opening immediately. The driving test confirmed it before the fix: `GET
/api/v1/admin/users` answered 200 with `"is_instance_admin":true` both for
`email_verified: false` and for a token with no such claim at all.

The fix is small because the allowlist was the only consumer: `isAdminEmail` now
takes the verification flag and requires it, and `emailVerifiedClaim` reads the claim
as a JSON bool or the string `"true"` (providers differ), treating everything else —
absent included — as unverified. Both call sites, the `authed` middleware and the
OIDC broker's JIT provisioning in `auth.go`, were updated.

Two properties worth keeping in the tests: the role is _re-stamped_ per request, so
withdrawing verification has to take the role away again rather than leave a permanent
admin behind; and the tests assert the consequence — whether the admin-only surface
opens — instead of reading `users.is_instance_admin`, so they still describe the rule
if the storage changes.

**Operator consequence, recorded in FR-23.1:** an IdP that does not release
`email_verified` now grants no instance admin at all. That is the correct default —
the alternative is trusting a self-declared address — but it is a behaviour change for
an existing deployment whose IdP omits the claim.

Still open from this audit, deliberately not fixed here because it needs a
compatibility decision: neither `authed` nor the OIDC broker validates `aud` or `iss`,
so on a shared IdP a token minted for a different application validates here.

## Basics audit, 2026-08-08 — first-party sessions (ADR-007)

Owner directive during the audit: **Authelia is the reference IdP — where it
prescribes something, JIT-Pack conforms.** Held against that, the auth layer was
wrong at its root, not at its edges: the broker passed the IdP token set through
and `authed` validated the IdP _access token_ per request, reading identity out
of it. Authelia's access tokens are opaque by default, carry no identity claims
unless a claims policy copies them in, and their `aud` is the introspection
endpoint — the owner's real deployment (`access_token_signed_response_alg:
"none"`, no claims policy) could never have run this flow. Meanwhile the ID
token, the credential actually minted for this application, arrived in every
token response and was discarded unread.

Rebuilt per ADR-007 (options weighed there: JWT access tokens, introspection,
first-party sessions):

- **Login** (`/auth/token`): confidential-client code exchange
  (`client_secret_basic` — the secret finally exists, `JITPACK_OIDC_CLIENT_SECRET`),
  ID token validated against the discovered JWKS with `iss` and `aud` = client id
  (closing the audit's Finding B at the only place identity is established),
  identity from UserInfo (sub must match the ID token per OIDC Core §5.3.2),
  then JIT-Pack's own tokens: 15-min HS256 access (`sub` = `users.id`) + rotating
  single-use refresh token, SHA-256-hashed into the new `sessions` table
  (migration 017). The IdP token set never reaches the client.
- **Refresh** (`/auth/refresh`): peek → replay the stored IdP refresh token at
  Authelia (4xx deletes the session, 5xx/network leaves the chain untouched —
  offline is normal) → re-read UserInfo, re-stamping FR-23.1 at refresh cadence →
  rotate own token, slide the 90-day expiry (NFR-4.4). Replayed links die.
- **Per request**: `authed` shrank to signature check + FR-23.3 deactivation
  lookup. No JWKS, no `EnsureOIDCUser`, no identity mapping — `NewWithJWKS` and
  `mapOIDCSubject` are gone.
- **Config**: clean break, owner-approved. `JITPACK_SESSION_SECRET` required in
  multi-user mode; OIDC group is issuer + client id + client secret, everything
  else via `/.well-known/openid-configuration` at startup (which also closed the
  gap that no UserInfo URL was configurable at all). `JITPACK_JWT_SECRET`,
  `JITPACK_JWKS_URL`, `JITPACK_OIDC_TOKEN_URL`, `JITPACK_OIDC_AUTHORIZE_URL`
  deleted.
- **Client**: zero changes — the wire shape of `/auth/token`, `/auth/refresh`,
  `/auth/config` is identical; `expires_in` 3600 → 900 is absorbed by the
  existing proactive refresh. Verified against `client/src/auth/`.
- **Specs**: Sync-API §2 rewritten (it had promised the pass-through), FR-23.1
  moved to the UserInfo source with revocation-at-refresh semantics, README got
  the stock Authelia client block (identical shape to the owner's other
  clients, `"none"` algs included).

The fake IdP in `auth_test.go` serves discovery, JWKS, token and userinfo and is
steerable per test (wrong `aud`/`iss`, forged key, missing id_token, 4xx vs 5xx,
rotating IdP refresh tokens). The FR-23.1 table from the `email_verified` fix
carries over against UserInfo, plus revocation-at-refresh. Store sessions are
clock-injected throughout — an earlier draft of `CreateSession` called
`time.Now()` internally and promptly broke its own purge test; the parameter is
what makes the expiry tests deterministic.

## Basics audit, 2026-08-09 — failure-path coverage

Third audit field: not the coverage total (the gates were green throughout) but
whether the rules that enforce authorization and correctness cover their
_rejection_ branches — CODING_PRINCIPLES §2's "an uncovered branch in merge
logic fails review regardless of the total".

Method worth keeping: the gate profile is per-package, so functions exercised
only through another package's tests read as 0 % — `store.IsInstanceAdmin`
looked dead while `adminOnly` covered it from the api tests. A second profile
with `-coverpkg=./cmd/...,./internal/...` separates real gaps from that
artifact. After filtering plain `if err != nil` plumbing (untestable without
fault injection, and not what the rule is about), **17 genuinely uncovered
behavior branches** remained; all are covered now:

- **FR-4.7 / §5 visibility:** roster rows invisible to non-members; the deny
  sides of `CanManageTravelers` (non-member) and `IsTripCreator` (unknown trip,
  legacy NULL creator).
- **FR-13.2 destination chain:** missing and unknown parents deny cleanly for
  the owner too (`ownsAll` empty-set / no-rows); profile deletes tombstone
  their checklist items — the middle level beside the already-tested series
  cascade.
- **FR-27.1 includes:** the full two-level table — missing/unknown ends, group
  as parent, template as child.
- **FR-27.7:** deleting a position tombstones its tasks.
- **§4 pagination:** `has_more` + cursor advance + cursor hold on an empty
  page, and the page-window rule twice (roster row and series deleted beyond
  the window must not leak as live; the tombstone follows) — the second one is
  what finally exercised `ownedBy`'s no-rows branch, and both document real
  protocol behavior rather than chasing a percentage.
- **Broker contract:** 422 shapes, refresh-501, ID token without subject,
  UserInfo outage at login (502, no half-provisioned user), and a session
  token without `sub` (invariant 3: attribution always resolves to users.id).

Left uncovered deliberately, with reasons: the defensive `return false` tails
of `authorizeMaster`/`masterVisible` and `memberTrip`'s unresolvable branch
(unreachable through the public API — `validate` and `authorizeMaster` gate
earlier), `EnsureOIDCUser`'s concurrent-provisioning race arm and
`RotateSession`'s rows-affected race arm (both need a mutation between two
statements of one call — not deterministically reachable, and the race rule
forbids probabilistic tests), and DB-error plumbing throughout.

## Basics audit, 2026-08-09 — supply-chain pinning (NFR-4.3 / invariant 8)

Fourth audit field. The established surfaces were already clean — Actions by
full commit SHA, Docker bases by digest, `go mod verify` green, npm via the
lockfile — but the docs restructure had quietly opened a new one: the MkDocs
toolchain installed via pip with only `mkdocs-material==9.6.14` pinned. The
version pin held for one package; every transitive (mkdocs, jinja2, pygments,
…) resolved to whatever was newest at build time, unverified — exactly the
bare-tag pattern invariant 8 forbids, on the pipeline that publishes the
manual.

Closed with the same shape the other ecosystems use: `docs/requirements.in`
is the human-edited input, `docs/requirements.txt` is compiled from it with
`uv pip compile --generate-hashes --universal` (354 hashes, transitives
included), the workflow installs with an explicit `--require-hashes` so an
unhashed edit fails instead of silently reopening the gap, and Dependabot
gains the `pip` ecosystem so the pins stay fresh like all the others.
Verified by building the site strict from a fresh venv off the hashed set.

Also checked and fine as-is: the only npm packages with install scripts are
the two `fsevents` copies (macOS watcher, optional), which npm blocks by
default — no allowlist needed until something else appears.

## M19: the server URL arrives pre-filled (FR-19.1)

Found while deploying the compose stack for manual testing: the first-launch
screen offered an empty field with a `https://jitpack.example.com` placeholder,
so every tester had to type their own address before Connect became clickable —
and the one plausible-looking wrong answer, the backend port, is exactly what
`docs/getting-started.md` already needed a warning box against.

The right default was never ambiguous. The API sets no CORS headers, so a
self-hosted instance _must_ serve the SPA and the API from one origin (that is
what `client/nginx.conf` is for). `window.location.origin` is therefore correct
by construction in every real deployment, and the two exceptions are both
explicit: a build-time `VITE_API_URL` still wins, and the Vite dev server keeps
pointing at `http://localhost:8080` because there the two genuinely do split.

The logic sits in `defaultServerBaseUrl()` in `client/src/config.ts` rather than
in the component, so it is a pure function with a unit test; `ModeSelectionPage`
just seeds its ref from it. `serverBaseUrl()` now shares that fallback instead of
repeating the literal.

Both new tests were run red against the old implementation before being kept —
the vitest cases fail with `http://localhost:8080`, and the e2e case
(E2E-M19-04) fails the same way on Chromium _and_ WebKit. That mattered here:
the natural `toBeEnabled()` assertion on the Connect `ion-button` is false-green
(the custom element is never "disabled" in the DOM sense), so the case asserts
the input's value and reaches through to the inner `button`.

## Migrations 018/019: the two schema debts the concept left open (FR-25.9, FR-25.19)

Item 5 of "Not built yet", cleared 2026-08-11 on owner instruction. Both
migrations turned out to be one statement each — the owner's steer was explicit:
still in development, so the pragmatic route that loses no data, not a ceremony.

**018 — `travelers.profile` is gone.** The first draft was migration 004's
twelve-step table rebuild, on the assumption that SQLite refuses `DROP COLUMN`
while a `CHECK` names the column. Tried it against the real driver before
writing it: `ALTER TABLE travelers DROP COLUMN profile` succeeds, rows intact.
The rebuild would have been thirty lines of risk (two inbound foreign keys) for
nothing. Unlike `outbound_packed`, which stays inert because nothing asks for
it, this field was on the sync whitelist and on a screen — so it goes rather
than lingering: schema, whitelist (a client still sending it is now _rejected_,
not ignored), the portable YAML type, the client traveler type, and the M3
step-2 Adult/Child segment. A trip exported before this still imports; yaml.v3
ignores unknown keys, so the retired field is dropped rather than refused, and
the api export round-trip test was left carrying `profile: adult` on purpose as
the proof.

**019 — `packed_by_user_id` beside `packer_user_id`.** The interesting half.
`stampActor` used to write `packer_user_id` on `state=packed`, which is exactly
the conflation FR-25.19 corrects. Now: `packer_user_id` is the assignment and is
the client's to set (which is also what makes the FR-6.2 delegation notification
read correctly — it fires on a deliberate assignment and nothing else), while
the record is server-owned. Three rules, all tested: set from the acting user on
`packed`, cleared on any other state (FR-25.17 — a stamp must not outlive the
state it describes), and **stripped from every `trip_items` mutation before
either**, so it cannot be forged on a push that touches no state at all. That
last one is the invariant-3 case and it does not follow from the first two.

The backfill copies `packer_user_id` into the record for rows already in state
`packed` and touches nothing else: on those rows the person genuinely was the
packer, while inventing a record for an unpacked row would claim work nobody
did.

Two things worth keeping:

- `migrate` grew a `migrateTo(db, target)` seam so a test can stage a database
  at 018 and assert what 019 does to real rows. A migration that transforms data
  is behaviour, and behaviour that only ever runs against an empty schema in
  tests is untested.
- Changing `addTraveler`'s signature dropped a positional argument, and
  `vue-tsc` was happy: the old third argument `'child'` slid silently into
  `linkedUserId`, both `string`. Only the test caught it. The three production
  call sites were correct; the lesson is that a positional signature change is
  not type-safe when the neighbours share a type.

Not built here, deliberately: the M4/M5 presentation of the split — the two
rings and „gepackt von Andy · zuständig war Sia“ — belongs to the screen
rebuilds. No `.vue` file reads either column today, so there is no half-built
surface left behind.

## Brand mark: Check-Latch → Packed Backpack (2026-08-12)

The owner rejected the Check-Latch mark and asked for playful, simple
variants in the spirit of the skipper-cd logo. Six directions were
explored (backpack, suitcase-in-motion, cube stack, tote, checklist,
luggage tag), then four backpack refinements; the owner picked the
original open-backpack motif: an open backpack with two packing cubes
peeking out, thick rounded lavender outline, teal/peach cube accents —
all Catppuccin values, matching the app's own palette.

Where it landed, and why that shape:

- `client/public/favicon.svg` and `docs/assets/mark.svg` carry the mark
  on its Mocha tile. The dark tile makes the icon self-contained on any
  background, so the favicon's previous `prefers-color-scheme` handling
  became unnecessary and was dropped.
- `BrandMark.vue` stays tileless and reads every color from `--ct-*`
  tokens, so the in-app mark follows the active Mocha/Latte flavor
  (G-11, invariant 9) instead of hard-coding one flavor's values.
- `docs/assets/logo-light.svg` / `logo-dark.svg` remain the wordmark
  lockups (Latte/Mocha text); `mkdocs.yml` now points its header logo
  and favicon at the square `mark.svg` instead of scaling down the
  300px-wide lockup.

No ADR: an aesthetic choice among equivalent options, not an
engineering tradeoff. No spec update owed: neither the UI-Spec nor the
manual describes the mark's artwork.

## Navigation: the back button that was built but unreachable (ADR-011)

Reported by the owner while looking at M3 — a back button is missing. It was
there: `TripWizardPage.vue` has an `IonBackButton` with a `default-href`, and so
do sixteen other screens. Measuring instead of reading the stylesheet found why
nobody had ever seen one.

`App.vue` renders the global header, then `.app-body` holding the router outlet.
`.app-content` has no `position: relative`, so Ionic's absolutely-positioned
`ion-router-outlet` resolves against `ion-app` and covers the whole viewport:

```
.app-body      0,56  430x844      correct, below the header
.app-content   position: static   ← the cause
ion-page       0,0   430x900      escapes, covers the full window
```

Each drill-down's own header therefore lands at `y=0`, under the global one.
`isVisible()` says true — Playwright does not test occlusion — but `click()`
times out against the covering bar. That distinction is the whole diagnosis, and
it is why the earlier screenshots showed no page titles either.

The one-line CSS fix would have left two stacked bars, 112 px of chrome, on a
product whose §3.25 decision is that the bar stays low and M4 hides the tab bar
to buy height. So the layout bug forced an architectural question rather than
being the whole of it. ADR-011 weighs the three options; the owner chose one bar
whose left slot switches — logo on the four tab roots, `‹ back` + title
everywhere else, sync glyph and settings unconditional on the right.

The accepted cost is real and worth restating: **G-9's "home from anywhere" is
gone.** It was load-bearing — Navigation_Concept §7's cold-start deep-link case
named the logo as the guaranteed escape. That guarantee moves to a back-target
contract: every non-root route declares its parent, so `‹ back` leads somewhere
real even when history has one entry. §7's former _proposal_ is now binding, and
the declaration belongs in `router/index.ts` where a missing parent is visible.

Concept and specs are updated ahead of the code, deliberately — the owner asked
to sharpen the concept before anything is built. Nothing in `client/` changed
here.

## One header bar, built (ADR-011)

The implementation of the decision recorded a day earlier. `App.vue` renders the
only `ion-header`; the seventeen per-screen headers are gone. Its left slot is
the logo on a tab root and `‹ back` plus the title elsewhere, and `.app-content`
finally has the `position: relative` that stops Ionic's outlet from escaping.

**The back target comes from the route, not from history.** `meta.parent` is a
path pattern filled from the current route's params (`router/backTarget.ts`).
Two tests guard it: the resolution itself, and a sweep over the _real_ route
table asserting every non-root route declares a parent — which is what makes
"someone adds a screen without a way back" a failing build rather than a thing
noticed months later. That sweep carries a second assertion that it inspected
more than ten routes, so a broken flattening cannot make it pass vacuously.

**Two bugs surfaced while building, neither of them the one we set out to fix.**

_The title vanished on M4._ Coming from the wizard, the header rendered empty. A
single shared ref for the dynamic title looked obvious and was wrong: Ionic keeps
the outgoing page mounted through the transition, so the wizard's `onUnmounted`
fires _after_ M4 has set its title and wiped it. Titles are now keyed by route
path, which makes the outcome independent of unmount ordering instead of racing
it — the same reflex the no-timing rule asks for. Five unit tests pin the
ordering, including the late-unmount case directly.

_The desktop rail rendered at every width._ Pre-existing, and visible on the
deployed build too — checked before assuming it was mine. `.desktop-nav` in
`App.vue` (specificity 0,1,0) never beat `NavRail.vue`'s scoped `.nav-rail`
(0,2,0), so `display: none` never applied and the media query was decorative.
The breakpoint moved into the component that owns the rail; `App.vue` no longer
has an opinion about it, so there is one place rather than two. The concept's
Part II claimed the old behaviour as "as built" and has been corrected.

**On the e2e cases.** `E2E-G9-01`/`-02` were already taken, so the new unit is
`-03` … `-07`; the collision would have gone unnoticed until someone searched by
id. Every case **clicks** rather than asserting the control is visible, because
`toBeVisible()` is exactly what passed all along on the occluded build. Verified
red against a deliberately broken `goBack` before being kept.

`E2E-G9-01`'s "Logo is a home link to M1 from within a trip" is retired in the
same pass — the clause the ADR knowingly gave up.

## A pre-existing Ionic transition error, found by asserting for it

Deploying merged `main` and driving the seeded trip surfaced an uncaught
`TypeError: Cannot read properties of undefined (reading 'classList')` on the
way back from a trip to the trip list. The navigation itself works — the URL
changes, the list renders — so nothing in the suite had ever noticed.

The first diagnosis was wrong and worth recording as such. `goBack` asked Ionic
for the `'pop'` action, and since the declared parent is frequently _not_ the
entry Ionic pushed (a deep-linked child has no such entry at all), unwinding a
stack that does not match looked like an obvious cause. Changing it moved the
message from `classList` to `ionPageElement` — a symptom shifting, not a fix.
Trying all four variants (`'back'`, no direction, `router.push`, `router.replace`)
produced the error every time, which ruled out the call shape entirely.

**It predates ADR-011.** Built the commit before the one-header change, drove
list → trip → _browser_ back, and got the identical error. The single header bar
did not introduce it; it made the path a one-tap affordance instead of a
gesture, and the new assertion made it visible. The real shape is Ionic
animating from a root-outlet page back to a route that lives inside the nested
tabs outlet.

What ships here is therefore smaller than "a fix": the `'pop'` action is dropped
because it is wrong on its own terms — the parent is not the popped entry — and
E2E-G9-08 covers the round trip entered through the list, which nothing else
did. The known error is **filtered by its whole dereference, not by property name**,
so a new runtime error still fails the case — matching bare `classList` would
have swallowed a genuine error of ours that merely mentions the property. Chromium and WebKit word the same
failure differently (`reading 'x'` vs `undefined is not an object (evaluating
'o.x')`), which the first filter missed and WebKit caught.

Left open deliberately: the Ionic transition itself. It is cosmetic today —
nothing user-visible fails — and chasing a cross-outlet animation bug in a
minified dependency is its own piece of work, not a rider on this one.

## M4, built from the mock

The first screen rebuild (backlog item 3). The concept has been settled since
2026-08-08 and mocked in the prototype; this is the same screen in Vue, with
the arithmetic where it can be tested and the wording where it can be
translated.

**The view model came first, and grew three axes.** `packingView.ts` already
carried clustering, hide-done and the mode counts from the concept phase —
written then, never wired to anything. It gained the facet filter (OR within,
AND across), the FR-25.20 default that hides other people's rows, and the fold
state, and lost its own mode filter: FR-25.4's pill strip is the _Beschaffung_
facet now, and keeping a second path to the same question is how two filters
start disagreeing.

Three rules there are worth stating because getting them wrong is invisible on
screen. Facet counts run against the _other_ active facets but not the value's
own, so a number says what picking it would yield rather than what is already
shown; a selected value survives at zero, since a filter you cannot undo from
inside the panel is a trap; an unselected dead end is not offered at all. The
FR-25.20 reveal bar counts only what revealing would actually show — the mock
counts over the unfiltered set, which promises rows that one tap does not
deliver, and that is a deliberate deviation. And `narrowed` carries FR-25.11e
in one flag, so the component cannot re-derive "is anything hiding rows?" per
empty state, which is exactly how the original implementation came to announce
"Alles gepackt" over an unmatched search.

**FR-25.17 needed a column.** „gepackt von Andy · heute 14:32" wants a _when_,
and nothing on the row could stand in: `updated_hlc` is the last touch of any
kind, so a comment added afterwards would redate the packing. Migration 020
adds `trip_items.packed_at`, stamped and cleared by `stampActor` with the
record it belongs to. One deliberate difference from the user id beside it: a
client-supplied RFC 3339 value is _kept_, because packing happens offline and
the envelope can land days later. A clock is not an identity claim — invariant
3 governs actors and foreign keys — and `packing_now_at` has taken client
values since it was written. Unparseable values are replaced rather than
trusted, so the column always holds a real instant. Rows packed before the
migration keep their packer and get no time; the screen names the packer alone
there rather than inventing one.

**What the screen dropped.** The KPI tile strip, the grouping segment bar and
the two filter toggles are gone — none survived the redesign. The separate
"consciously skipped" section went with them: FR-25.2 counts a skipped row as
done, so it is revealed by the same _Erledigte_ switch as a packed one, and two
mechanisms for one class of rows would have shown them twice with both on. The
UI-Spec's Elements list still described that section and has been corrected.
Archive kept its app-bar button although the mock has no such control anywhere:
it is the only path to M14 today, and matching a mock that never modelled
archiving would have removed a working feature.

**Three defects surfaced while writing the Playwright unit, none of them test
artefacts.** Tapping a row's checkbox opened M5 _and_ packed the row, because
the control sits inside a row that is a link. The first tap after adding an
item was swallowed entirely: the quick-add collapsed on blur, which removes a
block from the flow above the list, so the rows moved between pointer-down and
pointer-up and the browser dispatched no click at all — the form now closes
only when asked to, which FR-25.13a permits and which is the better trade
against a list that ignores one tap in a place nobody would look for it. And
the filter sheet's footer — the outcome line and _Zurücksetzen_, the two things
FR-25.11b puts there — sat below the viewport, because Ionic's drag breakpoints
keep the modal box full-height and translate it down; the sheet is sized and
anchored instead.

**Found and not fixed:** in Local Mode a trip's _items_ do not come back after
a reload, though the trip itself does and the rows are demonstrably in
IndexedDB (`jitpack-local` / `rows`). It is the local persistence path rather
than the packing list, so it was reported instead of being repaired inside an
M4 change; the one e2e case that would have crossed it was rewritten to leave
M4 through the app instead of reloading, and the fresh-session half of FR-25.18
is asserted in the `usePackingFilter` unit test, where it is deterministic.

**No `docs/` page.** The manual covers running an instance and stops before the
UI on purpose, because most screens are still being rebuilt; a page for M4
alone would be an island next to M5, M9 and M11 that do not have one. It is
owed as a set once the rebuilds land, and this is the note that says so.

## What hand-testing M4 turned up — and why the suite had not

The maintainer opened the rebuilt screen and hit four things in a row: the
desktop rail did nothing, mobile had no navigation at all, `‹ back` did
nothing, and the search icon kept filtering a screen he had already left. A
fifth complaint — "my trip wasn't persisted" — turned out to be two more
defects wearing that costume.

His verdict on the process is the important part and is now in the working
agreement: _this would not have happened to you if you had written proper e2e UI tests —
they are always part of the job._ He is right, and the failure mode
is specific: the M3 and M4 units were both green throughout. A per-screen
suite proves the screen. Nothing exercised getting to it, leaving it, or
what the app bar did afterwards — and the cases for exactly that
(E2E-G1-01, G9-01…08, G12-01) had been _written_ since the UI-Test-Spec was
drafted and never implemented. A specified case nobody runs is a comment.

**One cause under three symptoms.** The four anchors lived under an
`IonTabs` layout, which carries its own router outlet, while every other
route rendered in the root one. Crossing between them left the outgoing
page painted while the URL moved on — so the rail, the tab bar and back
all "did nothing" in the only sense a user cares about. It also threw the
`classList` error that a session in August reproduced on the pre-ADR-011
build and filed as _cosmetic_; it was this, and the exemption in
`navigation.spec.ts` was quietly hiding the evidence. ADR-012 removes the
second outlet, `TabBar.vue` becomes plain links beside the one that
remains, and the exemption is gone with the error.

**"Not persisted" was two defects, neither of them persistence.** The rows
were in IndexedDB and on their way into the store the whole time. First,
M4's app-bar actions were `<Teleport>`ed into the header's DOM — which
Ionic relocates after mount — so on a cold boot Vue patched a container
that had moved and threw `emitsOptions of null` mid-patch, aborting the
render. An empty screen reads as lost data; it was a crash. Actions are
now _described_ (`useHeaderActions`) and the header owns its own DOM, the
same shape `useHeaderTitle` already had. Second, and genuinely a
durability bug: the Local Mode save was fire-and-forget, so a row added
and immediately followed by a reload went into a transaction the
navigation cancelled — FR-19.2 promises durability and the app said
"saved" while the write was still open. Writes are serialised now, and
the G-2 indicator reports _syncing_ until the write lands.

That last part is also what made the case testable without a sleep. The
rule the suite already had — no waiting on durations — forced the right
fix rather than a longer timeout: if there is nothing observable to wait
for, the missing signal _is_ the defect.

**The duplicate that hid behind back.** With the outlets merged, `‹ back`
still left two live instances of the trip list, because it navigated with
the default _push_. The stale instance kept winning the header's action
registry, so the search field rendered on a page nobody could see. Back
replaces now.

**A sample trip, and what it is not.** `src/dev/sampleTrip.ts` seeds an
active trip with categories, both buy modes, a late packer and two
per-person clusters. It is dev-only (`import.meta.env.DEV`), so it leaves
the production bundle entirely, and E2E-G8-02 asserts that — Demo Mode was
removed in Addendum v2.10 as a _product_ surface and is not returning
through a side door. It lands through the existing M18 portable-import
path rather than a second way of building a trip, and `activateTrip` had
to be added because the wizard only ever produced planning trips: until
now nothing in the app could move one to _active_ at all.

## The filter panel, reworked from mockups

Owner verdict on the built panel: the filters should bite immediately and
the apply button is not needed, the sheet sits too flat against the list
behind it, the close control is unattractive, the axes want icons — and
the whole thing is cluttered, so rework it with mockups.

Three were drawn and driven: all values open as chips, a master/detail
split with the facets on the left, and one row per facet showing its
current selection. The owner chose the first. The trade is honest and
worth recording: it is the longest panel of the three and it scrolls,
which buys the thing the other two cannot — you see what is set _and_
what picking anything else would yield, without a single tap.

**The apply button was a fiction.** The list underneath had already
changed by the time the footer offered to confirm it; the button asked
for a tap to agree with something that had happened. The outcome line
moved into the head, where it describes the state rather than promising
one, and _Zurücksetzen_ appears there only when there is something to
undo.

**The fold was what made it unreadable.** Reading the current filter cost
one tap per axis, and FR-25.11d's counts — the ones that say what picking
a value would yield, computed against the _other_ facets — were hidden
exactly while they were most useful. As chips they visibly shrink while
you filter, so the rule is doing its work in the open. The per-facet
_Alle_/_Keine_ pair went with the fold: _Alle_ is what an empty facet
already means, and _Keine_ is the facet's own _zurücksetzen_.

The panel is now mantle against the page's base with a rim, a shadow and
a dimmed backdrop; the way out is a ✕ in a circle; and every axis carries
a glyph, the same one whether it appears as a grouping or as a facet.

Both the prototype and the app carry it, and the prototype's headless
verifier stayed green through the change — it clicks facet values by
`data-fopt`, which survived the move from rows to chips because the
attribute is the contract, not the markup.

**The aeroplane is a train.** Trips are ground travel in this household;
the icon is the first thing the app says about itself, and it was saying
the wrong thing.

## The list's own hierarchy

Reported after looking at the rebuilt list: the heading "Kleidung" as the parent category was
smaller than its child categories "Regenjacke" and "Sonnenhut", and the categories were hard to
tell apart at all.

Both were mine. The group header had shipped as G-12-style uppercase
micro-type — 0.82rem against the rows' 0.88rem — so the heading was
literally smaller than the things it was heading. And the mock wraps each
group's rows in a card, which is what separates one category from the
next; the Vue rebuild kept the header and dropped the card, leaving a
slightly larger gap to do the work of an edge.

Now: the category heads its block at 1.02rem, a per-person cluster names
itself at 0.88rem in the muted tone, and the rows are plain — three
levels, three weights, in the order they actually nest. Each group is a
bordered card, so the seam between categories is an edge.

Two things surfaced while checking it in the browser rather than in the
stylesheet, which is why that rule exists. The sticky trip line was
painted _through_ by the rows: its background came from
`--ion-background-color`, which resolves to nothing inside `ion-content`,
and `ion-item-sliding` is positioned and transformed, so at `z-index: 2`
the list won. And the line faded its opacity while collapsing, so
mid-scroll the progress figure and a group header were legible on top of
each other — it clips now instead of fading.

E2E-M4-21 guards the ordering on computed font size. A class assertion
would have proved nothing here: everything rendered correctly, in the
wrong order of importance.

## A trip needs a year, not a date (FR-2.1b)

Owner decision: the date of a trip should be optional; only the year is required, and the
current year is preselected.

FR-2.1a had already made the _start_ date optional and kept the end date
as "the trip's planning anchor". That was the wrong anchor. A trip exists
as a plan long before its dates do, so requiring the end date meant
inventing one — and an invented date is worse than an absent one, because
it then drove M2's ordering, the series history and the „bis …" line, all
of them stating knowledge nobody had.

Migration 021 adds `trips.year NOT NULL` and makes `end_date` nullable,
backfilling the year out of the end date every existing trip was still
required to have. `duration_days` needs both dates now; everything
derived from it already had a no-duration path from FR-2.1a.

**The rebuild swallowed a column, and the suite caught it.** Modelled on
migration 004, the new `trips` table reproduced the shape from _then_ —
without `updated_hlc`, which 005 had added since. Every master pull of a
trip broke instantly. A twelve-step rebuild has to carry every column the
table has grown, and the only reliable way to know that is to read the
migrations after the one being copied.

Two places had been sorting trips by a date directly; both now use
`tripOrderKey` (start date → end date → year), so a year-only trip has a
defined place instead of wherever the engine left it. The quantity-history
hint (FR-14.2) used to slice its year out of the end date and now reads
the field, which is the same information without the assumption.

The wizard's step 1 gate is a name and nothing else: the year picker opens
on the current year, so the required field is satisfied before the user
arrives. E2E-M3-11 drives the whole wizard without touching a date and
then checks that the trip reads by its year in the list — it fails against
the old gate, which is what makes it a guard rather than a description.

## Trip creation, folded (FR-2.1c)

Owner: when creating a trip, the optional parameters should be less prominent, so as not to
overwhelm the user.

The house already had the idiom — FR-25.7 for template positions, FR-24.5
for master items, M5's own _Details ▾_ — so this is that pattern applied
to M3 rather than a new one invented for it. Name and year stand alone;
dates, series and the three attributes sit behind one _Mehr Optionen_ row.

The part worth stating: the row **summarises what is set behind it**. A
series prefills transport and accommodation (FR-13.2), so a fold that
showed nothing would hide a change the user did not make themselves —
which is FR-25.11a's argument about invisible filters, in a different
screen. E2E-M3-12 asserts both halves: the inputs are absent while
folded, and a value set behind the fold is stated on the row.

The e2e fixture had to learn the same thing, and the way it broke is the
useful part: six cases in three suites failed at once, all of them
filling a date that had moved. A shared seed helper is a contract; when
the screen it drives changes shape, that is where the change surfaces.

## Default travellers (FR-2.5a)

Owner: it should be possible to configure default travelers who are then already in the
wizard automatically … and it should be easy to adjust them in the wizard.

Configured once in M17, present in M3's step 2, and fully editable there —
the last part is what keeps them a starting point rather than a rule.

**Device-local, and that is a trade, not an oversight.** A synced
household list would need a schema, a partition and an account; Local
Mode has none of those, and the feature has to work in all three modes
(invariant 5). So it sits beside the theme and the language, and the cost
— a second device configures its own — is written into the requirement
with the revisit trigger that reverses it.

The normalisation rules exist for the wizard's sake: a blank name would
block step 2's validation, and two travellers with one name make every
per-person row ambiguous. The setting refuses to produce either, so the
screen downstream never has to.

No prototype change: the mock has always shown Andy, Sia and Leonardo
prefilled in step 2 — that _is_ this behaviour, and what is new is where
the three names come from, which is a settings list the mock has never
modelled.

## M5, rebuilt as a sheet

Owner: the detail view of a packing-list element is unattractive and cluttered — redesign it
as a UX expert would.

The concept was never the problem — §3.25 settled M5 in the mock a week
ago. The _build_ had never followed it: nine equally loud sections, all
expanded, in the order they happened to be written. Same story as M4.

The order is now the order of the reasons someone opens the screen:
identity, then **packing** as the biggest control on it, then a read-only
glance row, then **preparation** and **notes** — the two things touched
while packing — and everything else behind _Details ▾_. The photo shrank
from 200 px to 44 px beside the title: it helps you recognise the thing,
and most rows have none at all.

**Presentation cost one architectural decision.** M5 is specified as a
sheet over M4, so the item URL must render the list _and_ the sheet.
Making it its own route mounted a second copy of the list behind the
sheet — Ionic keeps a page per matched path — so the item path is now an
**alias of the trip route**, and opening or closing **replaces** rather
than pushes. One list, one page, and the URL still says what is open.

Two things fell out of that and are worth stating:

`‹ back` means two things on one screen now — close the sheet, or leave
the trip — so the route declares which via `meta.overlayParam`. On a
phone it is moot: the sheet's backdrop covers the app bar, so ✕ or a
swipe is the way out, and the e2e case says so rather than pretending
back is reachable. The rule still governs the desktop panel and the
browser's own back button, where it is unit-tested.

Replacing the route re-renders the list, so opening an item scrolls it
back to the top. That is the one regression against pushing, and it is
recorded here rather than discovered later: restoring M4's scroll offset
per trip is the fix when it starts to grate.

## Post-#73 review remediation (2026-08-14)

A three-way review of the merged M4/M5 rebuild — code, process, and the
screens rendered beside the concept prototype — produced one critical
finding, several real ones, and two claims that did not survive checking.
This entry records both halves, because a review's misses are as useful
to remember as its hits.

**The critical one: a single failed IndexedDB write silenced the session.**
`persistence.ts` serialises writes through a promise tail, which is what
FR-19.2's durability rests on. The tail was the _uncaught_ promise, so one
rejection — a quota error, a transaction the browser aborted — left it
rejected forever: every later `save()` chained `.then` onto a rejected
promise, the callback never ran, and the change was dropped with no
signal. In the one mode that has nowhere else to put the data. The tail is
now the caught promise and the caller still receives its own rejection.
`whenSettled()` therefore reports _drained_, not _succeeded_ — which is
what the G-2 glyph needs, since it has to leave the syncing state either
way. Fixing that exposed a second leak behind it: `setLocal()` did not
clear the offline flag, so the glyph would have stranded on "offline" for
the rest of the session even once writes resumed. Local Mode has no
connection to lose; a write that lands is the evidence the condition
cleared.

**The WebSocket dial sent the string `"null"` when it had no token.** It
interpolated the token straight into the URL, and `wsAuth` promotes any
non-empty `?token=` to an `Authorization` header, so an absent one
arrived as `Bearer null`. No token now means no parameter, and a present
token is percent-encoded.

**How severe this is was got wrong first, and the correction is the
useful part.** It was written up — in the review, in this log, in the PR
body — as _"Single-User Mode could never open its WebSocket, rejected
403"_. Running the branch by hand on 2026-08-14 disproved that in about a
minute: `authed` **bypasses the token entirely in single-user mode**
(`server.go:153`), so that mode upgraded to `101` with `?token=null` and
without it alike. The real effect is narrower and lives in multi-user
mode, where both forms are refused — but `?token=null` answers `401
invalid token` while the truth is `401 missing bearer token`. Given the
manual has a whole troubleshooting entry pointing at `?token=`, handing
back the wrong one of those two is a real cost; it is just not a broken
mode. The other half — the missing `encodeURIComponent` — stays a latent
bug rather than an active one, since JWTs are base64url.

Worth keeping as a habit: the claim survived a code review and a
self-review because everyone read `wsAuth` and nobody read `authed`
beside it. One `curl -i` against a running binary settled it.

**One grouping state, not two.** M12's slice tap called
`tripStore.setGroupBy`, which the M4 rebuild stopped reading — M4 takes
its grouping from `usePackingFilter`. The tap navigated and the grouping
silently stayed put. The store's copy (`groupByPrefs`, `getGroupBy`,
`setGroupBy`, `groupedItems`) had no other reader and is gone;
`setStoredGroupBy` is the one way for a departing screen to set what M4
shows.

The first attempt at it wrote only the stored value, and the e2e case
written during the self-review is what caught that this was still broken:
**ADR-012 leaves one router outlet, so M4 is not remounted on the way
back from M12** — it was never unmounted — and a value in storage is read
at mount and never again. The tap navigated and the grouping stayed put,
exactly as before. Both unit tests were green throughout, because each
side was correct about its own state; only a test that crossed the screen
boundary could see it. So `setStoredGroupBy` writes storage _and_ moves
the live ref of the mount already on screen, which a small per-trip
registry in `usePackingFilter` makes reachable. Worth remembering as a
shape, not just a fix: **a handoff between two screens cannot be verified
from either end.**

**The reveal bar counted two different things.** "Show 3 packed" became
"Hide 5 packed" for the same rows: one direction counted rows, the other
summed `packed_count`. `hiddenDoneCount` is now `doneCount` — done rows
among the ones the filter lets through, unchanged by the toggle, because
the bar labels the same set in both directions.

**`/trips/new` had lost its anchors.** The rule that makes M4 full-screen
matched on path _shape_, and the wizard has the same one without being a
drill-down. E2E-G1-03 covers it; the existing G1-02 asserted "hidden on
M4 and nowhere else" and could not see it, because it only ever visited
M4.

Also: the strings the rebuild itself hard-coded are localized (M3 step 1
and M20 in full, including the folded summary, which was printing raw
enum values like `holiday_flat`), the duplicated amendment paragraph in
the UI-Spec is gone, and the second `E2E-G12-02` is renumbered.

**What the review got wrong.** `openSlice()` was reported as dead code;
it is called, and `git blame` shows the call site landed with it. A
hard-coded `rgba(137,180,250,.16)` was reported in `FilterSheet.vue`; it
does not exist — that triplet appears only as `--ct-blue-rgb` in the
token table. And the documentation contradiction was one stale file, not
three: `e2e-tests.md` and this log already agreed with the code, and
CLAUDE.md was corrected by #79.

Three invariant-9 violations the rebuild did introduce — raw
`rgba(0,0,0,…)` shadows in `FilterSheet.vue` and `PackingListPage.vue` —
are deliberately **not** fixed here. There is no shadow token to move
them onto; `catppuccin.css` carries colour and nothing else. They are
part of the design-token work that comes before the next screen rebuilds.

## The app gets its own two faces (FR-21.5/21.6, G-13)

First of the five design-foundation PRs, and the one that touches every
view from a single file. The finding that started it: the client declared
**no `font-family` at all** — every screen rendered in whatever Ionic's
platform stack resolved to, which is why the rebuilt M4 and M5 landed the
concept's information architecture and still did not look like it.

`client/src/theme/typography.css` now sits beside `catppuccin.css` and
owns exactly one thing, the way that file owns colour: the `@font-face`
rules, the two family tokens, the `--jp-text-*` scale, `--ion-font-family`
and the `.jp-*` role classes. Fraunces is the display face, Hanken
Grotesk the UI face, both variable woff2 in latin **and latin-ext** —
the German catalogue needs the extended range.

**Self-hosted and committed, not fetched.** Local Mode may have no
network at all, so a font request per boot is not a slow path, it is a
missing one; NFR-4.3 rules out the third-party request besides. The files
are checked in rather than pulled through `@fontsource-*`: that package
would satisfy invariant 8 through the lockfile just as well, but it adds
two dependencies to ship four static assets.

**The face follows the role, never the tag.** The tempting shortcut —
`h1, h2 { font-family: display }` — is wrong, and the prototype says so:
it sets M2's trip rows in the _UI_ face. Putting every card title in the
serif would flatten the hierarchy the serif exists to state. So each role
is named once (`.jp-page-title`, `.jp-hero-title`, `.jp-sheet-title`,
`.jp-num`) and applied where that role occurs. Every screen touched also
**lost** the local `font-size`/`font-weight` it had been carrying, so
there is one definition per role and no second opinion — the point of a
token table, and the reason this file is now part of invariant 9.

Raw `px` lives in `typography.css` and nowhere else, deliberately: PR 3's
gate rejects bare `px` under `client/src` outside the token files, and a
role class hard-coding `34px` would recreate the magic numbers the file
exists to retire. A unit test asserts exactly that.

**A note on how the unit tests read the CSS.** They load it with `fs`,
not with an import. Vitest stubs CSS imports — including `?raw` — so the
assertion runs against an empty string and passes forever. That was tried
first, and it is the shape to remember: a test whose subject the test
runner has replaced with nothing is green by construction.

Two claims in `design-foundation-plan.md` did not survive implementation
and are corrected in place: the prototype has more display-face
declarations than the plan's table lists (it called the table complete),
and the blanket `h1, h2` rule above. `docs/` is owed nothing here, and
that is a decision rather than an omission — the published manual covers
server operation, and self-hosting a font changes nothing an operator
configures.

## The three colour anchors (FR-21.7, G-11)

Second of the design-foundation steps, and the one that explains why the
built screens still looked generic after the typography landed. The
palette was never the problem — the **roles** were. `catppuccin.css`
mapped blue onto `--ion-color-primary`, which Ionic paints on tabs, the
FAB, checkboxes and segments without being asked, and demoted peach to
`warning`. So the brand appeared nowhere and the action colour appeared
everywhere: a default Ionic app wearing a Catppuccin palette.

The anchors are now a block of their own, above the Ionic mapping:
**peach = brand, blue = action, green/teal = done**. A component asks for
the role; only that block decides which hue a role is.

**The brand is deliberately not the primary.** It was tempting — one line
and the whole app turns peach. But primary is what Ionic paints on
buttons and links, and those are things you _act on_; repainting them
would make every button shout the brand. Identity gets the few surfaces
that carry it: the anchor you are on, the create FAB, the eyebrows, the
preparation and shopping marks.

**Two consequences the plan had not seen, both found by implementing.**
Freeing peach leaves `warning` empty, and caution had to go somewhere:
yellow. That fixed a real confusion rather than merely relocating one —
while peach was `warning`, a container over its weight limit and the
product's own identity were the same colour, and the louder reading won.
The second: M2's trip ring ran peach below 50 %, blue to 99 %, green at
100 %. Under the new anchors that meant an unpacked trip was marked in
the brand colour, which reads as an alert. Progress now runs the done
ramp end to end and nothing else — **progress is never the brand.**

**Where the rules live matters as much as what they say.** FAB, checkbox,
toggle and progress bar are element rules in the token table, not per
screen, so a FAB added six rebuilds from now is not a fresh decision. And
`color="brand"` is a real Ionic colour name now: without it the only way
to reach peach from a template was `color="warning"`, which is precisely
how the preparation badge and the shopping count came to be painted as
cautions.

**Twelve literal fallbacks are gone.** `var(--ion-color-light, #eee)` and
its eleven siblings read as harmless defensive code, and the plan
undercounted them at nine. Every one was a _light_ colour sitting behind
a dark-default theme, so the fallback could only ever paint the wrong
thing, and only when something was already broken. A unit case now
rejects a hex literal anywhere under `client/src`.

Two notes on the tests. The e2e cases compare against the **role token**,
not against a hex, so they hold in Latte as well as Mocha. And the first
version of them failed against a correct page twice, both times for
reasons worth keeping: a custom property computes to the token text it
was given (`#fab387`) while `color` computes to `rgb(250, 179, 135)`, so
the two need separate readers; and the tab bar is _hidden_ at the default
desktop viewport, where the rail carries the anchors instead — the case
now asserts both presentations, which is what G-11 actually claims.

**Two things the self-review caught, both about rules that described
themselves rather than the code.** `--ion-color-primary` still reached for
`--ct-blue` directly, so `--jp-action` had no consumer at all and blue was
decided in two places while peach and green were decided in one — the
anchor block described a rule that two of its three roles followed. Primary
now resolves _through_ the role.

And `seed({ theme })` in the e2e fixtures wrote `'dark'`/`'light'` into
`jitpack_theme`, which `readTheme` does not recognise: anything but
`'latte'` resolves to Mocha, so a light-theme case would have asserted the
dark theme and passed. Nothing used it yet, which is why nobody noticed —
and the Latte case added here would have been the first victim. The option
is typed as `Theme` now, and the case asserts `jitpack-latte` is on the
root _before_ it asserts anything about colour. Verified by seeding Mocha
and watching it go red.

**Latte reads the brand deeper (owner, 2026-08-14, after seeing it
rendered).** "Peach is the brand" turned out to be one _role_ with two
readings rather than one value. Latte's peach is a saturated orange on a
near-white ground where Mocha's is a pastel on a near-black one, so the
light theme shouted.

Measuring rather than guessing changed the answer. The obvious calmer
choice — a paler, softer peach, or Latte's own rosewater — would have made
things worse: stock Latte peach already managed only **2.45:1** as an
11 px tab label, and rosewater is **2.17:1**. On a light ground quieter
and darker are the same direction, so deepening the token calms the shout
_and_ fixes the legibility in one move (**3.56:1**). It is a `color-mix`
of two palette tokens, not a picked hex, so it still follows the flavour.

Rendering caught the correction inside the correction: deepening the FAB
gradient's far stop alongside it lands on **brick**, because Latte's
maroon plus ink is a red — the create button read as _danger_. The far
stop stays in the peach family instead. That is not a detail a contrast
number could have told me, which is the argument for looking at both.

The general rule, now in G-11 and FR-21.7: **a role is flavour-relative.**
Where a role lands differently in the two flavours it is restated per
flavour, never averaged into one value that suits neither. The `--jp-*`
tokens carry that naturally; a single constant could not have.

One consequence worth guarding: CSS cannot derive an rgb triplet from a
`color-mix()`, and Ionic's rgba() internals need one, so Latte writes
`--jp-brand-rgb` by hand beside the mix. A unit case asserts the two are
always restated together — otherwise they drift apart silently and only
the ripples stay on the old hue. The FAB glow and the rail's active
background were moved off the triplet onto `color-mix` for the same
reason: fewer places that can disagree.

**Correction, same day, from reviewing that change:** the note above said a
unit case keeps `--jp-brand-rgb` in step with the mix. It did not — it
asserted only that the Latte block _restates both_, which catches
forgetting one and nothing else. A hand-written triplet that is simply
**wrong** passes it, and the only symptom would be Ionic's ripples sitting
on the old hue. E2E-G11-05 now resolves both through a canvas — the one
place a browser will normalise `color(srgb …)` and `rgb(…)` to the same
bytes — and compares them per channel. Proved red by pasting the stock
Latte peach back into the triplet: _"latte: --jp-brand 192,93,44 and
--jp-brand-rgb 254,100,11 disagree"_.

Worth keeping as a shape, since it is the second time in two PRs: **a test
that asserts a rule is stated is not a test that the rule holds.** The
typography suite had the same gap — asserting a role class exists rather
than that no view contradicts it.

### 2026-08-14 — Surfaces: three planes, a radius scale, and a gate (FR-21.8, G-14, invariant 9b)

Third design-foundation step. The defect it closes is the most instructive one
of the three, because **no rule then in force could see it**: `.group-card`
declared `background: var(--ct-mantle)` — a real palette token, sourced from
the token table, passing invariant 9 and its unit suite — and `--ct-mantle` is
what `--ion-background-color` is set to. The card was painted the exact colour
of the page behind it, so a 1px hairline was the entire distinction between an
object and its background. A stylesheet reads as correct either way; only a
rendered pixel says otherwise.

So depth became a role, the way brand and action did: page → card → sunken,
each named once, with Ionic's background variables resolving _through_ the
roles rather than beside them. `.jp-card` carries plane, rim, radius and lift
together, and its children defer to it.

**The radius scale is smaller than the values it replaced, and that is the
finding.** Nine values were in use (2/4/7/8/10/12/14/22/999px) with no rule for
picking one. But three of them were not a small step at all: every stray 2, 4
and 7 px was **half the height of the bar or handle it rounded**, so all of
them meant "fully round". They collapsed into one pill token rather than
snapping onto an invented `--jp-r-xs`. Five steps, each with a job. `50%` stays
raw on actual circles — a circle is a shape, not a size — and the gate allows
that by rule rather than by allowlist, as it does the `0 0 0 <n>px` ring form,
which casts no light and therefore is not elevation.

Elevation is split across two files on purpose: the geometry in `surfaces.css`,
the ink and its weight in `catppuccin.css`. Same reason FR-21.7's brand is
flavour-relative — Mocha casts in crust, which in Latte is a light grey that
would cast no shadow at all, and 0.6 alpha reads as depth on near-black and as
dirt on near-white.

**Two false greens, both caught by running the thing rather than reading it.**

The gate had the defect it exists to prevent. Run from the wrong working
directory it resolved a path that matched nothing, globbed zero files, and
printed _ok_. It was found by accidentally running it from `client/src` — a
gate that scans nothing now exits non-zero, because "ok" is the worst answer it
could give.

The Latte shadow e2e case passed against the bug it was written to catch. It
asserted the shadow ink is darker than the card, and Latte's crust satisfies
that (676 to the card's 725) while being useless as a shadow. Substituting
Mocha's ink back in kept it green. The assertion that holds is that the ink is
darker than the palette's darkest **surface** — anything lighter is a plane,
and planes do not cast shadows. **Third occurrence in three PRs of one shape:
a test that asserts a rule is stated is not a test that the rule holds.** It is
worth treating as a standing check on any new guard: name the mutation it would
catch, then make that mutation.

**PR 3 was split, and the split is recorded in the plan.** It bundled the card
planes, the radius scale, the elevation tokens and the 123-site type migration
— four sweeps that each change how every screen looks. One PR containing all
four cannot be eyeballed, since a regression in any one is indistinguishable
from an intended change in the other three. Shape shipped here; the type
migration is PR 3b, still ahead of the screen rebuilds, and extends the same
gate. The spacing scale the plan asked for was dropped outright: with the gate
scoped to colour, radius and elevation it would have had no consumers and no
gate, which is the unused-token shape PR 1 already removed a class for. Spacing
is also not one decision the way a radius is — a radius describes what kind of
thing an element is, spacing describes one particular layout.

**Two more findings from reviewing the same PR, and one of them is the
fourth false green.**

_The scrim._ `--jp-scrim` was derived from `--jp-shadow-alpha` on the
reasoning that a backdrop and the shadow its sheet casts should be the same
darkness. That is true of a backdrop and wrong of a scrim: the avatar crop
mask is not suggesting depth, it is making a circle legible against
everything outside it. Latte's shadow weight is deliberately light (0.22, so
a card does not look grimy), which took the crop mask from 0.55 to 0.198 —
a functional opacity quietly inheriting an aesthetic one. It has its own
`--jp-scrim-alpha` now, restated per flavour and held near Mocha's, because
what a scrim has to _do_ does not change with the flavour, only which ink it
does it in.

_The M2 separators, and the test that did not catch them._ Wrapping each
series in a card, I set `lines="none"` on the list to stop Ionic's
full-width line spilling past the card's radius. Three trips in one card
then ran together with nothing between them — a card bounds the _group_, not
its entries. Found by rendering M2 with three trips rather than the one the
screenshot happened to have.

The guard written for it **passed against `lines="none"`**. It read
`--inner-border-width` on the `ion-item` host; Ionic drives that line from an
attribute selector in its own stylesheet, so on a row nobody styled the
custom property is simply _unset_ — and "unset" is not "0". It now measures
the rendered `border-bottom-width` on `.item-inner` inside the shadow root,
and is proved red in both directions: no seam between rows, and a seam on the
last row that duplicates the card's own edge.

**Fourth occurrence, and the pattern is now specific enough to act on.** All
four had the same shape — the assertion was made against the _nearest
readable thing_ rather than against the rendered outcome: a token's presence
instead of its value, a declared property instead of a painted pixel, "darker
than the card" instead of "dark enough to be a shadow". The check that would
have caught every one of them is cheap: **make the mutation the test claims
to catch, and watch it fail.** That is now the standing rule for any new
guard here, and it has caught more real defects in three PRs than the reviews
did.

One more, and it is the gate reviewing itself: it flagged the unit test that
asserts what `--jp-scrim` resolves to. Tests are excluded now, and by rule
rather than by convenience — the gate stops a _view_ from deciding colour or
shape, and a test that asserts a token's text paints nothing. Verified after
the exclusion that a real view is still caught, by putting a raw radius back
into `SearchRow.vue`.

**Two more, both from the owner asking what the Latte shadow actually looks
like — which is the whole argument for the eyeball pass in one example.**

Routing `--ion-item-background` through the card plane repainted every
`ion-list` as well: Ionic reads that same variable for the list element, so
a list wrapping cards laid a card-coloured slab a few pixels wider than the
cards on it, and each card's shadow fell onto its own container rather than
onto the page. The original defect, one plane up. It was invisible in the
stylesheet again; what gave it away was that the pixels under a card edge
measured **lighter** than the page, which is the one thing a shadow cannot
be. Fixed with `ion-list:has(.jp-card)` — the rule states the actual
condition, covers screens not built yet, and outranks Ionic's `.list-md`,
which a bare element selector does not.

Then the measurement contradicted what had already been written into three
documents. Latte was described as casting "far softer" than Mocha. Off the
rendered pixels: **Latte darkens the page by 49/765, Mocha by 10/765** —
five times as hard, at a third of the alpha. The cause is structural rather
than a mistuned value: crust sits seven units below mantle, so a shadow cast
in crust on a mantle page cannot darken by more than seven units however
hard it is thrown, and raising the alpha buys nothing. **The dark flavour
lifts a card by the plane step (+21) and the light one by the shadow (−49)**,
each using the mechanism its ground supports. The palette holds nothing
below crust to cast in, and inventing one would be a second palette — so
this is the honest answer rather than a workaround.

Worth keeping beside the false-green rule: **a plausible symmetry is a
claim, and a claim about pixels is checked by reading pixels.** "Latte casts
softer" was written from the alpha, which is the input, not the result.

### 2026-08-15 — The type migration: 170 declarations onto the scale (FR-21.5, G-13)

The other half of the split PR 3. The typography step shipped `--jp-text-*`
ahead of its callers on purpose; this is where the 123 `font-size`, 40
`font-weight` and 7 `letter-spacing` sites across 31 screens moved onto it,
and where the gate grew its fourth rule.

**Most of it was mechanical. Three things were not, and none was visible
before doing the work.**

_Icons needed a table, not an exemption._ The plan had said the gate would
carve out icon sizing "by rule rather than by allowlist". That was the wrong
shape: `font-size` on an `ion-icon` is a **glyph box**, not a text size, and
an exemption would have left 40 sites unowned. A second scale
(`--jp-icon-xs … 2xl`, six steps, each with a real occupant) needs no
exemption at all, and it stops the thing an exemption would have permitted —
a later adjustment to body copy silently resizing every icon in the app.

_The section label was an unnamed role, not eleven stray sizes._ Nine screens
carried it as a 16px semibold sentence; two carried it as the small uppercase
label the concept prototype actually specifies. Same element, two answers,
neither of them written down anywhere. Migrating the nine onto a token would
have put a 16px step into the table that the design does not use — the token
table would have been recording a mistake rather than a decision. `.jp-eyebrow`
names it once, and owns colour as well as type: a label that is not recessive
stops being a label, and leaving that to nine call sites is nine chances to
forget. **This is the one visible change in an otherwise mechanical pass**, so
it shipped with before/after screenshots rather than as a footnote.

_The scale grew where the app pushed on it._ Seven sites — two badges, an
avatar's initials and its tick, two counts and a prep marker — sat below 11px
with nowhere to go, so
`--jp-text-3xs` was added rather than the sites rounded up out of their
layouts. That is the mechanism `typography.css` predicted when the scale
shipped ahead of its callers: a size the table does not have is a signal about
the table.

**Two carve-outs, both by rule.** `letter-spacing: 0` is a reset — it declines
a decision rather than making one, and a token for "none of the above" would
claim otherwise. SVG text needed no gate rule in the end: inside a `viewBox` a
font-size is in **user units**, a proportion of the drawing, so M2's ring label
moved to an SVG attribute beside `cx` and `r` and left CSS entirely. A px token
there would have rendered at 10/36 of the ring's width.

**Every new guard was proved red against its own defect** before being kept —
a seventh icon step, the missing `3xs`, a screen restating the eyebrow, a
screen claiming the class without the role, and both e2e cases (the eyebrow
reduced back to a sentence, and an icon sized from the text scale). That
check is now routine here rather than a reaction to the four false greens in
the surfaces step.

**One process note, paid for.** `git checkout <file>` was used to undo a test
probe in a file that also held uncommitted migration work, and took the
migration with it. The probe pattern used everywhere else in these PRs — copy
to `/tmp`, restore from there — does not have that failure mode. The gate
caught the loss immediately, which is the argument for having it.

**Two corrections from reviewing the same PR.**

The count was wrong: `--jp-text-3xs` has **seven** occupants, not the four
stated in the token comment, the unit test, the plan and the log. Counted
from `var(--jp-text-3xs)` rather than from memory — two badges, an avatar's
initials and its tick, two counts and a prep marker. A number written into
five places from an impression is five wrong places.

And `.tick` was the one site the migration genuinely moved: 8px to 10px,
inside a 12px circle. Measured rather than assumed — the glyph's line box
comes out 13px, which reads as an overflow until you look: 13px is the em
box, and the checkmark's _ink_ stays inside the disc. Rendered at 6× beside
the old size to confirm, and it is the more legible of the two at real size.
Kept. The measurement is recorded because "13 in 12" is exactly the kind of
number that would otherwise be re-discovered and 'fixed' later.

### 2026-08-15 — The pack-out: a row that leaves, and one undo (FR-25.2)

Fourth design-foundation step, and the app's first motion of any kind — there
was no `<Transition>`, no `<TransitionGroup>` and no keyframe anywhere in
`client/src` before this. Packing a row dropped it from the array and Vue
removed the node on the next tick: the snap was the entire feedback channel,
and a mistap had no way back short of finding the reveal bar, showing the done
rows, finding the row and un-checking it.

**The plan's shape held. Three things inside it did not, and each was found by
running rather than reading.**

_No view-model change was needed._ The plan expected the list to hold a "still
animating" set so a done row could outlive its own removal. `<TransitionGroup>`
already owns exactly that, so `buildPackingView` is untouched and stays pure.

_A custom property does not transition._ The wash was written first as
`--background` — which is what Ionic reads — and unregistered custom properties
animate discretely, so the green appeared and disappeared within one frame. It
is a real `background` now. The split shade that showed while both the item and
its slider carried the wash was settled by measurement rather than by argument:
one side was the tint over `--ct-base`, the other the same tint over
`--ct-surface0`, which named the duplication immediately.

_The snackbar landed under the FAB_ — on top of the one control it exists for.
Ionic 8's `positionAnchor` puts it above, which is FR-25.11h's rule one layer up.

**Two defects the new cases caught, both of them mine.**

The outgoing snackbar's dismiss handler disarmed the **incoming** pack's undo:
`announcePacked` awaited `packToast?.dismiss()` and the outgoing toast's
`onDidDismiss` then found itself still current, so packing two rows in a row
left the second with no undo. Clearing the handle _before_ dismissing makes the
outgoing handler's identity check fail, which is what it was for.

And E2E-M4-35 — "un-packing announces nothing" — **passed against the build
with its own guard removed.** The snackbar is created asynchronously, so an
absence check arrives before it would have appeared and reports success on a
page that was about to show one. It asserts a counter the page now renders
(`data-pack-announcements`) instead: the same deterministic-seam move the G-2
indicator made for Local Mode writes, and the reason CLAUDE.md phrases that
rule as "if nothing observable exists to wait on, that absence is the defect".

Worth noting as the fifth of its family: **an assertion about an absence needs
a positive signal that is guaranteed to arrive later than the thing it denies.**
"No toast is on screen right now" is not that signal. A counter is.

**One deliberate piece of production code exists for a test**, and it is
recorded here so it is not removed as cruft: `data-pack-announcements` on M4's
content element. It makes an otherwise untestable rule testable, which is the
trade CLAUDE.md endorses rather than a workaround for a lazy test.

**One thing looked like a defect and is not, recorded so it is not "fixed"
later.** In a frozen frame the leaving row reads two-tone: a pale block over
the left third, green over the rest. Dumping every painted background inside
the row named it — `div.ripple-effect`, Ionic's Material tap ripple, expanding
from the checkbox in `--ct-text`. It is on every row tap in the app already
(opening the sheet, un-packing) and predates this change; it lives for about
200 ms and is gone before the collapse finishes. Stills make it look like a
competing wash because a still is exactly what it is not. Whether Material
ripples belong in this app at all is a separate decision about every tap
target, not something to settle inside the pack-out.

### 2026-08-15 — Visual baselines, and the end of the design foundation (ADR-013)

Fifth and last step. "Looks right" was untestable: no `toHaveScreenshot`
anywhere, which is why each of the four token PRs before this shipped a
hand-built screenshot artifact — the only way to show what had changed. From
here a diff does that, and the artifact is for explaining rather than for
detecting.

**The decision is where the images are rendered, and it is ADR-013.** The
maintainer's NixOS host cannot launch Playwright's downloaded browsers at
all, so local runs happen in the pinned container; if CI rendered on the
runner instead, accepting an intended change would mean pushing, letting CI
fail, and committing images the maintainer never saw. So both sides run the
same digest-pinned image, which also makes the renderer a hash-verified
dependency like every other (invariant 8). The costs are real and named
there: a second browser mechanism in CI, image bumps that rewrite every
baseline, and PNGs that git keeps forever.

**The plan contained a contradiction.** It asked for a dev-only gallery _and_
for baselines covering it — but a route behind `import.meta.env.DEV` is not
in the bundle the visual project drives. Split the jobs rather than the
difference: baselines cover the real screens, the gallery is a human tool
with none. Verified rather than assumed — `grep` over `dist/` after a
production build finds no gallery chunk.

**Determinism was the actual work.** Two sources of randomness would have
made every baseline fail on its second run:

_Avatar colours._ `UserAvatar` hashes its seed into a palette colour, and the
seed is a traveler id — `crypto.randomUUID()`. Stubbed in the spec so the
whole app is deterministic, rather than masking the avatars, which would have
blinded the baselines to the one component the colour step was about.

_And the clock, which turned out to be the opposite of what it looked like._
Freezing `Date.now()` so a rendered year cannot drift is the obvious
companion — and with it the packed row never leaves the list. Probing said
why the row stayed but not why the write did: the checkbox flips and the
header count, which reads the store, does not move, so the mutation never
lands. **The obvious suspect is ruled out** — `HLCGenerator.next()` handles
equal timestamps correctly (`if (now <= lastMillis) counter++`) — so it is
something else in the write path. Not traced: no baseline renders a date, so
the freeze bought nothing. Written down with the ruled-out suspect named,
because the next person to reach for `setFixedTime` will otherwise spend the
same hour.

That last one is worth keeping as a shape of its own, distinct from the
false-green family: **I wrote the HLC explanation into a comment as fact
before checking it, and it was wrong.** Reading the generator took two
minutes and cost nothing; shipping the sentence would have cost the next
person an afternoon chasing a mechanism that does not exist.

**Two smaller things the first runs found.** A global `testIgnore` for
`visual.spec.ts` also hid the file from the visual projects, which then
reported "No tests found" — an error rather than a pass, which is the only
reason it was caught immediately. And `reducedMotion` does not type-check as
a project-level `use` option in this Playwright version; it belongs in the
spec, where `pack-out.spec.ts` already had it.

**One thing caught before CI rather than by it.** The visual job first called
`make visual`, and a GitHub runner has neither `golangci-lint` nor `mise` —
so `make` fails there on its parse-time toolchain guard, before any recipe
runs, over a tool the baselines never touch. The invocation moved into
`scripts/visual.sh`, which `make visual` and the workflow both call: the same
two-callers shape as `scripts/coverage-gate.sh`, and the thing that must not
drift is the invocation rather than a digest copied into two files.

**And one gap the review found in the pin itself.** Dependabot's docker
ecosystem reads Dockerfiles and compose files, not shell scripts — so the
digest in `scripts/visual.sh` is the one pin in the repository it will never
update. Invariant 8 previously claimed, without qualification, that
Dependabot keeps the digests fresh; it now names the exception, because a
blanket claim with a silent hole is worse than a narrower true one. The
manual bump is also the behaviour ADR-013 wants: a new image rewrites every
baseline, and that should be a decision rather than a Tuesday.

The `client/e2e/README.md` recipe was stale too — it named the v1.61.1 image
while `@playwright/test` is 1.62.1, which fails at browser launch with
exactly the error the surrounding paragraph warns about.

### 2026-08-15 — M7 gets its two scopes (§3.27, FR-27.1/27.6)

The first of the screen rebuilds the design foundation was built for. M7 was
a flat list of names with an item count; §3.27 gave templates a **scope** two
migrations ago and nothing in the client had ever read it. Now the list is
scope-shaped: _Alle · Ferien · Gruppen_, with _Alle_ rendering the two scopes
as sections — vacation templates first, because they are what a trip starts
from and groups are the building blocks — group rows carrying their chip, and
the FAB asking which scope to create instead of assuming one.

**The scope is declared, never derived.** That is FR-27.1's rule and it is
the reason the FAB opens a chooser rather than creating a template and
letting usage decide: a freshly created group that nothing includes yet would
be unclassifiable, and "it has no includes, so it must be a group" would
misfile every empty Ferien-Vorlage. The chooser is two cards with one line
each, because _Gruppe_ alone does not say what a group is for.

**One resolution, three callers.** `client/src/domain/templates.ts` expands a
template's includes and merges the result by master item under the existing
FR-2.3a rule. It is deliberately **not** a new algorithm — FR-27.2 says as
much — and deliberately not a second one either: the M7 row count reads the
same resolution the M8 footer and trip generation will, so the count on the
row and the count in the trip cannot drift apart. Expansion stops after one
level on purpose. FR-27.1 fixes the hierarchy at two levels, and _that_ is
what makes include cycles structurally impossible; following a group's own
includes would quietly hand the cycle back and leave the validator that no
longer exists to catch it. A mutation test guards exactly this: making the
expansion transitive turns the case red.

**What the row now counts.** A composed Ferien-Vorlage with no positions of
its own used to read "0 Artikel", which described the row rather than the
trip it would produce. It now counts the resolved set. The include-dependent
half of that display — the "2 Gruppen ·" prefix and the _enthält: …_ line —
is built and unit-tested but not yet reachable, because nothing in the app
can write an include until the M8 rebuild. The e2e ledger says so rather than
letting a partial case read as a full one.

**A hole this PR would otherwise have opened.** Adding scopes without
touching the portable format would have made an exported Gruppe import back
as a Ferien-Vorlage — the same name, the wrong thing. The YAML now carries a
`scope` field beside `kind`, which are two different questions: `kind` says
whether the document is a template or a trip, `scope` says which of the two
template scopes it is. Both parsers reject an unknown scope rather than
defaulting it, and a scope on a _trip_ document is an error rather than an
ignored field. Files written before scopes existed carry none and read back
as `template` — the same default migration 016 applies to pre-scope rows.

**Two things only the rendered screen said.** The segment's middle tab was
specced as "Ferien-Vorlagen" and truncates to an ellipsis at 390 px, which
names a scope worse than one word does; it now carries the short form and the
section head below spells it out. And the create sheet used an `IonContent`
inside an auto-height modal, which has no intrinsic height to give — the
sheet sized itself to nothing and swallowed every tap meant for its cards.
The e2e run found that one before the screenshot did, with "ion-modal
intercepts pointer events"; a plain box fixed it.

**On the tests.** Every case here was checked against a build with the rule
removed: transitive expansion, a `sum` default instead of `max`, groups
rendered before vacation templates, a create path that ignores the chosen
scope, a template row read without its kind, includes left behind by a
deleted template. Five of the six turned a case red on the first try. The
sixth did not — nothing asserted that a Vorlage's _own_ position leads the
merge report ahead of its groups' — so that case was written before the
mutation was reverted. That is the pattern this project has now paid for six
times: the assertion that was never watched failing is the assertion that is
not there.

### 2026-08-15 — M7's two open decisions, settled by rendered variants

The PR-88 review left two questions that were the owner's to answer: what the
row carries, and how creating works. Rather than argue them in prose, both
were built as working variants on a scratch branch and rendered — three row
shapes (inline button / long-press menu / swipe), three create flows (system
dialog / name-in-sheet / create-then-rename). Two of the six died on sight in
the render: **swipe's option panel breaks out of the card** and paints over
the row below, and **create-then-rename writes an unnamed row the moment you
tap** — the prototype does it, but the prototype has no persistence, so its
mock never showed that cost. The owner picked A2 (long-press) and B2
(name-in-sheet).

**The implementation found a real bug the variant did not have to face.** The
first guard against "the hold's release also opens the row" was a one-shot
swallow-next-click flag. A hold-driven e2e case went red on its _last_
assertion: after cancelling the menu, a legitimate tap no longer opened the
row. Cause: the release click usually never reaches the row at all (down on
the row, up on the presented overlay — the click fires on their common
ancestor), so the flag went stale and ate the next genuine tap. The fix is a
different shape, not a patched flag: **row taps are inert while the menu
lives** — a state with a beginning (the hold fires, set before the overlay
attaches) and an end (dismiss), which is what made the race deterministically
testable at all. Both new rules were mutation-checked red: guard removed,
name-guard removed.

**That hold e2e case then had to go, and where it went matters.** Driving the
500 ms with `page.clock` worked on a freshly loaded page and failed
nondeterministically on a warm app — under the faked clock, Ionic's action
sheet sometimes never attaches (chromium, one repeat in three), and on webkit
any `getAnimations()`-based settle hangs on an unrelated _infinite_ spinner
animation. Under CI's full-suite load, `page.goBack()` across the root→tabs
outlet boundary additionally wedges the outlet — the pre-existing Ionic
transition defect from the navigation work, in a new costume; the suite now
leaves M8 the way a user does, through the ADR-011 header chevron. The 500 ms
moved to where they are deterministic: `useLongPress`, a pure composable
unit-tested with fake timers (arm, fire once, release disarms, slop disarms,
jitter survives), while the e2e case proves the guard through `contextmenu` —
the same handler the hold fires into. The one-line `pointerdown` wiring is
the accepted, _stated_ gap; the ledger names it.

Two Ionic locator lessons re-paid, one of them for the second time:
`toBeDisabled()` does not see an `ion-button`'s disabled state (it lives as
`aria-disabled` on the custom element — the same family as the false-green
`toBeEnabled()` this project already recorded), and a `getByRole('button')`
inside an `ion-item button` matches the row itself.

## 2026-08-15 — M8 rebuilt: the scope-shaped editor (§3.27, FR-27.2/27.4/27.6/27.7)

The second screen rebuild, straight after M7 (#88), same worktree pattern.
What landed, in the order it was built:

**The plumbing first** — the client could read §3.27's schema but not write
half of it. `template_includes` gains its two mutations and orchestrator
wrappers (the M7 read side landed without them, deliberately);
`template_item_tasks` gains everything — the type, master-table pull routing,
store state with the position-delete cascade mirrored, both mutations. Two
pure guards joined `domain/templates.ts`: `scopeSwitchBlock` (FR-27.6, both
directions, deliberately directional) and `planningTripsUsing` (FR-27.4's
warning surface: planning trips whose rows carry the template — or a Vorlage
that includes it — as provenance). A Local Mode round trip proves the whole
path touches no network. All four mutation checks ran red first: swapped
guard directions, dropped planning filter, dropped include reachability,
dropped task cascade.

**The screen** — scope segment with guarded switch (refusals are anchored
toasts naming the reason or the consumer; "Eingebunden in: …" stays visible
on an included group), the Gruppen section with the picker (groups only,
already-included hidden, "Neue Gruppe anlegen…" as an inline field — the M7
B2 lesson applied, no `prompt()`, no row before a name), the FR-27.2
resolution footer naming every merge with its contributors, the FR-27.4
blast-radius note, name-sorted position rows with deviation chips or
"Standard", and the FR-25.13 quick-add **reused, not copied**: QuickAddItem
lost its unused `tripId`, gained `confirmLabel` (the scope-labelled commit)
and `excludeItemIds` (a position the template carries is not suggested
again). The position sheet is a new `PositionSheet.vue` in the as-built M5
grammar: glance chips, Menge with a plain stepper (0 = "bewusst nicht dabei",
FR-5.5), the FR-27.7 task list with the blocking rule stated inline, and
assignment/procurement/dedup/conditions/late-packer behind "Details ▾".
The M3 attribute catalogue moved to `lib/attributeLabels.ts` so the FR-15.2
condition chips and the wizard's fold summary read one vocabulary. M7's
long-press menu gained the rename and delete it had reserved space for —
delete guarded like promotion: an included group names its consumer instead
of cascading out of every Vorlage that builds on it.

**Corrections against the spec, recorded as UI-Spec/UI-Test-Spec amendments:**
no swipe-to-delete and no reorder (no order column; the M7 render killed
swipe-in-card), and the blast note deliberately also fires on a group reached
through an including Vorlage. The first draft of the amendment also waved the
FR-25.15 indicator away as "G-2 already says it" — the /pr-review pass caught
that FR-25.15 _explicitly rejects that argument_ (captured-here versus
reached-the-server is the offline story), so the indicator was built instead
of excused: one shared `SaveIndicator` (amber ● in flight → green ✓ settled,
seam = the FR-19.2 orchestrator state), now in **both** sheets — the M5
rebuild had quietly shipped without it. Flip unit-tested, mutation-checked.

**Render pass:** built bundle, Local Mode, eight framed states (group editor,
sheet collapsed/expanded, picker, composed Vorlage with merge line, inline
group creation, guard toast, blast note both ways). One real defect caught on
pixels, not in review: bottom toasts slid in behind the tab bar and cut the
guard message in half — fixed with the M4 `positionAnchor` pattern on both
M7 and M8. Mid-run the owner set a new standing rule: **Playwright runs on
CI, not on this host** — the render pass was finished with one minimal
re-shoot (three frames) and everything since, including the new
`template-editor.spec.ts` (13 cases across three describes, closing
E2E-M7-07's include half on the way), is verified by the CI e2e job only.

**Two determinism defects the first CI round surfaced**, both instances of
known patterns. (1) E2E-M7-07 collects the `.section-head` sequence with a
one-shot `allInnerTexts()`, and the M8 rebuild gave the editor the same
class — during the back transition the outgoing editor still counts as a
visible page, so the collection read both screens at once. The e2e helpers
now treat "back on M7" as _settled_ (the editor's scope switch gone from
the visible page), not merely _arrived_ — the same one-visible-page lesson
the M7 round taught, applied to a locator that spans pages. (2) The visual
dashboard baseline encodes "Good morning", so the `visual` job was green
only inside the baseline's own time-of-day window — #87 and #88 passed it
by scheduling luck. The `freeze()` stub now pins `Date.prototype.getHours`
beside the existing `randomUUID` stub; `Date.now()` stays untouched (the
#87 finding: freezing it silently breaks the Local Mode write path).

## M9/M10 — the inventory on a tag set (§3.24, 2026-08-16)

Third and fourth screen rebuilds, and the first one that needed schema. The
owner unparked §3.24's tag half on 2026-08-16 ("wir machen es mit tags")
and explicitly allowed a destructive migration ("wir muessen nicht wirklich
migrieren wir alles loeschen und neu aufbauen koennen") — which was then not
needed: migration 022 preserves everything.

**What the decision actually cost is in ADR-014**, and it is one line of
schema: `items.UNIQUE(name, category_id)` becomes `UNIQUE(name)`. With no
category on the item there is no second column to be unique against, so
"Adapter" can no longer exist once under Technik and once under Velo. The
model's answer is one Adapter with two tags — the point of the feature — but
it is a capability removed, and the migration therefore _renames_ colliding
rows rather than dropping them: archived trips reach their master items
through `trip_items.source_item_id`, and deleting one to satisfy a
constraint would cut a trip loose from its own history. Two passes, because
two rows with no category could collide before 022 (SQLite treats NULLs as
distinct in a UNIQUE) and the category-name suffix would not separate them.

**The scoping decision that kept this small:** `trip_items.category_name`
did not move. It was always a denormalised snapshot of _one_ grouping key
taken at generation time, and one grouping key is still what a trip row
needs — from here it is the primary tag. Renaming it would have rippled
through M4, M12, analytics, export and the spreadsheet import for no
behaviour change at all. Measured before deciding: 221 client references to
"category" across 45 files, of which the master side was seven.

**A defect found while wiring, not by a test that existed:** `cascadeChildren`
in `master.go` announces FK cascades to clients as tombstones, and knew
neither end of `item_tags`. Deleting an item or a tag would have left every
device holding an assignment the server had cascaded away — for a tag that
means the inventory keeps grouping items under a heading that no longer
exists. Both ends now covered, and the two tests fall against the unfixed
build.

**Two false-green tests, one of them mine and one of them the suite's.**

1. `TestPush_ItemTag_RejectsUnknownColumn` asserted "some error". Whitelisting
   a bogus column made the push fail anyway — in the SQL layer, with
   "no such column" — so the test stayed green while the guarantee it names
   (the whitelist gate in front of SQL) was gone. It now asserts
   `errors.Is(err, ErrUnknownColumn)` and falls under exactly that mutation.
   Same fix applied to the `category_id` rejection test. This is the fifth
   consecutive PR to pay for asserting against the nearest readable thing.
2. **The desktop visual baselines under-detect by ~3.5×.** `maxDiffPixelRatio:
0.002` scales with viewport _area_: 658 px of tolerance at 390×844, but
   2304 px at 1280×900. M9's rebuild changed three lines of empty-state copy
   and added an app-bar icon; the mobile baseline failed at 4075 differing
   pixels and **the desktop one passed**. Worse, `--update-snapshots` only
   rewrites baselines whose comparison failed, so the desktop PNG kept
   depicting the _old_ screen — text and all — and would have gone on
   tolerating drift from an already-wrong picture. It was force-regenerated
   by deleting it. The threshold itself is ADR-013's tuning and deliberately
   left alone here; the finding is recorded for the owner to decide, since
   moving to an absolute `maxDiffPixels` would give both viewports the same
   sensitivity at the cost of re-tuning against antialiasing noise.

**Shape of the two screens.** M9 is lean by default and the chip axis
filters wider than the list groups — an item matches a chip when the tag is
anywhere in its set, while the grouping stays on the primary tag, so
filtering by _Sommer_ surfaces the swimsuit filed under _Kleidung_. The
FR-24.4 property preference reuses the `HeaderAction` badge the M4 filter
introduced. M10's tag control keeps assigned tags pinned above the matches,
because a filter that can hide what the item already carries is a filter
that loses edits. Its creation mode reports a duplicate name itself rather
than letting the push reject it — a consequence of `UNIQUE(name)` that the
user should meet as a sentence, not as a failed sync.

**Local Mode needed nothing:** its persistence is table-agnostic
(`table/id → row`), so `item_tags` rides the existing path. `internal/portable`
needed nothing either — its `Item.Category` is the trip row's snapshot, not
the master item's category, which was worth checking rather than assuming.

Still open from §3.24: **FR-24.3 lifecycle-aware deletion stays parked** —
a rule about history rather than classification, and nothing in the tag
model depends on it.

## M11 — containers rebuilt on the concept round (FR-10.1–10.3, 2026-08-16)

The fourth screen rebuild, and the first time M11 was rendered at all — the
concept round of 2026-08-08 had rejected the prototype's screen (a flat form
per card, one assign button per container per row) without anything being
built in its place. What runs now: a card per container (name, carrier,
weight bar with the FR-10.3 grades, imbalance line), the M5-grammar
`ContainerSheet` for editing, FR-24.5 placeholder-name creation from the
FAB, and an unassigned bucket of plain rows whose tap opens the same sheet
surface as a container _picker_ with each option's current load.

**The defect worth the rebuild: pairing was one-sided.** The old screen
wrote `paired_container_id` only on the tapped container, so the partner
rendered an imbalance against a container that did not consider itself
paired — exactly the half-set state the UI-Spec warns about. The write set
now comes from the pure domain (`pairWrites`/`unpairWrites`/
`releasePartnersOnDelete` in `client/src/domain/containers.ts`): both sides
at once, exclusive (a re-pair releases the old partner first, releases
ordered before sets so a freed partner can never overwrite the new pair),
idempotent, and self-repairing on a legacy one-sided row. `deleteContainer`
releases the surviving partner alongside its existing item unassignment.

**Found on the pixels, not in the stylesheet:** the sheet's carrier section
rendered as a bare heading on a trip without travelers — now absent, not
emptied (the FR-24.5 stance). Rendered against the seeded :3000 instance
through a Vite proxy inside the pinned Playwright container.

**The e2e unit paid for two lessons** (ledger has the detail): Playwright
CSS pierces shadow DOM, so "no button grid" is asserted as zero `ion-select`
per row rather than zero `button`; and a tap during an overlay's dismiss
animation is swallowed by the backdrop, so `closeSheet()` waits for
`ion-modal.show-modal` to be gone. The symmetric-pairing case was
mutation-proved by reverting `pairContainer` to the one-sided write.

Beside the rebuild, `formatWeight` — five identical copies across five
files — moved to `client/src/lib/format.ts`, and the M9/M10 unit's missing
row in the ledger's status table was repaired.

No ADR: every tradeoff here was decided in the 2026-08-08 concept round;
this entry records execution, not decision.

## Browser back with the M5 sheet open (Navigation Concept §7 case 4, 2026-08-16)

Found by the owner on the first eyeball after M11: back on an open item
detail landed on the trip list, skipping the packing list. Root cause: the
sheet _replaces_ the trip's history entry (deliberate — a push measurably
mounts a twin packing list, re-verified during this fix), so the entry under
the overlay does not exist and a history pop goes two screens back. The
chevron was already overlay-aware (`backTarget`); the browser's button was
not.

The fix (`client/src/router/overlayBackGuard.ts`) treats a pop leaving a
route with an active `meta.overlayParam` as "close the overlay": the pop
completes, then the overlay parent is pushed. Two rejected mechanics, both
paid for in the attempt: a `beforeEach` redirect renders the wrong screen
under the right URL, because Ionic latches the pending pop direction when a
navigation _confirms_ and an aborted pop leaves it stale for the corrective
navigation to consume; and intercepting `popstate` before the router means
forging vue-router's position state. Letting both navigations confirm keeps
Ionic coherent, costs one brief visible bounce through the trip list, and
rebuilds the natural list → trip chain so the next back lands right.

Unit-specified against a memory-history router (pop closes, chain restored,
plain pops untouched, the chevron's replace not intercepted); e2e-covered by
E2E-M5-13, red-proved against the unguarded build. Known accepted gap:
a back during the sheet's enter animation still races Ionic's transition
queue — documented in the concept doc, unreachable by an intentional back.

## M11 joins the visual baselines, and the image gets a platform (2026-08-16)

Owner decision on the question PR #91 left open: M11 is the first screen
outside M4 to get baselines. Two shots (E2E-VIS-06/07), because the screen
renders three things no existing baseline does — a load bar whose fill
carries an FR-10.3 grade colour, the paired/imbalance line, and the card
list — plus the M5 sheet grammar applied to a container, whose load line and
pairing chips exist on no other surface. The load is real rather than
staged: a master item with a weight, quick-added through its suggestion, so
the bar grades something.

**The finding is next to the images, not in them.** Generating them off the
runner surfaced that ADR-013's digest pin was half a pin. A digest fixes
_what is in_ the image; on an Apple-Silicon machine docker resolves that
same digest to its arm64 variant, so a baseline recorded on a development
machine would be judged in CI against a rendering it never saw. The image
now carries `--platform linux/amd64`, which is a no-op on the amd64 runner
and emulation everywhere else. Proof rather than argument: with the platform
named, all 16 pre-existing baselines reproduced byte-identically on the Mac
(`git status` showed only the four new PNGs), and only then were the M11
images kept.

**The platform pin was only half of "generatable off the runner."** Naming it
made the _images_ comparable; the run still could not start. `make visual`
mounts the worktree, which hands the container the host's `node_modules`, and
rolldown ships a native binary — so vite's preview server died at "Cannot find
module … linux-x64" before a single pixel was rendered. That the baselines
above exist at all is because they were produced in a copy whose dependencies
were installed _inside_ the image. `scripts/visual.sh` now does that itself
when the host is not Linux: the container mounts its own tree out of the
user's cache directory and fills it with `npm ci`, which costs ~9 s over
virtiofs — cheap enough that a staleness check would cost more than redoing
it. The first attempt put that tree under `client/`, and `make ci` rejected it
within a minute: a second `node_modules` inside the project is walked by
everything that walks the project, and eslint followed it in. Ignoring it in
one tool would have moved the problem to the next one. CI is untouched, because there the host _is_ Linux and the
mount is already right. Proven by running `make visual` unmodified on the Mac:
20/20, the M11 images included.

Two Docker Desktop leftovers cost the detour and are worth naming for the
next machine: a `credsStore: desktop` in `~/.docker/config.json` pointing at
an uninstalled helper, which fails every pull with a credentials error, and
a stale `vite preview` from a deleted worktree squatting on port 4173, which
Playwright's `reuseExistingServer` could not reuse because it answered 404.

## What "covered by e2e" was not covering (2026-08-16)

Asked after the M11 eyeball whether the screen was fully covered, and the
honest answer was no — in a way worth recording, because none of the three
gaps was a missing test id. All six M11 ids were implemented and green.

1. **A spec sentence is a list of promises.** E2E-M11-05's text said pairing
   is released "when cleared **or when one side is deleted**". Only the first
   half was asserted; the second lived as a domain unit
   (`releasePartnersOnDelete`) and was marked implemented anyway. It now sits
   in E2E-M11-04, because that is the only place it is _visible_: with two
   empty containers a released and an un-released survivor render identically,
   so an assertion there would have passed whatever the code did. Under a
   skew, a survivor still pointing at a deleted partner goes on reporting
   100 % imbalance — that is the observable, and it is mutation-proved.
2. **A spec sentence can also over-claim the implementation.** E2E-M11-03
   promised assigning items "into/between containers". The screen has no
   between: an assigned item leaves the bucket and the cards do not list their
   contents. Re-assignment lives in M5's container control. The spec sentence
   was the defect, not a missing test.
3. **Getting to the screen was nobody's case.** The M11 unit reaches M11 in
   its own `beforeEach`-style helper, which is not the same as covering the
   navigation — the working agreement puts that in `global-nav.spec.ts` after
   four defects that both green screen suites missed. E2E-G9-11 now owns the
   luggage button and the way back.

**The mutation proof itself nearly lied.** The first attempt edited the
orchestrator, re-ran the case, and watched it stay green — which reads as "the
assertion is weak" and is in fact "Playwright serves `dist/`, and nobody
rebuilt". Test-side edits need no rebuild; production-side edits always do.
With the rebuild the case is red without the release and green with it.

All three gaps are now checks in `.claude/skills/pr-review/SKILL.md` §5:
read the spec's case text against the test body sentence by sentence, read it
against the _screen_ too, cover the global patterns rather than only the
screen, and mutation-prove the case that owns the PR's headline defect —
rebuilding between the two runs.

## M12 — analytics rebuilt on the concept round (FR-8.1/8.2/14.3, 2026-08-16)

The last dimension of the 2026-08-08 concept round to reach code. What the
round found, and what the rebuild does about it:

1. **The slice tap now filters, not just groups.** `analyzeTrip` keys every
   slice by exactly what M4's facets filter on — traveler id,
   `category_name`, container id, `''` for the absence bucket — so the tap
   is `setStoredFacet` (new, beside `setStoredGroupBy` in
   `usePackingFilter`, same ADR-012 shape: storage synchronously **and**
   the still-mounted M4's live ref) plus the grouping, and the reader lands
   on the number they tapped. Other facets are cleared deliberately: one
   number was tapped, so one facet is in force.
2. **The `undefined` bucket cannot recur, by construction.** The
   prototype's per-person entries carried no top-level traveler/quantity
   and needed a shares expansion; the client's data model already is the
   expansion — one row per traveler instance, each with its own quantity
   and packed count. The unit test pins the shape anyway
   (`analytics.spec.ts`: one contribution per traveler by Person, one
   summed bucket by category, equal totals).
3. **Unweighted rows leave the bars entirely** (a zero-width bar reads as
   "weighs nothing") and are counted beside the chart; their value still
   counts. Trend is **packed** weight per year — an archived trip's plan
   is an intention, the packed count is the record — and the flagged list
   is series-scoped, both matching the prototype.
4. **G-13's headline figure got its class** (`.jp-figure`, display face on
   the two KPI boxes) — written now because M12 is its first rendered
   user, per the rule that a role class waits for a pixel to check it.

Sequencing note: E2E-M12-03's positive half (trend columns on screen) is
blocked on a product gap found while writing the case — nothing user-facing
can move a trip to _active_, so nothing can archive one; the ledger records
it and the North-Star phase owns the transition. i18n rode along: M12 is
t()-localized in both catalogues, including the analytics keys added here.

Remaining rebuild after this: M14.

## M14 — review assistant rebuilt on the concept round (FR-9.2/27.11, 2026-08-16)

The last screen rebuild. The 2026-08-08 concept round changed both halves
of the old M14 (2026-07 card stack writing to "the dominant template"), and
the rebuild follows the prototype:

1. **A list, not a card stack.** Every proposal at once under an
   "Offen · N" head; applied and skipped rows stay in place, dimmed and
   chip-marked, and an "Übernommen · N" footer counts what was written —
   the same honesty stance FR-25.11a takes on the packing list. The row
   state lives in a merge of live proposals and session decisions
   (`watchEffect`), so a proposal applied elsewhere disappears while a row
   decided here survives its own recompute.
2. **Proposals target groups** (`domain/review.ts` rewritten): _ungenutzt_
   defaults to the group the row's provenance names, _fehlte_ to the group
   that contributed most of the trip; a row whose provenance is a
   Ferien-Vorlage's own position yields nothing — that structure feedback
   is M21's job (FR-27.5). The per-row picker offers groups only, and for
   an _unused_ row only groups that carry the item (`retargetGroups`) —
   zeroing a position that does not exist would apply as a silent no-op;
   recorded in the UI-Spec as a decision. Apply takes the picker's group,
   not the default (`applyReviewProposal(proposal, groupId)`), and the
   FR-27.4 blast radius is stated per row from `planningTripsUsing` on
   the _selected_ group, live.
3. **"Nie mehr fragen" is pair-scoped** — `dismissalKey(itemRef, groupId)`
   against the row's current target; the same item still surfaces for a
   different group. Archiving a flag-less trip now skips the assistant
   with the specified toast instead of presenting an empty screen (M4's
   `onArchive`).
4. **Coverage splits three ways, honestly.** Domain arithmetic in
   `domain/__tests__/review.spec.ts` (21 cases); the list semantics in a
   _component_ test (`views/trips/__tests__/ReviewPage.spec.ts`, first of
   its kind for a page) because every positive e2e case needs an FR-9.1
   flag and the only flag writer gates on an _active_ trip — the same
   planning→active product gap the M12 unit recorded; the e2e unit
   (`e2e/review.spec.ts`) pins the reachable surface (framed empty state,
   G-9 back) and the ledger names the owed cases for when the transition
   ships. The FR-27.4 applied-change log entry stays with the §3.27
   refresh package, same as M8's E2E-M8-09 note.

The test-spec M14 section was reconciled in the same PR (it still described
the card stack, targeted templates, and carried a duplicate case id — the
no-flags case is E2E-M14-06 now). i18n rode along: M14 is t()-localized in
both catalogues.

Because no app path can produce a populated M14 at all (not even in dev —
the sample trip's rows carry no provenance and FR-27.10's group add is part
of the unbuilt §3.27 package), the dev gallery grew a fixture button
(`src/dev/reviewFixture.ts`): it seeds in-memory rows covering both proposal
kinds, the retarget picker and the blast radius, then opens the _real_
route. State only — a reload clears it — and DEV-only like the gallery
itself, so it is absent from the production bundle.

With this, every screen rebuild from the 2026-08-14 plan is code. What the
plan still owes is in CLAUDE.md's "Not built yet": the §3.27 client package
(instantiate expansion, FR-27.4 refresh, M21), the i18n remainder, the
Playwright backlog — and M14, like M12, is unverifiable end-to-end until
something user-facing moves a trip to _active_.

## §3.27 generation: composed templates actually reach the packing list (2026-08-16, PR pending)

The first half of "Not built yet" item 2. Everything M7 and M8 could build
since 2026-08-15 was inert at the one moment that matters: `instantiate.ts`
filtered template positions by the templates it was _handed_, so a trip
generated from a Ferien-Vorlage carried only that Vorlage's own positions and
silently dropped every group attached to it. The machinery existed on both
ends — `template_includes` in migration 016, `resolveTemplate` for M7's row
count and M8's footer — with nothing joining them.

Four things, in the order they were built:

1. **Include expansion at generation (FR-27.2).** `GenerationInput` now takes
   the template _catalogue_ plus the picked ids, rather than a pre-filtered
   list: the caller cannot know a Vorlage's composition, so generation
   resolves it. Expansion is one level, matching `resolveTemplate` and the
   two-level hierarchy FR-27.1 fixed — following an included group's own
   includes would quietly reintroduce the depth that FR rejected, and with it
   the cycle it cannot have. Rows keep the **contributing group** as
   `source_template_id`, which is what FR-27.5 and FR-27.11 read back a year
   later, and `MergedOverlap` carries its contributing templates so the merge
   can be named instead of counted. A template both picked directly and
   reached through an include contributes once — without that guard a `sum`
   position merges with itself and doubles.
2. **Task materialisation (FR-27.7).** Generated rows carry the preparation
   tasks of the position(s) that produced them, and `createTripFromWizard`
   writes each as an ordinary FR-7.3 todo. No new flag: an open prep todo
   already blocks "done", so M4, M5 and M1 pick it up unchanged. A merged item
   keeps the **union** of its contributors' tasks (dropping the second group's
   task would lose exactly the knowledge the feature is for) with identical
   text collapsed to one todo, and each todo is enqueued behind the
   `trip_items` row it references — the comments row carries that id as a
   foreign key. The `'current-user'` actor placeholder became a named constant
   with the invariant-3 reasoning on it; it had been a literal in three files.
3. **M3 step 3, scope-shaped (FR-27.6).** Two sections mirroring M7. Every row
   counts what picking it _resolves_ to rather than its own positions — a
   Vorlage frequently owns none and is nothing but its groups — and a group a
   picked Vorlage already brings says so on the row instead of letting a second
   tap look like it added something (the FR-25.13 duplicate-report rule). The
   footer names each merge with its groups and states the inherited task count.
   The merge sentence is **M8's, reused**: same fact about the same
   composition, and two wordings would have drifted apart. The section is
   t()-localized; the rest of the wizard stays with the i18n backlog item.
4. **An e2e unit that immediately paid for itself** (`e2e/trip-composition.spec.ts`,
   E2E-M3-11/13, composition built through M7/M8 per spec §2.4). It reported
   the same merge as „in Wildlife & Makro" on WebKit and „in Makro & Wildlife"
   on Chromium, from identical data.

That last one was **not a flake, and a retry would have buried it.**
`template_includes` has no sort column, so the rows arrive in whatever order
the sync or IndexedDB produced — and both `resolveTemplate` and generation read
that order straight through. It decides which group is a merged item's _first
contributor_, hence whose attributes and `source_template_id` the generated row
carries: two devices could have disagreed about where a packed item came from.
`includedTemplatesOf` now derives the order (group name, include id as
tie-break) for both callers, and the superseded case asserting "the order they
were included" was rewritten rather than adjusted — that order does not exist
in the data. **Standing lesson, one more time in a different costume: the
rendered run is the only place some defects exist.** The component tests were
green, the domain suite was green, and both would have stayed green forever.

Two smaller repairs rode along. The M7/M8 seeding helpers moved into
`e2e/fixtures.ts` rather than being copied a third time (`visiblePage` is still
duplicated in four other specs — a separate cleanup). And the traceability had
grown a collision: the test spec used E2E-M3-11/12/13 for the §3.27 cases while
three unrelated step-1 cases had taken the same ids in code. The code's three
are renumbered E2E-M3-14/15/16, and the spec now carries entries for them,
which it never had.

What item 2 still owes: the FR-27.4 planning-trip refresh diff (with its M2
applied-changes chip, which also unblocks E2E-M8-09/M8-11's log half and
M14-04's), the M21 screen (FR-27.5), portable YAML for includes and tasks
(FR-18.2), FR-27.3's single-item add in step 3, and FR-27.10's whole-group add
to a running trip — that last one owes task materialisation on its rows too,
which this PR deliberately did not build into `addCompanionItems`: a companion
comes from a dependency, not from a template position, so it has no tasks.

## FR-27.12: a group stops being a name with a number (2026-08-16, PR pending)

Owner question after the §3.27 generation PR — you should be able to look inside a group,
macro photography for instance; have we specified that? — no, and
the gap was wider than one screen. A group announced _how many_ items it held
and never _which_, in all three places it is offered: M3 step 3, M8's Gruppen
section and M14's target picker. The only answer was the M8 editor, which from
the wizard costs the draft and from M14 the review pass.

**Decided on rendered variants, not on argument**
(`dev-docs/UI_Concept_GroupPeek_variants.html`, generated from the prototype's
own stylesheet so the forms could not be judged on differing paint): a peek
sheet (A), an unfolding row (B), and a row that names its first items with no
interaction at all (C). The owner chose **A and C together**, which is what
shipped.

What decided it against B — the nicest of the three on M3 — was that the same
question is asked on three surfaces with three shapes: M8's picker is a chip
row and M14's target a select, and neither has a row to unfold. One form that
answers everywhere beat the best form for one screen.

Three things worth keeping:

1. **The sheet is a look, not an editor**, and a test pins that its only button
   closes it. Editing a group has one home (M8); a second editing surface is a
   second place for the same rule to drift.
2. **The list is the resolved one**, so a Ferien-Vorlage peeks through its
   composition and a shared camera appears once — and it is ordered by item
   name, for exactly the reason `includedTemplatesOf` is ordered: positions
   arrive in sync order, and a list somebody scans for „ist das Stativ dabei?"
   must not answer differently on two devices.
3. **Two names per row, not three** — decided on pixels: at 390 px three German
   item names wrap, turning a scannable row into a four-line block. The count
   („+2") is the honest half of a summary that cannot answer the precise
   question.

`SheetModal` collects the bottom-sheet chrome that four screens each carried a
copy of; the peek would have been the fifth. The four are untouched — moving
them is mechanical and belongs in its own change.

E2E-M3-11 needed tightening in the same PR: it checked scope separation with a
substring, and a Vorlage's row now legitimately contains „Makro-Objektiv". An
assertion that passed for the wrong reason failed the moment the screen said
more than it used to.

## The dev seed grows a master partition (2026-08-16)

Owner, wanting to test the freshly merged §3.27 work: add items and groups to the initial
data set for testing purposes, and keep doing that as the standard from now on.

`sampleTrip.ts` seeded a trip and nothing else, which was enough while the trip
screens were the ones being built. Since §3.27 it is not: a trip carries its own
rows and teaches the master partition nothing, so M7, M8, M3 step 3 and the
FR-27.12 peek all opened empty on a fresh device and testing any of them started
with twenty minutes of typing.

`sampleMaster.ts` fills that gap and the M2 dev button now seeds both — master
first, then the trip. **Standing rule from here on: a new master-data feature
extends this seed.** That is the "als Standard" half of the request, and it is
recorded in CLAUDE.md where a dev looks rather than only here.

Same two constraints as the trip seed, for the same reasons. It is **dev-only**
behind `import.meta.env.DEV`, so module and trigger drop out of a production
build — this is not Demo Mode returning; that was a _product_ surface and stays
removed (Addendum v2.10). And it writes through the **orchestrator's own
actions**, so every row it creates is one a user could have created, rather than
inventing a second seeding path that would be the one nobody notices breaking.

The data is picked for what is otherwise tedious to reach rather than for
volume: two groups **sharing the camera**, so the FR-27.2 merge has something to
name in both M3's footer and M8's resolution footer; a Vorlage with **own
positions beside its two groups**, so the resolved count differs from either
half; an FR-27.7 task on a shared position, so a generated trip starts with a
real prep todo; and a third group left **deliberately unincluded**, so M8's
picker and M3's _Zusätzliche Gruppen_ both have an offer. Six tests pin those
properties — not the contents — because a seed that quietly stops producing a
resolvable composition wastes the session that discovers it.

**Still open, deliberately:** the sample _trip_ is still built through the M18
portable-import path, so its rows carry no `source_template_id`. Generating it
from the seeded Vorlage instead would give it provenance and finally make M14
reachable with real proposals — but it changes what the trip seed is, so it is a
decision rather than a side effect of this change.

## Plain HTTP could not write at all (2026-08-16)

Found by the owner testing the fresh §3.27 work from an iPad on
`http://192.168.1.35:3000`: the dev seed button did nothing, then „New item
anlegen geht nicht". The cause was one line, and it was everywhere —
`crypto.randomUUID()` is defined **only in a secure context**, and all 24 id
sites in `useMutations.ts` called it directly. On a self-hosted instance served
over plain HTTP on a LAN — a first-class deployment for this product — creating
an item, a trip, a tag or a template threw and the screen did nothing.

`lib/ids.ts` is now the single id source: `randomUUID` where the platform has
it, otherwise the same RFC 4122 v4 built from `crypto.getRandomValues`, which
carries no secure-context restriction. It **refuses** rather than falling back
to `Math.random` if neither exists: these ids are primary keys other devices
merge against (NFR-4.2a), and a collision there is silent data loss where a
thrown error is at least visible.

Three things this cost, worth keeping:

1. **The suite was green in the one environment where the bug cannot exist.**
   Playwright serves from `localhost`, which is a secure context. No amount of
   coverage in that shape would ever have found it. `e2e/insecure-context.spec.ts`
   removes `randomUUID` before boot and drives the four real creation paths;
   E2E-NFR-SEC-01 asserts the premise so the unit cannot silently stop testing
   anything. Red-proved by reverting the fix and rebuilding.
2. **A missing signal cost more than the bug.** The dev seed button was an async
   handler that only navigated on success, so a throw was indistinguishable
   from a dead control — the owner reasonably suspected the button, twice. Once
   it reported the failure, the message named the cause in one line. The
   handler now reports both outcomes, and the seeding moved to
   `dev/sampleData.ts` so the outcome has one shape and one place to fail.
3. **A guard, not a memory.** A unit test rejects `crypto.randomUUID` anywhere
   in `client/src` outside `lib/ids.ts` — the same idea as the no-raw-colour
   rule, because the next call would be invisible on localhost again.

Ridealong from the same session: the Local Mode sync indicator set no icon size
and inherited 13 px beside its 25 px neighbours, where a phone outline reads as
a missing-glyph box („links vom Zahnrad siehts kaputt aus"). It is on
`--jp-icon-md` now, which is where invariant 9 says icon sizes come from.

## The dev-only surfaces were not dev-only (2026-08-16)

Found reviewing PR #98, by checking a claim instead of reading it. `sampleTrip.ts`
said — and `sampleMaster.ts` copied, and the addendum and CLAUDE.md repeated —
that the seed "drops out of a production build entirely". It did not. Three
chunks (`sampleData`, `sampleMaster`, `sampleTrip`) sat in `client/dist/assets`
of every release, and the same was true of the M14 fixture.

The mistake is worth naming precisely, because it looks correct: the guard was
`v-if="isDev"` **on the button**, while the `import('@/dev/sampleTrip')` inside
the handler stayed a live code path. A `v-if` hides a surface; only a
compile-time-false branch _around the import_ removes the code, which is the
shape `router/index.ts` has always used for the gallery route. Moving the guard
to `if (!import.meta.env.DEV) return` prunes all three.

**Nobody could reach it, which is exactly why nobody noticed.** A hidden
surface and an absent one are indistinguishable from the outside; only the
bundle can tell them apart. So the fix ships with `scripts/dev-code-gate.mjs`
(`make client`, CI client job): it fails the build when a dev chunk name or a
piece of seed _data_ appears in `dist`.

Two things that gate taught while being written, both kept in its comments:

1. **The first fingerprint was wrong in an instructive way.** „Makro Fotografie"
   looked like seed data and is also example copy in the i18n catalogue — a
   guard that fires on shipping product text is worse than no guard. The marks
   are now strings only the seeds contain („Fotoreise (Beispiel)", „Kartusche
   prüfen"), and the gate was proved by planting one in a built chunk.
2. **The claim is now stated as narrowly as it is true.** The _modules_ are
   gone; the button's `v-if` branch still leaves its label in the page chunk as
   dead string. That is an inert branch of a few bytes, not a reachable
   surface, and the comments say so rather than rounding up to "entirely".

## FR-27.14: the footer stops being the whole answer (2026-08-17)

M8 said „6 Artikel · 2 Gruppen + 1 eigene Position" and left it there. The
number answers _how many_ and never _what_, so from the editor of a Ferien-
Vorlage — the thing whose entire purpose is to produce a packing list — there
was no way to see what a trip would get. Owner asked for it with a mockup, then
picked variant A from the rendered round.

**What it cost to build was small, and deliberately so:** the FR-27.12 peek
sheet already resolves a Vorlage through its composition, so this added an entry
point and the information a bare list was missing. The footer became a button;
`resolvedLines` grew from `{name, quantity}` to carry what a count cannot say.

Three marks, each defending a specific lie a number would tell:

- **nur 1×** — the line exists once because a merge collapsed it, not because
  one template asked once (FR-27.2).
- **pro Person** — a per-person position fans out at generation over travelers
  the _trip_ knows about; a template printing „3×" would be guessing (FR-25.8).
- **the procurement mode and mit Bedingung** — at template level nothing is
  excluded yet, so a conditional row must say so rather than appearing as a
  promise the trip may break (FR-15.2).

**One rule came out of a failing test rather than the plan.** Provenance was
going to be shown on every line; peeking a _group_ then reads „aus Makro
Fotografie" on every row of Makro Fotografie. The rule is narrower: a template
that includes nothing has only one possible source, so the sheet stays quiet —
provenance is information only once a composition can differ. The same sheet
now serves both cases without a flag.

Two smaller things: the item name got its own element, because the tests were
otherwise asserting against concatenated strings where marks and source run
together (`Kamera once onlyfrom Makro…`) — a test reaching for the nearest
readable thing again, and the fix is an anchor rather than a cleverer regex.
And both M8 describes now declare `test.slow()`: the fifth composition-building
case pushed WebKit past the 30 s budget and four cases failed, three of them
untouched — the M3 unit's lesson, arriving a second time in the same week.

## The ＋ answers where it is (2026-08-17)

Owner, testing: the ＋ should appear only where something can be added, and on
M7 it should follow the context — standing on _Gruppen_, it should create a
group rather than ask.

**M7's chooser now asks only where the question is real.** The scope segment
already states what you are looking at, so a single-scope tab answers it and
the sheet opens on the name, titled with the scope it is about to create. Only
_Alle_ still asks. The rule lives in `domain/templates.ts` as
`scopeForNewTemplate`, returning **null for "ask" rather than a default**: the
two kinds are not interchangeable (FR-27.1), and a wrong guess is not
recoverable once something includes the group.

That placement was not the first attempt. The rule started as a component test
against M7's modal, which is teleported and therefore invisible to the mount —
the failing test was the signal that the decision did not belong in the view.
Moved into the domain it is five lines and two cases; the flow itself is
covered where it belongs, in e2e.

**The ＋ steps aside while the quick-add is open** (M4 and M8). It would open
what is already open, and the composer wants the room.

**One regression nearly shipped inside that fix.** Hiding the whole `IonFab`
also removes `#m4-fab-anchor` / `#m8-fab-anchor` — the elements both screens
position their toasts against — which would have dropped every toast behind the
tab bar, the exact defect fixed on 2026-08-15. The guard sits on the _button_
instead, and E2E-M8-17 asserts the container survives, so the next person to
tidy this cannot quietly reintroduce it.

**The durable fix is one level further, and is not made here** (raised by the
session working on #101, 2026-08-17): the anchor is _infrastructure that
happens to live inside the FAB_. As its own always-present element it could not
be removed by a change to the button at all, and the coupling that produced
this near-miss would be gone rather than guarded. Worth doing when a third
screen needs an anchored toast; for one guarded pair it is more machinery than
the problem.

Not found, and worth recording because it was the owner's example: the item
editor (M10) has **no** FAB at 390 px or at 1024 px, and none of the six FABs
in the client sits on a screen without an add action. The misfire was the
composer case above.

**The hiding broke a real flow, and CI caught what the hand check could not.**
Eight visual baselines and part of the e2e suite failed on the first run: the
specs add several items in a loop and tap the ＋ each time, but the composer
_stays open_ after an add (FR-25.13) — so the second iteration waited forever
for a button that had just, correctly, disappeared. Adding three things in a
row is not a test artefact; it is the flow. My manual check added one item and
was blind to it by construction.

The production behaviour stands; the thirteen call sites went through one
guarded `openQuickAdd()` in `fixtures.ts`, which taps the ＋ only when the
composer is closed — the guard `addPosition` has had since the M8 rebuild,
now shared instead of copied.

## The sheet header's two round controls (2026-08-16, FR-25.15 / G-14)

Owner-flagged from a rendered phone: on M5's item detail the green save ✓ sat
visibly higher than the ✕ beside it. Measured rather than guessed — 26 px
against 34 px, both hung from the header's `flex-start` edge, which puts the
smaller circle's centre 4 px above the larger one's. Nothing in either
stylesheet is wrong on its own; the pair is.

The fix names the diameter once, `--jp-control-round` in `surfaces.css`, and
the indicator and all three sheet ✕ buttons (M5, M8's position sheet, M11's
container sheet) resolve through it. A control's size is a shape decision, so
it belongs in the shape table with the radii — restating it per sheet is how
the two got to disagree in the first place. The glyph moved one step up the
type scale with the circle: at 13 px inside a 34 px disc it read lighter than
the ✕, which takes its size from the icon table rather than the text scale.

E2E-M5-14 pins it, and cost one lesson worth writing down: the first draft
called `boundingBox()` twice and failed **on the fixed build** under parallel
load, reporting a 5 px difference between two boxes that are aligned — the two
calls land in different frames of the sheet's enter animation. Reading both
rects inside one `evaluate` makes the shared transform cancel out, so the
comparison is exact regardless of when it runs. Settling the animation first
would have been the weaker fix: it waits and hopes, this one cannot be wrong.

The visual baselines did not move: the M11 sheet's changed disc is ~380 px of
a 329 000 px frame, under ADR-013's `maxDiffPixelRatio`. A tolerance that
absorbs an intended change also absorbs an unintended one — which is why the
geometry has its own assertion rather than relying on the screenshots.

## §3.28: the packing row gets a mark, decided on pixels (2026-08-17, spec only)

Owner question: a pack item can carry a photo — would emojis, or an icon from a
library, not make more sense? With three conditions attached: recognisable per
icon, searchable the way WhatsApp is, and ideally _suggested_.

The answer is not either/or, and saying so was the first useful move: the photo
(§3.22) answers **which** jacket, and it exists on a handful of rows because
nobody photographs forty items. What a forty-row list lacks is a **mark** — the
always-affordable symbol that says _what kind of thing this is_ before the name
is read. So the photo stays and the mark is added beside it, with a ladder
deciding which is shown (FR-28.4).

**Decided by rendering, not by arguing.** Four marks, one fifteen-row list, one
frame: emoji, an icon library, photo-first, and a coloured initial as the honest
null variant. Two things only the render could settle:

1. **The icon library is the option that fits our own rules and it still lost.**
   Monochrome strokes in a role colour satisfy G-11/G-13/G-14 without an
   exception, and at 34 px sunscreen, bottle and water bottle are the same
   picture. Its substitute rate was also the **higher** of the two — 7 of 15
   against emoji's 6 — because libraries carry travel gear and not household
   detail. That margin is one row and proves nothing by itself; the
   distinguishability does. The argument favoured it; the pixels did not.
2. **The null variant is worse than nothing.** A coloured initial repeats, in a
   circle, the name standing next to it. That is what made "no mark" an
   acceptable and _normal_ row state in FR-28.1 rather than a gap to fill.

The list was seeded on purpose with a row nothing fits (_Trekkingstöcke_) and
several near-misses (_Fleecepullover_, _Schlafsack_, _Wasserflasche_ — Unicode
has no water bottle): a symbol system is decided in its tail, not in its head.

Counting those beat a claim I had already written down: the first draft of this
entry said 4 substitutes against 6. Counting the rendered data said **6 against
7**, which keeps the conclusion and removes the margin it looked like it had.

**The suggestion is cheap and was built to prove it.** The variant page carries
a working picker: one keyword index (de + en), scored against the item name.
`Tarnzelt → ⛺`, `Kaffeekanne → ☕`, `Wasserflasche → 🧴🥤💧`. One correction came
out of running it: German compounds need splitting, but a suffix may only become
a token when the index already knows it — the first version happily tokenised
„Zahnbürste" into _ürste_, and the suggestion line read like noise. That rule is
in FR-28.3 and is a test name, not a comment.

Two costs are accepted in writing rather than discovered later: the mark is the
one surface whose colours do not come from the token table (G-15 confines it to
content — never a button, a status or a progress), and a self-hosted subsetted
emoji face rewrites every visual baseline when it lands (ADR-013), which the
implementing PR does once, deliberately.

**No ADR here.** The tradeoff is real and an ADR is owed — but `adr/README.md`
is explicit that one without code is a plan, so it ships with the build, using
this round as its evidence.

## G-2's detail, and the Local Mode backup behind it (2026-08-17, FR-19.6/NFR-4.11)

Owner question, from the running instance: _„was bedeutet das Icon zwischen Lupe
und Zahnrad?"_ — the phone glyph. That the question had to be asked is the
defect: G-2 has specified a detail behind the glyph since UI-Spec v1.0, and the
app had none. `onSyncTap` pushed `/trips/:id/conflicts` when a trip route
happened to be open and returned silently everywhere else, which is most of the
app and all of Local Mode.

**The sheet splits by run mode, not by glyph state.** Server Mode explains the
connection, counts the queue and leads to the conflict log; Local Mode explains
that no server exists, reports storage against quota with the NFR-4.11 eviction
warning, and offers the backup. Local Mode never offers the conflict log — one
writer produces none, and an entry that describes a mode you are not in is
worse than no entry. The split is on `mode` rather than on `state` because an
in-flight Local Mode write reports as _syncing_ (FR-19.2) and must still get
the storage story.

**The one-tap export had to become a whole-device backup.** M17 already exported
one trip or one template at a time; NFR-4.11 calls the export _the_ backup, and
a backup that asks the user to remember each trip and template one by one is not
one anybody performs. So the file is every trip and every template as one
multi-document YAML — which immediately owed the other half: **our own importer
could not read it back**. A backup nobody can restore is not a backup, so M18
grew a restore branch (list the documents, import them together) and
`commitPortableRestore` matches **per document as it goes**, never once up
front: a backup names the same master item in a template and in every trip that
uses it, and matching against the pre-restore inventory would have created one
copy per mention. The test that pins that is the one that would otherwise have
shipped a duplicate inventory on every restore.

**Two defects only the rendered pixel showed, both in the same sheet.**

1. _The last line sat under the tab bar._ An auto-height Ionic sheet is measured
   once at presentation, and the storage section arrived a tick later because
   `navigator.storage.estimate()` is async. The fix is ordering — read the facts,
   then open — not padding. Found by screenshotting; invisible in the markup and
   invisible to the component test, which has no modal.
2. _„Last backup -1 days ago."_ The sheet captures `now` when it opens, the
   stamp is written when the user taps, so the stamp is the later of the two and
   `Math.floor` of a small negative is −1. `reminderState` clamps at zero now,
   which also covers a device whose clock moved back. **The e2e case caught this,
   not the component test** — the component test injects both clocks and would
   have had to be written by someone already suspecting the bug.

A third one worth recording as method: the first screenshots looked like the tab
bar was painting over the sheet. It was not — the shot was taken mid-animation,
40 px of translate from what a user sees. The screenshot driver now waits for the
modal wrapper's bottom to reach the viewport bottom. A rendered check is only
evidence once the render has settled.

Localization came along for the ride: the glyph's tooltip was four English
literals beside four catalogue keys nobody used.

## FR-2.6 variant A: the review step reviews (2026-08-17)

Owner picked A from the rendered round: the decisions live on the row.

Step 4 changed exactly one thing before this — the amount. Everything else
waited until the trip existed, so the wizard's last step asked for approval of
a list it would not let you correct.

**What A means concretely, and where its edges are:**

- **✕ drops a row as FR-5.5 _skipped_, never as a deletion.** The row stays,
  struck through and reversible, and reaches the trip with quantity 0 — which
  `addGeneratedTripItem` already turns into `skipped`. Deleting instead would
  make this one gesture behave differently here than everywhere else in the
  product, and would leave the next trip nothing to learn from.
- **The marks are labels, not controls.** _pro Person_ and the procurement mode
  explain what the row already is. Turning them into editors would put a second
  procurement-and-assignment surface beside M5, which is the thing FR-2.6
  argues against in the first place.
- **The create button counts what is actually coming.** A number that still
  includes the row you just dropped is worse than no number.
- **The mockup's add line is not built here.** Adding single items to a trip
  being created is FR-27.3's, and it owns that in step 3; a second path in
  step 4 would leave two mechanisms for one act.

Reusing `quantityOverrides` made the whole thing small: dropping is an override
of 0, restoring is deleting the override, and _dropped_ is derived rather than
stored — so the state that decides the row's fate is the one already travelling
to `createTripFromWizard`, with nothing to keep in sync.

Two of my own test assumptions were wrong rather than the code, both worth the
minute they cost: with no travelers a per-person position fans out over nobody
and produces **no row at all** (the walk now adds one), and the expected item
count was guessed instead of derived from the list under test.

## Coverage audit of 2026-08-17's merged PRs — the two gaps it found

Not a feature. The day's four merged PRs (#99 sheet-header pair, #101 G-2
detail + backup, #102 FR-27.14 peek entry + the scope-following ＋, #103 FR-2.6
review step) were re-read against what actually drives them, unit and e2e. Two
had a hole, and both holes were of the same kind: the _reading_ half of a
behaviour whose _writing_ half was covered.

**#101 — the backup could be written and never read.** `commitPortableRestore`
had unit cases and E2E-G2-03 asserted the download, but nothing walked M18's
restore branch, which is the screen a user restores through. In Local Mode the
file is the only copy there is, so this was the gap worth closing first.
`e2e/backup-restore.spec.ts` now takes a real backup through the G-2 detail and
restores it into a second browser context — a device that has never seen the
data, because restoring onto the device that wrote the file would pass against
an importer that does nothing at all.

It found a defect on its first run: `commitRestore` replaced to `/trips`, which
is **not a route** (only `/trips/new` and `/trips/:tripId` are). The restore
happened, the router matched nothing, and the user was left looking at the
import form with the file still pasted into it — no trips, no message, no sign
anything had been imported. Fixed to `/tabs/trips`. The first draft of the case
did not see it either: `getByText('Samedan 2026')` was green _because_ the
pasted YAML was on screen, so the assertion moved onto `trip-row-<name>`. A
test that reads back the input it just filled proves nothing.

A second observation from that run is left as an owner question rather than
designed around: a restored trip is _planning_, M2 opens on _Active_, so a
restore currently ends on a screen that says "No active trips". The case selects
the Planned segment and says why.

**#102 — the ＋ steps aside on M8, and nobody asked M4.** FR-25.13a's amendment
landed in both screens' templates and got one case (E2E-M8-17). The shared
`openQuickAdd` fixture tolerates the button being there or not — it has to, it
is a helper — so it would have stayed green either way. E2E-M4-36 asserts M4's
half, including that `#m4-fab-anchor` survives (the FR-25.2 snackbar hangs off
it) and that adding does not bring the button back, since the composer stays
open.

Both new cases were red-proved against a mutated build — the `v-if` removed,
and `preview()` filtering unreadable documents out — and both pass on Chromium
and WebKit. Two `data-testid`s were added to production markup for them
(`portable-restore-row`, `m2-portable-import`), which is the testability-by-
design principle #93 wrote down: an assertion should name the thing it means.

**Judged covered, no work owed:** #103 (unit cases for drop/restore/count/marks
plus E2E-M3-18), #102's other halves (E2E-M8-16, E2E-M7-09,
`GroupPeekSheet.spec.ts`, the `templates.ts` domain cases) and #99 (E2E-M5-14
measures the rendered pair; the token it introduced cannot regress without
somebody re-typing a raw px). #101's Server Mode half of the sheet stays
component-test-only, as its own ledger entry already states.

### The review step that let both gaps through, and what changed in it

Worth recording beside the gaps themselves, because the fix is process rather
than code. `/pr-review` **ran** on #101 and #102 and marked client coverage ✅
on both. Reading the two verdicts back:

- #101's own summary says _"M18 now reads such a file"_ — and no section of
  that review mentions `PortableImportPage.vue`, which the same diff changed.
- #102's verdict is entirely about FR-27.14. The diff also amended FR-25.13a
  across two screens; that half appears nowhere in the review.
- #103 got no `/pr-review` at all.

Both reviews checked the feature named in the **title**. A PR routinely carries
two, and the second one is the one that ships untested — which is exactly what
happened twice in one day. Being more careful is not a fix for that; a step that
cannot be answered from the tests that exist is.

So the skill gained **§4.0**: before any other coverage check, build a table with
one row per changed production file naming the test that drives _that file's
changed lines_, and **post the table in the verdict** rather than a claim that it
was built. A row that cannot be filled is a finding regardless of the title.
Three rules came out of the same two misses and sit with it: a write half and a
read half are two behaviours (and for the only copy of a user's data, the read
half is the more important one); one rule written into N templates needs N cases;
and a shared test helper that tolerates both states is never the assertion.
`CLAUDE.md` now also says a missing verdict comment is itself a blocker.

### The restore landing (owner call, 2026-08-17)

The audit above left one thing as a question rather than deciding it: a restore
landed on M2, which opens on _Active_, while every imported trip is `planning`
(FR-18.4) — so a restore that had just written the user's whole device back
ended on the words "No active trips". Owner's answer: land on **Planned**.

Built as a route query rather than a flag on the page: `client/src/views/trips/
tripFilter.ts` names the three segments once and parses a query value, M2 honours
it through a `watch` and M18 sets it. Three details are deliberate.

- **A watch, not a read at setup.** Ionic keeps M2 mounted, so a restore arriving
  while the page is already alive would otherwise land on whatever segment was
  last tapped.
- **An unknown or absent value changes nothing.** `parseTripFilter` returns null
  rather than defaulting to `active`, because a default would silently reset the
  user's own choice every time the list is re-entered without a query.
- **`planned` is the segment, `planning` the DB status.** The two are one keystroke
  apart and a unit case pins that they are not interchangeable — the query is a
  UI vocabulary, not a status column leaking into the URL.

Red-proved by dropping the query from the replace: **both** M18 cases fall, and
E2E-M18-06 falls on the honest symptom — the restored trip is not on screen at
all. That is the case doing what the audit was about: asserting the outcome the
user sees rather than the mechanism.

## FR-5.5 — "bewusst nicht einpacken" gets a control (2026-08-18)

The backlog said the state existed and no view could reach it. Two of its three
premises turned out to be wrong, and checking them is what shaped the work:

- **A view did call `skipItem`.** M4 carried an `IonItemSliding` with _skip_ and
  _unskip_ options — kept through the §3.25 rebuild rather than dropped, as the
  note assumed.
- **M4 did not badge a skipped row.** Nothing was rendered where a packed row
  carries its FR-25.17 stamp, so a revealed skipped row was indistinguishable
  from a packed one — the confusion FR-5.5 exists to remove, reintroduced one
  screen later.
- **The swipe was broken in a way only a render shows.** Opened, its option panel
  left the row's `.jp-card`: square block to the screen edge, the row losing its
  stepper, and the label a _state name_ ("Bewusst weggelassen") rather than an
  action. That is the same failure the swipe lost the M7 A2/B2 round on, and it
  had been sitting in M4 since the rebuild because nothing swiped it.

So the question was not "which control do we add" but "which one replaces it".
Four variants were rendered (`dev-docs/build-skip-control-variants.mjs` →
`UI_Concept_SkipControl_variants.html`, with the defect screenshot beside them);
the owner chose **A + C**, the split M7/M8 already use:

- **A — press and hold a row** → the action sheet: _Jetzt packen_ · _Nicht
  einpacken_, and on a skipped row _Doch einpacken_ and nothing else. Reuses
  `useLongPress` and M7's `rowMenuActive` guard verbatim, including the reason it
  is a state with an end rather than a swallow-next-click flag.
- **C — a spelled-out control in the M5 sheet**, beside the stepper. The stepper
  says _how many_; only this says _none, on purpose_.

**D was rejected on the meaning, not the mechanics**: long-pressing "−" already
zeroes a row, and letting that zero _be_ the decision would put words in the
user's mouth. Quantity 0 stays a counter reading; skipping writes both.

Three things moved into the domain rather than staying inline, because the view
needed the _list_ and not just the effect:

- `coSkipTargets` — which rows the FR-20.2 cascade takes along. `skipItem` now
  returns them, snapshotted before the write, which is what lets the snackbar
  name them and the undo restore exactly those.
- `skippedVia` — why a co-skipped row is skipped, **derived** from the dependency
  graph and the current states. A stored reason would have to survive un-skips on
  either side and edits to the dependency itself; this cannot go stale.
- `usePackUndo` became `useRowUndo`: it holds _rows_, plural, and takes its
  restore per action — a pack changes `packed_count` and `state`, a skip changes
  `quantity` too, and one shared restore would write back a field its action never
  touched, reverting whatever a sync had put there.

Rendered and eyeballed before the case was finalised: the menu, the snackbar
("„Sonnencreme" stays at home · UNDO") and both states of the M5 control.
Five e2e cases in `client/e2e/skip-item.spec.ts`, mutation-proved in both
directions with a rebuild between runs — removing the menu entry reddens the four
M4 cases and leaves M5 green, removing the M5 control reddens M5 alone.

## 2026-08-18 — FR-27.4: a planned trip follows the groups it was made from

The last mechanical piece of the §3.27 client package. A group edited after a
trip was generated used to reach nothing: the M8 blast-radius note _warned_
about a propagation that did not exist. It exists now — migration 023, ADR-016
— and the shape of it was decided by one question the schema could not answer.

**"Manual edits always win" is not a rule until something can evaluate it.**
The trip row says 5, the group says 3. Did the user set 5, or did the group say
5 last week? Comparing the row against the _current_ template cannot tell, so
the refresh keeps a ledger of what generation last produced per position
(`trip_generated_positions`). Row equals the snapshot → untouched, an update may
land. Row differs → theirs, leave it. **Ledger entry with no row at all → they
deleted it, and it never comes back** — which is the case a snapshot column on
`trip_items` cannot express, because it dies with the row it describes, and the
reason that option lost. The full weighing is ADR-016.

Three things settled while building, each of which changes behaviour:

- **Protection is broader than the snapshot.** A row is also the user's once
  packing has begun on it or it was skipped (FR-5.5) — a template edit must not
  rewrite a count somebody physically verified, nor quietly undo a decision.
- **A protected row's snapshot is deliberately not refreshed.** Nudging it
  forward would hand the row back to the template the moment the user reverted
  their own edit, which is the opposite of what FR-27.4 promises.
- **Travelers are part of what a trip follows.** The diff re-resolves against
  the _current_ roster, so a person added to a planning trip gets the per-person
  positions (FR-25.8) and one removed takes their untouched rows along. That
  falls out of re-resolution rather than being built, but it is a decision, so
  it is written down and tested.

**Two devices, one trip.** Both pull the same group edit, both run the refresh,
and with random ids both insert their own row — a duplicate produced by the
feature whose job is to keep the list right. The ids of propagated rows and
ledger entries are therefore _derived_ from (trip, item, traveler), so the two
inserts are one row that the NFR-4.2a merge resolves. The cost is that trip-item
ids stop being opaque; nothing depends on that today, and ADR-016 carries the
revisit trigger.

**Why a diff and not a push from M8.** M8, M14 and M21 all write to a group, and
a group edit can equally arrive over sync from another device, which no screen
here could have pushed. One re-resolution on trip open and after a master pull
covers all four; the alternative was four call sites that must each remember.
It also means **M14 owes nothing extra**: applying a proposal writes to the
group, and the trips following it log it on their next open.

**Nothing lands silently.** `trip_applied_changes` is the log behind M2's chip,
and it stores _structured_ detail (`{"field":"quantity","from":2,"to":3}`) rather
than a sentence — the row syncs, and a sentence would freeze one language into
the database. The view words it.

Partitioning split by **who reads a table, not what it is about**: the ledger
travels the trip partition beside the rows it describes, while the registry and
the log travel the master partition like `trip_members`, because M2 renders its
chip and M8 its note with no trip partition loaded.

Existing trips deliberately do not move: they have no registered sources, and
deriving sources from `trip_items.source_template_id` was rejected for the same
reason as the snapshot column — it guesses at rows the user may have removed on
purpose.

E2E-M8-09 runs the whole circle (edit the group → open the trip → the row is
there → M2 names it), mutation-proved in both directions and repeated three
times on both browsers. The frozen case stayed a component test: reaching an
_active_ trip in the browser still needs the planning→active transition no UI
ships. The dev seed grew a second, _planned_ trip for the same reason — the
existing sample trip is active on purpose and therefore frozen, so without it
the feature cannot be looked at.

**Owner eyeball, 2026-08-18:** the chip is accepted, with one change out of it —
the log stands **directly under the row up to ten entries**, and folds behind the
chip above that. The threshold rather than "always collapsed": a few lines are
worth being read where they happened, but M2 is the main entry point and there is
deliberately no _seen_ state, so an unbounded log would push every other trip down
until the busy one departs. In its inline form the chip is a label without
interaction; a control that toggles nothing lies about state.

The change uncovered a real test defect: now that the log stands inline, M2
carries the word "Stativ" as well, and during the Ionic transition both pages are
briefly visible — `getByText('Stativ')` resolved to two elements. The case checks
the row's _heading_ instead. The lesson: a text search on "the visible page" is
unambiguous only as long as no second screen carries the same word.

### The §4a pass that came with it

The owner stopped the PR twice on the same thing: `case "trip_template_sources":`
and a triple-nested `append`. The rule existed in one line of a personal
CLAUDE.md and nowhere binding, so it became CODING_PRINCIPLES §4a — what must be
named, what may stay a literal, where the constant lives — with `goconst` as the
Go floor. The carve-out is written down rather than silently configured: a JSON
field name in a payload literal is the wire contract itself, fixed by the
Sync-API spec, and a constant between the code and the shape it implements hides
what a reader came to check. Go now names its tables, trip roles and portable
document kinds; the client gets the same table list as `TABLE`, and the
orchestrator's two routing sets are hoisted out of `onPullChanges` rather than
rebuilt on every pull. The failure this prevents is specific: a table missing
from both routing sets is dropped in silence.

## FR-27.4, revised the day after it landed: the group _asks_ (2026-08-18)

Owner, hours after the refresh merged: when I change a group that is used by an active trip,
I should be asked whether it is to be applied to that trip; past trips must not be affected at
all. That inverts two
of the three rules the merged model rested on — _planning_ trips followed
silently, everything else was frozen from departure onward.

Three decisions settled it. **Past means archived or the end date gone by**, the
broader of the two options offered (the recommendation had been archived-only).
**The question is asked at the trip, and nowhere else** — not when the group is
saved. Three holes in asking at save time, one of them already paid for in #106:
in Server Mode the person editing the group is not the person travelling; the
affected trips' partitions are not loaded on the editing device (_„nicht geladen
≠ leer"_); and a modal on every group edit trains the user to dismiss it. And
**#106 merges first**, the new model as a follow-up — the machinery it built is
exactly what the new one needs.

**The change turned out to be cheap, for a reason worth recording.** `planRefresh`
was already a pure derivation with the writes kept separate, so a _proposal_ is
simply a diff nobody has applied yet: no table, no pending state, nothing to sync.
The three surfaces split apart — `proposeTripRefresh` derives, `acceptTripRefresh`
applies, `declineTripRefresh` applies `declinePlan`.

**Declining needed no new state at all.** The ledger already records what
generation last produced, and `isProtected` already reads a row that differs from
it as the user's own — so writing the _refused_ version into the ledger detaches
exactly the refused positions and leaves the rest of the group still speaking for
the trip. No flag, no expiry, nothing extra on the wire.

That has a consequence the UI has to say out loud, and the note under the two
buttons says it: **a refused position stops following the group in that trip.** A
working note written before the code claimed the user would be re-asked on the
group's _next_ change; that is false against `isProtected`, which skips a
protected row entirely. Per-position detachment is the coherent rule, and other
positions keep following — so a later group edit still reaches the trip.

**What the new rule cost, and what it saved.** It only distinguishes past from
not-past, so the missing planning→active transition — the gap that left half the
old model untestable in the browser — stops mattering here. What it did cost is
one boundary that cannot be reached through the UI at all: a trip whose end date
has gone by needs either a clock or a date the wizard will not produce. So the
clock became a seam (`today` injected into the orchestrator, defaulting to the
_local_ calendar date — `toISOString()` answers in UTC and would put a trip a day
out for anyone far enough east or west on the evening it ends), and the boundary
is pinned in the unit with a value a test can stand on either side of.

**Two findings from the work itself.** The sweep over loaded trips carried its
own copy of the status rule (`status !== 'planning'`), which would have stayed
behind silently after `planRefresh` was fixed — found by reading the function,
not by a red test. And two of the decline tests were green against a _broken_
`declinePlan`: they asserted a downstream effect (nothing proposed on the next
run) that an empty ledger produces just as well. They now assert the declined
snapshot itself, and fall when it is wrong. Both e2e cases were mutation-proved
the same way: restoring apply-on-open turns E2E-M8-09 red at "offered, not
applied", and a decline that applies the plan turns E2E-M8-19 red.

## FR-27.3 — single items in M3 (2026-08-18)

Trip creation could combine Ferien-Vorlagen and Gruppen and nothing else, so
"diesmal noch die Drohne mit" meant building a group for one item — filing
rather than packing.

**Where the rule went.** `generateTripItems` takes `singleItemIds` and resolves
them **after** the templates, which is the whole design: "already there" is only
decidable once the composition is resolved. Three consequences fell out of that
ordering rather than being decided separately — an item a template already
brought is _reported_ (`alreadyIncluded`) instead of duplicated; a **per-person
fan-out counts as present**, because the item is on the trip twice already and a
trip-global third row reads as a third one; and a position a **condition kept
out** (FR-15.2) is _overridden_ by the hand-pick, with the exclusion report no
longer claiming the item is off the list.

**One type change with teeth.** `GeneratedItem.source_template_id` widened to
`string | null` — a single item has no template and nothing may claim it does,
because FR-27.4 and FR-27.5 both read that provenance. The refresh now skips
template-less rows explicitly: it never produces one, and one could not follow
anything anyway. Making that a stated fact rather than a coincidence of the
caller is the point.

**The picker is deliberately not the quick-add.** §3.25's consistency directive
points at `QuickAddItem`, and M8 reused it verbatim for exactly that reason. It
is the wrong component here: it exists to _write a row_, free text included, and
to stay open through a run of rows. Step 3 picks something that already exists —
a name nobody owns has no weight, no tag and nothing for FR-27.5 to recognise a
year later. What the two share is `searchItems`, which is the part that must not
diverge; the twenty lines of field-and-chips are not.

**Two things found while building.** `v-model` on an `ion-input` binds through a
custom element that nothing outside a real browser drives, so the component test
saw an empty query however it typed — the field uses `:value` + `@ionInput`, the
same seam the name field above it already used. And the e2e case (E2E-M3-12,
specified long before) had to end **on the created trip**: a footer count proves
the preview, not that the row arrived.

No seed change was owed: `Wandersocken` is in the sample inventory and in no
group, so a fresh device can exercise the picker as it stands.

## Portable YAML learns the composition (2026-08-18, ADR-017)

The format could describe a template's positions and nothing about what a
Ferien-Vorlage is _made of_. Two consequences, one of them quiet and bad: a
shared file imported a Vorlage that resolved to nothing, and the NFR-4.11
backup — the only copy a Local Mode device has — restored the same emptiness.
The failure surfaces at the next trip generation, on a device that no longer
has the file.

**The decision was between self-contained and referential**, and it is written
up in ADR-017 with the matrix. The groups travel whole. What made it clear-cut
was driver 2 rather than the sharing story: a backup that restores a name is
not a backup.

**The identity rule is the half worth remembering.** The name is a group's
identity across instances — nothing else survives the trip — so an import
_links_ a group of that name and never rewrites it. That rule is not politeness:
since FR-27.4 a group edit reaches every trip that follows it, so an importer
that "helpfully" merged the file's positions into an existing group would change
other people's packing lists from a file they never opened. The cost, stated in
the ADR, is that an import can give you less than the file described.

**Found while building:** the Go exporter never wrote `scope` at all, so a group
exported through the server came back a Ferien-Vorlage — the exact defect
FR-27.1's spec text warns about, three lines above a client parser that rejects
an unknown scope. It had no test because nothing asserted the exported
_document_, only its items.

**Where it is enforced:** both parsers reject includes on a trip, includes on a
group (FR-27.1 is two levels, which is what makes cycles impossible) and an
unnamed group — at the file boundary, before anything reaches a store. And all
four client write paths go through one `compositionFrom`, so M7's export, the
settings export and the backup cannot disagree about what a file contains.

## The identity rule was half a rule (2026-08-18, ADR-017)

Found reviewing the branch that introduced it, before it merged. ADR-017's
link-or-create rule lived only in the `includes` loop, so it decided what
happened to a group _nested in a Vorlage_ and said nothing about the group's
own document. A backup carries the same group both ways — the ADR calls that
redundancy deliberate — so the result depended on which document the file
listed first:

```
group-first    -> 1 group :  Makro Fotografie
vorlage-first  -> 2 groups:  Makro Fotografie | Makro Fotografie (import)
```

**That order is not stable, which is what made it a defect rather than a
curiosity.** The file is written in `templateList` order; in Local Mode the
store is hydrated from IndexedDB with `getAll()` over keys of the form
`templates/<random hex>`, so the order is arbitrary relative to creation and
re-rolled on every reload. Roughly half of all restores would have produced a
duplicate group, included by nothing, carrying a copy of the positions.

E2E-M18-07 passed throughout: it creates the group first in a warm store, which
is exactly the order that works. The unit cases now run **both** orders through
`commitPortableRestore`, and the e2e additionally asserts one group in the
restored list.

**The Go importer had the same hole with a different symptom** — a repeated
group document hit `UNIQUE(owner_id, name)` and failed the import outright. It
already had an `ensureGroup` helper doing link-or-create for nested groups; the
document path now goes through it too.

**What the rule is, stated properly:** it belongs to the _group_, not to where
in a file the group appears. Ferien-Vorlagen deliberately keep the `(import)`
suffix instead — two of one name are two different plans, and linking them
would lose one.

Method note: the two mutation proofs of this fix were nearly worthless. The
first pass mutated an **uncommitted** implementation and then reverted it with
`git checkout`, so the second "proof" ran against code that had never had the
fix at all — a red test proving nothing. Commit first, then mutate.

## The Go test suite spent 96 % of its time replaying migrations

**Measured, not guessed.** The CI pipeline was taking 13–22 minutes wall clock,
and the `go` job was its second-largest contributor at ~267 s, of which
`go test -race` was 221 s: `internal/store` 180 s and `internal/api` 158 s,
running in parallel.

The distribution over the 128 store tests was suspiciously flat — about 1.75 s
each regardless of what the test did. `TestDeleteItemImage_IdempotentWhenNoImage`
asserts that deleting a non-existent image is a no-op and took 2.40 s. There are
no sleeps in the suite and no password hashing anywhere in `internal`, so the
cost had to be in the setup every test shares.

It was `Open(":memory:")`, benchmarked both ways:

```
Open(":memory:")   without -race:     55 ms
Open(":memory:")   with    -race:   1658 ms      <- 30x
```

`modernc.org/sqlite` is pure Go (D-001), which is normally invisible — but it
means the race detector instruments the SQLite engine _itself_. Every test was
driving 23 migrations and ~50 KB of DDL through that instrumentation. At
1.66 s x 232 store+api tests, that single line was essentially the whole Go job.

**The fix is to replay the migrations once per process instead of once per
test.** `store.OpenForTest(dir)` builds a fully migrated, empty database the
first time it is called, keeps the file's bytes, and thereafter copies them into
the caller's directory and opens that — where `Open` finds `PRAGMA user_version`
already current and applies nothing:

```
BenchmarkOpenFromTemplate -race:      2.9 ms     <- 570x
```

Result on this machine: `internal/store` 180 s -> 23.5 s, `internal/api`
158 s -> 14.8 s, the whole `-race` suite under 30 s.

**Why the helper is exported from `internal/store` rather than living in a
`storetest` subpackage**, which is where it belongs on taste: seventeen of the
store package's test files are `package store`, and Go forbids a test file of
package P from importing a package that imports P. A subpackage would have been
reachable from `internal/api` and _not_ from the suite with the larger problem.
The cost is one exported function compiled into `jitpackd` that nothing in
production calls. It was judged too small a tradeoff for an ADR and is explained
at the declaration instead.

Three points of care that the change is only safe because of:

- **The template must reach the same schema level as a full replay.** That is
  asserted against `Open`'s own result rather than against a hard-coded 23, so
  a new migration cannot quietly fall outside the template.
- **The copy must be a copy.** A shared template handed to two stores would let
  one test read another's rows; the guard was mutation-proved by pointing every
  caller at one shared path and watching it go red.
- **The template must stay empty.** Seeding it once would hand every test rows
  it never inserted.

`concept_migrations_test.go` and `tags_test.go` still open raw `:memory:`
databases and replay migrations deliberately — that replay is their subject.

The remaining CI time is in the `e2e` job, which is a separate change: half of
its 10–20 minutes is `playwright install --with-deps` installing WebKit's ~200
apt dependencies on every run, on a runner where the digest-pinned Playwright
image (already used by the `visual` job, ADR-013) has them baked in.

### The development phase drops DDL migrations (2026-08-19, ADR-018)

Owner decision, taken against the recommendation on the desk: while the schema
is still moving, no migration chain — one always-current `internal/store/schema.sql`.
The recommendation it overrode was about _speed_ (squashing the chain buys ~1 s
on top of the test template above, so it does not pay), and the question the
owner actually asked was about _friction_. On that one the history argues for
dropping:

|                                                                         |                        |
| ----------------------------------------------------------------------- | ---------------------- |
| Migrations since v0.1.0 (2026-07-10)                                    | 11 in six weeks        |
| …in the final week alone                                                | 6 (018–023)            |
| Migrations that exist **only** because an earlier file cannot be edited | 4 (013, 014, 015, 018) |

Those four retired features. In SQLite that means the twelve-step table rebuild,
and a rebuild must carry every column the table has grown since — the first
draft of migration 005 was modelled on 004, silently dropped `trips.updated_hlc`,
and broke every master pull of a trip. With one schema file, retiring a column
is deleting a line.

The DDL the chain actually produced is the other half of the argument. Five
tables closed with `, updated_hlc TEXT NOT NULL DEFAULT '');` sharing a line
with the closing paren and four more carried the same column appended mid-list,
`users` had three columns and a stranded `CHECK` after `created_at`, and eight
table names were quoted because a rebuild had requoted them. None of that is
wrong; all of it is unreadable.

**What the mechanism is now.** `Open` reads `PRAGMA user_version`. If it equals
a fingerprint of `schema.sql` (SHA-256 truncated to 31 bits, because SQLite's
user_version is a signed 32-bit integer), the database is used as it is. If the
file is empty, the schema is applied and stamped in one transaction. Anything
else — a migration-era level, or `0` on a file that already has tables — is
refused with `ErrSchemaStale` and an error naming the path and two ways out.
Nothing is recreated and nothing is deleted: the owner chose "error with
instructions" over "recreate", so a database the code refuses is left exactly as
it was.

**Equivalence was proved before the chain was deleted, not asserted.** A
temporary test built one database from the 23 migrations and another from
`schema.sql`, then compared, per table: columns with type, nullability, default
and primary-key position (`table_xinfo`, so the generated `duration_days` column
is included), foreign keys with their delete actions, and index origin and
uniqueness — plus the view. Identical. It was mutation-proved by adding one
column to `schema.sql` and watching it fail, then removed together with the
migrations it compared against.

**What the change cost, stated rather than glossed.** Four tests staged a
database one migration short of a change and asserted the _transformation_
against real rows: 019's packing-record backfill, 021's year derivation from
the end date, and 022's category-to-tag rename with its FR-16.3 collision
handling. Their subject no longer exists. What was assertable as _schema_ was
kept and renamed — `concept_migrations_test.go` became `schema_shape_test.go`
with six `TestSchema_*` cases, and `TestSchema_ItemNameIsUniqueOnItsOwn_FR16_3`
preserves what 022's collision test was ultimately about. What was genuinely
about a transformation was not replaced.

**One regression the equivalence test could not see.** `PRAGMA journal_mode = WAL`
was line 18 of migration 001, and a pragma leaves no trace in `sqlite_master` —
so a comparison of schema objects passed while a fresh database came up in
`delete` mode. Found by reading `docs/installation.md`, which claims WAL and its
sidecars, and checking the claim. It now runs in `Open` beside `foreign_keys`
rather than in `schema.sql`: `journal_mode` cannot be changed inside a
transaction, and `applySchema` runs in one. `TestOpen_UsesWriteAheadLogging`
holds it.

`applySchema` takes its DDL as a parameter rather than reading the package's
embedded schema, so "a statement that does not apply leaves nothing behind, and
above all no stamped fingerprint" is drivable directly instead of only through a
deliberately broken build.

Two side effects. `go test -race` over the whole module went from 29.5 s to
20.6 s locally, on top of the 4m19s → 29.5 s the test template had already
bought. And `:memory:` disappeared from the suite entirely — the two files that
opened one did so to replay migrations into it, so every store and api test now
runs against a real file, which is what production uses.

**This reverts at 1.0.** `schema.sql` becomes `migrations/001_schema.sql`,
numbering resumes at `002`, and invariant 2 returns to its previous text. The
trigger is written out in ADR-018 rather than left to memory; the whole decision
rests on the fact that reversing it is an hour's work.

### The e2e job moves into the pinned Playwright image and shards (2026-08-19)

The second half of the CI investigation that produced the Go test template.
Measured on the `e2e` job of PR #111, per step:

| Step                                                      | Duration   |
| --------------------------------------------------------- | ---------- |
| `npx playwright install --with-deps chromium webkit`      | **1124 s** |
| `npm run test:e2e`                                        | 615 s      |
| everything else (checkout, node, `npm ci`, build, upload) | 37 s       |

**63 % of the job was installing browsers**, and the cache was working: the
binaries were cached, the ~200 apt packages WebKit links against are not
cacheable and were reinstalled every run. The `visual` job has not paid that
since ADR-013, because it runs inside `mcr.microsoft.com/playwright`, which has
both baked in. `scripts/e2e.sh` does the same for the behaviour suite, and the
digest moves to `scripts/playwright-image.sh` so the two scripts cannot drift
apart on it. A side benefit: `make e2e` now works on the NixOS host, where a
downloaded Chromium does not run at all.

**The sharding decision was made twice, because the first answer was wrong.**
One CI leg per browser is the obvious split and it is worse on both counts.
Measured locally in the image with 2 workers: Chromium 3.8 min, WebKit
10.6 min. A per-browser split is bounded by WebKit for its entire duration
while the other runner idles for seven minutes — and it puts two WebKit
contexts on a runner where roughly one ran before. That is not free, which the
run proved: E2E-M12-05 failed, twice, at _different lines each time_, which is
the signature of a unit exceeding its budget rather than a broken assertion.
`--shard` instead: 133 tests each, 5.7 min and 10.0 min, both legs carrying
both engines. Still uneven — Playwright shards by file and the heavy files
cluster — but nothing idles.

**What that failure actually exposed.** E2E-M12-05 takes 21.4 s uncontended.
A full WebKit run says 16 of 123 tests take 20 s or more, and the slowest
_passing_ one took 31.9 s — against Playwright's 30 s default, which
`playwright.config.ts` had never overridden. Nobody had chosen that number;
the suite had simply been living under it, and the CI run before this one
already carried one WebKit retry. The budget is now set explicitly at 60 s
with the measurement written beside it. It is not a wait-and-hope: a budget
bounds a hang, and this one was set below the work. The §2.4 units build their
world through M7 → M8 → M3 rather than seeding storage, which is exactly what
makes them worth having and exactly what costs the seconds.

**And one genuine test defect, found by running it.** E2E-M3-12 asserted
`visible(page).getByRole('heading', { name: 'Drohne' })` right after the
wizard creates the trip. Both pages are briefly un-hidden during that
transition, so the locator matches the step-4 preview heading _and_ the M4 row
heading, and the assertion fails as a strict-mode violation depending on which
frame it lands in — the same shape as the settled-vs-arrived lesson from #89.
It now asserts the row by test id, which is unique and is the stronger claim
anyway. Verified with `--repeat-each=3` on WebKit. `backup-restore.spec.ts:232`
has the same shape and is _not_ currently ambiguous (the page being left holds
no template headings); it is recorded here rather than changed on speculation.

**One cost this moves onto us.** The browsers now come from a digest that
Dependabot cannot see, while it does bump `@playwright/test` in the lockfile.
That drift already broke `visual` silently; it would now break `e2e` too, and
its only symptom is Playwright's own "Executable doesn't exist", which names
neither cause nor fix. Both scripts therefore compare the pinned version
against the lockfile before starting the container and fail with the two lines
that fix it. Both branches of that check — mismatch, and an unreadable
lockfile, which must warn rather than block — were proved by mutating a copy.

### The e2e job loses its gate and gains two shards (2026-08-19)

The 2026-08-19 pipeline after the container move measured ~7 min wall clock,
and all of it was one path: `client` (69 s) → `e2e (2)` (5:41). Every other
job finishes under 90 s. Two changes, both to the critical path and neither
to what is tested:

**The `needs: [client]` gate is gone from `e2e`.** The job installs and
builds on its own runner regardless — with a warm npm cache that is ~20 s,
against the ~75 s of `client` the gate serialized in front of the slowest
job in the pipeline. The gate reused nothing; it only made e2e start late.
What the trade costs is runner minutes, not signal: on a commit where
`client` fails lint but builds, the e2e legs now run to completion instead
of being skipped. `visual` keeps its gate — it is off the critical path
either way. One knock-on: the "e2e is not a required check because it needs
client" rationale in CLAUDE.md was rewritten; the check stays non-required
because it is a shard matrix and `dependabot-merge` already waits for it.

**Two shards became four, sized from the run's own reports.** The two
uploaded HTML reports carry every test's duration: ~1020 test-seconds total,
WebKit ~630 s behind Chromium's ~350 s in the test list. With `fullyParallel`
Playwright splits that list into contiguous count-equal chunks, so duration
balance is luck: 2 shards landed 464/557 s, and simulating 4 shards on the
same durations lands 150/315/251/305 s — the worst leg drops from ~4.7 min
of test time to ~2.6, against ~1 min of fixed cost per leg (image pull 36 s,
warm npm ci + build ~25 s). More shards pay that fixed cost again for less
than a minute back. Same tests, same 2 workers per runner, same 60 s budget,
same retry policy — the partitioning moved, nothing else.

Expected wall clock: the pipeline becomes bounded by the heaviest e2e leg
starting at t≈0, roughly 4 min. Measured on this PR's own run — see the PR.

## FR-27.10 — a whole group onto a trip that already exists (2026-08-19)

The last open piece of §3.27 except M21. The owner wants to add a whole group of packing
elements while already on the trip — you decide on site that you will
shoot macro this time, and until now the alternative was hand-copying a dozen
positions or regenerating a trip that has already been packed against.

**The surface is FR-25.13's composer verbatim**, which the FR insists on and
which turned out to be the cheap half: `QuickAddItem` gained one opt-in prop
and one emit. What is new visually is that a group is a **card** rather than a
list row like the item suggestions, carrying the FR-27.12 summary and the
resolved position count. That is not decoration — a tap that adds twelve rows
and a tap that adds one item are the same gesture two pixels apart, and the
summary is what lets somebody choose without opening anything.

**The resolution is `generateTripItems`, unchanged.** `domain/groupAdd.ts` is
thin on purpose: it feeds the group in as the single selected template with the
trip's _current_ travelers, and everything §3.27 already decided — one level of
includes, the FR-2.3a merge, the per-person fan-out, FR-15.2 conditions,
FR-27.7 tasks — follows without a second implementation. What the module owns
is the one question generation never had to ask: **what is already there.**

Four things settled while building, each visible in the code:

- **Presence is master item first, name second, trip-global.** A generated row
  carries its `source_item_id`; a row typed into the same composer five minutes
  earlier carries none, and „Kamera" typed by hand is the thing the group is
  about to bring. Trip-global rather than per traveler is FR-27.3's stance for
  single items, and for its reason: a per-person fan-out means the item is on
  the trip already, so one more row reads as one more thing to pack.
- **A third outcome the FR did not name.** „Added N, M already there" and „already
  fully on the list" are two; a group whose every position this trip's attributes
  excluded (FR-15.2) is a third, and reporting „hinzugefügt — 0 Positionen" about
  it would be false in both directions. It gets its own sentence.
- **The registration is written even when nothing was placed.** Following a
  group is about what it does _from here on_, not about what it happened to
  contribute today — a group that is already fully present is exactly the one
  whose next change the trip wants to hear about.
- **No ledger rows.** `planRefresh` adopts a row it finds without a ledger
  entry — the path a hand-added row takes — so the first refresh records these
  with no extra mechanism, and writing them here would only be a second way to
  say the same thing.

**No FR-9.1 flag**, which is the one line of this feature that is a product
decision rather than a mechanism: a single ad-hoc add on an active trip is
flagged _Missing_ because something was forgotten, and an added group is a plan
that grew. Flagging it would feed M14 a lie and produce „nimm es in die Vorlage
auf" proposals for rows that came _from_ a template.

**One gap the PR's own review found:** the group path skipped FR-20.4. A
single quick-add pulls its required companions and M3's generation does too,
so the same camera brought its spare battery when added alone and did not when
it arrived inside „Makro Fotografie". Fixed with one call and a red-first test;
the resolution runs once for the whole group, since it reads the settled list
either way.

**Where the tests had to move.** Two halves of the specified e2e cases — the
absent _Missing_ flag, and a past trip registering nothing — need a trip that is
active or archived, and nothing user-facing moves a trip out of _planning_ yet
(the same gap the M12 and M14 units hit). Asserted in Playwright they would have
passed on a planning trip whatever the production code did, so they are unit
tests naming the reason, and the e2e ledger records the swap rather than hiding
it. The name dedup **is** e2e-proved, mutation and all: dropping it doubles the
row and reddens exactly the case written for it.

**Three things the PR's second review pass changed**, beyond the FR-20.4 fix
above. The M4 handler held a three-way branch inline in a view with no unit
test — it is now `lib/groupAdditionMessage.ts`, a pure function with a case per
outcome, which promptly added a fourth: the add refuses a trip whose rows are
not on the device, M4 paints before its partition is pulled on a cold load, and
that refusal used to be a silent no-op. A refusal nobody can see is worse than
any of the outcomes the requirement worried about. Second, `previewText` had
become a verbatim copy in two views (`lib/groupPreview.ts` now). Third, and the
one worth remembering: reading the UI-Test-Spec's own sentences against the test
bodies found **two false promises** — the case claimed to assert provenance,
which is invisible on M4, and M4-27's text still said an _active_ trip does not
follow its groups, which FR-27.4's revision of 2026-08-18 had already replaced
with _past_. The spec was describing the pre-revision model in a case nobody had
run yet.

Two smaller notes. The composer matches **group names only** — searching the
resolved item names is FR-27.13's decided concept for the M8 picker, and half of
it here would have been a second, quieter rule for the same question. And the
sample seed needed no extension for once: it already carries a group that is
deliberately included nowhere, which is exactly the group this feature is for.

## M21 — Vorlage aus Reise (FR-27.5), 2026-08-19

The closing half of the FR-27.1 round-trip, and the last thing §3.27 owed. M3
instantiates a composed Vorlage into a trip; M21 recognises what the finished
trip was made of and writes it back. The screen exists because the naive "save
as template" copies the trip flat and forks every group it came from — next
year two divergent camera lists.

**The screen was unreachable, and finding that out changed the plan.** Every
M21 entry sits on an _archived_ trip. Both archive affordances are gated on
_active_, `activateTrip` existed in the orchestrator with a doc-comment
describing exactly this hole, and **no view called it**. So the first thing the
PR shipped was not M21 at all: one action on M4's app bar and one M2 swipe
option. The owner approved it as a deliberate scope call rather than a quiet
widening — the alternative was M21 landing with three blocked e2e cases, the
same caveat M14 already carries. It also retroactively unblocks the positive
M12-03 and M14-01/-02/-04/-05 cases, which hung on the identical gap; they are
now **owed rather than impossible**, and the e2e ledger says so in those words.
The cost is visible in the pixels: a fifth app-bar icon squeezes M4's title
from "Sameda…" to "S…".

**Recognition is a fact, not a question.** A trip row carries
`source_template_id`; grouping by it produces the recognised groups, and
membership therefore has no per-group opt-out. Two cases the concept never
spelled out came up immediately and are covered by name in
`domain/templateFromTrip.ts`:

- A row generated from the old **Ferien-Vorlage's own** positions carries that
  Vorlage as provenance. FR-27.1 fixes the hierarchy at two levels, so there is
  nothing to reference — the row is _loose_, and says so differently from an
  ad-hoc one ("aus „X“ — als eigene Position übernommen"). It was planned, just
  not by a reusable building block.
- A provenance id this device cannot resolve is loose too. An unresolvable id
  is not a group, and inventing a reference is worse than admitting ignorance
  (the M12 honesty rule).

**„Auf der Reise ergänzt" describes a path the app cannot walk.** The spec —
and the prototype's mock — picture a row added _under a group_ while packing.
A quick-add writes `source_template_id = null`, so that row is loose by
construction, and there is no surface anywhere that attaches a trip row to a
group. What actually produces a row whose group no longer contains it is the
**group** changing after generation: a position removed in M8, or an FR-27.4
removal the trip declined. From the group's side the two read identically and
deserve the same offer, so the computation is right; only the sentence blames
the wrong end. Left as-is with a revisit trigger in FR-27.5 rather than
reworded unilaterally — the alternative wording ("Auf dieser Reise dabei, in
der Gruppe nicht") is a product voice decision. The e2e case produces the
deviation the real way: archive first, _then_ remove the position, because a
past trip is never asked to follow along.

**No group change history table.** FR-27.5 asks for each fold-back to be
"recorded in the group's change history with its origin". No such table exists,
and FR-27.4 already carries the consequence — the edit is offered to every trip
that still follows the group and lands in _that trip's_ applied-changes log. A
per-group ledger for one writer was not invented.

**What the render caught that the stylesheet could not.** Three defects, all
found by looking at the pixels: Ionic truncated both segment labels at 390 px
("UPDATE THE GR…" / "ONLY IN THIS TE…"), so the screen's one real choice could
not be read; the absent line had no plural rule ("Blitz **were** not on this
trip"); and it butted against the blast note, reading as a continuation of the
statement it contradicts.

**And one finding about the visual gate itself.** The ten M4 baselines were
regenerated deliberately (ADR-013) because the new app-bar action changes every
planning-trip shot — but the _old_ baselines still **passed** against the new
render. An added 24 px icon plus the title truncation lands under
`maxDiffPixelRatio: 0.002` (658 px of 329 160). The gate is looser than it
reads; whether to tighten it is a decision with a flake cost, so it is recorded
here rather than changed in passing.

**Testing.** 25 domain tests over recognition and the write plan, six e2e cases
(`client/e2e/template-from-trip.spec.ts`) including E2E-M4-43 on the lifecycle
step. Mutation-proved throughout: dropping the `addTemplateInclude` loop,
flipping `DEFAULT_DEVIATION_CHOICE`, ungating the archive action, removing the
`source_item_id` shortcut and relaxing the kind check each felled exactly the
cases that claim them. Two false-green locators found on the way — Ionic marks
the chosen segment button with a _class_ rather than `aria-checked`, and
`ion-toggle` **is** the switch rather than containing one.

**No ADR.** FR-27.5 had already weighed the tradeoff and chosen; the
implementation weighed nothing new.

**Wording follow-up (2026-08-19, owner).** The deviation line reads _„Während
der Reise ergänzt"_ rather than _„Auf der Reise ergänzt"_. Chosen after the
note above was raised: it reads better, and the observation it answers — that
the app cannot actually produce a row added under a group while packing — is
unchanged. The neutral alternative („Auf dieser Reise dabei, in der Gruppe
nicht") was offered and declined, so FR-27.5's revisit trigger is now the
missing surface rather than the sentence.

## M4's trip name leaves the app bar (2026-08-19)

The visible cost recorded at the end of the M21 entry above, paid off in its
own PR as the owner asked. M4's app bar held the trip name beside six icons —
search, filter, fold-all, the FR-27.5 lifecycle step, the sync glyph, the
settings gear — and at 390 px the title box was **54 px**. „Samedan 2026"
rendered as **„S…"**.

**The measurement came before the mockups, and it changed what was drawn.**
The icon centres were read off the visual baseline
(`m4-list-visual-mobile-linux.png`: 28 · 129 · 181 · 227 · 275 · 319 · 360, a
46 px pitch), and every phone in the variant round reproduces that geometry
rather than a comfortable approximation. A round that flatters the bar cannot
answer a question about how much room is left in it.

**The round found a second thing, which is what actually decided it.** The
UI-Spec has always described M4's header line as „trip name · packed/total ·
weight · open-prep". The name was never in it — the rebuild left it to the app
bar, which is the one place with no room. So the fix was not a truncation
policy but putting the name where the spec had it all along:
`dev-docs/UI_Concept_M4Title_variants.html` (generator beside it), four forms,
owner chose **B without its condensation**.

**What that means, in the owner's words:** the header line now takes two rows —
the name with the trip's other views, then the figures with the facepile — and
**still collapses entirely on scroll-down**, name included. The variant that
kept a slim „Samedan 2026 · 12/38" strip standing was rejected on the grounds
that _you generally know which packing list you are on_. That retires the
Addendum's „identity collapses into the top app bar" directive rather than
implementing it: nothing migrates up, because nothing needs to.

**Then the desktop shot changed the rule by half.** With the title gone, a
1280 px bar held a lone chevron over a wide empty space — the constraint that
forced the decision does not exist up there. Owner's call on that render: keep
the title above the breakpoint, **and drop the name from the header line there**
rather than printing it twice, which also returns that line to a single row on
desktop. So the rule is not "M4 has no title" but **the trip is named exactly
once, and the width decides where**. The seam was already in the file —
`isDesktop`, the ref M5 uses to be a sheet or a panel — so this cost a
conditional registration and a media query.

It also broke sixteen cases at once, which was the useful part: `expectTripOpen`
asserted the header line, and the behaviour projects run at 1280. The helper now
asks the viewport and picks the locator, deliberately rather than trying both —
a helper that tolerates either half would go green against the name disappearing
from both.

**A screen may now have no app-bar title.** G-9 gained the case and the header
renders **no element** rather than an empty one — an empty `ion-title` still
claims the slot's padding, so „no title" and „a title that is blank" are
different renders. M4 is the only screen that takes it. `AppHeader.spec.ts`
pins all four states of the left slot, and the absence carries its positive
half in E2E-M4-44: the same locator must still find M6's title one tap later,
or a header that failed to mount would satisfy the assertion.

**The rejected two are worth keeping.** Moving only the lifecycle icon down to
🛒🧳📊 was rendered honestly and turns „S…" into „Samed…" — it relieves the bar
without solving anything, and seeing that took a render. Moving search, filter
and fold-all onto their own permanent tool row _does_ solve it and keeps the
title, but it reopens the 2026-08-07 G-12 decision; the reason recorded there
(„the sub-header collapses on scroll") does **not** apply to that row, which is
worth knowing if the question returns.

**The visual gate's tolerance was decided rather than left open** (owner,
2026-08-19, on the flake question): `maxDiffPixelRatio` **stays at 0.002**. It
is known to be loose — the whole added app-bar icon that started this entry
passed against the old baselines at 658 px of 329 160 — and tightening it buys
that one class of miss at the price of flake, which ADR-013's first driver
already rejected: a gate that fails on antialiasing gets ignored within a week.
What the decision leaves behind is a scope statement rather than a defect: **the
gate catches layout changes, not small ones**, and the rendered eyeball the
working agreement requires of every UI PR is what covers the rest. Written into
`playwright.config.ts` beside the number and into ADR-013, so the next person
to find the gate loose finds the reason with it.

**Cost.** Eight M4 baselines regenerated deliberately (ADR-013), four of them
twice, and twelve e2e assertions moved from `header-title` to a new `expectTripOpen` helper. Those
had been using the app-bar title as the „M4 is open" signal; the helper scopes
to the _painted_ page, because the name now lives inside the router outlet
where Ionic keeps the outgoing page mounted through a transition — unscoped, it
could read the trip being left.

## M14's positive tests, and the flag nobody could set (2026-08-20)

M14's positive e2e cases had been recorded as _owed but unwritten_ since M21
shipped the planning→active step. Writing them found that the recorded block
was only half the story, and that a defect had been hiding behind it.

**The flag the assistant is about had no writer.** FR-9.1 names two flags.
_Missing_ is stamped by M4's quick-add on an active trip; _unused_ — the one
FR-9.2's assistant is mostly written around, because the harvest of a trip is
mostly „mitgenommen, nie gebraucht" — could not be set anywhere in the app.
M5's Details block listed the pair the way the UI-Spec does, but as a
**read-only note** among controls, so the screen looked complete and wrote
nothing. Consequence: M14 had only ever been exercised by the dev fixture, and
"unblocked" had been checked against `archived` alone. **The precondition was
two things and only one of them was verified.** The control is two toggles now,
active trips only, both revocable — the merge already allows that: setting a
flag is additive (NFR-4.2a rule 1), clearing one is ordinary last-writer-wins.

**Then the first run showed one proposal instead of two, and that was a real
defect.** The client's optimistic update carries a _whole row_, and both the
store and the Local Mode IndexedDB write **replace** rather than patch — so the
hand-maintained projection behind it (`itemRow`) was a list of columns that had
to mirror a growing type, and did not. It omitted `source_template_id`,
`packed_by_user_id`, `packed_at` and `packing_now_at`. One M5 edit — a flag, a
traveler, a container, the Late-Packer toggle — **detached a generated row from
the group it came from**, permanently in Local Mode, where no pull ever
restores it. FR-27.4's refresh, FR-27.5's recognition and FR-9.2's proposals
all read that provenance; the assistant is simply where it surfaced first. The
guard is written against the whole `TripItem` type rather than the four
columns, so the next column added is covered the day it is added, and removing
the one line turns E2E-M14-01 and -02 red.

**Two smaller findings came with the cases.** The retarget picker listed its
groups in storage order — the same class of finding as FR-27.2's include
order, and fixed in the same place: `retargetGroups` sorts by name, with a
domain case behind it rather than an e2e assertion pinning a symptom. And the
picker is now closed by **choosing the value it already has** instead of
Escape: dismissal is Ionic's own path then, so the wait is on a state the app
reaches by itself — Escape left the popover up often enough to be seen in a
repeat run.

**What stays uncovered, and says so.** E2E-M14-03's second clause — the same
item surfacing for another group — needs one item flagged twice under two
groups, which one trip cannot produce. It stays unit-owned and the UI-Test-Spec
sentence names the gap instead of marking the id done.

**One more thing the render caught.** M14's applied-changes footer still said
planning trips „übernehmen sie sofort" — the FR-27.4 model as it stood before
the 2026-08-18 revision made a group change an _offer_ answered at the trip.
The per-row blast line on the same screen already said „wird N Reisen
vorgeschlagen", so the screen carried both models at once and one of them was a
promise the app does not keep. Corrected in both catalogues, and the component
test asserts the _claim_ (no „sofort"/„immediately") rather than the copy. It
took **rendering the screen with real proposals** to see it: the sentence only
appears once something has been applied, which is a state no test and no
screenshot had ever reached.

## A build image's major is a toolchain version, and a gate says so (2026-08-21)

Dependabot bumped `client/Dockerfile` from `node:24-alpine` to `26-alpine` and
every check went green — because no check builds anything with that image. CI
compiles the client through `setup-node` at the version `ci.yml` names (24,
matching `mise.toml`), and `docker-build` only proves the Dockerfile _builds_.
The published client image would therefore have shipped a bundle compiled by a
Node major nothing in the repo tests with, and Node 26 is `lts: false` — the
Current line — until October 2026, while 24 is Active LTS.

**The first fix was the wrong shape.** Ignoring `semver-major` in
`.github/dependabot.yml` removes the bad PR and the good one with it: the next
LTS would then have to be _remembered_, which is exactly the kind of promise a
single maintainer does not keep. Owner, on reading it: but I don't want to have to remember
that by hand.

So the majors stay in Dependabot's hands and `scripts/toolchain-pins-gate.sh`
holds the three declarations of each together — node across `client/Dockerfile`,
`mise.toml` and every `node-version:` in `ci.yml`; go across `Dockerfile`,
`mise.toml` and `go.mod`. It runs in `make ci` and as the _first_ step of the
`docker-build` job, before either image builds. A major bump now arrives on its
own, goes red, and the error names the files still to change. Mutation-proved
three ways: image-only bump, one `node-version:` moved out of four, and the
golang image against `go.mod`.

The image itself goes back to `node:24-alpine` at its current digest until 26
is LTS. That costs nothing measurable — the client image built from Node 24 and
the one from Node 26 have the same final image id, precache prologue included,
so the two toolchains produce the same bundle. Digests and patch/minor keep
flowing automatically, which is what the pinning in invariant 8 is for.

Worth recording because the bump was _correct in isolation_: a green pipeline
said nothing about it, and the drift is only visible if you ask which artifact
a version actually builds.

## The device backup carries the FR-27.4 refresh state (2026-08-21, MVP Track F)

The backup wrote every trip and every Vorlage and stopped there. What it left
behind were the three tables that record _how_ a trip follows its groups —
`trip_template_sources`, `trip_generated_positions`, `trip_applied_changes` —
so a restored device kept everything visible and silently forgot every answer
the user had given. Proposals already refused came back as fresh offers, and a
position deliberately deleted reappeared. A restore that looks complete and
undoes a month of decisions is worse than one that visibly fails.

**No new format, and that was the finding.** The ADR-015 revisit trigger names
"a restore has to carry something the portable shape cannot express" as the
moment a container format comes back on the table — and this was not it. All
three tables reference a template, a master item and a traveler, and the
portable shape already carries those **by name**. So the sections are three
optional keys on a trip document (`follows:`, `generated:`, `applied_changes:`)
and the ADR gained an amendment rather than a successor.

**The restore re-keys rather than copies**, which is where the actual design
sits. Every id is new after a restore, so a ledger entry rebuilds its own from
(trip, master item, traveler) — the identity `planRefresh` already keys on — and
finds its row by that same identity rather than by name. Matching by name was
the first draft and it is wrong for the one case the ledger exists to serve: a
row the user _renamed_ is precisely a row that has become theirs. An entry
whose row is not there keeps the id the row would have had, because "the entry
outlives the row" **is** FR-27.4's record of a deleted position.

**A reference that cannot be resolved is dropped, not half-restored.** A source
pointing at no template proposes nothing forever; a ledger entry keyed on the
wrong position detaches one nobody asked to detach. The applied-changes log is
the deliberate exception — its group name is denormalised exactly so the record
outlives the group — and it is replayed with its own timestamp, which needed
`logAppliedChange` to take one: every other caller is making history, this one
is repeating it, and stamping "now" would file a year-old change at the top of
M2's list as today's news.

**The old-file fallback is a test, not a comment.** A backup without the three
sections restores as it always did; a malformed entry _inside_ one of them is
skipped rather than failing the document. That asymmetry against the items —
where a nameless item aborts the document — is deliberate: the items are the
user's data, these three are bookkeeping the refresh can re-derive.

**M18 came with it**, since the restore branch is its screen: both import
screens are localized (`import.portable.*`, `import.wizard.*`), and the restore
list now says a trip _follows N groups_ — the only place the new data is
visible before anything is imported, and the rendered assertion E2E-M18-08
leads with. The parser's own error strings stay English; they interpolate the
YAML library's message and would need an error model rather than a catalogue
key. Noted, not done.

**E2E-M18-08 is built around the absence problem.** Everything the case proves
is something that must _not_ happen, so it ends by adding a new position to the
group on the restored device: the proposal that appears names it and only it.
Without the restored sources there would be no proposal at all; without the
restored ledger the refused position would be standing next to it.

### Dependabot skips the Node majors that can never be taken (2026-08-21)

The toolchain-pins gate landed the same day and immediately did its job: the
next `node:26-alpine` bump arrived on its own and went red at
`docker-build`, naming `mise.toml` as the file still to change. The mechanism
is right, so this only trims what it has to say no to.

Odd-numbered Node majors never become LTS — Current for six months, then end of
life — so `.github/dependabot.yml` ignores the odd lines for `client/Dockerfile`.
Even majors stay enabled, because they _do_ reach LTS in the October after their
release and the repo does want them, on its own schedule; the gate is what
decides when. The near-term reason it is worth doing at all: Node 27 arrives in
October 2026, and Dependabot only ever offers the newest — so from that month it
would chase 27 and stop offering 26, which is the version becoming LTS in the
same week.

The requirements are written in Bundler syntax (`~> 25.0`), because that is what
the docker ecosystem parses; `25.x` is npm/NuGet syntax and `Gem::Requirement`
rejects it. This is the part that could not be verified from here: an ignore
condition whose requirement fails to parse has been observed to abort the whole
docker job for its directory (dependabot-core#13328), which for `/client` would
also stop nginx digest updates. The check after merging is the run log under
the repository's Dependabot update history — it names the ignore conditions it
applied. A suffixed tag such as `26-alpine` may also be read as a prerelease,
in which case a `~>` bound would not match it and the condition is merely
inert rather than harmful.

Deliberately not done two other ways. Ignoring `semver-major` outright throws
away the good October bump with the bad April one and makes the LTS move
something the maintainer has to remember. Pinning `node:lts-alpine@sha256:…`
would follow LTS automatically and read well — but the tag names no major, so
the gate would have nothing to compare, and the drift would go invisible in
exactly the month the tag jumps 24 → 26 while `mise.toml` and `ci.yml` do not.
That is the moment the gate exists for.

## The sync outbox survives a reload (2026-08-21)

The Server-Mode outbox was a JS array. Every mutation that had not reached the
server lived in exactly one place — the open document — so a reload or an app
kill while offline discarded it _silently_: the glyph came back clean and the
change was gone. That is the ordinary case on a phone in a hotel, not an edge
case, and it is the reason the MVP plan lists it as blocker B2.

**What was built.** `client/src/sync/outboxStore.ts` is the seam: one
IndexedDB database of its own (`jitpack-outbox`), a record per mutation, the
same serialize-the-writes discipline as `local/persistence.ts` and for the
same two reasons — a write issued and immediately followed by a navigation
lands in a transaction the navigation cancels, and the stored tail must be the
_caught_ promise or one failure silently skips every write after it.
`SyncOutbox` writes through it on enqueue, removes on acknowledgement, and
`restore()` rebuilds the queue on boot. The orchestrator replays before the
first pull, awaited rather than fired off: App.vue's own `drainMaster` follows
`connect()`, and two overlapping drains of one partition would push the same
chunk twice.

**Replay idempotency was verified, not assumed.** The reference is not the
merge algorithm: `internal/sync.Merge` is field-level LWW and would let a
replay through unchanged (the mutations happen to carry absolute values, so it
would be harmless — but that is a property of today's mutation set, not a
guarantee). The guarantee is the **`mutations` memo table in
`store.ApplyMutation`** and its master-partition twin, pinned by
`TestApplyMutation_DuplicateMutationID_ReturnsRecordedResult`: a replayed
`mutation_id` returns the recorded result and appends nothing to the change
log. What the client owes that guarantee is that the id is minted once, at
enqueue, and stored _with_ the mutation — a replay that re-minted it would be
a second write rather than a retry.

**Parking, because a wedged queue is worse than a lost mutation.** A mutation
answered `rejected`, or a whole batch refused with a 4xx a retry cannot fix
(anything but 401/408/425/429), is moved out of the queue and kept on the
device with the server's own reason. Keeping it would stop the entire
partition from ever syncing again because of one bad row. A network failure
and a 5xx are explicitly _not_ refusals. Two consequences stated rather than
hidden: G-2 counts the parked mutations but **no screen lists them** (revisit
trigger in Sync-API §5.1 — the conflict log is trip-scoped and this list is
device-scoped, so it is not simply a row in it), and the case has **no e2e**,
because the app cannot produce a permanently-refused push through its own UI.

**Three findings.**

1. **The queue count was a property of the wrong thing.** The badge rendered
   only while `state === 'offline'`. That was already a small lie before this
   work — a master partition can drain to _synced_ while a trip's queue waits
   for its trip to be opened — and a durable queue makes it a large one, since
   the queue now outlives the tab. The badge counts the queue.
2. **Durability has to be able to say no.** An IndexedDB write can be refused
   (quota, an aborted transaction). Losing the mutation there would be the
   worse failure, so it stays queued and is still pushed; what is withdrawn is
   the _promise_, and G-2 says so instead of claiming a reload is safe.
3. **The e2e assertion for "the shell painted" is screen-dependent.**
   E2E-PWA-01 waits for the header logo; inside a trip the app bar carries the
   back button and no logo, so the same assertion looks for a control that
   screen does not have. Cost half an hour and is written down in the ledger.

**Deliberately not built: a reconnect drain.** Track B recorded that the queue
moves only on the app's next own action. It now also moves on the next app
start, which is what B2 asked for. An `online`-event drain is a separate
behaviour with its own failure modes (a flapping connection re-pushing on
every event) and was left out rather than smuggled in.

## M4 comes back where it was left, and the header line stops flipping (2026-08-21)

ADR-012's overlay amendment recorded a cost and named its repair: the M5 sheet
is an _alias_ of M4's route and opening it `replace`s, which re-renders the
list from the top, "the cheaper repair is on the other side: remember M4's
offset per trip". This is that repair, plus the four things it turned out to
need — none of which the amendment could have known, and all of which are the
reason it took a rendered measurement rather than a stylesheet reading.

**The memory cannot live in the component, and nearly did.** The first version
kept a `Map` at the top of `PackingListPage.vue`. In a `<script setup>` block a
top-level binding is created per _instance_, and the instance is exactly what
the replace tears down — so every read found an empty map. It lives in
`client/src/lib/scrollMemory.ts` now, with its own unit tests, and the module's
own doc comment names the trap.

**A scroll position on this screen is two values.** M4's header line is sticky
but in flow: it holds 84 px of the _scrolled_ content, so putting the offset
back under a re-opened line shows different rows than the ones the user was
reading. The collapsed state therefore travels with the number, and is applied
during setup — the first painted frame after the sheet is already correct, so
there is no max-height transition to race.

**The list's own re-render reports its way back from the top.** Those scroll
events, read as the user's, both re-open the header line and overwrite the
offset that is about to be re-applied. The screen now stops listening to itself
between opening the sheet and finishing the restore, which is also what made
the WebKit run stop remembering a zero.

**And the header line was flipping open and shut, which nobody had seen.**
Collapsing it removes its own height from the scrolled content; the browser
answers that with a scroll adjustment; the screen reads the adjustment as an
upward scroll and re-opens the line, which grows the content again. Under
Playwright's load the loop ran for as long as the test watched. Two changes
close it: `overflow-anchor: none` on the content's scroll part — this list has
one thing above the rows and it is the element that moves — and the line now
honours `prefers-reduced-motion` by not travelling at all, which it should have
done anyway: it is the largest movement on the screen and it happens while the
list is moving too.

**The e2e case is E2E-M4-45**, in its own describe with motion reduced, and it
waits on a signal the page raises (`data-scroll-restored`) rather than on a
clock. It asserts the rendered scroll offset and the folded header, never the
URL. Mutation-proved by dropping the `scrollToPoint` while keeping the signal:
red on both engines. Writing it also cost one false-green that is worth keeping
in mind — Playwright scrolls whatever it is told to click into view, so a row
chosen for being "on the page" rather than "inside the content's box" quietly
scrolled the list back to the top before the measurement.

**The same PR closed E2E-M12-03's positive half**, owed since the lifecycle
step landed, and it too found things the diff cannot show. The trend counts the
weight actually _carried_, so the case has to pack the row — an unpacked one
puts a 0 kg column on the chart that a "the section exists" assertion would have
accepted. `seriesTopFlagged` reports an empty list for "nothing was flagged" and
for "the flag was never written" alike, so the case reads the _Missing_ chip
back off the stored row in M5 before relying on the list. And M14's open count
is not the signal it looks like: asserted after archiving it read `0`, because a
_missing_ proposal needs a group to target and that world has no templates at
all — that coverage belongs to `review.spec.ts`, which builds them.

## The i18n migration, closed except for M15 and M17 (2026-08-21)

Track E of the MVP plan. The module and both catalogues have existed since
2026-08-07; what was missing was the migration — nine screens plus the chrome
still held their strings as literals. Done in three commits, one per coherent
group, because the rule that governs this work is that **a section is the unit**:
a half-translated screen is worse than an untranslated one, since the user
cannot tell a missing translation from a deliberate anglicism.

**What is on the catalogue now:** M2, M3 (all four steps), M1, M6, M16, M20,
the trip roster, the conflict log, the OIDC login and its callback, the M19
first-launch mode choice, and the global chrome — the four anchors, the one
header bar's route titles, the presence facepile and the quantity stepper.

**Three of these were not string swaps, and those are the part worth recording.**

_A nav anchor and a route title used to store the finished English text._
`NAV_ANCHORS[].name` and `meta.title` were read straight into the template, so
no language switch could ever reach the bar that sits above every screen or the
labels at the foot of it. They store a `MessageKey` now (`nameKey`,
`meta.titleKey`), and the two presentations render through `t()`. An AppHeader
case mounts the same route in German, which is the only kind of test that would
have caught the original shape.

_The roster's role chip was `role.charAt(0).toUpperCase() + role.slice(1)`._
That is an English spelling rule wearing a label's clothes: it renders "Editor"
in every language, and would render "Owner" as "Owner" forever. It moved to
`lib/roleLabels.ts` beside `attributeLabels.ts`, same shape, same
unknown-value-falls-back-to-itself rule, with its own test.

_M16 kept a second copy of two vocabularies._ It spelled the season, transport
and accommodation values in its own English words rather than through
`attributeLabel`, and had its own three words for the procurement modes that a
position calls `mode.*`. A checklist entry and a packing position mean the same
thing by „vor Ort kaufen", and two wordings for one concept eventually
disagree — this is the same class of finding as FR-27.2's include order.

**The catalogue-integrity test grew two checks.** Key-set parity was all it
proved, and key parity is not structural parity: a translation that drops a
`{name}` slot loses the only variable part of its sentence, and one that drops
the `|` plural split makes `t()` return the singular for every count. Both
render as plausible German, so neither surfaces as a missing string — they
surface as a sentence that is quietly wrong. Both checks were proved failing
against injected breaks before being kept.

**Two conventions fell out of the work.** A count that is grammatically plural
gets a pluralized key, not an "(s)" — M20's _„Provisioned … · N trip(s) · N
template(s)"_ is three keys now, because German has no such spelling and
because two counts cannot share one `n`. And a composed hover title (the
presence facepile: who, on how many devices, whether in sync) is assembled in
script, since a template expression cannot pluralize through the catalogue.

**What is left, and why.** **M15** (`views/import/ImportPage.vue`) and **M18**
(`PortableImportPage.vue`) were excluded by file, not by judgement: the parallel
backup track owns both files for this MVP push and localizes them itself. Their
_route titles_ are on the catalogue here, because the route table is chrome.
**M17 Settings** is the one screen this pass leaves genuinely half-translated,
and it was already so before it: ten `t()` calls beside roughly fifteen
literals, plus the avatar crop modal, which is untouched. It is a section, so
it wants one commit of its own rather than a corner of this one.

## A trip stops being frozen (FR-2.7 / M22, 2026-08-21)

A trip's name, its dates and its travellers were decided in M3 and frozen when
the wizard closed. Not by decision — the screen inventory M1–M21 simply has no
editor, `addTraveler` is called only by the wizard, the clone and generation,
and there was no `updateTrip` at all. The workaround, cloning (FR-12.1), loses
the packing progress, which is what makes it not one.

**The consequence rule already existed, and finding that changed the work.**
The first implementation was a new pure module with its own rules for extending
and withdrawing per-person rows. It was wrong twice over: FR-27.4 already
specifies traveller changes (_"a person added receives the per-person positions
… one removed takes their untouched rows along"_), and `domain/refresh.ts`
already implements them, because the trip re-resolves against its _current_
travellers. The module was deleted before it reached a PR. What was left is
small: write the traveller mutation, then call `acceptTripRefresh` — the same
path the "yes" on M4's card takes. A second expansion of per-person rows would
have been a second set of rules to keep in step with the first.

So the only thing the owner's decision actually changed is **when the user is
asked**, and FR-27.4 gained an amendment rather than a competitor. The reason
is the same one that put the question at the trip in the first place: a group
change usually arrives from someone else, on a device that may not even hold
the affected trips, so it must be a question. A traveller change is made by the
traveller, in the trip's own editor, deliberately — asking them to confirm on
the next open what they just did in front of the app is a dialogue with no
second party in it.

**Removal is offered only before departure** (owner), which is what keeps the
rule from ever having to weigh a _departed_ trip's packing record.

It still has to answer for a packed row, though, and the first cut answered it
alone: unpacked rows go, packed ones stay unassigned. The owner rejected that
the same day, and was right — a packed row means somebody physically put the
thing in the bag, and whether it should come back out is not a property of the
data. On one trip the answer is _take it out_; on another it is _leave it
visible so somebody remembers to_. So it is asked, at the confirmation, and
**only when there is something to answer about**: with nothing packed the
removal has one outcome, and a question with one answer teaches the user to
dismiss questions. The question names the quantity for the same reason
FR-27.4's card lists its changes instead of counting them.

Underneath, _Gepackte behalten_ is simply FR-27.4's ordinary protection, and
_Alles entfernen_ deletes those rows outright — that protection is exactly what
the user overruled for this person. A skipped or hand-edited row follows the
_behalten_ branch either way: nobody was asked about it.

**Two defects the type-checker could not see.** The date inputs used a
two-statement inline handler; Vue parses an inline handler as a single
expression, so `vue-tsc` and eslint were both green and the screen did not
compile in the browser at all. And the add-a-traveller field was a bare input
in a flex row — a label over nothing, with no box to type in. Both were found
by rendering the screen, neither by a test that queried the DOM: the element
was present, it simply had no surface.

**The e2e case for the owner's actual requirement — remove Zoe, keep Xenia's
trousers — was green for the wrong reason three times**, and the sequence is
the reusable part. Asserting the count and the surviving name passes against an
over-broad removal, because the refresh re-resolves afterwards and generates
the sibling's row _again_: same name, same count, different row. Packing the
sibling to prove identity fails differently — a packed row leaves the list
through the FR-25.2 pack-out, so the seeded position now carries quantity 2 and
a _part_-packed row keeps its place. And the first working version raced:
`page.goto` outran the removal and the case failed against correct code. Only
after all three does the mutation redden it.

**The suite now runs on the device the family holds.** The container defaulted
to en-US and UTC, so every rendered date was a US date and "today" was a UTC
one — and the FR-27.4 boundary is a date comparison, so a run just after
midnight in Zurich was reading yesterday. `de-CH` and `Europe/Zurich` now. The
app _language_ is deliberately not left to the device: `resolveLocale` falls
back to `navigator.languages`, so a German device would flip the whole UI and
every English assertion with it; the fixture pins `jitpack_locale` instead, and
only when the key is absent — an unconditional write re-seeds after a reload
and overwrites the choice E2E-M17-10 asserts survives. Measured rather than
assumed: the 20 visual baselines are unchanged.

No seed change: the sample data already carries a **planning** trip with two
travellers and four per-person positions, which is exactly the state M22 has
something to show in.

## The chevron learns where it came from (2026-08-21)

MVP Track I. The owner's report was one sentence: inside a trip, tap the gear,
tap `‹`, and the app is on the dashboard.

**The premise that was wrong.** ADR-011 made the back target _declared_ rather
than read from history, because a cold-start deep link has no history to read.
One static `meta.parent` per route — and for a drill-down that is exactly right.
The unexamined half is that it assumed every screen _has_ one parent. The gear is
offered on every screen by decision of that same ADR (it is what keeps the
conflict log reachable inside a trip), so `/tabs/settings` had no true parent to
declare, and the one it declared was a guess that happened to be right on one
screen out of twenty.

**Two things came out of the same hole, and both were older than the report.**

Navigation_Concept §7's route table has a _flows_ row promising "the origin the
flow was entered from". There was no `from`, `origin` or `returnTo` anywhere in
the router: the promise was four words in a table with no mechanism behind it,
and it had read as implemented for as long as the table existed. Concretely,
`/portable-import` is entered from M2, M7 and Settings while declaring
`/tabs/settings`, so M18 opened from the trip list returned to Settings — the
owner's defect with a different door, never reported because that path is used
less.

And `ROOT_PATHS` in `backTarget.spec.ts` listed `/tabs/settings` among the routes
that "show the logo and therefore owe no parent", while the route table gave it
one. Nothing objected, because the test only ever asserted that non-roots _have_
a parent and never that roots lack one. An exemption list that is never checked
is a claim, not a rule; the reverse assertion is now there and would have failed
on the day the contradiction was introduced.

**Why the router stamps the origin and the links do not.** The obvious shape is
for whoever navigates to pass it — `router-link` with a query. It works, and it
breaks the first time a link forgets: the gear alone is one call site rendered on
every screen, and the two import flows already have five entry points between
them. A guard makes the property structural. It also composes for free, because
the origin is recorded verbatim: trip → gear → admin → `‹` → Settings → `‹` →
trip unwinds hop by hop with no code that knows about chains.

**The trap, with its price.** The first version of E2E-G9-12 passed against the
_unfixed_ build. `expect(page).toHaveURL(/\/tabs\/trips$/)` matches any URL
ending in that text — and the fix's whole point is that the URL now ends in
`?from=/tabs/trips`. The assertion was reading its own mechanism as the result.
Its neighbour was no better: `onVisibleScreen(page, 'trips-new')` found the trip
list because a page left mounted through Ionic's transition is briefly not
`.ion-page-hidden` either. Both are now the pathname compared exactly, plus a
negative signal specific to the wrong answer (the settings control absent from
the document entirely). Found only by reverting the production branch, rebuilding
and re-running — which is the step that keeps paying for itself.

Encoding the origin came from the same measurement: the URL bar read
`?from=/portable-import?from=/tabs/trips`, and an unencoded `?` or `&` inside a
query value ends it. Nested origins are encoded now.

**What was deliberately not done.** Variant B — Settings as an overlay — was
weighed in the ADR amendment and rejected: it fixes Settings by construction and
does nothing for M15/M18, which was half the defect, while M17's three
sub-routes would all need re-homing. And `?from=` is attacker-controlled input on
a link someone else wrote, so it is validated rather than trusted, and a route
that does not declare the class ignores it entirely — no drill-down can be
redirected by a crafted URL.

## A refusing control is worse than an absent one (2026-08-21)

M22 shipped removal of a traveller gated on the trip not having started, and the
✕ on an active trip was rendered **disabled** rather than omitted. The reasoning
was written down at the time and reads well: a control that vanishes gets hunted
for, so leave it visible and say why. The owner used the screen and reported the
opposite — a ✕ that answers no tap is read as a broken app, and the sentence
under the roster was already there to answer the question the ✕ raises.

Worth recording because the argument was not wrong, it was **untested**: it was
decided from the code and never from the screen. The project already has the rule
for this ("don't judge a UI change from the stylesheet — render it, and let the
maintainer eyeball it"), and this is the same failure one level up: an
_interaction_ affordance judged from the reasoning about it rather than from
having it in the hand.

**The test trap that came with the fix.** `E2E-M22-04` counts the remove controls
and expects zero. `[data-testid^="traveler-remove-"]` also matches
`traveler-remove-note` — the explanation under the list — so the count never
reaches zero and the case failed against correct code. The old version escaped it
by taking `.first()`, which happened to be a button because the buttons precede
the note in the DOM. The locator is scoped to `ion-button` now. A prefix locator
is a pattern, and a testid is not a namespace.

`E2E-M22-07` was added at the same time as the positive half: "no ✕ on a started
trip" passes just as well against a screen that renders none at all.

## The composer offers chips before it asks for typing (2026-08-21)

FR-25.13c, decided and built the same day. What the diff cannot show:

- **The round was decided on rendered pixels, not on prose** — three variants
  mocked in the app's own token system (chips in the composer · inventory
  browse-sheet · two-step tag tiles) and judged as an artifact page, the G-14
  lesson applied to a concept decision. The matrix and the loser live in
  ADR-020; the short version is that the _smallest_ variant won the first
  build precisely because the composer is one shared component, so FR-25.13's
  "one way to add, everywhere" survives without a rollout. The browse-sheet is
  **decided, specified as FR-25.13d, and not started** — its door (the "Mehr
  aus dem Inventar…" entry) was deliberately _not_ shipped now, because a
  control that leads nowhere is worse than none.
- **The accepted cost is the autofocus.** FR-25.13a's "expands _and focuses_"
  was load-bearing wording for a year of specs and one e2e assertion; it
  turned around because the raised keyboard covers exactly the offer the
  empty composer now leads with. Whoever wants to type pays one tap, on
  desktop too.
- **"Already chosen" became a rule instead of a report.** M8 excluded its
  positions from the autocomplete since the beginning; M4 never passed its
  contents at all, so the duplicate path survived there silently. The chips
  forced the question and the answer is uniform: what a scope carries is
  offered nowhere — and E2E-M4-46 exists _only_ for M4's wiring, because no
  shared-component test can see a dropped prop.
- **Two case numbers were already taken by written-but-unbuilt specs.**
  E2E-M8-18 belongs to FR-28.8 and E2E-M8-19 to a group-refresh case; the new
  case is E2E-M8-21. The §3.28 memory predicted exactly this trap — reserving
  numbers in specs ahead of implementation means the ledger, not the spec, is
  where a free number is found.
- **The recents trail is deliberately device-local and unsynced** (the
  review-dismissals stance): recency of _this device's_ adds is a typing
  convenience, not domain data. Free-text adds record nothing — at the
  composer's level they have no master item yet; the caller creates it later.

## The composer's second posture: the browse-sheet (2026-08-22)

FR-25.13d, built as decided in ADR-020 — Option B behind Option A's door.
What the diff cannot show:

- **The naming question the ADR flagged resolved without re-wording the FR's
  "one way".** ADR-020 warned that building the sheet means either re-wording
  FR-25.13 into _Erfassen_ vs. _Zusammenstellen_ or rolling the sheet out to
  every list screen at once. Both happened at zero rollout cost, for the same
  reason A won the first build: the sheet lives _inside_ the shared composer,
  so M4, M6 and M8 got it in one change, and the two postures are two doors
  in one component rather than two components.
- **The „schon drin" flip is the feedback mechanism, not just a state.** The
  sheet passes the caller's `excludeItemIds` straight through as the carried
  set, so a tapped row flips in place when the caller's scope grows — no
  toast, no counter, and the sheet never closes during a run. That also means
  the state is _derived_, never bookkept: a second device adding the same
  item over sync flips the row too.
- **Focusing after a modal loses to Ionic's teardown.** The free-text footer
  first set `is-open` to false and called the composer's focus; the field
  ended `inactive` because modal dismissal restores focus _after_ that. The
  fix is the house rule applied to production code: the focus moved into the
  modal's own `didDismiss` handler behind a pending flag — a settled-state
  seam, not a wait.
- **M6's exclude gap closed as "the trip's whole contents", not the open
  tab's.** The question FR-25.13c left open on purpose (the memory said:
  decide it with FR-25.13d) had a wrong-but-tempting answer — excluding only
  the visible shopping tab — which would have re-offered an item that is on
  the trip as a pack row. The item is on the trip either way; the mode is a
  property, not an identity. E2E-M6-21 is the first M6 e2e case at all.
- **The E2E-M8-21 number collision is real and now paid.** PR #142 took
  M8-21 for the implemented FR-25.13c case while the written FR-27.15 case
  already held it — the exact trap the previous entry warned about, one step
  further: not a reserved number honoured, but a duplicate created. The
  FR-27.15 case is renumbered to E2E-M8-23 (M8-22 is the sheet's); the
  renumber note stays in the test spec so the log's older references resolve.

## M17 was the last screen, and the trap was a constant (2026-08-22)

Backlog item 4 closes here. M17 had been half-translated since before the
migration — about ten `t()` calls beside fifteen literals — and it is the worst
screen to leave that way, because the language switch _lives on it_: the user
changes the setting and watches half the page ignore them.

**The part that was not mechanical.** The notification rows were a module-level
constant holding finished English text:

    const prefLabels = [{ kind: 'delegation', label: 'Delegations', hint: '…' }, …]

That is evaluated once at import, so no language change can reach it — the exact
shape that had stranded the nav anchors and the route titles in the migration
proper, found a third time. The rows hold `MessageKey`s now and `t()` runs during
render.

**And that section is unreachable by the e2e suite**, which is why it earns an
entry rather than a commit message. Notifications exist only on a multi-user
instance (`server` mode _and_ an OIDC session, FR-17.3/FR-19.3), and neither
Playwright project can be one: `local` has no server, `single` has no tokens. So
the one section carrying the actual defect is covered by a **component test**
(`views/settings/__tests__/SettingsPage.spec.ts`, mounted with a fake session)
or by nothing at all. Mutation-proved by pinning one label back to English.

The visible sections are E2E-M17-11, asserted in English first — "the German word
is there" passes just as well on a build that renders neither.

**Two catalogue keys that had been missing all along** turned up on the way:
`common.ok` and `common.download`, both of which several screens had been
spelling out. The storage dialog's megabyte figures now go through
`formatNumber`, so the decimal separator follows the locale rather than staying
English on a German screen.

## FR-27.15: the editor learns to recognise its own duplicates (2026-08-22)

M8 now notices when a Ferien-Vorlage's loose positions are, together, a Gruppe
that already exists, and offers to fold them into an include. The concept was
decided in the FR a day earlier and the build followed it; what is worth keeping
is the three places where following it _literally_ would have been wrong, and
one trap that cost a red WebKit run.

**The FR's own sentence was too narrow, and the FR says why.** Its example
warning names the quantity — „Menge weicht bei 2 Positionen ab" — and the
quantity genuinely is the common case. But the same paragraph states the rule
the feature must never break: it may not change what a trip would generate
without having said so. Assignment, procurement mode, Late Packer, dedup and
conditions each decide that too, and after the fold the group governs all of
them. A row announcing only the amount would let a per-person position turn
trip-global in silence — the exact failure the FR forbids, arrived at by
obeying its example. The comparison therefore covers six fields and the
sentence counts positions rather than amounts. The widening is recorded in the
FR itself, because the next reader would otherwise find the code contradicting
the text.

**The dismissal's key is the feature.** „Re-offer only when the group's
resolved item set has changed" reads like a timestamp problem and is not one:
there is no clock a device can trust for this, and Local Mode has no server to
ask. Storing the _set's signature_ makes the question decidable locally, in all
three modes, with no schema — which is also why the store drops a malformed
entry rather than keeping it. An unreadable signature matches nothing, so a
kept one would suppress that suggestion permanently and invisibly.

**Nothing recomputes after a fold, and nothing should.** The FR promises a
subsumed candidate disappears rather than converting the same items twice; the
detector runs over the live positions, so removing them _is_ the recomputation.
The same falls out for the two guards — the folded group becomes an include,
and an include is already excluded. This is the one place where propose-only
paid for itself in code rather than in principle: there is no applied state to
keep consistent, because nothing was applied.

**The trap, with its price.** The e2e case closed the FR-27.12 peek with
`Escape` and then asserted `ion-modal.show-modal` was gone. It passed — _before
the sheet had finished presenting_ — and the still-live overlay then swallowed
the next tap, which surfaced 292 retries later as an unrelated-looking timeout
inside the shared `includeGroup` helper. The sheet's own close button plus the
same assertion is deterministic. The obvious-looking alternative is wrong for a
second reason worth writing down: `page.locator('ion-modal')` never reaches
zero, because five of them sit in the DOM permanently — only `.show-modal`
marks a presented one.

**Two costs accepted.** The seed grew by one loose position (Blasenpflaster in
the Fotoreise), so the FR-27.15 row appears on every freshly seeded device —
deliberate, per the standing seed rule, and it is why the eyeball needed no
typing. And the deviation warning carries its own tint rather than the bare
`--ct-yellow` the blast-note uses: rendered on Latte, small yellow text on
near-white is thin, which no stylesheet reading would have told us.

## The i18n gap that was a measurement error (2026-08-22)

Written after a session set out to close what the M17 work had recorded as an
open hole: _a wrong catalogue key in a **template** expression is not caught by
the compiler, so it ships as a raw `avatarCrop.zoomXX` on the screen._ The
finding had a measurement behind it — `vue-tsc --noEmit` had exited 0 with a
deliberately broken key in place — and it was still wrong.

**`vue-tsc --noEmit` checks nothing in this repository.** `client/tsconfig.json`
is a solution-style file: `"files": []` plus three `references`. `--noEmit`
overrides the build mode, so the compiler loads that config, finds no files in
it, type-checks zero of them and exits 0 — the same exit code a clean run gives,
for a run that never happened. The project's own `npm run type-check` is
`vue-tsc --build`, which follows the references, and it **does** reject a wrong
`MessageKey` — verified in both shapes a template offers, `{{ t('…') }}` and
`:aria-label="t('…')"`. Argument types of a called function are checked in
templates without `strictTemplates`; that flag governs component props and
attributes, which is a different question than the one the note asked.

The lesson is not about i18n. **A green exit code is only evidence when the
command it came from was doing the work you think it was** — and a config that
legitimately contains no files is the quietest way for that to stop being true.

**`strictTemplates` was measured before it was proposed, and it loses on the
number**: 1104 errors, almost none of them ours. Ionic's web-component typings
reject `data-testid`, `slot`, `aria-label` and `onClick` across every view, so
turning it on would mean either an allowlist per Ionic component or a wrapper
layer. Recorded here so the next reader can skip the twenty minutes.

**No gate was written.** A draft one existed — a Vitest spec scanning every
`t('…')` literal in `client/src` against the catalogue — and it was deleted
once the compiler turned out to already do it. A second mechanism that can only
agree with the first is not redundancy, it is one more thing to keep true.

**What was left standing was the real gap, and it is a reachability one.**
`AvatarCropModal` (FR-17.13) had no test of any kind: the modal opens only
behind a native file picker, so no Playwright project can reach it, and the
crop math it delegates to (`lib/avatarCrop`) was the only tested half. Its
shell — cover-scale placement, the canvas crop, and _releasing the object URL
on both exits_ — is now a component test. The two leak checks are the point:
`createObjectURL` hands out a reference the browser holds until it is revoked,
which is invisible on screen and shows up only as memory a long session never
returns.

Three things that cost time there, all jsdom-shaped:

- **`IonModal` renders an empty element.** The web component never upgrades
  under jsdom, so the slot content is simply absent — the container is stubbed
  and everything asserted is the component's own markup inside it. The sibling
  sheet tests do not hit this because their components are plain `<section>`
  bodies whose modal chrome lives in the caller.
- **`expand="block"` never reaches the DOM.** It is an Ionic _prop_, so an
  attribute selector matches nothing; the confirm button is found by its label.
- **A false-green the mutation run caught.** The language-switch assertion
  originally rested on the zoom slider's `aria-label` — and _Zoom_ is the same
  word in both catalogues, so a hardcoded English string survives the switch
  untouched. No rendered assertion can tell those apart; the check now rests on
  the two labels that differ, and the zoom line is documented as guarding the
  key rather than the language.

## §3.28: the mark gets built (2026-08-22, FR-28.1–28.11, ADR-021)

The spec was decided on pixels in August and sat unbuilt for five days
(_„§3.28: the packing row gets a mark"_). Building it produced five things
the diff does not say.

**The self-hosted face is about agreement, not availability.** FR-28.6's
stated reason is Local Mode's missing network, which is true and secondary.
The measured reason is that a packing list is _shared_: rendered in the
pinned Playwright image, 🧥 is a **tan trench coat** in the subsetted Noto
face and a **navy peacoat** on both platform faces. Two people looking at
one list would be looking at two different jackets. The weight was measured
before the file was committed rather than after — **80 KB for 103 code
points**, against ~180 KB for the two text faces — because a footprint
argued after the commit is a footprint accepted.

**The index had to be proved against German, and the tests found two
holes.** Four entries carried only the loanword (_Tennis_, _Radio_,
_Basketball_, _Snowboard_), which reads as coverage and is not — a German
inventory never reaches them. Worse, the substring rule was _unproven_: the
minimum-length constant could be mutated from 4 to 1 without reddening
anything, because the test that justified it had been written against a
case I had already removed. The real case is not hypothetical — the letters
_eis_ sit inside **„Reise"**, so without the rule every travel item in the
app would have been offered an ice cube.

**The seed may only speak the index's vocabulary.** The dev seed reached
first for a microscope, a telescope and a beach; none is in the curated
index, so the subset has no glyph and the row renders tofu on a device with
no platform emoji font. That is now a test (`sampleMaster.spec.ts`) rather
than a habit — and it doubles as the honest exercise of the curation: if
the seed cannot say what it wants with a hundred entries, neither can a
user. The seed also marks only **about half** the inventory on purpose. A
seed where every row carries a mark hides exactly what the FR-28.4 ladder
exists to be looked at for.

**A photo bug fell out of the mark's own shape.** The optimistic row for a
master item was rebuilt from a helper that listed name, weight and price
and nothing else, so `updateMasterItem(item, { weight_grams })` wrote a row
with `image_hash: undefined` — and the item lost its reference photo until
the next pull put it back. In Server Mode the pull hides it; **in Local Mode
the optimistic row _is_ the row**, so it was permanent. The mark would have
had the identical shape, which is how it was found: writing the driving test
for „editing a weight must not drop the mark" reddened on the photo too.
The base now carries every column the store keeps.

**The mark is a written hole in invariant 9, and the containment is a gate
rather than a promise.** The mark's colours come from the font, not from
`catppuccin.css`. G-15 says where a mark may appear; what enforces it is
`markRendering.spec.ts`, which reads the `.vue` sources and fails if any
view outside `ItemMark.vue`/`MarkPicker.vue` applies the mark face or
renders an `icon` value as text. That shape is borrowed from the FR-21.7
hex-in-`client/src` rule for the same reason: no rendered test of one
screen can see what the twenty beside it do.

**The budgeted baseline cost did not arrive, and the reason is the whole
argument for G-15.** §3.28 said in writing that a self-hosted emoji face
rewrites every visual baseline, and CLAUDE.md carried that as one of three
things the implementing PR owed. The deliberate `make visual-update` moved
**four of twenty-two**, all M4 — and none of them for the face: the visual
fixture's rows are ad-hoc, so no emoji is painted anywhere in the suite. What
moved was the _held empty slot_, 32 px of column. A face confined to content
is invisible to every screen that has no content of that kind, which is
precisely the containment the invariant-9 exception was granted for. The
prediction was pessimistic in the useful direction, and it is recorded because
the next „this will rewrite everything" should be measured rather than
believed.

**Two things only the rendered pixels said, both after the code was green.**
FR-28.8's fallback rule reads as one sentence — „no mark → no slot, never a
letter" — and is two rules. In a _column_ (M7's list, M3 step 3) dropping the
slot pushed every marked group's name right of the unmarked ones standing
beside it, which is exactly the misalignment FR-28.4's held slot exists to
prevent one screen over. Beside a _single_ name there is no column, so nothing
is the right answer there. The letter is refused everywhere, and that is the
half of the rule that was actually load-bearing.

The second one nearly shipped invisible: **the seed's own trip could not show a
mark at all.** `sampleTrip.ts` imported its rows with an empty merge map, so
every one was ad-hoc — no `source_item_id`, hence no mark and, quietly since
§3.22, no reference photo either. The seed button opens _that_ trip, so a dev
pressing it landed on the one screen the feature is for and saw nothing. It now
links every row the inventory knows by name and leaves the rest ad-hoc on
purpose, because the mixture is what the empty slot is for. Both findings cost
one render each and neither is visible in a diff, which is the whole argument
for the rule that a UI change is looked at rather than reasoned about.

Three harness traps are in `dev-docs/e2e-tests.md` rather than here, but one
belongs with the feature: **M4's composer has two add paths and only one can
inherit a mark.** The suggestion carries `source_item_id`, the free-text
confirm creates an ad-hoc row by design (FR-28.7). The first draft of
E2E-M9-07 added _Zelt_ by free text and asserted its mark — a correct
failure that named a real distinction, and both paths are now in the case.

## The trip partition was never confined to its trip (2026-08-22)

Found by a read-only bug sweep over the whole tree, not by a failure: the
trip push endpoint authorised the trip in its URL and then applied the
mutation by primary key alone. `ApplyMutation` took a `tripID` and used it
only to stamp the `change_log` entry; `loadRow`, `updateRow` and the delete
all ran `WHERE id = ?`. Any member of any trip could name a foreign row id
and rewrite it, delete it, or insert a row carrying someone else's
`trip_id` — across all five trip-partition tables.

**The read half is the worse one, and it is the part that is easy to miss.**
The write is loud; the leak is silent. Because the change_log entry is
written under the _pusher's_ trip, the pusher's very next pull returns
`loadSnapshot` of the foreign row — the full current state of a trip they
are not a member of — while the trip that owns the row gets no entry at all
and therefore never learns anything happened. A stranger could read a
foreign trip's rows one id at a time, and the owners' G-2 stayed green.

**Why nothing looked missing.** The master partition has had the equivalent
check since its first day: `authorizeMaster` resolves `parentIDs(current, m,
"trip_id")` for every trip-scoped master table and checks both the row's
current parent and the one the mutation proposes. The trip partition looked
like it needed no such thing, because its endpoint _names_ the trip — the
authorization was there, it just never reached the row. The asymmetry is the
whole bug: one partition proves the parent, the other assumed it.

Three decisions worth keeping:

- **A refusal, not an error.** The mutation is answered `rejected` rather
  than failing the batch, so it lands on the client's park pile instead of
  taking every mutation behind it hostage (§5). This matters more than it
  looks: the trip partition currently turns _any_ constraint violation into
  a 500, and the outbox treats 5xx as "the server is failing" and retries
  forever — so an errored mutation wedges the whole partition. Rejecting
  through the same door the master partition already uses avoids adding one
  more wedge. (The 500 path itself is still open — a separate fix.)
- **Deletes of rows that no longer exist stay accepted.** They cannot be
  attributed to a trip, because there is no row to read a `trip_id` from,
  but refusing them would break the ordinary idempotent retry: a delete that
  already succeeded is re-pushed after a lost response. It writes nothing,
  so there is nothing to place in the wrong trip.
- **An insert must name its trip.** Previously such a mutation reached the
  `NOT NULL` constraint and failed the batch; it is now a plain rejection.
  The client already sends `trip_id` on every trip-partition insert — checked
  across all of `useMutations.ts`, including the upsert that
  `trip_generated_positions` uses as a create — so no legitimate traffic
  changes shape.

The spec owed a sentence here too. P-3 described the partitions as a
_routing_ rule — which table travels which feed — and nowhere said that a
partition is also a boundary a mutation may not reach across. The rule was
always the intent; it had simply never been written down, which is part of
why the code could omit it without looking wrong.

## Two halves of one refusal path (2026-08-22)

Two findings from the same sweep, fixed together because either one alone
leaves the other's damage in place: the server could not say _rejected_
where it mattered, and the client could not hear it.

**The server half.** `ApplyMutation` returned a constraint violation as an
error, which the handler answers as 500. The master partition had always
translated one into `rejected` (`master.go`); the trip partition never did.
That asymmetry alone would be cosmetic if a 500 were harmless — but §5.1
makes a 5xx the one answer the outbox _keeps retrying_, on the reasonable
theory that a failing server recovers. So the mutation stayed at the head of
its queue and every later mutation for that trip stayed behind it. One row
stopped a trip from syncing, permanently, with G-2 showing an offline count
while the device was online.

What makes it worth an entry is that **none of the three ways to reach it is
a malformed client.** They are the ordinary consequences of two devices and
one roster: a container deleted on device B while A was offline (foreign
key), a quantity cut below what is already packed (the CHECK, reached
through perfectly correct field-level LWW), and a partial upsert landing on
a row that was deleted elsewhere (NOT NULL, because the merge treats a
missing row as an insert). Each one is reproduced as its own case.

**The client half.** `MutationResult.status` — a key no server has ever
sent. The server writes `outcome`, and has since the endpoint existed. So
`parkRejected` filtered on `undefined`, matched nothing, and `forget()` then
deleted the rejected mutation along with the acknowledged ones. Every
refusal was silently discarded, `parkedCount` stayed 0, and the entire B2
parked surface built in #101 has never once run against a real response.

**Why two test suites both missed it.** Each side tested against its own
idea of the envelope: the client's fakes answered `status`, so the parking
tests passed while the production path could not work. That is the failure
mode a contract needs a _shared artefact_ for, not more tests — so
`internal/api/testdata/push_response.json` is now the one document, held on
the Go side by marshalling the real response struct against it and on the
client side by parsing it and driving a real `SyncOutbox` with it. Renaming
a key on either side now fails on that side. Both directions were proved by
mutation before the fix landed.

**The spec was complicit, and that is the part worth remembering.** §5
listed the _values_ — `applied | merged | duplicate | rejected` — and never
named the key they arrive under. A spec that describes a vocabulary without
the envelope leaves each implementation to guess the envelope, and two of
them guessed differently for months. §5 now prints the response document.

## The pull cursor came out of the push (2026-08-22)

`pull_hint.next_cursor` is the highest `change_log.seq` _that push_ wrote.
The client set its pull cursor from it. A pull cursor is an exclusive lower
bound and only ever moves forward, so a device that had been offline came
back, pushed, and then asked for `seq > its-own-newest-write` — stepping
over every row another device had written in the meantime and never being
offered them again. No error, no badge, no conflict: rows that exist on the
server and never on that screen. The same line in reverse: a push whose
mutations all replayed hints `0`, which rewound the cursor to the beginning
and re-pulled the whole partition.

**The e2e case that should have caught this was green against the defect,
and finding out why took longer than the fix.** The obvious case — B writes
a row while A is offline, A reconnects, the row must appear — passes on the
broken build. Logging A's traffic explained it: a reconnect fires three
drains almost simultaneously, each reads the cursor when it _starts_, and
one of them is still holding the pre-push value and pulls the gap by
accident. So the rows do arrive, most of the time, by a race. The damage is
real and the screen cannot witness it.

The assertion therefore moved from the screen to the wire: **every `cursor`
the client sends must be one a _pull_ returned**, 0 until one has. That is
the rule itself rather than one of its symptoms, it is immune to the race,
and a `5` after the server has only ever answered `3` is the whole defect in
one number. 3/3 red without the fix, 3/3 green with it.

Two traps in the harness are worth keeping, because both produced a
confident wrong answer first. A `page.route` observer **has to be installed
before the first request it judges** — the first version started watching
after A was already caught up and flagged a perfectly legal cursor as
invented. And `route.fetch()` **runs outside the browser context, so it
sails straight through `setOffline`**: with the observer installed, the
device never went offline and the case stopped testing anything. Neither
failure looked like a harness bug from the failure message.

Removed on the way past: `SyncOutbox.setCursor`, which had no caller and
whose doc comment (_„from an external source, e.g. WebSocket trip.changed
hint")_ invited exactly the mistake that was just taken out of `drain`.

**What the spec owed.** §5 said the hint exists "so the client immediately
pulls its own canonical state" — true, and read as _pull from here_. It now
says what it is: a signal that a pull is worth making, never the cursor to
make it from.

## An optimistic row is a whole row (2026-08-22)

A trip editor saves a form, not a row, so `updateTrip` sends a partial
upsert — deliberately: an upsert of the whole row would hand back a value
another device changed meanwhile, which is what the field-level merge exists
to avoid. The _optimistic_ row applied locally was built from the same
fields. A store applies a change by replacing the row it holds, so saving a
name dropped `status`, and M2 lists by status: the trip left every segment at
once. In Server Mode the next pull repairs that within a second. In Local
Mode there is no next pull, and the trip is gone.

The rule was already written down — on `masterItemRow`, in a comment that
says _"a field left out is blanked until the next pull puts it back. That is
how editing a weight used to drop the reference photo."_ Twelve call sites
follow it (`{ ...itemRow(item), ...mut.fields }`); two did not. The rule now
sits on `change()` itself, where the row is built, rather than on one of the
helpers a correct call site happens to use.

**Two of the three fields were being lost by tests that said they were
not.** `tripProperties.spec.ts` asserted `year === 2026` under the comment
_"untouched fields stay"_ — and `rowToTrip` defaults a missing `year` to the
current year, which in 2026 is 2026. The assertion held while the field was
dropped, and would have started failing in January 2027 for a reason no one
would have connected to this. It seeds 2031 now. `renameTraveler` dropped
`linked_user_id`, silently un-inviting the account behind a roster row, and
nothing looked at it at all.

**`duration_days` was never a field to keep.** It is a generated column, so
it is not in `syncableColumns` — no pull has ever carried one, and
`rowToTrip` read it off the row and got `null` every time. Every trip that
arrived over the wire had no duration; only the optimistic rows that
computed one by hand looked right. It is derived from the dates in the store
now, which is where a derived value belongs, and the three hand-computed
copies in the orchestrator are gone with it.

**Where the e2e case goes was the decision.** E2E-M22-01 already reopens M4
after an edit and asserts the new name — and it is green against the defect,
because M4 renders the trip perfectly. Only M2 can see the damage. The new
case (E2E-M22-08) asserts the trip on M2's planned list, and is mutation-
proved: red without the fix, green with it.

## M10 was not done, and the test said it was (2026-08-22)

Backlog item 4 had been closed the same day: _„Every screen is on the
catalogue."_ M10 was on it — the creation form, every label, every error. What
nobody had looked at is the half of the screen that **only exists once the item
is saved**: the photo section, _Depends on_, the dependency picker, the
companions list. Four headings, two hints, six controls, all in finished
English, all rendered by a `v-if="!isCreating && item"` that the migration's
pass over the file never entered.

That is worth recording not because a screen was missed but because of **why it
stayed missed for a whole migration**, and the answer is in the test suite.

**The guard was aimed at the wrong thing.** E2E-M10-01 asserts that the
creation form does _not_ show those sections — FR-24.5's "absent, not emptied".
It did that by their words:

```ts
await expect(form.getByText("Photo")).toHaveCount(0);
await expect(form.getByText("Depends on")).toHaveCount(0);
```

Read it as a translator rather than as its author: the day someone renders that
heading as _Foto_, the assertion still passes — and it passes **more** easily,
because now nothing on the page could ever match. A negative assertion written
against a literal does not survive the literal changing; it just stops being
about anything. The case is on test ids now, and its positive half
(E2E-M10-13) asserts the same two sections are _present_ once the item exists,
so an id that quietly stops rendering fails somewhere rather than satisfying
the absence check for free.

**English cannot test English.** The obvious positive case — assert the heading
reads _Photo_ — is worthless here, because that is exactly what the hard-coded
literal produced. `t('items.editor.photo')` and the word `Photo` are the same
pixels; only the _other_ language separates them. The suite pins the app
language to English on purpose (a German device would otherwise flip every
assertion in the suite), so E2E-M10-13 is the one block that seeds `locale:
'de'` — and that seed is the case, not a detail of it.

**The pure domain owned a sentence.** `dependencyCycleError` lives in
`client/src/domain`, which is pure, locale-free and exhaustively unit-tested —
and it returned `` `dependency cycle: ${names.join(' → ')}` ``, a finished
English sentence, straight onto M10's error line. There was no way to translate
that screen without deciding where the words belong. They belong to the screen:
the function now reports `{ reason: 'self' | 'cycle', names }` and M10 words it.
The unit tests got shorter and stopped matching on prose.

**A trap that cost two wrong measurements.** The e2e suite's web server is
`npm run preview` — it serves the **built** bundle, not the sources. A mutation
proof that edits a `.vue` file and re-runs the spec therefore tests the previous
build and reports a cheerful pass. It did, twice, and the second time looked
like a genuinely false-green test rather than a stale artifact. `npm run build`
between mutation and run is not optional, and the same applies to any local
e2e check made after touching client sources.

## The conflict log had two partitions and one query (2026-08-22)

NFR-4.2a promises that every automatic resolution is auditable. The audit
was built, and it covered one of the two sync partitions. `conflict_log`
tells the partitions apart the way `change_log` does — a trip's rows carry
its id, the master partition's carry NULL — and the only query filtered
`WHERE trip_id = ?`. So every master-partition loser was written and read by
nothing: a group renamed on two devices, an item's weight, a series.

**The case that makes it matter is `trips`.** A trip's own fields — name,
dates, year, status — are merged on the _master_ partition, beside the
templates, not in the trip's own. So the conflict a user is most likely to
hit on a shared trip, and most likely to go looking for, was the one the
trip's log structurally could not contain.

Two things were decided rather than discovered. **The rows stay where they
are**: routing a `trips` conflict into that trip's log would have placed one
table's conflicts by their subject and every other table's by their
partition, and `conflict_log.trip_id` would have stopped meaning what
`change_log.trip_id` means. **The master log is filtered per user** through
the same `masterVisible` the master pull uses — a conflict entry names an
entity, and naming one the user cannot see leaks it. That is not a
hypothetical: `trips` in the master partition is visible only to members.

**The sheet's hint was the tell, and it read as helpful.** With no trip
open, G-2's detail said _"The conflict log belongs to a trip — open one to
see it."_ Written when there was one log, it was a sentence that named a log
the user could reach and silently denied the existence of one they could
not. It is two buttons now.

**What the e2e case had to learn.** The losing device cannot be navigated to
by its own trip name — the name is exactly what it lost, so the helper
searched for a row that no longer existed and the case timed out against
correct code. And a trip open drains the _trip_ partition; this rename sits
in the master queue, which moves on the app's next start (B2). The drain is
therefore a reload, not a navigation.

Corrected on the way past: `ListConflicts`' doc comment claimed rows live
"until the trip is archived". No compaction exists; they live as long as the
trip's row does, by `ON DELETE CASCADE`.

## `merged` was a quieter `applied` (2026-08-22)

The push response has carried `conflicts[]` since the protocol was written,
and the client read it in **no code path at all**. `useSyncOutbox` looked at
one outcome, `rejected`, so that it could park it; `merged` fell through the
same branch as `applied` and the mutation left the queue with no record that
anything of it had been dropped. NFR-4.2a's promise — _every automatic
resolution is surfaced so users can audit_ — was met by a log the user had
no reason to suspect existed.

**One toast per push, not per conflict.** A reconnect drains a whole queue,
and a device that was offline through an afternoon can lose fields on a
dozen mutations at once; one toast each is a wall. The count is summed over
the push's results and announced once, and the report carries the partition
so _Ansehen_ opens the log that actually holds the detail rather than
whichever one happened to be reachable.

**The toast tells, the sheet keeps.** A toast reaches someone who was not
looking — which is the whole defect — but it is gone in six seconds, so the
detail sheet carries the same count as a standing line for the session. The
line is deliberately session-scoped: the durable record is the server's log,
and a client-side tally that pretended to be durable would be a second,
worse copy of it.

**Where a test learned the same lesson.** The e2e assertion first sat after
the case's existing M5 steps and passed — comfortably, until you notice it
was racing the toast's own dismissal timer, which is exactly the kind of
"passes on this machine" the timing rule exists to forbid. It is asserted
immediately after the drain now and dismissed by hand, so nothing later
depends on it still being there.

## Field-level LWW was row-level, and "packed always wins" was hiding it (2026-08-22)

Backlog 14 (a) stood as _"`groupDecision` lets any incoming `packed` win regardless of HLC, and
logs no conflict — needs an owner decision: spec or code."_ Asked to investigate the whole
multi-user half before choosing, the investigation changed the question.

**The premise that was wrong.** NFR-4.2a and Sync-API §6 say _field-level_ LWW — "apply f iff
m.hlc > row.updated_hlc(**f-group**)". The store kept **one** `updated_hlc` per row and `Merge`
compared every incoming field against it. The wire was already field-granular (`packItem` sends
`state`/`packed_count`, `assignContainer` sends `container_id`); the granularity was dropped at the
row. So an offline pack at 10:00 lost to a container assigned at 10:30 — and the reason nobody had
seen that is the very branch the backlog item named: `packed` always winning was the compensation,
for that one state. Every other field lost to unrelated later edits, was logged, and was told to no
one.

**Why this mattered for the decision.** "Code follows spec" — narrowing rule 2 to the pair §6
names — would have _removed the compensation and kept the fault_: offline packing would have started
losing to container assignments. "Spec follows code" would have kept silent reversal of deliberate
unpacks and skips. Neither was the real decision; the real one is ADR-022, and both halves ship
together: a clock per field (`field_hlcs` JSON column beside `updated_hlc`), and rule 2 exactly as
narrow as written.

**Two things settled while building, neither visible in the diff.**

- **A default taken at insert time was written then.** The first store test was red for a reason
  the sync tests could not show: the seed insert did not name `state`, so `state` had no clock and
  fell back to the row clock — which an unrelated later edit had moved. `insertRow` stamps every
  column of the table with the insert's clock; the fallback to the row clock is only for rows a
  non-merging path wrote (`trip_members` owner row, the image endpoint, raw seeds), where it is the
  only safe reading.
- **The log names the push and the pusher now.** `conflict_log.mutation_id` groups the fields one
  mutation lost (a revert restores `state` and `packed_count` together or not at all);
  `actor_user_id` is who to tell. `ApplyMutation` therefore takes the acting user, which the master
  partition's apply always had. Neither is read by the client yet — that is the next PR: the push
  response's `conflicts[]`, which nothing reads, and _Wiederherstellen_ on the conflict view.

**A cost accepted.** Two devices that both set `packed` with different clocks log the older as a
conflict whose losing and winning values are equal. Harmless in the audit; the client surface that
follows must compare values before it says "your change lost", or it will say it to people who lost
nothing.

**Mutation proof.** `TestMerge_StalePacked_LosesToLaterStateDecision_AndIsLogged` and
`TestMerge_UnrelatedNewerField_DoesNotDisplaceOlderPack` are each red against the previous
`merge.go` for opposite reasons — the first because `packed` won, the second because the row clock
did. `internal/sync` is at 100 %.

## The sheet's glyph rode half a line high (2026-08-23)

Neither of these was found by reading a diff. Both came out of rendering the
merged conflict-log work at the width the design is drawn at, and both are the
same shape: every written rule honoured, and the pixels still wrong.

**The glyph.** The G-2 sheet's state circle sat 14.5 px above its title.
`.head` was `align-items: flex-start`, which aligned the 38 px circle to the
top of the _title block_ — and the `h1` inside that block carried a 20 px top
margin. Nothing had asked for it: `.jp-sheet-title` names a face, a weight, a
size, a tracking and a leading, and no spacing whatsoever. The 20 px were an
inherited user-agent default the component never reset, so the text began well
below the box the circle was aligned to.

**Two fixes, both built and measured, before either was chosen.** Resetting the
margin is one CSS declaration and lands at **+5.5 px** — better in magnitude,
and now wrong in the other direction, because a 38 px circle and a 29 px line
flush at the top cannot centre on each other. It would also move again the next
time anyone touches the title's size. Giving the glyph and the title their own
row with `align-items: center` lands at **+0.9 px**, half a line's leading,
below any threshold a font renders as a difference — and it has nothing to
re-tune, because the centring is structural rather than numeric. That is the
one that shipped, at a cost worth naming: the ✕ comes down onto the title's
line instead of pinning to the top, and the explanation, no longer squeezed
beside it, wraps one word later.

**The empty state.** The master conflict log's empty state ran from x=0 to the
right edge. The page had copied the house empty state — three screens write
`padding: 48px 24px; text-align: center` — and dropped both declarations. That
survived because the only sentence it ever held fit on one line, and a
shrink-to-fit flex item under `align-items: center` looks centred whether or not
it is. The master log's sentence names three things, wraps, and the second line
made the omission visible. The new string did not cause the defect; it stopped
hiding it.

**What let both live — and the answer the review had to correct.** The first
draft of this entry said the cause was that the G-2 sheet sat in **no visual
baseline**: it is the one surface reachable from every screen in every mode,
and twenty-two baselines rendered none of it. That is true, and it is not the
explanation. Mutating the fix back and running the new baseline against it
**stays green**: the shift is **591 pixels, ratio 0.0018**, and the gate allows
0.002 — it slips under by 67 pixels. The baseline is worth having and is added
here, but it would not have caught this, and a PR that claimed otherwise would
have left the next reader trusting a guard that does not hold.

`playwright.config.ts` already says so, in the owner's own words from
2026-08-19: _"this gate catches layout changes, not small ones"_, with a worked
example of a whole 24 px app-bar icon plus a truncated title passing at 658 px.
The tolerance is loose on purpose, because a gate that cries wolf is worth less
than the miss it prevents. This is a second worked example of the miss that
decision accepted.

So the real cause is simpler and less flattering: **nothing measured it.**
E2E-G2-08 is the guard, and it is the one that reads as its own specification
when it fails — `Expected: <= 2, Received: 14.5`. A baseline says a pixel moved,
and only above a threshold this defect sits below.

**The gates could not have caught either.** `design-tokens-gate.mjs` rejects a
raw colour, a raw type declaration, a raw radius and a raw shadow. A stray
user-agent margin is none of those, and neither is a missing padding. This is
the same lesson invariant 9b already carries from the M4 group card that
painted itself the exact colour of the page behind it: a rule can be satisfied
completely and the result can still be wrong, and only a rendered pixel says so.

## The lock stopped at the row (2026-08-22)

Backlog item 14(d). Three of its four parts were real and are fixed; the
fourth was a premise worth checking before building against it.

**The sheet was the dangerous half.** M4's row wore a padlock and refused
its menu, so the collision G-3 exists to prevent looked handled. But the
row still opened M5 — correctly, since G-3 keeps viewing — and M5 had no
lock awareness at all. Every control there wrote. That is worse than an
unlocked row, because the sheet _confirmed_ the edit: the save indicator
went green, the field showed the new value, and the loss happened later and
elsewhere, at a merge nobody was watching. A defect that shows a success
message is not found by using the app.

**All-or-nothing, and the cost is named.** G-3's wording is "non-interactive
for others except viewing", so the whole sheet goes read-only rather than
the packing block alone — a mode where the quantity is frozen and the
container is not is a third state with no model behind it. The accepted
cost: you cannot leave a note on a row while somebody packs it. Each write
path is guarded in the handler _as well as_ disabled in the template. Both
halves earn their keep: the guard is what a unit test can assert without
depending on how Ionic renders a disabled web component, and the disabled
control is what stops a toggle from flipping and springing back, which
reads as a bug rather than as a rule.

**Naming the holder needed the function that already existed to stop
throwing the answer away.** `isLockedByOther` computed exactly who held a
row and then returned a boolean. It is now `lockHolder`, returning the user
id, with the boolean as its one-line caller — the view resolves the id to a
name, because only it knows the trip's participants. Note the empty string
is a _held_ lock with an unnameable holder, distinct from `null`; a row that
says "somebody is packing this" is right, and one that silently unlocks
because a directory fetch failed is not.

**§7's environment variable had never existed.** The spec decided in so many
words that 15 minutes is "the shipped default, configurable via an
environment variable"; the implementation was `const LOCK_TIMEOUT_MS = 15 *
60 * 1000` in the orchestrator, and nothing else. `JITPACK_LOCK_TIMEOUT` and
`GET /api/v1/config` close it. The endpoint is unauthenticated and
mode-independent on purpose — it carries no per-user data and a Single-User
client needs the window too. A client that cannot reach it keeps the
default, because the window is advisory and a missing answer must leave
neither every row locked forever nor none locked at all.

The vitest case for it is written so it cannot pass by accident: the row
under test is five minutes old, which is stale under the test's 60-second
window and fresh under the built-in default, so a client that ignored the
served value fails rather than agreeing with itself.

**The part that was not a defect.** The item also read "the server neither
expires a lock nor refuses a push for one". §7 promises neither. It makes
the lock advisory: persisted as an ordinary `packing_now` mutation, merged
like any other field, and applied by _clients_ when they decide what to
render. Building refusal would be a different concurrency model — and a
costly one, because it puts a permanent 4xx in front of an offline device
that packed a row somebody claimed after it went offline, which is exactly
the outbox-wedge shape removed days earlier. G-3 is collision _avoidance_;
the net under a real collision is the field-level merge and the conflict
log, which exist. Left as an owner decision rather than built, and the spec
now says so out loud instead of leaving the silence to be read as an
oversight.

**A mutation has to keep the build honest.** Proving the new e2e case can
fail meant rebuilding `dist`, and the first attempt — `if (true) return
null` at the top of `lockHolder` — never got that far: TypeScript treats the
rest of the function as unreachable, drops its narrowing, and `vue-tsc`
fails on code that was correct a moment earlier. A mutation that cannot
compile proves nothing about a test.

## The revert was already half-built, in a column nobody used (2026-08-22)

NFR-4.2a names two verbs in one sentence — audit **and manually revert** —
and the second had never been built. Backlog item 14(e). The work was
planned as "store the losing value, then restore it"; the first half turned
out to be done, and in a way worth recording.

**The schema was already right, and one column of it was dead.**
`conflict_log` has carried `losing_value` since the beginning, and it has
also carried `reverted INTEGER NOT NULL DEFAULT 0` — written by nothing,
read by nothing, present in `schema.sql` and in no Go file. So a change
budgeted as "a schema change, therefore every development database is
deleted" (invariant 2) cost no schema change at all. The lesson is small
and repeatable: **before planning a column, grep for it** — dead schema from
a design that ran ahead of its implementation is cheaper to find than to
re-derive.

**The decision the ADR exists for** is what a revert _means_ when the only
ordering in the system is an HLC. Writing the value back in place, keeping
the row's old clock, is the intuitive answer and it silently does not work:
every device that already pulled the winner holds it under a _newer_ clock,
so the next thing that touches the field re-establishes the winner and the
user's repair evaporates minutes later with nothing to see. A revert is
therefore an ordinary new mutation with a fresh server HLC — it wins by
being newer, not by being special (ADR-022). The cost is accepted openly:
it can be **refused**, which a real undo could not, and the UI needed four
sentences instead of none.

**The trap, and it cost the first implementation.** The store's pool is
capped at one connection on purpose (SQLite has a single writer). The
master-partition revert has to answer "may this user even see this entry?",
and `masterVisible` is right there — so the first version called it inside
the revert's transaction. It does its own `s.db.QueryRowContext`, which
asks the pool for a connection the open transaction is holding. Not an
error: the test run simply never finished. **Any helper that reads through
`s.db` is unusable inside a `BeginTx` block here**, and the ones that take a
`*sql.Tx` are the ones that can be composed. The visibility check moved
above the transaction, where it belongs anyway — it is a read about the
caller, not about the row being written.

**Two things were deliberately not built.** There is no actor on a revert:
`conflict_log` records no one for the losing write either, so a shared trip
still cannot answer "who took this back" — that gap is named in the ADR as
its own revisit trigger rather than papered over with the pusher's id.
And the refusals are **four codes, not one 409**: already reverted, row
deleted, merge rules outrank it, not yours to write. Each is a different
sentence for the reader, and the page renders it on the row rather than as
a snackbar — which on this app lands on the tab bar (FR-9.4).

**Found in this PR's own review: the revert restored half a fact.** The log
lists one row per lost _field_, and the first implementation restored exactly
that field. For `state` and `packed_count` — coupled since FR-5.4, and merged
as one unit by the very algorithm that wrote the entries — that produced
`state = packed` beside `packed_count = 0` on a quantity of five: a row no
screen has a rendering for and no state machine describes. The fix uses the
column #164 had just added for it, `mutation_id`, to find the sibling entries
of the same push, and `sync.GroupedWith` to decide which of them travel
together — the coupling defined once, where the merge already defines it,
rather than a second list in the store that could drift from the first.
Independent fields stay independently revertable; the log lists them apart
because they _are_ apart.

## A backup gave back plans instead of history (2026-08-23)

The owner asked whether templates could be declared in a file and imported, and
then whether trips and templates could live in **one** file as a backup. Both
already existed — the portable YAML (FR-18.1–18.6) and `buildBackup` — so the
work was not building them but finding what they did not carry. Three things,
and the third is the one that made the other two possible.

**Status.** Every imported trip was `planning`, and FR-18.4 said so on purpose:
a file one person hands another should land in your planning list, not
rearrange your trips. For the only copy of a device that is the wrong rule —
thirty-one archived trips restore as thirty-one plans, and the FR-3.14
historical quantities they exist for go with them. ADR-024 weighs the three
ways out; the owner chose one format that always carries and always honours the
status, over a backup-only document kind and over honouring it on the restore
path alone. **The accepted cost is written down rather than smoothed over:** a
trip somebody shares with you can now arrive archived. The rejected middle
option is the interesting one — the same file behaving differently depending on
which button opened it, with nothing on screen saying so, is the kind of rule
nobody can predict and no bug report can describe.

**Tags, ordered.** `item_tags.position` _is_ the order, and position 0 is the
primary tag the grouped inventory files an item under. So the list carries the
primary tag without a second field to name it — and a set, which is what tags
look like at first glance, would carry the same names and lose exactly that.

**`from_inventory`, which is the load-bearing one.** A trip row that came from
the inventory and a row the user typed on the trip are both, in the file, a
name. The first idea was to create a master item for every trip row on restore;
that is faithful for the first kind and wrong for the second — it fills the
inventory with things somebody deliberately kept ad-hoc. Without a marker the
importer has to pick one of two errors, and it had been picking the other one:
a master item that only a trip referenced was dropped, taking its mark and its
tags with it. One boolean is what lets a restore be faithful in both
directions.

**An unknown status is dropped, not refused — and that reversed a decision made
an hour earlier.** The first implementation refused the document, by analogy
with `scope`, which refuses an unknown value. Writing the second implementation
made the analogy fail: a group imported as a Ferien-Vorlage is _structurally_
wrong and corrupts the composition, while an unreadable status is one field
with a correct fallback the reader already supplies. The closer precedent was
`Quantity`, which folds a legacy formula string rather than failing the whole
file. Losing a trip out of a restore to save its lifecycle state is the wrong
trade, so both implementations now drop it. What neither may do is pass the
value on: the schema's CHECK would refuse it, and a failed constraint parks the
whole push and reports a database error where a file problem happened.

**The change falsified a constant two screens away, and only reading the code
found it.** M18 sent the user to M2's _planned_ segment after a restore, and
that literal was correct _because_ every imported trip was planning — its own
comment said so, and it existed to fix a restore that ended on the words "No
active trips". A device of archived history would have landed on an empty
Planned list: the identical failure the constant was introduced to prevent, one
status over. It is derived from the first restored trip now, through a mapping
that lives in the module both screens already share, because `planning` and
_planned_ are the one place the database word and the display word differ.

**A cost of the shape, and the review found I had paid it badly.** Every writer
has to pass the two resolvers. I wired the three I knew about — the device
backup and both single exports — by hand-assembling the same two lines at each,
and left the arguments optional. The review's own mutation is what exposed it:
with all three returning no tags, **the whole unit suite (1237) and the whole
M18 e2e unit stayed green** while the backup lost every tag. Three copies, no
driver, and the exact shape §4.0 of the review skill was written after.

The fix is not a fourth test. `masterStore.portableResolvers()` is one source
with one driving case, and the serializers take the resolvers as **required**
arguments — because a test can only watch the call sites that exist, while the
compiler watches every future one. That distinction paid for itself
immediately: making them required surfaced a **fourth** writer nobody had
wired, the template list's own export, which would have shipped templates
without tags.

**And one mistake worth keeping — which I then repeated.** Mid-way through, a
`git checkout --` meant to undo a deliberate mutation-proof wiped the
orchestrator work along with it, because that work was not committed yet. The
mutation proof is the right habit; doing it against uncommitted code is not.
Commit the green step first, then mutate. Writing that down did not stop me
doing it a second time an hour later, to `masterStore.ts`, in the middle of the
review — which is the more useful half of the lesson: the rule has to be a
habit at the keyboard, not a paragraph in a log.

## A year is a quantity, and that is why M15 could not find its header (2026-08-23)

The owner asked to import a decade of trips out of the family spreadsheet.
Three things stood between the file and the app; only the first is a bug in
the ordinary sense, and it is the one that had been invisible longest.

**`createImportedTrip` never wrote `year`.** `trips.year` is NOT NULL with a
CHECK, so every trip M15 imported came back `rejected` — measured against the
store's own SQLite with exactly the field set the client sends, then measured
again with the year added, which applied. Local Mode has no such constraint
and took the rows, filing a decade of history under the current year.

What let it live for so long is worth more than the fix. M15 had **no e2e
case at all** — four written in the UI-Test-Spec, none implemented — and its
unit tests run against fakes with no schema, so nothing in the suite had ever
seen this mutation meet a database. And the obvious e2e case would not have
caught it either: the optimistic row is in the importing device's own store
before the push, so M2 renders the migration whether or not the wire carried
it. E2E-M15-05 asserts from a second browser context for that reason. The
same shape appears again in the landing segment: the wizard sent the user to
M2's default _Active_ tab while FR-16.2 only ever produces archived trips, so
a successful migration ended on the words "No active trips" — the identical
miss ADR-024 had just fixed on the restore path, in a second screen nobody
thought to look at.

**The premise that had to go: a header row cannot be found by having no
quantities in it, because a year parses as one.** The first implementation of
the header block did exactly that and detected zero header rows on a sheet
whose first row is `2016, 2016, 2017`. A row of years and a row of amounts are
indistinguishable by their cells; what separates them is that a header row
names no item. So the block is counted down the _item_ column — which needs
the item column, which needs the block. The circle is broken with a
provisional guess under the old one-row assumption, and that is honest rather
than clever: the provisional answer only has to be right about which column
holds names, not about where the data starts.

**Two rows of header, and a category column.** The real sheet writes the year
above the trip's name, so the name and the date come from two different rows —
each chosen over the whole block by counting hits across the trip columns,
not per column, because a stray `0` sitting alone in a third header row would
otherwise become one trip's name (it exists in that sheet, and it did). And
the category is a _column_ beside the item, written only where it changes:
under the old rule, which reads a category as a row with no quantities, the
sheet produced four categories, all of them items nobody had ever packed,
while the nineteen real ones were never seen. A detected category column now
suppresses the row suggestions, because with one present that rule stops
meaning "heading" and starts meaning "never packed".

**The cost taken knowingly:** the header block and its two chosen rows are
inferred with no manual override. A misread leaves one stray row as an item,
absorbable only by ticking it as a category row. The alternative — a
"header rows: 1 / 2 / 3" control — is a fourth decision on a step that already
asks for three, paid on every import to protect against a layout not yet seen.
The revisit trigger is written into FR-16.1: the first sheet read wrong.

**And the same process trap for the third time in two days.** A `git checkout --`
to undo a mutation proof also took an uncommitted `data-testid` with it; the
four cases that had just passed went red with "element(s) not found", which
names the symptom and not the cause. The lesson was already written down twice
(see the ADR-024 entry) and writing it down is evidently not what fixes it. What
would: never reach for `checkout --` at all — revert the mutation the same way
it was made, by editing the line back.

Against the owner's actual file the wizard now proposes 29 named trips with
their years, 195 items and the 19 real categories, with the two columns whose
header says nothing left unticked — that last one a deliberate deviation from
FR-16.1's select-all default, since a column that can never validate would
otherwise hold the other thirty hostage.

## Every spec paid for a DOM, and one of them was green for the wrong reason (2026-08-23)

Asked whether this project would be worth developing on a bigger machine, the
answer had to start with a measurement rather than an opinion — and the first
measurement was wrong in a way worth recording, because it is the easy mistake
to make here. A single `npx vitest run` on a cold checkout reported **252 s**,
with `environment` at 483 s cumulative. Both numbers are Vite's dep-prebundling
and transform caches being empty. Warm, and repeated, the suite runs in **88 s**
with `environment` at 166 s. **A one-shot timing of a Vite-based suite measures
the cache, not the suite**; every figure below is the median of load-controlled
interleaved runs.

What the honest number still showed: `environment` was the largest single
component of the run — 166 s cumulative against 14 s of actual test execution —
because `vitest.config.ts` set `environment: 'jsdom'` globally and Vitest builds
a jsdom window per file, at roughly 1.5 s each. Of 114 spec files, **32 need
one**. The other 82 are the pure domain rules (invariant 4), the stores, the
sync layer and the theme assertions, and they were each paying about a second
and a half for a DOM they never touch.

The fix is per-file: the default is `node`, and a spec that needs a window says
so with a `@vitest-environment jsdom` docblock. 88 s → 45 s, with the same 114
files and the same 1251 tests.

**The part that is not mechanical, and the reason this entry exists.** The
obvious way to find the 32 files is to flip the default and keep whatever turns
red. That is very nearly right, and it is wrong in one specific place. Production
code that reads a DOM global defensively does not fail under `node` — it takes
its own error path:

    // useInventoryProperties.ts
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      ...
    } catch { /* ignore */ }

Under `node` there is no `localStorage`, so the `getItem` throws a
`ReferenceError`, the `catch` swallows it, and `inventoryProperties.spec.ts`
**passes** — while testing the ignore-the-failure branch instead of the read-back
branch it was written for. Red tests do not find this. Grep does not find it
either: the spec never mentions a DOM global, its subject does, three imports
away.

What found it was a **coverage diff between the two configurations** — same
suite, run once with `jsdom` everywhere and once with the new per-file split,
compared per file. Total line coverage was identical at 4167; branch coverage
was down by exactly one, in exactly that file. After adding the docblock there,
both totals match the old configuration exactly (4167 lines, 2714 branches),
which is the actual evidence that the change is behaviour-preserving — the green
suite by itself is not, and would not have been.

No gate was added for this. A gate would have to decide whether a spec's
_transitive_ subject touches a DOM global, and the honest versions of that check
are either loose enough to miss the next `try`/`catch` or tight enough to push
most of the 82 files back onto jsdom and undo the change. The trap is written
into `vitest.config.ts` instead, next to the setting that causes it, with the
coverage diff named as the check that catches it.

Left deliberately alone: the 32 jsdom files are not a target to shrink. Several
of them could be rewritten to stub what they need, and the second and a half
each is not worth the loss of a real DOM in a component test.

## The store that already agrees with you (2026-08-23)

The owner asked for the spreadsheet to be imported into the running instance on
`:3000`. It went through: 29 archived trips, 193 items, 19 tags, the sync glyph
green. Then reading the server's own database:

```
item_tags   0
items       193      (the plan had 195)
```

**Every category link had been refused, and two items with it** — after two PRs
that had already fixed two other defects in this same path. All three are the
same shape, and it is worth naming because the shape is what generalises: the
client applies its own mutation optimistically, the server refuses it, and
**nothing on the importing device can tell the difference**. M2 shows the trips.
M9 shows the items. The glyph says synced, truthfully — the outbox _is_ empty,
a refusal empties it too.

- The **year**: `trips.year` is NOT NULL and the mutation omitted it.
- The **tag links**: `item_tags.item_id` is a foreign key and the assignment was
  enqueued _before_ the item's own insert. `commitImport`'s doc comment claimed
  "parents precede children in the queues"; it was describing an intention.
- The **repeated names**: `items` is UNIQUE (name), and the dedup step compares
  the file against the inventory but never against itself. The owner's sheet
  lists "Regenhosen" and "Tele" under two categories each.

Local Mode sees none of them — it skips the outbox, so there is no wire to
refuse anything — and every unit test asserted the client store, which holds
what the client wrote regardless of what the server did with it. That is why
the driving test for the tag order is an assertion about the **push body**
(`item_tags` may not precede its `items` row) rather than about the store, and
why E2E-M15-09 reads the result from a **second browser context**.

**The lesson is not "write more tests".** It is that a green suite and a green
glyph are both compatible with a server that took none of it, and the only
cheap instrument that is not, is a second reader. On this path there are now
three of them: the push-body assertion, the second context, and — the one that
actually found all three — running the thing against a real instance and then
reading the database instead of the screen.

**Two decisions inside the second fix.** A repeated name folds _without_ asking:
within one file it is a listing accident, not two things, and the user has no
second answer to give (unlike FR-16.3's prompt against existing inventory, where
"keep separate" is a real choice). And where two folded rows both carry an amount
for the same trip, the **larger** wins rather than the sum: they describe one
packing, and adding them invents luggage that was never in the car.

## A hidden element is not a small element (2026-08-23)

FR-9.4's last point was a two-number defect: at 430×932 the toast occupied
876–924 and the navigation bar 875–932, so every confirmation in the app was
written across the four tab labels. Ionic has the answer built in —
`positionAnchor` puts a `position: 'bottom'` toast _above_ a named element —
and **five of the nine call sites had already found it**, passing their own
screen's FAB. Four had not. One of the five even carried the comment _„Above
the FAB rather than behind the tab bar"_, which is the shape of a rule that
lives in nine places: it was known, written down, and still missed four times.
So the fix is not an anchor at four more call sites; it is `lib/toast.ts`,
and the choice stops being per screen.

What is worth recording is not that, though. It is that **the same
zero-height box produced two wrong answers in one afternoon**, in opposite
directions.

**First, in the production code.** The obvious implementation is "anchor to
the tab bar if it exists". It exists on every screen but M4 — above 900 px it
is merely `display: none`, because G-9 hands the job to the rail. Ionic
measures the anchor with `getBoundingClientRect()` and computes
`offset -= innerHeight - box.top`; against a zeroed box that subtracts a whole
viewport height and throws the toast off the screen. A hidden bar therefore
has to read as _no bar_, not as a bar of height zero — the helper checks the
measured height rather than the element's presence. Ionic warns about this
(`warnIfAnchorIsHidden`), into a console nobody was reading.

**Then, in the test.** E2E-M22-09 asserts the toast's bottom edge against the
bar's top edge. It failed on the first run — and for the wrong reason: the
Playwright project is Desktop Chrome at 1280 px, where that same
`display: none` bar reports `top: 0`, so the assertion read
`924 <= 0`. Red, convincingly, and about nothing. A hidden element does not
merely measure small: it measures as a point at the origin, and **every**
geometric assertion resolves against it, in whichever direction the operator
happens to point. The case now sets a phone viewport and asserts both boxes
have height _before_ comparing them — the positive signal a negative
assertion needs, applied to geometry rather than to a rendered control.

The one call site left on `toastController` is M4's pack announcement, and
deliberately: it creates, checks a liveness flag, arms its dismiss handler and
only then presents. A helper that presents on creation would put the snackbar
on screen before the check that decides it must not be.

## The importer nobody called, and the exporter behind it (2026-08-23)

Owner decision, taken on rendered evidence: **the portable format has one
implementation, on the client, in both directions.** `internal/portable`,
`Store.ImportTemplate`/`ImportTrip`, `Store.ExportTemplate`/`ExportTrip` and all
four YAML endpoints are gone; the rules moved out of `useSyncOrchestrator.ts`
into `client/src/domain/portableImport.ts`, and the FR-18.7 command is a Node
program over that module. Weighed and rejected in ADR-025: porting the client's
rules into Go behind a shared conformance corpus, and documenting the divergence
as a limitation.

**The premise that was wrong.** I set out to build a CLI on the server's import
endpoints and reviewed the result as a normal PR. The review found two gaps and
called them "inherited, not introduced". They were symptoms. The actual finding
came from doing what the manual says a user does — import, then look — and the
Templates screen said _"No templates yet"_ over a database holding one
Ferien-Vorlage, 18 groups and 182 positions. `appendChangeLog` is called zero
times from `internal/store/export.go`, templates reach a client through no other
route, and the master feed of the running instance held 459 entries with
**zero** `templates` rows. A `curl` import had been writing to a database that
nothing reads.

**What made it invisible for so long.** The Go importer had no caller. Not one:
the client serializes and parses portable YAML itself, so M17, M18, M21 and the
NFR-4.11 backup never touch those endpoints. A second implementation with no
users cannot drift _visibly_ — it can only drift. By the time it was measured it
had lost the trip status (FR-18.4/ADR-024 promise the file's), `packed_count`,
tags, `from_inventory`, `trips.imported` and the whole FR-27.4 refresh state, and
matched item names case-sensitively where the client folds case and accepts a
Levenshtein-2 near match. ADR-008 had decided against exactly this in its second
driver; the decision had simply never been applied to this one path.

**The export half is the same shape, and it only became harmful now.** The
server's exporter writes none of `status`, ordered `tags`, `icon` or
`from_inventory`. While the importer discarded those fields too, a server-to-
server round trip lost nothing you could notice. The moment the importer started
honouring them, exporting a trip from the instance and importing the file back
silently dropped its lifecycle state, its tags and its marks — measured: a trip
exported from `:3000` came back `planning` with zero tag links, while a
hand-written file carrying the same fields landed complete (mark on the item,
`Wassersport` at position 0, `Neopren` at 1, trip `archived`, row linked to the
inventory). **A partial second implementation is not a smaller risk than a full
one; it is a lossier one that hides behind the first.**

**Why the extraction was the precondition, not a tidy-up.** The rules were 450
lines inside a 3600-line Vue composable, interleaved with the outbox, the
optimistic apply and the drain. Nothing outside a browser could reach them,
which is the whole reason a second implementation existed at all. They now take
a `PortableImportEnv` — an inventory view, the mutation factory, and a sink for
each write — and the app and the CLI differ only in the sink. The trap worth
recording: the `master` view has to be **live, not a snapshot**, because the
rules deliberately read their own output back (a group created for document _n_
is found by document _n+1_; the FR-27.4 ledger indexes items the same import
just created). A snapshot would have passed most tests and quietly duplicated
master items across a backup restore.

**One behaviour changed on purpose**, and no test asserted the old one:
`applyTags` used to create a tag through the composable's `createTag`, which
drains immediately, so a restore fired a push per invented tag. In the module it
only emits, and the single end-of-import drain covers it. The import path now
does what the comment beside `assignTagLocally` already claimed it did.

**A detail the Go path never had to face.** Sync-API §9 caps a push at 200
mutations. A real Vorlage is far past that — the maintainer's is 1 template, 18
groups, 182 positions — so the command chunks, reusing the outbox's own
`MAX_PUSH_BATCH`. The server importer never met this because it wrote rows
directly; it is the price of going through the sync path, and it is the right
price.

**What the CSV export cost.** `GET /trips/{id}/export.csv` used the portable
_document_ as its data source, so deleting the exporter broke it. It now has its
own flat query, `Store.TripCSVRows` — which is the honest shape: a spreadsheet
dump and a round-trippable document are different artefacts that were sharing a
loader.

**Two traps of my own, both worth a line.** `jitpackd` falls back to
`jitpack.db` in the working directory when `JITPACK_DB_PATH` is unset; I set
`JITPACK_DB`, so six "fresh" test instances shared one accumulating database and
a duplicate-name refusal read as a phantom defect in the file being imported. A
server that starts happily on the wrong database tells you nothing — the log
line names the port, not the file. And `git add -A` in a worktree where a second
agent was editing swept its in-progress work into an unrelated commit; staging
explicit paths is not pedantry when anything else is writing.

## A claim had no way out (2026-08-23)

G-3's lock was built long ago and the two halves it was missing arrived
this week from another session: the row names its holder, and the detail
sheet — the open window beside the locked door — goes read-only. What was
left is the part a mockup surfaced rather than a bug report: a claim could
only _end_ by packing the row or by ageing out of §7's window.

**The device holding a row is the one device that sees no padlock.** My own
claim never locks the row for me — that is what makes it usable — so the
screen that most needs to say "you are holding this against everyone else"
was the one screen structurally unable to know it. `lockHolder` answers
"locked for me", and the answer for my own claim is null. It took a second
question, `holdsClaim`, to make the row able to say the obvious thing.

**Releasing derives the state rather than remembering it.** The claim
overwrote whatever the row's state was, so there is nothing to restore. But
`packed_count` against `quantity` says the same thing the stepper says, and
that is the rule `incrementPacked` already uses — a release that always
wrote `open` would have thrown away work already in the bag.

**An expired claim does not leave the data.** The §7 window only decides
whether a claim still _counts_; nothing clears `packing_now` but packing or
a release. So a row abandoned mid-pack sits in a state nobody honours,
indefinitely — and before this it did so in silence, becoming operable
again for a reason whoever was waiting for it was never told.

**What the owner decided, and what follows from it.** The lock stays a
client-side courtesy: the server hands out the window over `GET /config`
and enforces nothing. That is not a shortcut — Local Mode has no server at
all, and a rule two of the three modes could keep would not be the same
rule. It does mean the lock cannot stop a determined client, which is fine
for what it is: it saves duplicate work, it does not protect data. The
merge does that.

The variant question the mockup put to the owner — the holder's name in the
row's sub-line versus an avatar in the stepper slot — was answered A, and
was already built that way. What the mockup was actually worth was the two
states nobody had asked about.

## The manual said it, the shipped config did not (2026-08-23)

Presence, the G-3 lock and every live update were absent on the `:3000`
instance, and had been since it was first brought up. The whole app works
without them, which is why it took this long: trips load, pushes apply, the G-2
indicator goes green. Only the WebSocket was refused, and the refusal named its
own cause the moment anybody asked for it:

    request Origin "localhost:3000" is not authorized for Host "localhost"

`websocket.Accept` runs with the library's default options, which authorize an
`Origin` only when its host — **port included** — equals the request's `Host`.
nginx forwarded `proxy_set_header Host $host`, and `$host` is the hostname
_without_ the port. The browser sends `localhost:3000`; the backend was told
`localhost`; every dial was answered `403`.

**The rule was already written down, and the same file broke it.**
`docs/installation.md` has carried "Preserve the browser's `Host` header" as an
explicit requirement of the `/ws` route for as long as the page has existed —
and two screens further down, its copy-paste nginx block sets `Host $host`, as
did the config baked into the published client image. So the documentation was
not missing, incomplete or out of date. It was correct in prose and wrong in the
two places an operator actually copies from, which is a shape worth naming: a
requirement stated in one register and contradicted in another reads as
consistent to everyone who only ever reads one of them.

**The verification step could not fail.** The same page ends with a `curl` that
proves the `/ws` route reaches the backend, and it sent no `Origin` header. The
same-origin check is skipped entirely when the header is absent, so that command
answered `101` against exactly the broken proxy it existed to detect. It now
sends the header, and `docs/getting-started.md` gained the same check, because
the four-step stack it describes _is_ the stack this was found on.

**Why the guard is a gate and not a test.** The defect lives in a config file:
no Go test loads it, Playwright drives `npm run preview` rather than nginx, and
the `docker-build` job builds the image without ever making a request through
it. Two Go cases now pin the _server_ contract — a port-carrying `Origin` is
accepted when `Host` matches, and refused when a proxy strips the port — but
they were green before this work and would have stayed green forever, because
the server was never the thing that was wrong. `scripts/proxy-host-gate.mjs`
holds every nginx sample in the repository, the manual's fenced blocks included,
to `$http_host`; it is the fourth gate written for the same reason as the other
three, which is a claim a document makes about itself that nothing checks.

**One option was weighed and rejected**, because it is the first thing anybody
reaches for when a handshake answers `403`: giving the server an allow-list —
`websocket.AcceptOptions.OriginPatterns` behind a `JITPACK_ALLOWED_ORIGINS`
variable. It was not taken. It would have made a correct check configurable in
order to accommodate a proxy that was misconfigured by us, and it would have
put the operator in charge of a security boundary to work around a one-word
edit in our own file. If a deployment ever genuinely needs an origin that is
not its own host, that is when the variable earns its place.

Measured on the running stack rather than reasoned about: `403` with the message
above before, `101 Switching Protocols` after reloading nginx with the fixed
config, REST unaffected in both directions.

## The wire was described twice, and the second description was fiction (2026-08-23)

NFR-4.14, ADR-026. The owner asked for clean backend APIs that the frontend
actually consumes. The first move was to measure rather than assume, and the
measurement split cleanly in two: the error **envelope** was already uniform —
`writeError` at 90 production call sites, **zero** handlers writing a bare error
status, and `APIRequestError` parsing exactly that shape — while everything
around it was two independent descriptions of one wire.

**What the second description had already cost, before this work started:** the
three defects of one week, each found by hand and each invisible to both suites
(the client read a `status` key no server sends; it took `pull_hint.next_cursor`
as its pull cursor; one partition answered `500` where the other answered
`rejected`). What is worth recording is _why_ the tests could not see them. A
fake written from the same wrong mental model as the code agrees with it
perfectly. `pushContract.spec.ts` and its shared fixture were added after the
first defect precisely to break that symmetry — and they only cover the push
response, so the other two walked past them.

**Two more of the same shape surfaced the moment the mechanism ran**, which is
the strongest evidence for it: the client's `ConflictEntry` had never grown
`mutation_id` and `actor_user_id`, added to the server's copy by ADR-022 — so
the fields ADR-022 exists to expose were on the wire and read by nothing. And
`PresenceUser` was a second hand-written spelling of `PresenceMember`. Neither
had a test that could fail; both were three-line fixes once the compiler could
see them.

**The generated types are more truthful than the hand-written ones were, and
that hurt in a useful way.** A nil Go map or pointer marshals to `null`, so
`row` and the WebSocket `payload` are `| null`, and `vue-tsc` immediately
rejected eight call sites that indexed a payload without checking plus six that
passed a possibly-null row into a parameter typed `| undefined`. Every one of
them was a real (if unlikely) crash the old `Record<string, any>` had hidden.
The hand-written type had not been wrong by accident — it had been _convenient_,
which is the same thing arriving later.

**Two decisions inside the mechanism worth keeping.**

_The generator parses the source; it does not reflect over the types._ Doc
comments and the constants of an enum are part of the contract, and neither
survives into a runtime type. Parsing gets both, keeps `internal/wiregen` a leaf
that imports nothing of the application, and makes it a pure function of
`(filename, src)` — so its behaviour is table-tested with no filesystem at all.

_The gate generates beside the tree, never over it._ The first version ran the
real generator and asked `git diff --quiet`, which is wrong in a way that looks
right: it fails on any uncommitted change to the target, including the correct
one you are about to commit, and it rewrites the very file it is judging. It now
writes to a temp file and diffs. **Mutation-proved**: adding a field to
`wire.go` turns it red and names the field; removing it again turns it green.

**The one trap this leaves behind.** The generated file lives under
`client/src`, where prettier and eslint run over it. If the generator's output
is not _already_ formatted, `make fmt` rewrites it and the gate fails on a file
nobody edited — a self-inflicted flake that would be maddening to diagnose. The
generator therefore wraps unions at the client's print width and emits exactly
one trailing newline, and two tests pin both. `client/.prettierrc.json` is now a
file the Go side depends on; if its print width changes, `wiregen` follows.

**What was deliberately not built,** so the next reader does not mistake it for
an oversight: the NFR's third point, the route shapes. `export.csv`/`export.yaml`
put the format in the path, `/templates/{id}/export` does not, `/export/full` is
a third form, and conflicts are `/trips/{id}/conflicts` in one partition and
`/conflicts/master` in the other. Renaming them touches client, Vitest, e2e and
`docs/` while fixing no known defect, so it is its own change (owner,
2026-08-23). The gate also covers only what `wire.go` declares — the admin,
notification, config and auth responses are still typed by hand on both sides,
and growing the file is how they join.

## A conflict is an overwrite, not a lost race (2026-08-23)

Two merged PRs — #160, which made master-partition conflicts reachable, and
#166, which added the manual revert — had never been looked at on a screen. The
eyeball was the last debt from that pair, and the way to pay it was to produce
real conflicts on the `:3000` instance: six pushes with hand-built HLCs, a
second device losing a race the server actually judged. The first row the screen
rendered was

```
trips · year        2026 → 2026        REVERT
```

**What the merge was comparing.** Rule 3 is last-write-wins by clock, and the
implementation read that literally: every field of a losing push was dropped and
every dropped field became a `conflict_log` row. But _losing the write_ and
_having a value overwritten_ are different events, and only the second one has
anything to audit or revert. A push that carried a field along unchanged left
the row holding exactly what that push wanted.

That is not a hypothetical shape. The client is careful and sends narrow
mutations, but not single-field ones: `updateTrip` writes `start_date` and
`end_date` together, so moving a departure date and losing the race logs a
phantom conflict on the return date. The demo made it obvious because a
hand-built push carries the whole row, but the client's own coupled pairs
produce the same entry.

**The half that reaches the user.** The outcome is derived from the conflict
count, so a push that changed nothing came back `merged` instead of `applied` —
and since PR #163 the client _announces_ `merged` as a toast naming how many
fields were overwritten. A correct, uncontested edit could therefore tell
someone their work had been overwritten. The audit noise was the visible defect;
this was the expensive one.

**Where the difficulty actually was.** Not in deciding the rule — in comparing
the two values at all. They arrive from different type systems and meet nowhere
else: a mutation's fields are decoded from the push envelope's JSON, so every
number is a `float64` and a boolean is a `bool`; the row's fields are scanned
out of SQLite, where the same number is an `int64` and the same boolean is `0`
or `1`. A `==` between them is false for every pair that is in fact equal, which
would have left the defect in place while the tests read as if it were fixed.
`sameValue` therefore widens both sides before comparing, and is conservative
where it cannot: a value that is neither numeric, textual nor null is reported
as _different_, so an unforeseen shape keeps logging a conflict rather than
silently swallowing one.

The unit table covers the type pairs, but the test that would have caught a
wrong widening is the store one: it builds its mutation fields by decoding real
JSON and pushes them through `ApplyMutation` against real SQLite, because that
is the only place the two type systems meet. Written with Go literals on both
sides, it would have passed against the unfixed code.

**Two things worth keeping.** A feature can be built, reviewed, merged and
covered by a green suite while its first screenful is nonsense — the defect was
in `internal/sync`, the most heavily tested package in the repo, at ≥90 %
coverage, and every one of those tests asserted on values that _did_ differ.
And the eyeball is not a formality at the end of a feature: this one was
outstanding for a day, and it took about a minute to find something two review
passes had not.

**Left standing on purpose:** three smaller findings from the same render, all
of them in `ConflictLogPage.vue` and none of them in this diff — the values are
displayed with the JSON quotes still on them, the row names a table and a column
(`trips · name`) rather than the trip, and the timestamp uses
`toLocaleString()` with no locale, so it renders in American in a de-CH app
(NFR-4.12). They are one UI change with its own spec and Playwright case, and
folding them into a merge-algorithm fix would have made both harder to review.

## The conflict log was showing the wire (2026-08-24)

The three findings the previous entry parked, and a fourth that only the
rendered trip log had. The log is the one screen whose entire job is to be
read, and it was rendering storage: `trips · name` for the table and column,
`"Sardinien"` with the JSON quotes the merge stored it in, `1` for a flag,
`8/22/2026` for a timestamp in an app the user set to German — and, on the
trip partition, `b34e91b… → b8439760…` where two travelers belong.

**The e2e case for that last one was green, and it says why in its own
comment.** It asserted the two values were `not.toBeEmpty()`, with a note that
_which_ string they were "is not this case's business". A pair of raw uuids
satisfies that exactly. The other one used `toContainText` for a name, and
`"Engadin 7 B"` contains `Engadin 7 B` — so the assertion was green against
precisely the quoted form it looked like it was catching. Both are the same
mistake: an assertion written to be robust against detail, on a screen where
the detail _is_ the behaviour.

**What is deliberately not resolved**, because saying less beats saying
something untrue: a row this device cannot name — deleted since, never pulled,
or in a partition it has not loaded — falls back to the _kind_ of thing
(`Item`) or to the raw id, rather than to a guess; and a column with no word in
the catalogue keeps its own name. `image_hash` reads worse than "Photo" and
never reads wrong.

**Where the naming lives, and why it is not in `client/src/domain`.** The value
decoder is (`conflictValues.ts`) — it is a rule with edge cases, and it is
unit-tested as one. The table→store lookup is not: it is one switch over the
two stores the page already injects, and moving it behind an eight-method
lookup interface would have produced a module whose only content is the
indirection. It is driven by the component spec instead, against real Pinia
stores, which is the surface it actually serves.

**No visual baseline moved**, because the conflict log is in none — the G-2
_sheet_ is (E2E-VIS-08), the log it leads to is not.

## A route names its scope first (2026-08-24)

NFR-4.14's third point, kept out of ADR-026 on purpose so a mechanical rename
would not travel with the mechanism it would be confused for. ADR-027 has the
options and the matrix; what follows is what the diff cannot say.

**The complaint had gone stale, and acting on it as written would have been
wrong.** Backlog item 16 named four disagreeing export shapes — `export.csv`,
`export.yaml`, `/templates/{id}/export`, `/export/full`. Two of them had not
existed since the day before: ADR-025 deleted the YAML endpoints along with the
server's half of the portable format. A requirement written on Monday describes
Monday's code, and this one was three weeks old at a week's velocity. Measuring
the surface first turned a four-way disagreement into a two-way one and changed
which rule was worth choosing.

**The widening, and why it was asked rather than assumed.** The point named the
conflict and export paths. It did not name `/sync/master` and
`/sync/trips/{id}` — which lead with the channel where the rest of the surface
leads with the scope. Leaving them would have made the rule _"scope first,
except the sync channel"_, and an exception is the thing that has to be
memorised, which is precisely what the requirement exists to remove. It is also
the hottest path in the application and the largest single blast radius in the
tree (64 references, 29 files), so it was put to the owner as a decision with
its cost rather than folded in quietly. Answer: pull it along, one rule, no
exception.

**A router's 404 and a handler's 404 are the same status, and that made the
first test green for the wrong reason.** The test that proves a rename is not an
alias asserts the old paths are gone. Written against the status code, it passed
immediately on `POST /conflicts/master/{id}/revert` — not because the route had
been renamed, but because the conflict id in the fixture does not exist and the
handler answers 404 too. The same confusion had the _positive_ table calling a
routed path unrouted. The discriminator is the body: `writeError` writes the
`APIError` envelope, and `http.ServeMux` writes plain text. Worth remembering
beyond this file — **any test that asserts "this endpoint is gone" by status
alone is asserting nothing about routing** wherever the handler can answer the
same code.

**What typing forty string literals found.** The client's paths moved into
`client/src/api/routes.ts` (§4a) — not required by the rename, but the rename is
what proved the cost of their absence. `SyncOutbox.syncPath` takes an id that is
nullable because the master partition has none; a _trip_ partition without one
had been interpolating as the literal string `null` and pushing to
`/api/v1/sync/trips/null`, a path the server answers 404 and the outbox retries
forever, naming nothing in either place. A template literal accepted it in
silence for as long as the code has existed. A typed builder did not compile.
The guard and its three cases were the only production behaviour change in a PR
that is otherwise a rename.

**Two smaller traps, both in the test tree.** The e2e interception
`'**/api/v1/sync/**'` no longer matches anything now that the scope leads — a
glob that matches nothing makes an interception test pass by intercepting
nothing, so it became a regex naming both partitions. And beside it,
`areq` — an array collecting every sync request the page made, asserted by no
line in the file. It was deleted rather than updated: an observation nothing
reads is not coverage, and rewriting it would have made it look like coverage.

**A formatter has a scope, and mine was wider than the project's.** `npm run
format` covers `client/src`. Running prettier over `client/e2e` as well
reformatted three spec files this change has no business touching, and the
churn was only visible because `git status` listed files no sweep had reported.
Reverted. The lesson is cheap but recurring: **run the project's format command,
not prettier with a path you chose.**

## The gate protected what the file happened to declare (2026-08-24)

ADR-026 built the mechanism and said, in its own cons, that it covered the
shapes the client consumed rather than all forty routes: the admin,
notification, config and auth responses were still hand-typed at both ends.
This closes that. The eleven types are mechanical; what follows is not.

**Adding types would not have been the fix.** Eleven declarations plus eleven
handler edits leaves the _next_ response free to be a map literal again, and
the reason the four families were outside the contract in the first place is
that nothing said they had to be inside it. So the change is a check first and
types second: `TestEveryResponseBodyIsADeclaredType` parses `internal/api`'s
own source and fails on a composite map literal handed to `writeJSON` or to a
`json.NewEncoder(w).Encode`. Run against `main` it named twelve call sites
across six files — which is also how the work list was found rather than
guessed.

**The check has a blind spot, and the handler that motivated the whole change
was sitting in it.** The AST sees literals, not types, so
`writeJSON(w, prefs)` — a `map[string]bool` handed straight through from the
store — passed silently. Two ways out were weighed. Going to `go/types` would
see it, at the cost of a type-checked build inside a test and an importer to
keep working. The cheaper one, taken: state the limit in the test's own doc
comment and close _that_ case positively, with
`TestWire_NotificationPrefsNamesEveryKindTheStoreKnows` — it reflects over the
wire struct's JSON tags and compares them to `store.NotificationKinds()`. That
buys something the AST check never could: a fourth notification kind added to
the store now fails the build, where before it would have been persisted,
honoured server-side, and invisible on the wire. **A gate that overstates its
reach is worse than one that names its limit**, and the limit is written where
the next reader will be.

**A request body is not a response body.** The preference endpoint's _request_
stays an untyped `map[string]bool` and the check is written so it does not
object. An absent key there means _leave that kind enabled_ (UI-Spec M17), and
a struct with three booleans would decode the absence as `false` and switch the
kind off — a silent behaviour change wearing the costume of a type improvement.
The rule is about what the server _promises_, and only the response is a
promise.

**What the sweep found, and what it deliberately did not change.** One drift,
the same shape as the five before it: a notification's `payload` is nullable,
because a nil map marshals to `null`, and the client's hand-written copy said
otherwise while both readers indexed it directly. Two Vitest cases now assert
against a null payload, and reverting the guard turns both red. What did _not_
change is the wire: the JSON tag multiset gained the thirteen names that had
only lived inside map literals and lost none — measured with a script over
both revisions rather than asserted — so the only observable difference is key
_order_, since a map encodes sorted and a struct encodes in field order. That
was worth checking precisely because it is the kind of claim that is easy to
make and easy to be wrong about.

## A path stopped being written twice (2026-08-24)

ADR-027 left one thing open and wrote down when to close it: _"if a rename ever
lands on one side without the other"_. That trigger was discharged without
waiting for it, on the owner's request, and the reasoning is worth keeping
because it applies to any trigger of that shape. The thing being waited for is a
defect reaching a user — a strange event to schedule — and the cost of the fix
only rises, because every new call site is another edit. Driver 3 of the ADR
already said as much about the rename itself: there is no released version and
no third-party consumer, so this is the cheapest this will ever be.

**What it changed.** `internal/api/wire.go` declares all 29 paths as `Route*`
constants and the five path variables as `Path*` constants. The mux registers
from those constants — the _method_ stays at the registration, because a path is
shared with the client and a method is not — and `cmd/wiregen` writes
`client/src/api/routes.ts` from the same declaration. A path with no placeholder
generates a string; one with placeholders generates a function whose parameters
_are_ the placeholder names, so `PathTripID` is the same identifier in the
pattern, in the builder's signature and at `r.PathValue`.

**The rule was written as tests, and each was proved by breaking it.** That is
the same pattern as the wire-coverage work the day before: `TestNoRouteIsRegisteredFromALiteral`
run against the old code named all 36 registrations, which was the work list.
Beside it, `TestEveryDeclaredRouteIsRouted` (a declared path the mux does not
serve — it probes `GET` on every route, because a registered path answering the
wrong method is a 405, and only an _unrouted_ path is a plain 404),
`TestNoPathValueIsReadFromALiteral` and `TestEveryPlaceholderIsADeclaredPathParam`.

**Two things deliberately not done.**

The version prefix is spelled out on all 29 lines rather than concatenated from
an `apiV1` constant. That reads like a §4a violation and was weighed as one. It
was rejected because the block is a _table_: a reader checking a path against
the Sync-API-Spec should be able to read it, not assemble it, and the change it
protects against — `/api/v2` — is one pass over one block, not a hunt across
files. The generator would also have had to evaluate constant expressions, and
so would the test that reads the declaration, which is real complexity bought
for a cosmetic gain.

`client/src/api/__tests__/routes.spec.ts` stays, although the gate now makes
disagreement between the two files impossible. What it still holds is the
_values_: with nothing pinning them, a rename in the contract would arrive in
the client as a silently regenerated file. A pin turns that into a red test —
which is the difference between a change being made and a change being decided.

**The trap the generator carries.** `client/src/api/routes.ts` is generated
_and_ formatted by prettier along with the rest of `client/src`, so the
generator has to emit prettier's own line breaks — for a builder too long to fit
beside its signature, a break after the `=>` and a four-space indent. Get it
wrong and `make fmt` rewrites the file, the drift gate then reports a mismatch,
and the failure names a file nobody edited. The existing generator had already
met this with long enum unions; the route builders are the second case, and it
is now asserted directly: no line in the generated module exceeds the client's
print width.

**A small cost paid on purpose.** Two client keys were renamed — `tripExportCsv`
became `tripExportCSV` and `pushVapidKey` became `pushVAPIDKey` — because the
key is now derived from the Go constant, and Go names an initialism in full.
Deriving mechanically and accepting two renames is cheaper than a mapping table
that would need a decision per route forever.

## A claim stops having a lifetime (2026-08-24)

FR-5.7, ADR-028, backlog 17. Two days earlier a claim had gained a way to
_end_ — the holder could release it — and the other way out was still §7's
15-minute staleness window, applied by every client and enforced by none. The
owner's decision removed the window entirely: a claim is claimed until a
person ends it, and everyone else's way past it is to **take it over**.

**The middle option was the expensive one, and nothing had priced it.** Three
shapes were on the table: a claim that only a person can end, a claim that
expires silently (what existed), and a claim that expires _and announces the
expiry_. The third reads as the compromise — it removes the silence, which is
the worst property of the second, while keeping the unattended clearing, which
is its best. It lost because announcing an expiry needs the **server** to
notice one, and expiry is the one event no request causes: that is what makes
it an expiry. So it needs periodic work, and `jitpackd` has exactly one
goroutine — the listener. There is no scheduler, no ticker, no job runner to
extend. Once the notification, the M17 toggle and the record are paid for —
and all three are the same in both options — the clock is no longer buying
cheapness. It is only buying the ability to decide, badly, on the holder's
behalf. Fifteen minutes is not a statement about whether somebody is still in
the cellar looking for the tent.

**The takeover is the one lock action with no optimistic write.** Everything
else the client does to a row goes through the outbox and repaints
immediately. This does not, and deliberately: the server can refuse — the
holder may have packed or released the row while the confirmation was open —
and a refusal would then have to be undone on screen. A taker who waits a
moment for the answer is strictly better than a taker shown a claim they do
not hold, which is the one outcome that would make the lock worse than no lock
at all. The row arrives by the drain, like any other server-originated change.

**It has no reachable Playwright case, and that is structural.** The `single`
project runs two browser contexts against a Single-User backend, which is how
E2E-G3-03 covers a foreign claim: B never claimed the row, so B's client
treats the claim as foreign. That trick does not extend here. Both contexts
are the _same identity_, so a takeover from one to the other is a takeover of
one's own claim — which the server refuses by design, and correctly.
Seeding tokens would not help: the backend stamps its single user either way.
E2E-G3-02 therefore asserts the half that is reachable and is a real promise
of its own — the G-8 gate, that where there is no second account the claimed
row offers nothing at all rather than an action that would be refused. The
taking-over path waits for the mock-IdP `server` project, at exactly the wall
E2E-G3-01's identity half has been standing at. Worth saying plainly rather
than leaving a green suite to imply otherwise: the mechanism is covered by Go
API tests and orchestrator units, and the _screen_ is not.

**Two days of work was deleted rather than adapted.** The window had just been
made per-instance — `JITPACK_LOCK_TIMEOUT`, `lock_timeout_seconds`,
`GET /api/v1/config` to serve it, a client freshness test, and the yellow row
line that said a claim had aged out. All of it went. `GET /api/v1/config`
served nothing else, so the endpoint went too. The alternative was keeping a
window that no longer decides anything, which is two rules for one question.
The one thing that was _inverted_ rather than deleted is the vitest case that
asserted a 20-minute-old claim stops locking its row: it now asserts the
opposite, so the rule that replaced the window has a driving test instead of
leaving a hole where the old one was.

## A second account arrives, and finds a claim nobody could revoke (2026-08-24)

MVP-plan Track B step 2, the last piece of the plan's Blocker B3 that was
still open: `single` proved the wire, and nothing proved _identity_. The
harness is ADR-029 and the coverage — including what it deliberately leaves
uncovered — is in `dev-docs/e2e-tests.md`. What follows is only what neither
of those files can show.

**A real Authelia was the option to beat, and it lost on things that are not
about correctness.** It covers strictly more than a fixture does: the
provider's own quirks, its consent step, its refresh asymmetry for disabled
accounts. What sank it is that the suite already runs _inside_ the pinned
Playwright image, so the reference provider arrives as a nested container, a
third hand-bumped digest (invariant 8), and a configuration surface —
sessions, storage, notifier, a users file — that is a second product to
keep. Against a project that runs in 27 s, that is a large bill for
behaviour the manual pre-release check against the family instance already
covers. The bill is not waved away: ADR-029 writes down that an
Authelia-specific defect still ships green, and where it gets paid instead.

**The two processes have an order, and the order is the design.** jitpackd
resolves OIDC discovery at start-up and exits when the issuer does not
answer — which is correct, and it means an IdP that loses the boot race
produces a dead backend and a suite reporting a missing health endpoint. Two
Playwright `webServer` entries would have raced. One launcher that starts
the IdP, waits for `listening`, and only then spawns the server has no race
to lose and nothing to poll. The same reasoning put the `server` project on
its own `vite preview`: the client reaches its backend same-origin, and the
Single-User instance is a different process with a mutually exclusive
configuration, so one preview could not front both.

**The defect it found is the one the project was built to find.** Bob takes
Alice's row over; Alice's toast says so; Alice's row goes on saying _„You are
packing this — the others cannot change it"_, still fully interactive. Two
people can now pack the tent, which is the failure FR-5.3 exists to prevent,
and every layer below the screen was green: the Go tests move the claim, the
orchestrator units refuse to write it optimistically, the notification
arrives. The gap was that a claim is a **device** flag (`myLocks`) — it has
to be, because Local and Single-User Mode have no second account to compare
against — and nothing could revoke it, since `lockHolder` returned `null` for
anything in that set unconditionally and the WS handler ignored
`item.locked` for those rows outright. It took a second identity to make the
absence visible, which is exactly why it survived two rounds of work on G-3
and one on FR-5.7.

**The identity could not come from where the client keeps its token.** The
obvious source is `config.getToken`, which the rest of the orchestrator
uses — and in the running app that is `refresher.freshToken()`, a promise,
because it may refresh mid-flight. A lock decision is made while rendering a
row, so it cannot await anything. The answer is the _stored_ session's
subject, read synchronously, behind an injectable seam so the unit cases can
name an account without minting a token. It is `null` in Local and
Single-User Mode by construction, and that is the load-bearing part: the
device rule has to stand alone in exactly those two modes, where there is
one account and two devices.

One trap worth the line it costs: the first version of the fix read the
optimistic claim's `current-user` placeholder (invariant 3 — the server
stamps the real actor later) as a foreign account, and revoked every claim
the instant it was made. A vitest case caught it immediately; without it the
feature would have shipped as _„the row never says it is mine"_, which no
e2e case in the suite was asserting.

## A trip could be judged only one row at a time (2026-08-24)

FR-9.3, FR-9.4, backlog 15. _Missing_ had always stamped itself as a
by-product of adding a row; _unused_ cost three taps into a fold called
_Details_ that nothing ever asked for — and _unused_ is the input the M14
assistant is built around, so the assistant ran on an empty set. The decisions
were all made before the branch opened: the judgement joins the row's menu, a
skippable pass covers the packed rows at archive time, and the pass is a mode
of M4 whose _Fertig_ archives and opens M14. What building it added is below.

**"One posture, one question" priced one affordance and there were five.** The
FR names the cost precisely — inside the pass the row's press-and-hold goes
inert — and that is the cost it names. Rendered, the posture also carried the
quick-add row, the ＋ FAB, the _„3 gepackte zeigen"_ reveal bar, and an app-bar
cluster still offering _Reise bearbeiten_ and _Reise abschliessen_: the archive
action, offered from inside the room it opens. None of that is wrong in M4's
ordinary posture, and none of it survives the question this posture asks. What
stayed is what the FR chose the mode _for_: the grouping, the FR-25.11 facets
and the search. The rule the list needed was not "hide the controls" but "a
screen asking one question offers nothing that answers another", and only the
render produces the inventory of what those are.

**A handled proposal became a record line, not a dimmed card.** FR-27.11
settled that applied and skipped rows stay visible and marked; FR-9.4 settled
that they leave _Offen_. Neither says what they should look like once they
arrive under _Erledigt_, and the obvious answer — the same card at 55 %
opacity — keeps a target picker, a peek chevron and a blast-radius line for a
decision already made. They are now one line: kind, item, target group,
outcome. The block is a record of the pass, not a second workspace, and the
distinction is what lets _Erledigt_ hold twenty rows without becoming the
screen.

**The pass's control was wrong twice, and rendering said so both times.** It
started as an `IonCheckbox`, which is M4's _packed_ idiom — sitting, in the
pass, beside rows whose subtitle reads „packed · today". Worse, Ionic's
checkbox keeps its own checked state: the first tap wrote the flag and left the
box unfilled, so the screen and the row disagreed from the very first
interaction. It is now a button that renders straight off `flag_unused`. The
second correction was mine and not the code's: I read the replacement's marked
and unmarked states off a downscaled screenshot, decided they looked identical,
and was about to change the colour — the computed values were `#cba6f7` against
`#6c7086`, which is exactly the distinction that was intended. A rendered pixel
answers a question about rendered pixels; an _impression_ of one does not.

## The restore could be run twice, and the manual said it could not (2026-08-24)

**What changed:** an imported document is a second copy of something this
instance already holds when their **names** match — plus the **year**, for a
trip (ADR-030). An import that finds one writes nothing at all and reports what
was there; M18 marks the document in the restore list _before_ the button is
pressed, the commit counts what it left alone, and `jitpack-import` says it per
document and in its summary, `--dry-run` included.

**The premise that was already written down as true.** `docs/backup.md` said,
of a restore onto a device that still has data, that everything is "matched to
what already exists **by name**, so restoring onto a device that still has data
merges rather than duplicates". That was the rule for items, for tags and for
groups, and it had been generalised in prose to the whole file. Trips had never
had it: restoring a 33-trip backup twice produced 66 trips, quietly, with the
first 33 still on screen. The page was not lying about behaviour anybody had
decided against — it was describing a rule that only covered part of what the
file contains, which is the harder kind of documentation error to see, because
every sentence around it is true.

**Why not a UNIQUE constraint, which is what a database is for.** It scored
worst of the four options considered, and the reason is not the schema
freeze (invariant 2), which is only a timing problem. It is that a refused
mutation **parks the outbox**: the queue is ordered, a rejected write stays at
its head, and every later write on that device waits behind it. That failure
mode was found on 2026-08-22 and fixed once already. Trading a duplicated trip
for a wedged device is a bad trade, and the constraint would additionally turn
two people creating _Samedan 2027_ on two phones — ordinary concurrent use,
which LWW exists to settle — into a hard error. The other two options fail
more simply: a `(import)` suffix labels the duplication instead of preventing
it, and a row-level merge cannot tell "add what is missing" from "undo what the
user deleted".

**Trips are in the master partition and not in the master store.** The import
rules read the instance through a view called `master`, and the CLI carried a
comment saying a trip's own rows are "written, never matched against" — true
until this rule needed to match against them. The `trips` table lives in the
master _partition_ but belongs to the _trip_ store, so nothing that held the
view could see them. The view now names `tripList` explicitly and both call
sites assemble it through getters rather than a snapshot: the rules read their
own output back between documents, so a trip created by document 12 has to be
visible to document 13 in the same file.

**A decision reversed by a measurement rather than an argument.** The rule was
written for trips alone, because ADR-017 had explicitly declined to extend the
group's link-by-name identity to Ferien-Vorlagen: two of one name are two
different plans, and merging them loses one. That reasoning is sound about a
file somebody _hands_ you. It is wrong about the file that actually gets
re-imported, which is your own backup — and the difference only became visible
by importing a real one twice and counting rows: the trips held at 33, while
the three Vorlagen became six and their includes went 35 → 70. Reading the ADR
would not have produced that; running the thing did. The suffix is retired, and
ADR-017 carries the supersession note.

**What the rule costs, in this project's own data.** The family sheet these
imports exist for has _Janosch & Andy_ twice in 2021 — two different weekends,
one name, one year. Under this rule only the first can be imported, and the
second has to be named apart in the file. Since the rule reaches Vorlagen too,
the same holds for two different Ferien-Vorlagen of one name — the very case
ADR-017 was protecting — and a _changed_ Vorlage can no longer be re-imported
over the one that is here: it is skipped whole rather than merged. All of that
is written into ADR-030 as accepted cost rather than discovered later, and it
is also the concrete thing
the revisit trigger waits for: the fix, when somebody wants it, is a way for
the import to say "no, this is a different one", not a different notion of
identity.

## A column everything read and nothing wrote (2026-08-25)

FR-25.19's _Zugewiesen an_, and E2E-FLOW-02 with it. The task began as a test:
the `server` project had just made a second identity reachable, so the owed
delegation case was writable at last. It was not — its first step did not
exist. `packer_user_id` was written once, when a row was generated from a
template or a clone, and never again.

**The gap survived because every other part of it was built.** M4's edge
avatar reads the column, with the FR-25.19 precedence rule (the packer after
packing, the assignee before, never both). The revealed row's stamp names both
where they differ. FR-25.20's filter hides other people's rows and its reveal
bar names them — and all of that is unit-tested, with synthetic rows carrying
an assignment no screen could make. The server fires `notifyDelegation` on any
push carrying the column, with its own Go test. UI-Spec M5's Actions line has
said _„set Zugewiesen an → notification (FR-6.2)"_ since the concept round.
Four correct pieces around a missing one, and each of them looked like
coverage of it.

**So the fix was one control, not a feature.** The plan had a step for
_„M4's consequences"_, and that step dissolved on inspection: nothing was owed
there, because the reading side was complete. Worth writing down as a
sequencing lesson rather than a defect — when a column is read in four places
and written in none, the honest estimate is _one writer_, and the temptation
is to plan work for the four.

**The test I wrote for the G-3 rule would have passed without the rule.**
It asserted `attributes('disabled')` on the picker. Ionic sets `disabled` as a
DOM _property_ on its custom element, so `attributes()` never sees it — the
assertion returns undefined whether the control is disabled or not, and the
existing `m5-container` select proves it: it has carried `:disabled="isLocked"`
since the rebuild and shows no such attribute either. The case now asserts the
rule — a locked row writes nothing — with the lock banner as its positive
signal, and reversing the guard reddens it. The same shape has now been found
in Playwright (`aria-disabled` on `ion-button`) and in Vitest; the common half
is that **a rendered attribute is not where Ionic keeps state**.

**And one thing was deliberately not fixed here.** The same reading found that
notifications are not localized at all — every FR-6.2 body is an English
literal, with a second copy in `sw.js` for the OS notification. It is backlog
item 19 rather than a commit in this PR: the worker cannot read the locale
from `localStorage`, so the OS half needs a mechanism decision and an ADR, and
a localized button under an English sentence is worse than consistent English.

## A device only ever got the first page (2026-08-25)

**What changed:** the pull asks page after page until the server says there is
no more (Sync-API §4). It used to ask once, apply the 500 changes it got back,
and stop — `has_more` was read by nothing.

**What it looked like.** After importing a decade of the family's real trips
into the `:3000` instance, a fresh browser opened on M2 and said _„Keine
archivierten Reisen"_, with the G-2 glyph green and no error anywhere. The
instance held 717 master rows; the trips sit at `change_log.seq 652` and up,
behind the first page, so not one of them was ever delivered. What did arrive
was 16 of 21 groups and one group holding 19 of its 20 items — a world that
looks plausible and is a fraction of the truth.

**Why nothing caught it.** Every fixture in the suite is smaller than a page.
The unit cases stubbed the pull with a single response and asserted what came
out of it; the e2e projects build their world by clicking, and clicking does not
produce five hundred rows. A rule about what happens _past_ the first page
cannot be tested by data that never reaches it, and the honest fix was to push
520 rows straight at the API in E2E-SYNC-01 — the one case in the suite whose
subject is the size of a partition rather than a screen.

**The second half of the fix made it worse, and the measurement said so.**
The cursor lived in an in-memory `Map`, so a reload asked from zero again. That
looks like the other half of the same bug, and persisting it in IndexedDB
beside the outbox queue was written, tested and green. Then it ran against the
real instance: **zero rows**, on every screen. Outside Local Mode the pulled
rows are not kept either — they live in the Pinia stores and go with the tab —
so a device that remembers how far it read and not _what_ it read asks for the
changes after that point, is correctly told there are none, and renders an
empty app. The memory-only cursor was not an oversight; it is what makes a
memory-only store correct. That half was reverted, and the unit case that had
asserted persistence now asserts the opposite, with the reason in its body.

**The correct implementation was already in the repository.**
`client/src/composables/usePull.ts` has `pullMasterAll` with exactly the
`while (hasMore)` loop this needed — and `grep -rn "usePull(" src` finds no
caller outside its own tests. The app pulls through `SyncOutbox.drain`, which
grew its own single-request version. Two implementations of one protocol rule,
one of them unreachable from the product, is the shape ADR-025 deleted a
different instance of a fortnight earlier: the reachable copy drifted and
nobody could see it, because the correct one was never run.

**What found it.** Not a test, and not a review — using the thing. The import
went in through the CLI, which writes server-side only, so a browser had to
pull the instance from scratch for the first time. Every previous load of that
data had been written _by_ the browser that then displayed it, which is exactly
why a decade of use had never asked the question. It is also what every second
family device does on its first launch.

## A drain could land on top of a drain (2026-08-25)

`SyncOutbox.drain` pushes a partition's queue and then pulls it back. Nothing
stopped two of them running at once, and most callers do not await it: the
WebSocket's `master.changed` handler fires a `drainMaster()` and moves on, and
so do four trip actions. Two overlapping drains pushed the same chunk twice —
harmless, the server memoizes by `mutation_id` and answers `duplicate` — and
pulled the same pages twice, which is the half that changed price.

**Why it was worth fixing now and not before.** As long as a pull was one
request, an overlap cost one extra request. Since the pull became a loop over
pages (the fix a day earlier), an overlap costs the _whole partition_: on the
family instance, 717 rows fetched a second time on the boot path. The defect is
the same age as the outbox; only its price moved.

**The doubled traffic I thought I had measured was my own script.** Verifying
that day's paging fix against the real instance, I traced two full drains — four
requests, `cursor=0` and `cursor=500` twice — and wrote it down as re-entrancy
caught in the act. It was not. The trace script navigated with
`page.goto('/tabs/trips')`, and a `goto` reloads the SPA: two page loads, one
drain each, exactly as designed. Re-run with in-app navigation only, a load
produces one drain and two requests. **A `goto` in an eyeball script is a reboot,
and every boot-path request appears once per `goto`** — which makes any counting
assertion built on one meaningless. The re-entrancy is real, but it is a latent
hazard reachable from named call sites, not something the instance was observed
doing; the fix is cheap enough that the distinction did not change the decision,
only the sentence describing it.

**The obvious guard is wrong, and a test says so.** The one-line version is to
keep the running promise and hand it to any caller that arrives while it is open.
That loses writes: `drain` works through the snapshot of the queue it took when
it started, so a mutation enqueued a moment later is not in it. A caller that
awaits the returned promise — `enqueueAndDrain` does — would be told its
mutation had been sent while it had never left the device, and would sit in the
queue until something else happened to drain the partition. So a late caller
waits for a **further** drain instead, and every caller arriving during one
drain shares that single follow-up. Written as coalescing first and mutated back
to it afterwards: the case that catches it is
_„still sends a mutation that was enqueued while a drain was running"_, and it is
the only one of the seven that plain coalescing fails on a push path.

Two smaller decisions in the same shape. The guard is released in a `finally`,
not a `then`, because a guard a failed drain leaves standing would take the
partition out of sync for the rest of the session — a worse failure than the
double work it prevents. And the follow-up swallows the running drain's
rejection before chaining: that failure belongs to the caller that started it,
while the late caller gets the outcome of its own drain, which has not happened
yet.

**Not fixed, still true:** there are two paging implementations of this protocol
rule — `SyncOutbox.drain` and `usePull.pullMasterAll`, the latter reachable only
from the FR-18.7 command line — and the guard added here is the drain's alone.

## The clock the client was told to read, and never received (2026-08-25)

A data-model review of `schema.sql` against the PRD, the Sync-API spec and
the store's own code. Five defects and one non-defect came out of the sync
half of it; the schema's own constraints are a separate change.

**A rule can be implemented on both sides and still never run.** Sync-API §3
has every client advance `last_seen_hlc` to the highest HLC it has observed,
and the client implements it exactly — `usePull.ts` and `useSyncOutbox.ts`
both read `row['updated_hlc']` off each pulled snapshot. The server builds a
snapshot from `syncableColumns`, and `updated_hlc` is deliberately not one of
them, so `loadRow` scanned the clock into a variable that `Pull` and
`PullMaster` then dropped on the floor with `c.Row, _, _, err = …`. The guard
was therefore false on every change any device has ever pulled. Nothing was
red: the client's typeof check makes the dead path indistinguishable from a
row that simply has no clock, and no test asserted the field's presence
because both sides had been written from the same spec sentence and each
assumed the other end held it up. What it cost is invisible until it isn't —
a device whose wall clock lags keeps minting HLCs _older_ than writes it has
already seen, and loses its own later edits to them. The fix is one line in
`loadSnapshot`, but the lesson is the shape: **two correct implementations of
one sentence do not add up to a working rule, and the thing to test is the
seam between them, not either side.**

**A foreign-key cascade is a delete no change feed can see.** The master
partition already knew this — `cascadeChildren` exists precisely to collect
child ids before a parent goes and tombstone them by hand — but the list had
two holes, and one whole partition had never been given the machinery at all.
Deleting a trip cascaded `trip_members`, `trip_template_sources` and
`trip_applied_changes`, all three of which travel the _master_ feed, with no
tombstone behind them; deleting a trip item cascaded its comments in the trip
partition, which called `cascadeChildren` from nowhere. Both leave rows alive
on every other device permanently. Worth writing down is why a trip's
_remaining_ children need nothing: `change_log.trip_id` cascades too, so the
trip partition's entire feed is deleted along with the trip it describes, and
the master feed is the only one left to carry the news. That asymmetry is
easy to read as an oversight and is in fact the reason the master-side
tombstones are the ones that matter.

**A finding that did not survive its own verification.** The review also
reported that the idempotency memo's `outcome` column was write-only and that
a replayed `rejected` push therefore came back as a bare `duplicate`, losing
the refusal. The first half is true and harmless; the second was wrong, and I
had already written the fix and four red tests before checking the spec text
rather than the summary of it. §5 defines `duplicate` as "mutation_id seen
before, **recorded result returned**", and P-5 says in as many words that "the
second push returns `duplicate`" — the _recorded result_ being the seq and the
conflicts, both of which the code was already returning. The change was
reverted and the tests replaced by the one assertion P-5 makes that nothing
had covered: a replay appends nothing to the change log. **A review finding is
a hypothesis with a citation, and the citation is the part to open.**

**A pragma that holds for one connection is not a schema rule.** `PRAGMA
foreign_keys = ON` was executed once after `sql.Open`. It is per connection,
SQLite defaults it off, and `database/sql` replaces a connection it finds
broken — so a pool that ever re-dialled would hand back a handle on which
every `REFERENCES` clause in `schema.sql` is decorative, with an orphaned row
as the first symptom and nothing naming the cause. It is in the DSN now. The
test needed a deterministic seam rather than a hope that a reconnect happens:
`SetMaxIdleConns(0)` makes the pool close each connection on release, so the
next query provably runs on a fresh one.

**A rule that never ran was hiding two things.** Making the snapshot carry
`updated_hlc` was one line; merging it forward onto a `main` that had meanwhile
gained the multi-page pull fix turned `e2e-single` red, on _that_ fix's own new
case. The cause was not paging. `observeHLCs` had finally been given something
to parse, and `parseHLC` throws by design — so the first malformed clock in the
feed aborted the page, and the 520-row fixture behind the case was minting
device ids out of a non-hex `uniq()`. Two defects had been sitting behind a
guard that was always false: a test fixture producing HLCs the client's own
parser refuses, and a client that lets one bad row make every other row of a
partition unreachable, on every device, for as long as that row exists. The
server stores an HLC verbatim and never checks its device id, so one buggy
producer is enough to trigger it. Observing a clock is an optimisation for
causality, not a gate on rendering, so it is tolerant now and says what it
refused. **A dead code path does not fail; it waits** — and what it was hiding
surfaced only because something else was fixed.

## What a constraint costs when the outbox drops a refusal (2026-08-25)

The second half of the data-model review: `schema.sql`'s own constraints,
read against the FRs that claim them.

**A structural guarantee that took two steps to break.** FR-27.1 says the
two-level hierarchy makes include cycles _structurally impossible_, and
`validInclude` does enforce it: the parent must be a Ferien-Vorlage, the
child a Gruppe. But `templates.kind` was an ordinary syncable column with no
guard on it, so the shape it checked was not stable. Include B into A, push
`A.kind='group'` and `B.kind='template'` — both accepted — and the include
rule now reads the _reverse_ edge as perfectly legal. A→B→A, persisted, by
three ordinary pushes. What makes it worth recording is where the two guards
that prevent it already existed: in FR-27.6, spelled out in full, describing
the **M8 editor**. A rule that only the editor enforces is not a rule; it is
a convention the UI happens to follow, and the push endpoint is a supported
write path with the same authority. The reproduction was written as a test
first and passed against the unfixed code, which is what "verified" has to
mean for a hole rather than a defect: a bug report you cannot make green by
breaking is not a bug report.

**The lens: a constraint that can refuse a legitimate offline mutation
destroys the user's change to buy an invariant.** Push is the only write
path, a constraint violation returns `rejected`, and the client's outbox
drops a rejected mutation — so a CHECK is not a safety net here, it is a
delete. Five candidates were judged by that, and the two that read most
obviously "correct" are the two that failed:

- FR-5.5 says a skip writes `state='skipped'` **and** quantity 0, and the
  client does send both — so `CHECK (state <> 'skipped' OR quantity = 0)`
  looks free. It is not, because _the merge decides the two fields
  separately_: another device's newer quantity leaves the skip applied on
  its own. With the CHECK added and the case run, that push came back
  `rejected` — the whole skip lost, to protect a pairing nothing reads.
- FR-24.2's "the first tag is the primary tag" suggests
  `UNIQUE (item_id, position)`. Reordering N tags is N mutations, so every
  intermediate state has two rows at one position; with the index added, the
  _first half_ of a two-tag swap was refused. The honest fix is a read-time
  tie-break, which the client did not have — it sorted by position and let
  the tie fall to arrival order, so two devices could file one item under
  two different headings and neither was wrong.

Both were **measured against the constraint before being written off**, which
is the only way this reasoning stays honest: "it might reject a legitimate
push" is a guess until the schema is mutated and the push is run. The two
that passed the lens are the ones no client traffic can reach — the one-Owner
index (`authorizeMaster` refuses every client-sent `owner`, so the index can
only ever catch a _server_ bug) — and the one whose cost is a considered
trade rather than an accident.

**A uniqueness scope that contradicted the sentence above it.** `templates`
was `UNIQUE (owner_id, name)` while FR-1.6's MVP simplification says
templates are shared instance-wide and `owner_id` "grants no exclusivity".
Both cannot be true: per-owner uniqueness lets two accounts hold two
"Sommer" that every screen shows side by side and nothing tells apart, and
three built mechanisms already assume there is exactly one — FR-18.2/18.4
link an imported group by name and derive the `(import)` suffix from a name
being taken, FR-27.5/27.15 recognition keys on the shared set. `items.name`
and `tags.name` had been globally unique since the beginning; the templates
scope was left behind when the ownership model was parked. This one carries a
real offline cost, unlike the index above it — two devices creating "Sommer"
offline now means one of them loses it — and that is written into FR-1.6
rather than into a commit message, because it is the kind of thing that
surfaces later as a question about a missing group.

**Dead schema, and the one piece of it that earns its keep.** The
`item_series_history` view had zero consumers anywhere in the repository —
per-series analytics run client-side per invariant 4 — and two `trip_items`
indexes served filters (`mode`, `packer_user_id`) that also happen only on
the client. All three are gone. `trips.duration_days` is in the same
position, read by no server query, and it **stays**: the Sync-API spec uses
it as its worked example of "a generated column is in neither direction of
the protocol, so the client derives it", and a spec sentence with a live
referent is worth more than one generated integer per trip row. Dead schema
is a choice under ADR-018, so it needs a reason each way rather than a rule.

## A refusal that could not be read (2026-08-25)

The finding that started this was phrased as a schema defect: _deleting a
template that ever generated trip items is impossible, and nothing tells
anyone._ Half of that was true. The delete is impossible on purpose —
`trip_items.source_template_id` carries no `ON DELETE` clause because FR-9.2
has an archived trip keep naming the Vorlage its rows came from — and the
permissive fixes are both worse than they look. `ON DELETE SET NULL` strips
provenance from finished trips silently, which is exactly the data FR-9.2,
FR-27.5 and M14 all read; `CASCADE` is not even expressible, because the
parent is a master-partition row and the children live in N trip partitions,
so one mutation would have to write tombstones into partitions it is not
addressed to. **The foreign key was never the defect.** The defect was the
second half of the sentence: nothing tells anyone.

**A refusal had nowhere to put its reason.** `store.MutationResult` had four
fields and none of them was a reason, so five different situations —
authorization, out-of-partition, the FR-27.1 two-level rule, a constraint, a
blocked delete — arrived at the client as the single word `rejected`. The
wire had been ready for this since v1.0: `error` is declared beside the
outcome in `wire.go` and printed in Sync-API §5, and it was written for
exactly two validation errors, both raised _before_ the store is called. And
because §5's P-5 makes any outcome an acknowledgement, the outbox drops the
mutation on receipt. The user deletes a group, the client removes it
optimistically, the server keeps it, and the two diverge permanently with a
number in the G-2 sheet as the only trace. Adding a field is a small diff;
the reason this entry exists is that the small diff was invisible from the
symptom the review reported.

**The reason is asked for, not read out of the failure.** The obvious
implementation is to catch the constraint error and look at it —
`isConstraintViolation` already matches `"constraint failed"` in the driver's
message. That is a string from a dependency, and telling an FK apart from a
UNIQUE that way would put a product decision behind a substring nobody
promised to keep. So the blocked delete is a **pre-check**: a table of the
references that are deliberately declared _without_ `ON DELETE`, and one
`count(*)` per reference before the delete is attempted. It sits beside
`cascadeChildren`, which is the list of references that behave the opposite
way, and the two lists together are now the whole answer to "what happens to
the children". Generic constraint failures keep the string match and the
generic reason; nothing branches on the text.

**M7 does not pre-empt the delete, and that is a decision.** M7 already
pre-empts one delete: a group another Vorlage includes refuses with the
consumer's name (FR-27.6). Doing the same for a group a _trip_ used looks
like symmetry and is not: `getIncludedBy` reads the master partition, which
the client holds in full, while trip items live in trip partitions the client
loads one at a time — in Server Mode it holds the trips it has opened, never
every trip's. A pre-check over what is loaded would answer "safe to delete"
for precisely the trips that then refuse it, and a guard that is right about
the case you are looking at and wrong about the rest is worse than no guard:
it teaches the user that no warning means it will work. The refusal is
reported instead.

**What is announced and not closed.** The device that made the delete still
shows the row as gone. Nothing brings it back: the server row did not change,
so no change-log entry exists, so no pull resurrects it. G-2 now says a change
was refused and why, which is the smallest honest treatment — but the
divergence itself is open, and the e2e case records it deliberately by ending
on a second device that still finds the group. Undoing a parked mutation
against the local store is a bigger mechanism than this PR, and it wants its
own decision about what an optimistic write owes when it is refused.

## A purchase that could not be taken back (2026-08-25)

FR-25.11j, accepted 2026-08-07 and unbuilt since, was the last item of the
data-model review. M6's check-off called `setMode(item, 'pack')`: the row left
the shopping side by the same act that marked it done, and nothing recorded
where it had gone. There was no _„Erledigte"_ to find it in, and no way back.

**A bought-at time and a buyer were weighed, and not added.** They are the
obvious neighbours of a record — `packed_at` and `packed_by_user_id` sit right
there — and the FR asks for neither. The BUY_LOCAL half already has both for
free: being bought at the destination _is_ being packed, so the ordinary
FR-25.17 path stamps them. The BUY_BEFORE half is not a packing act, so a
`bought_at` there would be a column no screen renders and no rule reads —
which is precisely what FR-25.9 removed a field for. The cost of declining is
that "who bought the coffee" is unanswerable for a purchase before departure;
the moment a screen asks, the column is one line and its own FR.

**The reveal declines the persistence FR-25.18 would seem to hand it.** M4's
_Erledigte_ switch is remembered per trip for the session, and copying that
here looked like consistency. FR-25.18's own argument is against it: it is
about not re-picking a filter of **four facet values**, and about a filter that
_hides_ rows being dangerous to forget. M6's reveal is one tap whose off-state
is the safe one — and the M6 **tab** is not remembered at all, so a restored
reveal would open on a list the reader did not choose. The switch that looks
the same is not the same control.

**The round trip is open on purpose.** The Local Mode backup (NFR-4.11) is
written and read through the portable format, and `PortableItem` has no
`bought_from`, so a backup and restore loses which list a row was bought from
— the same shape ADR-024 paid for with status, tags and the mark. Half the fix
is one field in `client/src/domain/portable.ts`; the other half is in
`portableImport.ts`, which another session holds. Writing only the half I own
would put a field into the file that nothing reads back, which looks finished
and is worse than the gap. It is named in FR-25.11j instead.

One thing the diff does show but is worth the pointer: making `bought_from`
required on `TripItem` turned eleven test fixtures red at once, and that is the
mechanism #169 asked for — an optional field is the one that gets forgotten at
a call site, and only the compiler asks every one of them.

## A refusal that only announced itself (2026-08-25)

The entry above this one ends by naming what it did not do: a refused mutation
was given a reason and put on screen, and the row it refused stayed exactly as
the device had optimistically drawn it. That is the gap this closes (ADR-031),
and it was never about the delete that motivated it — an authorization denial,
a scope refusal, a template rule and a constraint all leave the same wrong row
behind.

**A plain pull cannot repair it, and that is the whole design problem.** The
server row did not change, so its `change_log` entry sits behind the client's
cursor; the cursor is an exclusive lower bound that only moves forward, so the
row is never offered again. Every candidate solution is an answer to that one
sentence, and the sentence is what makes the obvious one — "just pull" — wrong.

**The option that scored second was the one I most wanted to reject on sight.**
Resyncing the partition from cursor 0 after a refusal needs no server change,
no new endpoint and no carve-outs, and it repairs phantom inserts for free. It
lost on a single property: it rebuilds the store from the server, which erases
the optimistic rows of everything still sitting in the outbox. On a phone that
has been off wifi since morning that is the entire day's packing, and it would
be destroyed by the mechanism whose job is to protect it. A high score and a
disqualifying failure mode is worth writing down, because the matrix on its own
reads as if it were close.

**The insert/update asymmetry turned out to belong to the server.** The brief
framed it as a client problem — a rejected insert has no server row, so the
client has to know it was an insert and drop the row. The client's `op` is a
poor witness (another device may have deleted the row meanwhile, and the outbox
entry cannot know), but the server does not need a witness at all: at the
moment it refuses, it holds the row or it does not. So the repair entry's
`deleted` flag is read from `row.Exists`, and one mechanism covers both cases —
a refused delete or update re-delivers the snapshot, a refused insert delivers
a tombstone that drops the phantom. The asymmetry did not need a second code
path; it needed a different question.

**`out_of_scope` must repair nothing, and the reason is the leak the refusal
exists to prevent.** That reason means the row belongs to another trip. Writing
a `change_log` entry for it under _this_ trip is precisely how the partition
reaches into another one: the next pull would hand the pusher the foreign row's
whole snapshot — the failure `belongsToTrip` was added for. So it is the one
refusal repaired client-side, and it is repairable there without guessing,
because the reason is the answer: a row this partition may not touch is a row
it must not keep. Two mechanisms, split by a value that already travels the
wire.

**The repair came back empty, and only a screenshot said so.** With the
server-side half green — a Go test asserting the pull now carries the template,
an e2e asserting the group is visible in M7 again — the rendered screen showed
the Vorlage back in the list reading „0 items". The client mirrors the server's
cascade when it deletes a template: the positions leave the store with the
parent, optimistically. Re-logging the row the mutation named brought back a
group with nothing in it, and **both tests were green against that**, because
neither asked what the row contained. The store now re-logs the rows the
cascade would have taken as well, and the e2e counts the positions instead of
asserting visibility. It is the same lesson as the M4 card that painted itself
the colour of the page: a repair can satisfy every assertion and still not be a
repair, and only a rendered pixel can tell you.

**Local Mode is not a special case, and saying so is the point.** It has no
server, no outbox and no push, so nothing can be refused there: its optimistic
rows are the only copy that exists and cannot diverge from a second one. The
repair path is not inert code in that mode — it is not constructed at all,
because the outbox that owns it is not. What _can_ fail on a Local Mode write
is the write to the device, and that already has its own signal in G-2. A mode
question with the answer "the question does not arise here" is worth writing
out, because the alternative is a reader later assuming it was forgotten.

## A name that could only be refused by the server (2026-08-25)

FR-1.6 and FR-13.1, the mitigation the entry _„What a constraint costs when the
outbox drops a refusal"_ left owed. Four things the diff does not say.

**The wizard was the one place that could have adopted the existing row, and
deliberately does not.** Every other surface either has nothing to hand over
(M21 folds a trip; the fold is not an edit of a template that happens to share
the name) or hands it over openly (M7's _Öffnen_, M8's picker including the
group). M3's _neue Serie_ is different: the trip is on its way somewhere, the
existing series is in the select directly above the field, and attaching to it
would be one line of code and no interruption at all. It was written that way
first and then taken out. A series is the anchor a household's history hangs
on, and silently deciding _whose_ series a trip joins is a choice the wizard
does not have the standing to make on the user's behalf — particularly when the
name matched only by capitals. The note names the series and the step waits.

**The item path was already doing this, and that is why nobody noticed.**
M8's quick-add has always resolved a typed name against the master items and
reused the row it finds (`onQuickAdd`, a lowercased comparison). So the _item_
half of FR-16.3 has been live since the composer was built, and the template
half looked like it worked because nobody had two templates of one name yet.
The rule was in the codebase, in one view, reachable only through a Vue
composable — the shape invariant 4 warns about. It now lives in
`domain/nameCollision.ts` where the wizard, M16, M21 and both template screens
read the same one.

**Changing the return type was the work.** `createTemplate` and `createSeries`
returned `string`; making them return `string | null` turned "which paths write
a name?" from a grep into a compile error, and the compiler produced the list —
including `createTemplateFromTrip`, which creates a group _and_ a template and
had to grow its check **above its first write**, since it writes master items
and group updates before either. The enumeration is worth more than the guard:
a grep for `createTemplate` would have found the same call sites, and would
have gone on finding nothing the next time one was added.

**A check stricter than the constraint is a false alarm; a looser one still
loses the push.** That framing is what settled the diacritics question. Folding
case is prevention — the database would hold "Sommer" and "sommer", and no
screen could tell them apart. Folding diacritics is not: "Frühling" and
"Fruhling" are two names `UNIQUE (name)` accepts, so refusing the second one
takes away a name with nothing the user can do about it. FR-27.13's picker
search folds them because a wrong hit in a search costs a glance; here a hit
blocks a write. **No ADR is owed** — the tradeoff was decided where the
constraint that causes it lives, in FR-1.6's own stub, and an ADR restating one
FR's paragraph is a second place for it to go stale.

## A delete that could only be refused (2026-08-25)

FR-24.3 had been parked since the tag model was unparked without it, and the note added
to it that morning was already the whole diagnosis: what runs today is _a third
behaviour_, neither of the FR's two — the delete is refused. Unparking it was therefore
not "build a tombstone system"; it was turning one `if` from a decline into a choice. The
discriminator was already there, built for the refusal itself: `blockingReferences` names,
per table, the references that keep a row alive, and `stillReferenced` asks it before the
delete is attempted. The FR's two branches are exactly its two answers.

**The half nobody had priced was the filtering, and its two directions are not
symmetric.** There are 37 non-test call sites of `masterStore.itemList` and 36 of
`templateList`. A retired row that turns up in a picker is annoying. A retired row that is
_missing_ is data loss, and two of the sites are the ones that would lose it: `resolve()`
expands a Vorlage's includes, so filtering there empties a generated trip; and
`compositionSource()` feeds M7's export, the settings export **and** the NFR-4.11 backup,
so filtering there costs a Local Mode device its only copy. The decision that follows is
in ADR-032: `itemList` and `templateList` keep meaning _everything_, and the display
surfaces opt in to `activeItemList` / `activeTemplateList`. It is more edits, not fewer —
but it makes the destructive direction the one an author has to choose, rather than the
one every future call site inherits by writing the obvious thing.

**The rule is written twice on purpose, and only one copy is allowed to be wrong.** The
complete reference count exists only where all the data does: on the server in Server
Mode, on the device in Local Mode, which has no server at all. So the decision cannot live
only on the server (invariant 5 would lose the feature) and cannot live only on the client
— the client holds the trip partitions it has _opened_, never every trip's, so it is blind
to precisely the FR-9.2 case the feature is about. The shape that resolves this is not
discipline but asymmetry: the client's only possible disagreement with the server is
"remove" where the server retires, and the server answers that by retiring anyway, so the
pull the device already makes corrects it. A wrong client answer costs a wrong sentence,
never a wrong row. The client-only variant was considered and is the shape the UI-Spec had
already rejected for M7 nine days earlier — _"a pre-check would call the delete safe in
exactly the case that then fails."_

**A usage endpoint was designed and then not built.** M10 has to state the outcome before
the confirm, and in Server Mode the client's count can be short — so a
`GET /master/items/{id}/usage` was the obvious answer, and it is Option B in the ADR. It
was dropped because it buys the case it cannot serve: offline, the dialog is back to
hedging, and putting a network round-trip inside a delete confirm is the one place an
offline-first app should not. The hedge is a third sentence instead, and it names the
condition rather than apologising for it.

**M10 had no delete control at all.** `orchestrator.deleteMasterItem` existed and had zero
non-test callers; M9's swipe-delete was specified in July and never built. So "M10 states
which deletion will happen before the user confirms" had nothing to state it on, and the
FR's UI half was a card to write rather than a sentence to add. The swipe stays proposed
and the UI-Spec now says why: once the card had to carry a count _and_ a reason, a swipe
reveal has room for a label and not for a reason.

**Two consequences of the marker that the FR did not mention.**
The first is uniqueness. `items.name` and `templates.name` are UNIQUE instance-wide, and a
retired row would go on holding a name nothing renders — so deleting an item and creating
it again, which is what a physical delete used to allow, would start failing for a reason
no screen could show. Both became partial unique indexes over `retired_at IS NULL`, and
the client's `templateNameCollision` moved onto the active list to match. The second is
ADR-031's cascade repair: a retire is a delete the client has _already drawn_, positions
and all, so the same children have to be re-logged alive. That was found by reading
ADR-031 rather than by a failing test, and the test that pins it now was written after —
the honest order.

**What the refusal keeps.** FR-24.3 names master items and Vorlagen. `blockingReferences`
also lists series, travelers and containers, and those keep refusing: they are not history
the way a master item is, and a retired traveler would be a person nobody can see attached
to rows everybody can. That left four tests asserting the refusal _through_ a template or
an item — they moved onto a series, which is the ground the refusal still governs, so the
`still_referenced` machinery kept its coverage instead of losing it to the feature that
replaced one of its cases.

**Restore is owed, and saying so is the decision.** The marker is an ordinary synced field,
so clearing it is one mutation — a Go test asserts exactly that, and it passes. What does
not exist is any surface that _lists_ retired rows, and inventing one (a filter chip on
M9, a section in settings, its own screen) is a UI round with no rendered evidence behind
it. The mitigating fact, and the reason this is acceptable rather than a trap: the retire
is announced before it happens, in the card and again in the confirm, instead of being
discovered afterwards.

## The restore was free, the name was not (2026-08-25)

The entry above closed by writing down that restore was owed, and naming that as the
decision. This is the day after, and the first thing building it found is that the
sentence FR-24.3 had carried since the concept phase — _"a future restore affordance is
free, since logically-deleted items retain everything"_ — was true about the data and
false about the name, and had been false since the day before, when the same FR made both
unique indexes partial.

**The FR contradicted itself and nothing noticed, because the two halves were written
apart.** `retired_at` is an ordinary synced column, so clearing it really is one mutation:
four Go tests written first against the unchanged server all passed on the first run, which
is the honest report — the server needed no change and these pin a claim rather than drive
one. But `idx_items_active_name` ranges over `retired_at IS NULL` deliberately, so retiring
_frees the name_, and the whole reason that was chosen — re-creating what you just deleted
is the common case — is precisely the sequence that then makes a restore impossible. The
free restore and the freed name were two bullets under one FR, each right on its own. What
that cost is a whole ADR (034) for a feature described as costing nothing.

**The collision is answered on the client, which is the opposite of what ADR-032 had just
decided — and the difference is which question is being asked.** ADR-032 made the client's
FR-24.3 answer _advisory_ because a reference count needs trip partitions the device does
not hold. A name does not: the master partition is pulled whole, so every device knows every
active name exactly, in every mode. This is the first FR-24.3 rule the client is
authoritative about, and it has to be, because Local Mode has no push to be refused by. The
alternative was to let the server's `constraint_violated` do it — and on screen that is a
row that comes back and vanishes a drain later, ADR-031's repair doing its job on a refusal
that was predictable before the tap. The server still refuses it; nobody is meant to get
there.

**The surface was chosen against three others, and the reason is the same in each case.**
A filter chip on M9's tag axis puts hidden rows one tap from browsing, which is the opposite
of what hiding them was for — and a lifecycle state is not a tag, so the axis would then mean
two things. A folded section at the foot of M9 _and_ M7 is two surfaces for one rule, in the
screen FR-24.4 had just been made lean. A `?retired=1` mode of M9 inherits a grouping, a tag
axis, a property sheet and a FAB, none of which mean anything for a list whose only actions
are restore and delete-for-good. M23 sits beside the conflict-log pointer in M17 because it
is the same _kind_ of screen: corrective, opened after something went wrong, never during
work. That is a classification the code cannot express — `masterListFiltering.spec.ts` now
carries a third entry for it, because the existing split (complete lists resolve, active
lists offer) had no room for a surface whose subject _is_ the retired row.

**Rendering it found the defect twice, in one test, and neither was visible from the code.**
The first run of the collision case failed on a count, and the page snapshot showed why: the
restored item was named **"K"**. An `ion-alert` input had taken the first keystroke of
`pressSequentially` and dropped the rest — and every assertion in the case was still
satisfiable by it, because one row is one row whatever it is called. The input's value is
asserted before the button is clicked now. Underneath that was a second one shared by both
cases: `page.goto` after a Local Mode write reloads before the write reaches IndexedDB, so
the restore was there and then not. The assertion that had looked like a settled signal —
the row leaving M23 — reports the _optimistic_ state and says nothing about durability. The
sync indicator is the seam that exists for this, and every reload in the file waits on it.

**Delete-for-good was built rather than named as owed, for a reason worth stating.** A
retired row whose last reference is gone is unreferenced, so FR-24.3's own second branch
applies to it — but with no surface offering that branch, a retire would have been permanent
by omission, which is not what a logical delete is supposed to mean. It is offered _only_
where the delete would actually be physical: a button that silently re-retires the row is
worse than no button, and in Server Mode the same three-form hedge M10 carries applies here
unchanged.

## Two actor columns a client could still name (2026-08-25)

Invariant 3 says the server stamps every actor column itself. Two columns
were outside that promise, both found by reading the data model rather than
by a failing test: `comments.author_id` and `trip_items.packing_now_by`.
Neither is exotic — an ordinary trip member, authenticated and authorized for
the trip, could push a mutation naming somebody else.

**An edit may not re-stamp the author it can no longer forge.** `author_id`
was stamped on `insert` and left alone on every other op, so an `upsert`
could rewrite it — and the whitelist in `internal/store` lets the column
through. The repair that suggests itself is to stamp the pusher on every op,
the way `packed_by_user_id` is handled. That is the _opposite_ defect: the
comment surfaces push upserts for `task_state` and `is_task` (FR-7.2's
"flag as task", the todo resolve/reopen), so flagging somebody else's comment
would quietly transfer its authorship to whoever tapped. Authorship is
decided once, at the moment the row comes into being, so the field is
stripped from every non-insert op instead: an edit changes what a comment
says and never who said it, and the stored value survives because a partial
upsert only writes the fields it carries.

That leaves the case the strip cannot serve: an `upsert` that _creates_ a
comment has no author to fall back on. The client never sends one — every
comment is born from `addComment` or `addTodo`, both `insert` — so rather
than invent a rule for a shape no product surface produces, the push is
allowed to fall onto the `NOT NULL` column, where `ApplyMutation` already
turns a constraint violation into a `rejected` outcome. A refusal the outbox
can park is the correct answer for a mutation nothing legitimate emits; the
alternative would have been to attribute it to the pusher, which is the
forgery the whole change is about.

**The obvious shape of the claim fix would have left every packed row
claimed.** `packing_now_by` was written only inside the `state`-driven
switch, so a mutation carrying the column and no `state` never met the code
that owns it — the holder that FR-5.7's takeover confirms against and M4's
row names was the client's to choose. Stripping it unconditionally at the top
of the branch, the way `packed_by_user_id` is stripped, is only half a fix,
and the half that was missing is invisible in the server: the _release_ of a
claim was the client nulling the column (`packItem` and `releasePackingNow`
send `packing_now_by: null`), and the switch's `packed` branch never cleared
it. Strip the column and trust that path, and packing a row would have left
its claim standing forever — a G-3 lock nothing could end.

So the claim is now derived rather than accepted: the claim _is_ the state
(FR-5.3), so every branch of the switch writes both `packing_now_by` and
`packing_now_at` — the pusher when the state becomes `packing_now`, `NULL`
for every other state — and a mutation with no state at all leaves an
existing claim untouched. The cost accepted with it: a state-carrying
mutation that used to leave a claim alone now ends it, `restoreSkipped`
included. That is the coherent reading — a holder on a row whose state is not
`packing_now` is a claim nobody can see — and it is what the client already
documented itself as doing.

**A clock is not an identity claim, and stays one.** `packing_now_at` is
stripped with the holder but handed back through the same helper
`packed_at` uses, so a client may still name the moment it tapped (packing
happens offline; the push can land days later) while an unparseable value is
replaced by the server's own time. The helper was called `packedAt` and is
now `tapTime`, because it serves both stamps.

## A decade of packed trips, all reading zero (2026-08-25)

**What changed:** M2's row reports _unknown_ while a trip's own rows are not on
the device, and the screen fetches the partition of a row when that row is on
screen (ADR-033).

**The complaint was about the imported archive, the defect was older than the
import.** `trip_items` live in the trip's own partition, which is pulled when a
trip is opened. A device that had never opened a trip therefore summed nothing
— and printed the sum: `0/0 gepackt`, ring at 0 %. For an archive of finished
holidays that reads as _you packed none of it_. It had always been true; it took
a list where every row was a fully packed trip for anyone to see it.

**The option that is free for ever, and why it lost.** Putting `packed`/`total`
on the trip row itself costs nothing at any archive size — `trips` is in the
master partition, which M2 already pulls. It was turned down on correctness
rather than cost: a count is a _derived aggregate_, and under field-level LWW
two devices packing offline both compute one and the merge rule has to let one
win. Every other field the protocol carries is a value somebody typed; this one
would be arithmetic, silently wrong, and inexplicable to the person looking at
it. That argument is the whole of ADR-033's decision, and it is the kind that
does not survive being left in a commit message.

**One measurement decided the rest.** Loading every trip's partition when M2
opens is the simple correct thing, and the machinery already existed — the
pull-to-refresh does exactly that. Measured on the family's instance: **33
partitions, 357 ms and 1.1 MB**, to render eight rows, growing with the archive
for ever. Loading only what is on screen: **8 requests on opening the list, 18
after scrolling through all 33.** Without those two numbers the choice is taste.

**A bug only rendering could find.** The first implementation loaded correctly
and rendered "Positionen werden geladen …" for ever. `loadedTripPartitions` was
a plain `Set` and `localHydrated` a plain `let` — internal state, until a
_screen_ began reading it, and a value Vue cannot see change is not a value a
template can read. Every unit test passed, because a function that returns the
right answer when asked is exactly what they check. The unit case that now pins
it watches the value through `watchEffect` rather than calling it.

**A test that was right to fail in company.** E2E-M2-10 passed alone and failed
in the full `single` project. The reason was not flakiness: run alone, the trip
is the only one on the list and sits in the first screenful; run with the suite,
other tests' trips push it below the fold, and ADR-033 has deliberately not
fetched it. The case was asserting test isolation while claiming to assert the
app. It scrolls the row into view now, which is what a person does, and what the
feature actually promises.

## An invariant that lived at eighty-seven call sites (2026-08-25)

`useSyncOrchestrator.ts` built the optimistic twin of every write by hand:
eighty-seven copies of the same five-key literal, each repeating the table and
the id that the mutation beside it already carried, and — for an update — the
`{ ...itemRow(item), ...mut.fields }` spread that keeps the row whole. That
spread is the whole invariant. The stores apply a change by _replacing_ the
row, so a column the mutation does not mention is blanked; in Local Mode no
pull ever arrives to heal it. The rule was written once, in a comment, and then
depended on at eighty-seven places.

**The probe.** Deriving the table and the id from the mutation is only safe if
the two never disagreed, and eighty-seven sites is too many to establish that
by reading. So it was measured instead: a throwing comparison was added inside
`enqueueAndDrain`, the whole suite was run against it, and the throw never
fired. That is weaker than a proof — the suite does not reach every site — but
it is evidence, and it cost one edit and one run. The probe was deleted once the
helpers made the comparison tautological. The technique generalises: **an
assumption a refactor depends on can be installed as a temporary invariant and
run rather than argued.**

**A field that had been quietly dropped.** `flagCommentAsTask` enumerated the
comment row by hand and left out `created_at`. Nothing was visibly lost, because
the row survives as a _todo_ and `ItemTodo` has no such field — but the
omission was one "unflag" feature away from mattering, and it had been there
since the row was written. This is the shape the helper exists to prevent, found
by converting the site rather than by reviewing it. The mapper also has to carry
`is_task`, which is not a column the action changes: the store _routes_ on it,
so an optimistic row without it moves the row to the other list.

**The duplication had already left the file.** `PortableImportEnv.emit` took a
partition, a trip id, a table, an id _and_ the mutation that already carried the
last two — and the FR-18.7 import command, which implements that interface
outside the browser, had its own copy of the hand-built literal. Invariant 4
keeps the _rules_ single; it does not by itself keep their plumbing single.
`emit(partition, tripId, mutation)` is the whole contract now.

**Why the freed ids are the interesting part.** Dropping the redundant
arguments left twelve `const { mutation, id } = …` destructurings whose `id`
had no reader, and the linter named every one. That is what a redundant
parameter looks like from the inside: not a duplicated value, but a dozen
variables kept alive to feed it. The cleanup is not tidying — it is the
measurement of how far the duplication had spread.

**What was deliberately not done.** The row mappers are still hand-maintained
field lists with nothing checking them for completeness — a new column on a
domain type has to be added there or every optimistic update silently blanks
it. Five more mappers were added here rather than fewer, precisely so the next
pass has _one list_ to pin instead of a literal per call site. Pinning them is
its own change.

## A name rule the system's own names could not pass (2026-08-26)

The UX review's Settings batch (UX-3, UX-12, UX-16 — one PR). What the diff
cannot show:

**The rule contradicted its own default, inside one FR.** FR-17.13 restricted
the display name to `[A-Za-z0-9._-]` "(no spaces or other punctuation)" and, in
the next clause of the same bullet, declared "Demo User" — a name with a space —
to be "simply the initial value of this same editable field". The server seeds
that name (`internal/store/singleuser.go`), OIDC provisioning stamps in IdP
names with spaces and diacritics unvalidated, and the DB CHECK only bounds the
length. So every layer of the system produced names the validation layer
refused, and the screen opened with a standing red error under an untouched
field. The revised rule — 1–50 printable characters, no edge whitespace — is
not a loosening for convenience; it is the narrowest rule that admits what the
system itself hands out. The lesson generalises: **a validation rule must be
tested against the values the system generates, not only against values a user
might type.** The rule also moved from an inline component regex to
`client/src/domain/displayName.ts` (invariant 4's cut), and the note now waits
for the field to be touched.

**The mid-word gap was paint, not text.** M17's traveller label rendered as
„Reisende:n hinzuf ügen" — which reads as an i18n or hyphenation defect. It is
neither: per-character `Range` rects showed the line laid out contiguously
(`f@118.3+5.3, ü@123.5`) and the latin-ext font file not even loaded. The gaps
(also after the „R") are Chromium rounding glyph runs when rasterising under
the stacked label's `transform: scale(0.75)`. There is no CSS knob for that, so
the fix is the one M22 already uses for the _same_ control: a placeholder input
and a labelled button, no scaled floating label. Worth keeping: **when text
renders broken, measure the layout before blaming the string** — the DOM was
correct in every inspectable way, and only the rendered pixels carried the
defect.

**G-12 and G-9 disagreed about the gear, and the later decision wins.** G-12
(2026-08-19) says the settings gear hides on every chevron screen; G-9's
origin-return amendment (2026-08-21) requires it on every screen — "back
returns to where the gear was tapped" needs a gear to tap. The implementation
follows G-9, so G-12's sentence described a UI that never shipped. Resolved
minimally: the gear hides only on M17 itself, where it can only reopen the
page it is on; G-12's placement bullet now states the reality and points the
remaining crowding question (M4's cluster _and_ gear) at UX-13, where it is an
open finding rather than a rule.

## A field nobody had ever written (2026-08-26)

Closing the row-builder completeness suite meant four cases — `tripRow`,
`travelerRow`, `seriesRow`, `dependencyRow` — that the first pass had left
open because two columns on `Trip` looked derived and wanted deciding. Both
were, and only one of them honestly.

**`duration_days` is derived and correctly absent.** `trips.duration_days` is
a `GENERATED ALWAYS ... STORED` column in `schema.sql`, so it never travels the
sync protocol and no pull carries one; the store computes it from the two dates
the builder does carry. Nothing to fix, and the case now says so where the next
reader will look.

**`series_name` is not derived from anything.** No such column exists — not in
`schema.sql`, not in any Go mapper, not on any wire envelope. The client's
`rowToTrip` reads `row['series_name'] ?? null`, which has therefore returned
`null` for every trip that has ever been read on any device. Its one reader is
AnalyticsPage's FR-14.3 trend heading, `trip?.series_name ?? trip?.name`, so
the fallback is the only branch that has ever been taken: the heading over a
series trend names the _trip_, never the series. It is the second field of this
exact shape — `MasterItem.category_name` is the first, documented in the same
file — and both were found the same way: **a completeness test has to state
what the seed produces, and a field that cannot be produced is a field nothing
writes.** A type is not evidence that a column exists. Deliberately not fixed
here: the name lives on the master store's series row, which the trip store
cannot reach, so closing it is a decision about where that join belongs rather
than a line in a builder.

**What defends the builders is a compile error, not a red test**, and this is
worth restating because it is counter-intuitive in a test file: no runtime
assertion can catch a _new_ column, because a mapper reads a missing column as
`null` and that is indistinguishable from a column that is genuinely null. The
`satisfies Record<keyof T, unknown>` on each fixture is the guard — measured by
adding a field to `Trip` and watching `rowBuilders.spec.ts` stop compiling
(TS1360) while every test stayed green. The runtime half defends the columns
that exist: dropping one line from each of the four builders reddens that
builder's case and no other.

**And the suite that was written to defend the columns was not defending all
of them.** Mutating _every_ column of all nine builders one at a
time — 66 runs — rather than the four that motivated the change turned up two
holes, neither of which any assertion could report:

- **A one-field action cannot defend the field it changes.** That column comes
  from the mutation, so it is written whether or not the builder carries it.
  `activateTrip` supplies `status`, and `status` is #158's defect exactly — the
  column whose loss makes a trip vanish from M2. The suite named after that
  defect could not have caught it. The fix is a _second_ action per builder,
  changing something else; the case list is now `acts[]` and the second entry
  is the one doing the work. Where only one writer exists — `travelerRow`,
  because FR-2.7 forbids re-creating a traveller to rename them — one entry is
  complete, and the case says so rather than leaving the gap silent.
- **A fixture value equal to the mapper's default is a false green.** `rowToTrip`
  reads `Number(row['year'] ?? new Date().getFullYear())`, and the seed said 2026. Dropping `year` from `tripRow` therefore changed nothing the assertion
  could see. Seeding 2025 makes the default differ from the fixture. The
  general form: **never seed a column with the value its mapper falls back to**
  — the test then passes through the fallback and reports nothing.

After both fixes the sweep reports 65 of 66 columns defended. The one that is
not is `travelerRow.name`, and it is unreachable rather than untested — there
is no second writer that could observe its loss.

Worth keeping beyond this file: **the sweep is the review**. Four spot checks
read as proof and were not; running the same mutation over every column cost
minutes of machine time and found the two cases that mattered.

## The orchestrator starts coming apart (2026-08-26)

R-4's first cut. `useSyncOrchestrator.ts` was one 3,215-line file whose closure
ran from line 278 to 3,021 — 134 inner functions and a ~120-key return object.
Moved out: the row builders and the two other module-level helpers into
`composables/sync/rows.ts`, and the container group (FR-10.1, M11) into
`composables/sync/actions/containers.ts`, bound to a `SyncContext`. The facade's
return shape is unchanged, so no call site outside the composable moved.

Three things the diff does not say.

**The seam is asserted, not assumed.** The container actions were already
covered — `containerActions.spec.ts` drives them through the real orchestrator,
and it stayed green through the move, which is exactly why it proves nothing
about the extraction. What the split is _for_ is that a group can be
constructed without `fetch`, a WebSocket, an outbox or the other 129 functions,
and only a test that does so can show it. `sync/__tests__/containers.seam.spec.ts`
builds the group on a hand-written context whose `enqueueAndDrain` is a
recorder, and reads what was queued. It is four cases and it cost minutes; a
move that claims isolation and never exercises it is a claim, not a boundary.

**The context carries what a moved group needs and nothing else.** Three
fields today — `tripStore`, `mutations`, `enqueueAndDrain` — because that is
what containers use. The tempting version declares the whole spine up front
(`masterStore`, `api`, `today`, the outbox) so later groups need no edit. That
version is a list of guesses, and a guessed field is one nobody can delete
later without checking every group. A field arrives with the group that needs
it.

**Fourteen row builders were in that file, and nine have completeness cases.**
The R-3 review named nine; the file has `memberRow`, `commentRow`, `todoRow`,
`profileRow` and `checklistItemRow` as well. R-3 was closed against the review's
list rather than against the file, and the list was where the error was — the
same shape as the finding R-3 itself recorded, one level up: a hand-written
enumeration driven by nothing. The five are undefended today, and gathering
them into one module is what made it visible. **Do not read the closure of a
backlog item as coverage of its subject**; read the subject.

## The five builders the list had hidden (2026-08-26)

R-3's remainder. `memberRow`, `commentRow`, `todoRow`, `profileRow` and
`checklistItemRow` get the completeness cases the other nine already had,
which closes the gap the R-4 move surfaced: the review had named nine
builders, the file holds fourteen, and R-3 was closed against the list.

**No column was actually being dropped.** All five builders were complete when
checked against their domain types, so this PR fixes no live defect — it
installs the guard that keeps them complete, which is a compile error
(`satisfies Record<keyof T, unknown>`) rather than an assertion. Worth saying
plainly, because "we found five undefended builders" and "we found five
blanked columns" are different claims and only the first one is true.

**`commentRow` does not fit the shared shape, and the reason is the finding.**
Its one writer is `flagCommentAsTask`, which promotes the row from comment to
todo — the store moves it between two maps, so it cannot be read back as the
entity the seed produced. The case reads the _todo_ instead and asserts every
column `ItemTodo` names survived the promotion. Two of the builder's columns
stay unreachable, both structurally:

- `created_at`, because `ItemTodo` has no such field — once the row is a task,
  no client surface can show the timestamp at all. It is in `commentRow`
  because PR #204 found it missing, and the `satisfies` is what keeps it there.
- `is_task: 0`, because the only writer overrides it with 1. `todoRow`'s
  `is_task: 1` _is_ defended — resolve and reopen both rebuild a row that has
  to stay a task. **A hard-coded column is only as defended as the writer that
  contradicts it.**

Three more columns are unreachable for the reason #215 already recorded — a
one-field action cannot defend the field it changes, and these builders have
exactly one writer each: `memberRow.role` (`setTripMemberRole`),
`todoRow.task_state` (resolve and reopen change the same column, so a second
action buys nothing here) and `profileRow.notes` (the profile has two columns
and one writer). Fifteen of twenty defended, five unreachable, each said out
loud in its case.

**And the sweep lied first.** The mutation sweep over the twenty columns came
back green on all twenty — every column apparently undefended, including ones
whose cases had just been written to catch exactly that. The fault was in the
harness: it decided "red" by grepping the runner's stdout for `FAIL`, and the
lines were not there to grep. Running one mutation by hand reddened two cases
immediately. Switching the check to the process exit code produced the fifteen
reds above.

The lesson is not about vitest. **A sweep whose result is "nothing is covered"
is far more likely to be measuring itself than the code**, and it is
indistinguishable from a catastrophic finding until you check. Prove the
harness can see a known-red run before trusting any of its greens — the same
positive-signal rule the project already applies to tests that assert
something did _not_ happen.

## Three more groups leave, and the context stops being free (2026-08-27)

R-4's second cut. Out of the closure: the comment/todo group (FR-7.1/7.2/7.3),
the item-dependency group (FR-20.1) and the series/destination group
(FR-13.1/13.2), plus the two name-collision lookups and `isTakenRename` into
`composables/sync/names.ts`. 2,942 lines down to 2,714; the facade's return
shape is unchanged, so nothing outside the composable moved.

Three things the diff does not say.

**Comments and todos are one group because they are one table.** The obvious
cut is by feature — FR-7.1 comments here, FR-7.3 todos there — and it is the
wrong one: a todo _is_ a comment with `is_task = 1`, `flagCommentAsTask` carries
a row from one to the other, and the store moves it between two maps when it
does. Splitting them would have put the two halves of one promotion in two
files and left neither able to test it. The seam spec reads the promoted row
back through `getItemTodos`, which only works because both writers are in
front of it.

**Growing the context is not free, and that is the useful part.** Adding
`masterStore` and `names` to `SyncContext` broke the _existing_ container seam
spec at compile time — it hand-builds a context, and a hand-built context has
to grow with the type. That is the design working: the alternative, a context
declared up front with every field the orchestrator might one day pass, would
have made this edit invisible and left nobody able to prune a field later. The
cost is paid once per growth, in one place: `sync/__tests__/seamContext.ts`
builds the context for all four seam specs, so a new field is one TS2739 there
rather than a silently half-built context in four files. A helper that
_defaulted_ the new field would have removed the warning and the point with it.

**The name guards moved because two groups need them, not because they fit.**
`seriesNameCollision` went with the series group's callers; `templateNameCollision`
has none of its callers moved yet — templates are still inside the closure —
and `isTakenRename` is used by both. Leaving them in the orchestrator would have
meant passing three functions to the series factory; moving only the one the
series group uses would have split a pair that is read as a pair. They are on
the context as one `names` object, and the facade still re-exports both lookups
because the views ask before they write. This is the first thing on the context
that is not plumbing, and it is worth naming: **the refusal paths are why the
guards are shared state rather than a group's private helper** — a name is taken
instance-wide, so no single group owns the question.

Nine mutations, each dropped one at a time and each red: both refusal guards,
`ensureDestinationProfile`'s create-once, the master-partition routing, and the
five whole-row optimistic paints. The `default_attributes` fixture is the wire's
JSON _text_, not the domain object — `rowToSeries` parses and `seriesRow`
stringifies, and a fixture in the domain's shape throws inside the store rather
than failing an assertion.

## The first group that has to know which mode it is in (2026-08-27)

R-4's third cut: master data — tags (FR-24.1/24.2), master items and Vorlagen
(FR-24.3, FR-27.1, FR-28.8) — leaves `useSyncOrchestrator`, which drops from
2,714 to 2,396 lines. The moves are verbatim; the facade's return shape is
unchanged; fifteen seam cases construct the group with no `fetch`, no
WebSocket, no outbox and no orchestrator, and eleven mutations were dropped one
at a time and every one of them turned the spec red.

**Tags, items and Vorlagen are one group because FR-24.3 is one rule asked
twice.** The obvious cut is three modules along three tables. It is wrong here:
the reference count, the deletion outlook and the restore verdict are written
once and answered for both an item and a Vorlage, and `outlookOf` is the same
four lines for either. Splitting them puts one rule in two files, and the second
copy is the one that drifts.

**The item _photo_ deliberately stayed behind.** It is the same table, and the
last cut's own lesson was that one table is one group — but ADR-002 draws a line
straight through `items`: the bytes never enter the sync envelope, so
`setItemImage` and its two siblings queue no mutation at all. They need the API
client, the device store, the pull router and a drain; the twenty-two actions
that moved need a queue. Taking them along would have meant handing the group
the whole transport to carry three functions that share nothing with it but the
row they paint.

**This is the first group whose behaviour depends on the mode**, and that is
what `SyncContext` grew for: `local` decides whether a reference count of zero
is a fact or a guess (ADR-032). It is not a boolean, because the field the image
trio will want later is the store itself, and a group asks it only whether it
exists. The seam factory therefore takes it as an option and defaults it to
null — Server Mode — so a spec that wants the other answer passes an empty
stand-in rather than building a second context by hand.

**The guard that ADR-032 recorded as an accepted cost paid for itself.** The
extraction was green, typed and linted, and `masterListFiltering.spec.ts` failed
anyway: `masterItemDeletionOutlook` reads the _complete_ `templateList`, and the
allowlist that permits that read is keyed by file path, so moving the read
moved it out from under its classification. Nothing else would have caught it —
no rendered test sees which list a composable reads. It cost one line and a
reason, which is exactly what that enumeration exists to charge.

## The seam's queue started applying what it was handed (2026-08-27)

R-4's fourth cut moves the packing group — the pack-out (FR-25.2), FR-5.5's
skip with its FR-20.2 companions, M6's check-off (FR-25.11j), the per-row
assignments (FR-25.19/25.20) and FR-9.1's flags — out of the orchestrator,
which drops from 2,396 to 2,096 lines. Nineteen actions, no context growth:
they all want a queue, a trip store and the dependency rules, and the context
already carried every one of them.

**G-3's claim stayed behind**, though M4 renders it on the same row and M5 in
the same sheet. `packingNow` and `releaseClaim` write the device's own
`myLocks` bookkeeping, and `takeOverClaim` goes through the server rather than
the outbox because only the server may stamp who took over (FR-5.7, ADR-028,
invariant 3). None of that is a queue write, and a group that carried it would
have to carry the lock state with it.

**What the cut actually found is in the test double.** The seam context's
`enqueueAndDrain` recorded what it was handed and did nothing else, which was
enough for four groups. It is not enough for a group that writes twice and
reads its own first write back: `quickAddItem` adds a row and then resolves
FR-20.4's required companions _against the settled list_, so with a recording
double the companion never resolves and the case fails against correct code.
The double now applies each optimistic change to its store before recording,
the way the real one does — and that is the more faithful shape, so it stays
for the other five specs too. It is coarser than production in exactly one
way, written down where it is done: it routes by partition rather than by
table, so the master partition's per-trip tables (spec P-3) would land in the
wrong store. No group holding one has moved yet.

**One mutation in the sweep came back green, and it was the spec's fault.**
Hard-coding `buyItem`'s `from` argument to `'buy_local'` changed nothing,
because the case only ever passed `'buy_local'`. M6 has two lists; a case that
exercises one of them cannot tell an argument from a constant. The case now
passes `'buy_before'`, and the mutation is red. Twelve of thirteen had been
red on the first run, which is precisely why the thirteenth was worth having.
## A group that needed another group (2026-08-27)

R-4's fifth cut moves the FR-27.4 group refresh out of `useSyncOrchestrator`
into `composables/sync/actions/groupRefresh.ts`: derive, propose, accept,
decline, the sweep after a master pull, and the `proposals` state itself. The
orchestrator drops from 2,091 to 1,876 lines.

**It is the first group that depends on another one.** FR-27.7's preparation
tasks arrive on a refreshed position as ordinary FR-7.3 prep todos, which the
comment group already writes. The choice was to put `addPrepTodo` on
`SyncContext` — where every group would then see it — or to pass the comment
group in beside the context. It is the second: `createGroupRefreshActions(ctx,
commentActions)`. The spine is what a group needs to *reach* the system; an
edge to a named group is a fact about these two groups, and hiding it in a
field shared by all of them would make it invisible at the one place worth
seeing it, the wiring.

**The context grew by two, and both are seams rather than data.** `today` and
`tripDataLoaded` were closure functions the refresh read for free. `today` was
already an injected clock at the orchestrator's boundary, so moving it into
the context only carries an existing seam one level down. `tripDataLoaded` is
ADR-016's guard — "not pulled yet" must never read as "empty trip" — and a
predicate is exactly the shape a group should receive rather than reconstruct:
the group has no business knowing that Local Mode answers it with a hydration
flag and Server Mode with a set of loaded partitions.

**`change` and `tombstone` were their own imports wearing a closure.** Both
were declared under the refresh's header and used across the file, and both
turned out to be exact aliases of `localChange`/`localTombstone` from
`sync/optimistic.ts` — the extra `| null` in the parameter type was the only
difference, and no caller passed one. Rather than duplicating a six-line alias
into the new module or leaving a shadow behind, the aliases are gone and the
thirteen call sites name the import. The doc comment they carried said what
`optimistic.ts`'s own header already says.

**One mutation in the sweep is green on purpose, and it is written down where
it happens.** `proposeRefreshForLoadedTrips` skips a trip whose groups it no
longer follows; removing that check changes no outcome, because `planRefresh`
asks `followsGroups` itself and returns an empty plan. The guard is a cost
short-circuit — it avoids re-resolving every archived trip on the device after
every master pull — and no test can hold it, so the code now says so. Eight of
the nine mutations were red; a green one that is honest is worth more than a
red one arranged for.

The case that was worth rewriting is the other end of the same block. The
first version asserted that a plan proposing nothing writes nothing, which is
true and proves nothing: the branch it was aimed at only writes when the
ledger is *behind*. It now seeds a position already on the trip that no ledger
entry knows about — a row added by hand, or one whose entry never arrived —
and asserts that exactly one write goes out, the bookkeeping one, with no
question asked. That is the whole of what `proposeTripRefresh` is allowed to
do without an answer.
## The trip's own life, and a doc comment that had been written twice (2026-08-27)

R-4's sixth cut moves what changes a trip *after* it exists into
`composables/sync/actions/tripLifecycle.ts`: its own fields (FR-2.7), its
status, its roster, and FR-27.10's whole group added to a running trip. The
orchestrator drops from 1,876 to 1,572 lines.

**Creation deliberately stayed behind.** `createTripFromWizard` and `cloneTrip`
look like they belong here and do not: they write across both partitions in an
order the server's foreign keys dictate, and drain between them. What they are
about is the transport, not the trip, and a group that carried them would have
to carry `drainTrip` and `drainMaster` with it. They move when the transport is
cut.

**Three edges made the argument an object.** The refresh introduced the rule a
cut earlier — an edge between two groups is an argument, not a spine field —
with one edge and a positional parameter. This group has three: the roster
reaches FR-27.4 through the refresh, a group addition writes FR-27.7 tasks
through the comments and FR-20.4 companions through the packing group. Three
positional parameters is where that shape stops reading, so both call sites now
take a named `deps` object. The retrofit of `createGroupRefreshActions` cost one
line and one test call, which is the right price for having one pattern instead
of two.

**A move makes small wrongness visible, and two things surfaced.**

The first: `removeTraveler`'s doc comment existed **twice** — once correctly
above the function, and once above `packedRowsOf`, which it does not describe.
Reading the two blocks side by side in a 250-line region is what surfaced it;
in a 1,900-line file they are 40 lines apart and each reads fine alone. The
orphan is gone.

The second: `activateTrip` and `archiveTrip` passed `'active'` and `'archived'`
as string literals into `setTripStatus`, while `TRIP_STATUS_ACTIVE` and
`TRIP_STATUS_ARCHIVED` have existed in `types/domain.ts` since the constants
were named for exactly this — a typo in one of them compiles cleanly and simply
never matches (§4a). They name the constants now.

Neither is a defect anybody could have observed, and neither is why the cut was
made. They are recorded because they are the recurring argument *for* the cuts:
the file was not too long to work in, it was too long to notice things in.

Ten mutations, ten red. The verification was the same as the previous cuts — the
extracted body compared byte-for-byte against the pre-cut capture before the two
repairs were applied, so the move and the repairs are separable in review.
## The group that runs the other way round (2026-08-27)

R-4's seventh cut moves FR-9.2's review write-back and FR-27.5's fold of a
finished trip into `composables/sync/actions/postTrip.ts`. The orchestrator
drops from 1,572 to 1,452 lines.

**The two belong together for a reason none of the earlier groups had.** Every
other group takes master data as input and writes trip rows; these two take a
*trip* as input and write master data. Neither queues a mutation of its own —
both compose the master-data group's writers — so the whole module has exactly
one edge and no reach into the queue at all.

**The guard that has to refuse before the first write.** M21 creates a Vorlage
and possibly a group, and the name check runs ahead of both rather than in
front of each: half of M21's work landing before a refused name folds the trip
into nothing. That is the kind of ordering a move can silently invert, so it
has its own mutation — moving the check past the first write turns a case red.

**A test comment claimed more than the code does.** The bundle-name case was
first written with `'ferien  engadin'` against `'Ferien Engadin'`, on the
assumption that `foldName` collapses internal whitespace. It does not: it
trims and lower-cases, nothing else. The case failed against correct code,
which is the cheap way to find out — the comment now says what the function
does instead of what its name suggests. Worth noting because the same
assumption has already cost once: FR-27.13 recorded that the diacritics
folding it promised existed nowhere in the codebase either.

Eight mutations, eight red.
## A test that was red on every first attempt (2026-08-27)

While triaging a red e2e shard on an unrelated PR, `E2E-M2-12` turned out to
fail on its **first** attempt in every shard-2 run examined — including two on
`main` whose diffs had nothing to do with it. It was green only because
`retries: 1` gave it a second go. That is the trap PR #156 already recorded,
in its most expensive form: not a case that fabricates green once, but one
that has been fabricating it on `main` for days.

**The answer was in the screenshot, not the log.** The Playwright artifact of
the last *green* `main` run was downloaded and the failure image read: the trip
the wizard had just created rendered as **"Sep 26 – 5, 2026"** where the test
asked for 22 August → 5 September. Reproducing the string settled what was
stored — `formatRange(2026-09-26, 2026-09-05)` in `en` is exactly that, month
collapsed because both fall in September. So the trip held an end date
*before* its start.

**26 September is not a random date.** August and September 2026 both put a
Saturday at row 4, column 6 of a Monday-first grid: 22 August and 26 September.
The helper's click is a coordinate click into a calendar the component may
still be scrolling into place on open, and a point that lands one grid over
picks the day at the same row and column. The selector was never wrong — it
pinned day, month and year — the pixels were.

**Two defects, and only one of them was the test's.** The wizard accepted the
inverted pair without a word, and `durationDays` returned the negative
difference: that trip carried `duration_days = -20` into its row *and* into
generation, where duration is a quantity input. A user picking two dates in the
wrong order gets the same result with no race anywhere.

**A bound, not a validation** (FR-2.1d). The obvious fix is a check with a
message, on three screens — M3, M22 and the clone form all edit the pair. That
is three error states to word, three places to keep in step, and a fourth
surface tomorrow that forgets. Instead the date control carries `min`/`max`
and each field bounds the other's calendar, so the invalid pair is unreachable
rather than refused. What that buys is visible in the tests: the rule is one
component's two props, and each screen's spec asserts only that it wired them.

Two things the bound deliberately does **not** do. It does not constrain the
field's own *value*, so a row that already holds an inverted range — synced
from a device that predates this, or imported — still renders and is still
repairable from either end; M22's spec pins that. And it does not invent a
default: an unset counterpart is no restriction, because FR-2.1b makes both
dates optional and independent, and a bound defaulting to today would quietly
forbid the past that every archived trip lives in.

`durationDays` reads an inverted pair as **no length** rather than a negative
one — the absence every consumer already handles. It had no direct test at
all; it has four now.

**The helper stops clicking at coordinates.** The first attempt at this was a
bounded retry: click, check the day went active, click again. CI rejected it —
selecting a day re-renders the grids, so the very locator the check depended on
stopped matching and the case died on a timeout instead. The fix that works is
the one that removes the question: Ionic's day button carries a plain
`onClick`, so `dispatchEvent('click')` delivers the event to the element with
no coordinates and no hit-testing, and the scroll cannot get between them. The
cell is asserted **enabled** first, because dispatching would otherwise bypass
the `disabled` that FR-2.1d's own bound puts on an out-of-range day — a helper
that can set what the app refuses to offer is a worse tool than a flaky one.

The same CI run rejected the new e2e case for a plainer reason: it asserted on
September cells in a picker that opens on *today*. It re-opens a picker that
already holds a value now, which opens on that value's month — so the grid
under test is the same on any day of any year, rather than one that rots with
the calendar.

### A menu entry that navigated made the next screen invisible (2026-08-28)

Two owner decisions from the UX review, built together because both are about
the app's frame: the content stops at a 960 px column on wide screens (UX-17),
and M4's once-per-trip actions moved behind a ⋮ in the bar (UX-13's second
half). Neither is interesting on its own — the column is four CSS lines, and
the overflow is a flag on `HeaderAction` plus an action sheet. What the diff
cannot show is what the second one taught.

**The trap.** The first version passed each action's `onClick` straight to the
sheet button's `handler`, which is what every other menu in the app does. Every
other menu, though, acts on the screen it was opened from; this one navigates.
While an overlay is presented Ionic marks the router outlet `aria-hidden="true"`
and clears it on dismissal — and a handler that navigates runs *inside* that
teardown, so the flag stayed on the outlet. The result: the trip-properties
screen rendered completely, every control was clickable, `elementFromPoint` hit
the right button, and the whole page was **absent from the accessibility tree**.
A screen reader would have found nothing there at all.

**What found it, and what nearly missed it.** Not a new case — nine existing
specs that used to click the moved glyphs and now go through the fixture. Two
of them failed, and only because they locate a control with `getByRole`, which
reads the accessibility tree rather than the DOM. The new case for the feature
itself asserted `getByTestId(...)` and stayed green throughout, as did the
screenshot: the failure is invisible to every assertion that looks at pixels or
at test ids. `E2E-M4-57` now carries a `getByRole` assertion for exactly that
reason, mutation-proved against the unfixed build.

The fix is the pattern `exportTrip` in M2 already used and this code had not
copied: remember which entry was chosen, `await sheet.onDidDismiss()`, and run
it afterwards. **A menu entry that leaves the screen must not run inside the
menu's own handler** — and a scan of the other five action sheets confirmed this
was the only place doing it.

**One more measurement worth keeping.** Seventeen baselines were rewritten, and
the ones that mattered were the ones that did *not* go red: not a single mobile
scene failed although the M4 bar demonstrably changed, and `tab-dashboard`
stayed under the 0.002 tolerance on desktop too. That is the same
`--update-snapshots` blind spot §"M4's control column" recorded — confirmed
here in the other direction, where a stale baseline would have been kept rather
than a real change missed.


## A version that was named in a fourth place (2026-08-28)

Dependabot proposed `golang:1.26-alpine` → `1.27-alpine` on its own (#232) and
`scripts/toolchain-pins-gate.sh` refused it — working exactly as designed, and
the message named the other two files. Making all three agree (`Dockerfile`
tag *and* digest, `mise.toml`, the `go` directive in `go.mod`) turned the gate
green. `ci.yml` needed nothing, because every job reads
`go-version-file: go.mod`.

Then `go-lint` failed:

```
can't load config: the Go language version (go1.26) used to build golangci-lint
is lower than the targeted Go version (1.27.0)
```

**The premise that was wrong is the number three.** The gate was built around a
count — a major lives in *three* files — and that count was never the rule. The
rule is that anything which compiles or parses the module knows the language
version, and golangci-lint does both. It is a fourth place, and the gate could
not have caught it, because the gate did not know it existed.

**Why the gate now checks only half of the coupling.** The obvious ask after a
failure like this is "make the gate verify the linter is new enough for the go
directive". It cannot, honestly. The constraint is on the Go toolchain the
golangci-lint *release was built with*, and no file in this repository records
that. The tempting proxy is the linter's own `go.mod` — and it is a trap:
v2.13.2's says `go 1.26.0`, with a comment stating the minimum "must always be
latest-1". Read as an answer it says the release cannot handle 1.27, which is
false; it is the *minimum module* it supports, a different question. Only
running the binary answers, and `make ci` runs it one step later anyway.

So the gate does the part it can decide from files: **the linter version is
named twice** — `mise.toml` for `make ci`, the `golangci-lint-action`
`version:` for the pipeline — and those two must agree, because a lint result
that differs between the local gate and the pipeline is the same defect the
node/go checks exist to prevent, in a smaller costume. The go↔linter coupling
is carried in the failure hints instead of being asserted.

Two smaller things the extraction had to get right, both proved by mutation
rather than by reading: a bare `version:` is a key any action may carry, so the
match is scoped to the step that follows `golangci-lint-action` (a decoy
`version: v9.9` on a neighbouring step is ignored); and `sort -u` collapsing
the matches means "more than one line left" is the only way a workflow that
lints twice with two versions becomes visible.

**What it cost to find out:** nothing but a CI round, because the gate had
already stopped the bad half from merging. That is worth stating plainly — the
gate did not prevent this failure, and was never going to. It made it happen at
the right moment, on a branch, with a message naming files, instead of six
weeks later on a published artifact.

## Two screens nobody had ever rendered (2026-08-28)

The `server` project (ADR-029) named three areas it had not reached when it
landed: delegation, presence and the admin surface. Delegation came with
FR-25.19's control. These are the other two — E2E-M20-01…05 plus E2E-M17-09,
and E2E-G10-01 — and closing them closes the list.

**The premise worth writing down is how the two screens looked before the
first case ran.** Both were complete: M20 had its overview, its per-row
action sheet, its FR-23.3 confirmation and a pure `adminActionsFor` with its
own exhaustive unit; G-10 had its facepile, its pluralized hover title and a
unit for the one composed string on it. Both had been reviewed, both were
green everywhere. Neither carried a single `data-testid`, and that turned
out to be the whole story — three defects, one per surface plus one shared,
none of them reachable by anything but a rendered run with two identities.

**The facepile named nobody.** `initials()` took `PresenceUser.user_id`. `users.id` is
`lower(hex(randomblob(16)))`, so every face read as two random hex
characters that changed on each run. The component's comment explained it as
a stand-in "until user profiles sync to the client" — which had quietly
stopped being true: M4 resolves display names for the packing stamps and has
done for a while, and G-10 now takes the same `participants` map.

The assertion is on the initials `AL` and `BO` rather than on the faces
being there, and the reason is worth keeping: neither `L` nor `O` is a hex
digit, so the assertion is red against *any* build that initials the id, for
*any* ids the run mints. A test that only checked the faces existed would
have been green against the defect for the whole of its life.

**The group-sync badge had no reachable state.** This one only a run could produce, and it did — the case went red on
`presence-in-sync` with every assertion above it green.

`useWebSocket` had two senders side by side. `subscribe` queued into
`pendingChannels` when the socket was not open yet and flushed on `onopen`.
`sendCursor` dropped the frame. And the cursor is reported exactly once, the
moment the first drain returns — on a cold page load an HTTP pull regularly
beats the WebSocket handshake, so the report was thrown away and never
repeated. The server therefore never learned the device had caught up,
`in_sync` was false for everyone for ever, and "everyone has the latest
state" was a badge no state could produce.

Two details of the fix are decisions rather than mechanics. The held cursor
is **per trip, newest seq wins** — two drains racing to open must not leave
the server told the older of the two — and subscriptions flush **before**
cursors, because only a subscribed connection is in the presence list the
cursor exists to inform.

**A deactivated account was told nothing.** FR-23.3's enforcement is thorough on the server: a per-request check in the
`authed` middleware, a login that refuses outright, a refresh that deletes
the session row, and Go tests over all of it. The client had no branch on
`account_deactivated` anywhere — the generated `ERROR_CODE` object carried
the name and nothing read it.

What that meant in practice is the part worth recording: the tokens sit in
`localStorage` looking perfectly valid, so nothing expires them. The app
boots, every request 403s, and the result is **indistinguishable from being
offline** — the person is not logged out, not told, and their app simply
stops syncing. The client now ends the session on that error code and lands
back on the login screen, which is what makes the access half of E2E-M20-02
assertable on a rendered page rather than on a status code.

**It narrows on the code, not the status, and that is load-bearing.** A 403
is also how the server refuses a non-admin the M20 endpoints — E2E-M20-05
drives exactly that — so a fix written against `resp.status === 403` would
have logged Bob out for visiting `/admin`. The wider bug would have been
shipped by the narrower one's fix.

A fourth came from the *screenshot* rather than the run, which is worth
separating: M20's provisioning date used a bare `toLocaleDateString()` and so
followed the device, printing `28.8.2026` under English copy. That is exactly
what E2E-G2-01 found on the conflict log four days earlier — and a grep
confirmed the two were the complete set of bare `toLocale*` calls left in
`client/src`. The rule generalises past both: a date rendered without the
app's locale is a German date in an English app on every device the family
actually owns.

**And the finding that was filed as a design question and turned out not to
be one.** The review flagged M20's missing-avatar glyph as an owner call —
initials, a silhouette, or nothing. The owner asked for something better, and
the better thing was already in the repository: `UserAvatar` (FR-25.3), a
coloured circle of initials that M4 and M5 have drawn people with for weeks.
M20 had hand-rolled an `<img>`; so had M17, where the error handler hides the
element and leaves a hole, and where the `personCircleOutline` placeholder
written for that exact case sits behind `v-if="avatarUrl"` — a computed that
is non-null whenever `me` is, so the placeholder had never rendered once.

Two things worth keeping from it. **The picture goes over the initials, not
instead of them**, which makes the loading, absent and refused states one
state instead of three. And **the retry on a changed URL is load-bearing**:
FR-17.13 busts the cache with a query alone, so a `broken` flag that did not
reset would leave a picture the user had just uploaded hidden behind the
404 that preceded it. The letters take their size from two steps of the type
table rather than a fraction of the circle, because invariant 9b keeps type
values in `typography.css` — at 64 px the 24 px row size read as a typo.

**And G-10 was rebuilt rather than completed.** The per-person sheet was
left as an owner call; the owner asked for it solved, and the answer was to
not build it. Three things are worth keeping.

The gap was never only the tap: all three of G-10's sub-bullets diverged —
no overflow cap, a badge that appeared only in the good state and had no
amber, and nothing behind the tap — plus a fourth divergence one screen
away, where UI-Spec M2 asked for the facepile on the trip rows two lines
after G-10 says presence is meaningless outside a trip. **The wire settles
that one**: presence is broadcast per subscribed trip, so M2 would have had
to subscribe every listed row to draw circles on it. The M2 line is deleted.

**What a sheet could have shown is what the hover title already said.** The
event carries three fields, and on a phone there is no hover — that is the
whole real gap. When the badge goes amber the only useful question is *who*,
because you turn to that person. So the state went onto the faces and the
tap kept only the half a hover cannot give a touch device. The device count
went entirely: that somebody has the trip open twice is not something anyone
packing acts on, and it stays on the wire unrendered rather than being
removed from a contract for nothing.

**The badge follows the house indicator rather than inventing a chip**
(owner, 2026-08-28). The first build wrote *„1 catching up"* out in a chip
beside the pile. `SyncIndicator` had been carrying G-2's queue as a count in
a bubble on the glyph's corner all along, and the pile sits in a header that
already holds the trip's name — a second sentence there competes with it.
The words did not disappear, they moved: they are the element's
`aria-label`, so the state is not carried by colour alone, and the unit case
asserts the bubble's number and that name separately.

**One decision came out of the render, not the diff.** The first build
ringed everyone who *was* caught up, in green. On screen that makes the
ordinary state loud, repeats the badge beside it, and leaves the one person
worth noticing marked by an absence — the hardest thing to see. Amber on the
straggler inverts all three. It cost one commit's worth of rework and would
not have been visible in any review of the markup.

The testing split is forced rather than chosen: a device is behind only
while its reported cursor sits below the trip head, and the client reports
one the moment its pull returns, so no Playwright case can produce a lagging
device without racing it. E2E-G10-01 holds what a run can hold still; amber,
the ordering and the overflow are props-level cases, and the three states
went into the dev gallery so they can be looked at at all. The ordering rule
earns its own case — **the "+N" bubble must never hide somebody who is
behind**, or the pile summarises away the fact it exists to show.

**The isolation cost, and what was refused.** The mock IdP grew a third account. `carol` exists because these cases
*change* the account they act on and one backend serves the whole run with
the two spec files free to land on two workers: deactivating `bob` would
have reached sideways into the multi-user unit's trips mid-test. The one
irreversible action, resetting a display name, is the last step of the last
test that touches her — the row is addressed *by* that name.

Four things were deliberately not covered, and the ledger says so rather
than letting an id list imply otherwise: G-10's per-person sync list behind a
tap (it does not exist — the UI-Spec now says that instead of promising it),
the amber lagging-device state (producing a genuinely lagging device needs a
seam the production code does not have, and inventing one to watch a colour
is the wrong trade), FR-23.4's avatar reset (it changes no pixel on M20 —
same URL, same placeholder bytes, so it stays in `store/admin_test.go`), and
the split between FR-23.3's two exemptions (this instance has exactly one
admin, so the rendered case can only see the row that is both; the split is
exhaustive in `domain/__tests__/admin.spec.ts`).


## The sheet learns to put finished rows away (2026-08-29)

FR-25.13d wrote a rule down and gave a reason: a carried item stays listed in
the inventory browse-sheet, because hiding it would imply it does not exist.
The owner's request is the opposite, and the reason it is right is a number —
on the family instance the inventory is 191 items, so *„schon drin"* is most
of what the sheet renders while its whole job is showing what is missing. The
reason for the old rule does not survive that; what survives is the worry
behind it, which is why the reversal is opt-in, keeps a count, and offers
*„Trotzdem anzeigen"* wherever it can empty the list.

**The part worth recording is the one the request did not ask for.** The
obvious build is a filter: drop every carried id from the rendered list. It
passes every assertion anyone would write for the feature, and it breaks the
sheet — a tapped row disappears from under the finger, the rows below slide up
into the tap point, and the next tap in a run lands on the wrong item. It also
throws away FR-25.13d(b): the flip to *„schon drin"* **is** the sheet's
feedback, deliberately in place of a toast, and a hidden row gives none. So
hiding is a **snapshot** taken when the posture begins — at the switch, at a
tag change, at each opening — and never a live filter. What the run adds stays
where it was tapped and says *„hinzugefügt"*. The count follows the same clock
and deliberately does not tick up during the run: those rows are on screen, and
calling them hidden would contradict the screen.

Two smaller things the build settled:

- **The snapshot belongs in setup, not in `onMounted`.** The persistence test
  mounted with the switch already on and caught one frame in which every
  carried row rendered as *freshly added*, because the mount hook had not run
  yet. Nobody would have found that by looking at the sheet.
- **The "added" state was written in green and painted grey.** `.is-added`
  and `.carried-state` are both single-class rules and `.carried-state` is
  declared later, so it won — every test stayed green, because a test asserts
  the text and not the ink. The screenshot said it, which is the whole reason
  the rule about rendering a UI change exists; the fix is the two-class
  selector, and the comment beside it says why it is two.
- **A premise about the modal that turned out to be wrong, and cost a line of
  code before it did.** The sheet was keyed per opening on the assumption that
  `SheetModal` keeps its slot mounted, which would have handed the second visit
  the first visit's snapshot. Mutating the key away left the re-opening
  assertion green: Ionic destroys the modal's content on dismiss, so each
  opening is already a fresh creation. The key went, rather than staying as
  insurance nothing can fail against — E2E-M4-59's second half is what would
  catch a future Ionic changing its mind.

The count is scoped to the tag filter rather than to the inventory, because a
number that does not match what the screen would hide is one the user can catch
out; and the line is absent rather than reading zero, because a control that
would do nothing is furniture. No wire, no schema, no ADR: the tradeoff is the
FR-25.13d reversal, and FR-25.13e carries it with its own revisit trigger — a
switch that is permanently on means the default is wrong, and a switch nobody
flips means the line is clutter.
## The per-person model finally gets a writer (2026-08-29)

FR-25.21, ADR-036. Backlog item 22.

**The premise that was wrong for six weeks.** Per-traveler quantities were not a
missing *feature*; they were a missing *writer*. A per-person item has been N
`trip_items` rows with their own quantities since FR-25.1 chose rows over a
nested structure, and M4's cluster, M12's analytics and the FR-27.4 refresh have
all been reading that shape the whole time. FR-25.10 specified a multi-select in
July and shipped as a single-select popover, so the only state the app could
produce was *one* traveler. Everything downstream was correct and unreachable.
The lesson is not about this feature: **a model that supports something is not
evidence that anything can produce it**, and the readers being right is exactly
what hides it.

**The option that would have quietly cost the most.** Delete-and-recreate is the
obvious implementation — membership is a set, so replace the set. It scored
second in ADR-036's matrix and is wrong for a reason the matrix nearly buried:
comments (FR-7.1), preparation todos (FR-7.3) and `packed_count` hang off the
row, so *adding one traveler* to an item three people had already packed would
have deleted all of it. Keep-and-repoint costs a ladder and a confirm sentence,
and that is the trade. Its own accepted cost is written into the ADR: the
surviving row's history is the item's, not the traveler's.

**The reuse that paid twice, unplanned.** New rows take their ids from
`propagatedItemId` — ADR-016's helper, built for the FR-27.4 refresh. The first
payment is convergence: two devices converting the same shared row offline
produce one row per traveler instead of two. The second was not designed for and
is the better one: because the derivation is *the same*, the hand-made row and
the row a later template refresh would generate **are the same row**, so the
refresh adopts it through the path it already has for hand-added rows rather
than adding a duplicate beside it.

**A tab that was an action could only make a silent decision.** The first draft
had `Pro Person` write, matching the mockup's segment. With nobody picked yet the
only thing it could do was assign the item to whoever is first in the roster —
a row appearing on a named person's packing list because somebody tapped a tab.
It is a *view* switch now; checking a person is the write. This was invisible
until the e2e helpers were rewired and the two-step read absurd on paper.

**The mockup specified a control the house does not have.** The prototype drew an
*Übernehmen* button and the spec described it. The sheet grammar has no save
button at all — every control commits immediately (G-5, FR-25.15) — so the spec
was corrected against the code rather than the code built against the spec. Worth
keeping as a shape: **a mockup is a good way to decide what a screen says and a
bad way to decide how it commits**, because commit behaviour is a house rule that
lives in other screens, not in the picture.

**One rule the build changed.** A collapse back to *gemeinsam* now always
confirms, even when it destroys no packing progress — it takes the personal row
off *everyone's* list, and the resulting amount (the sum, not the largest) is
worth reading before it is written. A single traveler leaving still goes silently
when their row carries nothing. The e2e case that caught the asymmetry was the
one asserting the confirm appears.

The four e2e traps this cost — five callers of a deleted testid, the bundle
being what runs, G-6's missing stepper at quantity one, and a mounted Ionic
overlay — are in `dev-docs/e2e-tests.md` beside the cases, where the next person
writing a case will be standing.

**The review pass found the case texts had never been read back.** Two of the
three e2e cases were written to their own shape rather than to the sentences the
UI-Test-Spec carries for them, and the expensive one was E2E-M5-20: it promised
that a preparation todo written before a collapse survives it, and asserted only
the summed quantity. That clause is the whole argument for ADR-036 — a
delete-and-recreate collapse sums the amounts exactly as correctly and loses the
todo — so the decision's one distinguishing consequence was the one thing not
being tested. It is asserted now, and deleting the content ladder from
`survivorOf` reddens that case alone.

**And a case was invented for a promise that already had two.** The FR-25.6
follow-up was written up as a new id, E2E-M6-23. E2E-M6-05 and E2E-M6-06 have
said the same two things — one aggregated row naming its recipients, one
check-off settling every instance — since FR-25.6 was specified, and neither has
ever been implemented. The new id was deleted and the pair marked unimplemented
instead. The trap is specific and worth naming: **when a screen's promise has no
test, the absence looks identical to the promise never having been written**, and
searching the spec for the *behaviour* rather than for a free number is what
tells the two apart. The id search that was run found no collision because it
was looking for a free number, and found one.

## The sheet learns two verbs (2026-08-29)

FR-25.13f. The browse-sheet could add and, since FR-25.13e, put away what was
done; what it could not do was the decision actually being made while standing
in front of the wardrobe. *That is already packed* and *that stays home* both
existed as verbs — M4's checkbox and M4's press-and-hold — and both cost the
same three steps from inside the sheet: close it, find the row, act, come back.

**Three variants were rendered before one was written.** Two icon targets on
the line (A), a verb-mode bar in the sheet head deciding what a tap means (B),
and one target cycling through the states (C). The owner picked A, and the
reasoning is worth keeping because it is not the obvious one: B reads better on
a mockup — one target per line, the name keeps its width — and loses on the
actual task, because in front of a wardrobe the verb changes *per item* rather
than in runs, so the mode would be paid for on nearly every line and would fail
the way modes fail, silently. C was measured against the request rather than
against taste: *nicht einpacken* costs three taps in it.

**What the code cannot show.** A skip-add spends a row to record a decision
that would otherwise evaporate — that is the accepted cost, confirmed against
the cheaper option of offering ✕ only on carried lines. It is *not* flagged
*Missing* and pulls no companions, because "the plan forgot this" is the
opposite statement and the spare battery for a camera staying home is the one
offer nobody wants. And the sheet deliberately does not name the FR-20.2
companions a skip took along, which M4's snackbar does: there is no room on a
line for a list, the undo restores them regardless, and a half-list is worse
than none.

**The case that mattered most was the one no failing test asked for.** The
sheet now has two signals for the same line: FR-25.13e derives *added* from the
caller's carried set growing while the switch is on, and FR-25.13f's ledger
records what this run's tap actually did. They collide in exactly one place —
switch on, ✓ tapped on a free line — and there the derived signal would
overwrite *packed* with *added*. Reversing the two in the source left every
test green. The unit case that pins the precedence was written afterwards, and
only then did the mutation redden. The general shape is the one this log keeps
finding: **a second source of truth for one pixel is invisible until a test
names which one wins.**

**And the claim that the other two screens were untouched was false.** M6 and
M8 share this sheet, and the run ledger spoke for them too: a row tapped in
M8's picker started reading *„hinzugefügt · Rückgängig"* — an undo those
callers do not implement — where FR-25.13d has it say *„schon drin"*. Nothing
local caught it; E2E-M8-22 did, in both browsers. The ledger now speaks only
where the verbs do, which is what the sentence in the FR had always claimed.
The trap generalises: **a shared component gains a feature for one caller and
changes behaviour for all of them**, and the only place that shows is the
other callers' own cases.

A smaller one, paid for in a wasted red run: the FR-25.13e switch is a shared
module ref, so a new `describe` block that flips it hands its state to whatever
runs next. Two unrelated cases went red for it, and the first red run of the
precedence case was a false one — it failed on an absent toggle rather than on
the assertion, which is exactly the shape of a red-proof that proves nothing.

## The quick-add gets a mode, and two waiting cases did not land where they waited (2026-08-29)

FR-25.8 had been half-built for as long as it had existed: the amendment that
made a per-person item ordinary (FR-25.21) shipped its editor, and the composer
still had no way to say *pro Person*. The feature itself is small — a segment
above the field, a flag on the `add` event, and the caller opening the editor
the flag asks for — and two decisions in it are worth the entry.

**The row is written first, and the editor opens on it.** The obvious reading of
*„give it a different quantity per traveler in one step"* is a draft: collect the
membership in the composer, write N rows when it is confirmed. That was rejected,
and not on effort. The editor edits rows — it reads the cluster, asks
`planMembership` what a change would destroy, and words a confirm from the plan.
An editor able to work on a draft would need a second source of truth and a
second path through the same rules, which is exactly the duplication ADR-025 was
written to undo. The accepted cost is stated where it is paid: abandoning the
flow leaves an ordinary shared row behind — which is what typing the name asked
for.

**A blocked case is worth re-reading when it unblocks, because what unblocks it
is often not what it was written against.** E2E-M4-12 and E2E-M4-13 had sat in
`e2e-tests.md` for weeks under one sentence: they *„need FR-25.8's per-person
quick-add"*. Building it, neither landed. M4-12 describes the same rendered
outcome as M4-58 — one cluster, two children, no second top-level row wearing the
name — with the amounts equal instead of pulled apart, so implementing both would
have run one assertion set twice for a case id's sake. And M4-13's premise is
**gone**: it reads *„the same quick-add for a single traveler"*, and G-8 makes the
mode absent when there is nobody to distribute over. The state it promised —
FR-25.1's flat fallback, a lone member rendering as *„Kurze Hosen · Andy"* rather
than a one-child cluster — is reached by a membership of one, which E2E-M5-19
already walks through and was one assertion short of proving: it checked that no
cluster was drawn and never that the person was named. Reading the two entries
back against the feature that unblocked them cost minutes; writing the trip that
M4-13 asked for would have cost a test that proves nothing, against a control
that is not there.

**And one interaction had to be built rather than inherited.** The composer's
browse-sheet (FR-25.13d) adds a row per tap and stays open for the run. In the
new mode each add ends in the membership editor — a modal of M4's — and a modal
presented while that sheet is still up renders *behind* it: greyed, inert,
looking like nothing happened. Reading the code would not have shown it; the
screenshot did. The fix is the pattern the free-text line beside it already
used, waiting for the sheet's own dismissed signal before emitting. The case
that guards it asserts the checkbox can be **operated**, not that the editor is
visible — the broken build renders the editor perfectly well.

**A merge is where two features first meet, and the meeting is a decision.**
FR-25.13f landed on `main` while this branch was open: the browse-sheet's lines
grew two one-tap verbs. Neither PR conflicted on behaviour — git conflicted only
on adjacent lines — and the resolution that compiles is the one where a verb tap
in *Pro Person* mode quietly drops the mode. It also re-opens the defect this PR
had already paid for once: the editor presented while the sheet is still up
renders behind it. Both verbs therefore go through the same deferral as the plain
add, carrying their decision with them, and the case that pins it is a unit case,
because what it asserts is that **nothing** is emitted until the sheet's dismiss —
an absence needing a positive signal, which the later emit is.

**A lock that described the wrong thing (2026-08-29, found reviewing the
above).** FR-25.21 says the editor is read-only *„while any instance of the item
is claimed by somebody else"*, and it had shipped as a `locked` prop each caller
computed from the **one row the sheet was opened from**. On M5 that is nearly
always the same answer, which is why it stood. On the quick-add it cannot be:
the row was minted a moment earlier and can carry no claim at all, while its
folded-name key can still pull an older, claimed ad-hoc row of the same name
into the same cluster — and a conversion rewrites every row of it. The lock
moved into the sheet, where the cluster is known; the prop stays for a caller's
own reasons. The lesson generalises past this screen: **a rule about a set
cannot be evaluated by whoever holds one element of it**, and the surface that
made it visible was the one where the element is brand new.
## The shop stops asking three times for one purchase (2026-08-29)

FR-25.6 decided on 2026-08-07 that a per-person item is **one** buy row —
summed quantity, the recipients' names — because buying is a single act, and
that checking it off settles every instance. `ShoppingPage.vue` grouped by
category and checked off one row. It shipped that way and stayed that way for
three weeks.

**The premise that hid it**: nothing in the app could produce a per-person item
by hand until FR-25.21 landed the membership editor two days ago, so the wrong
rendering had no way to appear on anybody's screen. It was found by *reading*,
not by using — the FR-25.21 spec claimed M6 "needs no change at all", and
checking that claim against `ShoppingPage.vue` is what produced the finding.
The general shape is worth keeping: **an estimate that ticks screens off as
unchanged has to open each one**, or the spec inherits the assumption.

**The key is M4's own function, not a second one.** `clusterKeyOf` in
`domain/packingView.ts` — source item, else the folded name, and only for a row
with a traveler — is now exported as `perPersonKey` and used by
`domain/shoppingView.ts`. Writing M6 its own keying would have been three lines
and would have been a second answer to "which rows are the same item", free to
drift from the first the next time either screen learns something.

**Two things had to follow the aggregation, and neither was in the FR.**

- **The reveal below the list aggregates too.** A purchase made in one tap that
  comes back as three rows costs three taps to undo, which is the same defect
  wearing the undo's clothes.
- **Each tab's segment counts rows to buy**, not `trip_items` rows. A segment
  reading `Before departure (3)` over a list showing one row is the lie the
  aggregation exists to remove, restated one line higher.

**What the e2e ordering says about the product.** E2E-M6-05/06 set the
procurement mode *before* converting the item to per-person, because the
membership fan-out copies the surviving row's fields onto the rows it creates
(ADR-036) — setting it afterwards from M5 would set it on **one** instance and
leave the other two off the shopping list entirely. That is not a test detail:
a per-person item's mode is still a per-row decision, and nothing changes it
for the whole cluster in one act. Left as it is, deliberately — M5 opens on one
instance by construction (the route is `trip/{id}/item/{id}`), and a mode
control that silently reached five rows would be the FR-25.21 problem in
reverse.

## A rule that was complete and invisible (2026-08-30)

E2E-G3-04 was the last thing FR-25.21 owed: the two-identity case for the rule
that the membership editor is frozen by a claim on **any** instance of the item.
The rule itself had landed the day before, correct and unit-covered. Writing the
case is what showed that nothing on the screen said so.

**The gap is structural, not an oversight.** G-3's other surfaces all name their
holder, and the editor could inherit none of them. M5 carries a banner, but this
case opens the editor from an *unclaimed* sibling row — where M5 is, correctly,
not locked at all — so there is no banner to inherit. And the editor is an
`IonModal` presented *above* M5, so even where the banner exists it is covered.
What a person got was a sheet whose every control was dead, with no sentence
anywhere explaining why. A frozen editor and a broken one are the same screen.

So the fix that came out of writing the test is a product change rather than a
test fixture: the editor carries its own G-3 line, naming the holder off the
first claimed row of the cluster. The name needs the trip's people, which only a
caller has, so `participants` became a prop the way `ItemDetailSheet` already
takes it — the alternative, recomputing the directory-plus-roster join inside the
component, would have been a second answer to a question one already exists for.

**The positive half wanted a release, not a pack.** A claim ends three ways
(FR-5.7) and two of them were available here. Packing the claimed row would also
free it — and would take that row off the list Bob is looking at, changing two
things at once. The release changes exactly one, so the recovery that follows
measures the lock and nothing else. It is asserted on the **still-open** sheet:
reopening it would prove the editor works, which was never in doubt; staying open
proves the lock is read live rather than at mount.

**A helper had to change shape, and that is the general point.** `claimRow` took
an item name and built `m4-row-<name>` from it. A per-person item has no such
row — it is a cluster head with child rows — so the helper could not address the
row this case has to claim. Every convenience that encodes a screen's shape has
a feature that ends it; this one lasted six days.
## A row kept saying it was skipped after it had stopped being (2026-08-30)

Two features that never met in review met in use. FR-25.13f's ✕ writes an item
straight to *„zu Hause gelassen"* — `quantity: 0`, `state: 'skipped'`. FR-25.8's
per-person mode then opens the membership editor on that row, and membership
floors an amount at 1, because 0 is already FR-5.5's answer and one control must
not carry two decisions. So the row came back with a quantity of 1 and the
skipped state untouched, and `isDone` reads *skipped* as done: FR-25.2 took the
row off the list at the moment it was created. The user had added an item, given
Andy one of it, and watched nothing appear.

**The fix is a derivation, which is why it is small.** Two of the states are
descriptions of numbers — *skipped* is a quantity of nothing, *packed* means the
count reached the amount — and a conversion rewrites exactly those numbers. So
the rule is not "a conversion clears the state", which was the first thing
written down and would have thrown away a collapse where every instance really
was packed. It is: **the state falls back to *open* exactly when it has stopped
being true.** A collapse onto a partly packed sum reopens; a collapse where the
whole cluster was packed keeps its state; an in-progress claim describes a
person rather than a number and is none of the rule's business.

**Only one of the two cases is worth a question.** A packed row growing past its
count loses nothing — the count was already the truth and the state was the
thing that lagged. A *skipped* row taken along again undoes an answer somebody
gave, as a side effect of ticking a checkbox, so it is confirmed first and the
sentence names the item and the person. That asymmetry is the whole reason
`unskipped` exists on the plan rather than the caller inspecting states.

**Two fields are deliberately left alone.** `packed_at` and `packed_by_user_id`
survive a reopen, even though the row is no longer *packed*: those units really
were packed by that person and `packed_count` still says so. Clearing the
timestamp while keeping the name would render FR-25.17's stamp half-erased —
„gepackt von Andy" with no when — which is worse than a true stamp on a row that
has since grown.
## A row gets a door of its own, and the app keeps its old one (2026-08-30)

FR-24.4, ADR-038. The request was "a clean API I can use, and clean up with" —
and, a message later, "the API should also be used between frontend and backend".
The second half is the part worth recording, because it is a reasonable sentence
that the architecture cannot honour, and saying so was the whole design work.

**The frontend cannot use a REST delete as its write path.** Not a preference:
every client write goes into the outbox as a clocked mutation
(`enqueueAndDrain`), which is what lets it survive being offline, and Local Mode
has no server at all — deletion there runs entirely in the browser. A route the
client depended on would remove the feature from a supported mode (invariant 5).
Having it call the route when online and the outbox when not would leave *three*
write paths for one act, with the online one exercised in development and the
offline one — the one an offline-first app most needs confidence in — not. So
the two callers differ in transport and share the rule: `DeleteMasterRow` mints
the `mutation_id` and the HLC and hands an ordinary delete to the same
`ApplyMasterMutation` the push calls. The handler holds no decision at all,
which is the property that keeps the doors from drifting (ADR-025's lesson).

**An error code that nothing could emit, caught before it shipped.** The first
version had a `still_referenced` code and a 409 branch, copied from the shape of
the refusal the push can produce. It is unreachable for this endpoint's four
tables, and only checking made that visible: `items` and `templates` are
lifecycle tables, so a reference *retires* them (FR-24.3) instead of refusing;
`tags` and `template_items` appear in `blockingReferences` not at all. Both
branches were deleted, and the claim underneath them became
`TestDeletableTables_CannotBeRefusedAsStillReferenced_FR24_3` — a comment
asserting reachability rots, a test asserting it fails the day someone widens the
allowlist to a table that can be refused. The refusal path is still there, as
*one* branch: what it must never do is fall through to 200, because a refusal
reported as a deletion tells a cleanup script the row is gone while it is not.

**A test that asked three questions read as two defects.** The API test driving
all four routes seeded them the way the app would have the data — the position
pointing at both the item and the Vorlage — and then two subtests failed. Both
"failures" were correct behaviour: the item was *retired* because the position
referenced it, and the Vorlage's position was gone because the FK cascades. The
test had conflated routing, FR-24.3 and the cascade, and the fix was in the
seed, not in the code: every target is now a row nothing references, so the test
answers only the question it asks — *does each route delete from its own table* —
which is the copy-paste defect four near-identical registrations invite. The
retire and the cascade keep their own named tests. A failing test that turns out
to describe correct behaviour is a test that was measuring more than one thing.

**`retired` is read back, not inferred.** The response distinguishes FR-24.3's
two deletions by asking what became of the row after the mutation, rather than by
having the merge report it. That is not a second decision — the decision ran once,
inside the mutation — and it is the field the status code cannot carry: a 200 on a
retired row does not mean the row is gone, and without it a caller cleaning up
would have to pull the whole partition back down to find out what it had done.

## The amount finally says what it is in (2026-08-30)

Three owner decisions were settled on 2026-08-30; two of them closed
unchanged and are recorded where their rules live (the G-3 lock stays
advisory, CLAUDE.md item 14; M4's header keeps its name in the page rather
than the bar, UI-Spec M4). This is the third, and the only one with code.

**The setting had been described for months and never existed.** UI-Spec M10
named an *"instance currency"* from the concept round; the locale pass found
in August that nothing implemented it and corrected the spec to say amounts
are unit-less. That correction was honest and left the question open. It is
answered now: `JITPACK_CURRENCY`.

**The endpoint that looked like it would carry it could not.** `/auth/config`
is the one thing the client already asks the server before rendering, so it
was the obvious home — and it is wrong for exactly one reason: it answers 501
in Single-User Mode, *by design*, because that 501 is how the client discovers
the mode (invariant 5). Hanging an instance-wide display setting off it would
have hidden the currency from a mode that has one. Hence a second small
public endpoint, `GET /api/v1/instance/config`, scoped-path-first per ADR-027,
answering without a session because nothing in it is about a caller.

**Per instance, and the reason is not convenience.** A per-device or
locale-derived currency was the cheaper build — no endpoint at all — and it
produces a wrong answer rather than a limited one: `de-CH` and `de-DE` would
disagree about a number that belongs to neither of them, and two family
members would read the same jacket in two currencies. One database holds one
set of amounts. That is also why the value only ever labels: no rate, no
history, no second currency exists anywhere in the model, so a conversion
would have nothing to convert with.

**Local Mode's cost was accepted, not designed around.** It has no server, so
its amounts stay unit-less. The tempting fix — a device-level setting for that
mode alone — was rejected: it would make the currency a device opinion in the
one mode where it is least ambiguous, and give a single value two writers, the
shape ADR-025 exists to undo. The status quo is not a regression, and if this
ever matters the answer is a setting in *every* mode, not one bolted onto the
mode that lacks a server.

**A typo stops the server.** Ignoring a malformed code would leave exactly one
visible symptom — a missing label — which names neither cause nor fix. The
refusal at start-up names both.

## Seventeen unwritten cases, two worth writing (2026-08-30)

Backlog item 6 has always been a number that grows: 370 case ids in the
UI-Test-Spec, 250 with a test. M6 was the first screen taken through it, and it
had the widest gap — 17 of 22 ids unwritten, **none of them marked *not
implemented***, so every one read as a description of built behaviour.

Two of the 17 needed a new case. The other fifteen split three ways, and the
split is the point.

**Four were already asserted, under other ids.** M6-03 (free text into either
list) and M6-19 (a suggestion adopting its master item's category) are what
E2E-M6-01 does to *set up* its groups; M6-16's M6 half is the confirm button
every add in that case taps; M6-02's two promises were both in M6-17 and M6-22
already. Writing them as their own cases would have re-run existing assertions
for the sake of an id — the mistake this project made once before, when a
search for a free case *number* found one and the behaviour it described turned
out to have two cases already.

**Four described behaviour the app had deliberately reversed.** M6-11 still
promised that the ＋ FAB *„expands the quick-add and focuses it"* and that
*„an empty field collapses it on blur"*: M6 has no FAB, FR-25.13c removed the
focus because the keyboard covered the chips, and FR-25.13a removed the
blur-collapse because it reflowed the list under the next tap. M6-04 promised
M4's *„entry/badge hidden"* on an empty list, where the code says in its own
comment why the entry stays. Had these been written as specified, the suite
would have grown four green tests pinning four rules the app had already
argued its way out of.

**Eight described a screen nobody built** — FR-25.12's row sheet, FR-25.13a's
description and assignee fields, FR-25.11g's filter bar, FR-25.11k's search,
FR-25.6's per-item note. `ShoppingPage.vue` is 300 lines and imports two
components. That is not a coverage gap; writing those cases is building four
features. The owner retired all but FR-25.12's sheet, which is being built.

**The lesson is about the number.** A coverage count says how many promises have
no test; it says nothing about how many are worth one, and on this screen the
honest answer was two. **Read the promise against the screen before reading it
against the test** — an id existing means somebody once meant it, not that
anything answers to it. What made the difference cheap was doing it as one pass
over one screen rather than case by case across the spec.

One thing did have to be *added* rather than asserted: E2E-M6-17 reported that
a bought row went *„on the packing list"* and never went to look. The note was
a string. It now visits M4 and finds the row, and pinning the mutation to
`buy_before` reddens it.

## A blocked case that had quietly unblocked, and one that had quietly been covered (2026-08-30)

M4 through the same audit as M6, and the same seventeen-shaped number sorted
differently enough to be worth writing down. M6's unwritten ids were mostly
about a screen nobody had built. M4's were not: the screen is the most-built one
in the app, and its gaps were bookkeeping.

**Three findings, in the order they cost something.**

**1. A rule can be complete, correct and untestable, and the entry that names
it then stays open forever.** E2E-M4-30 has specified FR-25.19's "never both"
since the concept round — the packing record beats the assignment, a row carries
one right edge. The rule was implemented, and implemented correctly, as
`edgeAvatar` inside `PackingListPage.vue`. Nothing could reach it. The ledger
recorded the case as blocked on a second account, which was true of the
*rendered* half and not of the rule, and the rule is the part that can be got
wrong. Moving four lines into `domain/packingView.ts` produced five unit cases,
one of which is the one worth having: the edge is decided by the columns and not
by doneness, because FR-25.2's undo restores `packed_count` and `state` and
deliberately not the record — so a row can be open again *and* have been packed
by somebody, and deriving the edge from `done` swaps the avatar back at exactly
that moment. That case cannot exist while the function lives in a component.

**2. The blocked entries had been waiting on a blocker that was gone, in two
different ways, and only one of them was findable by grep.** E2E-M4-24/-30/-31
waited on a second account: ADR-029 supplied one on 2026-08-24 and nobody went
back. That much is ordinary. E2E-M4-16, -17 and half of -19 waited on "a screen
that can produce categorised, assigned rows" — and had in fact been **written
months earlier as unit tests**, nine of them, in `packingView.spec.ts`, carrying
no E2E id. So `git grep E2E-M4-16` confirmed a gap that reading the suite
refuted. This is not the failure recorded under E2E-M4-12/-13, where a case
unblocked and had to be re-*read*; here a case was covered and had to be
re-*found*. The ledger's own paragraph asserting the wait was still on is the
artefact that kept it invisible, and it has been rewritten rather than amended.

**3. Two spec sentences were describing a screen that had argued its way out of
them.** E2E-M4-05/-06 describe a swipe M4 lost when FR-5.5 replaced the gesture
rather than repairing it. E2E-M4-09 is sharper: it restates PRD_Base FR-7.2
("an item cannot be fully marked as ready until all nested tasks are Resolved"),
which the Addendum's FR-7.3 **overrides** — packing such a row is allowed and
produces the "packed with open prep" state. Refusing the tap would leave a
packed rucksack the app insists is empty. A retired sentence and a covered one
look identical from a coverage report; only reading the screen tells them apart.

**What the five new local cases cost, and what they buy.** Each asserts only the
half no unit can see. E2E-M4-25 is the one that earns a browser: FR-7.3's
open-prep must be derived from the todos at read time, and the prototype's
stored count meant resolving the last todo left the row on the list forever —
watching the badge go and the row leave is the only assertion that catches it,
and handing the view an empty `itemsWithOpenPrep` reddens it. E2E-M4-14 pins
M4's wiring rather than the cluster rule: the screen holds a full set and a
hidden-done one, and the wrong one flattens the surviving child the instant its
sibling is packed, moving the control the finger is already on. E2E-M4-24 splits
by what each mode can reach rather than waiting for the mode that can reach all
of it — the time and the clearing need no account, the name needs the server.

**Two anchors had to be added to reach any of it**, and both are the same
signature the M20 audit named: the M4 prep badge had no `data-testid`, and the
M5 todo checkbox was keyed by a generated id, which nothing could address. An
element keyed by a uuid is an element nobody ever asserted on.

**Left open for the owner, deliberately unretired.** M4-03 promises a container
chip the row never grew — M4 answers *which bag* by grouping, and a fifth mark
on the right edge is what FR-25.19 kept off it. M4-08 promises the amber
"packed with open prep" cast, which the Addendum realises on M5. Both are
plausible as features and wrong as silent retirements, so the entries say so and
no case claims them.

**A postscript the PR wrote about itself.** The entry above was drafted with a
recount in it — "272 of 383" against the 250/370 the M6 audit had measured the
same day. Both numbers are right and they are not comparable: the second grep
used a broader id pattern, so it is a second *method*, not a second
measurement. And a retired entry stays in the UI-Test-Spec struck through,
because a reader has to be able to find out why it went — which means every
naive recount counts it as a gap forever, and the number can only drift
upwards as the audit does its work. The headline figure was left where it was
and `CLAUDE.md` now says not to re-derive it. Measure a screen.

## Nine promises, three tests and three things that were never built (2026-08-30)

M2, taken through the same reading as M6 and M4: every unwritten case id read
as a promise, checked against the *built* screen, and sorted. Nine ids. Three
became tests, three were already covered or described something M2 never had,
and three turned out not to be missing tests at all.

**The whole slide menu had never been operated.** M2's row actions — export,
share, clone, start, archive, delete — carry `aria-label`s and, until this
change, one `data-testid` between them: `m2-share-<trip>`, asserted by
E2E-FLOW-01 as *present in the DOM* and never opened. That is the same
signature #242 read on M20: an absence of test ids is what a screen nobody
has driven looks like. Each option has an id now, and `openTripSwipe` /
`tripSwipeActions` sit in `fixtures.ts` beside the M4 menu's pair — the
sliding item is opened through its own `open()` rather than by simulating a
drag, because how far and how fast a swipe must travel is the animation's
business and a test that has to guess it fails for reasons that are not the
rule.

The three that were written:

- **E2E-M2-05** (`server`) is the one worth the two identities. `canDelete`
  reads the roster for the caller's own role, so outside a collaborative
  instance it is inert by design — the negative half exists nowhere but here.
  Bob, an Editor on Alice's shared trip, is offered every other action and not
  *Delete*; Alice is; her cancel leaves the trip where it was and her confirm
  takes it off both lists. Mutation-proved by making `canDelete` return
  `true`: red on Bob's half.
- **E2E-M2-06** is G-8's negative for *Share* on a device with no session,
  asserted against the row's other options so an empty menu cannot satisfy it.
- **E2E-M2-07** takes both branches of the export sheet, because one branch
  alone cannot tell a working choice from a constant. Mutation-proved by
  making `serializeTrip` always write `packed_count`.

**The finding is the other three.** M6 produced retirements and M4 produced
cases that were already covered; M2 produced a third kind, and it is the one
worth naming: **an unwritten case is as likely to be an unbuilt promise as a
missing test.**

- The list **still groups by series and sorts newest-first**. The concept
  review of 2026-08-08 decided the opposite — one flat list, the active trip
  first, upcoming ascending, archived descending, the series a *chip* on the
  row — and both the UI-Spec and the Addendum say so. `TripListPage` renders
  tappable series headers and sorts every segment through `tripOrderKey`
  descending. The case describing the decision had been filed as a second
  **E2E-M2-06**, colliding with the Share case; it is E2E-M2-15 now, and it
  stays unwritten, because a case written before the rebuild would leave a red
  suite pointing at work nobody has scheduled. E2E-M2-02, which describes the
  series headers, is its other half and is deliberately not written either:
  writing it would nail down behaviour two documents say should not exist.
- The row has **no participant avatars**. The UI-Spec removed the presence
  facepile on 2026-08-28 — G-10 is right that presence is meaningless off a
  specific trip — and left the words *„and participant avatars"* standing
  beside the removal. Travellers are not presence and need no subscription, so
  the question is real; it is an owner decision, not a gap.
- **`trips.imported` is written and read by nothing.** M15's migration sets
  it, the store carries it into `Trip.imported`, FR-16.2 and the UI-Spec both
  promise an *„Imported"* chip, and no surface renders one. It is the exact
  mirror of FR-25.19's `packer_user_id`, which #194 found with a reader and no
  writer — and the mirror is worth keeping in mind, because the two are found
  by opposite methods. A column nothing writes is caught by trying to produce
  the state through the app; a column nothing reads is caught only by asking
  what displays it.

None of the three is fixed here. This was an audit, and the audit's job is to
say which of its findings are tests and which are decisions.
## A credential that nothing remembers (2026-08-30)

FR-23.7, ADR-039. What was asked for was "API tokens, creatable in the UI and
on the CLI, listable and deletable, never in plaintext, shown once". What
shipped drops two of those on purpose, and the path from one to the other is
the part worth recording.

**The premise moved twice.** The first thing checking turned up is that a
long-lived credential was *already possible*: `authed` trusts any HS256 JWT
signed with the session secret, and the server names that mode on startup —
*"multi-user mode (externally minted session tokens)"*. So the feature was
never "credentials that outlive fifteen minutes". It was a way to make one
without hand-crafting a JWT, and — the only part that cost anything to decide
— whether it should be revocable and listable, which a signed token cannot be
without storage behind it.

**Then a measurement moved it again.** The concept's first draft designed the
stored version: a table, a two-part token, an indexed lookup, three endpoints,
a management screen. The argument against the cheap alternative was "you
cannot revoke", whose escape hatch — rotating `JITPACK_SESSION_SECRET` —
looked like a blunt instrument because it appeared to log everyone out. It
does not. Refresh tokens are opaque values stored hashed, not signed, so a
rotation voids only the fifteen-minute access tokens and every browser
recovers by itself. **Checking that one sentence deleted a table, a schema
change, three endpoints and a screen** — and under invariant 2 the schema
change was the expensive part, because it means every database rebuilt,
including the one holding real trips.

The caveat is the half that survives: `handleAuthRefresh` answers `501` where
no IdP is configured, so on such an instance a rotation *does* log everyone
out. That belongs in `docs/`, not only in an ADR, because the operator reading
it may not be on the comfortable case.

**The feature found a hole in something older.** `authed` established that a
subject was *not deactivated*, and the store answered "not deactivated" for an
id no row carries — so a credential naming nobody passed the gate. At fifteen
minutes that is almost unreachable. At ninety days it is not, because **a
token outlives the account it was minted for**. Existence and deactivation are
now one question, and the shape matters: an enum whose zero value denies,
rather than a pair of sentinel errors, so a caller that reads the value beside
a non-nil error cannot thereby grant access. `UserDeactivated` was deleted
rather than left beside it — an unsafe door that still opens gets used again.
The unknown subject is refused with the *same* answer a bad signature gets, so
probing cannot enumerate ids.

**One rule looks like the thing the concept refused, and is not.** §9 rejects
scopes, for the reason scopes deserve: a rule every handler must check is
silently wrong wherever it is forgotten. Refusing a token the right to mint
another token has the same silhouette. The difference is that a scope asks
*which resources may this credential touch* — open-ended, asked everywhere —
while this asks *may this credential extend its own life*, which has exactly
one place to be asked, because exactly one endpoint answers with a credential.
Without it a leaked token renews itself before its own expiry and `exp` — the
only bound an unmanaged token has — stops bounding anything.

**Single-User Mode is where invariant 5 had teeth here.** The usual story is
that an `authed`-gated endpoint is inert in that mode. This one would not have
been inert, it would have been *open*: `authed` is bypassed entirely there, so
the handler is reachable with no credential at all. It answers `501` as its
first statement, before it reads the body, and the test for it was written
before the handler.

**Two things the client had never done once.** Copying to a clipboard, and
showing a value in a monospace face. Both went where the invariants put them —
`client/src/lib/clipboard.ts` with the `execCommand` fallback a plain-http
instance needs, and a `.jp-mono` role in the type table — rather than inline
in the component, which is also what made the first testable and the second
pass the token gate. The reveal renders the token **as text** and then offers
to copy it, which is what lets the e2e case assert on what the person sees
instead of on a browser permission.

## A promise that was its own defect (2026-08-30)

M17 through the same reading as M6, M4 and M2. Seven unwritten case ids;
five became tests, one was retired with its reason, and one — the avatar
crop — stays blocked on a seam the production code still owes.

**The finding is E2E-M17-07, and it is a shape the three earlier screens did
not produce: the case's own wording was the defect.** It promised the
NFR-4.11 backup warning would be *„cleared after a YAML download"*, and
NFR-4.11 says, in as many words, that the export it is about is the **whole
device in one file**. M17 offers two YAML downloads, a single trip and a
single template, and both stamped `jitpack_last_export`: exporting one trip
silenced the warning about everything that file did not contain. Nothing
about it looks wrong in the diff that introduced it, because when it was
written M17's YAML *was* the only export the app had; the device backup
arrived beside it with ADR-015 and nobody went back to the stamp. Reading the
case against the requirement is what separated them, which is the whole
method — against the *screen* it looks correct, and the screen is not where
this one was decided.

Its tail is the part worth remembering: once the two partial exports stop
stamping, **nothing refreshed the banner at all**. It had only ever been
recomputed by the exports that should not have counted, so a device backup
taken on the G-2 sheet — a different component — left M17 warning for the
rest of the session about a backup that had just happened. The reminder now
recomputes on entering the screen. A wrong caller had been standing in for a
missing one.

**A control nobody had ever pressed.** Every theme assertion in the suite —
`colour-anchors`, `surfaces`, `visual` — seeds `jitpack_theme` into
`localStorage` and then checks the flavour. That proves the palette and says
nothing about the switch, which is the only way a user has to reach it.
E2E-M17-06 presses it, reloads, and presses it again; the second press is
what proves the reloaded toggle came back *on*, since a stale-off control
would turn Latte on a second time.

**Two scope labels meant a different screen than they said.** E2E-M17-03 was
`all` and described the JSON export and the CSV — which is the section a
*server* account sees. In Local Mode the data section is a different section
entirely (per-trip and per-template YAML, written client-side because there
is no server to ask), and in `single` there is no token, so the auth header
the promise is about is never sent. It is a `server` case, and it now says
so. E2E-M17-08 was `single/local` for a gate whose two halves are both false
in either.

**One retirement, with its reason.** E2E-M17-02's push registration is
unit-owned end to end — key fetch, subscribe, reuse, denial, unsupported,
unregister. What a rendered case would add is *„hides it where unsupported"*,
and that branch cannot be produced: Chromium and WebKit both carry
`PushManager`, so the flag is true in every project the suite has. The
control is *disabled* rather than hidden, and asserting `disabled` on an
Ionic toggle is the trap E2E-M17-05b was written around — a bound boolean
reflects onto no DOM attribute, so the case would have passed against the
branch being deleted.

**And E2E-M17-01, which is what the `server` project is for.** The store
refuses to create a suppressed notification and Go tests say so; the client's
toggle PUTs the preferences and a unit test says so; nothing said the switch
the user flips is the value the server then reads. The case asserts the
absence against two positives, because a toast that has not arrived yet looks
exactly like one that never will: the same pair of pages produces a
delegation toast before the preference is touched, and a **mention**
afterwards — riding the same connection, fired after the suppressed
delegation — is what says the channel is live and the delegation had its
chance. That second positive also proves the switch is per kind rather than a
mute, which is the actual promise.

**The case broke two others, and the reason is a category this file did not
have.** `multi-user.spec.ts` says in its header that the master partition is
shared across the run, so every test names its trip and its items uniquely.
A notification **preference** is neither: it belongs to the *account*. The
first version of E2E-M17-01 turned Bob's delegations off and left them off,
and E2E-NOTIFY-01 — which expects Bob to be told, in German — went red on a
run where everything about it was unchanged. Two things came out of fixing it.
**Carol is the right account**, and `mockIdp.mjs` already said why she exists:
to keep a case from reaching across into the multi-user unit's own accounts.
And **the preference is set through an idempotent helper and put back at the
end**, because a case that toggles blindly cannot survive its own retry —
which is precisely what happened next: the retry began with the preference
already off and failed on its *control* assertion, the one written to prove
the channel works.

Its other half was a wait that could not settle. The case re-entered the trip
after the settings detour and waited for a second WebSocket subscription;
`waitForEvent('websocket')` resolves on the next socket, and after a reload
that is the app's own connection rather than a trip subscription, so the wait
ran to the 180-second test timeout. It is gone — a notification is addressed
to the *user*, so it reaches whatever page they have open, and Carol simply
stays in her settings. The unit went from 4.5 minutes with a failure to 1.5
minutes green.

**A defect this audit found in the previous one.** #266 inserted E2E-M2-05 by
matching the opening line of an existing test, which put it between
E2E-G3-01's doc comment and the test that comment describes — so `main` has
been carrying a comment block that documents the wrong test since this
morning. It is the same shape as the orphaned comment #265 caught in its own
diff, and it merged this time because I matched on a test's first line
without reading what stood above it. Moved back; the lesson is that an
insertion marker has two neighbours.

**A note on the machine rather than the code**, because it cost real time
here: two sessions running `make e2e` in different worktrees collide on host
port 4173. The Playwright container runs `--network host`, so the second
run fails with *„http://localhost:4173 is already used"* and names neither
the other worktree nor the container. `docker inspect <id> --format
'{{range .Mounts}}{{.Source}}{{end}}'` is what answers whose run it is —
and if it is not yours, waiting is the only correct move.
## Six numbers that each meant two things (2026-08-30)

M5 is the third screen through the audit of backlog item 6, and the first
whose central finding is not a missing case.

**Its catalogue defined six ids twice.** `E2E-M5-06`, `-07`, `-09`, `-10`,
`-11` and `-12` each carried one promise from the original v1.0 list and a
different one from the §3.25 rebuild, in two blocks of the same section that
had never been reconciled. The suite implements the rebuild's meaning of
`-09`…`-12`, so four green tests stood in the ledger as coverage of four
promises nothing asserted, and the traceability matrix pointed seven FRs at
the invisible half.

**Neither diff that produced it was reviewable as a mistake.** `19d9826`
appended the FR-25.14/25.15 entries *above* a catalogue that already used
`-06` and `-07`, in one commit. `dd560d4`, the M4/M5 rebuild five days
later, appended `-09`…`-12` on top of an existing `-09`…`-12`. Both are pure
additions to a long bulleted list, and nothing in the repository compares an
id against itself. This is the failure mode that a coverage count is
actively bad at: the count went **up** each time.

**The resolution, and the option rejected.** Renumbering the older block was
the tidier-looking answer and was rejected: it moves ids that eleven live
artefacts already cite in their new sense, and it takes away the one thing
the project's retirement convention exists for — a reader arriving from an
old commit that names `E2E-M5-10` must land on a line saying what became of
it. The rule applied instead is that **a number means whatever the suite
implements**; the loser is struck through in place, re-headed *(v1.0
catalogue, shadowed)*, and says where its promise actually went. Only a
promise that survived *and* had nowhere to live took a fresh number, which
happened twice. The cost is stated rather than hidden: the section grows a
dozen struck lines that will never be deleted, and every naive recount will
go on counting them as gaps.

**The class is guarded now, and the guard found four more.** Nothing about
this was catchable by review: both offending diffs are pure additions to a
long bulleted list, one defined the same id twice inside a single commit, and
every automatic signal moved the *reassuring* way — the number of ids with a
test went up each time. That is precisely the shape a checklist is worst at,
so `scripts/case-id-gate.mjs` now fails on any id with more than one **live**
definition (a struck entry keeps its number on purpose and is a tombstone).
Running it for the first time turned up `E2E-M3-11`, `-12`, `-13` and
`E2E-M4-32` — four more live pairs, each carrying two unrelated promises, on
screens one of which had *just* been audited. They are a debt register inside
the gate, owed to those screens, and the register may only shrink: the gate
also fails when an entry in it has been fixed and not removed, so it cannot
quietly become a permanent allowlist.

**Sorted against the screen, the twelve went the way M6's and M4's had** —
four already asserted under other ids, four describing a screen that had
argued its way out of them, one never built, three real. The owner retired
the four and the unbuilt one, including FR-14.1's sparkline: leaving it
marked *owed* would have been the softer call, and it is not owed, because
the per-item history is offered where the quantity is actually decided.

**The finding underneath the collision is the one worth carrying.** FR-25.15
exists to say that the sheet's save indicator and G-2's glyph are two
statements — captured *here* versus reached the server — and that offline
"that difference is the entire story, so the two indicators must not be
merged into one". All four sheets that carry the indicator passed it
`syncStatus.state`: G-2's state, the exact thing named. Its precedence
returns `offline` before `syncing`, so on a device with no network an open
write rendered as **saved**, and on a connected one an unrelated background
pull rendered as *saving*. The requirement's own case was the broken one.

Three things about how it survived, each of which cost something elsewhere:

- **The doc comment quoted the requirement.** `SaveIndicator.vue` opens by
  restating the distinction in full, directly above the prop that collapses
  it. A comment agreeing with the spec is evidence about intent and none at
  all about behaviour, and here it read as a citation.
- **Its unit test pinned the defect as the rule.** The last case said
  *"reads every non-syncing state as settled — offline is a G-2 story, not
  this one"*. Offline is precisely this story. A test written from the
  implementation rather than from the requirement will always be green, and
  will always sound reasonable.
- **The id collision hid the entry that would have asked.** `E2E-M5-07`'s
  Block-A text — "asserts the indicator is separate from the G-2 sync glyph"
  — was shadowed by a `server` delegation case that *is* covered elsewhere,
  so the promise read as satisfied from every direction anyone looked.

**What the fix is.** `capturePending` on the orchestrator, counting this
device's own open writes — the Local Mode save, and the outbox's append to
IndexedDB — and blind to the connection. `SaveIndicator` takes a boolean and
no longer imports `SyncState`, which was the coupling. The signal is
deliberately narrower than the queue: a mutation the server has taken is
captured, and a drain rewriting the queue is not an edit, so only `enqueue`
moves the number.

**One rule, four templates — pinned at the call sites.** The indicator is
mounted by M5, M8, M10 and M11, and every one of them carried the same wrong
line; a behavioural case on M5 would have proved M5 and left the other three
exactly as they were. That is the review checklist's own trap, and the answer
here is a source scan rather than four near-identical mount cases:
`saveIndicatorWiring.spec.ts` reads every file under `client/src` and refuses
a call site handed the sync state, a call site not taking `capturePending`,
and a `SyncState` import in the component. It **counts the call sites it
found before judging any of them** — a scan whose glob silently matches
nothing satisfies every assertion it makes, which is the same false-green
shape as a test asserting that something did not happen. Proved by rewiring
one of the *other* three sheets: it reddens and names the file.

**No e2e claims it, and that is the honest half.** The ● is transient by
construction; a browser case could only race it, which this project treats
as worse than no case. The falsifiable assertions live where the signal is a
value somebody sets: five cases in `captureState.spec.ts`, three in
`ItemDetailSheet.spec.ts` — all three redden when the sheet is pointed back
at `syncStatus.state`, and nothing else moves. What the browser asserts is
the part that holds still: the sheet carries no save control, asserted
beside the indicator that stands instead of one.

**A last retirement, for the opposite reason to the others.** FR-7.3 ended
with "Resolution is restricted to the item's assignee or the trip owner",
enforced nowhere in client or server, and contradicting its own sentence two
lines earlier that the todos are visible to every trip member. It was struck
rather than built: the trip is already membership-gated, and a list where
anyone may read a preparation task but only two people may tick it is
friction with nothing behind it.


## Two ids on the wrong tests (2026-08-30)

Backlog item 6, fifth screen: **M9**. The read is the same as the four
before it — take each unwritten case id as a promise and check it against
the built screen — and it stopped at the first step, because two of M9's
"unwritten" ids turned out to be sitting on tests that implement something
else entirely.

`E2E-M9-02` promises *FAB → M10 in creation mode*. `E2E-M9-03` promises
*multi-select merge of duplicates*. The two tests carrying those names in
`inventory.spec.ts` assert the **tag axis filtering wider than it groups**
and the **lean row until the properties sheet says otherwise** — which are
`E2E-M9-06` and `E2E-M9-05`, both of which the spec file marked
*implemented* on the strength of those very tests.

It was never drift. `git log -S` puts both halves in one commit, `6ea6577`,
the §3.24 tag rebuild: the spec entries and the tests were written together
and mis-numbered against each other on the first day. The ledger's own
promise table in `e2e-tests.md` has always named 05 and 06 correctly, which
is the part worth noticing — the file that describes what the tests *do* was
right, and the file that names them was wrong, and neither one is read while
looking at the other.

**Nothing mechanical could have caught this.** Each id occurs exactly once,
so the case-id gate that came out of the M5 audit — which finds duplicates —
is green on it. The coverage total is identical either way: two ids covered,
two uncovered, before and after. A swap is invisible to every check that
counts, and visible to exactly one that does not: reading an id's sentence
against the body of the test underneath it.

**What the freed ids turned out to be.** Both sorted into shapes this backlog item has met before.

**E2E-M9-02 is retired**, not owed. `E2E-M10-01` asserts precisely what it
promises — it clicks `m9-fab` and then asserts the minimal creation form —
and twenty other cases enter the editor through that same FAB. A second id
over one behaviour is a second place for it to read covered.

**E2E-M9-03 is an unbuilt promise.** M9 has no multi-select and the client
has no merge. The id came from the UI-Spec's *Actions* line, written
2026-07; FR-16.3 is *Deduplication on **Import*** and is discharged by M15
and M18, so nothing was lost when the clause went unimplemented. It is left
untested on purpose, the same call as M2's three: a case written now leaves
a red suite pointing at unscheduled work.

What makes it worth an owner decision rather than a quiet deletion is that
the clause has a **second reader**. PRD FR-27.5 rejects fuzzy name matching
in M21 partly on the grounds that the two failure modes are asymmetric — *"a
duplicate master item is visible in M9 **and can be merged**, while a wrong
link silently hands the position somebody else's weight"*. The conclusion
still holds on the first half alone (the duplicate is visible, and each row
is deletable), but an argument resting on a capability nobody built is worth
knowing about before the next one leans on it too. Both documents now say so.

**Two real remainders.** **E2E-M9-04** — the empty inventory offering the spreadsheet import — had
never been rendered by anything. `m9-empty` appears once in the whole suite
before this case: in `E2E-G9-13`, as a `toHaveCount(0)` standing in for
"not the inventory screen". A test id that exists only to be *absent* is a
good marker for a state nobody has looked at.

**E2E-M9-10** is the word *searchable* in M9-01's own sentence. `E2E-G12-02`
asserts the magnifier opens this screen's field and no other screen's, and
then stops; the trip list's twin case types into it, M9's never did. The new
case types, and pins two things beyond the row count: the emptied group's
**heading** goes with its rows (the filter runs before the grouping, so a
heading over nothing is what a naive fix produces), and a term that matches
nothing raises the no-match state rather than G-7's empty one — which would
offer to import an inventory that already exists.

Two clauses of `E2E-M9-05` were unasserted and went in with the renumbering:
*exactly those* (enabling the weight must leave the tags off the row, which
is the whole reason FR-24.4 is three switches and not one) and the eye's
count **badge**, asserted from both sides, since "the badge reads 1" is
equally satisfied by a badge that always reads 1.

**One finding that belongs to another screen.** `E2E-G7-01` reads *"Each list screen (Trips/Templates/Items/Dashboard) shows
its empty state with the single primary CTA"* and asserts the **Dashboard**.
Templates is covered in `template-list.spec.ts`, Items is now M9-04, and
**M2's empty state is asserted nowhere and carries no test id at all** — its
G-7 CTA is the always-present `trips-new` FAB rather than anything the empty
state itself offers. One sentence naming four screens counted as four, which
is the same shape as the review rule about one rule written into N
templates. Recorded against the id; owed to M2's next pass, not built here.

## An assertion that was true before the click (2026-08-30)

Backlog item 6, screens M11 and M12. The first pair in this programme where
**every case id was already implemented** — seven for M11, seven for M12,
none unwritten, none swapped, none shadowed. On the count that started the
programme these two screens owed nothing at all, and the audit still found
two clauses with no test and two promises with no code.

**The shape: a clause whose assertion cannot fail.** E2E-M12-01 promises the
dimension switcher reaches *Person / Kategorie / Gepäck*. It clicked *Gepäck*
and asserted `analytics-slice-none` was visible — but the absence bucket is
keyed `''` in **every** dimension (that is deliberate: the key is whatever M4
facets on), and the trip's one item was uncategorized *and* unassigned. So the
element the case waited for was already on screen before the click, and a
segment button wired to nothing would have passed. The same case asserted the
weight KPI as `5.0 kg / 5.0 kg`, in a world of exactly one packed item: a
template printing `plannedWeight` on both sides of the slash satisfied it too.

The test for this shape is one question, and it is cheap enough to ask of
every assertion in a case that follows an action: **would this have passed
before the action?** It is not the same question as *„is there an assertion
for this clause"*, which both of these answered yes to, and it is not caught
by a mutation proof of the *case* either — the case was green, and nobody had
tried to redden it since the rebuild.

**What was hiding under it.** FR-10.4 says containers are the data source of
FR-8.2's *Luggage* dimension, and the traceability matrix has credited
E2E-M12-01 with surfacing it since the screen was rebuilt. No test had ever
put an item in a bag and opened M12 — the Gepäck view existed in the suite
only as that undischargeable click. Rewritten, the case now builds a bag
through M11's own FAB, assigns one of two weighted rows to it, packs that one,
and asserts two slices where Kategorie shows one, the bag named and carrying
its load. A dead segment now fails on the count alone, and packed and planned
are two different numbers.

**Two more credited-but-unasserted clauses**, both cheap once named. The
FR-25.15 matrix row credits E2E-M11-05 with *„no Save button"*; the case
asserted only that the save indicator is present. And FR-10.1 calls the
carrier optional — M11-05 hands a bag to a traveler and reads the name off the
card, and **nothing at any layer had ever taken a carrier off again**, so a
chip that could only assign was indistinguishable from one that toggles. The
first is an e2e absence with the visible indicator beside it as its positive
signal; the second is a write rule and went to the write layer, as a
`ContainerSheet` unit case.

**And two promises with a reader and no writer** — the shape FR-25.19's
`packer_user_id` and `trips.imported` had, found twice more here and left
untested on purpose, because a case written first is a red suite pointing at
work nobody scheduled:

- **FR-10.3's per-trip imbalance threshold.** `imbalanceThreshold()` reads
  `attributes.imbalance_threshold`, both container surfaces call it, and the
  domain unit test pins that an override is honoured. Nothing writes the key:
  the M3 wizard writes `season`, `transport_mode`, `accommodation` and `tags`;
  M16 writes the series' defaults of the same three; M22 does not touch
  attributes at all. Every imbalance the app has ever shown is measured
  against the default 15 %.
- **UI-Spec M11's *„and from M12"*.** `AnalyticsPage.vue` pushes exactly one
  route, `/trips/{id}`. Tapping a Gepäck bar sets the container facet on the
  packing list, which is FR-8.2's action and not this edge.

**The cost accepted:** the four M11 navigation helpers moved into
`fixtures.ts` so the M12 unit could build a bag, rather than being copied into
a second spec. That is the M9 unit's lesson taken as a rule — its two
byte-identical navigation sequences differed only in a missing wait, and only
the comparison found it — and it makes `fixtures.ts` a slightly busier shared
file for the sake of one flow that now exists once.

**A stale sentence found on the way**, unrelated to the tests: UI-Spec M12
still said M12's amounts stay unit-less because the instance has no configured
currency and one would be an owner decision. FR-21.9 built `JITPACK_CURRENCY`
the same week. The line was true when written, which is exactly how a spec
sentence survives being wrong — nothing re-reads a *States* bullet when a
different screen's feature lands.

## A row that could not count, and a segment nobody filled (2026-08-30)

Backlog item 6, sixth and seventh screens: **M7** and **M23**. Same method —
read each id as a list of promises and check each clause against the built
screen — and this pair produced no new shape, which is itself worth recording:
five audits in, the shapes are stable enough that the sorting is now the cheap
part and the reading is the whole cost.

**What the age of a catalogue does to it.** M7's ids were written before the
2026-08-15 variant pass rebuilt the screen, and three of them describe surfaces
that pass removed or never built. M7-01's *my-vs-published split* is FR-1.6's
MVP simplification seen from the wrong side: there is nothing to render, so
there is nothing to assert, and its other half (name and item count per row) is
E2E-M7-07's. M7-03's *name prompt* was not left unbuilt but **rejected** — the
name lives in the same sheet as the scope precisely so that no row exists
before the name does, which is a promise a `prompt()` cannot make. Both are
struck through with the case that keeps what they meant.

**A spec sentence that described an unbuilt menu as built.** E2E-M7-05 promises
*FAB "+" menu → Import from file → M18*. The FAB has no menu; it opens the
scope chooser. The UI-Test-Spec's own 2026-08-15 amendment already said the
entry was owed — and UI-Spec M7's *Actions* line said, in the same paragraph as
a dozen things that are true, that the menu offers it. Two documents, one
built screen, and only the one nobody reads while looking at the other was
right. The Actions line is corrected; whether the menu gets built is an owner
decision, because the *function* has a door — the header icon beside the page
title — and a second door is a preference, not a defect.

**The clause a green case could not see.** E2E-M7-07 has read *implemented*
since the M8 rebuild, and the ledger says so in a sentence titled *"E2E-M7-07
is complete since the M8 unit"*. It is not: the id promises the row's
**resolved** item count, *not 0 for a template with no own positions* — and the
M8 case that completed it builds its composition out of groups that are
**empty**. In that world the raw count and the resolved count are both 0, so a
row that read its own positions instead of resolving would have been green
there for as long as the case has existed. This is a different failure from the
ones the earlier audits found: not a missing test, not a wrong id, but a test
whose *world* cannot distinguish the rule from its negation. Giving the group
one position and reading the composed row is the whole fix, and the mutation
proves it.

**A screen's search is usually covered as far as opening the field.** M9's
audit found this the same day, one screen over, and M7 had it too: G-12's case
asserts the magnifier opens *this* screen's field, and nothing typed. M7's
States line promises two empty states painted into one element — nothing at
all, which names both scopes and drops the segment, and nothing *matching*,
which says *„Keine Vorlage gefunden"* and keeps it, because there is something
to widen back to. Only the first had a case. The pattern is worth generalising
before the next screen: **wherever a list has a search, check whether anything
types into it.**

**A cost one screen declined, paid once for two.** M23-01/02/03 keep every
clause they make — this screen was written together with its cases and they did
not drift. What the reading found is what all three have in common: each
retires an **item**, and FR-24.3 governs items *and* Vorlagen, which M23 builds
from two separate row builders. The Vorlagen segment had never held a row in
any test, and E2E-M23-01 uses its *emptiness* as a positive control — a control
that says nothing unless the list can be non-empty. The Vorlage **retire**
branch was unrendered anywhere too, and for a reason that was written down:
E2E-M7-11 covers the remove branch and states that reaching the retire branch
through the UI means generating a whole trip for one sentence. That accounting
was right for one sentence and wrong for four — the retire confirm's other
wording, the Vorlagen list, the purge button correctly absent while the trip
holds the row, and the restore — so E2E-M23-04 spends the trip once and
collects all of them. **A declined cost is worth re-adding up when a second
screen wants the same setup.**

The mutation for it is the one this screen is actually exposed to: M23's two
row builders differ only in which orchestrator call each field holds, so
pointing the template row's `restore` at `restoreMasterItem` type-checks and
looks right. It reddens the new case and leaves the three item cases green,
which is also the proof that the new case is exercising the template path
rather than re-rendering the item one.

## The debt register empties, and one clause of it was never built (2026-08-30)

`case-id-gate.mjs` shipped with four inherited collisions in it — `E2E-M3-11`,
`-12`, `-13` and `E2E-M4-32`. This is the register emptied, and the register is
meant to stay empty: the gate fails on a new collision rather than growing a
line for it.

**In all four the suite carried the first-listed meaning**, and three of the
shadowed halves were plain duplicates of ids implemented under their own
number — M3-15, M3-16 and M3-14 respectively.

**M3-13 nearly went through on a summary.** Its shadowed text made three
promises where the live entry makes one: the M17 configuration, the *order*,
and that a traveller can still be removed. They are all genuinely asserted —
but only reading E2E-M3-14's **test body** shows it, and a retirement justified
by a sentence that merely sounds equivalent is exactly how a promise
disappears. The rule the earlier audits wrote for spec text applies to
retirement too: read the clauses, not the summary.

**M4-32 is where the collision's cost stops being an argument.** Its clauses
split three ways. The required pull and the co-skip are E2E-M4-40. That
*suggested* companions do not join unasked became covered only the day before
this, by E2E-M5-23 — so for the whole time the collision stood, that promise
was unasserted **and** unreadable as a gap, because the number rendered as
implemented while the suite carried an unrelated case under it. The defect this
gate exists for produced a real, dated hole.

**The third clause was never built.** *„…pulls its required companions onto the
trip and reports it"*: `addRequiredCompanions` returns nothing and no caller
raises a snackbar, so the companion appears silently. FR-20.2's *skip* does
name what it took along, which is what makes the add's silence read as an
omission rather than a decision — but it is a product question, so it is an
owner decision with no case, the treatment the M2 audit gave its three unkept
promises.

**Left undone on purpose, and worth a number.** Of 300 case ids in the suite,
**78 live only in a comment above a test, not in its title.** Every audit so far
has leaned on `git grep <id>` to find gaps, and that is precisely the search
those 78 defeat — the M4 audit already lost time to one. It is a convention
drift across the whole suite rather than four defects, and folding it into a
four-entry cleanup would bury it.
