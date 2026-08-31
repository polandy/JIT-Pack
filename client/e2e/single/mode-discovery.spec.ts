import { test, expect, seed, visiblePage } from '../fixtures'

/**
 * E2E-M19-02, the `single` half (FR-19.1, CLAUDE.md invariant 5), and
 * E2E-NFR-02 (NFR-4.8) with it.
 *
 * NFR-02's own sentence asks for the instance to boot "with no IdP
 * reachable (no OIDC env, network to any IdP blocked)". The second half
 * cannot be driven and does not need to be: a Single-User instance names
 * no issuer, so there is no host to block, and blocking one would assert
 * against a request the app never makes. What is left of the promise is
 * the first half, and it is exactly what this case renders.
 *
 * Single-User Mode is **not a client mode**: the device persists
 * `jitpack_mode = 'server'` like any other server device, and what makes it
 * single-user is the answer it gets from `GET /auth/config` — 501
 * `not_configured`, because that instance has no OIDC. The client's whole
 * knowledge of which of the two it is talking to is that one response.
 *
 * Every `single` case in the suite depends on this and none of them asserts
 * it: they boot through `bootPage` and navigate on, so the discovery is a
 * *fixture* here — the shape the M18 audit named, where a screen used to
 * get somewhere reads like a screen that is covered. A regression that sent
 * this device to a login it can never complete would surface in the other
 * cases as an unrelated timeout on the screen they wanted next.
 *
 * The response status is asserted beside the rendered dashboard, because
 * "no login screen" alone is equally green on a device that never asked.
 */
test('E2E-M19-02, E2E-NFR-02: a Single-User instance offers no OIDC, so the app lands on M1 @single @m19', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await seed(page, { mode: 'server' })

  const config = page.waitForResponse((r) => r.url().includes('/auth/config'))
  await page.goto('/')

  expect((await config).status()).toBe(501)
  await expect(visiblePage(page).getByTestId('dashboard-greeting')).toBeVisible()
  await expect(page.getByTestId('login-action')).toHaveCount(0)
})
