/**
 * E2E-NFR-06 (NFR-4.6): the Web Push registration round-trip, driven
 * through M17's toggle against a real server session.
 *
 * The browser half is unit-covered (`notifications/push.spec.ts` fakes the
 * PushManager and asserts the dance); what nothing covered is that the
 * result of that dance reaches the instance and is accepted — the toggle
 * had no `data-testid` at all, the signature of a control no test has ever
 * operated. `server` and not `single`, because a subscription is stored
 * against a user id and there is no user in the other two modes (G-8 hides
 * the whole section there, which E2E-M17-08 already asserts).
 *
 * The push *service* is replaced and nothing else is: `subscribe()` would
 * otherwise have to reach a real FCM endpoint, which no CI run can. The
 * permission is granted for real via the context, and the server is the
 * project's real jitpackd — so what the case proves is the half that only
 * an integration can prove: the app asks, the browser answers, and the
 * instance takes it. Delivery from there is `internal/api/push_test.go`,
 * which signs against a fake push service.
 */
import { test, expect, visiblePage } from '../fixtures'

import { loginAs } from './fixtures'
import { PATH } from '../routes'

const ENDPOINT = 'https://push.example/e2e-subscription'

interface PushCalls {
  subscribe: number
  unsubscribe: number
}

test('E2E-NFR-06: enabling push registers the subscription, disabling drops it', async ({
  browser,
}) => {
  const context = await browser.newContext()
  await context.grantPermissions(['notifications'])
  await context.addInitScript((endpoint: string) => {
    const counts: PushCalls = { subscribe: 0, unsubscribe: 0 }
    ;(window as unknown as { __pushCalls: PushCalls }).__pushCalls = counts
    let current: unknown = null
    const subscription = {
      endpoint,
      unsubscribe: async () => {
        counts.unsubscribe += 1
        current = null
        return true
      },
      toJSON: () => ({
        endpoint,
        expirationTime: null,
        keys: { p256dh: 'BJxc-e2e-public-key', auth: 'e2e-auth-secret' },
      }),
    }
    Object.defineProperty(PushManager.prototype, 'subscribe', {
      configurable: true,
      value: async () => {
        counts.subscribe += 1
        current = subscription
        return subscription
      },
    })
    Object.defineProperty(PushManager.prototype, 'getSubscription', {
      configurable: true,
      value: async () => current,
    })
  }, ENDPOINT)

  const page = await loginAs(context, 'alice')
  await page.goto(PATH.settings)
  const screen = visiblePage(page)
  await expect(screen.getByTestId('settings-section-notifications')).toBeVisible()

  // The server's own answer is the assertion: a 200 on the owner-scoped
  // route means this account's subscription is stored. A refused write
  // would be a 401 or a 422 and the toggle would look exactly the same.
  const registered = page.waitForResponse(
    (r) => r.url().includes('/api/v1/push/subscriptions') && r.request().method() === 'POST',
  )
  await screen.getByTestId('settings-push').click()
  const post = await registered
  expect(post.status()).toBe(200)
  expect(JSON.parse(post.request().postData() ?? '{}').endpoint).toBe(ENDPOINT)

  const calls = () =>
    page.evaluate(() => (window as unknown as { __pushCalls: PushCalls }).__pushCalls)
  expect((await calls()).subscribe).toBe(1)

  // The opt-out is the other half of the pair, and the half a user reaches
  // for when the notifications turn out to be too many: the server is told
  // *and* the browser subscription is actually cancelled.
  const dropped = page.waitForResponse(
    (r) => r.url().includes('/api/v1/push/subscriptions') && r.request().method() === 'DELETE',
  )
  await screen.getByTestId('settings-push').click()
  expect((await dropped).status()).toBe(200)
  expect((await calls()).unsubscribe).toBe(1)

  await context.close()
})
