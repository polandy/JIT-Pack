import {
  test,
  expect,
  addInComposer,
  createTripViaWizard,
  openQuickAdd,
  openTripView,
  tripAction,
  expectTripActionAbsent,
  expectTripActionOffered,
  visiblePage,
  useReducedMotion,
  writesLanded,
} from './fixtures'
import { PATH } from './routes'
import { packRow, startTrip, tripWithRows } from './helpers/m4'

/**
 * FR-5.10 — finishing the packing, and FR-30.8's consequence for M6.
 *
 * The step this unit is about is the one most trips take before the
 * lifecycle's: the bag is shut, and whatever is still on the list was left
 * behind on purpose (FR-5.5) rather than forgotten. Three promises are
 * separable and separately breakable, so they are separate cases: what the
 * write does to the rows, what a *half-packed* row becomes, and what a
 * finished list still lets you do.
 *
 * **Reduced motion**, as in `closing-pass.spec.ts`: the production code takes
 * its own no-motion path, so the outcome is asserted rather than a transition.
 */
useReducedMotion(test)

/**
 * Which of M6's two lists is open, read off the segment's own value — the
 * idiom E2E-M2-33 uses, because the checked state is a class on a shadow
 * part and a case that matched on it would assert Ionic's markup.
 */
async function openList(page: import('@playwright/test').Page): Promise<string | undefined> {
  const segment = visiblePage(page).getByTestId('m6-page').locator('ion-segment')
  await expect(segment).toBeVisible()
  return segment.evaluate((el) => (el as HTMLElement & { value?: string }).value)
}

/** Answer the confirmation the step asks (FR-5.10, variant A of the round). */
async function confirmClose(page: import('@playwright/test').Page) {
  const alert = page.locator('ion-alert')
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: /^Finish/ }).click()
  await expect(alert).toHaveCount(0)
  await writesLanded(page)
}

test.describe('FR-5.10 — the packing is finished @local @m4', () => {
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-138: the whole shape in one pass — the question names what it is
   * about to do, the open row becomes a decision, the list says it is
   * finished, the step stops being offered, and one undo takes it all back.
   */
  test('E2E-M4-138: closing the packing decides what is left, and one undo takes it back', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt', 'Regenjacke'], 'Abschluss')
    await startTrip(page)
    await packRow(page, 'Zelt')

    await tripAction(page, 'closePacking')
    // The question states the count before anything is written; „1" is the
    // one row still open, not the two on the list.
    await expect(page.locator('ion-alert')).toContainText('1 open item')
    await confirmClose(page)

    // The row that was open is a decision now: off the working list, and
    // behind the reveal that names how many were left behind (FR-25.2).
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toHaveCount(0)
    const card = visiblePage(page).getByTestId('m4-packing-closed')
    await expect(card).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-packing-closed-stamp')).toContainText('1')

    // A second close would re-decide rows nobody touched, so it is gone.
    await expectTripActionAbsent(page, 'closePacking')

    // One undo for the batch (FR-25.31): the row is back, open, and so is
    // the packing — the card that said otherwise is gone with it.
    await page.locator('ion-toast.pack-toast').getByRole('button', { name: /undo/i }).click()
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toBeVisible()
    await expect(card).toHaveCount(0)
    await expectTripActionOffered(page, 'closePacking')
  })

  /**
   * E2E-M4-139 (variant P1, owner 2026-09-20): four of six socks are in the
   * bag. The skip M4 already had would write quantity 0 and deny them; the
   * close shrinks the amount to what travelled instead, so the row reads as
   * packed and the trip's figure completes without lying about the bag.
   *
   * A quantity above one can only come from an import (spec §2.4), which is
   * also the only way to reach a *partially* packed row without six taps.
   */
  test('E2E-M4-139: a half-packed row keeps what is in the bag', async ({ page }) => {
    await page.goto(PATH.importFile)
    await page
      .getByTestId('portable-paste')
      .locator('textarea')
      .fill(
        [
          'kind: trip',
          'schema_version: 1',
          'name: Sockentest',
          'end_date: "2026-12-31"',
          'travelers: []',
          'containers: []',
          'items:',
          '  - name: Wandersocken',
          '    quantity: 6',
          '    packed_count: 0',
          '    category: Kleidung',
          '    mode: pack',
          '    late_packer: false',
        ].join('\n'),
      )
    await page.getByTestId('portable-preview').click()
    await page.getByTestId('portable-commit').click()

    const row = visiblePage(page).getByTestId('m4-row-Wandersocken')
    await expect(row).toBeVisible()
    for (let n = 0; n < 4; n += 1) await row.getByTestId('row-plus').click()
    await expect(row).toContainText('4/6')
    await writesLanded(page)

    await tripAction(page, 'closePacking')
    await confirmClose(page)

    // Packed, and packed *four* — not skipped, and not six either.
    await expect(visiblePage(page).getByTestId('m4-progress')).toContainText('4/4')
    // Nothing was left behind, so the card states the moment alone.
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-done-bar')).toContainText('1')
  })

  /**
   * E2E-M4-140: the list stays workable afterwards, which is the owner's own
   * requirement (2026-09-20) — something that travelled and was never listed
   * is added later, and it lands *packed* rather than as the one open job on
   * an otherwise finished trip.
   */
  test('E2E-M4-140: a finished list takes an addition as something already packed', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt'], 'Nachtrag')
    await startTrip(page)
    await packRow(page, 'Zelt')
    await tripAction(page, 'closePacking')
    await confirmClose(page)

    await openQuickAdd(page)
    // The composer says what an addition will become before it is typed.
    await expect(page.getByText('recorded as packed')).toBeVisible()
    await addInComposer(page, 'Zahnbürste')
    await page.keyboard.press('Escape')
    await writesLanded(page)

    // It did not reopen the packing: the card stands, the row is done, and
    // the trip's figure counts it as packed rather than as work left.
    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-row-Zahnbürste')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-progress')).toContainText('2/2')
  })

  /**
   * E2E-M4-141: reopening is **not** the undo, and the difference is the
   * whole case — the snackbar's *Rückgängig* puts the rows back, while
   * *Wieder öffnen* lifts the stamp and leaves every decision standing. With
   * variant P1 the amount a half-packed row wanted is not recorded anywhere
   * after the close, so a reopen that restored rows would have to invent it.
   */
  test('E2E-M4-141: the card reopens the packing, and the rows it decided stay decided', async ({
    page,
  }) => {
    await tripWithRows(page, ['Zelt', 'Regenjacke'], 'Wieder auf')
    await startTrip(page)
    await packRow(page, 'Zelt')
    await tripAction(page, 'closePacking')
    await confirmClose(page)
    // Every snackbar is taken off the page first — the outgoing pack toast and
    // the close's own — so nothing below here can be an undo's doing.
    await page
      .locator('ion-toast.pack-toast')
      .evaluateAll((toasts) => toasts.forEach((toast) => toast.remove()))

    await visiblePage(page).getByTestId('m4-reopen-packing').click()
    await writesLanded(page)

    await expect(visiblePage(page).getByTestId('m4-packing-closed')).toHaveCount(0)
    await expectTripActionOffered(page, 'closePacking')
    // The decision stands: the row is still off the working list, and still
    // behind the reveal that counts it.
    await expect(visiblePage(page).getByTestId('m4-row-Regenjacke')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m4-done-bar')).toContainText('2')
  })

  /**
   * E2E-M6-30 (FR-30.8): the shopping list stops opening on *Before
   * departure* once that moment is past. The trip here is still *planning* —
   * nobody tapped *Start trip* — which is exactly the case the trip's phase
   * alone gets wrong: the bag is shut the evening before.
   */
  test('E2E-M6-30: M6 opens at the destination once the packing is finished', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Einkauf danach', travelers: ['Andy'] })

    await openTripView(page, 'shopping')
    expect(await openList(page)).toBe('buy_before')

    await openTripView(page, 'packing')
    await tripAction(page, 'closePacking')
    await confirmClose(page)

    await openTripView(page, 'shopping')
    expect(await openList(page)).toBe('buy_local')
  })
})
