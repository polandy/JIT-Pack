import { test, expect, createTripViaWizard, openQuickAdd } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * The closing pass and the judgement that feeds it (FR-9.3; UI-Spec M4).
 *
 * The asymmetry this unit is about: *missing* stamps itself as a
 * by-product of the quick-add, while *unused* used to cost three taps per
 * row into a fold nothing ever asks for — and *unused* is the input the
 * M14 assistant is built around. Two paths are asserted separately
 * because they are separate promises: the row's press-and-hold, which is
 * the fast one, and the pass at archive time, which is the one point in
 * the lifecycle where the whole trip is in view at once.
 *
 * **Reduced motion is on**, as in skip-item.spec.ts: the production code
 * takes its own no-motion path, so what is asserted is the outcome rather
 * than the length of a transition.
 */
test.use({ reducedMotion: 'reduce' })

const shown = (page: Page) => page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')

async function tripWithRows(page: Page, names: string[]): Promise<string> {
  const path = await createTripViaWizard(page, { name: 'Abschlussprobe', travelers: ['Andy'] })
  for (const name of names) {
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
  return path
}

/** Planning → active. The archive action appearing is the settled signal. */
async function startTrip(page: Page) {
  await page.getByTestId('m4-start').click()
  await expect(page.getByTestId('m4-archive')).toBeVisible()
}

/**
 * `contextmenu` rather than a held pointer, for skip-item.spec.ts's
 * reason: the 500 ms are unit tested in `useLongPress`, and driving a real
 * hold here would be a duration this suite must not depend on.
 */
async function openRowMenu(page: Page, name: string) {
  await page.getByTestId(`m4-row-${name}`).dispatchEvent('contextmenu')
  await expect(page.locator('ion-action-sheet')).toBeVisible()
}

async function chooseInRowMenu(page: Page, label: RegExp) {
  await page.locator('ion-action-sheet').getByRole('button', { name: label }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}

/**
 * Pack a quantity-1 row from the list, without opening M5. A packed row
 * leaves the list (FR-25.2), which is this write's settled signal.
 */
async function packRow(page: Page, name: string) {
  await page.getByTestId(`m4-row-${name}`).getByTestId('row-check').locator('ion-checkbox').click()
  await expect(page.getByTestId(`m4-row-${name}`)).toHaveCount(0)
}

test.describe('FR-9.3 — the trip is judged from the list @local @m4', () => {
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M4-51: the judgement leaves the fold. Before this, the only writer
  // for *unused* was a toggle three taps deep in M5's *Details* block.
  test('E2E-M4-51: a row is marked unused from its press-and-hold menu, and says so', async ({
    page,
  }) => {
    await tripWithRows(page, ['Stativ'])
    await startTrip(page)

    await openRowMenu(page, 'Stativ')
    await chooseInRowMenu(page, /mark as unused/i)

    // The row carries the mark: a judgement invisible on the row cannot be
    // reviewed before the pass ends.
    await expect(page.getByTestId('m4-unused-Stativ')).toBeVisible()

    // The same entry takes it back — it is a judgement, not a stamp.
    await openRowMenu(page, 'Stativ')
    await chooseInRowMenu(page, /remove unused mark/i)
    await expect(page.getByTestId('m4-unused-Stativ')).toHaveCount(0)
  })

  // E2E-M4-52: FR-9.1's active-only gate was true of *setting* a judgement
  // and false of correcting one — and M14, which is the first place anyone
  // sees what a flag was worth, runs on the archived trip.
  test('E2E-M4-52: the unused window stays open on the archived trip', async ({ page }) => {
    await tripWithRows(page, ['Stativ'])
    await startTrip(page)
    await page.getByTestId('m4-archive').click()
    await page.getByTestId('m4-pass-finish').click()
    // The closing card is the archived trip's own marker (UI-Spec M4).
    await expect(shown(page).getByTestId('m4-template-from-trip')).toBeVisible()

    await openRowMenu(page, 'Stativ')
    await chooseInRowMenu(page, /mark as unused/i)
    await expect(page.getByTestId('m4-unused-Stativ')).toBeVisible()

    // *Missing* keeps the live-trip gate: a thing bought after the trip is
    // not a thing that was missing on it.
    await page.getByTestId('m4-row-Stativ').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-details').click()
    await expect(page.getByTestId('m5-flag-unused')).toBeVisible()
    await expect(page.getByTestId('m5-flag-missing')).toHaveCount(0)
  })

  // E2E-M4-53: the door asks. Archiving used to happen on the tap itself.
  test('E2E-M4-53: the archive action opens the pass and archives nothing until it is finished', async ({
    page,
  }) => {
    await tripWithRows(page, ['Stativ'])
    await startTrip(page)

    await page.getByTestId('m4-archive').click()
    await expect(shown(page).getByTestId('m4-pass-banner')).toBeVisible()

    await page.getByTestId('m4-pass-cancel').click()
    await expect(shown(page).getByTestId('m4-pass-banner')).toHaveCount(0)
    // Still active: the archived trip's closing card is what would say
    // otherwise, and the archive action is still on offer.
    await expect(shown(page).getByTestId('m4-template-from-trip')).toHaveCount(0)
    await expect(page.getByTestId('m4-archive')).toBeVisible()
  })

  // E2E-M4-54: packed rows only. An unpacked row is either consciously
  // skipped — the opposite judgement — or forgotten, and neither is unused.
  test('E2E-M4-54: the pass lists what was packed, and marking there reaches M14', async ({
    page,
  }) => {
    const path = await tripWithRows(page, ['Stativ', 'Regenjacke', 'Drohne'])
    await startTrip(page)
    await packRow(page, 'Stativ')
    await openRowMenu(page, 'Drohne')
    await chooseInRowMenu(page, /do not pack this/i)

    await page.getByTestId('m4-archive').click()
    await expect(shown(page).getByTestId('m4-pass-banner')).toBeVisible()

    await expect(page.getByTestId('m4-row-Stativ')).toBeVisible()
    await expect(page.getByTestId('m4-row-Regenjacke')).toHaveCount(0)
    await expect(page.getByTestId('m4-row-Drohne')).toHaveCount(0)

    // One gesture, and it is the mark. Inside the pass the control *is*
    // the mark, so the row does not carry it twice.
    await page.getByTestId('m4-pass-toggle-Stativ').click()
    await expect(page.getByTestId('m4-pass-toggle-Stativ')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('m4-pass-finish').click()

    // *Fertig* archives and continues into M14 — a closing pass that hands
    // back the list you just finished with is not a closing pass. (What the
    // assistant then *proposes* needs a row with provenance, which is
    // review.spec.ts's world; here the promise is the ending.)
    await expect(shown(page).getByTestId('m14-open-count')).toBeVisible()

    // …and the mark it wrote is on the row afterwards, which is what the
    // assistant reads: the control's own state would prove nothing.
    await page.goto(path)
    // The row is packed, so FR-25.2 keeps it out of the list until revealed.
    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-unused-Stativ')).toBeVisible()
  })

  // E2E-M4-55: one posture asks one question. The two menu entries are
  // reachable a second earlier, on the same rows, before the pass starts.
  test('E2E-M4-55: press-and-hold is inert inside the pass', async ({ page }) => {
    await tripWithRows(page, ['Stativ'])
    await startTrip(page)

    // The positive control first, and before the row is packed: a packed
    // row leaves the list (FR-25.2), so the same gesture would then be
    // asserted against a row that is not there — which is not the fact
    // this case is about.
    await openRowMenu(page, 'Stativ')
    await page
      .locator('ion-action-sheet')
      .getByRole('button', { name: /cancel/i })
      .click()
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)

    await packRow(page, 'Stativ')
    await page.getByTestId('m4-archive').click()
    await expect(shown(page).getByTestId('m4-pass-banner')).toBeVisible()

    await page.getByTestId('m4-row-Stativ').dispatchEvent('contextmenu')
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)
    // And the tap marks rather than opening M5 — the sheet asks a dozen
    // other questions, which is not what this posture is asking.
    await page.getByTestId('m4-row-Stativ').getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  })
})
