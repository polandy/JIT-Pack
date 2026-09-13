/**
 * The two things a device could not say and could not do (FR-19.6/FR-19.9).
 *
 * Both cases exist because of one iPad on the family instance: it showed no
 * trips and a permanent *offline* glyph while the server was healthy and held
 * the data, and there was no way to find out more from the device and no way
 * to repair it from inside the app. The `single` project is the smallest one
 * that can carry them — the diagnostic and the Connection block are Server
 * Mode surfaces (G-8), and neither needs a second identity.
 */
import { test, expect, seed, visiblePage } from '../fixtures'
import { PATH } from '../routes'

/** Both sync endpoints, whichever partition (NFR-4.14, ADR-027). */
const SYNC_PATH = /\/api\/v1\/(?:trips\/[^/]+|master)\/sync/

test('E2E-G2-15: the sync detail names the request that failed, not only that something did', async ({
  page,
}) => {
  // Seeded here rather than through `bootPage`, which opens a page of its own:
  // the routes below have to be installed on *this* page before it navigates.
  await seed(page, { mode: 'server' })

  // Refused before the app ever starts, so the boot pull is what fails and the
  // glyph has the same nothing to say it had on the iPad. Counted, so the case
  // cannot pass in a world where no request was made at all.
  let refused = 0
  await page.route(SYNC_PATH, (route) => {
    refused += 1
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
  })

  await page.goto(PATH.trips)

  await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'offline')
  expect(refused).toBeGreaterThan(0)

  await page.getByTestId('sync-indicator').click()
  const sheet = page.getByTestId('sync-detail-sheet')
  await expect(sheet).toBeVisible()

  // What the person holding the device can now read out: the status, the
  // method and the path. Untranslated on purpose — a diagnostic is copied,
  // not read as screen copy (NFR-4.12's boundary).
  const line = sheet.getByTestId('sync-detail-last-failure')
  await expect(line).toContainText('503')
  await expect(line).toContainText('/sync')
})

/**
 * Deliberately **not** seeded through `bootPage`: `seed()` writes the mode with
 * `addInitScript`, which runs before *every* navigation, so the reload after the
 * reset would put the mode straight back and M19 could never render. The mode is
 * therefore chosen the way a first launch chooses it — which is also the screen
 * this case claims comes back.
 */
test('E2E-M17-15: the connection can be forgotten, and M19 asks again', async ({ page }) => {
  await page.goto('/')

  // First launch: the field is pre-filled with the page's own origin (FR-19.1).
  await expect(page.getByTestId('mode-selection')).toBeVisible()
  await page.getByTestId('mode-server-connect').click()
  await expect(visiblePage(page).getByTestId('dashboard')).toBeVisible()

  await page.goto(PATH.settings)
  const screen = visiblePage(page)

  // The block names the instance, and offers no logout: Single-User Mode has
  // no session to end (G-8). The reset beside it is the positive signal that
  // the block rendered at all.
  await expect(screen.getByTestId('settings-server-url')).toContainText('http')
  await expect(screen.getByTestId('settings-logout')).toHaveCount(0)
  await screen.getByTestId('settings-reset-connection').click()

  const confirm = page.locator('ion-alert')
  await expect(confirm).toBeVisible()
  await confirm.locator('button.alert-button-role-destructive').click()

  // The reload lands on M19 — the screen that was unreachable for the whole
  // life of a device once its mode had been chosen.
  await expect(page.getByTestId('mode-selection')).toBeVisible()
  await expect(page.getByTestId('mode-local')).toBeVisible()
})
