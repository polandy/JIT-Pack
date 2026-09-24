import {
  addInComposer,
  createItemSheet,
  exactSuggestion,
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  createMasterItem,
  visiblePage as visible,
} from './fixtures'
import { PATH } from './routes'
import { writesLanded } from './helpers/page'
import { backToInventory, createItem } from './helpers/m9'
import { M4_TRIP } from './helpers/m4'

/**
 * M4 — how a row gets onto the list (UI-Test-Spec §4). Split out of
 * `packing-list.spec.ts` on 2026-09-20.
 *
 * Two promises, one subject: every add goes through the inventory (FR-24.11),
 * and the quick-add says what it took along with it (FR-20.4, FR-9.4).
 */

/**
 * FR-24.11 reaches the composer: every add goes through the inventory. A name
 * it holds is added at once, any other is created first through the same
 * sheet M9 uses, and nothing is written before that sheet's „Anlegen" — the
 * composer no longer makes ad-hoc rows.
 */
test.describe('M4 — the composer adds through the inventory @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-107 (FR-24.11, FR-5.6): a new name is offered for creation above
   * the partial hits, and only the sheet writes.
   *
   * The absent row is asserted while the sheet is visibly open — before that,
   * "no row yet" would also hold for a commit that had simply not landed.
   */
  test('E2E-M4-107: a name the inventory lacks is created through the sheet, then added', async ({
    page,
  }) => {
    await page.goto(PATH.items)
    await createItem(page, 'Zeltheringe')
    await createTripViaWizard(page, M4_TRIP)
    await openQuickAdd(page)

    const list = visible(page)
    const input = list.getByTestId('quick-add-input').locator('input')
    await input.fill('Zelt')
    const offer = list.getByTestId('quick-add-offer')
    const hit = list.getByTestId('quick-add-suggestion').filter({ hasText: 'Zeltheringe' })
    await expect(list.getByTestId('quick-add-offer-title')).toContainText('Zelt')
    await expect(hit).toBeVisible()
    // Above the partial hit: with the keyboard up, the end of the list is out
    // of reach, so the offer cannot wait below it.
    const offerBox = (await offer.boundingBox())!
    const hitBox = (await hit.boundingBox())!
    expect(offerBox.y + offerBox.height).toBeLessThanOrEqual(hitBox.y)

    await list.getByTestId('quick-add-confirm').click()
    const sheet = createItemSheet(page)
    await expect(sheet).toHaveAttribute('data-presented', 'true')
    await expect(sheet.getByTestId('create-item-name').locator('input')).toHaveValue('Zelt')
    await expect(list.getByTestId('m4-row-Zelt')).toHaveCount(0)

    await sheet.getByTestId('create-item-confirm').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(list.getByTestId('m4-row-Zelt')).toBeVisible()
    // The composer stays open for the next row, emptied and focused
    // (FR-25.13) — the sheet handing focus back rather than leaving it on the
    // page, where neither typing nor Escape reaches the composer.
    await expect(list.getByTestId('quick-add-input')).toBeVisible()
    await expect(input).toHaveValue('')
    await expect(input).toBeFocused()

    // The same act reached the inventory: M9 now lists the tent beside the
    // pegs it was found next to.
    await writesLanded(page)
    await page.goto(PATH.items)
    const rows = visible(page).getByTestId('m9-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ has: page.getByText('Zelt', { exact: true }) })).toHaveCount(1)
  })

  /**
   * E2E-M4-108 (FR-24.11, FR-24.7): the composer finds by M9's rule, so the
   * other umlaut spelling names the item exactly — ✓ adds it without a sheet.
   * Once it is on the list, the same name is reported rather than offered.
   */
  test('E2E-M4-108: an inventory name in the other spelling is added at once, then reported', async ({
    page,
  }) => {
    await page.goto(PATH.items)
    await createItem(page, 'Gürtel')
    await createTripViaWizard(page, M4_TRIP)
    await openQuickAdd(page)

    const list = visible(page)
    const input = list.getByTestId('quick-add-input').locator('input')
    await input.fill('guertel')
    // The exact hit is the positive signal the absent offer is read beside:
    // both are rendered in the same pass.
    await expect(exactSuggestion(list, 'Gürtel')).toBeVisible()
    await expect(list.getByTestId('quick-add-offer')).toHaveCount(0)

    await list.getByTestId('quick-add-confirm').click()
    await expect(list.getByTestId('m4-row-Gürtel')).toBeVisible()
    // The row is there, and no sheet was ever asked for.
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(input).toHaveValue('')

    // Typed again: already on the list, so the composer says so and ✓ rests.
    await input.fill('guertel')
    await expect(list.getByTestId('quick-add-already-in')).toContainText('Gürtel')
    await expect(list.getByTestId('quick-add-confirm')).toHaveAttribute('aria-disabled', 'true')
    await expect(list.getByTestId('quick-add-offer')).toHaveCount(0)
    await expect(list.getByTestId('quick-add-suggestion')).toHaveCount(0)
    await expect(list.getByTestId('m4-row-Gürtel')).toHaveCount(1)
  })

  /**
   * E2E-M4-114 (FR-25.13j, FR-24.11): the browse-sheet searches by M9's rule
   * and creates what it did not find, without leaving the sheet.
   *
   * The row count before the query is the positive signal the narrowing is
   * read against: both items are listed until the query arrives. The absent
   * M4 row is asserted while the creation sheet is visibly open, so the
   * absence is not read before a write could have landed.
   */
  test('E2E-M4-114: the browse-sheet searches, and creates a missing name in place', async ({
    page,
  }) => {
    await page.goto(PATH.items)
    await createItem(page, 'Zeltheringe')
    await backToInventory(page)
    await createItem(page, 'Kocher')
    await createTripViaWizard(page, M4_TRIP)
    await openQuickAdd(page)

    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    const search = sheet.getByTestId('browse-search-input')
    // The field is there, and it did not take the focus: the sheet still
    // raises no keyboard on arrival (FR-25.13d).
    await expect(search).toBeVisible()
    await expect(search).not.toBeFocused()
    await expect(sheet.getByTestId('browse-row-name')).toHaveCount(2)

    await search.fill('Zelt')
    await expect(sheet.getByTestId('browse-row-name')).toHaveText(['Zeltheringe'])
    await expect(sheet.getByTestId('browse-offer-title')).toContainText('Zelt')
    // Above the partial hit, as on M9 and in the composer.
    const offerBox = (await sheet.getByTestId('browse-offer').boundingBox())!
    const hitBox = (await sheet.getByTestId('browse-row').boundingBox())!
    expect(offerBox.y + offerBox.height).toBeLessThanOrEqual(hitBox.y)

    // Enter opens the sheet on the query and writes nothing.
    await search.press('Enter')
    const create = createItemSheet(page)
    await expect(create).toHaveAttribute('data-presented', 'true')
    await expect(create.getByTestId('create-item-name').locator('input')).toHaveValue('Zelt')
    await expect(visible(page).getByTestId('m4-row-Zelt')).toHaveCount(0)

    await create.getByTestId('create-item-confirm').click()
    await expect(create).toHaveCount(0)
    // Back in the browse-sheet: the query survived, the offer went because
    // the name exists now, and the new line says what this run did to it.
    await expect(sheet).toBeVisible()
    await expect(search).toHaveValue('Zelt')
    await expect(sheet.getByTestId('browse-offer')).toHaveCount(0)
    const added = sheet.getByTestId('browse-row-carried').filter({ hasText: /^Zelt\b/ })
    await expect(added.getByTestId('browse-added-now')).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()

    // The same act reached the inventory.
    await writesLanded(page)
    await page.goto(PATH.items)
    await expect(visible(page).getByTestId('m9-row')).toHaveCount(3)
  })

  /**
   * E2E-M4-147 (FR-25.13d, ADR-075): the browse sheet files the inventory
   * under the headings M9 draws — the primary tag's name with the number of
   * items under it, in the shared list heading rather than a caption of its
   * own. The count is the part a caption never had, so it is what says the
   * heading is the shared one.
   */
  test('E2E-M4-147: the browse sheet heads its groups the way the inventory does', async ({
    page,
  }) => {
    await page.goto(PATH.items)
    await createItem(page, 'Kamera', { tags: ['Foto'] })
    await backToInventory(page)
    await createItem(page, 'Stativ', { tags: ['Foto'] })
    await backToInventory(page)
    await createItem(page, 'Zelt', { tags: ['Camping'] })
    await createTripViaWizard(page, M4_TRIP)
    await openQuickAdd(page)

    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    const foto = sheet.locator('.list-group').filter({
      has: page.getByTestId('browse-group-head').getByText('Foto', { exact: true }),
    })
    await expect(foto.locator('ion-item-divider .count')).toHaveText('2')
    await expect(foto.getByTestId('browse-row-name')).toHaveText(['Kamera', 'Stativ'])
  })
})

/**
 * FR-20.4's missing sentence and FR-9.4's silent card, both ruled *build it*
 * by the owner on 2026-08-31.
 */
test.describe('M4 — what the quick-add says about what it took along @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-66 (FR-20.4/20.2): quick-adding an item pulls its required
   * companions **and says so**.
   *
   * `addRequiredCompanions` returned nothing and no caller raised anything, so
   * the companions simply appeared on the list — while FR-20.2's *skip* names
   * exactly what it took along, and it is that contrast which made the silence
   * read as an omission rather than as a decision (E2E-M4-32's third clause,
   * retired 2026-08-30 with the finding).
   */
  test('E2E-M4-66: the quick-add names the required companions it pulled in', async ({ page }) => {
    // Built through M10's own form: a dependency written straight into the
    // store would assert the pull against a relation the app cannot make.
    await createMasterItem(page, 'Kamera')
    await createMasterItem(page, 'Ersatzakku')
    // The editor is open on the Ersatzakku, which is the side that declares
    // the relation; *required* is the default mode (FR-20.1).
    await visible(page).getByTestId('m10-add-dependency').click()
    await visible(page).getByTestId('m10-dependency-main-Kamera').click()
    await expect(visible(page).getByTestId('m10-dependency-mode-Kamera')).toBeVisible()

    await createTripViaWizard(page, { name: 'Fotoreise' })
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Kame')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Kamera' }).click()

    // The companion is on the list…
    await expect(visible(page).getByTestId('m4-row-Ersatzakku')).toBeVisible()
    // …and the app said so, naming it. A bare count would send the reader
    // looking for what changed, which is the whole complaint.
    const notice = page.locator('ion-toast').filter({ hasText: 'Ersatzakku' })
    await expect(notice).toBeVisible()

    // An item with no companions says nothing: the positive signal against a
    // snackbar that always fires.
    await addInComposer(page, 'Sonnencreme')
    await expect(visible(page).getByTestId('m4-row-Sonnencreme')).toBeVisible()
    await expect(page.locator('ion-toast').filter({ hasText: 'Sonnencreme' })).toHaveCount(0)
  })
})
