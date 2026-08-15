import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M7 — Template List, scope-shaped (§3.27, FR-27.6).
 *
 * Covers E2E-M7-07 (segmentation, sections, chip, resolved count), E2E-M7-08
 * (the FAB's scope chooser with the name field in the same sheet) and
 * E2E-M7-04 (the long-press/right-click row menu carrying export). The include-dependent half
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

/** Create through the app's own path (spec §2.4): FAB → scope → name, one sheet. */
async function createTemplate(page: Page, kind: 'template' | 'group', name: string) {
  await page.getByTestId('m7-fab').click()
  await expect(page.getByTestId('m7-kind-chooser')).toBeVisible()
  await page.getByTestId(`m7-kind-${kind}`).click()

  // FR-27.6 one-surface flow: the name field joins the sheet on the pick.
  const field = page.getByTestId('m7-name-field')
  await expect(field).toBeVisible()
  await field.locator('input').fill(name)
  await page.getByTestId('m7-create-commit').click()

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

  test('E2E-M7-08: the commit is disabled until a name exists — no unnamed row is ever written', async ({
    page,
  }) => {
    await page.getByTestId('m7-fab').click()
    await page.getByTestId('m7-kind-group').click()
    // The pick is stated where the eye is — on the card, not only in state.
    await expect(page.getByTestId('m7-kind-group')).toHaveClass(/picked/)
    // Not toBeDisabled(): an ion-button's disabled state lives on the custom
    // element as aria-disabled, which Playwright's matcher does not read —
    // the same false-green this suite already paid for once on toBeEnabled().
    const commit = page.getByTestId('m7-create-commit')
    await expect(commit).toHaveAttribute('aria-disabled', 'true')

    // The attribute flips with the name — proof the guard is the name, not
    // a permanently dead button.
    await page.getByTestId('m7-name-field').locator('input').fill('x')
    await expect(commit).not.toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('m7-name-field').locator('input').clear()
    await expect(commit).toHaveAttribute('aria-disabled', 'true')

    // Dismissing the half-finished sheet leaves the list untouched: the
    // whole point of name-in-sheet over create-then-rename (owner decision
    // 2026-08-15) is that no row exists before the commit.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('m7-kind-chooser')).toBeHidden()
    await expect(visible(page).getByTestId('m7-empty')).toBeVisible()
  })

  test('E2E-M7-04: the row menu carries export, and opening it does not navigate', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await page.goBack()

    const row = visible(page).locator('ion-item', { hasText: 'Makro' })
    await expect(row).toBeVisible()
    // The inline button is gone — matched by its aria-label, because the row
    // itself renders as a button and would answer a bare role query. The
    // positive signal for the absence is the menu below carrying export.
    await expect(row.locator('[aria-label="Export template"]')).toHaveCount(0)

    // contextmenu is the same handler the touch long-press fires into —
    // the seam that keeps this case free of a real 500 ms hold.
    await row.dispatchEvent('contextmenu')
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Export template' })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await sheet.getByRole('button', { name: 'Export template' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Makro.yaml')

    // Opening the menu must not also open the row (the suppressed click).
    await expect(visible(page).getByTestId('m7-scope-segment')).toBeVisible()
  })

  test('E2E-M7-04: a touch hold opens the menu and swallows the release click', async ({
    page,
  }) => {
    // The contextmenu case above never emits a click, so it cannot exercise
    // the release-click guard — only the real hold path does. The 500 ms are
    // driven by an installed clock (the deterministic seam), never waited out.
    await createTemplate(page, 'group', 'Makro')
    await page.goto('/tabs/templates')

    const row = visible(page).locator('ion-item', { hasText: 'Makro' })
    await expect(row).toBeVisible()
    const box = (await row.boundingBox())!

    await page.clock.install()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.clock.fastForward(600)
    await expect(page.locator('ion-action-sheet')).toBeVisible()
    await page.mouse.up()

    // While the menu lives, a row click must be inert. dispatchEvent, not
    // click(): the overlay intercepts real pointers, and the guard exists
    // precisely for the click that reaches the row anyway — the hold's own
    // release racing the overlay attach. The sheet staying up is the
    // positive signal that the click changed nothing.
    await row.dispatchEvent('click')
    await expect(page.locator('ion-action-sheet')).toBeVisible()
    await expect(visible(page).getByTestId('m7-scope-segment')).toBeVisible()

    // Dismissed, the guard lifts with it: the next plain tap opens the row.
    // First caught red by exactly this assertion, against a one-shot
    // swallow-next-click flag that went stale when the release click never
    // arrived — the guard is a state with an end, not a counter.
    await page.locator('ion-action-sheet').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('ion-action-sheet')).toBeHidden()
    await row.click()
    await expect(visible(page).getByTestId('m8-scope')).toBeVisible()
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
