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
  mcr.microsoft.com/playwright:v1.61.1-noble npx playwright test
```

`--user`/`HOME` are not optional: without them the run leaves
root-owned `test-results/` and `node_modules/.cache` behind in your
worktree. `--network host` lets the container reach the `vite preview`
server the config starts.

Providing browsers from nixpkgs (`playwright-driver.browsers`) does
*not* currently work: Playwright 1.61 launches `chrome-headless-shell`,
which that derivation does not ship, so every test fails at browser
launch. Use the container.

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
- **Modes:** `local` needs no server; `single`/`server` (spec §2.2/§2.3)
  start a real `jitpackd` — that harness (and the mock IdP for `server`
  multi-client cases) is added in later milestones per spec §10.
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
- **Tags:** `@smoke`, `@local`, `@single`, `@server`, plus `@mNN` per
  screen — run a slice with `npm run test:e2e -- --grep @local`.
