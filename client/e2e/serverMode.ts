/**
 * Helpers shared by the two backend-backed projects, `single` and `server`
 * (UI-Test-Spec §2.2/§2.3).
 *
 * Both projects need the same four moves — booting a page in server mode,
 * adding a row, packing it, and knowing when a page's WebSocket
 * subscription actually exists. Copying them would make two versions
 * of "how this suite drives the app" (CODING_PRINCIPLES §4a), and the
 * WebSocket one in particular is the kind of helper that must not be
 * reinvented: its whole point is that it does not wait for a duration.
 */

import { expect, type BrowserContext, type Page } from '@playwright/test'

import { WS_EVENT_TYPE, type PresencePayload, type TripChangedPayload } from '../src/api/types'
import { addInComposer, seed, visiblePage } from './fixtures'
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

/**
 * FR-25.13 quick-add on M4, committed via the ✓ confirm — through the create
 * sheet when the inventory lacks the name (FR-24.11).
 */
export async function quickAddItem(page: Page, name: string): Promise<void> {
  const input = visiblePage(page).getByTestId('quick-add-input')
  if (!(await input.isVisible().catch(() => false))) {
    await visiblePage(page).getByTestId('m4-fab').click()
    await expect(input).toBeVisible()
  }
  await addInComposer(page, name)
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
 * `dev-docs/implementation-log/` has what a missing barrier costs.
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
 * **The page is the whole parameter, and that is the point.** A
 * `page.waitForEvent('websocket')` promise made earlier by the caller would
 * attach the frame listener only once the caller awaited it — so a caller
 * that did anything slow in between (waiting for a row to render) lets the
 * `presence` frame arrive and be dropped, because Playwright buffers no
 * frames from before a listener exists. The test then waits out its timeout
 * for a *second* presence broadcast that only another account's arrival
 * would produce — green only while the server round trip is slower than the
 * render, so red under CI load and never locally. Taking the page means the
 * listener is attached one microtask after the socket exists, and no caller
 * can open a window.
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
 * A server frame as it came off the wire: runtime data, so its payload is
 * read as the generated type its `type` names only after that is checked.
 */
interface Frame {
  type?: string
  payload?: unknown
}

function parseFrame(payload: string): Frame | null {
  try {
    return JSON.parse(payload) as Frame
  } catch {
    return null
  }
}

/**
 * A presence frame of `tripId` listing `people` users, every one at the head
 * — and that head at least `head`.
 *
 * Parsed rather than matched as a substring: `"in_sync":false` and
 * `"in_sync": false` are the same fact and a different string, and a frame
 * that merely *mentions* presence proves nothing about who is behind.
 *
 * The trip and the head count are part of the fact. A socket follows every
 * active trip its dashboard listed, so other trips' frames arrive on it too;
 * and when a device's connection drops, the server's next frame lists
 * everyone *but* that person — all in sync, and about nobody the wait was for.
 *
 * So is the head. `in_sync` is a verdict against whatever head the server
 * read while building the frame, so "everyone is there" from before a write
 * and from after it read alike. The frame names that head (`head_seq`,
 * Sync-API §7), and only a frame judged against the write's own head says
 * anybody has reached the write.
 */
function everyoneAt(frame: Frame, tripId: string, people: number, head: number): boolean {
  if (frame.type !== WS_EVENT_TYPE.presence) return false
  const { trip_id, head_seq, users } = frame.payload as PresencePayload
  return (
    trip_id === tripId &&
    head_seq >= head &&
    Array.isArray(users) &&
    users.length === people &&
    users.every((u) => u.in_sync === true)
  )
}

/** What {@link trackSocket} hands back. */
export interface SocketWatch {
  /**
   * The head of the next `trip.changed` of `tripId`: where the write this
   * page is about to make lands. Arm it before the write.
   */
  nextHead(tripId: string): Promise<number>
  /**
   * Resolves once a presence frame of `tripId` has listed all `people` users
   * at `head` or beyond. A frame that already arrived counts: none judged
   * against `head` can be older than the write that made it the head.
   */
  caughtUp(tripId: string, people: number, head: number): Promise<void>
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
 */
export function trackSocket(page: Page): SocketWatch {
  const seen: Frame[] = []
  const waiters = new Set<(frame: Frame) => boolean>()
  // Every socket, not only the first: a reconnect replaces the object, and a
  // frame on the new one is as much an answer as one on the old.
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      const frame = parseFrame(String(payload))
      if (!frame) return
      seen.push(frame)
      for (const settle of waiters) if (settle(frame)) waiters.delete(settle)
    })
  })

  function next(match: (frame: Frame) => boolean): Promise<Frame> {
    return new Promise((resolve) => {
      waiters.add((frame) => {
        if (!match(frame)) return false
        resolve(frame)
        return true
      })
    })
  }

  return {
    async nextHead(tripId) {
      const frame = await next(
        (f) =>
          f.type === WS_EVENT_TYPE['trip.changed'] &&
          (f.payload as TripChangedPayload).trip_id === tripId,
      )
      return (frame.payload as TripChangedPayload).head_seq
    },
    async caughtUp(tripId, people, head) {
      const match = (f: Frame) => everyoneAt(f, tripId, people, head)
      if (seen.some(match)) return
      await next(match)
    },
  }
}
