import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { PATH } from '../routes'
import { addIdea, ideaDetail, ideasBoard, openIdea, openIdeas } from '../helpers/m28'
import { addDayEntry, dayPlan, openDayPlan } from '../helpers/m29'
import { browserDay } from '../helpers/page'
import { askToStart, openTripView } from '../helpers/trips'
import type { Page } from '@playwright/test'

/**
 * Where a trip opens, and M1's *Heute* card (UI-Test-Spec §29, FR-29.7).
 *
 * Local Mode throughout: the rule reads the trip's dates and this device's
 * last visited view, both in the browser. The trips are dated against today,
 * so a trip that contains today stays under way whichever day the suite runs.
 */

/** Tap a trip's row on M2 — every segment lists its trips under one testid. */
async function openFromTripList(page: Page, name: string) {
  await writesLanded(page)
  await page.goto(`${PATH.trips}?status=planned`)
  await visiblePage(page).getByTestId(`trip-row-${name}`).click()
}

/** Forget the view this device last stood on in a trip, as on a device that never opened it. */
async function forgetLastView(page: Page, tripPath: string) {
  const tripId = tripPath.split('/').pop()!
  await page.evaluate((id) => localStorage.removeItem(`jp_trip_view_${id}`), tripId)
}

/** The *Heute* card under a trip on M1. */
function todayCard(page: Page, trip: string) {
  return visiblePage(page).getByTestId(`dashboard-today-${trip}`)
}

test.describe('Trip opening and the Heute card @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M29-10: a trip opens on the view its dates decide — before them on
   * the view last visited, on a first visit with an empty packing list on the
   * ideas; from the first day to the last on the day plan, from M2 and from
   * M1 alike; afterwards on the packing list, whatever was visited last.
   */
  test('E2E-M29-10: a trip opens on the view its dates decide', async ({ page }) => {
    const day = await days(page, [-9, -5, -1, 0, 2, 30, 33])
    const later = await createTripViaWizard(page, {
      name: 'Sardinien später',
      startDate: day[30],
      endDate: day[33],
      travelers: ['Andy'],
    })
    // Before the trip: where it was left.
    await openTripView(page, 'tasks')
    await openFromTripList(page, 'Sardinien später')
    await expect(visiblePage(page).getByTestId('m25-page')).toBeVisible()
    await expect(page.getByTestId('trip-view-tasks')).toHaveAttribute('aria-current', 'page')

    // A first visit on this device, its packing list empty: the ideas.
    await forgetLastView(page, later)
    await openFromTripList(page, 'Sardinien später')
    await expect(ideasBoard(page)).toBeVisible()

    // Under way: the day plan, from M2 …
    await createTripViaWizard(page, {
      name: 'Engadin jetzt',
      startDate: day[-1],
      endDate: day[2],
      travelers: ['Andy'],
    })
    await openTripView(page, 'shopping')
    await openFromTripList(page, 'Engadin jetzt')
    await expect(dayPlan(page).getByTestId('m29-strip')).toBeVisible()
    await expect(dayPlan(page).getByTestId(`m29-day-${day[0]}`)).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // … and from M1, where a trip not yet started is listed under *Geplant*.
    await page.goto(PATH.dashboard)
    await visiblePage(page).getByTestId('dashboard-planned-Engadin jetzt').click()
    await expect(dayPlan(page).getByTestId('m29-strip')).toBeVisible()

    // Afterwards: the packing list, though the day plan was the last view.
    await createTripViaWizard(page, {
      name: 'Engadin vorbei',
      startDate: day[-9],
      endDate: day[-5],
      travelers: ['Andy'],
    })
    await openDayPlan(page)
    await openFromTripList(page, 'Engadin vorbei')
    await expect(page.getByTestId('header-title')).toHaveText('Engadin vorbei')
    await expect(page.getByTestId('trip-view-packing')).toHaveAttribute('aria-current', 'page')

    // From a series' history (M20) too: a trip under way, on its day plan.
    await createTripViaWizard(page, {
      name: 'Engadin Serie',
      startDate: day[-1],
      endDate: day[2],
      travelers: ['Andy'],
      series: 'Engadin',
    })
    await writesLanded(page)
    await page.goto(PATH.trips)
    await visiblePage(page).getByTestId('series-header-Engadin').click()
    await expect(page.getByTestId('header-title')).toHaveText('Engadin')
    await visiblePage(page).getByTestId('m16-trip-Engadin Serie').click()
    await expect(dayPlan(page).getByTestId('m29-strip')).toBeVisible()
  })

  /**
   * E2E-M29-11: during the trip, M1 shows what is still to come today — at
   * most three lines, the way M29 draws them, an idea ticked there as on
   * M29, the rest counted on the way onto the plan. A trip whose days have
   * not come has no card.
   */
  test('E2E-M29-11: the Heute card lists today’s next three lines and leads onto the day plan', async ({
    page,
  }) => {
    const day = await days(page, [-1, 0, 2, 30, 33])
    await createTripViaWizard(page, {
      name: 'Sardinien später',
      startDate: day[30],
      endDate: day[33],
      travelers: ['Andy'],
    })
    await createTripViaWizard(page, {
      name: 'Engadin jetzt',
      startDate: day[-1],
      endDate: day[2],
      travelers: ['Andy'],
    })
    // An idea on today's plan, and three entries of the plan's own.
    await openIdeas(page)
    await addIdea(page, { title: 'Bernina Express' })
    const detail = await openIdea(page, 'Bernina Express')
    await detail.getByTestId('idea-state-shortlisted').click()
    await detail.getByTestId(`idea-plan-day-${day[0]}`).click()
    await expect(detail.getByTestId(`idea-plan-day-${day[0]}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await detail.getByTestId('idea-detail-close').click()
    await expect(ideaDetail(page)).toHaveCount(0)
    await openDayPlan(page)
    for (const title of ['Velo mieten', 'Postkarten', 'Tisch reservieren']) {
      await addDayEntry(page, { title })
    }

    await page.goto(PATH.dashboard)
    const card = todayCard(page, 'Engadin jetzt')
    await expect(card).toBeVisible()
    await expect(todayCard(page, 'Sardinien später')).toHaveCount(0)
    const lines = card.locator('[data-testid^="m29-line-"]')
    await expect(lines).toHaveCount(3)
    await expect(card.getByTestId('dashboard-today-Engadin jetzt-more')).toHaveText(
      /\+ 1 more · day plan/,
    )

    // The idea's tick, from M1, is M29's: the idea is done.
    const idea = lines.filter({ hasText: 'Bernina Express' })
    await idea.locator('[data-testid^="m29-tick-"]').click()
    await expect(idea).toHaveAttribute('data-done', 'true')

    // The way onto the plan, on today.
    await card.getByTestId('dashboard-today-Engadin jetzt-more').click()
    await expect(dayPlan(page).getByTestId(`m29-day-${day[0]}`)).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(dayPlan(page).getByTestId(`m29-tick-idea:${await ideaId(page)}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Started with its packing finished, the trip is the hero and the card a
    // block of it (FR-7.10) — the same lines, and no field to type into.
    await openTripView(page, 'packing')
    await expect(page.getByTestId('header-title')).toHaveText('Engadin jetzt')
    await askToStart(page)
    await page.getByTestId('m4-close-sheet-confirm').click()
    await expect(page.getByTestId('m4-close-sheet')).toHaveCount(0)
    await writesLanded(page)
    await page.goto(PATH.dashboard)
    const hero = visiblePage(page).getByTestId('dashboard-trip-Engadin jetzt')
    const block = hero.getByTestId('dashboard-today-Engadin jetzt')
    await expect(block.locator('[data-testid^="m29-line-"]')).toHaveCount(3)
    await expect(block.getByTestId('dashboard-today-Engadin jetzt-count')).toHaveText('4')
    await expect(block.getByTestId('dashboard-today-Engadin jetzt-add')).toHaveCount(0)
  })
})

/** Days from today as the browser reckons them, by offset. */
async function days(page: Page, offsets: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {}
  for (const n of offsets) out[n] = await browserDay(page, n)
  return out
}

/** The one idea's id, read off its line on the plan. */
async function ideaId(page: Page): Promise<string> {
  const testid = await dayPlan(page)
    .locator('[data-testid^="m29-line-idea:"]')
    .first()
    .getAttribute('data-testid')
  return testid!.replace('m29-line-idea:', '')
}
