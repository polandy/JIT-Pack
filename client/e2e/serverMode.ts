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

import { expect, type BrowserContext, type Page, type WebSocket } from '@playwright/test'

import { seed, visiblePage } from './fixtures'
import { writesLanded } from './helpers/page'

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
  await writesLanded(page)
}

/**
 * Pack a row via its checkbox (G-6: the control acts, it never navigates),
 * and return once the write has left rather than when the row painted.
 *
 * Two waits, and each is load-bearing. The **header figure changing** is the
 * proof the click reached the app — the row's own state is not, because a
 * packed row leaves the list (FR-25.2) while a refused one stays put.
 * `writesLanded` is the proof the write settled — on its own it would be
 * satisfied by the state the app was already in before this write.
 * The log's 2026-09-13 entry has what the missing barrier cost.
 */
export async function packItem(page: Page, name: string): Promise<void> {
  const progress = visiblePage(page).getByTestId('m4-progress')
  // Read before the click, so "it changed" is a comparison against something:
  // an absent figure would make the assertion below pass against nothing.
  await expect(progress).not.toHaveText('')
  const before = (await progress.textContent()) ?? ''
  await visiblePage(page)
    .getByTestId(`m4-row-${name}`)
    .getByTestId('row-check')
    .locator('ion-checkbox')
    .click()
  await expect(progress).not.toHaveText(before)
  await writesLanded(page)
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

/**
 * A presence frame in which every connected device reports the head.
 *
 * Parsed rather than matched as a substring: `"in_sync":false` and
 * `"in_sync": false` are the same fact and a different string, and a frame
 * that merely *mentions* presence proves nothing about who is behind.
 */
function everyoneInSync(payload: string): boolean {
  try {
    const frame = JSON.parse(payload) as {
      type?: string
      payload?: { users?: { in_sync?: boolean }[] }
    }
    if (frame.type !== 'presence') return false
    const users = frame.payload?.users
    return Array.isArray(users) && users.length > 0 && users.every((u) => u.in_sync === true)
  } catch {
    return false
  }
}

/** What {@link trackSocket} hands back: a wait armed at a point in time. */
export interface SocketWatch {
  /** Resolves on the next presence frame reporting every device at the head. */
  caughtUp(): Promise<void>
}

/**
 * Follows a page's WebSocket so a later step can wait for a frame on a
 * connection that is **already open**.
 *
 * `watchSubscribed` above covers the other case — a socket that does not
 * exist yet — and cannot serve this one: `page.waitForEvent('websocket')`
 * waits for the *next* socket, so calling it against a page that connected
 * minutes ago waits for a reconnect that a healthy run never performs.
 *
 * **Call this before the page navigates.** Playwright delivers no socket
 * that opened before the listener existed, so a tracker armed after `goto`
 * follows nothing.
 *
 * **And call `caughtUp()` before the thing that should cause it.** It
 * resolves on the next matching frame, not on one already delivered, which
 * is the whole point: both accounts are in sync at the start of a presence
 * test, so a wait that accepted an earlier frame would be satisfied by the
 * state the test is about to disturb.
 */
export function trackSocket(page: Page): SocketWatch {
  let current: WebSocket | null = null
  let resolveFirst: (ws: WebSocket) => void
  const first = new Promise<WebSocket>((r) => {
    resolveFirst = r
  })
  // Every socket, not only the first: a reconnect replaces the object, and a
  // watch held against the dead one would wait for ever.
  page.on('websocket', (ws) => {
    current = ws
    resolveFirst(ws)
  })

  return {
    async caughtUp() {
      const ws = current ?? (await first)
      await ws.waitForEvent('framereceived', {
        predicate: (frame) => everyoneInSync(String(frame.payload)),
      })
    },
  }
}
