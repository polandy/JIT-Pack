import { test, expect, createTripViaWizard, fillIonic, writesLanded } from '../fixtures'
import {
  chooseDay,
  dayFromToday,
  dayPlan,
  openConnectionSheet,
  openDayPlan,
  pasteLink,
  timelineLines,
} from '../helpers/m29'
import { SBB_TRIP_LINK } from '../../src/planner/domain/__tests__/sbbFixture'

/**
 * M29's connections (UI-Test-Spec §29, FR-29.18, ADR-086). Local Mode: the
 * SBB's full link is read in the browser, so no server is needed; the short
 * link, which only the server can follow, is `server/connections.spec.ts`.
 *
 * The fixture is a real shared connection on Sa., 10.10.2026, so the trip
 * that holds it has fixed dates around that day.
 */

const CONNECTION_DAY = '2026-10-10'
const TITLE = 'Samedan → Bern, Cäcilienstrasse'

test.describe('M29 connections @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M29-05: an SBB link pasted into the field is read at once, without a
   * button: the sheet says how many legs it read and lists them, and its
   * button names the day the link names — another day than the one chosen.
   * Written, the connection stands on that day at its first departure with
   * its arrival, lines and changes; ▸ opens its legs in place, with the link
   * to the SBB app.
   */
  test('E2E-M29-05: a pasted SBB link is read at once and lands on the day it names', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Engadin Herbst',
      startDate: '2026-10-08',
      endDate: '2026-10-12',
      travelers: ['Andy'],
    })
    const plan = await openDayPlan(page)
    await chooseDay(page, '2026-10-08')

    const sheet = await openConnectionSheet(page)
    await expect(sheet).toContainText('Share the connection in the SBB app')
    await expect(sheet.getByTestId('day-entry-hand')).toBeVisible()
    await pasteLink(sheet, SBB_TRIP_LINK)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText('✓ 5 legs read.')
    await expect(sheet.getByTestId('day-entry-hand')).toHaveCount(0)
    const legs = sheet.getByTestId('day-entry-legs').getByTestId('connection-leg')
    await expect(legs).toHaveCount(5)
    await expect(legs.first()).toContainText('10:58')
    await expect(legs.first()).toContainText('RE 3')
    await expect(legs.first()).toContainText('Samedan → Landquart')
    await expect(legs.nth(3).getByRole('img', { name: 'Walk' })).toBeVisible()
    const save = sheet.getByTestId('day-entry-save')
    await expect(save).toHaveText(/Add on .*10/)
    await save.click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    // The plan follows the connection to its day.
    await expect(plan.getByTestId(`m29-day-${CONNECTION_DAY}`)).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const line = timelineLines(page).filter({ hasText: TITLE })
    await expect(line).toHaveAttribute('data-kind', 'connection')
    await expect(line).toContainText('10:58')
    await expect(line).toContainText('Connection')
    await expect(line).toContainText('arr. 15:46 · RE 3, IC 3, IC 1, T 6 · 3 changes')
    await expect(line.getByTestId('connection-leg')).toHaveCount(0)

    const toggle = line.locator('[data-testid^="m29-legs-toggle-"]')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(line.getByTestId('connection-leg')).toHaveCount(5)
    await expect(line.getByTestId('connection-leg').last()).toContainText(
      'Bern, Bahnhof → Bern, Cäcilienstrasse',
    )
    await expect(line.getByTestId('connection-open-link')).toHaveAttribute('href', SBB_TRIP_LINK)
    await toggle.click()
    await expect(line.getByTestId('connection-leg')).toHaveCount(0)
    await writesLanded(page)
  })

  /**
   * E2E-M29-06: a connection whose link names a day the trip does not have
   * is written there all the same and listed *Outside the trip*; tapped, it
   * opens as *Edit connection* with its legs, and is deleted from there.
   */
  test('E2E-M29-06: a connection outside the trip is listed there, opened and deleted', async ({
    page,
  }) => {
    await createTripViaWizard(page, {
      name: 'Später',
      startDate: dayFromToday(30),
      endDate: dayFromToday(32),
      travelers: ['Andy'],
    })
    const plan = await openDayPlan(page)
    const sheet = await openConnectionSheet(page)
    await pasteLink(sheet, SBB_TRIP_LINK)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText('✓ 5 legs read.')
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    await expect(plan.getByTestId('m29-outside')).toContainText('1')
    const row = plan.locator('[data-testid^="m29-outside-"]').filter({ hasText: TITLE })
    await row.click()
    const edit = page.getByTestId('day-entry')
    await expect(edit.getByTestId('day-entry-title')).toHaveText('Edit connection')
    await expect(edit.getByTestId('day-entry-kinds')).toHaveCount(0)
    await expect(edit.getByTestId('day-entry-legs').getByTestId('connection-leg')).toHaveCount(5)
    await edit.getByTestId('day-entry-remove').click()
    await page
      .getByTestId('day-entry-remove-confirm')
      .getByRole('button', { name: /delete entry/i })
      .click()
    await expect(plan.getByTestId('m29-outside')).toHaveCount(0)
  })

  /**
   * E2E-M29-07: a link no reader knows says so and leaves the hand fields,
   * with the link kept: one leg by hand — an arrival before its departure is
   * the next morning's — stands on the chosen day, opens with the link, and
   * is changed through the same fields.
   */
  test('E2E-M29-07: an unknown link leaves the hand fields, and the link is kept', async ({
    page,
  }) => {
    const first = dayFromToday(30)
    await createTripViaWizard(page, {
      name: 'Sardinien',
      startDate: first,
      endDate: dayFromToday(33),
      travelers: ['Andy'],
    })
    await openDayPlan(page)
    const sheet = await openConnectionSheet(page)
    const link = 'https://www.trenitalia.com/it/biglietto.html'
    await pasteLink(sheet, link)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText(
      'I can’t read this link – please enter it by hand.',
    )
    const save = sheet.getByTestId('day-entry-save')
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    await fillIonic(sheet.getByTestId('day-entry-hand-from'), 'Olbia')
    await fillIonic(sheet.getByTestId('day-entry-hand-to'), 'Civitavecchia')
    await sheet.getByTestId('day-entry-hand-dep').locator('input').fill('22:30')
    await sheet.getByTestId('day-entry-hand-arr').locator('input').fill('06:45')
    await fillIonic(sheet.getByTestId('day-entry-hand-line'), 'Fähre')
    await expect(save).toHaveText('Add')
    await save.click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    const line = timelineLines(page).filter({ hasText: 'Olbia → Civitavecchia' })
    await expect(line).toContainText('22:30')
    await expect(line).toContainText('arr. 06:45 (+1) · Fähre · direct')
    await line.locator('[data-testid^="m29-legs-toggle-"]').click()
    await expect(line.getByTestId('connection-open-link')).toHaveAttribute('href', link)

    await line.getByRole('button').first().click()
    const edit = page.getByTestId('day-entry')
    await expect(edit.getByTestId('day-entry-title')).toHaveText('Edit connection')
    await expect(edit.getByTestId('day-entry-hand-from').locator('input')).toHaveValue('Olbia')
    await edit.getByTestId('day-entry-hand-arr').locator('input').fill('07:10')
    await edit.getByTestId('day-entry-save').click()
    await expect(line).toContainText('arr. 07:10 (+1)')
    await expect(dayPlan(page).getByTestId(`m29-day-${first}`)).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  /**
   * E2E-M29-08: the clipboard button reads the clipboard and the link in it
   * at once. Chromium alone lets a test grant the clipboard permission.
   */
  test('E2E-M29-08: the clipboard button pastes and reads the link', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'only Chromium grants a test the clipboard')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await createTripViaWizard(page, {
      name: 'Engadin Herbst',
      startDate: '2026-10-09',
      endDate: '2026-10-11',
      travelers: ['Andy'],
    })
    await openDayPlan(page)
    await page.evaluate((text) => navigator.clipboard.writeText(text), SBB_TRIP_LINK)
    const sheet = await openConnectionSheet(page)
    await sheet.getByTestId('day-entry-paste').click()
    await expect(sheet.getByTestId('day-entry-link').locator('input')).toHaveValue(SBB_TRIP_LINK)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText('✓ 5 legs read.')
  })
})
