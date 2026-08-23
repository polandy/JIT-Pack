import { test, expect, expectTripOpen } from './fixtures'
import {
  addPosition,
  backToTemplateList as backToList,
  createTemplate,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * FR-2.7 / M22 — a trip's properties and its travellers, changed after the
 * wizard finished.
 *
 * Covers E2E-M22-01 (the screen is reachable from M4 and edits the trip),
 * E2E-M22-02 (a traveller added extends the per-person positions immediately,
 * per FR-27.4's 2026-08-21 amendment) and E2E-M22-08 (an edit keeps the fields it never showed), E2E-M22-03 (a traveller removed
 * takes their own row and **never a sibling's** — the owner's requirement, and
 * the failure that would quietly empty half a packing list).
 *
 * Local Mode: the whole consequence rule runs client-side (invariant 4), so a
 * broken rule shows up here rather than behind a round trip.
 */

/**
 * A group with one **per-person** position — the shape the whole argument is
 * about. The assignment has to be set explicitly: a position is trip-global by
 * default, and a group of those generates one unassigned row no matter how
 * many people travel, which is not the case this file exists for.
 */
async function seedGroup(page: Page) {
  await page.goto('/tabs/templates')
  await createTemplate(page, 'group', 'Wandern')
  await addPosition(page, 'Regenhose')

  await visible(page).getByText('Regenhose').first().click()
  await page.getByTestId('m8-details').click()
  await expect(page.getByTestId('m8-details-body')).toBeVisible()
  await page.getByTestId('m8-assign-person').click()
  // Quantity 2, so the packing row carries a G-6 stepper: a *partly* packed
  // row keeps its place in the list, where a fully packed one leaves through
  // the FR-25.2 pack-out and takes the signal this file needs with it.
  await page.getByTestId('m8-qty-inc').click()
  await expect(page.getByTestId('m8-position-sheet').locator('.glance')).toContainText('Per person')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('m8-position-sheet')).toBeHidden()

  await backToList(page)
}

/** M3 with two travellers and that group, so the trip carries two sibling rows. */
async function tripWithTwoTravellers(page: Page, name: string): Promise<string> {
  await page.goto('/trips/new')
  await page.getByTestId('wizard-name').locator('input').fill(name)
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  for (const traveller of ['Xenia', 'Zoe']) {
    await page.getByTestId('wizard-add-traveler').click()
    await page.getByTestId('wizard-traveler-name').last().locator('input').fill(traveller)
  }
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await visible(page).getByTestId('wizard-section-groups').locator('ion-checkbox').first().click()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()
  await expectTripOpen(page, name)
  return new URL(page.url()).pathname
}

/**
 * One traveller's share of the per-person position on M4.
 *
 * A per-person position renders as an FR-25.1 *cluster* — the name once, a
 * child row per traveller — and falls back to a flat "item · person" row when
 * only one instance is left. Both shapes have to count, or the removal case
 * would read its own success as a missing row.
 */
function pantsRowFor(page: Page, traveller: string) {
  return visible(page)
    .getByTestId(`m4-child-Regenhose-${traveller}`)
    .or(visible(page).getByTestId('m4-row-Regenhose').filter({ hasText: traveller }))
}

/** Every traveller's share, whichever shape M4 chose. */
function pantsRows(page: Page) {
  return visible(page)
    .getByTestId(/^m4-child-Regenhose-/)
    .or(visible(page).getByTestId('m4-row-Regenhose'))
}

async function openTripEdit(page: Page) {
  await page.getByTestId('m4-edit').click()
  await expect(visible(page).getByTestId('trip-edit-name')).toBeVisible()
}

test.describe('FR-2.7 — a trip can be edited after it is created', () => {
  // Built through M7/M8/M3 per spec §2.4, which lands near the default budget
  // on WebKit: declared rather than raced.
  test.slow()

  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await seedGroup(page)
  })

  test('E2E-M22-01: M4 opens the editor and the trip takes a new name', async ({ page }) => {
    const trip = await tripWithTwoTravellers(page, 'Herbstferien')
    await openTripEdit(page)

    const nameField = visible(page).getByTestId('trip-edit-name').locator('input')
    await nameField.fill('Herbstferien Wallis')
    await nameField.blur()

    // Asserted on the rendered screen, never on the URL: the name has to come
    // back through the store and repaint M4, which is the whole point.
    await page.goto(trip)
    await expectTripOpen(page, 'Herbstferien Wallis')
  })

  test('E2E-M22-02: a traveller added extends the per-person rows straight away', async ({
    page,
  }) => {
    const trip = await tripWithTwoTravellers(page, 'Sommerferien')
    await expect(pantsRows(page)).toHaveCount(2)

    await openTripEdit(page)
    await visible(page).getByTestId('traveler-add-input').locator('input').fill('Mia')
    await visible(page).getByTestId('traveler-add').click()

    // The report is the signal the screen owes the user, and it is also the
    // settled state to wait on — no clock involved.
    await expect(page.locator('ion-toast')).toContainText('1')

    await page.goto(trip)
    await expect(pantsRows(page)).toHaveCount(3)
    await expect(pantsRowFor(page, 'Mia')).toBeVisible()
  })

  /*
   * FR-9.4's open defect, asserted where a bottom toast and the navigation bar
   * are both on screen. Geometry rather than pixels: the toast is a live
   * overlay, so „is it readable?" is exactly „do these two boxes overlap?" —
   * and a screenshot could not tell a covered toast from a translucent one.
   * Settled first (the toast animates in), then measured, so no clock is
   * involved.
   *
   * The viewport is set explicitly, and the bar's height is asserted before
   * the overlap is: above 900 px the tab bar is `display: none` (G-9 hands the
   * job to the rail), and a hidden element measures as a zero-height box at
   * the origin — against which *every* overlap assertion resolves, in both
   * directions, while testing nothing. That is how this case first failed.
   */
  test('E2E-M22-09: the confirmation does not land on the navigation bar', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 })
    await tripWithTwoTravellers(page, 'Herbstferien')
    await openTripEdit(page)
    await visible(page).getByTestId('traveler-add-input').locator('input').fill('Mia')
    await visible(page).getByTestId('traveler-add').click()

    const toast = page.locator('ion-toast')
    await expect(toast).toContainText('1')
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    )

    const boxes = await page.evaluate(() => {
      const wrapper = document
        .querySelector('ion-toast')
        ?.shadowRoot?.querySelector('.toast-wrapper')
      const nav = document.querySelector('nav.tab-bar')
      if (!wrapper || !nav) return null
      const t = wrapper.getBoundingClientRect()
      const n = nav.getBoundingClientRect()
      return { toastBottom: t.bottom, toastHeight: t.height, navTop: n.top, navHeight: n.height }
    })

    expect(boxes).not.toBeNull()
    // Both boxes have to be real, or the comparison below means nothing.
    expect(boxes!.navHeight).toBeGreaterThan(0)
    expect(boxes!.toastHeight).toBeGreaterThan(0)
    expect(boxes!.toastBottom).toBeLessThanOrEqual(boxes!.navTop)
  })

  test('E2E-M22-03: a traveller removed takes their row and never a sibling’s', async ({
    page,
  }) => {
    const trip = await tripWithTwoTravellers(page, 'Skiferien')
    await expect(pantsRows(page)).toHaveCount(2)

    /*
     * Pack Xenia's share first, and that is not decoration — it is what makes
     * this case able to fail. Asserting only that her row is still there
     * passes against an over-broad removal too: the refresh re-resolves
     * afterwards and simply *generates her row again*, so the end state looks
     * identical while the row is a different one and everything done to it is
     * gone. Proved by mutation — detaching by position instead of by traveller
     * left this case green until the packed state was asserted.
     */
    await pantsRowFor(page, 'Xenia').getByTestId('row-plus').click()
    await expect(pantsRowFor(page, 'Xenia')).toContainText('1/2')

    await openTripEdit(page)
    // By name: Ionic sets an input's value as a property, not an attribute, so
    // `input[value="Zoe"]` never matches — the row carries its own test id.
    await visible(page).getByTestId('traveler-row-Zoe').getByRole('button').click()

    const confirm = page.locator('ion-alert')
    await expect(confirm).toBeVisible()
    // The choice only appears because Xenia's row is packed — hers, not Zoe's,
    // so this asks about nothing of Zoe's and the plain confirm shows.
    await confirm.getByRole('button', { name: /^Remove$/i }).click()

    // Isolate the two halves: the roster losing Zoe proves the removal ran at
    // all, so a failure below is about the rows rather than about the click.
    await expect(visible(page).getByTestId('traveler-row-Zoe')).toHaveCount(0)

    await page.goto(trip)
    // Zoe's share is gone and Xenia's is still there — asserted as two
    // separate facts. A count alone would be satisfied by a removal that took
    // both and a generation that put one back, which is the failure this case
    // exists for.
    await expect(pantsRowFor(page, 'Zoe')).toHaveCount(0)
    await expect(pantsRowFor(page, 'Xenia')).toBeVisible()
    // The same row, not a fresh one that looks like it.
    await expect(pantsRowFor(page, 'Xenia')).toContainText('1/2')
  })

  test('E2E-M22-08: an edited trip is still on M2, because an edit is not the whole row', async ({
    page,
  }) => {
    await tripWithTwoTravellers(page, 'Pfingsten')
    await openTripEdit(page)

    const nameField = visible(page).getByTestId('trip-edit-name').locator('input')
    await nameField.fill('Pfingsten Tessin')
    await nameField.blur()

    // M2 lists by status, so a write that saved only the edited fields drops
    // the trip off *every* segment — and in Local Mode nothing pulls it back.
    // Asserted on the list rather than on the trip screen, which the defect
    // leaves intact.
    await page.goto('/tabs/trips')
    await visible(page).getByTestId('trips-filter-planned').click()
    await expect(visible(page).getByTestId('trip-row-Pfingsten Tessin')).toBeVisible()
  })

  test('E2E-M22-05: a packed row of theirs is the user’s choice, both ways', async ({ page }) => {
    const trip = await tripWithTwoTravellers(page, 'Osterferien')

    // Zoe's own share, part-packed: this is what the question is about.
    await pantsRowFor(page, 'Zoe').getByTestId('row-plus').click()
    await expect(pantsRowFor(page, 'Zoe')).toContainText('1/2')

    await openTripEdit(page)
    await visible(page).getByTestId('traveler-row-Zoe').getByRole('button').click()

    const confirm = page.locator('ion-alert')
    // Asked, and it says how much it is asking about — a choice offered over
    // an unnamed quantity can only be answered by guessing.
    await expect(confirm).toContainText('1 item is already packed')
    await confirm.getByRole('button', { name: /Remove everything/i }).click()

    await expect(visible(page).getByTestId('traveler-row-Zoe')).toHaveCount(0)
    await page.goto(trip)
    // Gone, not merely unassigned — and Xenia's untouched share is still hers.
    await expect(pantsRowFor(page, 'Zoe')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-row-Regenhose')).toContainText('Xenia')
  })

  /**
   * The remove controls, and only those: `traveler-remove-note` shares the
   * prefix, so a prefix locator alone counts the explanation as a button and
   * never reaches zero.
   */
  function removeButtons(page: Page) {
    return visible(page).locator('ion-button[data-testid^="traveler-remove-"]')
  }

  test('E2E-M22-04: a started trip keeps the roster and offers no removal at all', async ({
    page,
  }) => {
    await tripWithTwoTravellers(page, 'Kurztrip')
    await page.getByTestId('m4-start').click()
    // The archive action appearing is the settled signal that the status moved.
    await expect(page.getByTestId('m4-archive')).toBeVisible()

    await openTripEdit(page)

    // Gone, not disabled (owner, 2026-08-21). The first version rendered a ✕
    // that refused every tap, on the reasoning that a vanished control gets
    // hunted for — but a control that is visibly there and does nothing is
    // read as a broken app, and the sentence under the list already answers
    // the question the ✕ would have raised.
    await expect(visible(page).getByTestId('traveler-remove-note')).toBeVisible()
    await expect(removeButtons(page)).toHaveCount(0)
    // Adding still works on a started trip — only removal is gated.
    await expect(visible(page).getByTestId('traveler-add')).toBeVisible()
  })

  test('E2E-M22-07: a planning trip does offer the removal control', async ({ page }) => {
    // The positive half of E2E-M22-04: without it, "no ✕ on a started trip"
    // would also pass against a screen that never renders one at all.
    await tripWithTwoTravellers(page, 'Vor dem Start')
    await openTripEdit(page)

    await expect(removeButtons(page)).toHaveCount(2)
    await expect(visible(page).getByTestId('traveler-remove-note')).toHaveCount(0)
  })
})
