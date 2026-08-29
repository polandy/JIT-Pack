# E2E tests (Playwright)

Headless-browser tests driving the **built** client. Scope and per-case
coverage are specified in [`dev-docs/UI_Test_Spec_v1.0.md`](../../dev-docs/UI_Test_Spec_v1.0.md);
this directory is the implementation of that spec.

## Running

```bash
npm run build            # vite preview serves the dist bundle
npm run test:e2e         # chromium + webkit, headless
npm run test:e2e -- --project=chromium   # one browser
npm run test:e2e:ui      # Playwright UI mode (local debugging)
```

The config's `webServer` runs `vite preview`, so a build must exist
(`npm run build`). CI builds the client in an earlier step and caches the
Playwright browser binaries by package version.

### The full suite runs on CI, not on the maintainer's machine

Owner, 2026-08-15. Chromium _and_ WebKit over the whole suite is several
minutes of full CPU on a machine somebody is also using, and CI runs it on
every push anyway, so a local run is duplicated work that only delays the
answer. Push, then read `gh pr checks <PR>`.

What stays local, because it is seconds and the feedback loop is the point:
rendering a handful of screenshots for the eyeball pass, and running the
_one_ spec file while proving a new guard red-then-green.

Note the `e2e` job is deliberately **not** a required check on `main` (see
CLAUDE.md), so read its result rather than assuming it gates the merge.

### Running locally on NixOS

Playwright's downloaded browsers are generic-linux, dynamically-linked
binaries that NixOS can't launch out of the box (`stub-ld`). CI
(ubuntu-latest) is unaffected.

Use the official image, pinned to the **exact** `@playwright/test`
version in `package-lock.json` — a mismatch fails with "Executable
doesn't exist":

```bash
docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -e CI=1 \
  -v "$PWD":/w -w /w/client --network host \
  mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test
```

`--user`/`HOME` are not optional: without them the run leaves
root-owned `test-results/` and `node_modules/.cache` behind in your
worktree. `--network host` lets the container reach the `vite preview`
server the config starts.

Providing browsers from nixpkgs (`playwright-driver.browsers`) does
_not_ currently work: Playwright launches `chrome-headless-shell`,
which that derivation does not ship, so every test fails at browser
launch. Use the container.

For the **visual baselines** the image is pinned by digest instead, in
`scripts/visual.sh` — see ADR-013. Local and CI must render in the same
userland there, which a tag cannot guarantee.

`--update-snapshots` rewrites only the baselines whose diff is **over the
per-image tolerance**, and says nothing about the rest. A layout change that
stays under it therefore leaves `make visual` green *and* reports nothing to
write — which has twice now hidden a real defect, most recently a segment
label truncated at 390 px. When you changed a layout and the baselines do not
move, force them and look at the picture:

```bash
scripts/visual.sh --update-snapshots=all -g "trips"    # the screens you touched
```

## Layout

- `fixtures.ts` — the shared `test`/`expect` plus run-mode seeding
  (`seedMode`), which writes the same localStorage keys the app uses
  (`jitpack_mode`, `jitpack_server_url`, `jitpack_theme`) before boot.
- `smoke.spec.ts` — the backend-free floor: M19 mode selection + Local
  Mode dashboard. Proves the harness works end to end.
- `trip-creation.spec.ts` — M3 in Local Mode, and the origin of
  `createTripViaWizard`: the seed helper every later unit uses to get a
  trip without injecting rows.

Which spec cases are actually implemented is tracked in
[`dev-docs/e2e-tests.md`](../../dev-docs/e2e-tests.md).

## Conventions

- **Selectors:** `data-testid` only (added to components as cases land) —
  never text or CSS-class selectors, so tests survive copy/refactor.
- **Modes:** `local` needs no server. `single` (spec §2.2) boots a real
  Single-User `jitpackd` behind the preview proxy — the `single` project,
  gated on `E2E_BACKEND=1` because it needs the prebuilt Go binary; run it
  with `make e2e-single`, specs live under `e2e/single/`, and the harness
  notes are in the config and `dev-docs/e2e-tests.md`. The mock IdP for
  `server` multi-client cases (spec §2.3) is still future work.
- **No sleeps:** use Playwright's clock/`expect` polling, never fixed
  waits (spec §2.4).
- **Never assert `toBeEnabled()` on an `ion-button`.** Ionic buttons are
  custom elements, not native controls, so Playwright reports them as
  enabled even when they are visibly disabled — the assertion passes
  unconditionally and proves nothing. Assert
  `toHaveAttribute('aria-disabled', 'true')` for the blocked state, and
  prove the unblocked state by clicking and asserting what changed.
- **Ionic inputs:** `getByTestId('x')` resolves the `<ion-input>` host;
  fill its inner element via `.locator('input')`.
- **The behaviour projects run at desktop width, where there is no tab
  bar.** `chromium` and `webkit` use the `Desktop Chrome`/`Desktop Safari`
  device profiles, and above the G-9 breakpoint the app navigates through the
  desktop column instead — so a case that leaves a screen by clicking
  `tab-items` fails in *both* browsers with a 60 s timeout on an element that
  resolves but is never visible. Leave a screen the way the app does at that
  width: through a drill-down and back out via the `header-back` chevron
  (ADR-011). A case that genuinely needs the bar sets
  `page.setViewportSize(MOBILE)` first, as `global-nav.spec.ts` does.
- **Tags:** `@smoke`, `@local`, `@single`, `@server`, plus `@mNN` per
  screen — run a slice with `npm run test:e2e -- --grep @local`.
