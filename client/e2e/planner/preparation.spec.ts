import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { fillIonic } from '../helpers/ionic'
import { openTripView } from '../helpers/trips'
import {
  addIdea,
  ideaDetail,
  ideaMenu,
  ideasBoard,
  moveIdea,
  openIdea,
  openIdeas,
  planIdea,
  showSegment,
} from './helpers/m28'
import { dayFromToday } from './helpers/m29'
import type { Locator, Page } from '@playwright/test'

/**
 * M28 — an idea's preparation (UI-Test-Spec §28, FR-29.21): a step written on
 * the idea in any state, with its lead before the idea's day. It waits while
 * the idea has none, falls due once it is planned, and is a task on M25 that
 * names the idea.
 *
 * Local Mode: the steps are the client's alone. The trip lies a month ahead,
 * so a week's lead before its third day is still to come.
 */

const FIRST = dayFromToday(30)
const THIRD = dayFromToday(32)
const LAST = dayFromToday(33)
const IDEA = 'Gola Gorropu'
const STEP = 'Bus reservieren'

/** A trip with one idea on the board, its detail open. */
async function openNewIdea(page: Page): Promise<Locator> {
  await createTripViaWizard(page, {
    name: 'Sardinien',
    startDate: FIRST,
    endDate: LAST,
    travelers: ['Andy'],
  })
  await openIdeas(page)
  await addIdea(page, { title: IDEA })
  return openIdea(page, IDEA)
}

/** Write a step through *＋ Vorbereitung* with the lead chosen; ends with its row. */
async function addStep(page: Page, detail: Locator, title: string, lead: number): Promise<void> {
  await detail.getByTestId('idea-prep-add').click()
  const sheet = page.getByTestId('idea-prep-sheet')
  await fillIonic(sheet.getByTestId('idea-prep-title'), title)
  await sheet.getByTestId(`idea-prep-lead-choice-${lead}`).click()
  await expect(sheet.getByTestId(`idea-prep-lead-choice-${lead}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await sheet.getByTestId('idea-prep-save').click()
  await expect(sheet.getByTestId('idea-prep-save')).toHaveCount(0)
  await expect(detail.getByTestId(`idea-prep-${title}`)).toBeVisible()
}

test.describe('M28 an idea’s preparation @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M28-26: a step written on an undecided idea waits — no due pill, the
   * dashed *once planned* — and the card counts it. Planning the idea says on
   * the plan sheet when the step falls due; afterwards the step carries its
   * pill, and M25 lists it with its day and the 💡 line naming the idea.
   */
  test('E2E-M28-26: a step waits on its idea, falls due a week before its day, and is a task on M25', async ({
    page,
  }) => {
    const detail = await openNewIdea(page)
    const ideaId = (await detail.getAttribute('data-idea')) ?? ''
    await addStep(page, detail, STEP, 7)
    await expect(detail.getByTestId(`idea-prep-lead-${STEP}`)).toHaveText('1 week before')
    await expect(detail.getByTestId(`idea-prep-waits-${STEP}`)).toBeVisible()
    await expect(detail.getByTestId(`idea-prep-due-${STEP}`)).toHaveCount(0)
    await expect(ideasBoard(page).getByTestId(`idea-card-prep-${ideaId}`)).toHaveText(
      '1 preparation open',
    )
    await writesLanded(page)

    await moveIdea(detail, 'idea-act-shortlist', 'shortlisted')
    await detail.getByTestId('idea-act-plan').click()
    await expect(page.getByTestId('m29-idea-plan')).toHaveAttribute('data-presented', 'true')
    const plan = page.getByTestId('m29-idea-plan-body')
    await plan.getByTestId(`m29-idea-plan-day-${THIRD}`).click()
    await expect(plan.getByTestId(`m29-idea-plan-day-${THIRD}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(plan.getByTestId('m29-idea-plan-prep')).toContainText(`${STEP} · due`)
    await plan.getByTestId('m29-idea-plan-save').click()
    await expect(plan).toHaveCount(0)
    await writesLanded(page)

    await page.getByTestId('header-back').click()
    const again = ideaDetail(page)
    await expect(again.getByTestId('idea-act-plan')).toHaveAttribute('data-planned', THIRD)
    await expect(again.getByTestId(`idea-prep-waits-${STEP}`)).toHaveCount(0)
    await expect(again.getByTestId(`idea-prep-due-${STEP}`)).toBeVisible()

    await openTripView(page, 'tasks')
    const tasks = visiblePage(page)
    await expect(tasks.getByTestId(`trip-task-due-${STEP}`)).toBeVisible()
    await expect(tasks.getByTestId(`trip-task-idea-${STEP}`)).toHaveText(IDEA)
  })

  /**
   * E2E-M28-27: deleting the idea takes its preparation with it — unlike a
   * task made from it (E2E-M28-23), a step means nothing without its idea.
   * The step is due first, so M25 lists it before the idea goes.
   */
  test('E2E-M28-27: a deleted idea takes its preparation steps along', async ({ page }) => {
    const detail = await openNewIdea(page)
    await moveIdea(detail, 'idea-act-shortlist', 'shortlisted')
    await planIdea(page, detail, THIRD)
    await page.getByTestId('header-back').click()
    await addStep(page, ideaDetail(page), STEP, 3)
    await writesLanded(page)
    await openTripView(page, 'tasks')
    await expect(visiblePage(page).getByTestId(`trip-task-${STEP}`)).toBeVisible()

    await openIdeas(page)
    await showSegment(page, 'shortlisted')
    const again = await openIdea(page, IDEA)
    await ideaMenu(page, again, 'idea-menu-remove')
    await page
      .getByTestId('idea-remove-confirm')
      .getByRole('button', { name: /delete idea/i })
      .click()
    await expect(visiblePage(page).getByTestId('m28-count-shortlisted')).toHaveText('0')
    await writesLanded(page)

    await openTripView(page, 'tasks')
    const tasks = visiblePage(page)
    await expect(tasks.getByTestId('m25-before')).toContainText('nothing open')
    await expect(tasks.getByTestId(`trip-task-${STEP}`)).toHaveCount(0)
  })
})
