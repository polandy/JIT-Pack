import { test, expect, seed, createTripViaWizard, visiblePage } from './fixtures'
import { quickAddItem } from './serverMode'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

/**
 * M17 — the settings a device keeps to itself (UI-Test-Spec §4, unit
 * "M17 device settings", 2026-08-30).
 *
 * Written out of the backlog-item-6 reading of M17's promises. Two of the
 * three cases here cover a control that had never been pressed: every
 * existing theme assertion seeds `jitpack_theme` into `localStorage` and
 * then checks the flavour, which says the *palette* works and nothing about
 * the switch the user actually has.
 */

/** Leave M17 and come back — the entry the reminder is recomputed on. */
async function reenterSettings(page: Page) {
  await page.goto(PATH.trips)
  await expect(visiblePage(page).getByTestId('trips-new')).toBeVisible()
  await page.goto(PATH.settings)
  await expect(visiblePage(page).getByTestId('settings-section-data')).toBeVisible()
}

test.describe('M17 device settings @local @m17', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { mode: 'local' })
  })

  // E2E-M17-06 (G-11/FR-21.3): the Appearance toggle is what changes the
  // flavour, it is device-local, and it survives a reload. The last click
  // is what proves the reloaded toggle came back *on*: against a control
  // that rendered stale-off it would turn Latte on a second time.
  test('E2E-M17-06: the theme toggle switches the flavour, and the choice survives a reload', async ({
    page,
  }) => {
    await page.goto(PATH.settings)
    const toggle = visiblePage(page).getByTestId('settings-theme')
    await expect(toggle).toBeVisible()
    await expect(page.locator('html')).not.toHaveClass(/jitpack-latte/)

    await toggle.click()
    await expect(page.locator('html')).toHaveClass(/jitpack-latte/)

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/jitpack-latte/)

    await visiblePage(page).getByTestId('settings-theme').click()
    await expect(page.locator('html')).not.toHaveClass(/jitpack-latte/)
  })

  // E2E-M17-08 (G-8/FR-17.3): a device with no instance has nobody to be
  // notified by, so the section is absent rather than empty. Asserted
  // against the sections that *are* there — a screen that failed to render
  // would satisfy the absence on its own.
  test('E2E-M17-08: a device with no session carries no notification section', async ({ page }) => {
    await page.goto(PATH.settings)

    await expect(visiblePage(page).getByTestId('settings-section-appearance')).toBeVisible()
    await expect(visiblePage(page).getByTestId('settings-section-data')).toBeVisible()
    await expect(visiblePage(page).getByTestId('settings-section-notifications')).toHaveCount(0)
  })

  // E2E-M17-07 (NFR-4.11): the backup the reminder is about is the *whole
  // device*, which is the G-2 sheet's export. A single trip's YAML is not
  // it — and until 2026-08-30 it stamped the same key, so downloading one
  // trip silenced the warning about everything the file did not contain.
  test('E2E-M17-07: one trip is not a backup, and the device backup is', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Elba' })
    await page.goto(PATH.settings)

    const reminder = visiblePage(page).getByTestId('settings-backup-reminder')
    await expect(reminder).toContainText("You haven't backed up yet")

    // One trip, downloaded for real — the file arrives, and the warning
    // about the device stays exactly where it was. The picker first: the
    // button is inert until a trip is named, which is the shape of every
    // per-document export in this section.
    const yamlRow = visiblePage(page).locator('ion-item').filter({ hasText: 'Trip (YAML)' })
    await yamlRow.locator('ion-select').click()
    await page
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: 'Elba' })
      .click()
    await expect(page.locator('ion-popover')).toHaveCount(0)

    const tripYaml = page.waitForEvent('download')
    await yamlRow.getByRole('button', { name: 'Download' }).click()
    expect((await tripYaml).suggestedFilename()).toBe('Elba.yaml')
    await reenterSettings(page)
    await expect(visiblePage(page).getByTestId('settings-backup-reminder')).toContainText(
      "You haven't backed up yet",
    )

    // The device backup, through the one door that offers it (FR-19.6).
    await page.getByTestId('sync-indicator').click()
    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet).toBeVisible()
    const backup = page.waitForEvent('download')
    await sheet.getByTestId('sync-detail-backup').click()
    expect((await backup).suggestedFilename()).toMatch(/^jitpack-backup-\d{4}-\d{2}-\d{2}\.yaml$/)
    // Closed through the sheet's own ✕: Escape leaves this one standing,
    // and a modal still over the outlet answers the next navigation.
    await sheet.getByTestId('sync-detail-close').click()
    await expect(page.getByTestId('sync-detail-sheet')).toHaveCount(0)

    await reenterSettings(page)
    await expect(visiblePage(page).getByTestId('settings-backup-reminder')).toHaveCount(0)
  })

  // E2E-M17-07b (NFR-4.11): a stamp older than the threshold says how old.
  // The age comes from a seeded stamp rather than a mocked clock — the
  // decision is pure (`reminderState`) and what is asserted here is that
  // the screen reads the stored value and words it, plural included.
  test('E2E-M17-07b: a stale backup is reported with its age', async ({ page }) => {
    const fortyDaysAgo = Date.now() - 40 * 86_400_000
    await page.addInitScript((stamp: number) => {
      localStorage.setItem('jitpack_last_export', String(stamp))
    }, fortyDaysAgo)

    await page.goto(PATH.settings)

    await expect(visiblePage(page).getByTestId('settings-backup-reminder')).toContainText(
      'Last backup was 40 days ago',
    )
  })

  /**
   * E2E-M17-14b (FR-19.8, ADR-045): the guard on the switch, both directions.
   * A guard that only ever enables is a delay, not a rule — so the case takes
   * it closed → open → closed again, with a write in between that happened on
   * another screen. The walk itself is E2E-M17-14, in the `single` project.
   */
  test('E2E-M17-14b: the switch is refused until the backup covers the device, and refused again after a write', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Bergell' })
    await page.goto(PATH.settings)
    const card = visiblePage(page).getByTestId('settings-move-card')
    await expect(card).toBeVisible()

    // Closed: the trip is newer than any backup, and the card says so.
    await expect(card.getByTestId('settings-move-guard')).toBeVisible()
    await expect(card.getByTestId('settings-move-switch')).toHaveAttribute('disabled', '')

    const downloadPromise = page.waitForEvent('download')
    await card.getByTestId('settings-move-backup').click()
    expect((await downloadPromise).suggestedFilename()).toMatch(/^jitpack-backup-.*\.yaml$/)

    // Open: the card's own backup is what enables it.
    await expect(card.getByTestId('settings-move-guard')).toHaveCount(0)
    await expect(card.getByTestId('settings-move-switch')).not.toHaveAttribute('disabled')

    // Closed again: a write on M4, stamped by the orchestrator, and M17 reads
    // it on re-entry (the same trigger the reminder uses).
    await page.goto(PATH.trips)
    await visiblePage(page).getByTestId('trip-row-Bergell').click()
    await quickAddItem(page, 'Regenjacke')
    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
    await reenterSettings(page)
    await expect(card.getByTestId('settings-move-guard')).toBeVisible()
    await expect(card.getByTestId('settings-move-switch')).toHaveAttribute('disabled', '')
  })
})
