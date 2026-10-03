import type { Locator, Page } from '@playwright/test'

import { test, expect, createTripViaWizard, visiblePage } from './fixtures'
import { fillIonic } from './helpers/ionic'
import { addExcursionTrack, createExcursion, openExcursions } from './helpers/m27'
import { gpxFile, stubTiles } from './helpers/m28'
import { chooseDay, dayFromToday, openDayPlan, timelineLines } from './helpers/m29'
import { writesLanded } from './helpers/page'
import { stubTimetable } from './helpers/timetable'

/**
 * M27 — an excursion's way there and back (FR-29.18), in Local Mode: two
 * slots on its screen, each a connection as the day plan has it, written by
 * hand here (a link's reading is E2E-M29's), and the time the two leave on
 * the spot. Days are counted from today, so the excursion stays upcoming.
 */

const FIRST = dayFromToday(30)
const HIKE_DAY = dayFromToday(31)
const LAST = dayFromToday(33)

/** 3.3 km due north, 300 m up: hiked 1 h 25 (`tracks.spec.ts` derives it). */
const CLIMB = gpxFile(
  [
    [46.5, 7.7, 1000],
    [46.51, 7.7, 1100],
    [46.52, 7.7, 1200],
    [46.53, 7.7, 1300],
  ],
  { name: 'Aufstieg zur Alp' },
)

/** One leg by hand in the day plan's sheet, opened from a slot, and saved. */
async function fillWay(
  page: Page,
  heading: string,
  way: { from: string; dep: string; to: string; arr: string; line: string },
): Promise<void> {
  const sheet = page.getByTestId('day-entry')
  await expect(sheet.getByTestId('day-entry-title')).toHaveText(heading)
  await fillIonic(sheet.getByTestId('day-entry-hand-from'), way.from)
  await fillIonic(sheet.getByTestId('day-entry-hand-to'), way.to)
  await sheet.getByTestId('day-entry-hand-dep').locator('input').fill(way.dep)
  await sheet.getByTestId('day-entry-hand-arr').locator('input').fill(way.arr)
  await fillIonic(sheet.getByTestId('day-entry-hand-line'), way.line)
  await sheet.getByTestId('day-entry-save').click()
  await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
  await writesLanded(page)
}

function slot(page: Page, role: 'out' | 'back'): Locator {
  return visiblePage(page).getByTestId(`m27-journey-${role}`)
}

test.describe('M27 — an excursion’s way there and back (FR-29.18) @local @m27', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await stubTiles(page)
    await createTripViaWizard(page, {
      name: 'Berner Oberland',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy'],
    })
    await openExcursions(page)
  })

  /**
   * E2E-M27-17: an excursion without a day offers no slot and says why. With
   * one, *Hin* and *Zurück* each open the day plan's sheet under their own
   * name and keep what is written there — departure → arrival, stops, line,
   * changes — across a reload. The two say how long one is on the spot; a
   * track adds what its route leaves of it, standing between the two ways in
   * *Der Tag*, which folds to one line of the day. M27's list names both
   * departures, and the day plan names each way with the excursion.
   */
  test('E2E-M27-17: the way there and back fill their slots, and the time on the spot follows', async ({
    page,
  }) => {
    const undated = await createExcursion(page, { name: 'Irgendwann' })
    await expect(undated.getByTestId('m27-journey-no-day')).toBeVisible()
    await expect(undated.getByTestId('m27-journey-out')).toHaveCount(0)

    await page.goBack()
    await expect(visiblePage(page).getByTestId('m27-page')).toBeVisible()
    const m27 = await createExcursion(page, {
      name: 'Oeschinensee',
      days: { start: HIKE_DAY, end: HIKE_DAY },
    })
    await expect(slot(page, 'out')).toContainText('Add the way there')
    await expect(slot(page, 'back')).toContainText('Add the way back')

    await slot(page, 'out').click()
    await fillWay(page, 'Way there', {
      from: 'Spiez',
      dep: '08:06',
      to: 'Kandersteg',
      arr: '08:34',
      line: 'RE',
    })
    await expect(slot(page, 'out')).toContainText('08:06 Spiez → 08:34 Kandersteg')
    await expect(slot(page, 'out')).toContainText('There · RE · direct')

    await slot(page, 'back').click()
    await fillWay(page, 'Way back', {
      from: 'Kandersteg',
      dep: '16:23',
      to: 'Spiez',
      arr: '16:52',
      line: 'RE',
    })
    await expect(slot(page, 'back')).toContainText('16:23 Kandersteg → 16:52 Spiez')
    await expect(m27.getByTestId('m27-journey-budget')).toHaveText('On the spot 7 h 49')

    await page.reload()
    await expect(slot(page, 'out')).toContainText('08:06 Spiez → 08:34 Kandersteg')
    await expect(slot(page, 'back')).toContainText('16:23 Kandersteg → 16:52 Spiez')

    await addExcursionTrack(page, 'climb.gpx', CLIMB)
    await expect(visiblePage(page).getByTestId('m27-journey-budget')).toHaveText(
      'On the spot 7 h 49 · Route 1 h 25 → 6 h 24 to spare',
    )

    // *Der Tag* in order — there, the route, back — and folded to one line.
    const out = await slot(page, 'out').boundingBox()
    const route = await visiblePage(page).getByTestId('m27-day-route').boundingBox()
    const back = await slot(page, 'back').boundingBox()
    expect(out!.y).toBeLessThan(route!.y)
    expect(route!.y).toBeLessThan(back!.y)
    const toggle = visiblePage(page).getByTestId('m27-day-toggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(visiblePage(page).getByTestId('m27-day-folded')).toHaveText(
      '08:06 → 3.3 km → 16:23 · 6 h 24 to spare',
    )
    await expect(slot(page, 'out')).toHaveCount(0)

    await page.goBack()
    const list = visiblePage(page)
    await expect(list.getByTestId('m27-page')).toBeVisible()
    await expect(list.getByTestId('m27-journey-line-Oeschinensee')).toHaveText(
      'there 08:06 · back 16:23',
    )
    await expect(list.getByTestId('m27-journey-line-Irgendwann')).toHaveCount(0)

    await openDayPlan(page)
    await chooseDay(page, HIKE_DAY)
    const lines = timelineLines(page)
    await expect(lines.filter({ hasText: 'Spiez → Kandersteg' })).toContainText(
      'Way there · Oeschinensee',
    )
    await expect(lines.filter({ hasText: 'Kandersteg → Spiez' })).toContainText(
      'Way back · Oeschinensee',
    )
  })

  /**
   * E2E-M27-18: the slots search the timetable. The way there asks for the
   * stop nearest the track's start as *Nach*, offers stops as the departure is
   * typed, lists connections, and a tap takes one. The way back arrives
   * reversed, leaving once the route is walked, and every connection says how
   * much it leaves of that: one too early, one with time to spare. A stop the
   * service does not know says so and leaves the hand fields.
   */
  test('E2E-M27-18: the way there and back are searched in the timetable, each seeded from the other', async ({
    page,
  }) => {
    const stub = await stubTimetable(
      page,
      [
        { id: '8507483', name: 'Kandersteg', lat: 46.5, lon: 7.7 },
        { id: '8507100', name: 'Spiez', lat: 46.68, lon: 7.68 },
      ],
      [
        {
          from: 'Spiez',
          to: 'Kandersteg',
          dep: '08:06',
          arr: '08:34',
          category: 'RE',
          number: '0123',
        },
        {
          from: 'Spiez',
          to: 'Kandersteg',
          dep: '08:36',
          arr: '09:04',
          category: 'RE',
          number: '0125',
        },
        {
          from: 'Kandersteg',
          to: 'Spiez',
          dep: '09:40',
          arr: '10:09',
          category: 'RE',
          number: '0130',
        },
        {
          from: 'Kandersteg',
          to: 'Spiez',
          dep: '16:23',
          arr: '16:52',
          category: 'RE',
          number: '0145',
        },
      ],
    )
    await createExcursion(page, { name: 'Oeschinensee', days: { start: HIKE_DAY, end: HIKE_DAY } })
    await addExcursionTrack(page, 'climb.gpx', CLIMB)

    await slot(page, 'out').click()
    const sheet = page.getByTestId('day-entry')
    await expect(sheet.getByTestId('timetable-to').locator('input')).toHaveValue('Kandersteg')

    // A stop the service does not know: said so, and the hand fields stay.
    await sheet.getByTestId('timetable-from').locator('input').fill('Nirgendwo')
    await sheet.getByTestId('timetable-submit').click()
    await expect(sheet.getByTestId('timetable-message')).toHaveText(
      'No connection found – check the stops or enter the way by hand below.',
    )
    await expect(sheet.getByTestId('day-entry-hand')).toBeVisible()

    await sheet.getByTestId('timetable-from').locator('input').fill('Spi')
    await sheet.getByTestId('timetable-from-stop-8507100').click()
    await expect(sheet.getByTestId('timetable-from').locator('input')).toHaveValue('Spiez')
    await sheet.getByTestId('timetable-submit').click()
    await expect(sheet.getByTestId('timetable-results').locator('li')).toHaveCount(2)
    await expect(sheet.getByTestId('timetable-result-0')).toContainText('08:06 → 08:34')
    await expect(sheet.getByTestId('timetable-result-0')).toContainText('RE 123')
    expect(
      stub.asked.some(
        (u) => u.pathname.endsWith('/connections') && u.searchParams.get('date') === HIKE_DAY,
      ),
    ).toBe(true)

    await sheet.getByTestId('timetable-result-0').click()
    await expect(sheet.getByTestId('day-entry-legs')).toContainText('Spiez → Kandersteg')
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    await writesLanded(page)
    await expect(slot(page, 'out')).toContainText('08:06 Spiez → 08:34 Kandersteg')

    // Arriving 08:34 and a route of 1 h 25 → leaving 09:59 at the earliest.
    await slot(page, 'back').click()
    await expect(sheet.getByTestId('timetable-from').locator('input')).toHaveValue('Kandersteg')
    await expect(sheet.getByTestId('timetable-to').locator('input')).toHaveValue('Spiez')
    await expect(sheet.getByTestId('timetable-time').locator('input')).toHaveValue('09:59')
    await sheet.getByTestId('timetable-submit').click()
    await expect(sheet.getByTestId('timetable-result-0').getByTestId('timetable-slack')).toHaveText(
      '19 min too early',
    )
    await expect(sheet.getByTestId('timetable-result-1').getByTestId('timetable-slack')).toHaveText(
      '6 h 24 to spare',
    )
    await sheet.getByTestId('timetable-result-1').click()
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    await writesLanded(page)
    await expect(visiblePage(page).getByTestId('m27-journey-budget')).toHaveText(
      'On the spot 7 h 49 · Route 1 h 25 → 6 h 24 to spare',
    )
  })
})
