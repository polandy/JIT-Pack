# E2E tests (Playwright)

Headless-browser tests driving the **built** client. This file is the on-ramp:
how to run one, what vocabulary to write it in, and the conventions that are
binding. Two neighbours:

- [`dev-docs/UI_Test_Spec_v1.0.md`](../../dev-docs/UI_Test_Spec_v1.0.md) — what
  the suite is _supposed_ to cover, per screen, with the traceability matrix.
- [`dev-docs/e2e-tests.md`](../../dev-docs/e2e-tests.md) — the ledger of what it
  **actually** covers, and what is owed. It opens with an index; scan that and
  open only what it names.

## Run it

Every command builds `client/dist` first, because the Playwright config's
`webServer` is `vite preview` and it serves that directory. All of them run
inside the pinned Playwright image (`scripts/e2e.sh`), which is what makes them
work on this NixOS host — see [Why a container](#why-a-container).

```bash
make e2e                                       # everything: chromium + webkit
make client-build && scripts/e2e.sh -g "E2E-M5-05"        # one case, by id
make client-build && scripts/e2e.sh packing-list.spec.ts  # one file
make client-build && scripts/e2e.sh --project=chromium    # one browser
make e2e-single                                # the Single-User project (§2.2)
make e2e-server                                # the multi-identity project (§2.3)
```

Anything after `scripts/e2e.sh` is passed straight to `playwright test`, so its
own flags work — `--repeat-each=8` to hunt a flake, `--workers=1` to read a
serial failure. The run is headless; what you read afterwards is the HTML
report in `client/playwright-report/` and the trace it keeps for every failure.

Reach for the **make targets** for the two backend-backed projects rather than
driving `scripts/e2e.sh` yourself: they also build `jitpackd-e2e` at the repo
root (CGO-free, so the container can run it off the mount) and set the
`E2E_BACKEND` / `E2E_SERVER` flags that put those projects into the config's
project list at all.

Two worktrees cannot run the suite at once: `--network host` means the preview
server and the backends bind **host** ports. Override with `E2E_PORT`,
`E2E_API_PORT`, `E2E_SERVER_API_PORT`, `E2E_IDP_PORT`, `E2E_SERVER_PORT` —
`scripts/e2e.sh` forwards each into the container when it is set, because
Playwright's own message for a busy port names the port and not the cause.

### The full suite runs on CI, not on the maintainer's machine

Owner, 2026-08-15. Chromium _and_ WebKit over the whole suite is several
minutes of full CPU on a machine somebody is also using, and CI runs it on
every push anyway, so a local run is duplicated work that only delays the
answer. Push, then read `gh pr checks <PR>`.

What stays local, because it is seconds and the feedback loop is the point:
rendering a handful of screenshots for the eyeball pass, and running the _one_
spec file while proving a new case red-then-green. **A timing measured here is
worth nothing without the load average** — a parallel session has been measured
turning a 100 s run into 370 s.

Note the `e2e` job is deliberately **not** a required check on `main` (see
CLAUDE.md), so read its result rather than assuming it gates the merge.

### Why a container

Playwright's downloaded browsers are generic-linux, dynamically-linked binaries
that NixOS can't launch (`stub-ld`); nixpkgs' `playwright-driver.browsers` does
not ship `chrome-headless-shell`, which is what Playwright actually launches, so
that route fails at browser launch on every test. CI (ubuntu-latest) is
unaffected — the container is also what keeps the WebKit system libraries out of
the runner, which was **1124 s of a 1776 s job** when they were installed per
run.

`scripts/e2e.sh` pins the image to the exact `@playwright/test` version in
`package-lock.json` and refuses to start on a mismatch, because the symptom
otherwise is "Executable doesn't exist". It passes `--user`/`HOME` so the run
leaves no root-owned `test-results/` behind, which `git worktree remove` would
refuse to clean up.

### Visual baselines are a different script

`make visual` / `make visual-update` go through `scripts/visual.sh`, which pins
the image **by digest** rather than by version (ADR-013): local and CI must
render in the same userland, which a tag cannot guarantee.

`--update-snapshots` rewrites only the baselines whose diff is over the
per-image tolerance — `maxDiffPixelRatio: 0.002` in `playwright.config.ts`, so
about 650 pixels of the 390×844 mobile shot — and says nothing about the rest. A
layout change that stays under it leaves `make visual` green _and_ reports
nothing to write, which has twice hidden a real defect; most recently three
segment labels truncated at 390 px. When you changed a layout and the baselines
do not move, force them and look at the picture:

```bash
scripts/visual.sh --update-snapshots=all -g "trips"    # the screens you touched
```

## The helpers — write your case in this vocabulary

`helpers/` is **the only place a shared step is written**. Write it there and
import it; `scripts/e2e-helpers-gate.mjs` (in `make ci` and the CI client job)
refuses the visible-page selector spelled out anywhere else, and refuses a
re-declaration of nine named helpers — **nine of the thirty-eight below**, so
the gate is a floor and not a guarantee. Writing this catalogue found the gap
it leaves: `group-to-trip.spec.ts` carried its own `addToGroup`, identical to
the shared one minus the leading `writesLanded`, which is the settle-step drift
the gate's own docblock describes. The reason is not tidiness: before the gate the selector had
fifteen copies under three names, `fillIonic` seven and `createItem` four, and
the copies had already drifted in _which_ settle step they waited for. Two
copies of one navigation sequence are how the M9 unit lost a wait, and no e2e
job can see it — both copies run, both pass, until one of them stops.

| Module                  | Drives                         | Exports                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers/page.ts`       | any screen                     | `visiblePage` (the one live `.ion-page`), `writesLanded` (the device has every write it made — the wait before any `page.goto` that follows one), `useReducedMotion`, `DESKTOP_BREAKPOINT`                                  |
| `helpers/ionic.ts`      | any form                       | `fillIonic`, `chooseInSelect`, `setDateField`                                                                                                                                                                               |
| `helpers/trips.ts`      | M2 list, M3 wizard             | `createTripViaWizard`, `createTripFollowingGroup`, `openTripFromList`, `expectTripOpen`, `openQuickAdd`, `tripAction`/`tripActions`/`TRIP_ACTION`, `expectTripActionOffered`/`…Absent`, `openTripSwipe`, `tripSwipeActions` |
| `helpers/m4.ts`         | M4 packing list                | `tripWithRows`, `startTrip`, `packRow`, `row`, `openRowMenu`, `chooseInRowMenu`, `assignTraveler`                                                                                                                           |
| `helpers/templates.ts`  | M7 list, M8 editor, M10 editor | `createTemplate`, `addPosition`, `includeGroup`, `addToGroup`, `createMasterItem`, `backToTemplateList`                                                                                                                     |
| `helpers/m9.ts`         | M9 inventory                   | `createItem`, `backToInventory`                                                                                                                                                                                             |
| `helpers/containers.ts` | M11 luggage                    | `openLuggage`, `createContainer`, `assignToContainer`, `closeContainerSheet`                                                                                                                                                |
| `serverMode.ts`         | the `server` project           | `bootPage`, `watchSubscribed` (the socket is subscribed, not merely open), `quickAddItem`, `packItem`, `uniq`                                                                                                               |
| `server/fixtures.ts`    | the `server` project           | `loginAs`, `shareWith`, `ACCOUNT_NAMES` (four mock-IdP accounts)                                                                                                                                                            |

`fixtures.ts` re-exports `page`, `ionic`, `templates`, `trips` and `containers`,
so those come from `'./fixtures'` along with `test`/`expect`. **`m4.ts` and
`m9.ts` are not re-exported** — import them by path, as every spec that uses
them does.

`fixtures.ts` itself owns the two things that are about the _run_ rather than
about a screen: `seedMode` (writes `jitpack_mode`, `jitpack_server_url`,
`jitpack_theme`, `jitpack_locale` before boot, the same keys the app writes) and
the automatic `oneLivePage` check (ADR-012: the outlet shows exactly one page
after every case).

`routes.ts` and `fabAnchors.ts` re-export `src/router/paths` and
`src/lib/fabAnchors` — use `PATH.trips` and `FAB_ANCHOR.m4` rather than
retyping a URL or an id, so a rename in the app breaks the suite at compile
time instead of at runtime.

## Conventions

Binding. This is their one home — the ledger links here rather than restating
them.

- **`data-testid` only.** Never text or CSS-class selectors. Adding the missing
  testids to a component is part of writing the case, and the attribute is the
  contract: renaming one is a breaking change to the suite.
- **Assert what is rendered, never only the URL.** Scope to `visiblePage(page)`.
  Four navigation defects were found by hand while both screen suites were
  green, every one of them keeping `expect(page).toHaveURL(...)` green — the
  address moved and the screen did not.
- **Cover the global patterns, not only your screen.** Reaching a screen,
  leaving it, and what the app bar shows afterwards live in `global-nav.spec.ts`.
- **No sleeps, ever.** `expect` retries on its own; assert the outcome, never
  wait a fixed time for it. If a case can only pass by waiting and hoping, the
  fault is in the production code — give it a deterministic seam. `writesLanded`
  exists because E2E-M4-32 needed to know when the data was actually on disk.
- **Seed through the app, not around it** (spec §2.4). `createTripViaWizard` and
  friends. A fast path that writes rows directly is allowed only for `server`
  preconditions that are not themselves under test.
- **Ionic inputs need `.locator('input')`.** `getByTestId('x')` resolves the
  `<ion-input>` host; the fillable element is the `<input>` inside it — or use
  `fillIonic`.
- **Never assert `toBeEnabled()` on an `ion-button`.** They are custom elements,
  not native controls, so Playwright reports them enabled even when they are
  visibly disabled: the assertion passes unconditionally and proves nothing.
  Assert `toHaveAttribute('aria-disabled', 'true')` for the blocked state, and
  prove the unblocked one by clicking and asserting what changed.
- **A `row-*` locator is always scoped.** `QuantityStepper` renders
  `row-check`/`row-minus`/`row-plus` for M4's rows, M5's packing block and M8
  alike — the ids name the _control_, which is right. While M5 is open the list
  behind it is still painted, so an unscoped `getByTestId('row-check')` is
  genuinely ambiguous. Scope to `m5-sheet` or `m4-row-<name>`, never to the page.
- **A uuid in a DOM `id` is not always a missing testid.** `ItemDetailSheet`'s
  note articles carry `id="comment-<uuid>"` because that is production's own
  scroll target for the G-4 `?comment=` deep link. The addressable handle sits
  beside it as `m5-note-<body>`.
- **An archived trip takes two clicks.** `m4-archive` opens the closing pass;
  **`m4-pass-finish` is what archives** (FR-9.3). Every case needing an archived
  trip goes `m4-start` → `m4-archive` → `m4-pass-finish`. Skipping the pass
  without marking anything is a supported path.
- **A case id in a title is a coverage claim.** `scripts/case-id-gate.mjs`
  refuses a duplicate definition; when two collided, the loser is struck through
  in the ledger in place and says where its promise went, never renumbered.
- **Tags:** `@smoke`, `@local`, `@single`, `@server`, plus `@mNN` per screen.
  Run a slice with `scripts/e2e.sh --grep @local`.
- **One unit per PR.** Two PRs that each add cases collide on the same
  `data-testid` names and the same helpers, and git merges both cleanly while
  the suite breaks. After merging `main` into a long-lived branch, re-check that
  the testids and helper names you added are still unique.

### The trap that costs an hour: the behaviour projects run at desktop width

`chromium` and `webkit` use the `Desktop Chrome`/`Desktop Safari` device
profiles, so every case runs at 1280×720 — above the 900 px
`DESKTOP_BREAKPOINT`, where `TabBar` is `display: none` and `NavRail` takes
over. Both are always in the DOM, so a case that leaves a screen by clicking
`tab-items` does not fail fast: it times out after 60 s on an element that
_resolves_ and is never visible, in both browsers.

Leave the screen the way the app does at that width — a drill-down and back out
through the `header-back` chevron (ADR-011) — or click the rail's own
`rail-<anchor>`. A case that genuinely needs the bar calls `setViewportSize`
with a phone size first, as `global-nav.spec.ts` does. That size is a per-spec
constant today and the suite holds six different ones, some of them deliberate
(a _short_ viewport tests overflow, a 430 px one tests a large phone); read the
neighbouring cases before copying a number.

## Layout

- `fixtures.ts` — `test`/`expect`, `seedMode`, `oneLivePage`, and the re-exports
  above.
- `helpers/` — one module per seam; the table above is the catalogue.
- `serverMode.ts`, `server/` — the `server` project: a real `jitpackd` in OIDC
  mode against the mock IdP in `server/mockIdp.mjs`, two browser contexts logged
  in as two accounts.
- `single/` — the `single` project: a real Single-User `jitpackd` behind the
  preview proxy, auth bypassed.
- `smoke.spec.ts` — the backend-free floor: M19 mode selection plus the Local
  Mode dashboard. Proves the harness works end to end.
- `trip-creation.spec.ts` — M3 in Local Mode, and the origin of
  `createTripViaWizard`: the seed helper every later unit uses to get a trip
  without injecting rows.

**The suite is type-checked** (`client/tsconfig.e2e.json`, referenced from
`tsconfig.json`, so `npm run build` covers it). Until 2026-09-03 it was in no
project at all, and a typo in a spec — a renamed helper, a dropped argument —
surfaced only when Playwright reached that line, in a container, minutes later.
Adding it found five undefined-index bugs and a helper that would have walked
the date picker towards `NaN`. `prettier` covers this directory for the same
reason.
