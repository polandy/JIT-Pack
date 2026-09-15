import { expect, test, visiblePage } from '../fixtures'
import { bootPage } from '../serverMode'
import { PATH } from '../routes'

/**
 * E2E-M17-17 (FR-23.8) — an instance nobody asked to check says nothing
 * about releases.
 *
 * `single` rather than `local`, because the default is the thing under
 * test and only a real backend can hold it: this project's jitpackd runs
 * without `JITPACK_UPDATE_CHECK`, so the endpoint answers `off` and the
 * screen renders no release line. In `local` there is no server at all and
 * the same absence would prove nothing about the default.
 *
 * The other three states need an upstream feed that answers on demand,
 * which no Playwright project has; they are covered against the component
 * in `SettingsUpdateCheck.spec.ts` and against the endpoint in
 * `internal/api/update_test.go`.
 */
test.describe('the release check, backend-backed @single @m17', () => {
  test('E2E-M17-17: an instance that was not asked to check shows no release line', async ({
    browser,
  }) => {
    const page = await bootPage(await browser.newContext())
    await page.goto(PATH.settings)
    const screen = visiblePage(page)

    // The positive signal first: the About block did render. Without it
    // every absence below would also pass on a screen that never arrived.
    await expect(screen.getByTestId('settings-app-version')).toBeVisible()

    await expect(screen.getByTestId('settings-update-available')).toHaveCount(0)
    await expect(screen.getByTestId('settings-update-current')).toHaveCount(0)
    await expect(screen.getByTestId('settings-update-unreachable')).toHaveCount(0)
  })
})
