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
  tripAction,
  visiblePage,
} from './fixtures'
import { lightTraveler, openForWhom, packRow, startTrip } from './helpers/m4'

const TRIP = { name: 'Pro Person Elba', travelers: ['Andy', 'Leonardo', 'Mia'] }
const FOR_ANDY = 'Kurze Hosen'
const SHARED = 'Sonnencreme'

test.describe('M4 — per-person progress @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-110: every traveler has a share, the shares add up, and taps pick several', async ({
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
    // the person facet the sheet sets…
    const chips = list.locator('[data-testid^="m4-chip-person-"]')
    await shared.click()
    await expect(shared).toHaveAttribute('aria-pressed', 'true')
    await expect(list.getByTestId(`m4-row-${SHARED}`)).toBeVisible()
    await expect(chips).toHaveCount(1)
    // …a tap on a face adds that traveler beside it rather than replacing it —
    // *mine and the shared ones* — and Leonardo, untapped, stays out…
    await face('Andy').click()
    await expect(face('Andy')).toHaveAttribute('aria-pressed', 'true')
    await expect(shared).toHaveAttribute('aria-pressed', 'true')
    await expect(face('Leonardo')).toHaveAttribute('aria-pressed', 'false')
    await expect(chips).toHaveCount(2)
    await expect(list.getByTestId(`m4-row-${SHARED}`)).toBeVisible()
    // …and a second tap takes back only the one tapped.
    await shared.click()
    await expect(shared).toHaveAttribute('aria-pressed', 'false')
    await expect(face('Andy')).toHaveAttribute('aria-pressed', 'true')
    await expect(chips).toHaveCount(1)
    await face('Andy').click()
    await expect(chips).toHaveCount(0)
  })

  test('E2E-M4-112: the closing pass takes the strip away, and cancelling it brings it back', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await addInComposer(page, SHARED)
    await page.keyboard.press('Escape')
    await startTrip(page)

    const list = visiblePage(page)
    const strip = list.getByTestId('m4-traveler-progress')
    // Present first, so its absence below is caused by the pass.
    await expect(strip).toBeVisible()

    await tripAction(page, 'archive')
    // The pass banner is the positive signal that the pass is what is on screen.
    await expect(list.getByTestId('m4-pass-banner')).toBeVisible()
    await expect(strip).toHaveCount(0)

    await page.getByTestId('m4-pass-cancel').click()
    await expect(list.getByTestId('m4-pass-banner')).toHaveCount(0)
    await expect(strip).toBeVisible()
  })

  test('E2E-M4-111: a trip for one traveler shows no split', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Pro Person Solo', travelers: ['Andy'] })
    const list = visiblePage(page)
    // The trip line is the positive signal that the head has rendered at all.
    await expect(list.getByTestId('m4-progress')).toBeVisible()
    await expect(list.getByTestId('m4-traveler-progress')).toHaveCount(0)
  })
})
