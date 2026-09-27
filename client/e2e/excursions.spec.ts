import type { Page } from '@playwright/test'

import { test, expect, visiblePage as visible } from './fixtures'
import {
  addPosition,
  backToTemplateList,
  createTemplate,
  createTripViaWizard,
  openQuickAdd,
  openTripView,
} from './fixtures'
import {
  addInExcursionComposer,
  addToExcursion,
  createExcursion,
  excursionLine,
  excursionMenu,
  openExcursions,
  revealPackedLines,
  tickExcursionLine,
} from './helpers/m27'
import { holdOpensOneMenu, packRow, startTrip, tripWithRows } from './helpers/m4'
import { writesLanded } from './helpers/page'
import { PATH } from './routes'

/**
 * M27 — a trip's excursions (FR-31, ADR-077), on one device in Local Mode.
 *
 * An excursion is a small list of its own inside the trip: started from a
 * Gruppe, its lines borrow from the suitcase while it is open and are marked
 * *nicht im Gepäck* once it is not, each line keeps its own tick, a thing per
 * person follows who goes, and the list folds back into a Gruppe. The morning
 * reminder is the server's and is held by Go tables (`TestPlanExcursionDue_*`).
 */

const GROUP = 'Hüttentour'

/** The group an excursion starts from: two things, typed into M8 (trip_global). */
async function seedGroup(page: Page) {
  await page.goto(PATH.templates)
  await createTemplate(page, 'group', GROUP)
  await addPosition(page, 'Stirnlampe')
  await addPosition(page, 'Hüttenschlafsack')
  await backToTemplateList(page)
}

test.describe('M27 — a trip’s excursions (FR-31) @local @m27', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M27-01: M27 is reached by its pill and opens empty; the FAB's sheet
   * creates an excursion from a Gruppe, and its list opens with the group's
   * lines. The suitcase row it already had is borrowed, the one it lacked is
   * added to the packing list — which says, on the row, which excursion
   * borrows it — and the act offers its one undo.
   */
  test('E2E-M27-01: an excursion from a group borrows what the suitcase has and adds what it lacks', async ({
    page,
  }) => {
    await seedGroup(page)
    await tripWithRows(page, ['Stirnlampe'], 'Sardinien')

    const m27 = await openExcursions(page)
    await expect(page.getByTestId('trip-view-excursions')).toHaveAttribute('aria-current', 'page')
    await expect(m27.getByTestId('m27-empty')).toBeVisible()

    await createExcursion(page, { name: 'Hüttentour Supramonte', group: GROUP })
    await expect(
      page.locator('ion-toast').filter({ hasText: '1 thing onto the packing list' }),
    ).toHaveCount(1)

    await expect(excursionLine(page, 'Stirnlampe')).toBeVisible()
    await expect(visible(page).getByTestId('excursion-source-Stirnlampe')).toHaveText(
      'from the luggage',
    )
    await expect(visible(page).getByTestId('excursion-source-Hüttenschlafsack')).toHaveText(
      'from the luggage',
    )
    await expect(visible(page).getByTestId('m27-figure')).toHaveText('0/2 packed')

    await openTripView(page, 'packing')
    await expect(visible(page).getByTestId('m4-row-Hüttenschlafsack')).toBeVisible()
    await expect(visible(page).getByTestId('m4-borrowed-Hüttenschlafsack')).toHaveText(
      'Hüttentour Supramonte',
    )

    await openExcursions(page)
    await expect(visible(page).getByTestId('m27-excursion-Hüttentour Supramonte')).toBeVisible()
    await expect(visible(page).getByTestId('m27-count-Hüttentour Supramonte')).toHaveText('0/2')
  })

  /**
   * E2E-M27-02: a line's tick is its own. Ticking the excursion's head torch
   * packs nothing on the packing list, and packing the sleeping bag there
   * ticks nothing on the excursion (ADR-077).
   */
  test('E2E-M27-02: the excursion and the suitcase tick apart', async ({ page }) => {
    await seedGroup(page)
    await tripWithRows(page, ['Stirnlampe'], 'Sardinien')
    await openExcursions(page)
    await createExcursion(page, { name: 'Tageswanderung', group: GROUP })

    await tickExcursionLine(page, 'Stirnlampe')

    await openTripView(page, 'packing')
    await expect(visible(page).getByTestId('m4-row-Stirnlampe')).toBeVisible()
    await packRow(page, 'Hüttenschlafsack')

    await openExcursions(page)
    await visible(page).getByTestId('m27-excursion-Tageswanderung').click()
    // The suitcase's pack left the excursion's sleeping bag open …
    await expect(excursionLine(page, 'Hüttenschlafsack')).toBeVisible()
    await expect(excursionLine(page, 'Stirnlampe')).toHaveCount(0)
    // … and the excursion's own pack is there once the packed lines are shown.
    await revealPackedLines(page)
    await expect(
      excursionLine(page, 'Stirnlampe').getByTestId('row-check').locator('ion-checkbox'),
    ).toHaveJSProperty('checked', true)
  })

  /**
   * E2E-M27-03: on a trip under way the suitcase takes nothing new. The
   * excursion marks what is not in the luggage instead of writing to the
   * packing list; *Vor Ort besorgen* puts it on M6's Vor-Ort list under the
   * excursion's name, and buying it there reads back on the excursion.
   */
  test('E2E-M27-03: once under way, what the luggage lacks is marked and bought on the spot', async ({
    page,
  }) => {
    await seedGroup(page)
    await tripWithRows(page, ['Stirnlampe'], 'Sardinien')
    await startTrip(page)
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour Supramonte', group: GROUP })

    await expect(visible(page).getByTestId('excursion-missing-Hüttenschlafsack')).toBeVisible()
    await openTripView(page, 'packing')
    await expect(visible(page).getByTestId('m4-row-Stirnlampe')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Hüttenschlafsack')).toHaveCount(0)

    await openExcursions(page)
    await visible(page).getByTestId('m27-excursion-Hüttentour Supramonte').click()
    await visible(page).getByTestId('excursion-buy-on-site-Hüttenschlafsack').click()
    // Now a purchase on the spot: the warning gives way to the row's own glyph.
    await expect(visible(page).getByTestId('excursion-missing-Hüttenschlafsack')).toHaveCount(0)
    await writesLanded(page)

    await openTripView(page, 'shopping')
    const heading = visible(page).getByTestId('m6-group-source-Hüttentour Supramonte')
    await expect(heading).toBeVisible()
    await heading
      .getByTestId('m6-row')
      .filter({ hasText: 'Hüttenschlafsack' })
      .locator('ion-checkbox')
      .click()
    await expect(heading).toHaveCount(0)
    await writesLanded(page)

    await openExcursions(page)
    await visible(page).getByTestId('m27-excursion-Hüttentour Supramonte').click()
    await expect(visible(page).getByTestId('excursion-source-Hüttenschlafsack')).toHaveText(
      'bought on the spot',
    )
  })

  /**
   * E2E-M27-04: the excursion's ＋ is M4's quick-add, and its *für wen* strip
   * is over the people going. *Alle* writes one line per participant, shown as
   * M4's cluster that names the thing once and opens onto a child per person,
   * each ticked alone.
   */
  test('E2E-M27-04: für alle writes a line per participant, read as one cluster', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Sardinien', travelers: ['Andy', 'Sia'] })
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour' })

    await openQuickAdd(page, 'm27-add-fab')
    await visible(page).getByTestId('for-whom-all-quick-add').click()
    await expect(visible(page).getByTestId('quick-add-for-whom-summary')).toHaveText(
      'Will be added for 2 people, 1 each.',
    )
    await addInExcursionComposer(page, 'Schlafsack')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('quick-add-input')).toBeHidden()

    const cluster = visible(page).getByTestId('m27-cluster-Schlafsack')
    await cluster.click()
    await expect(visible(page).locator('[data-testid^="m27-child-Schlafsack-"]')).toHaveCount(2)
    await tickExcursionLine(page, 'Schlafsack-Sia')
    await expect(
      excursionLine(page, 'Schlafsack-Andy').getByTestId('row-check').locator('ion-checkbox'),
    ).toHaveJSProperty('checked', false)
    await expect(cluster).toContainText('1/2')
  })

  /**
   * E2E-M27-05: who goes changes after the list was written. A joiner gets
   * a line of every *für alle* set, and the one toast undoes it.
   */
  test('E2E-M27-05: a joiner gets a line of a für-alle set, and the change undoes as one', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Sardinien', travelers: ['Andy', 'Sia', 'Lio'] })
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour', who: ['Andy', 'Sia'] })
    await addToExcursion(page, 'Schlafsack', 'all')
    await visible(page).getByTestId('m27-cluster-Schlafsack').click()
    const children = visible(page).locator('[data-testid^="m27-child-Schlafsack-"]')
    await expect(children).toHaveCount(2)

    await excursionMenu(page, 'm27-edit')
    const sheet = page.getByTestId('m27-sheet')
    await sheet.getByTestId('m27-who-Lio').click()
    await sheet.getByTestId('m27-save').click()
    await expect(children).toHaveCount(3)
    await expect(visible(page).getByTestId('m27-child-Schlafsack-Lio')).toBeVisible()

    const toast = page.locator('ion-toast').filter({ hasText: 'Who goes changed' })
    await expect(toast).toHaveCount(1)
    await toast.locator('button').filter({ hasText: 'Undo' }).click()
    await expect(children).toHaveCount(2)
  })

  /**
   * E2E-M27-06: the list folds back into a Gruppe others can start from, and
   * deleting the excursion returns to M27 and leaves the packing list alone —
   * the sun hat the excursion put into the suitcase stays there.
   */
  test('E2E-M27-06: an excursion is saved as a group, and deleting it spares the packing list', async ({
    page,
  }) => {
    await tripWithRows(page, ['Stirnlampe'], 'Sardinien')
    await openExcursions(page)
    await createExcursion(page, { name: 'Bootsausflug' })
    await addToExcursion(page, 'Sonnenhut')
    await expect(excursionLine(page, 'Sonnenhut')).toBeVisible()

    await excursionMenu(page, 'm27-save-as-group')
    const prompt = page.locator('ion-alert')
    await prompt.locator('input[aria-label="name"]').fill('Boot')
    await prompt.locator('button').filter({ hasText: 'Save' }).click()
    await expect(page.locator('ion-toast').filter({ hasText: 'Group “Boot” saved' })).toHaveCount(1)

    await excursionMenu(page, 'm27-delete')
    await page
      .getByTestId('m27-delete-confirm')
      .locator('button')
      .filter({ hasText: 'Delete' })
      .click()
    await expect(visible(page).getByTestId('m27-empty')).toBeVisible()
    await openTripView(page, 'packing')
    await expect(visible(page).getByTestId('m4-row-Stirnlampe')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Sonnenhut')).toBeVisible()

    await writesLanded(page)
    await page.goto(PATH.templates)
    await visible(page).getByTestId('m7-scope-group').click()
    await expect(
      visible(page).locator('ion-item').filter({ hasText: 'Boot' }).first(),
    ).toBeVisible()
  })

  /**
   * E2E-M27-07: something bought on the spot joins the trip. The rain cape the
   * hut tour could not borrow is bought through M6, then taken *Auf die
   * Packliste*: it is a packed row of the trip — shown when the packed rows
   * are revealed — and an item of the inventory.
   */
  test('E2E-M27-07: a thing bought on the spot joins the packing list and the inventory', async ({
    page,
  }) => {
    await tripWithRows(page, ['Stirnlampe'], 'Sardinien')
    await startTrip(page)
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour' })
    await addToExcursion(page, 'Regencape')
    await visible(page).getByTestId('excursion-buy-on-site-Regencape').click()
    await writesLanded(page)

    await openTripView(page, 'shopping')
    const heading = visible(page).getByTestId('m6-group-source-Hüttentour')
    await heading
      .getByTestId('m6-row')
      .filter({ hasText: 'Regencape' })
      .locator('ion-checkbox')
      .click()
    await expect(heading).toHaveCount(0)
    await writesLanded(page)

    await openExcursions(page)
    await visible(page).getByTestId('m27-excursion-Hüttentour').click()
    await visible(page).getByTestId('excursion-keep-Regencape').click()
    await expect(
      page.locator('ion-toast').filter({ hasText: 'is on the packing list and in the inventory' }),
    ).toHaveCount(1)
    await expect(visible(page).getByTestId('excursion-source-Regencape')).toHaveText(
      'bought on the spot · on the packing list',
    )
    await expect(visible(page).getByTestId('excursion-keep-Regencape')).toHaveCount(0)
    await writesLanded(page)

    await openTripView(page, 'packing')
    await visible(page).getByTestId('m4-done-bar').click()
    await expect(visible(page).getByTestId('m4-row-Regencape')).toBeVisible()

    await page.goto(PATH.items)
    await expect(visible(page).getByTestId('m9-row').filter({ hasText: 'Regencape' })).toHaveCount(
      1,
    )
  })

  /**
   * E2E-M27-08: a tap on a line opens M5's sheet for it — the amount, the
   * large packing control with its state, *Nicht einpacken*, and the *für wen*
   * strip over the people going, which turns the shared thing into one line
   * per person without closing the sheet. A hold opens the line's menu.
   */
  test('E2E-M27-08: a line opens M5’s sheet, packs there, and changes for whom', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Sardinien', travelers: ['Andy', 'Sia'] })
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour' })
    await addToExcursion(page, 'Schlafsack')

    await excursionLine(page, 'Schlafsack').click()
    const sheet = page.getByTestId('m27-line-sheet')
    await expect(sheet.getByTestId('m27-line-name')).toHaveText('Schlafsack')
    await expect(sheet.getByTestId('m27-line-quantity')).toBeVisible()
    await sheet.getByTestId('m27-line-pack').locator('ion-checkbox').click()
    await expect(sheet.getByTestId('m27-line-pack')).toContainText('packed')

    await sheet.getByTestId('for-whom-all-m27-line').click()
    await expect(sheet.getByTestId('m27-line-name')).toHaveText('Schlafsack')
    await sheet.getByTestId('m27-line-close').click()
    await expect(page.getByTestId('m27-line-sheet')).toHaveCount(0)

    // The packed shared line stays in the rucksack (and off the open list, as a
    // packed row is on M4); each person has a line now.
    await visible(page).getByTestId('m27-cluster-Schlafsack').click()
    await expect(visible(page).locator('[data-testid^="m27-child-Schlafsack-"]')).toHaveCount(2)

    await excursionLine(page, 'Schlafsack-Andy').dispatchEvent('contextmenu')
    await expect(page.getByTestId('excursion-line-menu')).toBeVisible()
    await page
      .getByTestId('excursion-line-menu')
      .getByRole('button', { name: /cancel/i })
      .click()
    await expect(page.getByTestId('excursion-line-menu')).toHaveCount(0)
    // A touch hold fires the menu twice (the timer, then `contextmenu`): one sheet.
    await holdOpensOneMenu(page, excursionLine(page, 'Schlafsack-Andy'))
  })
  /**
   * E2E-M27-09: a name the inventory lacks is a line of the excursion alone
   * by default — no suitcase row, no inventory item. *Ins Inventar* makes it
   * one of both, undoably; and *Als Gruppe speichern* asks whether such lines
   * come along, leaving them out of the Gruppe and the inventory when told to.
   */
  test('E2E-M27-09: a line for this excursion alone stays out of the inventory until taken there', async ({
    page,
  }) => {
    await tripWithRows(page, ['Stirnlampe'], 'Sardinien')
    await openExcursions(page)
    await createExcursion(page, { name: 'Bootsausflug' })
    await addToExcursion(page, 'Schokoriegel', 'shared', 'local')
    await addToExcursion(page, 'Wasser', 'shared', 'local')
    await expect(visible(page).getByTestId('excursion-local-only-Schokoriegel')).toHaveText(
      'just for this excursion',
    )

    await openTripView(page, 'packing')
    await expect(visible(page).getByTestId('m4-row-Stirnlampe')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Schokoriegel')).toHaveCount(0)

    await openExcursions(page)
    await visible(page).getByTestId('m27-excursion-Bootsausflug').click()
    await visible(page).getByTestId('excursion-adopt-Schokoriegel').click()
    await expect(
      page.locator('ion-toast').filter({ hasText: 'is in the inventory now' }),
    ).toHaveCount(1)
    await expect(visible(page).getByTestId('excursion-local-only-Schokoriegel')).toHaveCount(0)
    await expect(visible(page).getByTestId('excursion-source-Schokoriegel')).toHaveText(
      'from the luggage',
    )

    await excursionMenu(page, 'm27-save-as-group')
    const ask = page.getByTestId('m27-save-group-unlisted')
    await expect(ask).toContainText('Wasser')
    await expect(ask).not.toContainText('Schokoriegel')
    await ask.locator('button').filter({ hasText: 'Leave out' }).click()
    const prompt = page
      .locator('ion-alert')
      .filter({ has: page.locator('input[aria-label="name"]') })
    await prompt.locator('input[aria-label="name"]').fill('Boot')
    await prompt.locator('button').filter({ hasText: 'Save' }).click()
    await expect(page.locator('ion-toast').filter({ hasText: 'Group “Boot” saved' })).toHaveCount(1)
    await writesLanded(page)

    await openTripView(page, 'packing')
    await expect(visible(page).getByTestId('m4-row-Schokoriegel')).toBeVisible()
    await page.goto(PATH.items)
    const rows = visible(page).getByTestId('m9-row')
    await expect(rows.filter({ hasText: 'Schokoriegel' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Wasser' })).toHaveCount(0)
  })
})
