import type { Page } from '@playwright/test'

import { test, expect, visiblePage as visible } from './fixtures'
import {
  addPosition,
  backToTemplateList,
  createTemplate,
  createTripViaWizard,
  fillIonic,
  openTripView,
} from './fixtures'
import {
  createExcursion,
  excursionLine,
  excursionMenu,
  openExcursions,
  tickExcursionLine,
} from './helpers/m27'
import { packRow, startTrip, tripWithRows } from './helpers/m4'
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
    await expect(excursionLine(page, 'Hüttenschlafsack').locator('ion-checkbox')).toHaveJSProperty(
      'checked',
      false,
    )
    await expect(excursionLine(page, 'Stirnlampe').locator('ion-checkbox')).toHaveJSProperty(
      'checked',
      true,
    )
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
    await expect(visible(page).getByTestId('excursion-source-Hüttenschlafsack')).toHaveText(
      'on the spot',
    )
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
   * E2E-M27-04: the composer asks *für wen* over the people going. *Alle*
   * writes one line per participant, shown as a cluster that names the thing
   * once, counts both, and opens onto a child per person, each ticked alone.
   */
  test('E2E-M27-04: für alle writes a line per participant, read as one cluster', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Sardinien', travelers: ['Andy', 'Sia'] })
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour' })

    await visible(page).getByTestId('for-whom-all-m27').click()
    await expect(visible(page).getByTestId('m27-for-whom-sentence')).toHaveText(
      'Will be added for 2 people, 1 each.',
    )
    await fillIonic(visible(page).getByTestId('m27-composer-input'), 'Schlafsack')
    await visible(page).getByTestId('m27-composer-add').click()

    await expect(visible(page).getByTestId('excursion-cluster-count-Schlafsack')).toHaveText('0/2')
    await visible(page).getByTestId('excursion-cluster-Schlafsack').click()
    await tickExcursionLine(page, 'Schlafsack-Sia')
    await expect(excursionLine(page, 'Schlafsack-Andy').locator('ion-checkbox')).toHaveJSProperty(
      'checked',
      false,
    )
    await expect(visible(page).getByTestId('excursion-cluster-count-Schlafsack')).toHaveText('1/2')
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
    await visible(page).getByTestId('for-whom-all-m27').click()
    await fillIonic(visible(page).getByTestId('m27-composer-input'), 'Schlafsack')
    await visible(page).getByTestId('m27-composer-add').click()
    await expect(visible(page).getByTestId('excursion-cluster-count-Schlafsack')).toHaveText('0/2')

    await excursionMenu(page, 'm27-edit')
    const sheet = page.getByTestId('m27-sheet')
    await sheet.getByTestId('m27-who-Lio').click()
    await sheet.getByTestId('m27-save').click()
    await expect(visible(page).getByTestId('excursion-cluster-count-Schlafsack')).toHaveText('0/3')

    const toast = page.locator('ion-toast').filter({ hasText: 'Who goes changed' })
    await expect(toast).toHaveCount(1)
    await toast.locator('button').filter({ hasText: 'Undo' }).click()
    await expect(visible(page).getByTestId('excursion-cluster-count-Schlafsack')).toHaveText('0/2')
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
    await fillIonic(visible(page).getByTestId('m27-composer-input'), 'Sonnenhut')
    await visible(page).getByTestId('m27-composer-add').click()
    await expect(excursionLine(page, 'Sonnenhut')).toBeVisible()
    await writesLanded(page)

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
    await fillIonic(visible(page).getByTestId('m27-composer-input'), 'Regencape')
    await visible(page).getByTestId('m27-composer-add').click()
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
})
