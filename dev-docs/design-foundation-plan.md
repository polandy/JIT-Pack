# The design foundation — what to build before the next screen rebuild

**Status:** agreed with the owner 2026-08-14, not started.
**Sequencing:** this comes **before** the remaining screen rebuilds in CLAUDE.md
"Not built yet" item 3 (M7/M8, M9/M10, M11, M12, M14).

## Why it comes first

M4 and M5 were rebuilt from the concept prototype and merged (#73), and the
comparison afterwards was unambiguous: the **information architecture** landed
faithfully — facet filter, reveal bars, clusters, one header line — while the
**form language** did not. The gap is not a redesign. It is four missing token
layers plus one missing interaction, and each one acts on every screen at once:

| Layer | `UI_Concept_Prototype.html` | `client/src` today |
|---|---|---|
| Display / UI font | Fraunces + Hanken Grotesk | **no `font-family` anywhere**; Ionic's platform stack |
| Brand accent | peach — logo, FAB, eyebrows, active phase; blue only for counters and links | `--ion-color-primary: var(--ct-blue)`; **peach demoted to `warning`** |
| Radius / elevation | `--r:18px`, `--r-lg:26px`, a two-layer `--shadow` | no tokens; magic numbers 14/22/999px |
| Card surface | `base` on `mantle` on a tinted `crust` — three planes | `.group-card` is `--ct-mantle` on `--ct-mantle`: **the page's own colour** |
| Pack feedback | check-pop, row animates out, undo snackbar | the row is dropped from the array and vanishes next tick |

Doing this after the six remaining rebuilds would mean building the same gap six
more times and then touching all six again. Doing it first means each rebuild
starts from the tokens.

**Every value below was verified against the running code and the prototype on
2026-08-14** — where a line number is given, it was read, not assumed.

## Working rules for all five PRs

- One PR each, own worktree under `.claude/worktrees/`, branched from `origin/main`.
  Roughly ≤ 500 lines; the point of splitting is that each step can be looked at.
- **Render it and let the owner eyeball it *before* asking for the merge go-ahead.**
  Not after. This was the chronically-owed step the review found, and it is the
  one gate a token PR cannot be judged without.
- `make ci` green before finishing; `make e2e` where a case is added.
- Speak German to the owner, write code and docs in English.
- Runtime claims get verified by running the thing, not by reading the code path
  (see the 2026-08-14 entry in `implementation-log.md` for what that cost).

---

## PR 1 — Typography

**Status: done** — `feat/design-typography`, FR-21.5/FR-21.6 and G-13.

**The single biggest lever: one new CSS file changes every view.**

The prototype loads its fonts from Google (`UI_Concept_Prototype.html:7-9`), which
NFR-4.3 rules out for the app. Self-host instead, as subset woff2 under
`client/src/assets/fonts/` — **latin + latin-ext**, because the German catalogue
needs the extended range.

- **Fraunces**, variable, `opsz 9..144`, weights 400/500/600 → `--jp-font-display`
- **Hanken Grotesk**, weights 400/500/600/700 → `--jp-font-ui`

New `client/src/theme/typography.css`, imported beside `catppuccin.css`:
`@font-face` with `font-display: swap`, the two family tokens, a type scale, and
`--ion-font-family: var(--jp-font-ui)`.

Where the prototype puts the serif — **corrected while implementing PR 1: the
table below is a sample, not the complete set.** The prototype also sets the
display face on `.ihead .iname` (24px), `.greet h2` (28px), `.atot .box .n`
(22px) and `.footer-note .big` (19px), and puts `.qrow .formula` in a mono
stack. The scale shipped in `typography.css` covers all of them; do not treat a
count read off this table as exhaustive next time.

| Prototype | Role | Value |
|---|---|---|
| `.appbar .title` | app-bar title | 18.5px / 600 / `-0.01em` |
| `.hero h2` | hero and trip titles | 26px / 600 / `-0.01em` |
| `.stat .n` | the big KPI numbers | 28px / 600 |
| `.caption h1` | page title | 34px / 600 |
| `.appbar .sub` | app-bar subtitle | UI face, 12px / 500 |
| `body` | everything else | UI face |

Also add `font-variant-numeric: tabular-nums` to the KPI figures — only
`QuantityStepper.vue:139` has it today, so the M4 header numbers jitter as they
count.

**Owes a spec entry.** No document mentions these fonts at all: they exist only
inside the two prototype HTML files. This PR writes the type system up as a
global pattern in `UI_Spec_v1.10.md` beside G-11, plus an FR in
`PRD_Addendum_v2.10.md` §3.21.

**Done when:** the app renders in Fraunces/Hanken Grotesk with no network request
for a font, and the owner has seen M4 and M2 side by side with the prototype.

**A trip row's name is not a title** — the second correction found while
implementing. The prototype sets M2's rows in the UI face (`.li .nm`), so a
blanket `h1, h2 { font-family: display }` would be wrong: it would put every
card title in the serif and flatten the very hierarchy the serif exists to
state. The face follows the role, never the tag; G-13 says so explicitly.

## PR 2 — Colour anchors

~30 lines in the Ionic mapping block of `client/src/theme/catppuccin.css`
(the block starting at line 118).

The concept's relationship is **peach = brand, blue = action, green/teal = done**.
The client inverts it: `--ion-color-primary: var(--ct-blue)` (line 132) paints
tabs, FAB, checkboxes and segments, and peach is mapped to `warning` (line 160).
That single line is why the app reads as a default Ionic app.

- Tab bar and `NavRail` active state → peach
- FAB → peach→rose gradient with the prototype's peach glow
  (`box-shadow: 0 14px 30px -8px rgba(250,179,135,.55)`, prototype line 137)
- Checked checkboxes/toggles and progress bars → green/teal
- `--ion-color-primary` **stays blue** — it is the action colour, not the brand

Clear the loud `var(--x, #literal)` fallbacks in the same pass (invariant 9):
`AnalyticsPage.vue:200/208/214` (`#eee`, `#7aa7e0`, `#3b6fb5` — literal Ionic
blue, the most conspicuous), `ContainerPage.vue:262/289`, `NavRail.vue:43-44`,
`TripListPage.vue:439`, `PresenceFacepile.vue:71`, `ImportPage.vue:328`,
`PortableImportPage.vue:181`, `AvatarCropModal.vue:207`.

Amend G-11 in the UI-Spec to name the three roles.

## PR 3 — Surfaces and token table 9b

`catppuccin.css` carries colour and nothing else — a grep for `--space`,
`--radius`, `--gap`, `--font`, `--shadow` across `client/src` returns **zero
hits**, while the client holds 185 hand-written typographic declarations and
radius magic numbers 14/22/999px.

Add the non-colour tokens:

- radius: `--jp-r: 18px`, `--jp-r-lg: 26px` (the prototype's `--r` / `--r-lg`)
- a spacing scale
- `--jp-shadow`, two-layer, matching the prototype's inset highlight plus soft
  drop: `0 1px 0 rgba(255,255,255,.02) inset, 0 12px 30px -12px rgba(0,0,0,.6)`.
  **This needs a `--ct-crust-rgb` triplet added to both flavour blocks** — there
  is none today, which is exactly why the shadows below were written raw.

Then `.jp-card` — `--ct-base` on `--ct-mantle`, 1px `--ct-surface0` border,
`--jp-r`, `--jp-shadow` — applied to:

- the M4 group card, `PackingListPage.vue:1213-1219`, which today sets
  `background: var(--ct-mantle)` (identical to `--ion-background-color`,
  `catppuccin.css:118`) and cancels its children's `base` background at line 1222,
  so the only thing separating card from page is a 1px hairline;
- the M2 trip card.

**Retire the three invariant-9 violations #73 left**, now that they have a token
to move onto: `FilterSheet.vue:198`, `PackingListPage.vue:1036` and `:1054`.
They were deliberately left out of PR #80 for exactly this reason.

**Gate it.** Extend invariant 9 → **9b** in `CLAUDE.md` and add
`scripts/design-tokens-gate.mjs` — Node built-ins only, no new dependency, the
same shape as `scripts/coverage-gate.sh` — rejecting raw hex/`rgb()` and bare
`px` in `client/src` outside the token files, with a narrow allowlist. Wire it
into `make ci` and the client CI job. Without the gate the next six screens
invent their magic numbers again.

## PR 4 — Pack-out choreography and undo

**No new requirement is needed. FR-25.2 already specifies this in full** — check
`PRD_Addendum_v2.10.md:220` before writing anything:

> Disappearing is **animated** (a brief green flash + control pop, then the row
> collapses to zero height and fades — ~0.3 s) so the pack registers visibly
> rather than the item just vanishing, and an **undo snackbar**
> („\<name\>" gepackt ✓ · Rückgängig) gives an immediate correction path.

What runs today: `packingView.ts:311` drops the packed row from the array and
Vue removes the node on the next tick. The snap is the entire feedback channel,
and a mistap has no way back. There is no `<Transition>`, no `<TransitionGroup>`
and no enter/leave `@keyframes` anywhere in `client/src`.

Half the wiring already exists and is unused: **`packing.packedToast` is defined
in both catalogues** (`en.ts:54`, `de.ts:51`) with **zero call sites** — it was
specified and translated, then never called. `packing.undo` exists too but is
currently the swipe action that un-*skips* an item (`PackingListPage.vue:791`,
`:879`), so the undo-pack string is new.

Build: a `<TransitionGroup>` leave transition (height + opacity) on the M4 row, a
check-pop on the control, the snackbar, and the revert. Guard everything with
`prefers-reduced-motion`.

**Ships a running Playwright case:** pack a row → assert the toast on the visible
page (`ion-router-outlet > .ion-page:not(.ion-page-hidden)`) → undo → assert the
row is back. Run Playwright with `use: { reducedMotion: 'reduce' }` so the
assertion never races the animation. No `waitForTimeout`, ever. Add the case to
`UI_Test_Spec_v1.0.md` and the `e2e-tests.md` ledger, and **check the id is not
already taken** — two duplicate ids were found in two review passes on #80.

## PR 5 — Visual baselines and a dev gallery

"Looks right" is untestable today: no `toHaveScreenshot` anywhere, no baselines.
Naive baselines would be flaky — `client/playwright.config.ts:44-46` runs chromium
*and* webkit, **both desktop viewports**, for a phone-first app the prototype
draws at 390 px, and the dev machine is macOS while CI is Linux.

That is a real tradeoff, so it **owes ADR-013**: baselines are chromium-only in a
digest-pinned Playwright container (invariant 8), which the self-hosted fonts from
PR 1 make stable, and they run at a 390 px mobile viewport as well as desktop.

- a `visual` Playwright project, excluded from the default run, driven by a
  `make visual` target
- `client/e2e/visual.spec.ts` — the six M4 states and the four tab roots
- a dev-only gallery route (`import.meta.env.DEV`, beside the existing
  `client/src/dev/sampleTrip.ts`) rendering the global components in each state
- update `e2e-tests.md` and the UI-Test-Spec

This is what turns the owner's eyeball pass from a permanent debt into a one-time
acceptance per change.

---

## Not in this plan

The screen work stays on the backlog and follows the foundation. Two of its items
are already root-caused, so they are cheap when their turn comes:

- **Dashboard "No active trips" while a trip is planned** — `DashboardPage.vue:33`
  filters `status === 'active'`, but the wizard creates every trip as `'planning'`
  (`useMutations.ts:384`) and nothing flips it automatically. `TripListPage.vue:61`
  has the same defect, which is why M2 also opens empty.
- **M2's "0/0 packed"** — `kpis()` reads `trip_items`, which lives on the per-trip
  sync partition; boot calls `drainMaster()` only (`App.vue:101-103`), so the
  numbers appear after a pull-to-refresh. Local Mode does not reproduce it.

The i18n migration continues per screen: ~260 hard-coded English strings remain
across 27 of 37 SFCs, worst `TripWizardPage.vue` (26 beyond step 1, which is
done), `SeriesPage.vue` (22), `SettingsPage.vue` (21, and mixed — it imports
`t()` *and* hard-codes).

Also visible and deliberately deferred: M3's header title
(*"New trip · step 1/4"*) and its Next/Back buttons are still English while step 1
is German — a language mix on a screen #80 touched, left because those strings
predate it.
