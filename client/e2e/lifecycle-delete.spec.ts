import type { Page } from '@playwright/test'

import {
  addPosition,
  backToTemplateList,
  createTemplate,
  openQuickAdd,
  test,
  expect,
  visiblePage,
} from './fixtures'
import { backToInventory, createItem } from './helpers/m9'
import { PATH } from './routes'

/**
 * FR-24.3 — lifecycle-aware deletion of master items and Vorlagen.
 *
 * The two branches are the whole feature and they are opposite acts, so both
 * are driven here: an item a group position holds is **retired** — gone from
 * the inventory, still resolving inside the group — and an item nothing has
 * ever used is **removed**. What only a rendered case can show is exactly
 * that pair: a unit test can assert the marker, but it cannot see that M9
 * stopped listing the row while M8 kept resolving it.
 *
 * Local Mode throughout: with no server the device holds every trip, so the
 * sentence M10 shows before the confirm is the certain one — and a missing
 * client-side rule has nowhere to hide (invariant 4).
 */

async function openItem(page: Page, name: string) {
  await visiblePage(page).getByTestId('m9-row').filter({ hasText: name }).click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visiblePage(page).getByTestId('m10-section-delete')).toBeVisible()
}

/** Confirm the destructive alert the delete opens. */
async function confirmDelete(page: Page) {
  const alert = page.locator('ion-alert')
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(alert).toHaveCount(0)
}

test.describe('FR-24.3 — a delete is one of two acts', () => {
  test.slow()

  test('E2E-M10-14: an item a group holds is hidden and kept, and still resolves there', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.templates)

    // The quick-add's free-text confirm creates the master item *and* the
    // position, so the item is referenced by construction (FR-25.13).
    await createTemplate(page, 'group', 'Fotografie')
    await addPosition(page, 'Kamera')
    await backToTemplateList(page)

    await page.goto(PATH.items)
    await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Kamera' })).toHaveCount(
      1,
    )
    await openItem(page, 'Kamera')

    // Stated before the confirm, which is the half of FR-24.3 that is about
    // the user rather than about the row.
    await expect(visiblePage(page).getByTestId('m10-delete-usage')).toContainText('1')
    await expect(visiblePage(page).getByTestId('m10-delete-outlook')).toContainText(
      'hidden, not removed',
    )

    await visiblePage(page).getByTestId('m10-delete').click()
    await confirmDelete(page)

    // Gone from the inventory…
    await expect(visiblePage(page).getByTestId('m9-fab')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Kamera' })).toHaveCount(
      0,
    )

    // …and still there for everything that resolves against it. This is the
    // positive signal the assertion above is made against: without it,
    // "absent from M9" is equally satisfied by the row having been destroyed.
    await page.goto(PATH.templates)
    await visiblePage(page).locator('ion-item', { hasText: 'Fotografie' }).click()
    await expect(page.getByTestId('header-title')).toHaveText('Fotografie')
    await expect(
      visiblePage(page).locator('ion-item h2').filter({ hasText: 'Kamera' }),
    ).toHaveCount(1)

    // FR-24.3 names the quick-add autocomplete as a surface a retired item
    // leaves. The row above proves it still exists; this proves it is no
    // longer offered — the pair is what "hidden" means. In a *second* group
    // deliberately: the composer already excludes what the open template
    // holds, so asserting it here would be green whatever the filter does.
    await backToTemplateList(page)
    await createTemplate(page, 'group', 'Zweite Gruppe')
    await openQuickAdd(page, 'm8-fab')
    await visiblePage(page).getByTestId('quick-add-input').locator('input').pressSequentially('Kam')
    // The settled signal is the free-text confirm, which the composer always
    // offers: waiting on it means the suggestion list has been recomputed, so
    // "no suggestion" is an outcome rather than a race.
    await expect(visiblePage(page).getByTestId('quick-add-confirm')).toBeVisible()
    await expect(visiblePage(page).getByTestId('quick-add-suggestion')).toHaveCount(0)
  })

  test('E2E-M10-15: an item nothing has ever used is removed for good', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)

    await createItem(page, 'Fernglas')
    await backToInventory(page)
    await createItem(page, 'Feldstecher')
    await backToInventory(page)
    await expect(visiblePage(page).getByTestId('m9-row')).toHaveCount(2)

    await openItem(page, 'Fernglas')
    await expect(visiblePage(page).getByTestId('m10-delete-usage')).toContainText('0')
    await expect(visiblePage(page).getByTestId('m10-delete-outlook')).toContainText(
      'removed for good',
    )

    await visiblePage(page).getByTestId('m10-delete').click()
    await confirmDelete(page)

    await expect(visiblePage(page).getByTestId('m9-fab')).toBeVisible()
    // The counter-signal: the *other* item is untouched, so "one row fewer"
    // cannot be produced by the list simply failing to render.
    await expect(visiblePage(page).getByTestId('m9-row')).toHaveCount(1)
    await expect(visiblePage(page).getByTestId('m9-row')).toContainText('Feldstecher')

    // Really gone rather than hidden: re-creating the name succeeds, which a
    // retired row holding it would refuse (the active-only UNIQUE).
    await createItem(page, 'Fernglas')
    await backToInventory(page)
    await expect(visiblePage(page).getByTestId('m9-row')).toHaveCount(2)
  })

  test('E2E-M7-11: M7 says which deletion a Vorlage will get before it happens', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.templates)

    await createTemplate(page, 'group', 'Fotografie')
    await backToTemplateList(page)

    const row = visiblePage(page).locator('ion-item', { hasText: 'Fotografie' })
    // contextmenu is the handler the touch long-press fires into — the seam
    // that keeps the case free of a real 500 ms hold (E2E-M7-04's account).
    await row.dispatchEvent('contextmenu')
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Delete', exact: true }).click()

    // No trip was ever generated from it, so the confirm promises removal —
    // and says so, rather than leaving the user to find out afterwards.
    const alert = page.locator('ion-alert')
    await expect(alert).toContainText('removed for good')
    await alert.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(visiblePage(page).locator('ion-item', { hasText: 'Fotografie' })).toHaveCount(0)
  })
})
