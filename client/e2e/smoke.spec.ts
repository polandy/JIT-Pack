import { test, expect } from './fixtures'

/**
 * Scaffold smoke tests — the backend-free floor of the suite
 * (dev-docs/UI_Test_Spec_v1.0.md §10 step 1). They prove the harness end
 * to end: the built client boots in a real browser, first-launch mode
 * selection (M19) renders, and choosing Local Mode lands on the
 * Dashboard (M1) with its empty state. No jitpackd required.
 */

// E2E-M19-01 (partial): first launch shows the two mode cards.
test('E2E-M19-01: first launch shows mode selection @smoke @m19', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('mode-selection')).toBeVisible()
  await expect(page.getByTestId('mode-local')).toBeVisible()
  await expect(page.getByTestId('mode-server-connect')).toBeVisible()
})

// E2E-M19-04: the URL field arrives pre-filled with this page's origin —
// a self-hosted instance serves the SPA from the very origin the server
// listens on, so Connect is reachable without typing (FR-19.1).
test('E2E-M19-04: the server URL is pre-filled with the page origin @smoke @m19', async ({
  page,
  baseURL,
}) => {
  await page.goto('/')

  await expect(page.getByTestId('mode-server-url').locator('input')).toHaveValue(baseURL!)
  // Reach through to the inner button: `toBeEnabled()` on the ion-button
  // host is false-green, since the custom element is never DOM-disabled.
  await expect(page.getByTestId('mode-server-connect').locator('button')).toBeEnabled()
})

/**
 * E2E-M19-01, the rest of it (FR-19.1, NFR-4.11): the *choice* — which
 * nothing had ever made. Every other spec in the suite seeds
 * `jitpack_mode` into localStorage and boots past this screen, so M19 read
 * as covered while its one action had never been taken (found 2026-08-30,
 * audit of backlog item 6).
 *
 * Three clauses in one case, because they are one gesture: the card lands
 * on M1's empty state, the browser is asked to keep the data, and a reload
 * does not ask again. The persistence request is the clause worth the
 * stub — Local Mode holds the only copy of everything, and an origin the
 * browser may evict is the difference between a packing list and a rumour.
 * `persisted()` answers false so the request is actually made; the real
 * `navigator.storage` is left out of it entirely, because whether *this*
 * browser grants persistence is not what the case is about.
 */
test('E2E-M19-01: choosing Local Mode persists the choice, asks to keep the data, and is not asked twice @smoke @m19', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __persistCalls: number }
    w.__persistCalls = 0
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: () => Promise.resolve({ usage: 0, quota: 1_000_000 }),
        persisted: () => Promise.resolve(false),
        persist: () => {
          w.__persistCalls += 1
          return Promise.resolve(true)
        },
      },
    })
  })

  await page.goto('/')
  await expect(page.getByTestId('mode-selection')).toBeVisible()

  await page.getByTestId('mode-local').click()

  // Lands on M1, and on its empty state (G-7) — a fresh device has no trip.
  await expect(page.getByTestId('dashboard-empty')).toBeVisible()
  await expect(page.getByTestId('mode-selection')).toHaveCount(0)

  // NFR-4.11: the device asked to keep what is now its only copy.
  await page.waitForFunction(
    () => (window as unknown as { __persistCalls: number }).__persistCalls > 0,
  )

  // Shown exactly once: the choice survives a reload.
  await page.reload()
  await expect(page.getByTestId('dashboard-greeting')).toBeVisible()
  await expect(page.getByTestId('mode-selection')).toHaveCount(0)
})

// E2E-G7-01 / M1 (Local): a seeded Local Mode boots straight into the
// Dashboard, whose empty state offers the single "Plan a trip" CTA.
test('E2E-G7-01: M1: local mode boots into an empty dashboard @smoke @local', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto('/')

  // Mode is chosen → M19 is gone, the app shell renders.
  await expect(page.getByTestId('mode-selection')).toHaveCount(0)
  await expect(page.getByTestId('dashboard-greeting')).toBeVisible()

  // Fresh Local Mode has no trips → empty state + CTA (G-7).
  await expect(page.getByTestId('dashboard-empty')).toBeVisible()
  await expect(page.getByTestId('dashboard-plan-trip')).toBeVisible()
})
