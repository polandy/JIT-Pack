import os from 'node:os'
import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { E2E_API_PORT, E2E_IDP_PORT, E2E_SERVER_API_PORT } from './e2e/backendPort'

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
 * `jitpack_server_url`.
 *
 * Backend-backed coverage (spec §2.2, mode `single`): the `single` project
 * below boots a real `jitpackd` in Single-User configuration and drives the
 * client in its `server` mode against it. It exists only when
 * `E2E_BACKEND=1`, because it needs the Go binary prebuilt at the repo root
 * (`go build -o jitpackd-e2e ./cmd/jitpackd`) — a prerequisite the default
 * run and the four CI shard legs do not have.
 *
 * Multi-identity coverage (spec §2.3, mode `server`) is the `server` project:
 * a second jitpackd, in OIDC mode against the mock IdP in `e2e/server/`, with
 * its own `vite preview` in front of it. Two backends rather than one because
 * the two configurations are mutually exclusive in one process — Single-User
 * bypasses auth entirely — and two previews because the client reaches its
 * server same-origin, so each backend needs its own origin. Gated on
 * `E2E_SERVER` for the same reason `single` is gated: the binary.
 */

/**
 * The width the concept prototype is drawn at, and the one every design
 * decision in it was made against. Baselines guard it first (ADR-013).
 */
const MOBILE_VIEWPORT = { width: 390, height: 844 }

const PORT = Number(process.env.E2E_PORT ?? 4173)
const BASE_URL = `http://localhost:${PORT}`

/**
 * The backend-backed project (`single`). Gated on E2E_BACKEND because both
 * halves — the extra webServer entry and the project itself — need the
 * prebuilt Go binary; without the gate every bare `playwright test` (the
 * four CI shard legs included) would fail on a missing prerequisite instead
 * of simply not running these tests.
 */
const BACKEND = !!process.env.E2E_BACKEND

/** The multi-user project's own gate — see the note above. */
const MULTI_USER = !!process.env.E2E_SERVER

/** The preview origin the `server` project drives, in front of that backend. */
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 4174)
const SERVER_BASE_URL = `http://localhost:${SERVER_PORT}`

/**
 * The confidential-client credentials the broker and the mock IdP share.
 * Test material by construction: the IdP that honours them is started by
 * this file and lives for the run.
 */
const OIDC_CLIENT_ID = 'jitpack-e2e'
const OIDC_CLIENT_SECRET = 'jitpack-e2e-secret'
const SESSION_SECRET = 'jitpack-e2e-session-secret'

/**
 * Alice is the instance admin (FR-23.1) — the address matches the mock IdP's
 * `alice` account, which is what the admin cases will need when they land.
 */
const ADMIN_EMAILS = 'alice@example.test'

/**
 * Where jitpackd listens — named once in e2e/backendPort.ts, shared with
 * `vite.config.ts`'s preview proxy target: the client reaches the backend
 * through the preview origin because the API is same-origin-only (no CORS
 * headers, deliberately; see client/src/config.ts).
 */
const API_PORT = E2E_API_PORT

/** The backend-backed specs, in one place for the three projects that name them. */
const BACKEND_SPECS = '**/single/**'

/**
 * The multi-identity specs, likewise named once. Spelled out to the file
 * rather than to the directory: `e2e/server/` also holds the harness's own
 * `.mjs` modules, and a directory-wide `testMatch` hands those to the
 * runner as tests.
 */
const SERVER_SPECS = '**/server/*.spec.ts'

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
    /*
     * The device the family actually holds (owner, 2026-08-21). The container
     * defaults to en-US/UTC, which quietly made every date the suite rendered
     * a US date and every "today" a UTC one — the FR-27.4 boundary is a *date*
     * comparison, so a run just after midnight in Zurich was reading
     * yesterday.
     *
     * The app *language* is deliberately not left to this: `resolveLocale`
     * falls back to `navigator.languages`, so a German device would flip the
     * whole UI and every English assertion with it. `seed()` pins
     * `jitpack_locale` instead, which is also what a real user's choice does —
     * the device's language and the app's are two separate facts, and the app
     * owns the second one.
     */
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
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
      testIgnore: ['**/visual.spec.ts', BACKEND_SPECS, SERVER_SPECS],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      testIgnore: ['**/visual.spec.ts', BACKEND_SPECS, SERVER_SPECS],
      use: { ...devices['Desktop Safari'] },
    },
    /*
     * Backend-backed cases (UI-Test-Spec §2.2, mode `single`): a real
     * jitpackd, the client in `server` mode. One backend **per run**, not
     * per worker — decided, not defaulted: the same-origin requirement
     * routes every context through the preview proxy, whose target port is
     * fixed when this config loads, and the multi-context convergence cases
     * need one shared server anyway. Isolation is therefore per-test data
     * (unique trip names) on a database that is fresh per run, and the
     * project runs its files serially (`fullyParallel: false`) so two tests
     * never race the shared master partition.
     *
     * Chromium only, deliberately: the surface under test is the sync wire
     * (queue, WebSocket, merge), not the rendering engine — the screens
     * themselves keep their WebKit coverage in the `local` units. WebKit
     * joins when this project grows real per-screen server cases.
     */
    ...(BACKEND
      ? [
          {
            name: 'single',
            testMatch: BACKEND_SPECS,
            fullyParallel: false,
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
    /*
     * Multi-identity cases (UI-Test-Spec §2.3, mode `server`): a real
     * jitpackd in OIDC mode, a mock IdP behind it, and two browser contexts
     * logged in as *different* accounts. This is the only project where
     * "whose name is on the row" can be asserted at all.
     *
     * Serial for the same reason `single` is: one backend per run, so the
     * shared master partition is not raced. Chromium only — what is under
     * test is identity and the wire, not a rendering engine.
     */
    ...(MULTI_USER
      ? [
          {
            name: 'server',
            testMatch: SERVER_SPECS,
            fullyParallel: false,
            use: { ...devices['Desktop Chrome'], baseURL: SERVER_BASE_URL },
          },
        ]
      : []),
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
  webServer: [
    {
      command: `npm run preview -- --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    /*
     * The Single-User jitpackd behind the preview proxy (see the `single`
     * project note above). The binary is CGO-free, so the one built on the
     * runner works inside the Playwright container too (the repo mount puts
     * it at ../jitpackd-e2e from here).
     *
     * The database is a temp file unique per run: `reuseExistingServer` is
     * false on purpose, so a stale server from an earlier run is an explicit
     * port error rather than a silent source of leftover state — the same
     * reason CI never reuses the preview.
     */
    ...(BACKEND
      ? [
          {
            command: '../jitpackd-e2e',
            url: `http://localhost:${API_PORT}/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
              JITPACK_LISTEN: `localhost:${API_PORT}`,
              JITPACK_DB_PATH: path.join(os.tmpdir(), `jitpackd-e2e-${Date.now()}.db`),
              JITPACK_SINGLE_USER: 'true',
              JITPACK_LOCAL_USER_ID: 'e2e-local',
            },
          },
        ]
      : []),
    /*
     * The multi-user stack: `e2e/server/backend.mjs` starts the mock IdP and
     * only then jitpackd (the ordering note is there), and a second
     * `vite preview` fronts it. The preview learns its proxy target from
     * `E2E_API_PORT` in *its own* environment — vite.config.ts reads the
     * variable per process, which is what lets two previews point at two
     * different backends without a second config file.
     */
    ...(MULTI_USER
      ? [
          {
            command: 'node e2e/server/backend.mjs',
            url: `http://localhost:${E2E_SERVER_API_PORT}/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            env: {
              E2E_IDP_PORT: String(E2E_IDP_PORT),
              E2E_SERVER_API_PORT: String(E2E_SERVER_API_PORT),
              E2E_OIDC_CLIENT_ID: OIDC_CLIENT_ID,
              E2E_OIDC_CLIENT_SECRET: OIDC_CLIENT_SECRET,
              E2E_SESSION_SECRET: SESSION_SECRET,
              E2E_ADMIN_EMAILS: ADMIN_EMAILS,
              E2E_SERVER_DB_PATH: path.join(os.tmpdir(), `jitpackd-e2e-server-${Date.now()}.db`),
              E2E_JITPACKD: path.join('..', 'jitpackd-e2e'),
            },
          },
          {
            command: `npm run preview -- --port ${SERVER_PORT} --strictPort`,
            url: SERVER_BASE_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { E2E_API_PORT: String(E2E_SERVER_API_PORT) },
          },
        ]
      : []),
  ],
})
