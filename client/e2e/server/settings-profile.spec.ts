/**
 * E2E-M17-05 (FR-17.13, revised 2026-08-29): under an OIDC session the profile
 * splits — the picture is the user's, the display name is the provider's.
 *
 * This is the case the `single` project cannot carry: E2E-M17-04 drives the
 * same screen without tokens, which is exactly the branch that was already
 * editable. Only a project with a real login reaches the branch that changed.
 */
import { test, expect, visiblePage } from '../fixtures'
import { loginAs } from './fixtures'
import { PATH } from '../routes'

test('E2E-M17-05: the picture control is offered to an OIDC account', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await loginAs(context, 'alice')

  await page.goto(PATH.settings)
  const screen = visiblePage(page)
  await expect(screen.getByTestId('settings-section-profile')).toBeVisible()

  // The change this case exists for: before it, the label was gated on the
  // absence of a session and no OIDC account could ever set a picture.
  await expect(screen.locator('.avatar-upload input[type="file"]')).toHaveCount(1)

  await context.close()
})

test('E2E-M17-05b: the display name stays the provider’s, and the note says so', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await loginAs(context, 'alice')

  await page.goto(PATH.settings)
  const screen = visiblePage(page)

  // The boundary of the change: the name is IdP-sourced, so it is not an
  // editable copy. No save button is the positive signal — a readonly binding
  // on an Ionic input reflects onto no DOM attribute, so asserting its absence
  // would pass against an editable field too.
  await expect(screen.getByTestId('settings-name-save')).toHaveCount(0)

  const note = screen.getByTestId('settings-name-managed')
  await expect(note).toBeVisible()
  await expect(note).toContainText('display name')

  await context.close()
})
