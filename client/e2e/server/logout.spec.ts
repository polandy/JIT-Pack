/**
 * E2E-M17-16 (FR-19.9): the session can be ended from the app.
 *
 * Without a view calling `clearTokens`, a device holding a token its
 * instance no longer accepts can only be repaired through the browser's
 * website data — and for an installed PWA by deleting it from the home
 * screen. This is the project that can carry the case: `local` has no
 * server and `single` has no session to end.
 */
import { test, expect, visiblePage } from '../fixtures'
import { loginAs } from './fixtures'
import { PATH } from '../routes'

test('E2E-M17-16: logging out returns the device to the login and keeps it there', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await loginAs(context, 'alice')

  await page.goto(PATH.settings)
  await visiblePage(page).getByTestId('settings-logout').click()

  const confirm = page.locator('ion-alert')
  await expect(confirm).toBeVisible()
  await confirm.locator('button.alert-button-role-confirm').click()

  // The app shell takes the device back to the login — the same end an IdP
  // refusing a refresh brings about (ADR-059).
  await expect(visiblePage(page).getByTestId('login-action')).toBeVisible()

  // And it stays ended across a reload: the tokens are gone from the device,
  // not merely from this page's memory.
  await page.reload()
  await expect(visiblePage(page).getByTestId('login-action')).toBeVisible()

  await context.close()
})
