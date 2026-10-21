import {
  test,
  expect,
  addInComposer,
  createTripViaWizard,
  expectTripOpen,
  itemDetail,
  openQuickAdd,
  tripAction,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'
import { startTrip } from './helpers/m4'

/**
 * FR-9.5 — the forgotten radar on M4 (UI-Test-Spec M4, E2E-M4-158/159).
 *
 * The record it reads is built the way a user builds it: an item typed on
 * the road is auto-flagged *Missing* (FR-5.6), a comment is written on it in M5,
 * and the trip is archived through the closing pass. Only then is the next
 * trip of the series created, so the card has an earlier trip to name.
 */

const SERIES = 'Samedan'
const EARLIER = 'Samedan 2025'
const PLANNED = 'Samedan 2026'
const MISSING = 'Ersatzakku'
const REMARK = 'Akku am zweiten Tag leer'

/** The archived trip of the series, with one missing item and its comment. */
async function archivedWithMissing(page: Page) {
  await createTripViaWizard(page, { name: EARLIER, series: SERIES })
  await startTrip(page)
  await openQuickAdd(page)
  await addInComposer(page, MISSING)
  await expect(page.getByTestId(`m4-row-${MISSING}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()

  await page.getByTestId(`m4-row-${MISSING}`).click()
  await itemDetail(page).getByTestId('m5-note-input').locator('input').fill(REMARK)
  await itemDetail(page).getByTestId('m5-note-add').click()
  await expect(itemDetail(page).getByTestId(`m5-note-${REMARK}`)).toBeVisible()
  await itemDetail(page).getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

  // FR-9.3: the pass archives on *Fertig*. M14 opens only over a flagged
  // trip — an unflagged one gets a toast — so reaching it is the proof the
  // quick-add flagged the row. It proposes nothing: a missing proposal needs
  // a group to land in, and this trip has none.
  await tripAction(page, 'archive')
  await expect(visible(page).getByTestId('m4-pass-banner')).toBeVisible()
  await page.getByTestId('m4-pass-finish').click()
  await expect(visible(page).getByTestId('m14-open-count')).toBeVisible()
}

function radar(page: Page) {
  return visible(page).getByTestId('m4-radar')
}

test.describe('M4 forgotten radar @local @m4', () => {
  test('E2E-M4-158: a planning trip names what the series’ last trip missed, and one tap adds it', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local' })
    await archivedWithMissing(page)
    await createTripViaWizard(page, { name: PLANNED, series: SERIES })

    const card = radar(page)
    await expect(card).toBeVisible()
    await expect(card.getByRole('heading')).toHaveText(EARLIER)
    await expect(card).toContainText('Forgotten last time · 1')
    await expect(card).toContainText(`same series “${SERIES}”`)
    const entry = card.getByTestId(`m4-radar-entry-${MISSING}`)
    await expect(entry).toContainText('Was not on the list')
    await expect(entry.getByTestId('m4-radar-comment')).toContainText(REMARK)
    // Local Mode names nobody (G-8): the meta line is the date alone.
    const meta = entry.getByTestId('m4-radar-comment-meta')
    await expect(meta).toHaveText(/\d/)
    await expect(meta).not.toContainText('·')

    // The row is the card's write: before the tap the list does not hold it.
    await expect(visible(page).getByTestId(`m4-row-${MISSING}`)).toHaveCount(0)
    await card.getByTestId(`m4-radar-add-${MISSING}`).click()
    await expect(visible(page).getByTestId(`m4-row-${MISSING}`)).toBeVisible()
    await expect(radar(page)).toHaveCount(0)
  })

  test('E2E-M4-159: „Ausblenden“ hides the radar on this trip, across a reload, and on no other', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local' })
    await archivedWithMissing(page)
    const plannedPath = await createTripViaWizard(page, { name: PLANNED, series: SERIES })

    await expect(radar(page)).toBeVisible()
    await radar(page).getByTestId('m4-radar-hide').click()
    await expect(radar(page)).toHaveCount(0)

    await page.reload()
    await expectTripOpen(page, PLANNED)
    await expect(visible(page).getByTestId('m4-fab')).toBeVisible()
    await expect(radar(page)).toHaveCount(0)

    // The muting is the trip's, not the series': the next trip still shows it —
    // which is also the positive signal that the absence above was the hide.
    await createTripViaWizard(page, { name: 'Samedan 2027', series: SERIES })
    await expect(radar(page)).toBeVisible()
    await expect(radar(page).getByTestId(`m4-radar-entry-${MISSING}`)).toBeVisible()

    await page.goto(plannedPath)
    await expectTripOpen(page, PLANNED)
    await expect(radar(page)).toHaveCount(0)
  })
})
