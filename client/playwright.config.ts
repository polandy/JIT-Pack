import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for the JIT-Pack client.
 *
 * Scope, modes, and per-case coverage are specified in
 * docs/UI_Test_Spec_v1.0.md — this file is only the runner wiring.
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  // Build once, then serve the static bundle. `vite preview` needs a
  // prior `npm run build`; CI builds the client in an earlier step.
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
