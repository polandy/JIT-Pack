import { test, expect, expectTripOpen } from './fixtures'
import { createTripViaWizard, setDateRange, visiblePage, writesLanded } from './fixtures'
import type { Locator } from '@playwright/test'
import { PATH } from './routes'

/**
 * M3 — Trip Creation Wizard, Local Mode.
 *
 * The first data-producing unit of the suite (dev-docs/e2e-ledger/).
 * Everything downstream needs a trip, and per spec §2.4 a trip must be
 * created through the app's own mutation path rather than injected — so
 * this unit both covers M3 and provides `createTripViaWizard` as the
 * seed helper the later units build on.
 *
 * Local Mode is deliberate: it exercises the full cascade (wizard →
 * orchestrator → IndexedDB → M4 render) with no backend, which is also
 * the strictest check that generation really runs client-side (ADR-008).
 */

const TRIP = { name: 'Engadin 2026', endDate: '2026-09-20' }

/**
 * `ion-button` is a custom element, not a native control, so Playwright's
 * toBeDisabled/toBeEnabled do not apply to it — toBeEnabled passes even on
 * a visibly disabled button, which would make every "now it's enabled"
 * assertion silently vacuous. Assert the ARIA state instead, which is also
 * what actually reaches assistive tech. The enabled direction is always
 * paired with a click that must advance the wizard, so it has a positive
 * signal rather than only the absence of a negative one.
 */
async function expectBlocked(button: Locator) {
  await expect(button).toHaveAttribute('aria-disabled', 'true')
}

// E2E-M3-01 (FR-2.1/2.1a/2.1b): step 1 takes the metadata, Next is gated
// on the name alone — under FR-2.1b the year is the only required
// temporal fact and it arrives preselected — and the duration is computed
// from the dates when both are given.
test('E2E-M3-01: step 1 gates Next on the name, and derives the duration @local @m3', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)

  await expect(page.getByTestId('wizard-step-1')).toBeVisible()

  // Nothing entered yet → the step is invalid and cannot be left.
  await expectBlocked(page.getByTestId('wizard-next'))

  // The year needs no input: it opens on the current one (FR-2.1b).
  await expect(page.getByTestId('wizard-year')).toContainText(String(new Date().getFullYear()))

  // A name is the whole gate — no date is required to leave step 1.
  await page.getByTestId('wizard-name').locator('input').fill(TRIP.name)
  await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')

  // FR-2.1c: the dates are optional but open — no fold to get past.
  await setDateRange(page, 'wizard-dates', { start: '2026-09-13', end: '2026-09-20' })

  // ADR-035 (UX-6): the field renders the locale display through
  // formatDayRange, never the ISO strings its state holds — the picked days
  // prove the picker wrote through, the wording proves the browser does not
  // own the text.
  await expect(page.getByTestId('wizard-dates-value')).toHaveText('13–20 Sept 2026')

  // FR-2.1a: duration is derived from the dates, never entered — and it
  // counts both endpoints, so the 13th to the 20th is 8 travel days.
  await expect(page.getByTestId('wizard-dates-days')).toHaveText('8 days')

  // Positive signal that the gate opened: the wizard actually advances.
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
})

// E2E-M3-14 (FR-2.5a): the household's default travellers are configured
// once in M17 and are already in the wizard afterwards — as a starting
// point, so removing one there is still a normal edit.
test('E2E-M3-14: the wizard starts with the configured default travellers @local @m3 @m17', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.settings)

  for (const name of ['Andy', 'Sia', 'Leonardo']) {
    await page.getByTestId('default-traveler-input').locator('input').fill(name)
    await page.getByTestId('default-traveler-add').click()
    await expect(page.getByTestId(`default-traveler-remove-${name}`)).toBeVisible()
  }

  await page.goto(PATH.newTrip)
  await page.getByTestId('wizard-name').locator('input').fill('Samedan')
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  const names = page.getByTestId('wizard-traveler-name')
  await expect(names).toHaveCount(3)
  await expect(names.first().locator('input')).toHaveValue('Andy')

  // A starting point, not a rule: the trip may drop one.
  await page.getByTestId('wizard-traveler-remove').first().click()
  await expect(page.getByTestId('wizard-traveler-name')).toHaveCount(2)
})

// E2E-M3-03 (FR-2.5): step 2 adds travelers, and an unnamed traveler
// blocks the step — the same validation shape as step 1's name.
test('E2E-M3-03: step 2 requires every added traveler to be named @local @m3', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)

  await page.getByTestId('wizard-name').locator('input').fill(TRIP.name)
  await setDateRange(page, 'wizard-dates', { end: TRIP.endDate })
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-2')).toBeVisible()

  // An added-but-unnamed traveler blocks the step.
  await page.getByTestId('wizard-add-traveler').click()
  await expectBlocked(page.getByTestId('wizard-next'))

  // A traveler is a name and nothing else — the Adult/Child type went
  // with FR-25.9 (migration 018). The name field above is the positive
  // signal that the row itself rendered, so this absence is real.
  await expect(page.getByTestId('wizard-traveler-name')).toBeVisible()
  await expect(page.locator('ion-segment')).toHaveCount(0)

  await page.getByTestId('wizard-traveler-name').locator('input').fill('Alex')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
})

// E2E-M3-05 (FR-17.3/FR-19.3/G-8): Local Mode has no second account, so
// the sharing part of step 2 must not render at all — a mode may hide a
// control, never show one that cannot work.
test('E2E-M3-05: local mode hides the sharing section @local @m3 @g8', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)

  await page.getByTestId('wizard-name').locator('input').fill(TRIP.name)
  await setDateRange(page, 'wizard-dates', { end: TRIP.endDate })
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  // The traveler part is present, so this is a real absence, not an
  // assertion against a step that failed to render.
  await expect(page.getByTestId('wizard-add-traveler')).toBeVisible()
  await expect(page.getByTestId('wizard-step-2')).not.toContainText('Share with')
})

// E2E-M3-10 (FR-2.4) + E2E-M1-05 (G-7): the whole path from the dashboard
// empty-state CTA through all four steps to a persisted trip, no backend.
test('E2E-M1-05, E2E-M3-10: M3: the dashboard CTA leads through the wizard to a created trip @local @m3 @m1', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto('/')

  // G-7: a fresh Local Mode offers exactly one way forward.
  await expect(page.getByTestId('dashboard-empty')).toBeVisible()
  await page.getByTestId('dashboard-plan-trip').click()
  await expect(page.getByTestId('wizard-step-1')).toBeVisible()

  await page.getByTestId('wizard-name').locator('input').fill(TRIP.name)
  await setDateRange(page, 'wizard-dates', { end: TRIP.endDate })
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('wizard-add-traveler').click()
  await page.getByTestId('wizard-traveler-name').locator('input').fill('Alex')
  await page.getByTestId('wizard-next').click()

  // Step 3 has no templates in a fresh instance — the step stays valid
  // and the trip is simply created empty.
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()

  // The cascade committed and M4 opened on the new trip. Since
  // ADR-011 the trip name is the one header bar's title, not M4's own.
  await expect(page).toHaveURL(/\/trips\/[^/]+$/)
  await expectTripOpen(page, TRIP.name)
  await expect(page.getByTestId('packing-empty')).toBeVisible()
})

// FR-19.2 / NFR-4.11: what Local Mode writes must survive a reload — the
// trip went to IndexedDB, not just to the in-memory store.
test('M3: a trip created in local mode survives a reload @local @m3', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  const tripPath = await createTripViaWizard(page, TRIP)

  // A full boot: the app reloads and rehydrates from persistence alone.
  await page.goto(tripPath)
  await expectTripOpen(page, TRIP.name)
})

// E2E-M3-19 (G-16): Enter in a step's plain field is the step's default
// action — same handler, same gate as the Weiter click. The invalid half
// runs first on the same field with the same key, so the advance that
// follows is the positive proof the keypress was delivered at all;
// "did not advance" alone would be green on a dead handler too.
test('E2E-M3-19: Enter in a plain field is the Weiter click, gated like it @local @m3 @g16', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)
  await expect(page.getByTestId('wizard-step-1')).toBeVisible()

  // Empty name: the gate holds and Enter does nothing, silently.
  const name = page.getByTestId('wizard-name').locator('input')
  await name.press('Enter')
  await expect(page.getByTestId('wizard-step-1')).toBeVisible()

  // The same key on the same field advances once the gate opens.
  await name.fill(TRIP.name)
  await name.press('Enter')
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()

  // Step 2: a traveller name fires the same way.
  await page.getByTestId('wizard-add-traveler').click()
  const traveler = page.getByTestId('wizard-traveler-name').locator('input')
  await traveler.fill('Alex')
  await traveler.press('Enter')
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()

  // Step 3's single-item search owns its Enter (G-16 exemption), so the
  // key must not advance — proven live by the click that then does.
  await page.getByTestId('wizard-item-search').press('Enter')
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
})

// E2E-M3-20 (FR-2.1d): a trip whose end precedes its start is not a state
// M3 rejects — it is one the calendar never produces. With a start already
// set, a tap on an earlier day while the end is awaited becomes the new start
// and leaves the end still to come: asserted on the sheet itself, since the
// rule is the mechanism and a message would be the fallback it removes.
test('E2E-M3-20: an end tapped before the start becomes the start, never an inverted range @local @m3', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)
  await expect(page.getByTestId('wizard-step-1')).toBeVisible()

  await setDateRange(page, 'wizard-dates', { start: '2026-09-10', end: '2026-09-20' })

  // Re-opened rather than opened: a picker with a value scrolls to that
  // value's month, so the case is the same on any day of any year.
  await page.getByTestId('wizard-dates').click()
  const picker = page.getByTestId('wizard-dates-picker')
  await expect(picker).toBeVisible()
  await picker.getByTestId('wizard-dates-end').click()
  await picker.locator('[data-day="2026-09-05"]').click()

  // Both halves: the earlier day is the start now, and the end is open again.
  await expect(picker.getByTestId('wizard-dates-start')).toContainText('5 Sept 2026')
  await expect(picker.getByTestId('wizard-dates-end')).toContainText('—')
  await expect(picker.getByTestId('wizard-dates-hint')).toHaveText('Tap the last day')

  await picker.locator('[data-day="2026-09-15"]').click()
  await picker.getByTestId('wizard-dates-apply').click()
  await expect(page.getByTestId('wizard-dates-value')).toHaveText('5–15 Sept 2026')
})

// E2E-M3-22 (G-17): the create is one act. It writes the whole trip and then
// leaves the screen, and until the route repaints the button is still under
// the finger — so an impatient second press wrote a second trip with the same
// name and the same contents, with nothing on either screen to say so.
test('E2E-M3-22: pressing create twice makes one trip @local @m3', async ({ page, seedMode }) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)

  await page.getByTestId('wizard-name').locator('input').fill(TRIP.name)
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-4')).toBeVisible()

  // Two presses of the same button, as fast as a hand can make them.
  await page.getByTestId('wizard-create').dblclick()

  await expectTripOpen(page, TRIP.name)
  await writesLanded(page)

  // The list is where a second trip would be visible, and it says one.
  await page.goto(PATH.trips)
  await expect(visiblePage(page).getByTestId(`trip-row-${TRIP.name}`)).toHaveCount(1)
})

/**
 * E2E-M3-25 (FR-2.1c, G-16): the dates are filled on step 1 as it opens — the
 * fold is never touched — and the wizard's navigation is one footer pinned
 * above the tab bar at the Pixel 9 Pro's width. Steps of different lengths put
 * content-anchored buttons at different heights, so the same y on every step,
 * with the fold both closed and open, is the claim.
 */
test('E2E-M3-25: dates from step 1, and a footer that stays put on every step @local @m3 @g16 @planner', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto(PATH.newTrip)

  const footer = page.getByTestId('wizard-footer')
  const back = page.getByTestId('wizard-back')
  const tabBar = page.locator('nav.tab-bar')
  const box = async (target: Locator) => {
    const b = await target.boundingBox()
    if (!b) throw new Error('not rendered')
    return b
  }

  // Step 1: the range is open, with the line saying what it is for.
  await expect(page.getByTestId('header-meta')).toHaveText('Step 1 · Trip')
  await expect(page.getByTestId('wizard-dates-hint')).toBeVisible()
  await expect(page.getByTestId('wizard-more-summary')).toHaveText('Series · attributes')
  await page.getByTestId('wizard-name').locator('input').fill(TRIP.name)
  await setDateRange(page, 'wizard-dates', { start: '2026-09-13', end: '2026-09-20' })
  await expect(page.getByTestId('wizard-dates-value')).toHaveText('13–20 Sept 2026')
  // The series stayed folded: the range never went through the fold.
  await expect(page.getByTestId('wizard-series')).toHaveCount(0)

  // The footer sits on the tab bar, and the back square is there but inert.
  const pinned = await box(footer)
  expect(pinned.y + pinned.height).toBeCloseTo((await box(tabBar)).y, 0)
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('aria-disabled', 'true')
  const next = await box(page.getByTestId('wizard-next'))
  expect(next.width).toBeGreaterThan(412 / 2)
  expect(next.y).toBeGreaterThanOrEqual(pinned.y)

  // Opening the fold grows the step; the footer does not move with it.
  await page.getByTestId('wizard-more').click()
  await expect(page.getByTestId('wizard-series')).toBeVisible()
  expect((await box(footer)).y).toBe(pinned.y)
  await page.getByTestId('wizard-more').click()

  const steps = [
    [2, 'Step 2 · Travellers'],
    [3, 'Step 3 · Contents'],
  ] as const
  for (const [n, head] of steps) {
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId(`wizard-step-${n}`)).toBeVisible()
    await expect(page.getByTestId('header-meta')).toHaveText(head)
    expect((await box(footer)).y).toBe(pinned.y)
    await expect(back).not.toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('wizard-next')).toBeInViewport({ ratio: 1 })
  }

  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('header-meta')).toHaveText('Step 4 · Quantities')
  expect((await box(footer)).y).toBe(pinned.y)
  const create = page.getByTestId('wizard-create')
  await expect(create).toBeInViewport({ ratio: 1 })
  expect((await box(create)).y).toBeGreaterThanOrEqual(pinned.y)
  await create.click()

  await expectTripOpen(page, TRIP.name)
  // The day plan's pill exists only on a trip with both dates (FR-29.7).
  await expect(page.getByTestId('trip-view-dayplan')).toBeVisible()
})
