/**
 * Master data as a precondition: an item, a Vorlage or a group, and the ways
 * a position gets into one (M7/M8/M10).
 */
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { visiblePage } from './page'
import { openQuickAdd } from './trips'

/**
 * Create a master item through M9/M10's own path (spec §2.4). Ends on the
 * new item's editor, which is where a dependency is declared — so a caller
 * building a companion pair calls this twice and wires the second to the
 * first without navigating again.
 */
export async function createMasterItem(page: Page, name: string) {
  await page.goto('/tabs/items')
  await visiblePage(page).getByTestId('m9-fab').click()
  await visiblePage(page).getByTestId('m10-name').locator('input').fill(name)
  await visiblePage(page).getByTestId('m10-create').click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
}

/**
 * Create a template through the app's own path (spec §2.4): M7 FAB → scope
 * chooser → name in the same sheet. Ends on the new template's M8 editor,
 * which is where creating hands over to editing.
 */
export async function createTemplate(page: Page, kind: 'template' | 'group', name: string) {
  await page.getByTestId('m7-fab').click()
  await expect(page.getByTestId('m7-kind-chooser')).toBeVisible()
  await page.getByTestId(`m7-kind-${kind}`).click()

  // FR-27.6 one-surface flow: the name field joins the sheet on the pick.
  const field = page.getByTestId('m7-name-field')
  await expect(field).toBeVisible()
  await field.locator('input').fill(name)
  await page.getByTestId('m7-create-commit').click()

  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visiblePage(page).getByTestId('m8-scope-switch')).toBeVisible()
}

/**
 * Leave M8 for the list the way a user does — the ADR-011 header chevron,
 * which navigates to meta.parent. Not page.goBack(): history-back across the
 * root→tabs outlet boundary trips the known pre-existing Ionic transition
 * defect (see navigation.spec.ts), which on WebKit under full-suite load
 * leaves the outlet wedged over the page and every later tap times out.
 */
export async function backToTemplateList(page: Page) {
  await page.getByTestId('header-back').click()
  await expect(visiblePage(page).getByTestId('m7-fab')).toBeVisible()
  // Settled, not merely arriving: while the outgoing editor is still fading
  // it counts as visible, and M8 shares the `.section-head` grammar with M7 —
  // a one-shot collection over the class would read both pages at once.
  await expect(visiblePage(page).getByTestId('m8-scope-switch')).toHaveCount(0)
}

/** FR-25.13: type into M8's quick-add and commit with Enter. */
export async function addPosition(page: Page, name: string) {
  await openQuickAdd(page, 'm8-fab')
  const input = visiblePage(page).getByTestId('quick-add-input')
  await input.locator('input').fill(name)
  await input.locator('input').press('Enter')
  // The new row is the settled signal — the add is a Local Mode write.
  await expect(
    visiblePage(page).locator('ion-item h2').filter({ hasText: name }).first(),
  ).toBeVisible()
}

/** FR-27.1: include a group into the open Ferien-Vorlage via M8's picker. */
export async function includeGroup(page: Page, groupName: string) {
  await visiblePage(page).getByTestId('m8-include-open').click()
  await visiblePage(page)
    .getByTestId('m8-group-picker')
    .locator('.pick')
    .filter({ hasText: groupName })
    .click()
}

/** Add one position to an existing group, through M7 → M8. */
export async function addToGroup(page: Page, group: string, item: string) {
  await page.goto('/tabs/templates')
  await visiblePage(page).getByTestId('m7-scope-group').click()
  await visiblePage(page).locator('ion-item').filter({ hasText: group }).first().click()
  await expect(page.getByTestId('header-title')).toHaveText(group)
  await addPosition(page, item)
}
