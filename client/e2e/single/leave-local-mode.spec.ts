import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { quickAddItem, uniq } from '../serverMode'
import { PATH } from '../routes'

/**
 * FR-19.8 (ADR-045) — leaving Local Mode on the same device, against the
 * Single-User instance. `single` because `local` has nothing to switch to and
 * `server` would put a login between step 2 and step 3, which is E2E-M19-02's
 * clause and not this one's.
 *
 * The seed is written by hand rather than through `seed()`: that helper's
 * init script re-seeds `jitpack_mode` on every navigation, which would put the
 * device back into Local Mode on the very reload the switch performs.
 */
async function seedLocalOnce(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('jitpack_mode')) localStorage.setItem('jitpack_mode', 'local')
    if (!localStorage.getItem('jitpack_locale')) localStorage.setItem('jitpack_locale', 'en')
  })
}

/** Everything the server holds, through the API the app itself uses. */
async function serverExport(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch('/api/v1/me/export.json')
    return JSON.stringify(await res.json())
  })
}

/** Steps 1 and 2 on M17: a fresh backup, then the switch. Returns the file. */
async function backUpAndSwitch(page: Page): Promise<string> {
  await page.goto(PATH.settings)
  const card = visiblePage(page).getByTestId('settings-move-card')
  await expect(card).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await card.getByTestId('settings-move-backup').click()
  const backup = await readFile(await (await downloadPromise).path(), 'utf8')
  await expect(card.getByTestId('settings-move-guard')).toHaveCount(0)
  // The field is pre-filled with the page's origin, which is where the
  // Single-User instance answers from behind the preview proxy.
  await card.getByTestId('settings-move-switch').click()
  // The switch reloads; the bar is the first thing the relaunched app says.
  await expect(page.getByTestId('migration-banner')).toBeVisible()
  await expect(page.getByTestId('mode-selection')).toHaveCount(0)
  return backup
}

test.describe('M17 leaving Local Mode (FR-19.8) @single @m17', () => {
  test('E2E-M17-14: the whole move on one device, read back from the server', async ({ page }) => {
    test.slow()
    const id = uniq()
    const trip = `Bergell ${id}`
    const second = `Puschlav ${id}`
    const row = `Regenjacke-${id}`

    await seedLocalOnce(page)
    // Two trips, because a backup of one document opens M18's merge preview
    // and never the restore branch (E2E-M18-05's reason).
    await createTripViaWizard(page, { name: second })
    await createTripViaWizard(page, { name: trip, travelers: ['Andy'] })
    await quickAddItem(page, row)
    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')

    // Positive proof the server knows none of this before the move.
    expect(await serverExport(page)).not.toContain(trip)

    const backup = await backUpAndSwitch(page)

    await page.getByTestId('migration-banner-restore').click()
    await expect(visiblePage(page).getByTestId('portable-paste')).toBeVisible()
    await page.getByTestId('portable-paste').locator('textarea').fill(backup)
    await page.getByTestId('portable-preview').click()
    await expect(page.getByTestId('portable-restore')).toBeVisible()
    await page.getByTestId('portable-restore-commit').click()
    await expect(visiblePage(page).getByTestId(`trip-row-${trip}`)).toBeVisible()

    // The restore is what clears the flag, and it stays cleared across a load.
    await expect(page.getByTestId('migration-banner')).toHaveCount(0)
    await page.reload()
    await expect(visiblePage(page).getByTestId(`trip-row-${trip}`)).toBeVisible()
    await expect(page.getByTestId('migration-banner')).toHaveCount(0)

    // Settled before the server is asked: the G-2 sheet's queue line is the
    // signal that nothing is still waiting to be pushed (FLOW-07's reason —
    // `synced` on the glyph means no push in flight, not an empty queue).
    await page.getByTestId('sync-indicator').click()
    await expect(page.getByTestId('sync-detail-sheet')).toBeVisible()
    await expect(page.getByTestId('sync-detail-pending')).toHaveCount(0)
    await page.getByTestId('sync-detail-close').click()

    // The server's own account of it: the trip and its row — the partition
    // FLOW-07 found left behind — read through the API, not off the screen.
    const exported = await serverExport(page)
    expect(exported).toContain(trip)
    expect(exported).toContain(row)
  })

  test('E2E-M17-14c: skipping the restore is its own outcome', async ({ page }) => {
    test.slow()
    const id = uniq()
    const trip = `Val Müstair ${id}`

    await seedLocalOnce(page)
    await createTripViaWizard(page, { name: trip })
    await createTripViaWizard(page, { name: `Poschiavo ${id}` })
    await backUpAndSwitch(page)

    await page.getByTestId('migration-banner-skip').click()
    const alert = page.locator('ion-alert')
    await expect(alert).toBeVisible()
    await alert.getByRole('button', { name: 'Start fresh' }).click()
    await expect(page.getByTestId('migration-banner')).toHaveCount(0)

    await page.reload()
    await expect(visiblePage(page).getByTestId('settings-section-data')).toBeVisible()
    await expect(page.getByTestId('migration-banner')).toHaveCount(0)
    // Nothing was restored: the server has no such trip. The export having
    // answered at all is the positive signal for that absence.
    const exported = await serverExport(page)
    expect(exported).toContain('"trips"')
    expect(exported).not.toContain(trip)
  })
})
