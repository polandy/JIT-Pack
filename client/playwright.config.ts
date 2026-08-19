import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for the JIT-Pack client.
 *
 * Scope, modes, and per-case coverage are specified in
 * dev-docs/UI_Test_Spec_v1.0.md — this file is only the runner wiring.
 *
 * The suite drives the *built* client (`vite preview`) in a headless
 * browser. Chromium and WebKit both run; WebKit is deliberate — the
 * Capacitor iOS WebView is WebKit, so it must stay green.
 *
 * Run modes (spec §2) are selected per-test via localStorage seeding
 * (see e2e/fixtures.ts), not via separate builds: the client is one
 * artifact whose behaviour is decided by `jitpack_mode` /
 * `jitpack_server_url`. Backend-backed modes (`single`, `server`) are
 * layered on in later milestones; this scaffold covers the
 * backend-free smoke path (M19 + Local Mode M1).
 */

/**
 * The width the concept prototype is drawn at, and the one every design
 * decision in it was made against. Baselines guard it first (ADR-013).
 */
const MOBILE_VIEWPORT = { width: 390, height: 844 }

const PORT = Number(process.env.E2E_PORT ?? 4173)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Fail the build if test.only is committed.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Parallel by default; the backend-backed suites that need a shared
  // server will opt into serial execution per-project when they land.
  fullyParallel: true,
  /*
   * Chosen, not inherited. Until 2026-08-19 the suite ran on Playwright's
   * 30 s default, which nobody had picked — and measurement showed the
   * suite living against it: on WebKit with 2 workers, 16 of 123 tests take
   * 20 s or more and the slowest passing one took 31.9 s. That is not a
   * suite that is too slow, it is a budget set below the work: the §2.4
   * units build their world through the UI (M7 -> M8 -> M3) because that is
   * what makes them worth having, and on WebKit that costs real seconds.
   *
   * A budget exists to bound a hang, not to police legitimate work, so this
   * is roughly 2x the measured worst case under load. The cost is stated
   * rather than hidden: a genuinely hung test now takes a minute to say so.
   */
  timeout: 60_000,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    /*
     * The behaviour projects ignore the baselines explicitly. Per project,
     * not globally: a global `testIgnore` also hides the file from the
     * visual projects below, which then find nothing to run — and report
     * that as an error rather than as a pass, which is how this was caught.
     */
    {
      name: 'chromium',
      testIgnore: '**/visual.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      testIgnore: '**/visual.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
    /*
     * Visual baselines (ADR-013). Excluded from the default run — invoked
     * by `make visual`, which supplies `--project=visual-*` — because a
     * baseline check belongs to the maintainer's review loop, not to
     * every `npm run test:e2e`.
     *
     * Chromium only, and inside the digest-pinned Playwright image on
     * both sides, so local and CI render in the same userland. The
     * reasoning, and the costs, are in ADR-013.
     *
     * The spec itself declares `reducedMotion` — see the note there for
     * why that is load-bearing rather than tidy.
     */
    {
      name: 'visual-mobile',
      testMatch: '**/visual.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: MOBILE_VIEWPORT },
    },
    {
      name: 'visual-desktop',
      testMatch: '**/visual.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],

  /*
   * Baselines are pixel data, so the tolerances are the whole contract.
   * `maxDiffPixelRatio` rather than `threshold` alone: a handful of
   * antialiased edge pixels is not a design change, and a suite that
   * calls it one gets ignored within a week (ADR-013, driver 1).
   *
   * **0.002 stays, decided 2026-08-19 (owner) rather than left open.** It
   * is known to be loose: a whole 24 px app-bar icon plus a truncated title
   * came to 658 px of 329 160 and passed against the old baselines (see the
   * M21 entry in the implementation log). Tightening it would buy that one
   * class of miss at the price of flake, and a gate that cries wolf is
   * worth less than the miss it prevents. The consequence is stated rather
   * than hidden: **this gate catches layout changes, not small ones** — a
   * change of a few hundred pixels is caught by looking at the render,
   * which is what the working agreement already requires of a UI PR.
   */
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      // Ionic's tap ripple and the pack-out are both mid-flight artefacts
      // that would make every run differ from every other.
      caret: 'hide',
    },
  },

  // Build once, then serve the static bundle. `vite preview` needs a
  // prior `npm run build`; CI builds the client in an earlier step.
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
