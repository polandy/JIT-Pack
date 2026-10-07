import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { fillIonic } from '../helpers/ionic'
import {
  addIdea,
  ideaCard,
  ideaDetail,
  ideaMenu,
  moveIdea,
  openIdea,
  openIdeas,
  planIdea,
} from '../helpers/m28'
import {
  chooseDay,
  dayFromToday,
  dayPlan,
  openDayPlan,
  timelineLines,
  wayByHand,
} from '../helpers/m29'
import { openTripView } from '../helpers/trips'
import { openListComposer } from '../helpers/composer'
import type { Locator, Page } from '@playwright/test'

/**
 * M28 — from an idea to the packing side (UI-Test-Spec §28, FR-29.13). An
 * idea on the shortlist opens the screen that makes an excursion, a task or a
 * shopping entry with its creator pre-filled; what is made names the idea,
 * and `‹ back` leads to the idea again.
 *
 * Local Mode: the bridge is the client's alone. The trip lies a month ahead,
 * so the idea's day and the day before it are both still to come.
 */

const FIRST = dayFromToday(30)
const THIRD = dayFromToday(32)
const LAST = dayFromToday(33)
const IDEA = 'Gola Gorropu'

/** A trip with one idea on the shortlist, planned on its third day. */
async function shortlistedIdea(page: Page): Promise<Locator> {
  await createTripViaWizard(page, {
    name: 'Sardinien',
    startDate: FIRST,
    endDate: LAST,
    travelers: ['Andy'],
  })
  await openIdeas(page)
  await addIdea(page, { title: IDEA })
  const detail = await openIdea(page, IDEA)
  // Undecided, it offers nothing yet.
  await expect(detail.getByTestId('idea-make-task')).toHaveCount(0)
  await moveIdea(detail, 'idea-act-shortlist', 'shortlisted')
  await planIdea(page, detail, THIRD)
  await page.getByTestId('header-back').click()
  const again = ideaDetail(page)
  await expect(again.getByTestId('idea-act-plan')).toHaveAttribute('data-planned', THIRD)
  return again
}

/** `‹ back` from the screen that made a result: the idea's sheet again. */
async function backToIdea(page: Page): Promise<Locator> {
  await page.getByTestId('header-back').click()
  const detail = ideaDetail(page)
  await expect(detail.getByTestId('idea-results')).toBeVisible()
  return detail
}

test.describe('M28 the bridge to the packing side @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M28-22: each of the three creators opens pre-filled, writes a result
   * that names the idea, and returns to it. The excursion is made once; a
   * task stays on offer.
   */
  test('E2E-M28-22: an idea becomes an excursion, a task and a shopping entry, each naming it', async ({
    page,
  }) => {
    let detail = await shortlistedIdea(page)
    for (const kind of ['excursion', 'task', 'shopping']) {
      await expect(detail.getByTestId(`idea-make-${kind}`)).toBeVisible()
    }

    // The excursion: M27's sheet with the idea's name and day.
    await detail.getByTestId('idea-make-excursion').click()
    const sheet = page.getByTestId('m27-sheet')
    await expect(sheet.getByTestId('m27-name').locator('input')).toHaveValue(IDEA)
    await expect(sheet.getByTestId('m27-dates-value')).toBeVisible()
    await sheet.getByTestId('m27-save').click()
    const list = visiblePage(page)
    await expect(list.getByTestId('m27-excursion-page')).toBeVisible()
    await expect(list.getByTestId('m27-excursion-idea')).toHaveText(IDEA)
    await writesLanded(page)
    detail = await backToIdea(page)
    await expect(detail.locator('[data-testid^="idea-result-excursion:"]')).toHaveText(IDEA)
    await expect(detail.getByTestId('idea-make-excursion')).toHaveCount(0)

    // The task: M25's composer holding the words and the day before.
    await detail.getByTestId('idea-make-task').click()
    const composer = await openListComposer(page, 'm25')
    const body = `Book ${IDEA}`
    await expect(composer.getByTestId('trip-todo-input').locator('input')).toHaveValue(body)
    await composer.getByTestId('trip-todo-add').click()
    await expect(visiblePage(page).getByTestId(`trip-todo-due-${body}`)).toBeVisible()
    await expect(visiblePage(page).getByTestId(`trip-todo-idea-${body}`)).toHaveText(IDEA)
    await writesLanded(page)
    detail = await backToIdea(page)
    await expect(detail.locator('[data-testid^="idea-result-task:"]')).toHaveText(body)
    await expect(detail.getByTestId('idea-make-task')).toBeVisible()

    // The shopping entry: M6's field on the destination list.
    await detail.getByTestId('idea-make-shopping').click()
    await openListComposer(page, 'm6')
    const m6 = visiblePage(page)
    await expect(m6.getByTestId('m6-add-input').locator('input')).toHaveValue(IDEA)
    await expect(m6.getByTestId('m6-list-local')).toHaveAttribute('aria-pressed', 'true')
    await fillIonic(m6.getByTestId('m6-add-input'), `Stirnlampe für ${IDEA}`)
    await m6.getByTestId('m6-add-submit').click()
    const origin = m6.getByTestId(`m6-row-idea-Stirnlampe für ${IDEA}`)
    await expect(origin).toHaveText(IDEA)
    await writesLanded(page)

    // The 💡 line leads to the idea too.
    await origin.click()
    detail = ideaDetail(page)
    await expect(detail.locator('[data-testid^="idea-result-"]')).toHaveCount(3)
  })

  /**
   * E2E-M28-25: the idea's sheet plans it — no state segment and no row of
   * day chips are left on it. *Einplanen…* opens M29's sheet with the idea
   * chosen; saving lands on the day it was planned on, its line there with
   * the time, and `‹ back` returns to the idea, whose button now names the
   * day. The same sheet takes the day away again.
   */
  test('E2E-M28-25: an idea is planned from its sheet, lands on its day in M29, and ‹ back returns to it', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Sardinien',
      startDate: FIRST,
      endDate: LAST,
      travelers: ['Andy'],
    })
    await openIdeas(page)
    await addIdea(page, { title: IDEA })
    const detail = await openIdea(page, IDEA)
    const ideaId = await detail.getAttribute('data-idea')
    await expect(detail.getByTestId('idea-act-shortlist')).toBeVisible()
    await expect(
      detail.locator('[data-testid^="idea-state-"], [data-testid^="idea-plan-"]'),
    ).toHaveCount(0)
    await expect(detail.getByTestId('idea-act-plan')).toHaveCount(0)

    await moveIdea(detail, 'idea-act-shortlist', 'shortlisted')
    await planIdea(page, detail, THIRD, '15:00')
    await expect(page).toHaveURL(/\/dayplan/)
    const plan = dayPlan(page)
    await expect(plan.getByTestId(`m29-day-${THIRD}`)).toHaveAttribute('aria-selected', 'true')
    await expect(plan.getByTestId(`m29-time-idea:${ideaId}`)).toHaveText('15:00')

    await page.getByTestId('header-back').click()
    const again = ideaDetail(page)
    const button = again.getByTestId('idea-act-plan')
    await expect(button).toHaveAttribute('data-planned', THIRD)
    await expect(button).toContainText('15:00')

    await button.click()
    const sheet = page.getByTestId('m29-idea-plan-body')
    await expect(sheet.getByTestId(`m29-idea-plan-day-${THIRD}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(sheet.getByTestId('m29-idea-plan-time').locator('input')).toHaveValue('15:00')
    await sheet.getByTestId('m29-idea-plan-none').click()
    await expect(sheet).toHaveCount(0)
    await page.getByTestId('header-back').click()
    await expect(ideaDetail(page).getByTestId('idea-act-plan')).toHaveAttribute('data-planned', '')
  })

  /**
   * E2E-M28-23: deleting the idea leaves what came of it — the task stays,
   * its 💡 line goes.
   */
  test('E2E-M28-23: a deleted idea leaves its task, without the line naming it', async ({
    page,
  }) => {
    const detail = await shortlistedIdea(page)
    await detail.getByTestId('idea-make-task').click()
    const body = `Book ${IDEA}`
    const composer = await openListComposer(page, 'm25')
    await expect(composer.getByTestId('trip-todo-input').locator('input')).toHaveValue(body)
    await composer.getByTestId('trip-todo-add').click()
    await expect(visiblePage(page).getByTestId(`trip-todo-idea-${body}`)).toBeVisible()
    await writesLanded(page)

    const again = await backToIdea(page)
    await ideaMenu(page, again, 'idea-menu-remove')
    await page
      .getByTestId('idea-remove-confirm')
      .getByRole('button', { name: /delete idea/i })
      .click()
    // The shortlist's count, not the Ideas segment's empty state: that one
    // showed before the removal too. The count drops only once the sheet's
    // route is gone.
    await expect(visiblePage(page).getByTestId('m28-count-shortlisted')).toHaveText('0')
    await writesLanded(page)

    await openTripView(page, 'tasks')
    const tasks = visiblePage(page)
    await expect(tasks.getByTestId(`trip-todo-${body}`)).toBeVisible()
    await expect(tasks.getByTestId(`trip-todo-idea-${body}`)).toHaveCount(0)
  })

  /**
   * E2E-M28-24: on a phone the idea is a sheet. Leaving it for the screen that
   * makes a task closes the sheet, and that closing must not take the reader
   * back to the board — M25 stays, its composer pre-filled.
   */
  test.describe('on a phone', () => {
    test.use({ viewport: { width: 412, height: 915 } })

    test('E2E-M28-24: the sheet closed by leaving it keeps the reader on the screen it led to', async ({
      page,
    }) => {
      await createTripViaWizard(page, {
        name: 'Sardinien',
        startDate: FIRST,
        endDate: LAST,
        travelers: ['Andy'],
      })
      await openIdeas(page)
      await addIdea(page, { title: IDEA })
      // The sheet is a modal outside the page, so it is found on the page.
      await ideaCard(page, IDEA).click()
      const sheet = page.getByTestId('m28-idea-modal').getByTestId('idea-detail')
      await moveIdea(sheet, 'idea-act-shortlist', 'shortlisted')
      await sheet.getByTestId('idea-make-task').click()

      const tasks = visiblePage(page)
      await openListComposer(page, 'm25')
      await expect(page.getByTestId('m28-idea-modal')).toBeHidden()
      await expect(tasks.getByTestId('trip-todo-input').locator('input')).toHaveValue(
        `Book ${IDEA}`,
      )
      await expect(page).toHaveURL(/\/tasks\?/)
    })
  })
})

test.describe('M29 an idea and its excursion on the day plan @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M29-13: an excursion made from an idea stands on the day plan as one
   * line — the idea has none of its own. A connection is added on the
   * excursion's own screen; the day plan shows it, labelled with the excursion.
   */
  test('E2E-M29-13: the idea and its excursion are one line, and a connection is added on the excursion', async ({
    page,
  }) => {
    const detail = await shortlistedIdea(page)
    await detail.getByTestId('idea-make-excursion').click()
    await page.getByTestId('m27-sheet').getByTestId('m27-save').click()
    const excursion = visiblePage(page)
    await expect(excursion.getByTestId('m27-excursion-page')).toBeVisible()
    await writesLanded(page)

    await excursion.getByTestId('m27-journey-out').click()
    const sheet = page.getByTestId('day-entry')
    await expect(sheet.getByTestId('connection-step-sub')).toContainText(IDEA)
    await wayByHand(sheet, { from: 'Dorgali', dep: '07:10', to: 'Olbia', arr: '09:05' })
    await expect(sheet.getByTestId('day-entry-title')).toHaveText(IDEA)
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    await expect(excursion.getByTestId('m27-journey-out')).toContainText(
      '07:10 Dorgali → 09:05 Olbia',
    )

    await openDayPlan(page)
    await chooseDay(page, THIRD)
    const lines = timelineLines(page)
    await expect(lines).toHaveCount(2)
    const line = lines.filter({ hasText: IDEA, hasNotText: 'Dorgali' })
    await expect(line).toHaveAttribute('data-kind', 'excursion')
    await expect(line).toContainText(`💡 ${IDEA}`)
    const connection = lines.filter({ hasText: 'Dorgali → Olbia' })
    await expect(connection).toHaveAttribute('data-kind', 'connection')
    await expect(connection).toContainText(`Way there · ${IDEA}`)
  })
})
