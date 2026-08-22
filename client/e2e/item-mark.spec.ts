import type { Page } from '@playwright/test'

import {
  test,
  expect,
  createTripViaWizard,
  createTemplate,
  addPosition,
  openQuickAdd,
} from './fixtures'

/**
 * §3.28 — the item mark (FR-28.1–28.11, UI-Spec G-15).
 *
 * What only an end-to-end case can see here is the *column*: the ladder of
 * FR-28.4 is per-surface, so a screen keeping its rung says nothing about the
 * others, and the promise that names stay aligned is a promise about painted
 * pixels rather than about a computed property.
 *
 * Local Mode throughout (FR-28.11): index, scoring and font are client
 * assets, and the mode with no server is where a rule that quietly moved
 * server-side would show up.
 *
 * Reduced motion, like the other sheet-driven units: what is asserted is the
 * outcome, never the length of a transition.
 */
test.use({ reducedMotion: 'reduce' })

/** The page that is actually painted — a route change alone proves nothing. */
const visible = (page: Page) => page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')

/** Types instead of fill(): WebKit loses fill()'s one input event on Ionic
 *  fields — the full account is on inventory.spec.ts's fillIonic. */
async function fillIonic(field: ReturnType<typeof visible>, value: string) {
  await expect(field).toHaveClass(/hydrated/)
  const input = field.locator('input')
  await input.click()
  await input.fill('')
  await input.pressSequentially(value)
  await expect(input).toHaveValue(value)
}

/** The picker's search is a plain <input>, not an Ionic field — no hydration
 *  to wait for, and fillIonic's `hydrated` guard would never resolve. */
async function search(page: Page, value: string) {
  const input = page.getByTestId('mark-search')
  await input.fill(value)
  await expect(input).toHaveValue(value)
}

/** Open M10's picker from the mark row and wait for it to have presented. */
async function openPicker(page: Page) {
  await visible(page).getByTestId('m10-mark').click()
  await expect(page.getByTestId('mark-picker')).toBeVisible()
}

/**
 * Close the picker through its own ✕.
 *
 * Not Escape: a sheet dismissed while it is still presenting leaves a live
 * `ion-modal` over the page, and the next tap lands on the backdrop — the
 * exact false-green that cost E2E-M8-23 a day (log: FR-27.15).
 */
async function closePicker(page: Page) {
  await page
    .getByTestId('mark-picker')
    .getByLabel(/close|schliessen|schließen/i)
    .click()
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
}

/**
 * Add a trip row *from the master item* — through the composer's suggestion,
 * not the free-text confirm. The distinction is the point of FR-28.7: only a
 * row with a `source_item_id` has a master item to inherit a mark from, and
 * the free-text path deliberately creates an ad-hoc row that has none.
 */
async function addFromInventory(page: Page, name: string) {
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(name)
  await page.getByTestId('quick-add-suggestion').filter({ hasText: name }).first().click()
  await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
}

/** Add an ad-hoc row — free text, no master item behind it (FR-28.7). */
async function addAdHoc(page: Page, name: string) {
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(name)
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
}

/** A named item through M10, optionally marked from the suggestion band. */
async function createItem(page: Page, name: string, opts: { mark?: string } = {}) {
  await visible(page).getByTestId('m9-fab').click()
  await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
  await fillIonic(visible(page).getByTestId('m10-name'), name)

  if (opts.mark) {
    await openPicker(page)
    await page.getByTestId('mark-suggestion').filter({ hasText: opts.mark }).click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(visible(page).getByTestId('m10-mark')).toContainText(opts.mark)
  }

  await visible(page).getByTestId('m10-create').click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
}

async function backToInventory(page: Page) {
  await page.getByTestId('header-back').click()
  await expect(visible(page).getByTestId('m9-fab')).toBeVisible()
  await expect(visible(page).getByTestId('m10-name')).toHaveCount(0)
}

const m9Row = (page: Page, name: string) =>
  visible(page).getByTestId('m9-row').filter({ hasText: name })

test.describe('§3.28 the item mark', () => {
  test.slow()

  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/items')
  })

  // E2E-M10-11 (FR-28.2/28.3/28.11): the picker and its three cases, which
  // is the whole reason the feature is worth building.
  test('E2E-M10-11: the picker suggests, searches, and never fills in for you @local @m10', async ({
    page,
  }) => {
    // The hit.
    await visible(page).getByTestId('m9-fab').click()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Zahnbürste')
    await openPicker(page)
    await expect(page.getByTestId('mark-suggestion').first()).toHaveText('🪥')

    // The search reads keywords, not Unicode names: neither of these is
    // called „Regen" in any catalogue.
    await search(page, 'regen')
    await expect(page.getByTestId('mark-tile').filter({ hasText: '🧥' })).toBeVisible()

    // The named empty result, rather than an empty grid that reads as a gap.
    await search(page, 'xyzzy')
    await expect(page.getByTestId('mark-tile')).toHaveCount(0)
    await expect(page.getByTestId('mark-no-result')).toBeVisible()

    // A facet browses without typing.
    await search(page, '')
    await page.getByTestId('mark-facet-camping').click()
    await expect(page.getByTestId('mark-tile').filter({ hasText: '⛺' })).toBeVisible()
    await expect(page.getByTestId('mark-tile').filter({ hasText: '🪥' })).toHaveCount(0)

    await closePicker(page)

    // The skewed hit, asserted *positively*: „Stirnlampe" suggests a torch,
    // and the item is saved unmarked because nothing was tapped. The empty
    // slot on the row is the positive signal — the case cannot pass by the
    // picker merely being slow.
    await visible(page).getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Zahnbürste')
    await backToInventory(page)
    await expect(m9Row(page, 'Zahnbürste').getByTestId('item-mark')).toHaveCount(0)

    await visible(page).getByTestId('m9-fab').click()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Stirnlampe')
    await openPicker(page)
    await expect(page.getByTestId('mark-suggestion').first()).toHaveText('🔦')
    await closePicker(page)
    // Untapped means unset: the editor's row still says „none".
    await expect(visible(page).getByTestId('m10-mark')).not.toContainText('🔦')

    // The empty result of a *name*, said out loud rather than rendered blank.
    await fillIonic(visible(page).getByTestId('m10-name'), 'Zwischenringe')
    await openPicker(page)
    await expect(page.getByTestId('mark-suggestion')).toHaveCount(0)
    await expect(page.getByTestId('mark-no-suggestion')).toBeVisible()
    await closePicker(page)
  })

  // E2E-M10-12 (FR-28.2): removal is its own worded action, and it is offered
  // only when there is something to remove.
  test('E2E-M10-12: a mark is removed by saying so, not by choosing an empty tile @local @m10', async ({
    page,
  }) => {
    await createItem(page, 'Zelt', { mark: '⛺' })
    await backToInventory(page)
    await expect(m9Row(page, 'Zelt').getByTestId('item-mark')).toHaveText('⛺')

    await m9Row(page, 'Zelt').click()
    await expect(page.getByTestId('header-title')).toHaveText('Zelt')
    await openPicker(page)
    await page.getByTestId('mark-remove').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    await backToInventory(page)
    await expect(m9Row(page, 'Zelt').getByTestId('item-mark')).toHaveCount(0)

    // And the action is gone with the mark it removed.
    await m9Row(page, 'Zelt').click()
    await openPicker(page)
    await expect(page.getByTestId('mark-remove')).toHaveCount(0)
  })

  // E2E-M9-07 (FR-28.1/28.4/28.7): the inventory rung, and the inheritance —
  // one edit, two surfaces, nothing copied.
  test('E2E-M9-07: a trip row inherits the mark and never copies it @local @m9', async ({
    page,
  }) => {
    await createItem(page, 'Zelt', { mark: '⛺' })
    await backToInventory(page)

    const trip = await createTripViaWizard(page, { name: 'Markenprobe', travelers: ['Andy'] })
    await addFromInventory(page, 'Zelt')
    // An ad-hoc row has no master item, so it has no mark (FR-28.7) — and it
    // shows the empty slot rather than a placeholder.
    await addAdHoc(page, 'Zwischenringe')
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('m4-row-Zelt').getByTestId('item-mark')).toHaveText('⛺')
    const adHoc = page.getByTestId('m4-row-Zwischenringe')
    await expect(adHoc.getByTestId('item-mark')).toHaveCount(0)
    await expect(adHoc.getByTestId('item-mark-slot')).toBeVisible()

    // One edit on the master item, seen on both surfaces — which is only
    // possible because the trip row stores nothing.
    await page.goto('/tabs/items')
    await m9Row(page, 'Zelt').click()
    await openPicker(page)
    await search(page, 'rucksack')
    await page.getByTestId('mark-tile').filter({ hasText: '🎒' }).click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await backToInventory(page)
    await expect(m9Row(page, 'Zelt').getByTestId('item-mark')).toHaveText('🎒')

    // Straight to the trip's own path: reopening it through M2 makes the
    // case depend on the trip list's rendering, which is E2E-M2's subject.
    await page.goto(trip)
    await expect(page.getByTestId('m4-row-Zelt').getByTestId('item-mark')).toHaveText('🎒')
  })

  // E2E-M4-48 (FR-28.4/25.1): a per-person item is named once, on the
  // cluster head — so that is where its mark has to be. Without it, the one
  // kind of row a family list is made of (jackets, socks, toothbrushes ×3)
  // would lose its scan aid exactly when it is shared.
  test('E2E-M4-48: a per-person cluster carries the mark on its head @local @m4', async ({
    page,
  }) => {
    await createItem(page, 'Zelt', { mark: '⛺' })
    await backToInventory(page)

    // A group with Zelt as a per-person position (FR-25.1) …
    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Camping')
    await addPosition(page, 'Zelt')
    await visible(page).locator('ion-item h2').filter({ hasText: 'Zelt' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-details').click()
    await page.getByTestId('m8-assign-person').click()
    await expect(page.getByTestId('m8-assign-person')).toHaveClass(/sel/)
    await page.getByTestId('m8-position-close').click()
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)

    // … generated for two travelers is a cluster of two.
    await page.goto('/trips/new')
    await page.getByTestId('wizard-name').locator('input').fill('Clusterprobe')
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible()
    for (const name of ['Andy', 'Sia']) {
      await page.getByTestId('wizard-add-traveler').click()
      await page.getByTestId('wizard-traveler-name').last().locator('input').fill(name)
    }
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-3')).toBeVisible()
    await visible(page)
      .getByTestId('wizard-section-groups')
      .locator('ion-item')
      .filter({ hasText: 'Camping' })
      .first()
      .locator('ion-checkbox')
      .click()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-4')).toBeVisible()
    await page.getByTestId('wizard-create').click()

    await expect(page.getByTestId('m4-child-Zelt-Andy')).toBeVisible()
    await expect(page.getByTestId('m4-child-Zelt-Sia')).toBeVisible()
    // The head names the item once and carries its mark; the children name
    // the travelers and carry none (one tent, not three).
    const head = page.getByTestId('m4-cluster-Zelt')
    await expect(head.getByTestId('item-mark')).toHaveText('⛺')
    await expect(page.getByTestId('m4-child-Zelt-Andy').getByTestId('item-mark')).toHaveCount(0)
  })

  // E2E-G15-01 (FR-28.4): the two ladders in one run, and the alignment the
  // empty slot exists for.
  test('E2E-G15-01: the ladder differs per surface and the column stays aligned @local @g15', async ({
    page,
  }) => {
    await createItem(page, 'Zelt', { mark: '⛺' })
    await backToInventory(page)
    await createItem(page, 'Zwischenringe')
    await backToInventory(page)

    // M9 never ends in nothing: an unmarked item falls back to the tag
    // initial, so the column keeps its width (ADR-014's tile).
    await expect(m9Row(page, 'Zelt').getByTestId('item-mark')).toHaveText('⛺')
    await expect(m9Row(page, 'Zwischenringe').getByTestId('item-mark-initial')).toBeVisible()

    await createTripViaWizard(page, { name: 'Leiterprobe', travelers: ['Andy'] })
    await addFromInventory(page, 'Zelt')
    await addFromInventory(page, 'Zwischenringe')
    await page.keyboard.press('Escape')

    // M4 falls back to *nothing* — no letter tile — and the empty slot holds
    // its width, which is the whole reason it is rendered at all.
    const marked = page.getByTestId('m4-row-Zelt').getByTestId('item-mark-slot')
    const bare = page.getByTestId('m4-row-Zwischenringe').getByTestId('item-mark-slot')
    await expect(
      page.getByTestId('m4-row-Zwischenringe').getByTestId('item-mark-initial'),
    ).toHaveCount(0)

    const markedBox = await marked.boundingBox()
    const bareBox = await bare.boundingBox()
    expect(markedBox?.width).toBeGreaterThan(0)
    expect(bareBox?.width).toBeCloseTo(markedBox!.width, 0)
  })

  // E2E-G15-02 (FR-28.5): the mark is presentational. Asserted through the
  // accessibility tree, because the failure mode is a screen reader
  // announcing "tent Zelt".
  test('E2E-G15-02: a marked row’s accessible name is the item name alone @local @g15', async ({
    page,
  }) => {
    await createItem(page, 'Zelt', { mark: '⛺' })
    await backToInventory(page)

    // In the DOM…
    await expect(m9Row(page, 'Zelt').getByTestId('item-mark')).toHaveText('⛺')

    // …and out of the accessibility tree, which is the actual promise: a
    // screen reader must announce "Zelt", not "tent Zelt".
    const tree = await m9Row(page, 'Zelt').ariaSnapshot()
    expect(tree).toContain('Zelt')
    expect(tree).not.toContain('⛺')
  })

  // E2E-M5-15 (FR-28.4/28.7): the sheet's identity slot, and the fact that
  // the mark is not editable there — it belongs to the master item.
  test('E2E-M5-15: the M5 sheet shows the mark and does not offer to change it @local @m5', async ({
    page,
  }) => {
    await createItem(page, 'Zelt', { mark: '⛺' })
    await backToInventory(page)

    await createTripViaWizard(page, { name: 'Blattprobe', travelers: ['Andy'] })
    await addFromInventory(page, 'Zelt')
    await addAdHoc(page, 'Zwischenringe')
    await page.keyboard.press('Escape')

    await page.getByTestId('m4-row-Zelt').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByTestId('m5-sheet').getByTestId('item-mark')).toHaveText('⛺')
    // M10 owns the mark (FR-28.7): the sheet has no picker.
    await expect(page.getByTestId('m5-sheet').getByTestId('m10-mark')).toHaveCount(0)
    await expect(page.getByTestId('mark-picker')).toHaveCount(0)
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // An ad-hoc row has no mark, and the sheet has no column to hold a slot
    // for: the title is the first thing on the line, not 44px of blank. The
    // rendered name is the positive signal the absent slot is asserted beside.
    // Closing the sheet is a route *replace* (ADR-012), and on WebKit both
    // M4 pages sit in the outlet for a moment, neither yet hidden — so the
    // row is awaited to be unique before it is clicked (strict mode does not
    // retry on its own).
    const adHocRow = visible(page).getByTestId('m4-row-Zwischenringe')
    await expect(adHocRow).toHaveCount(1)
    await adHocRow.click()
    await expect(page.getByTestId('m5-sheet').getByTestId('m5-name')).toHaveText('Zwischenringe')
    await expect(page.getByTestId('m5-sheet').getByTestId('item-mark-slot')).toHaveCount(0)
  })
})
