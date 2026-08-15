import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M7 — Template List, scope-shaped (§3.27, FR-27.6).
 *
 * Covers E2E-M7-07 (segmentation, sections, chip, resolved count) and
 * E2E-M7-08 (the FAB's two-option scope chooser). The include-dependent half
 * of M7-07 — the "N Gruppen ·" prefix and the "enthält: …" line — needs a
 * template that includes a group, which only the M8 rebuild can create; the
 * resolution arithmetic behind it is covered in `domain/__tests__/templates`.
 *
 * Local Mode throughout: M7 is backend-free, and the run mode that has no
 * server is the one where a missing client-side rule shows up.
 */

/** The page that is actually painted — a route change alone proves nothing. */
function visible(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

/** Create through the app's own path (spec §2.4): FAB → scope → name. */
async function createTemplate(page: Page, kind: 'template' | 'group', name: string) {
  await page.getByTestId('m7-fab').click()
  await expect(page.getByTestId('m7-kind-chooser')).toBeVisible()
  await page.getByTestId(`m7-kind-${kind}`).click()

  const alert = page.locator('ion-alert')
  await expect(alert).toBeVisible()
  await alert.locator('input').fill(name)
  await alert.getByRole('button', { name: 'Create' }).click()

  // Creating ends where editing continues — M8 on the new template.
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visible(page).getByTestId('m8-scope')).toBeVisible()
}

test.describe('M7 template list — scopes (FR-27.6)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')
  })

  test('E2E-M7-08: the FAB asks which scope to create, and creates that scope', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    // The editor states the scope it was created as — not the default.
    await expect(visible(page).getByTestId('m8-scope')).toHaveText('Group')

    await page.goBack()
    await createTemplate(page, 'template', 'Fotoreise')
    await expect(visible(page).getByTestId('m8-scope')).toHaveText('Vacation template')
  })

  test('E2E-M7-07: Alle renders both scopes as sections, vacation templates first', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await page.goBack()
    await createTemplate(page, 'template', 'Fotoreise')
    await page.goBack()

    const list = visible(page)
    await expect(list.getByTestId('m7-section-template')).toBeVisible()
    await expect(list.getByTestId('m7-section-group')).toBeVisible()

    // Order is the point of the section split: a trip starts from a Vorlage,
    // groups are the building blocks. Asserted on the rendered sequence, not
    // on the two locators existing.
    const heads = await list.locator('.section-head').allInnerTexts()
    expect(heads.map((h) => h.split('\n')[0])).toEqual(['Vacation templates', 'Groups'])
  })

  test('E2E-M7-07: a group row carries the Gruppe chip and a Vorlage row does not', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await page.goBack()
    await createTemplate(page, 'template', 'Fotoreise')
    await page.goBack()

    const list = visible(page)
    await expect(list.locator('ion-item', { hasText: 'Makro' }).locator('.scope-chip')).toHaveText(
      'Group',
    )
    await expect(
      list.locator('ion-item', { hasText: 'Fotoreise' }).locator('.scope-chip'),
    ).toHaveCount(0)
  })

  test('E2E-M7-07: the scope tabs filter to one scope and drop the section heads', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await page.goBack()
    await createTemplate(page, 'template', 'Fotoreise')
    await page.goBack()

    const list = visible(page)
    await list.getByTestId('m7-scope-group').click()
    await expect(list.locator('ion-item', { hasText: 'Makro' })).toBeVisible()
    await expect(list.locator('ion-item', { hasText: 'Fotoreise' })).toHaveCount(0)
    // One scope needs no section label — the segment already said which.
    await expect(list.locator('.section-head')).toHaveCount(0)

    await list.getByTestId('m7-scope-template').click()
    await expect(list.locator('ion-item', { hasText: 'Fotoreise' })).toBeVisible()
    await expect(list.locator('ion-item', { hasText: 'Makro' })).toHaveCount(0)
  })

  test('E2E-M7-06 (partial): the empty state names both scopes and drops the segment', async ({
    page,
  }) => {
    const list = visible(page)
    await expect(list.getByTestId('m7-empty')).toContainText('No templates yet')
    // With nothing to filter, the segment would be a control over an empty set.
    await expect(list.getByTestId('m7-scope-segment')).toHaveCount(0)
  })
})
