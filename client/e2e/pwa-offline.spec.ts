import { test, expect, visiblePage } from './fixtures'
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
})
