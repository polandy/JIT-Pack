import { test, expect } from './fixtures'
import { visiblePage as visible } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Writing on a plain-HTTP instance (E2E-NFR-SEC-01).
 *
 * `crypto.randomUUID` is defined only in a **secure context**. A self-hosted
 * instance reached over the LAN — `http://192.168.1.35:3000`, which is how the
 * owner uses it from an iPad — is not one, and every id the client mints came
 * from that function: creating an item, a trip, a tag or a template threw
 * "crypto.randomUUID is not a function" and the screen simply did nothing
 * (2026-08-16).
 *
 * **Why this file exists rather than an assertion inside another unit:** the
 * suite serves from `localhost`, which *is* a secure context, so no ordinary
 * case can reach the broken state — the defect was invisible to a green suite
 * on principle, not by accident. Removing `randomUUID` before the app boots
 * reproduces the LAN situation deterministically, and is the only way CI can
 * hold the fix.
 */

/** What a plain-HTTP origin actually offers: getRandomValues, nothing else. */
async function withoutRandomUUID(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  })
}

test.describe('a plain-HTTP instance can still write (NFR-4.2a)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await withoutRandomUUID(page)
  })

  test('E2E-NFR-SEC-01: the id source survives an insecure context', async ({ page }) => {
    await page.goto('/tabs/items')

    // The premise, asserted rather than assumed — if a future browser or a
    // future config made randomUUID available here, this case would otherwise
    // keep passing while testing nothing.
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined')
    expect(await page.evaluate(() => typeof crypto.getRandomValues)).toBe('function')
  })

  test('E2E-NFR-SEC-02: a new inventory item is created and listed (FR-24.5)', async ({ page }) => {
    await page.goto('/tabs/items')
    await visible(page).getByTestId('m9-fab').click()

    await page.getByTestId('m10-name').locator('input').fill('Hosen')
    await page.getByTestId('m10-create').click()

    await page.goto('/tabs/items')
    await expect(visible(page).getByText('Hosen')).toBeVisible()
  })

  test('E2E-NFR-SEC-03: a trip is created through M3 (FR-2.1b)', async ({ page }) => {
    await page.goto('/trips/new')

    await page.getByTestId('wizard-name').locator('input').fill('Ohne HTTPS')
    await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('wizard-next').click()
    await page.getByTestId('wizard-next').click()
    await page.getByTestId('wizard-next').click()
    await page.getByTestId('wizard-create').click()

    // Landing on M4 means the trips row, its travelers and its items all got
    // ids — the whole cascade, not just the first insert.
    await expect(page.getByTestId('header-title')).toHaveText('Ohne HTTPS')
  })

  test('E2E-NFR-SEC-04: a group and its position are created (FR-27.1)', async ({ page }) => {
    await page.goto('/tabs/templates')

    await page.getByTestId('m7-fab').click()
    await page.getByTestId('m7-kind-group').click()
    await page.getByTestId('m7-name-field').locator('input').fill('Makro')
    await page.getByTestId('m7-create-commit').click()
    await expect(page.getByTestId('header-title')).toHaveText('Makro')

    const input = visible(page).getByTestId('quick-add-input')
    if (!(await input.isVisible().catch(() => false))) {
      await visible(page).getByTestId('m8-fab').click()
    }
    await input.locator('input').fill('Kamera')
    await input.locator('input').press('Enter')

    await expect(
      visible(page).locator('ion-item h2').filter({ hasText: 'Kamera' }).first(),
    ).toBeVisible()
  })
})
