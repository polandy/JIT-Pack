/**
 * Helpers shared by the two backend-backed projects, `single` and `server`
 * (UI-Test-Spec §2.2/§2.3).
 *
 * They were the `single` unit's private helpers until the multi-identity
 * project arrived and needed the same four moves — booting a page in server
 * mode, adding a row, packing it, and knowing when a page's WebSocket
 * subscription actually exists. Copying them would have made two versions
 * of "how this suite drives the app" (CODING_PRINCIPLES §4a), and the
 * WebSocket one in particular is the kind of helper that must not be
 * reinvented: its whole point is that it does not wait for a duration.
 */

import { expect, type BrowserContext, type Page } from '@playwright/test'

import { seed, visiblePage } from './fixtures'

/** Suffix that keeps one test's master data out of another's. */
export function uniq(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** A page in server mode. The context owns the network (setOffline). */
export async function bootPage(context: BrowserContext, path = '/'): Promise<Page> {
  const page = await context.newPage()
  await seed(page, { mode: 'server' })
  await page.goto(path)
  return page
}

/** FR-25.13 quick-add on M4, committed via the ＋ confirm. */
export async function quickAddItem(page: Page, name: string): Promise<void> {
  const input = visiblePage(page).getByTestId('quick-add-input')
  if (!(await input.isVisible().catch(() => false))) {
    await visiblePage(page).getByTestId('m4-fab').click()
    await expect(input).toBeVisible()
  }
  await input.locator('input').fill(name)
  await page.getByTestId('quick-add-confirm').click()
  await expect(visiblePage(page).getByTestId(`m4-row-${name}`)).toBeVisible()
}

/** Pack a row via its checkbox (G-6: the control acts, it never navigates). */
export async function packItem(page: Page, name: string): Promise<void> {
  await visiblePage(page)
    .getByTestId(`m4-row-${name}`)
    .getByTestId('row-check')
    .locator('ion-checkbox')
    .click()
}

/**
 * Start watching for this page's trip subscription, and await the returned
 * promise after the navigation that opens it.
 *
 *     const subscribed = watchSubscribed(bob)
 *     await bob.goto(tripPath)
 *     await expect(row).toBeVisible()
 *     await subscribed
 *
 * The hub answers a subscribe with a `presence` broadcast to the trip's
 * subscribers, the subscriber included, so that frame proves the connection
 * is in the trip's set and every later `trip.changed` must reach it.
 *
 * **The page is the whole parameter, and that is the fix** (2026-08-30). This
 * used to take a `page.waitForEvent('websocket')` promise the caller had made
 * earlier, and attached the frame listener only once the caller awaited it —
 * so every caller that did anything slow in between (all of them waited for a
 * row to render) let the `presence` frame arrive and be dropped, because
 * Playwright buffers no frames from before a listener exists. The test then
 * waited out its timeout for a *second* presence broadcast that only another
 * account's arrival would produce. It passed only while the server round trip
 * was slower than the render, which is why it failed under CI load and never
 * locally. Taking the page instead means the listener is attached one
 * microtask after the socket exists, and no caller can open a window.
 */
export function watchSubscribed(page: Page): Promise<void> {
  return page
    .waitForEvent('websocket')
    .then((ws) =>
      ws.waitForEvent('framereceived', {
        predicate: (frame) => String(frame.payload).includes('"presence"'),
      }),
    )
    .then(() => undefined)
}
