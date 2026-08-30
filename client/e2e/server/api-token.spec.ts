/**
 * E2E-M17-13 (FR-23.7, ADR-039): a token created on the screen actually
 * authenticates.
 *
 * The only case in the suite that sends an `Authorization` header, and the
 * only project that can carry it: `local` has no server and `single` bypasses
 * authentication entirely, so neither can tell a working credential from an
 * ignored one.
 *
 * The token is read out of the page rather than out of the clipboard on
 * purpose. `navigator.clipboard` needs a permission grant under Playwright,
 * and asserting on it would make the case about the browser; asserting on the
 * rendered value is what "shown exactly once" actually promises — shown to
 * the person.
 */
import { test, expect, visiblePage } from '../fixtures'
import { loginAs, ACCOUNT_NAMES } from './fixtures'

test.describe('API tokens @server', () => {
  test.slow()

  test('E2E-M17-13: a token minted in M17 authenticates as its owner', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext()
    const page = await loginAs(context, 'alice')

    await page.goto('/tabs/settings')
    const screen = visiblePage(page)
    await expect(screen.getByTestId('settings-section-tokens')).toBeVisible()

    await screen.getByTestId('token-name').locator('input').fill('e2e cleanup')
    await screen.getByTestId('token-create').click()

    // The reveal, and the value in it.
    await expect(screen.getByTestId('token-sheet')).toBeVisible()
    const token = (await screen.getByTestId('token-value').textContent())?.trim() ?? ''
    expect(token, 'the reveal showed no token').toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)

    // A fresh context holds no session, so nothing but the header can be
    // authenticating the calls below.
    const api = await browser.newContext({ baseURL })

    const withToken = await api.request.get('/api/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(withToken.status(), await withToken.text()).toBe(200)
    expect((await withToken.json()).display_name).toBe(ACCOUNT_NAMES.alice)

    // The negative halves, so the 200 above cannot be coming from anywhere
    // else: no header at all, and a header one character off.
    const bare = await api.request.get('/api/v1/me')
    expect(bare.status(), 'the endpoint answered without any credential').toBe(401)

    const tampered = await api.request.get('/api/v1/me', {
      headers: { Authorization: `Bearer ${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}` },
    })
    expect(tampered.status(), 'a token with a broken signature was accepted').toBe(401)

    await api.close()
    await context.close()
  })

  test('E2E-M17-13b: the token is gone from the screen once the reveal is closed', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await loginAs(context, 'alice')

    await page.goto('/tabs/settings')
    const screen = visiblePage(page)
    await screen.getByTestId('token-name').locator('input').fill('e2e once')
    await screen.getByTestId('token-create').click()
    await expect(screen.getByTestId('token-value')).toBeVisible()

    await screen.getByTestId('token-done').click()

    // "Shown exactly once" is a promise about the second look.
    await expect(screen.getByTestId('token-value')).toHaveCount(0)
    await expect(screen.getByTestId('token-sheet')).toHaveCount(0)

    await context.close()
  })
})
