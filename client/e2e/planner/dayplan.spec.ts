import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { fillIonic } from '../helpers/ionic'
import { createExcursion, openExcursions } from '../helpers/m27'
import { addIdea, ideaCard, ideaDetail, openIdea, openIdeas, showSegment } from '../helpers/m28'
import {
  addDayEntry,
  chooseDay,
  dayFromToday,
  dayPlan,
  openDayPlan,
  timeline,
  timelineLines,
} from '../helpers/m29'

/**
 * M29 — a trip's day plan (UI-Test-Spec §29, FR-29.14, FR-29.15). The
 * planner's second screen; its cases live beside M28's.
 *
 * Local Mode throughout: every rule runs in the browser. The trip lies a
 * month ahead, so the plan opens on its first day whatever today is — a trip
 * that contained today would open on today (FR-29.15) and move under the
 * suite from one day to the next.
 */

const FIRST = dayFromToday(30)
const SECOND = dayFromToday(31)
const THIRD = dayFromToday(32)
const LAST = dayFromToday(33)

test.describe('M29 day plan @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M29-01: the day plan needs both of the trip's dates (FR-29.7). A
   * trip with only an end has no pill for it; one with both has, last in the
   * row, and its strip lists every day with the first one chosen.
   */
  test('E2E-M29-01: the pill appears only with both dates, and the strip lists every day', async ({
    page,
  }) => {
    await createTripViaWizard(page, { name: 'Ohne Anfang', endDate: LAST, travelers: ['Andy'] })
    await expect(page.getByTestId('trip-view-ideas')).toBeVisible()
    await expect(page.getByTestId('trip-view-dayplan')).toHaveCount(0)

    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy'],
    })
    const plan = await openDayPlan(page)
    await expect(page.getByTestId('header-title')).toHaveText('Day plan')
    await expect(plan.getByTestId('m29-strip').getByRole('tab')).toHaveCount(4)
    await expect(plan.getByTestId(`m29-day-${FIRST}`)).toHaveAttribute('aria-selected', 'true')
    await expect(plan.getByTestId('m29-day-heading')).toContainText('day 1 of 4')
    // Arrival stands on the first day, departure on the last; a day between is empty.
    await expect(timelineLines(page)).toHaveCount(1)
    await expect(timeline(page)).toContainText('Arrival')
    await chooseDay(page, SECOND)
    await expect(timeline(page).getByTestId('m29-empty')).toHaveText('Nothing planned yet.')
    await chooseDay(page, LAST)
    await expect(timeline(page)).toContainText('Departure')
  })

  /**
   * E2E-M29-02: an entry of the plan's own is written on the chosen day,
   * stands by its time before the untimed lines, changes, and is deleted
   * behind a confirmation.
   */
  test('E2E-M29-02: an entry of its own is written, ordered by its time, edited and deleted', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy'],
    })
    await openDayPlan(page)

    await addDayEntry(page, { title: 'Tisch im Gasthaus', note: '4 Personen', time: '19:30' })
    // Timed before untimed: the entry's 19:30 stands above the arrival.
    await expect(timelineLines(page)).toHaveCount(2)
    await expect(timelineLines(page).first()).toContainText('19:30')
    await expect(timelineLines(page).first()).toContainText('Tisch im Gasthaus')
    await expect(timelineLines(page).first()).toContainText('4 Personen')
    await expect(timelineLines(page).last()).toContainText('Arrival')
    await writesLanded(page)

    await timelineLines(page).first().getByRole('button').first().click()
    const sheet = page.getByTestId('day-entry')
    await expect(sheet.getByTestId('day-entry-title')).toHaveText('Edit entry')
    // FR-29.15: a trip of one asks nobody whom an entry is for (E2E-M29-19 shows the row).
    await expect(sheet.getByTestId('who-day-entry')).toHaveCount(0)
    await sheet.getByTestId('day-entry-time').locator('input').fill('20:15')
    await sheet.getByTestId('day-entry-save').click()
    await expect(timelineLines(page).first()).toContainText('20:15')

    await timelineLines(page).first().getByRole('button').first().click()
    await page.getByTestId('day-entry').getByTestId('day-entry-remove').click()
    const confirm = page.getByTestId('day-entry-remove-confirm')
    await expect(confirm).toContainText('Tisch im Gasthaus')
    await confirm.getByRole('button', { name: /delete entry/i }).click()
    await expect(timelineLines(page)).toHaveCount(1)
    await expect(timeline(page)).not.toContainText('Tisch im Gasthaus')
  })

  /**
   * E2E-M29-03: a shortlisted idea without a day waits in the pool bar and is
   * planned from it; a day given on M28 lands on the plan too, and the card
   * says it. Ticking the idea on the plan sets *Done*, which M28 counts.
   */
  test('E2E-M29-03: an idea is planned from the pool and from M28, and its tick sets Done', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy'],
    })
    await openIdeas(page)
    for (const title of ['Bernina Express', 'Segantini-Museum']) {
      await addIdea(page, { title })
      const detail = await openIdea(page, title)
      await detail.getByTestId('idea-state-shortlisted').click()
      await expect(detail.getByTestId('idea-state-shortlisted')).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await detail.getByTestId('idea-detail-close').click()
      await expect(ideaDetail(page)).toHaveCount(0)
    }
    await showSegment(page, 'shortlisted')
    await expect(
      ideaCard(page, 'Bernina Express').locator('[data-testid^="idea-card-plan-"]'),
    ).toHaveText(/not planned yet/)

    // From M28: a day on the detail, shown on the card.
    const detail = await openIdea(page, 'Segantini-Museum')
    await detail.getByTestId(`idea-plan-day-${THIRD}`).click()
    await expect(detail.getByTestId(`idea-plan-day-${THIRD}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // The time is typed on the 24-hour clock and kept once the field is left.
    const time = detail.getByTestId('idea-plan-time').locator('input')
    await time.fill('1430')
    await expect(time).toHaveValue('14:30')
    await time.blur()
    await detail.getByTestId('idea-detail-close').click()
    const planned = ideaCard(page, 'Segantini-Museum').locator('[data-testid^="idea-card-plan-"]')
    await expect(planned).not.toHaveText(/not planned yet/)
    await expect(planned).toContainText('14:30')

    // From the pool bar: the other one, on the second day.
    const plan = await openDayPlan(page)
    const bar = plan.getByTestId('m29-pool')
    await expect(bar).toHaveText(/One shortlisted idea without a day/)
    await bar.click()
    const pool = page.getByTestId('m29-pool-sheet')
    await expect(pool.getByTestId('m29-pool-title')).toBeVisible()
    const row = pool.locator('[data-testid^="m29-pool-"]').filter({ hasText: 'Bernina Express' })
    await row.locator(`[data-testid$="-${SECOND}"]`).click()
    await expect(pool.getByText('Every idea on the shortlist has a day.')).toBeVisible()
    await pool.getByTestId('m29-pool-close').click()
    await expect(plan.getByTestId('m29-pool')).toHaveCount(0)

    await chooseDay(page, SECOND)
    const line = timelineLines(page).filter({ hasText: 'Bernina Express' })
    await expect(line).toContainText('Idea')
    await chooseDay(page, THIRD)
    await expect(timelineLines(page).filter({ hasText: 'Segantini-Museum' })).toContainText('14:30')

    // The tick sets Done: struck through here, counted on M28.
    const museum = timelineLines(page).filter({ hasText: 'Segantini-Museum' })
    await museum.locator('[data-testid^="m29-tick-"]').click()
    await expect(museum).toHaveAttribute('data-done', 'true')
    await writesLanded(page)
    const board = await openIdeas(page)
    await expect(board.getByTestId('m28-count-done')).toHaveText('1')
  })

  /**
   * E2E-M29-04: a dated excursion stands on each of its days — *Start* on
   * the first, *Return* on the last — and a tap on it opens its list on M27.
   * The line comes from the packing side through the kernel's source, so this
   * is also the case that proves the binding.
   */
  test('E2E-M29-04: a dated excursion stands on its days and opens on M27', async ({ page }) => {
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy'],
    })
    await openExcursions(page)
    await createExcursion(page, { name: 'Hüttentour', days: { start: SECOND, end: THIRD } })

    await openDayPlan(page)
    await chooseDay(page, SECOND)
    const start = timelineLines(page).filter({ hasText: 'Hüttentour' })
    await expect(start).toContainText('Excursion · Start')
    await chooseDay(page, THIRD)
    const back = timelineLines(page).filter({ hasText: 'Hüttentour' })
    await expect(back).toContainText('Excursion · Return')

    await back.getByRole('button').first().click()
    await expect(visiblePage(page).getByTestId('m27-excursion-page')).toBeVisible()
    await expect(page.getByTestId('header-title')).toHaveText('Hüttentour')
    await expect(dayPlan(page)).toHaveCount(0)
  })

  /**
   * E2E-M29-19: an entry names whom it is for (FR-29.15). *Alle* is chosen
   * until a person is tapped; the line then says *for Sia*, an entry nobody
   * narrowed says nothing, and *Alle* again takes the words off. An excursion
   * narrowed on M27 says its people the same way (FR-31.3).
   */
  test('E2E-M29-19: an entry is for some travellers or everybody, and its line says whom', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy', 'Sia', 'Leonardo'],
    })
    await openExcursions(page)
    await createExcursion(page, {
      name: 'Hüttentour',
      who: ['Sia'],
      days: { start: SECOND, end: SECOND },
    })
    await openDayPlan(page)

    await dayPlan(page).getByTestId('m29-fab').click()
    const sheet = page.getByTestId('day-entry')
    await expect(sheet.getByTestId('who-all-day-entry')).toHaveAttribute('aria-pressed', 'true')
    await fillIonic(sheet.getByTestId('day-entry-name'), 'Coiffeur')
    await sheet.getByTestId('day-entry-time').locator('input').fill('10:30')
    await sheet.getByTestId('who-day-entry-Sia').click()
    await expect(sheet.getByTestId('who-day-entry-Sia')).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByTestId('who-all-day-entry')).toHaveAttribute('aria-pressed', 'false')
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    await addDayEntry(page, { title: 'Frühstück', time: '08:30' })

    const coiffeur = timelineLines(page).filter({ hasText: 'Coiffeur' })
    const breakfast = timelineLines(page).filter({ hasText: 'Frühstück' })
    await expect(coiffeur.locator('[data-testid^="m29-who-"]')).toHaveText('for Sia')
    await expect(breakfast).toBeVisible()
    await expect(breakfast.locator('[data-testid^="m29-who-"]')).toHaveCount(0)
    await writesLanded(page)

    await coiffeur.getByRole('button').first().click()
    await expect(sheet.getByTestId('day-entry-title')).toHaveText('Edit entry')
    await expect(sheet.getByTestId('who-day-entry-Sia')).toHaveAttribute('aria-pressed', 'true')
    await sheet.getByTestId('who-all-day-entry').click()
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    await expect(coiffeur).toContainText('10:30')
    await expect(coiffeur.locator('[data-testid^="m29-who-"]')).toHaveCount(0)

    await chooseDay(page, SECOND)
    const hut = timelineLines(page).filter({ hasText: 'Hüttentour' })
    await expect(hut.locator('[data-testid^="m29-who-"]')).toHaveText('for Sia')
  })

  /**
   * E2E-M29-20: the plan narrowed to some travellers (FR-29.15). The chips
   * under the strip start on *Everybody* in Local Mode; Sia chosen leaves
   * Leonardo's entry and the excursion Andy goes on out and says so, Leonardo
   * added brings his back, and a new entry starts on the two chosen. The
   * choice outlives a reload; *Show all* is everybody again.
   */
  test('E2E-M29-20: the plan narrowed to some travellers shows what concerns them and says what it leaves out', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy', 'Sia', 'Leonardo'],
    })
    await openExcursions(page)
    await createExcursion(page, {
      name: 'Velotour',
      who: ['Andy'],
      days: { start: FIRST, end: FIRST },
    })
    await openDayPlan(page)
    const sheet = page.getByTestId('day-entry')
    for (const [title, person] of [
      ['Coiffeur', 'Sia'],
      ['Kinderclub', 'Leonardo'],
    ] as const) {
      await dayPlan(page).getByTestId('m29-fab').click()
      await fillIonic(sheet.getByTestId('day-entry-name'), title)
      await sheet.getByTestId(`who-day-entry-${person}`).click()
      await sheet.getByTestId('day-entry-save').click()
      await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    }
    await addDayEntry(page, { title: 'Frühstück', time: '08:30' })
    await expect(timelineLines(page)).toHaveCount(5)
    await writesLanded(page)

    const plan = dayPlan(page)
    await expect(plan.getByTestId('who-all-m29')).toHaveAttribute('aria-pressed', 'true')
    await plan.getByTestId('who-m29-Sia').click()
    await expect(timelineLines(page)).toHaveCount(3)
    await expect(timeline(page)).toContainText('Coiffeur')
    await expect(timeline(page)).toContainText('Frühstück')
    await expect(timeline(page)).not.toContainText('Kinderclub')
    await expect(timeline(page)).not.toContainText('Velotour')
    await expect(plan.getByTestId('m29-hidden')).toContainText('2 lines for others')

    await plan.getByTestId('who-m29-Leonardo').click()
    await expect(timeline(page)).toContainText('Kinderclub')
    await expect(plan.getByTestId('m29-hidden')).toContainText('One line for others')

    await plan.getByTestId('m29-fab').click()
    await expect(sheet.getByTestId('who-day-entry-Sia')).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByTestId('who-day-entry-Leonardo')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(sheet.getByTestId('who-day-entry-Andy')).toHaveAttribute('aria-pressed', 'false')
    await sheet.getByTestId('day-entry-close').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    await page.reload()
    await expect(dayPlan(page).getByTestId('who-m29-Leonardo')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(timelineLines(page)).toHaveCount(4)

    await dayPlan(page).getByTestId('m29-show-all').click()
    await expect(timelineLines(page)).toHaveCount(5)
    await expect(dayPlan(page).getByTestId('m29-hidden')).toHaveCount(0)
    await expect(dayPlan(page).getByTestId('who-all-m29')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('M29 day plan — the ＋ opens the day’s sheet (FR-21.24) @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M29-21 (FR-21.24): M29 keeps its sheet rather than M6's composer — an
   * entry carries a day, a time and for whom. The ＋ says which day it adds
   * to, in the very words the sheet it opens is titled with, and that changes
   * with the day chosen on the strip.
   */
  test('E2E-M29-21: the ＋ names the day it adds to, and opens that day’s sheet', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Engadin Tage',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy'],
    })
    const plan = await openDayPlan(page)
    await chooseDay(page, SECOND)

    await dayPlan(page).getByTestId('m29-fab').click()
    const sheet = page.getByTestId('day-entry')
    const title = await sheet.getByTestId('day-entry-title').innerText()
    expect(title).toMatch(/^New on /)
    await sheet.getByTestId('day-entry-close').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    await expect(plan.getByRole('button', { name: title, exact: true })).toBeVisible()

    await chooseDay(page, LAST)
    await expect(plan.getByRole('button', { name: title, exact: true })).toHaveCount(0)
    await expect(plan.getByTestId('m29-fab')).toBeVisible()
  })
})
