import type { Locator, Page } from '@playwright/test'

import { test, expect, createTripViaWizard, fillIonic, writesLanded } from '../fixtures'
import { stubTiles } from '../helpers/m28'
import {
  addDayEntry,
  chooseDay,
  connectionTaken,
  dayFromToday,
  dayPlan,
  openConnectionStep,
  openLinkStep,
  openDayPlan,
  pasteLink,
  timelineLines,
  typeStop,
  wayByHand,
} from '../helpers/m29'
import { stubTimetable, type StubRun, type StubStop } from '../helpers/timetable'
import { SBB_TRIP_LINK } from '../../src/planner/domain/__tests__/sbbFixture'

/**
 * M29's connections (UI-Test-Spec §29, FR-29.18, ADR-086): what an entry of
 * the day plan carries, found in a step of its own — the timetable, a shared
 * link or the hand fields. Local Mode: the SBB's full link is read in the
 * browser, so no server is needed; the short link, which only the server can
 * follow, is `server/connections.spec.ts`.
 *
 * The link fixture is a real shared connection on Sa., 10.10.2026, so the
 * trip that holds it has fixed dates around that day.
 */

const CONNECTION_DAY = '2026-10-10'
const ROUTE = 'Samedan → Bern, Cäcilienstrasse'

/** Lake Lucerne, where the stub's stops lie — and how far each is from the device. */
const LUZERN_BAHNHOF: StubStop = {
  id: '8508450',
  name: 'Luzern, Bahnhof',
  lat: 47.05074,
  lon: 8.310247,
  distance: 180,
}
const SCHWANENPLATZ: StubStop = {
  id: '8508451',
  name: 'Luzern, Schwanenplatz',
  lat: 47.0525,
  lon: 8.3093,
  distance: 320,
}
const KANTONALBANK: StubStop = {
  id: '8589801',
  name: 'Luzern, Kantonalbank',
  lat: 47.048855,
  lon: 8.306229,
  distance: 410,
}
const HERGISWIL: StubStop = {
  id: '8508261',
  name: 'Hergiswil Matt',
  lat: 46.9905,
  lon: 8.3025,
  distance: 6200,
}
const LUZERN: StubStop = { id: '8505000', name: 'Luzern', lat: 47.050165, lon: 8.310172 }
const HORW: StubStop = { id: '8505016', name: 'Horw', lat: 47.0177, lon: 8.3086 }

/** The S 4 every half hour from 08:06, the first a call at Horw on the way. */
function runsToHergiswil(from = 'Luzern'): StubRun[] {
  return ['08', '08', '09', '09', '10', '10', '11', '11'].map((hour, i) => {
    const minute = i % 2 === 0 ? '06' : '36'
    const arrive = i % 2 === 0 ? '31' : '01'
    const arriveHour = i % 2 === 0 ? hour : String(Number(hour) + 1).padStart(2, '0')
    return {
      from,
      to: 'Hergiswil Matt',
      dep: `${hour}:${minute}`,
      arr: `${arriveHour}:${arrive}`,
      category: 'S',
      number: '4',
      via: ['Horw'],
    }
  })
}

/** A trip four weeks ahead, its first day chosen; ends on the day plan. */
async function tripAhead(page: Page): Promise<Locator> {
  await createTripViaWizard(page, {
    name: 'Zentralschweiz',
    startDate: dayFromToday(30),
    endDate: dayFromToday(33),
    travelers: ['Andy'],
  })
  return openDayPlan(page)
}

test.describe('M29 connections @local @planner', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M29-05: an SBB link pasted into the link step is read at once,
   * without a button: the step says how many legs it read and shows them,
   * and *Take* brings the connection to the entry, which then names where it
   * goes and that it moves to the link's day. Written, the plan follows it
   * there; the line carries the connection under its title, and ▸ opens the
   * legs in place, with the link to the SBB app.
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

    const sheet = await openConnectionStep(page)
    await openLinkStep(sheet)
    await expect(sheet.getByTestId('connection-step-sub')).toContainText(
      'share the connection and copy the link',
    )
    const take = sheet.getByTestId('connection-take')
    await expect(take).toHaveAttribute('aria-disabled', 'true')
    await pasteLink(sheet, SBB_TRIP_LINK)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText('✓ 5 legs read.')
    await sheet.getByTestId('day-entry-legs-toggle').click()
    const legs = sheet.getByTestId('day-entry-legs').getByTestId('connection-leg')
    await expect(legs).toHaveCount(5)
    await expect(legs.first()).toContainText('10:58')
    await expect(legs.first()).toContainText('RE 3')
    await expect(legs.first()).toContainText('Samedan → Landquart')
    await expect(legs.nth(3).getByRole('img', { name: 'Walk' })).toBeVisible()
    await take.click()

    await expect(sheet.getByTestId('day-entry-name').locator('input')).toHaveValue(
      'To Bern, Cäcilienstrasse',
    )
    await expect(sheet.getByTestId('day-entry-moves')).toHaveText(
      /^On .*10.* – the entry moves with it\.$/,
    )
    await expect(sheet.getByTestId('day-entry-save')).toHaveText('Add')
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    // The plan follows the connection to its day.
    await expect(plan.getByTestId(`m29-day-${CONNECTION_DAY}`)).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const line = timelineLines(page).filter({ hasText: 'To Bern, Cäcilienstrasse' })
    await expect(line).toHaveAttribute('data-kind', 'connection')
    await expect(line).toContainText('10:58')
    await expect(line).toContainText(`${ROUTE} · arr. 15:46 · RE 3, IC 3, IC 1, T 6 · 3 changes`)
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
   * E2E-M29-06: an entry whose connection's link names a day the trip does
   * not have is written there all the same and listed *Outside the trip*;
   * tapped, it opens as *Edit entry* with its connection, and is deleted
   * from there.
   */
  test('E2E-M29-06: a connection outside the trip is listed there, opened and deleted', async ({
    page,
  }) => {
    const plan = await tripAhead(page)
    const sheet = await openConnectionStep(page)
    await openLinkStep(sheet)
    await pasteLink(sheet, SBB_TRIP_LINK)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText('✓ 5 legs read.')
    await sheet.getByTestId('connection-take').click()
    await connectionTaken(sheet)
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    await expect(plan.getByTestId('m29-outside')).toContainText('1')
    const row = plan
      .locator('[data-testid^="m29-outside-"]')
      .filter({ hasText: 'To Bern, Cäcilienstrasse' })
    await row.click()
    const edit = page.getByTestId('day-entry')
    await expect(edit.getByTestId('day-entry-title')).toHaveText('Edit entry')
    await edit.getByTestId('day-entry-legs-toggle').click()
    await expect(edit.getByTestId('day-entry-legs').getByTestId('connection-leg')).toHaveCount(5)
    await edit.getByTestId('day-entry-remove').click()
    await page
      .getByTestId('day-entry-remove-confirm')
      .getByRole('button', { name: /delete entry/i })
      .click()
    await expect(plan.getByTestId('m29-outside')).toHaveCount(0)
  })

  /**
   * E2E-M29-07: a link no reader knows says so, keeps *Take* off and offers
   * the hand fields with the link kept: one leg by hand — an arrival before
   * its departure is the next morning's — stands on the chosen day, opens
   * with the link, and is changed through the same fields.
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
    const sheet = await openConnectionStep(page)
    await openLinkStep(sheet)
    const link = 'https://www.trenitalia.com/it/biglietto.html'
    await pasteLink(sheet, link)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText(
      'I can’t read this link – please enter it by hand.',
    )
    await expect(sheet.getByTestId('connection-take')).toHaveAttribute('aria-disabled', 'true')
    await sheet.getByTestId('connection-link-to-hand').click()
    await expect(sheet.getByTestId('day-entry-kept-link')).toHaveText(link)
    const take = sheet.getByTestId('connection-take')
    await expect(take).toHaveAttribute('aria-disabled', 'true')
    await fillIonic(sheet.getByTestId('day-entry-hand-from'), 'Olbia')
    await fillIonic(sheet.getByTestId('day-entry-hand-to'), 'Civitavecchia')
    await sheet.getByTestId('day-entry-hand-dep').locator('input').fill('22:30')
    await sheet.getByTestId('day-entry-hand-arr').locator('input').fill('06:45')
    await fillIonic(sheet.getByTestId('day-entry-hand-line'), 'Fähre')
    await take.click()
    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)

    const line = timelineLines(page).filter({ hasText: 'To Civitavecchia' })
    await expect(line).toContainText('22:30')
    await expect(line).toContainText('Olbia → Civitavecchia · arr. 06:45 (+1) · Fähre · direct')
    await line.locator('[data-testid^="m29-legs-toggle-"]').click()
    await expect(line.getByTestId('connection-open-link')).toHaveAttribute('href', link)

    await line.getByRole('button').first().click()
    const edit = page.getByTestId('day-entry')
    await expect(edit.getByTestId('day-entry-title')).toHaveText('Edit entry')
    await edit.getByTestId('day-entry-connection-change').click()
    await edit.getByTestId('connection-via-hand').click()
    await expect(edit.getByTestId('day-entry-hand-from').locator('input')).toHaveValue('Olbia')
    await edit.getByTestId('day-entry-hand-arr').locator('input').fill('07:10')
    await edit.getByTestId('connection-take').click()
    await connectionTaken(edit)
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
    const sheet = await openConnectionStep(page)
    await openLinkStep(sheet)
    await sheet.getByTestId('day-entry-paste').click()
    await expect(sheet.getByTestId('day-entry-link').locator('input')).toHaveValue(SBB_TRIP_LINK)
    await expect(sheet.getByTestId('day-entry-read-state')).toHaveText('✓ 5 legs read.')
  })

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true, viewport: { width: 412, height: 800 } })

    /**
     * E2E-M29-14: an entry written without a connection gains one later. The
     * step lists connections as soon as both stops stand — no button — and
     * the one tapped goes back to the entry, its own title and time left as
     * they were. The line keeps both and carries the connection under them;
     * *Remove* takes it off again and leaves the entry.
     *
     * The buttons are touched, on a phone: the click a browser makes of a
     * touch follows it, and a sheet that shrank under the finger in between
     * would take that click on its backdrop and close. The entry's time is
     * typed on the 24-hour clock, its hour of one digit taking its zero.
     */
    test('E2E-M29-14: an entry gains a connection later, keeps its own title and time, and loses it again', async ({
      page,
    }) => {
      await stubTimetable(page, [LUZERN, HERGISWIL], runsToHergiswil())
      await tripAhead(page)
      await addDayEntry(page, { title: 'Glasi Hergiswil', time: '930' })
      const line = timelineLines(page).filter({ hasText: 'Glasi Hergiswil' })
      await expect(line).toContainText('09:30')
      await expect(line).toHaveAttribute('data-kind', 'entry')

      await line.getByRole('button').first().tap()
      const sheet = page.getByTestId('day-entry')
      await sheet.getByTestId('day-entry-add-connection').tap()
      await expect(sheet.getByTestId('connection-step-title')).toHaveText('Train connection')
      await expect(sheet.getByTestId('connection-step-sub')).toContainText('For “Glasi Hergiswil”')
      await typeStop(sheet, 'from', 'Luzern')
      await typeStop(sheet, 'to', 'Hergiswil Matt')
      await expect(sheet.getByTestId('timetable-result-0')).toContainText('08:06 → 08:31')
      await sheet.getByTestId('timetable-result-0').tap()

      await expect(sheet.getByTestId('day-entry-connection')).toContainText('08:06 → 08:31')
      await expect(sheet.getByTestId('day-entry-name').locator('input')).toHaveValue(
        'Glasi Hergiswil',
      )
      await expect(sheet.getByTestId('day-entry-time').locator('input')).toHaveValue('09:30')
      await expect(sheet.getByTestId('day-entry-filled')).toHaveCount(0)
      await sheet.getByTestId('day-entry-save').tap()
      await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
      await expect(line).toHaveAttribute('data-kind', 'connection')
      await expect(line).toContainText('09:30')
      await expect(line).toContainText('Luzern → Hergiswil Matt · arr. 08:31 · S 4 · direct')

      await line.getByRole('button').first().tap()
      await sheet.getByTestId('day-entry-connection-remove').tap()
      await expect(sheet.getByTestId('day-entry-connection')).toHaveCount(0)
      await expect(sheet.getByTestId('day-entry-add-connection')).toBeVisible()
      await sheet.getByTestId('day-entry-save').tap()
      await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
      await expect(line).toHaveAttribute('data-kind', 'entry')
      await expect(line).toContainText('Glasi Hergiswil')
      await expect(line).not.toContainText('Hergiswil Matt')
      await writesLanded(page)
    })
  })

  /**
   * E2E-M29-15: on a new entry with nothing typed, a connection fills *What*
   * and *Time*, each marked as filled from it; typing into *What* keeps the
   * typed title and drops its mark, and *Remove* empties the time again but
   * not the title. In the step, ⇅ swaps the stops and the results follow,
   * *Later ›* adds later connections, and ‹ leaves with nothing taken.
   */
  test('E2E-M29-15: a connection fills what the entry leaves empty, and the step swaps, pages and goes back', async ({
    page,
  }) => {
    await stubTimetable(
      page,
      [LUZERN, HERGISWIL],
      [
        ...runsToHergiswil(),
        {
          from: 'Hergiswil Matt',
          to: 'Luzern',
          dep: '17:04',
          arr: '17:29',
          category: 'S',
          number: '4',
        },
      ],
      { byTime: true },
    )
    await tripAhead(page)
    const sheet = await openConnectionStep(page)
    await expect(sheet.getByTestId('connection-step-sub')).toContainText('For “New entry”')
    await typeStop(sheet, 'from', 'Luzern')
    await typeStop(sheet, 'to', 'Hergiswil Matt')
    const results = sheet.locator('[data-testid^="timetable-result-"]')
    await expect(results).toHaveCount(6)
    await sheet.getByTestId('timetable-later').click()
    await expect(results).toHaveCount(8)
    await expect(results.last()).toContainText('11:36 → 12:01')

    await sheet.getByTestId('timetable-swap').click()
    await expect(sheet.getByTestId('timetable-from').locator('input')).toHaveValue('Hergiswil Matt')
    await expect(results).toHaveCount(1)
    await expect(results.first()).toContainText('17:04 → 17:29')
    await sheet.getByTestId('timetable-swap').click()
    await expect(results).toHaveCount(6)

    // ‹ goes back to the entry with nothing taken.
    await sheet.getByTestId('connection-step-back').click()
    await expect(sheet.getByTestId('day-entry-add-connection')).toBeVisible()
    await expect(sheet.getByTestId('day-entry-connection')).toHaveCount(0)

    await sheet.getByTestId('day-entry-add-connection').click()
    await sheet.getByTestId('timetable-result-1').click()
    await connectionTaken(sheet)
    const name = sheet.getByTestId('day-entry-name').locator('input')
    const time = sheet.getByTestId('day-entry-time').locator('input')
    await expect(name).toHaveValue('To Hergiswil Matt')
    await expect(sheet.getByTestId('day-entry-filled')).toHaveText('from the connection')
    await expect(time).toHaveValue('08:36')
    await expect(sheet.getByTestId('day-entry-time-filled')).toBeVisible()

    await fillIonic(sheet.getByTestId('day-entry-name'), 'Glasi')
    await expect(sheet.getByTestId('day-entry-filled')).toHaveCount(0)
    await sheet.getByTestId('day-entry-connection-remove').click()
    await expect(time).toHaveValue('')
    await expect(name).toHaveValue('Glasi')
  })

  /**
   * E2E-M29-16: *My location* sets *From* to the stop nearest the device,
   * with its distance, and offers the three nearest, that one pressed; each
   * connection opens with the walk to it, and the connection taken begins
   * with that walk from *My location*. The position is planted through the
   * browser context.
   */
  test('E2E-M29-16: from where one is, to the nearest stop and on', async ({ page }) => {
    await page.context().grantPermissions(['geolocation'])
    await page.context().setGeolocation({ latitude: 47.0512, longitude: 8.3092 })
    const stub = await stubTimetable(
      page,
      [LUZERN_BAHNHOF, SCHWANENPLATZ, KANTONALBANK, HERGISWIL],
      runsToHergiswil('Luzern, Bahnhof'),
    )
    await tripAhead(page)
    const sheet = await openConnectionStep(page, 'Glasi Hergiswil')
    await typeStop(sheet, 'to', 'Hergiswil Matt')
    await sheet.getByTestId('timetable-here').click()

    await expect(sheet.getByTestId('timetable-from').locator('input')).toHaveValue(
      'Luzern, Bahnhof',
    )
    await expect(sheet.getByTestId('timetable-here-distance')).toHaveText('180 m from you')
    const near = sheet.getByTestId('timetable-near').locator('[data-testid^="timetable-near-"]')
    await expect(near).toHaveCount(3)
    await expect(sheet.getByTestId('timetable-near-0')).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByTestId('timetable-near-1')).toHaveText('Luzern, Schwanenplatz · 320 m')
    expect(
      stub.asked.some(
        (u) => u.pathname.endsWith('/locations') && u.searchParams.get('x') === '47.0512',
      ),
    ).toBe(true)

    const first = sheet.getByTestId('timetable-result-0')
    await expect(first.getByTestId('timetable-walk')).toHaveText('🚶 3 min · leave at 08:03')
    await first.click()
    await sheet.getByTestId('day-entry-legs-toggle').click()
    const legs = sheet.getByTestId('day-entry-legs').getByTestId('connection-leg')
    await expect(legs).toHaveCount(2)
    await expect(legs.first()).toContainText('08:03')
    await expect(legs.first()).toContainText('My location → Luzern, Bahnhof')
  })

  /**
   * The other half of E2E-M29-16: a position the browser refuses is said in
   * words, and *From* keeps what it held.
   */
  test('a refused position says so and leaves From as it was', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium refuses an ungranted position at once')
    await stubTimetable(page, [LUZERN_BAHNHOF, HERGISWIL], [])
    await tripAhead(page)
    const sheet = await openConnectionStep(page)
    await typeStop(sheet, 'from', 'Luzern')
    await sheet.getByTestId('timetable-here').click()
    await expect(sheet.getByTestId('timetable-message')).toHaveText(
      'Without your location this won’t work – enter the stop.',
    )
    await expect(sheet.getByTestId('timetable-from').locator('input')).toHaveValue('Luzern')
  })

  /**
   * E2E-M29-17: a connection from the timetable is drawn — a small map in
   * the entry's sheet, a line per leg through the stops it calls at, and on
   * a tap the whole screen with the legs beneath. Written, the plan's line
   * opens the same map. A connection entered by hand knows no places and has
   * no map.
   */
  test('E2E-M29-17: a connection from the timetable is drawn on a map; one by hand is not', async ({
    page,
  }) => {
    await stubTiles(page)
    await stubTimetable(page, [LUZERN, HORW, HERGISWIL], runsToHergiswil())
    await tripAhead(page)
    const sheet = await openConnectionStep(page, 'Glasi Hergiswil')
    await typeStop(sheet, 'from', 'Luzern')
    await typeStop(sheet, 'to', 'Hergiswil Matt')
    await sheet.getByTestId('timetable-result-0').click()
    await connectionTaken(sheet)

    const small = sheet.getByTestId('connection-map')
    await expect(small).toBeVisible()
    await expect(small.locator('path.jp-track-line.jp-leg-train')).toHaveCount(1)
    await small.click()
    const full = page.getByTestId('connection-map-full')
    await expect(full.locator('path.jp-track-line.jp-leg-train')).toHaveCount(1)
    await expect(full.getByTestId('connection-map-legend')).toHaveText('Train')
    await expect(full.getByTestId('connection-map-legs').getByTestId('connection-leg')).toHaveCount(
      1,
    )
    await full.getByTestId('connection-map-back').click()
    await expect(full).toBeHidden()

    await sheet.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    const line = timelineLines(page).filter({ hasText: 'Glasi Hergiswil' })
    await line.locator('[data-testid^="m29-map-"]').click()
    await expect(page.getByTestId('connection-map-full')).toBeVisible()
    await page.getByTestId('connection-map-back').click()
    await expect(page.getByTestId('connection-map-full')).toBeHidden()

    const byHand = await openConnectionStep(page, 'Fähre')
    await wayByHand(byHand, { from: 'Olbia', dep: '22:30', to: 'Civitavecchia', arr: '06:45' })
    await expect(byHand.getByTestId('connection-map')).toHaveCount(0)
    await byHand.getByTestId('day-entry-save').click()
    await expect(page.getByTestId('day-entry-save')).toHaveCount(0)
    const ferry = timelineLines(page).filter({ hasText: 'Fähre' })
    await expect(ferry).toHaveAttribute('data-kind', 'connection')
    await expect(ferry.locator('[data-testid^="m29-map-"]')).toHaveCount(0)
  })

  /**
   * E2E-M29-18: offline the step offers no search: it says why and shows the
   * link and the hand fields as its two ways, and a way by hand is taken into
   * the entry. (That a link is read on the device without a network is
   * E2E-M29-05's: Local Mode asks nobody for a full link, and WebKit's
   * offline emulation refuses the stream the reader inflates through.)
   */
  test('E2E-M29-18: without the search, the link and the hand fields are the step', async ({
    page,
  }) => {
    await tripAhead(page)
    await page.context().setOffline(true)
    await dayPlan(page).getByTestId('m29-fab').click()
    const sheet = page.getByTestId('day-entry')
    await expect(sheet.getByTestId('day-entry-add-connection')).toContainText(
      'Paste an SBB link or enter it by hand',
    )
    await sheet.getByTestId('day-entry-add-connection').click()
    await expect(sheet.getByTestId('timetable-search')).toHaveCount(0)
    const ways = sheet.getByTestId('connection-alternatives')
    await expect(ways).toHaveAttribute('data-large', 'true')
    await expect(ways).toContainText('only online and for stops in Switzerland')
    await wayByHand(sheet, { from: 'Olbia', dep: '22:30', to: 'Civitavecchia', arr: '06:45' })
    await expect(sheet.getByTestId('day-entry-connection')).toContainText('22:30 → 06:45')
    await page.context().setOffline(false)
  })
})
