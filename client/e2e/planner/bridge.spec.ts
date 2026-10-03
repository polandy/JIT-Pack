import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { fillIonic } from '../helpers/ionic'
import { addIdea, ideaCard, ideaDetail, openIdea, openIdeas } from '../helpers/m28'
import { chooseDay, dayFromToday, openDayPlan, timelineLines } from '../helpers/m29'
import { openTripView } from '../helpers/trips'
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
  await detail.getByTestId('idea-state-shortlisted').click()
  await detail.getByTestId(`idea-plan-day-${THIRD}`).click()
  await expect(detail.getByTestId(`idea-plan-day-${THIRD}`)).toHaveAttribute('aria-pressed', 'true')
  return detail
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
    const composer = visiblePage(page).getByTestId('m25-composer')
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
   * E2E-M28-23: deleting the idea leaves what came of it — the task stays,
   * its 💡 line goes.
   */
  test('E2E-M28-23: a deleted idea leaves its task, without the line naming it', async ({
    page,
  }) => {
    const detail = await shortlistedIdea(page)
    await detail.getByTestId('idea-make-task').click()
    const body = `Book ${IDEA}`
    const composer = visiblePage(page).getByTestId('m25-composer')
    await expect(composer.getByTestId('trip-todo-input').locator('input')).toHaveValue(body)
    await composer.getByTestId('trip-todo-add').click()
    await expect(visiblePage(page).getByTestId(`trip-todo-idea-${body}`)).toBeVisible()
    await writesLanded(page)

    const again = await backToIdea(page)
    await again.getByTestId('idea-detail-remove').click()
    await page
      .getByTestId('idea-remove-confirm')
      .getByRole('button', { name: /delete idea/i })
      .click()
    await expect(visiblePage(page).getByTestId('m28-empty-idea')).toBeVisible()
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
      await sheet.getByTestId('idea-state-shortlisted').click()
      await sheet.getByTestId('idea-make-task').click()

      const tasks = visiblePage(page)
      await expect(tasks.getByTestId('m25-composer')).toBeVisible()
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
   * line — the idea has none of its own — and a connection added from that
   * line belongs to the excursion, which its label names.
   */
  test('E2E-M29-13: the idea and its excursion are one line, and a connection hangs off it', async ({
    page,
  }) => {
    const detail = await shortlistedIdea(page)
    await detail.getByTestId('idea-make-excursion').click()
    await page.getByTestId('m27-sheet').getByTestId('m27-save').click()
    await expect(visiblePage(page).getByTestId('m27-excursion-page')).toBeVisible()
    await writesLanded(page)

    await openDayPlan(page)
    await chooseDay(page, THIRD)
    const lines = timelineLines(page)
    await expect(lines).toHaveCount(1)
    const line = lines.first()
    await expect(line).toHaveAttribute('data-kind', 'excursion')
    await expect(line).toContainText(`💡 ${IDEA}`)

    await line.locator('[data-testid^="m29-add-connection-"]').click()
    const sheet = page.getByTestId('day-entry')
    await expect(sheet.getByTestId('day-entry-excursion')).toContainText(IDEA)
    await fillIonic(sheet.getByTestId('day-entry-hand-from'), 'Dorgali')
    await fillIonic(sheet.getByTestId('day-entry-hand-to'), 'Olbia')
    await sheet.getByTestId('day-entry-hand-dep').locator('input').fill('07:10')
    await sheet.getByTestId('day-entry-hand-arr').locator('input').fill('09:05')
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    const connection = timelineLines(page).filter({ hasText: 'Dorgali → Olbia' })
    await expect(connection).toHaveAttribute('data-kind', 'connection')
    await expect(connection).toContainText(`Connection · ${IDEA}`)
    await expect(timelineLines(page)).toHaveCount(2)
  })
})
