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
 * per FR-27.4's 2026-08-21 amendment) and E2E-M22-03 (a traveller removed
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
    await confirm.getByRole('button', { name: /Remove/i }).click()

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

  test('E2E-M22-04: a started trip keeps the roster but refuses removal', async ({ page }) => {
    await tripWithTwoTravellers(page, 'Kurztrip')
    await page.getByTestId('m4-start').click()
    // The archive action appearing is the settled signal that the status moved.
    await expect(page.getByTestId('m4-archive')).toBeVisible()

    await openTripEdit(page)

    // Present but refused, with the reason on the screen rather than hidden:
    // a control that vanishes gets hunted for.
    await expect(visible(page).getByTestId('traveler-remove-note')).toBeVisible()
    const anyRemove = visible(page).locator('[data-testid^="traveler-remove-"]').first()
    await expect(anyRemove).toHaveAttribute('aria-disabled', 'true')
    // Adding still works on a started trip — only removal is gated.
    await expect(visible(page).getByTestId('traveler-add')).toBeVisible()
  })
})
