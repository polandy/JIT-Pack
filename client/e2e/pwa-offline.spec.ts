import { test, expect, createTripViaWizard, openQuickAdd, visiblePage } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * The app shell survives losing the network (E2E-PWA-01, NFR-4.13).
 *
 * Local Mode is what makes this drivable today: the data story is IndexedDB,
 * so once the service worker holds the bundle a reload with the network gone
 * must paint the app — that is the whole point of the shell cache (ADR-019).
 *
 * Chromium only: Playwright's service-worker support is Chromium's, and the
 * shell logic is browser-independent — what WebKit runs in production is the
 * same worker, guarded by this case in the engine that can host it in CI.
 */

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'service workers run under Playwright only in Chromium',
)

/**
 * Settled means: the registration is active *and* this page is controlled.
 * Both are real lifecycle signals — `ready` resolves once the install
 * (which precaches inside its waitUntil) has finished and the worker is
 * active; `controllerchange` fires when clients.claim() takes the page.
 */
async function serviceWorkerControlsPage(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      }),
    )
  })
}

test.describe('app shell offline (NFR-4.13)', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-PWA-01: a reload without network still paints the app', async ({ page, context }) => {
    await page.goto('/tabs/dashboard')
    await serviceWorkerControlsPage(page)

    await context.setOffline(true)
    await page.reload()

    // Rendered app, not a URL: the header logo and the tab bar only exist
    // when the shell actually painted (working agreement, ADR-011 chrome).
    await expect(page.getByTestId('header-logo')).toBeVisible()
    await expect(visiblePage(page)).toBeVisible()
  })

  test('E2E-PWA-02: the shell cache holds the bundle and never /health', async ({ page }) => {
    await page.goto('/tabs/dashboard')
    await serviceWorkerControlsPage(page)

    // Provoke the request the worker must pass through untouched. The
    // preview server answers *something* for it; what matters is that no
    // cache entry appears.
    await page.evaluate(() => fetch('/health').catch(() => undefined))

    const cached = await page.evaluate(async () => ({
      // The positive signal the absence assertion leans on: the same cache,
      // read the same way, does hold the shell document.
      shell: (await caches.match('/index.html')) !== undefined,
      health: (await caches.match('/health')) !== undefined,
    }))
    expect(cached.shell).toBe(true)
    expect(cached.health).toBe(false)
  })

  test('E2E-NFR-01: a trip is created, packed and read back with the network gone', async ({
    page,
    context,
  }) => {
    // Two templates' worth of navigation on a cold worker.
    test.slow()

    // NFR-4.1 is the requirement Local Mode exists for, and no case had ever
    // *written* with the network down: E2E-PWA-01 reloads and asserts the
    // shell, and the `single` half (E2E-FLOW-06, E2E-G2-04) queues against a
    // server that comes back. Here nothing comes back, because in Local Mode
    // there is nothing to come back — so "nothing blocks" is the assertion.
    await page.goto('/tabs/dashboard')
    await serviceWorkerControlsPage(page)
    await context.setOffline(true)

    await createTripViaWizard(page, { name: 'Sturmwoche' })
    await openQuickAdd(page)
    await visiblePage(page).getByTestId('quick-add-input').locator('input').fill('Regenjacke')
    await visiblePage(page).getByTestId('quick-add-confirm').click()
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toBeVisible()
    await visiblePage(page).getByTestId('quick-add-close').click()

    // Packing is the write that matters most here: it is the one a user makes
    // standing in a cellar with no signal. The row leaving the open list is
    // FR-25.13e, and the settled signal that the write landed.
    await visiblePage(page)
      .getByTestId('m4-row-Regenjacke')
      .getByTestId('row-check')
      .locator('ion-checkbox')
      .click()
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toHaveCount(0)

    // Still offline: the reload is what separates a rendered optimistic store
    // from data the device actually kept.
    await page.reload()
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toHaveCount(0)
    await visiblePage(page).getByTestId('m4-done-bar').click()
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toBeVisible()
  })

  test('E2E-PWA-03: the install declaration is complete and every icon resolves', async ({
    page,
  }) => {
    await page.goto('/tabs/dashboard')

    // The head tags a browser reads before offering installation. A typo'd
    // path here ships silently — nothing else in the app ever fetches these.
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href', { timeout: 5000 })
    expect(manifestHref).toBe('/manifest.webmanifest')
    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    expect(appleIcon).toBeTruthy()

    const manifest = await page.evaluate(async (href: string) => {
      const resp = await fetch(href)
      return resp.ok ? resp.json() : null
    }, manifestHref!)
    expect(manifest?.name).toBe('JIT-Pack')
    expect(manifest?.display).toBe('standalone')
    const purposes = manifest.icons.map((icon: { purpose: string }) => icon.purpose)
    expect(purposes).toContain('maskable')

    // Every declared icon must actually exist — the apple one included.
    const urls = [...manifest.icons.map((icon: { src: string }) => icon.src), appleIcon!]
    for (const url of urls) {
      const ok = await page.evaluate(async (u: string) => (await fetch(u)).ok, url)
      expect(ok, `icon ${url} must resolve`).toBe(true)
    }
  })
})
