/**
 * FR-25.29 — each traveler's share of the trip, over M4's list.
 *
 * Asserted on the rendered strip and read against the trip line beside it:
 * the promise is that the shares add up to that line, so a strip whose counts
 * were right in isolation but drawn from a different arithmetic would still
 * fail here.
 */
import {
  addInComposer,
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  visiblePage,
} from './fixtures'
import { lightTraveler, openForWhom, packRow } from './helpers/m4'

const TRIP = { name: 'Pro Person Elba', travelers: ['Andy', 'Leonardo', 'Mia'] }
const FOR_ANDY = 'Kurze Hosen'
const SHARED = 'Sonnencreme'

test.describe('M4 — per-person progress @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-110: every traveler has a share, the shares add up, and a tap filters to one', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, FOR_ANDY)
    await addInComposer(page, SHARED)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('quick-add-input')).toBeHidden()

    const list = visiblePage(page)
    const strip = list.getByTestId('m4-traveler-progress')
    const face = (name: string) => strip.getByTestId(`m4-traveler-progress-${name}`)
    const shared = strip.getByTestId('m4-traveler-progress-shared')

    // Three travelers, three faces, in roster order — and both rows are shared.
    await expect(strip.locator('[data-testid^="m4-traveler-progress-"][aria-pressed]')).toHaveText([
      /Andy/,
      /Leonardo/,
      /Mia/,
      /Shared/,
    ])
    for (const name of TRIP.travelers) await expect(face(name)).toContainText('nothing to pack')
    await expect(shared).toContainText('0 of 2')

    // Give one row to Andy: his share appears and the shared share shrinks.
    await openForWhom(page, FOR_ANDY)
    await lightTraveler(page, FOR_ANDY, 'Andy')
    await expect(face('Andy')).toContainText('0 of 1')
    await expect(shared).toContainText('0 of 1')

    // Pack it: Andy is done, and the trip line says the same one of two.
    await packRow(page, FOR_ANDY)
    await expect(face('Andy')).toContainText('done')
    await expect(list.getByTestId('m4-progress')).toContainText('1/2')
    await expect(face('Leonardo')).toContainText('nothing to pack')

    // A tap on the shared line narrows the list to the rows for nobody, through
    // the person facet the sheet sets; a second tap lifts it again.
    await shared.click()
    await expect(shared).toHaveAttribute('aria-pressed', 'true')
    await expect(list.getByTestId(`m4-row-${SHARED}`)).toBeVisible()
    await expect(list.locator('[data-testid^="m4-chip-person-"]')).toBeVisible()
    await shared.click()
    await expect(shared).toHaveAttribute('aria-pressed', 'false')
    await expect(list.locator('[data-testid^="m4-chip-person-"]')).toHaveCount(0)
  })

  test('E2E-M4-111: a trip for one traveler shows no split', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Pro Person Solo', travelers: ['Andy'] })
    const list = visiblePage(page)
    // The trip line is the positive signal that the head has rendered at all.
    await expect(list.getByTestId('m4-progress')).toBeVisible()
    await expect(list.getByTestId('m4-traveler-progress')).toHaveCount(0)
  })
})
