import { test, expect, createTripViaWizard, openQuickAdd, visiblePage } from './fixtures'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

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
    await page.goto(PATH.dashboard)
    await serviceWorkerControlsPage(page)

    await context.setOffline(true)
    await page.reload()

    // Rendered app, not a URL: the header logo and the tab bar only exist
    // when the shell actually painted (working agreement, ADR-011 chrome).
    await expect(page.getByTestId('header-logo')).toBeVisible()
    await expect(visiblePage(page)).toBeVisible()
  })

  test('E2E-PWA-02: the worker never answers /api, /ws or /health', async ({ page }) => {
    await page.goto(PATH.dashboard)
    await serviceWorkerControlsPage(page)

    /*
     * The seam this case needs, and why it is not the cache read it used to
     * be: the worker caches nothing at runtime, so "no cache entry appeared
     * for /health" stayed true with the bypass rule deleted outright
     * (measured 2026-09-01 — `bypassed()`'s whole body replaced by
     * `return false`, and this case still passed). What the rule promises is
     * that the worker never *answers* these paths, and the way to make that
     * falsifiable is to give it something to answer with: a planted response
     * in a cache of this test's own. `caches.match` searches every cache on
     * the origin, so a worker that stopped bypassing would serve the plant.
     */
    const PLANT = 'PLANTED-BY-E2E'
    const BYPASSED = ['/health', '/api/v1/auth/config', '/ws']
    // A path the rule does not cover: the positive signal the three
    // absences lean on — the plant is reachable, so an absence means the
    // bypass rule and not a mechanism that never worked.
    const COVERED = '/e2e-not-bypassed'

    const bodies = await page.evaluate(
      async ({ plant, bypassed, covered }) => {
        const cache = await caches.open('e2e-planted')
        for (const path of [...bypassed, covered]) {
          await cache.put(path, new Response(plant, { headers: { 'content-type': 'text/plain' } }))
        }
        const read = async (path: string) => {
          try {
            return await (await fetch(path)).text()
          } catch {
            // A path with nothing behind it in this project rejects; that is
            // still an answer that did not come from the worker.
            return 'network-error'
          }
        }
        return {
          bypassed: await Promise.all(bypassed.map(read)),
          covered: await read(covered),
        }
      },
      { plant: PLANT, bypassed: BYPASSED, covered: COVERED },
    )

    expect(bodies.covered, 'the plant must be reachable, or the absences below mean nothing').toBe(
      PLANT,
    )
    for (const [i, body] of bodies.bypassed.entries()) {
      expect(body, `${BYPASSED[i]} must not be answered by the worker`).not.toBe(PLANT)
    }

    // The cache half of the same rule, beside the positive signal that the
    // same cache, read the same way, does hold the shell document.
    const cached = await page.evaluate(async () => ({
      shell: (await caches.match('/index.html')) !== undefined,
      health: await caches
        .keys()
        .then((names) => names.filter((n) => n.startsWith('jitpack-shell-')))
        .then(async (names) => {
          for (const name of names) {
            if (await (await caches.open(name)).match('/health')) return true
          }
          return false
        }),
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
    await page.goto(PATH.dashboard)
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
    await page.goto(PATH.dashboard)

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

    // NFR-4.13 names the theme-color beside the manifest, and it is the one
    // tag of the install declaration that is not static: theme.ts repaints it
    // from the active flavour's own --ct-base (FR-21), so an empty or missing
    // meta means an installed app whose chrome stops following the palette.
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
    const base = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ct-base').trim(),
    )
    expect(themeColor).toBe(base)

    // Every declared icon must actually exist — the apple one included.
    const urls = [...manifest.icons.map((icon: { src: string }) => icon.src), appleIcon!]
    for (const url of urls) {
      const ok = await page.evaluate(async (u: string) => (await fetch(u)).ok, url)
      expect(ok, `icon ${url} must resolve`).toBe(true)
    }
  })
  /**
   * The update policy (E2E-PWA-04, NFR-4.13 / ADR-019), which had no case of
   * any kind: a new version installs in the background, is *announced* through
   * the G-2 glyph and its sheet, never reloads the running app, and takes over
   * on the next launch. `registerAppServiceWorker`'s unit test drives the
   * watcher against a fake container; nothing had ever put a second worker on
   * the origin and read the app.
   *
   * Registering a *different* script URL on the same scope is what makes this
   * drivable: a registration is keyed by scope, so the browser installs the
   * new script into the registration the app is already holding — its
   * `updatefound` is the app's own signal — and, because the worker never
   * calls skipWaiting, the new one waits behind the controlling one exactly as
   * a real deploy does.
   */
  test('E2E-PWA-04: a new version waits, is announced, and takes over on the next launch', async ({
    page,
    context,
  }) => {
    await page.goto(PATH.dashboard)
    await serviceWorkerControlsPage(page)

    // Two positive signals, because "nothing happens to the running app" is
    // otherwise an absence nobody watched: a marker no reload survives, and a
    // count of the controllerchange events a skipWaiting() takeover produces.
    await page.evaluate(() => {
      const w = window as unknown as { __jitpackAlive?: boolean; __jitpackTakeovers?: number }
      w.__jitpackAlive = true
      w.__jitpackTakeovers = 0
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        w.__jitpackTakeovers = (w.__jitpackTakeovers ?? 0) + 1
      })
    })

    const UPDATED = '/sw.js?e2e-update=1'
    const waiting = await page.evaluate(async (url) => {
      const reg = await navigator.serviceWorker.register(url)
      // Settled on the worker's own lifecycle: `installed` is the state the
      // app's watcher listens for, and the state a waiting worker is in.
      await new Promise<void>((resolve) => {
        if (reg.waiting) return resolve()
        const installing = reg.installing
        if (!installing) return resolve()
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') resolve()
        })
      })
      return {
        waiting: reg.waiting?.scriptURL ?? null,
        controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      }
    }, UPDATED)

    // Installed and waiting — and the page is still driven by the old one.
    expect(waiting.waiting).toContain('e2e-update=1')
    expect(waiting.controller).not.toContain('e2e-update=1')

    // Announced: the dot on the glyph and the sentence in the G-2 sheet.
    await expect(page.getByTestId('sync-indicator-update')).toBeVisible()
    await page.getByTestId('sync-indicator').click()
    await expect(page.getByTestId('sync-detail-update')).toBeVisible()

    // Nothing reloaded the app to get there, and nothing took the page over
    // under it — the old worker is still the one answering.
    const running = await page.evaluate(() => {
      const w = window as unknown as { __jitpackAlive?: boolean; __jitpackTakeovers?: number }
      return {
        alive: w.__jitpackAlive === true,
        takeovers: w.__jitpackTakeovers,
        controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      }
    })
    expect(running.alive).toBe(true)
    expect(running.takeovers).toBe(0)
    expect(running.controller).not.toContain('e2e-update=1')

    // The next launch: the client that held the old worker goes away, which
    // is what lets the waiting one activate — a reload would not, because the
    // old worker keeps controlling the page across it.
    await page.close()
    const relaunched = await context.newPage()
    await relaunched.goto(PATH.dashboard)
    const active = await relaunched.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.scriptURL ?? null
    })
    expect(active).toContain('e2e-update=1')
    // Not asserted: that the relaunched app announces nothing. It re-registers
    // `/sw.js`, a third script URL in this fixture, which installs as a new
    // waiting worker and brings the dot back — see E2E-PWA-05 for the measurement.
  })

  /**
   * E2E-PWA-05 (FR-19.7, ADR-044) — the mirror of the case above: the same
   * waiting worker, taken over *now* because somebody pressed for it.
   *
   * The two cases are the whole policy between them. PWA-04 proves nothing
   * happens on its own; this one proves the press is the only thing that
   * changes that, and that it lands on the new build rather than merely
   * asking for it. Both are needed: deleting the message handler leaves
   * PWA-04 green, and moving skipWaiting() into `install` leaves this one
   * green.
   */
  test('E2E-PWA-05: the banner applies the waiting version now', async ({ page }) => {
    await page.goto(PATH.dashboard)
    await serviceWorkerControlsPage(page)

    // The positive signal for "the page was actually replaced": a marker that
    // no reload survives. Asserting only on the controller would stay green
    // for a takeover that left the old bundle on screen.
    await page.evaluate(() => {
      ;(window as unknown as { __jitpackAlive?: boolean }).__jitpackAlive = true
    })

    const UPDATED = '/sw.js?e2e-update=2'
    await page.evaluate(async (url) => {
      const reg = await navigator.serviceWorker.register(url)
      await new Promise<void>((resolve) => {
        if (reg.waiting) return resolve()
        const installing = reg.installing
        if (!installing) return resolve()
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') resolve()
        })
      })
    }, UPDATED)

    // The offer is on screen without opening anything — that is the point of
    // the bar, and the G-2 sheet's dot is still there beside it.
    const banner = page.getByTestId('update-banner')
    await expect(banner).toBeVisible()
    await expect(page.getByTestId('sync-indicator-update')).toBeVisible()

    await page.getByTestId('update-banner-apply').click()

    // The settled state is the *reload*, read off the marker: the page that
    // pressed is gone, and the one that replaced it is driven by the new
    // script. Deliberately not "the bar and the dot are gone": the relaunched
    // app registers `/sw.js` again, which in this fixture is a *third* script
    // URL on the scope, so the browser installs it as a fresh waiting worker
    // and the announcement comes back a moment later (measured 2026-09-02).
    // An absence asserted in that window is green only by being early.
    await page.waitForFunction(
      () => (window as unknown as { __jitpackAlive?: boolean }).__jitpackAlive !== true,
    )
    await expect(visiblePage(page)).toBeVisible()
    const controller = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    )
    expect(controller).toContain('e2e-update=2')
  })

  /**
   * E2E-PWA-05b — "Later" is a different outcome from applying. Without this
   * the dismissal could be wired to the same handler and no case would say so.
   */
  test('E2E-PWA-05b: "Later" hides the bar and keeps the offer everywhere else', async ({
    page,
  }) => {
    await page.goto(PATH.dashboard)
    await serviceWorkerControlsPage(page)

    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.register('/sw.js?e2e-update=3')
      await new Promise<void>((resolve) => {
        if (reg.waiting) return resolve()
        const installing = reg.installing
        if (!installing) return resolve()
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') resolve()
        })
      })
    })

    await expect(page.getByTestId('update-banner')).toBeVisible()
    await page.getByTestId('update-banner-later').click()
    await expect(page.getByTestId('update-banner')).toHaveCount(0)

    // Dismissed, not applied: the old worker still drives the page, and the
    // offer is still reachable the way it was before FR-19.7.
    const controller = await page.evaluate(
      () => navigator.serviceWorker.controller?.scriptURL ?? null,
    )
    expect(controller).not.toContain('e2e-update=3')
    await expect(page.getByTestId('sync-indicator-update')).toBeVisible()
    await page.getByTestId('sync-indicator').click()
    await expect(page.getByTestId('sync-detail-update-apply')).toBeVisible()
  })
})
