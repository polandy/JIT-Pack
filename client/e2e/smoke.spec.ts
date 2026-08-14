import { test, expect } from './fixtures'

/**
 * Scaffold smoke tests — the backend-free floor of the suite
 * (dev-docs/UI_Test_Spec_v1.0.md §10 step 1). They prove the harness end
 * to end: the built client boots in a real browser, first-launch mode
 * selection (M19) renders, and choosing Local Mode lands on the
 * Dashboard (M1) with its empty state. No jitpackd required.
 */

// E2E-M19-01 (partial): first launch shows the two mode cards.
test('M19: first launch shows mode selection @smoke @m19', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('mode-selection')).toBeVisible()
  await expect(page.getByTestId('mode-local')).toBeVisible()
  await expect(page.getByTestId('mode-server-connect')).toBeVisible()
})

// E2E-M19-04: the URL field arrives pre-filled with this page's origin —
// a self-hosted instance serves the SPA from the very origin the server
// listens on, so Connect is reachable without typing (FR-19.1).
test('M19: the server URL is pre-filled with the page origin @smoke @m19', async ({
  page,
  baseURL,
}) => {
  await page.goto('/')

  await expect(page.getByTestId('mode-server-url').locator('input')).toHaveValue(baseURL!)
  // Reach through to the inner button: `toBeEnabled()` on the ion-button
  // host is false-green, since the custom element is never DOM-disabled.
  await expect(page.getByTestId('mode-server-connect').locator('button')).toBeEnabled()
})

// E2E-G7-01 / M1 (Local): a seeded Local Mode boots straight into the
// Dashboard, whose empty state offers the single "Plan a trip" CTA.
test('M1: local mode boots into an empty dashboard @smoke @local', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local' })
  await page.goto('/')

  // Mode is chosen → M19 is gone, the app shell renders.
  await expect(page.getByTestId('mode-selection')).toHaveCount(0)
  await expect(page.getByTestId('dashboard-greeting')).toBeVisible()

  // Fresh Local Mode has no trips → empty state + CTA (G-7).
  await expect(page.getByTestId('dashboard-empty')).toBeVisible()
  await expect(page.getByTestId('dashboard-plan-trip')).toBeVisible()
})
