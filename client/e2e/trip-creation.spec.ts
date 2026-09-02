import { test, expect, expectTripOpen } from './fixtures'
import { createTripViaWizard, setDateField } from './fixtures'
import type { Locator } from '@playwright/test'
import { PATH } from './routes'

/**
 * M3 — Trip Creation Wizard, Local Mode.
 *
 * The first data-producing unit of the suite (dev-docs/e2e-tests.md).
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
// on the name alone — since FR-2.1b the year is the only required
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

  // A name is now the whole gate — no date is required to leave step 1.
  await page.getByTestId('wizard-name').locator('input').fill(TRIP.name)
  await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')

  // FR-2.1c: the dates are optional and therefore folded away.
  await page.getByTestId('wizard-more').click()
  await setDateField(page, 'wizard-start-date', '2026-09-13')
  await setDateField(page, 'wizard-end-date', '2026-09-20')

  // ADR-035 (UX-6): the field renders the locale display through formatDay,
  // never the ISO string its state holds — the picked day proves the picker
  // wrote through, the wording proves the browser no longer owns the text.
  await expect(page.getByTestId('wizard-start-date').locator('input')).toHaveValue('Sep 13, 2026')

  // FR-2.1a: duration is derived from the dates, never entered — and it
  // counts both endpoints, so the 13th to the 20th is 8 travel days.
  await expect(page.getByTestId('wizard-step-1')).toContainText('Duration: 8 days')

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
  await page.getByTestId('wizard-more').click()
  await setDateField(page, 'wizard-end-date', TRIP.endDate)
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
  await page.getByTestId('wizard-more').click()
  await setDateField(page, 'wizard-end-date', TRIP.endDate)
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
  await page.getByTestId('wizard-more').click()
  await setDateField(page, 'wizard-end-date', TRIP.endDate)
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
  await page.getByTestId('wizard-item-search').locator('input').press('Enter')
  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
})

// E2E-M3-20 (FR-2.1d): a trip whose end precedes its start is not a state M3
// rejects — it is one the calendar never offers. Asserted on the picker
// itself rather than on a refused submit: the bound is the mechanism, and a
// message the user has to read is the fallback the mechanism removes.
test('E2E-M3-20: the end picker offers no day before the start already set @local @m3', async ({
  page,
  seedMode,
}) => {
  await seedMode({ mode: 'local' })
  await page.goto(PATH.newTrip)
  await expect(page.getByTestId('wizard-step-1')).toBeVisible()
  await page.getByTestId('wizard-more').click()

  await setDateField(page, 'wizard-start-date', '2026-09-10')
  await setDateField(page, 'wizard-end-date', '2026-09-20')

  // Re-opened rather than opened: a picker with a value opens on that value's
  // month, so the grid under test is the same one on any day of any year —
  // an empty picker opens on *today* and the case would rot with the calendar.
  await page.getByTestId('wizard-end-date').click()
  const picker = page.getByTestId('wizard-end-date-picker')
  await expect(picker).toBeVisible()
  const september = picker.locator(
    '.calendar-month:nth-child(2) .calendar-day[data-month="9"][data-year="2026"]',
  )

  // Both halves: a day before the start is out of reach, one after it is not.
  // "Everything is disabled" would pass the first assertion on its own.
  await expect(september.filter({ hasText: /^5$/ })).toBeDisabled()
  await expect(september.filter({ hasText: /^15$/ })).toBeEnabled()
})
