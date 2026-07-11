# E2E tests (Playwright)

Headless-browser tests driving the **built** client. Scope and per-case
coverage are specified in [`docs/UI_Test_Spec_v1.0.md`](../../docs/UI_Test_Spec_v1.0.md);
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
(ubuntu-latest) is unaffected. On a NixOS dev machine, provide the
browsers from nixpkgs instead of the downloaded ones, e.g.:

```bash
nix shell nixpkgs#playwright-driver.browsers
export PLAYWRIGHT_BROWSERS_PATH="$(nix eval --raw nixpkgs#playwright-driver.browsers)"
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
npm run test:e2e -- --project=chromium
```

(Chromium works this way; WebKit from nixpkgs may lag the pinned
`@playwright/test` version — pin-match or run WebKit in CI only.)

## Layout

- `fixtures.ts` — the shared `test`/`expect` plus run-mode seeding
  (`seedMode`), which writes the same localStorage keys the app uses
  (`jitpack_mode`, `jitpack_server_url`, `jitpack_theme`) before boot.
- `smoke.spec.ts` — the backend-free floor: M19 mode selection + Local
  Mode dashboard. Proves the harness works end to end.

## Conventions

- **Selectors:** `data-testid` only (added to components as cases land) —
  never text or CSS-class selectors, so tests survive copy/refactor.
- **Modes:** `local` needs no server; `single`/`server` (spec §2.2/§2.3)
  start a real `jitpackd` — that harness (and the mock IdP for `server`
  multi-client cases) is added in later milestones per spec §10.
- **No sleeps:** use Playwright's clock/`expect` polling, never fixed
  waits (spec §2.4).
- **Tags:** `@smoke`, `@local`, `@single`, `@server`, plus `@mNN` per
  screen — run a slice with `npm run test:e2e -- --grep @local`.
