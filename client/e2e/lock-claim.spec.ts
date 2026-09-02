import { test, expect, createTripViaWizard, openQuickAdd, visiblePage } from './fixtures'
import type { Page } from '@playwright/test'
import { openRowMenu } from './helpers/m4'

/**
 * G-3 — a packing claim can be given back, and an abandoned one says so
 * (UI-Test-Spec E2E-M4-49/50; backlog 14d).
 *
 * The claim itself has worked for a long time. What it could not do was
 * *end*: nothing but packing the row or the §7 window passing released it,
 * so a tap made by mistake held the row against everyone else for a
 * quarter of an hour, and when the window did pass the row simply became
 * operable again with nobody told why.
 *
 * Local Mode, deliberately: the claim is client-side (owner decision
 * 2026-08-23), so both behaviours run here with no server in the way. What
 * a *second* device sees of a claim is E2E-FLOW-01's business.
 */
test.use({ reducedMotion: 'reduce' })

async function tripWithRow(page: Page, name: string) {
  await createTripViaWizard(page, { name: 'Sperrprobe', travelers: ['Andy'] })
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(name)
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
}

test.describe('G-3 — a claim can be given back', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-49: claiming a row says so on the row, and releasing it takes that back', async ({
    page,
  }) => {
    await tripWithRow(page, 'Zelt')

    await openRowMenu(page, 'Zelt')
    await page.locator('ion-action-sheet button', { hasText: 'Pack' }).first().click()
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)

    // The claim is mine, so nothing is locked *for me* — which is exactly
    // why the row has to say it out loud, or I cannot tell that I am
    // holding it against everybody else.
    const row = visiblePage(page).getByTestId('m4-row-Zelt')
    await expect(row.getByTestId('m4-own-claim')).toBeVisible()

    await openRowMenu(page, 'Zelt')
    const release = page.locator('ion-action-sheet button', { hasText: /give the item back/i })
    await expect(release).toBeVisible()
    await release.click()

    // Gone from the row, and the row is an ordinary one again: the note
    // disappearing on its own would also happen if the row vanished.
    await expect(row.getByTestId('m4-own-claim')).toHaveCount(0)
    await expect(row).toBeVisible()
  })

  test('E2E-M4-50: a claimed row offers the release and nothing that contradicts it', async ({
    page,
  }) => {
    await tripWithRow(page, 'Zelt')

    await openRowMenu(page, 'Zelt')
    await page.locator('ion-action-sheet button', { hasText: 'Pack' }).first().click()
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)

    await openRowMenu(page, 'Zelt')
    const buttons = page.locator('ion-action-sheet button')
    // Release plus Cancel, and no "skip" — skipping something you are in
    // the middle of packing is not a thing anyone means. Asserted as a
    // count as well as by name, so an added third option is not silent.
    await expect(buttons).toHaveCount(2)
    await expect(
      page.locator('ion-action-sheet button', { hasText: /give the item back/i }),
    ).toBeVisible()
  })
})
