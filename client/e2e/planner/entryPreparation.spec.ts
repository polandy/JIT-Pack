import { test, expect, createTripViaWizard, visiblePage, writesLanded } from '../fixtures'
import { fillIonic, setDateField } from '../helpers/ionic'
import { openTripView } from '../helpers/trips'
import { addDayEntry, chooseDay, dayFromToday, openDayPlan, timelineLines } from './helpers/m29'
import type { Locator, Page } from '@playwright/test'

/**
 * M29 — a day-plan entry's preparation (UI-Test-Spec §29, FR-29.21, FR-29.15): a
 * step written in the entry's edit sheet with its lead before the entry's day.
 * It is a task on M25 that names the entry and, on its due day, a task line of
 * the plan.
 *
 * Local Mode: the steps are the client's alone. The trip lies a month ahead; the
 * entry stands on its third day, so a one-day lead falls inside the trip.
 */

const FIRST = dayFromToday(30)
const SECOND = dayFromToday(31)
const THIRD = dayFromToday(32)
const LAST = dayFromToday(33)
const ENTRY = 'Abendessen'
const STEP = 'Tisch reservieren'

/** A trip with one entry on its third day; ends with the entry's edit sheet open. */
async function openNewEntry(page: Page): Promise<Locator> {
  await createTripViaWizard(page, {
    name: 'Sardinien',
    startDate: FIRST,
    endDate: LAST,
    travelers: ['Andy'],
  })
  await openDayPlan(page)
  await chooseDay(page, THIRD)
  await addDayEntry(page, { title: ENTRY })
  await timelineLines(page).filter({ hasText: ENTRY }).getByRole('button').first().click()
  const sheet = page.getByTestId('day-entry')
  await expect(sheet.getByTestId('day-entry-prep')).toBeVisible()
  return sheet
}

/** Write a step through *＋ Vorbereitung* with the lead chosen; ends with its row. */
async function addStep(page: Page, sheet: Locator, title: string, lead: number): Promise<void> {
  await sheet.getByTestId('day-entry-prep-add').click()
  const step = page.getByTestId('day-entry-prep-sheet')
  await fillIonic(step.getByTestId('day-entry-prep-title'), title)
  await step.getByTestId(`day-entry-prep-lead-choice-${lead}`).click()
  await expect(step.getByTestId(`day-entry-prep-lead-choice-${lead}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await step.getByTestId('day-entry-prep-save').click()
  await expect(step.getByTestId('day-entry-prep-save')).toHaveCount(0)
  await expect(sheet.getByTestId(`day-entry-prep-${title}`)).toBeVisible()
}

test.describe('M29 an entry’s preparation @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M29-25: a step written in an entry's sheet carries its lead and a due
   * pill; the entry's line counts it open. On the step's day the plan lists it
   * as a task naming the entry, and its tick takes the count off the entry.
   * A new entry has no Vorbereitung until it is saved.
   */
  test('E2E-M29-25: a step is due a day before its entry, lists on that day and ticks off', async ({
    page,
  }) => {
    const sheet = await openNewEntry(page)
    await addStep(page, sheet, STEP, 1)
    await expect(sheet.getByTestId(`day-entry-prep-lead-${STEP}`)).toHaveText('The day before')
    await expect(sheet.getByTestId(`day-entry-prep-due-${STEP}`)).toBeVisible()
    await writesLanded(page)
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    const entryLine = timelineLines(page).filter({ hasText: ENTRY })
    await expect(entryLine.locator('[data-testid^="m29-prep-"]')).toContainText(
      '1 preparation open',
    )

    await chooseDay(page, SECOND)
    const stepLine = timelineLines(page).filter({ hasText: STEP })
    await expect(stepLine).toContainText(ENTRY)
    await stepLine.locator('[data-testid^="m29-tick-"]').click()
    await expect(stepLine).toHaveAttribute('data-done', 'true')
    await chooseDay(page, THIRD)
    await expect(entryLine.locator('[data-testid^="m29-prep-"]')).toHaveCount(0)
  })

  /**
   * E2E-M29-26: M25 lists the step with the line naming the entry, and deleting
   * the entry deletes the step — a step means nothing without its entry.
   */
  test('E2E-M29-26: M25 names the entry, and a deleted entry takes its steps along', async ({
    page,
  }) => {
    const sheet = await openNewEntry(page)
    await addStep(page, sheet, STEP, 1)
    await writesLanded(page)
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    await openTripView(page, 'tasks')
    const tasks = visiblePage(page)
    await expect(tasks.getByTestId(`trip-task-due-${STEP}`)).toBeVisible()
    await expect(tasks.getByTestId(`trip-task-entry-${STEP}`)).toHaveText(ENTRY)

    await openDayPlan(page)
    await chooseDay(page, THIRD)
    await timelineLines(page).filter({ hasText: ENTRY }).getByRole('button').first().click()
    await page.getByTestId('day-entry-remove').click()
    await page
      .getByTestId('day-entry-remove-confirm')
      .getByRole('button', { name: /delete entry/i })
      .click()
    await expect(timelineLines(page).filter({ hasText: ENTRY })).toHaveCount(0)
    await writesLanded(page)

    await openTripView(page, 'tasks')
    await expect(visiblePage(page).getByTestId(`trip-task-${STEP}`)).toHaveCount(0)
  })

  /**
   * E2E-M29-27: a step can be set to a day of its own instead of a lead. It is due that
   * day, lists on the plan then, and does not move when the entry's day is changed.
   */
  test('E2E-M29-27: a step on a day of its own lists on that day and stays put', async ({
    page,
  }) => {
    const sheet = await openNewEntry(page)
    await sheet.getByTestId('day-entry-prep-add').click()
    const step = page.getByTestId('day-entry-prep-sheet')
    await fillIonic(step.getByTestId('day-entry-prep-title'), STEP)
    await step.getByTestId('day-entry-prep-lead-choice-day').click()
    await setDateField(page, 'day-entry-prep-day', SECOND)
    await step.getByTestId('day-entry-prep-save').click()
    await expect(step.getByTestId('day-entry-prep-save')).toHaveCount(0)
    await expect(sheet.getByTestId(`day-entry-prep-lead-${STEP}`)).toHaveText('On a day')
    await writesLanded(page)
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    await chooseDay(page, SECOND)
    const stepLine = timelineLines(page).filter({ hasText: STEP })
    await expect(stepLine).toContainText(ENTRY)
  })
})
