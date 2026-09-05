import {
  test,
  expect,
  createTripViaWizard,
  createTemplate,
  createTripFollowingGroup,
  addPosition,
  openQuickAdd,
  createMasterItem,
  chooseInSelect,
  visiblePage as visible,
  useReducedMotion,
} from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { PATH } from './routes'
import { createItem } from './helpers/m9'

/**
 * M4 — packing list (UI-Test-Spec §4, unit "M4 packing list").
 *
 * Local Mode throughout: M4's own behaviour is client-side, so it needs no
 * backend, and the cases that genuinely need one (remote pack attribution,
 * delegation notifications) are marked `server` in the spec and are not
 * here.
 *
 * What is deliberately *not* covered yet, and why — the ledger repeats it:
 * every facet case beyond the panel's own structure needs rows that carry
 * a category, a traveler or a buy mode, and none of those can be set from
 * M4 today. They land with M5 and the M9/M10 rebuild, which is what
 * produces such rows through the app's own paths (spec §2.4).
 */

const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31', travelers: ['Andy', 'Sia'] }

/**
 * Enough rows that the list is taller than a phone screen — E2E-M4-45 needs
 * a scroll position worth losing.
 */
const SCROLL_ROWS = Array.from({ length: 16 }, (_, i) => `Sache ${i + 1}`)

/** Adds rows through the quick-add, which is the only add path M4 has. */
async function quickAdd(page: Page, names: string[]) {
  await openQuickAdd(page)
  for (const name of names) {
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
}

test.describe('M4 packing list @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M4-01 (FR-8.1/7.3, G-12): the header line counts the whole trip,
  // whatever the list below it is showing. A short list that also shortened
  // the header would make a filtered trip look further along than it is.
  test('E2E-M4-01: the header line stays unfiltered while the search narrows the list', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Schlafsack', 'Kocher'])

    await expect(page.getByTestId('m4-progress')).toContainText('0/3')

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Zelt')

    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)
    // The point of the case: the count did not follow the list.
    await expect(page.getByTestId('m4-progress')).toContainText('0/3')
  })

  // E2E-M4-04 (FR-5.6, FR-25.13a): the visible confirm button is the commit,
  // and the form stays open for the next row.
  test('E2E-M4-04: the FAB opens the quick-add, which commits by button and stays open', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)

    await openQuickAdd(page)
    const input = page.getByTestId('quick-add-input').locator('input')
    await input.fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()

    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    // Still open and empty, ready for the next one.
    await expect(page.getByTestId('quick-add-input')).toBeVisible()
    await expect(input).toHaveValue('')
  })

  // E2E-M4-36 (FR-25.13a, amended 2026-08-17): the ＋ steps aside while the
  // composer is open. M8 has the same rule and its own case (E2E-M8-17), and
  // both are needed: the behaviour is written in each screen's own template
  // (`v-if="!quickAddExpanded"`), so one screen keeping it says nothing about
  // the other. The shared `openQuickAdd` helper deliberately *tolerates* both
  // states — it would pass either way, which is why it is not the assertion.
  test('E2E-M4-36: the ＋ steps aside while the quick-add is open', async ({ page }) => {
    await createTripViaWizard(page, TRIP)

    await expect(page.getByTestId('m4-fab')).toBeVisible()
    await openQuickAdd(page)

    await expect(page.getByTestId('m4-fab')).toHaveCount(0)
    // The anchor survives the button: M4 positions its FR-25.2 undo snackbar
    // against the fab *container*, so hiding the whole IonFab would drop the
    // snackbar behind the tab bar — the M7/M8 defect of 2026-08-15.
    await expect(page.locator('#m4-fab-anchor')).toHaveCount(1)

    // Adding does not bring it back — the composer stays open (FR-25.13), so
    // the ＋ still has nothing to do.
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-fab')).toHaveCount(0)

    // And it returns when the composer closes.
    await page.getByTestId('quick-add-close').click()
    await expect(page.getByTestId('m4-fab')).toBeVisible()
  })

  // E2E-G6-02 (G-6, UI-Spec M4 "tap row → M5"): the row's control counts
  // and only the row's body opens the sheet. Reported as "wenn ich bei
  // Taschentücher auf das + klicke, kommt item not found": Ionic wraps a
  // router-link row in an anchor, and an anchor's jump is a *default
  // action*, so `@click.stop` on the control never cancelled it — every
  // tap on a stepper opened the sheet instead of packing anything.
  //
  // It needs a row with a quantity above one, and the only path to one
  // that goes through the app is the M18 import (spec §2.4).
  test('E2E-G6-02: the stepper counts without leaving the list, while the row body opens M5', async ({
    page,
  }) => {
    await page.goto(PATH.importFile)
    await page
      .getByTestId('portable-paste')
      .locator('textarea')
      .fill(
        [
          'kind: trip',
          'schema_version: 1',
          'name: Steppertest',
          'end_date: "2026-12-31"',
          'travelers: []',
          'containers: []',
          'items:',
          '  - name: Taschentücher',
          '    quantity: 4',
          '    packed_count: 0',
          '    category: Bad',
          '    mode: pack',
          '    late_packer: false',
        ].join('\n'),
      )
    await page.getByTestId('portable-preview').click()
    await page.getByTestId('portable-commit').click()

    const row = page.getByTestId('m4-row-Taschentücher')
    await expect(row).toBeVisible()

    await row.getByTestId('row-plus').click()

    // Counted, and still on the list: the control acted, it did not navigate.
    await expect(row).toContainText('1/4')
    await expect(page.getByTestId('m4-header')).toBeVisible()
    await expect(page).toHaveURL(/\/trips\/[^/]+$/)

    // The body of the same row is what opens the sheet — and it resolves.
    await row.getByRole('heading').click()
    await expect(page).toHaveURL(/\/items\//)
    await expect(page.getByText('not found')).toHaveCount(0)
  })

  // E2E-M4-18 (FR-25.11e): "Alles gepackt" may appear only when nothing is
  // narrowing the list. The regression this guards actually happened: the
  // check looked at the filter count alone, so an unmatched *search*
  // announced completion.
  test('E2E-M4-18: an unmatched search says "no matches", not "all packed"', async ({ page }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Kajak')

    const empty = page.getByTestId('packing-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('Kajak')
    await expect(empty).not.toContainText('🎉')

    // The reset clears everything narrowing, not only part of it — a reset
    // that leaves the search behind re-renders the same empty screen.
    await page.getByTestId('m4-reset').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  test('E2E-M4-18: everything packed does celebrate, because nothing is narrowing', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()

    await expect(page.getByTestId('packing-empty')).toContainText('🎉')
  })

  // E2E-M4-21 (UI-Spec M4, reported 2026-08-14): a category heads the rows
  // under it, so it has to *look* like their heading. It was 0.82rem
  // uppercase micro-type — smaller than the item names it introduced — and
  // the groups ran into each other with nothing but a gap between them.
  test('E2E-M4-21: a group heading outranks its rows, and each group is its own block', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Kocher'])

    const sizes = await page.evaluate(() => {
      const px = (sel: string) => {
        const el = document.querySelector(sel)
        return el ? parseFloat(getComputedStyle(el).fontSize) : 0
      }
      return { heading: px('.group-head'), row: px('ion-item h3') }
    })

    expect(sizes.heading).toBeGreaterThan(sizes.row)

    // The rows of a group live in one block, which is what makes the seam
    // between two categories an edge rather than a slightly bigger gap.
    const inGroup = page.locator('.group-card').first().getByTestId('m4-row-Zelt')
    await expect(inGroup).toBeVisible()
  })

  // E2E-M4-23 (FR-25.16/25.2): doneness removes a group entirely — header
  // and all — and the reveal bar brings it back. Folding is a different
  // concept and must not stand in for it.
  test('E2E-M4-23: a fully packed group disappears and returns with the reveal bar', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Kocher'])

    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(page.getByTestId('m4-group-none')).toBeVisible()

    await page.getByTestId('m4-row-Kocher').getByTestId('row-check').click()
    // Both done: the group is gone, not merely empty.
    await expect(page.getByTestId('m4-group-none')).toHaveCount(0)

    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-group-none')).toBeVisible()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  // E2E-M4-22 (FR-25.16): a folded group is its header line alone, and that
  // line answers what the hidden rows would have.
  test('E2E-M4-22: folding a group leaves its header carrying the open count', async ({ page }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Kocher'])

    const group = page.getByTestId('m4-group-none')
    await expect(group).toContainText('0/2')

    await group.click()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(group).toContainText('2')
    await expect(group).toBeVisible()

    await group.click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  test('E2E-M4-22: fold-all collapses every group, and folding survives packing a row', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt', 'Kocher'])

    await page.getByTestId('m4-fold-all').click()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)

    await page.getByTestId('m4-fold-all').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // The fold is per group key, so a re-render of the list must not
    // unwind it — packing a row somewhere else is exactly such a render.
    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()
    await page.getByTestId('m4-group-none').click()
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)

    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-group-none')).toBeVisible()
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)
  })

  // E2E-M4-20 (FR-25.11b, rev. 2026-08-14): the panel has no apply button,
  // because a tap is already in force behind it. Asserted from the outside
  // — the list changes while the sheet is still open — and from the inside:
  // the head's outcome line follows along.
  //
  // Two categories are needed for a facet value that changes anything, and
  // the quick-add produces uncategorised rows, so the trip comes in through
  // the M18 import (spec §2.4).
  test('E2E-M4-20: a facet value takes effect immediately, with nothing to confirm', async ({
    page,
  }) => {
    await page.goto(PATH.importFile)
    await page
      .getByTestId('portable-paste')
      .locator('textarea')
      .fill(
        [
          'kind: trip',
          'schema_version: 1',
          'name: Filtertest',
          'end_date: "2026-12-31"',
          'travelers: []',
          'containers: []',
          'items:',
          '  - name: Zelt',
          '    quantity: 1',
          '    category: Aktivität',
          '    mode: pack',
          '    late_packer: false',
          '  - name: Kaffee',
          '    quantity: 1',
          '    category: Küche',
          '    mode: pack',
          '    late_packer: false',
        ].join('\n'),
      )
    await page.getByTestId('portable-preview').click()
    await page.getByTestId('portable-commit').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await expect(page.getByTestId('filter-count')).toContainText('2')
    // There is no confirm affordance at all — not hidden, absent. Asserted
    // as the list of what the header offers, because the clause that stood
    // here named an id that has never existed anywhere in client/src: it was
    // green before this panel was built and would have stayed green after an
    // Apply button was added. Found by scripts/testid-gate.mjs.
    expect(
      await page
        .getByTestId('filter-sheet')
        .locator('header [data-testid]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid'))),
    ).toEqual(['filter-count', 'filter-close'])

    await page.getByTestId('facet-category-Küche').click()

    // In force while the panel is still open: nothing was confirmed.
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await expect(page.getByTestId('filter-count')).toContainText('1')

    await page.getByTestId('filter-close').click()
    await expect(page.getByTestId('m4-row-Kaffee')).toBeVisible()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await expect(page.getByTestId('m4-chip-category-Küche')).toBeVisible()
  })

  // E2E-M4-15 (FR-25.11a/b): one filter row, and the grouping lives inside
  // the sheet rather than as a second bar in the header.
  test('E2E-M4-15: the filter sheet holds the grouping and the facets, and the header has no second bar', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    // With nothing filtered the row states the grouping instead of chips,
    // and the grouping switcher is nowhere but inside the sheet.
    await expect(page.getByTestId('m4-filter-bar')).toBeVisible()
    await expect(page.getByTestId('group-person')).toHaveCount(0)

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await expect(page.getByTestId('group-category')).toBeVisible()
    await expect(page.getByTestId('group-person')).toBeVisible()
  })

  // E2E-M12-06 (FR-8.2/25.18): M12's slice tap is a handoff between two
  // screens, and it broke silently when M4's rebuild moved the grouping to
  // `usePackingFilter` while M12 went on writing the trip store's copy. No
  // unit could see it — each side was correct about its own state — so the
  // case has to cross the screen boundary. The *facet* half of the tap is
  // E2E-M12-04 (analytics.spec.ts); this case pins the grouping that comes
  // along, which is what outlives the chip once the reader clears it.
  test('E2E-M12-06: a slice tapped in analytics is the grouping M4 comes back with', async ({
    page,
  }) => {
    // A weighted master item, because only weighted rows draw a bar.
    await page.goto(PATH.items)
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill('Zelt')
    await page.getByTestId('m10-more').click()
    await page.getByTestId('m10-weight').locator('input').fill('1000')
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Zelt')

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-filter-bar')).toContainText(/Category/i)

    await page.getByTestId('m4-nav-analytics').click()
    // The button, not the label inside it: the segment button swallows a
    // click aimed at its own `ion-label`.
    await page.getByTestId('analytics-dim-person').click()
    await page.getByTestId('analytics-slice-none').click()

    // The tap set the facet (M12-04's half); clearing it reveals the
    // grouping that must still be in force on the mounted M4 (ADR-012).
    await page.getByTestId('m4-chip-reset').click()
    await expect(page.getByTestId('m4-filter-bar')).toContainText(/Person/i)
  })

  // E2E-M4-46 (FR-25.13c): the chip/suggestion logic is shared and covered
  // on M8 (E2E-M8-19); what only this case pins is M4's *wiring* — the trip
  // passing its contents to the composer at all. Without it, a dropped prop
  // keeps every shared-component test green.
  test('E2E-M4-46: what the trip already carries is not suggested again (FR-25.13c)', async ({
    page,
  }) => {
    await page.goto(PATH.items)
    await page.getByTestId('m9-fab').click()
    await page.getByTestId('m10-name').locator('input').fill('Zelt')
    await page.getByTestId('m10-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Zelt')

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    const input = page.getByTestId('quick-add-input').locator('input')
    await input.fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // Same query again: the positive signal for the absent suggestion is
    // the free-text hint, which renders exactly when nothing is offered.
    await input.fill('Zel')
    await expect(visible(page).locator('.no-match')).toContainText('Add “Zel” as a new item')
    await expect(page.getByTestId('quick-add-suggestion')).toHaveCount(0)
  })

  // E2E-M4-47 (FR-25.13d): the sheet's own rules are pinned on M8
  // (E2E-M8-22) and in the component's unit tests; what only this case pins
  // is M4's wiring — the trip's contents reaching the browse-sheet as the
  // carried state, and a sheet tap landing as a trip row.
  test('E2E-M4-47: the browse-sheet knows what the trip carries and adds the rest (FR-25.13d)', async ({
    page,
  }) => {
    for (const name of ['Zelt', 'Lampe']) {
      await page.goto(PATH.items)
      await page.getByTestId('m9-fab').click()
      await page.getByTestId('m10-name').locator('input').fill(name)
      await page.getByTestId('m10-create').click()
      await expect(page.getByTestId('header-title')).toHaveText(name)
    }

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    const input = page.getByTestId('quick-add-input').locator('input')
    // Via the suggestion, so the row carries its master-item provenance —
    // a free-text "Zelt" would be a different row with no source to match.
    await input.fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet.getByTestId('browse-row-carried').filter({ hasText: 'Zelt' })).toContainText(
      'already in',
    )

    await sheet.getByTestId('browse-row').filter({ hasText: 'Lampe' }).click()
    await expect(sheet.getByTestId('browse-row-carried').filter({ hasText: 'Lampe' })).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(page.getByTestId('m4-row-Lampe')).toBeVisible()
  })

  /**
   * E2E-M4-59 (FR-25.13e): the switch that puts the carried rows away, and
   * the rule that makes it safe — what *this run* adds is never hidden.
   *
   * The load-bearing assertion is the positive one: after the switch is on,
   * a tapped row is still on screen and says "added". A case that only
   * asserted the disappearance of the pre-carried rows would stay green
   * against exactly the implementation this rule exists to forbid, where the
   * row vanishes under the finger and the list reflows into the next tap.
   */
  test('E2E-M4-59: hiding what is already in keeps what the run adds (FR-25.13e)', async ({
    page,
  }) => {
    for (const name of ['Zelt', 'Lampe', 'Kocher']) {
      await page.goto(PATH.items)
      await page.getByTestId('m9-fab').click()
      await page.getByTestId('m10-name').locator('input').fill(name)
      await page.getByTestId('m10-create').click()
      await expect(page.getByTestId('header-title')).toHaveText(name)
    }

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    const input = page.getByTestId('quick-add-input').locator('input')
    await input.fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet.getByTestId('browse-hide-count')).toHaveText('1 already in')

    await sheet.getByTestId('browse-hide-toggle').click()
    await expect(sheet.getByTestId('browse-hide-count')).toHaveText('1 hidden')
    await expect(sheet.getByTestId('browse-row-carried')).toHaveCount(0)

    // The run's own add: it stays exactly where it was tapped, as the ledger
    // of what this pass did.
    await sheet.getByTestId('browse-row').filter({ hasText: 'Lampe' }).click()
    await expect(sheet.getByTestId('browse-added-now')).toHaveCount(1)
    await expect(sheet.getByTestId('browse-row-carried').filter({ hasText: 'Lampe' })).toBeVisible()
    await expect(sheet.getByTestId('browse-hide-count')).toHaveText('1 hidden')
    // Kocher is untouched, so the sheet is still a working list.
    await expect(sheet.getByTestId('browse-row').filter({ hasText: 'Kocher' })).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(page.getByTestId('m4-row-Lampe')).toBeVisible()

    // Re-opening starts a new pass, so the previous run's add is now simply
    // "already in" and goes with the rest: the snapshot belongs to one
    // creation of the sheet, and Ionic creates it afresh on every opening.
    await visible(page).getByTestId('quick-add-browse-open').click()
    await expect(sheet.getByTestId('browse-hide-count')).toHaveText('2 hidden')
    await expect(sheet.getByTestId('browse-added-now')).toHaveCount(0)
    await expect(sheet.getByTestId('browse-row')).toHaveCount(1)
    await expect(sheet.getByTestId('browse-row')).toContainText('Kocher')
  })

  /**
   * The three items every FR-25.13f case browses, created through M9/M10 so
   * the sheet has a real inventory to work through.
   */
  async function inventory(page: Page, names: string[]) {
    for (const name of names) {
      await page.goto(PATH.items)
      await createItem(page, name)
    }
  }

  /** Opens the browse-sheet on a trip's M4 and returns it. */
  async function openBrowseSheet(page: Page) {
    await openQuickAdd(page)
    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet).toBeVisible()
    return sheet
  }

  /**
   * E2E-M4-60 (FR-25.13f): ✓ on a line the trip does not carry yet adds the
   * row *and* packs it, in one tap and without leaving the sheet.
   *
   * The assertion that matters is the one on M4 afterwards: a line that only
   * said "packed" while the row landed open would keep this green, and that
   * is precisely the half-write the single-mutation rule exists to forbid.
   */
  test('E2E-M4-60: one tap adds a row already packed (FR-25.13f)', async ({ page }) => {
    await inventory(page, ['Zelt', 'Lampe'])
    await createTripViaWizard(page, TRIP)

    const sheet = await openBrowseSheet(page)
    await sheet.getByRole('button', { name: 'Mark "Lampe" as packed' }).click()

    // The line stays put and says what it did — the sheet has no toast.
    await expect(sheet.getByTestId('browse-packed-now')).toHaveText(/packed/i)
    await expect(sheet.getByTestId('browse-row').filter({ hasText: 'Zelt' })).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // Packed rows are done (FR-25.2), so the row is behind the reveal bar
    // rather than on the working list — and the count agrees.
    await expect(page.getByTestId('m4-progress')).toContainText('1/1')
    await expect(page.getByTestId('m4-row-Lampe')).toHaveCount(0)
    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-row-Lampe')).toBeVisible()
    // FR-25.17: the row carries a packing record, which is what separates a
    // row born packed from one whose count merely reached its quantity.
    await expect(page.getByTestId('m4-packed-stamp')).toBeVisible()
  })

  /**
   * E2E-M4-61 (FR-25.13f): ✕ on a free line records the decision instead of
   * losing it — the row lands as FR-5.5 *skipped*, not as an open one and
   * not as nothing at all.
   */
  test('E2E-M4-61: one tap leaves an item at home, on the record (FR-25.13f)', async ({ page }) => {
    await inventory(page, ['Zelt', 'Lampe'])
    await createTripViaWizard(page, TRIP)

    const sheet = await openBrowseSheet(page)
    await sheet.getByRole('button', { name: 'Deliberately leave "Zelt" behind' }).click()

    await expect(sheet.getByTestId('browse-skipped-now')).toHaveText(/staying home/i)

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // Not on the working list, and named as a decision where it is revealed
    // — "deliberately not taken" is the whole point of spending a row on it.
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-row-Zelt')).toContainText(/deliberately skipped/i)
  })

  /**
   * E2E-M4-62 (FR-25.13f): the verbs reach the rows the trip already carries,
   * which is the trip the sheet could not touch at all before — its lines
   * were inert.
   */
  test('E2E-M4-62: the verbs act on a row the trip already carries (FR-25.13f)', async ({
    page,
  }) => {
    await inventory(page, ['Zelt', 'Lampe'])
    await createTripViaWizard(page, TRIP)

    let sheet = await openBrowseSheet(page)
    await sheet.getByTestId('browse-row').filter({ hasText: 'Zelt' }).click()
    await expect(sheet.getByTestId('browse-added-now')).toHaveCount(1)
    await sheet.getByTestId('browse-close').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // A second pass over the same inventory: the line is "already in" now,
    // and carries the verb rather than nothing.
    sheet = await openBrowseSheet(page)
    await sheet.getByRole('button', { name: 'Mark "Zelt" as packed' }).click()
    await expect(sheet.getByTestId('browse-packed-now')).toHaveText(/packed/i)

    await sheet.getByTestId('browse-close').click()
    await expect(page.getByTestId('m4-progress')).toContainText('1/1')
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)
  })

  /**
   * E2E-M4-63 (FR-25.13f): the way back lives in the line, and it takes the
   * whole write back — an add that is undone leaves no row behind.
   */
  test('E2E-M4-63: the line’s undo takes the decision back (FR-25.13f)', async ({ page }) => {
    await inventory(page, ['Zelt', 'Lampe'])
    await createTripViaWizard(page, TRIP)

    const sheet = await openBrowseSheet(page)
    await sheet.getByRole('button', { name: 'Mark "Lampe" as packed' }).click()
    await expect(sheet.getByTestId('browse-packed-now')).toHaveCount(1)

    await sheet.getByTestId('browse-undo').click()

    // The line is an offer again — which is what makes a different decision
    // on it possible without closing the sheet.
    await expect(sheet.getByTestId('browse-packed-now')).toHaveCount(0)
    await expect(sheet.getByTestId('browse-row').filter({ hasText: 'Lampe' })).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    // The add is gone with it: nothing on the working list, nothing behind
    // the reveal bar either, which is what an undone add has to mean.
    await expect(page.getByTestId('m4-row-Lampe')).toHaveCount(0)
    await expect(page.getByTestId('m4-done-bar')).toBeHidden()
  })

  // E2E-M4-02 (FR-8.2/25.18): the grouping is durable per trip — it arranges
  // rows rather than hiding them, so nothing can be lost behind it.
  test('E2E-M4-02: the grouping choice survives a reload', async ({ page }) => {
    const path = await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await page.getByTestId('m4-filter').click()
    await page.getByTestId('group-person').click()
    await page.getByTestId('filter-close').click()

    await page.goto(path)
    await expect(page.getByTestId('m4-filter-bar')).toContainText(/Person/i)
  })

  // E2E-M4-28 (FR-25.18): the *filter* side is session state. A forgotten
  // filter hides rows, and a hidden row on a packing list reads as "nothing
  // left to do" — so a fresh session starts from the default.
  // Leaving M4 and coming back is the interruption the requirement is
  // about; the *fresh session* half is unit-tested in usePackingFilter,
  // because reaching it here needs a reload, and Local Mode does not
  // restore trip items across one (see the ledger).
  test('E2E-M4-28: the Erledigte switch survives leaving M4 and coming back', async ({ page }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])
    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()

    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // A real round trip: out to the shopping list and back into M4. The
    // first version of this case only *left* M4 and asserted the row was
    // still there — which passed for the wrong reason, because back used
    // to leave the packing list mounted underneath the page it opened.
    await page.getByTestId('m4-nav-shopping').click()
    // Ionic keeps the page it came from mounted, so this asks whether M4
    // is on *screen*, not whether it is in the DOM.
    await expect(page.getByTestId('m4-progress')).toBeHidden()

    await page.getByTestId('header-back').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  // E2E-M4-44 (UI-Spec M4, G-9): the trip is named exactly once, and which
  // of the two places writes it depends on the width. Below the breakpoint
  // the app bar has no room — with six icons beside it the name rendered as
  // "S…" — so it registers no title and the header line leads with the name.
  // Above it the bar takes the title back and the line drops the name.
  test('E2E-M4-44: the trip is named once, in the app bar or in the header line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, TRIP)

    await expect(visible(page).getByTestId('m4-trip-name')).toHaveText(TRIP.name)
    await expect(page.getByTestId('header-title')).toHaveCount(0)

    // It is the app bar's title moved down, so it has to *read* as one: the
    // role class carries the display face (G-13). Asserted on the resolved
    // family rather than on the class attribute, which would pass against a
    // role that was never defined.
    const family = await visible(page)
      .getByTestId('m4-trip-name')
      .evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase())
    expect(family).toContain('fraunces')

    // The positive half the absence needs: the bar *does* render titles, and
    // the back chevron proves it rendered its left slot at all. Without this,
    // a header that failed to mount would pass the assertion above.
    await expect(page.getByTestId('header-back')).toBeVisible()
    await page.getByTestId('m4-nav-shopping').click()
    await expect(page.getByTestId('header-title')).toContainText(TRIP.name)
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-trip-name')).toHaveText(TRIP.name)

    // Widened, the two swap — and the name is still written exactly once.
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByTestId('header-title')).toHaveText(TRIP.name)
    await expect(visible(page).getByTestId('m4-trip-name')).toHaveCount(0)
  })
})

/*
 * E2E-M4-45 runs with motion reduced, and that is a choice rather than a
 * convenience: the header line folds over a max-height transition that also
 * changes the height of the scrolled content, so with it animating the
 * screen spends a few hundred milliseconds in a layout nothing can measure.
 * The case is about where the list comes back to, not about how the line
 * travels, and the app honours the preference (see the reduced-motion block
 * in PackingListPage) — so this is the app's own instant path, not a test
 * that turns off the thing it should be watching.
 */
test.describe('M4 packing list — the list under the sheet @local @m4', () => {
  useReducedMotion(test)

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M4-45 (ADR-012's overlay revision, ADR-046): opening an item is a
  // state of the list's own page — `?item=` on the same route — so the list
  // never leaves the screen and never leaves its offset. Until ADR-046 the
  // item was a path parameter, every open mounted a second list at the top,
  // and a scroll memory carried the offset across the remount; this case
  // was written for that repair and now holds the promise it was repairing.
  // The assertion is on the rendered scroll position, never on the URL.
  test('E2E-M4-45: closing the item sheet returns M4 to where it was scrolled', async ({
    page,
  }) => {
    // Sixteen rows built through the quick-add (spec §2.4) is real work.
    test.slow()
    // A phone, and enough rows that the list is genuinely taller than it.
    await page.setViewportSize({ width: 390, height: 640 })
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, SCROLL_ROWS)

    const content = visible(page).locator('ion-content.pack-content')
    const offset = () =>
      content.evaluate(async (el) => {
        const ionContent = el as unknown as { getScrollElement(): Promise<HTMLElement> }
        return (await ionContent.getScrollElement()).scrollTop
      })

    // One deliberate scroll to a mid-list offset, through ion-content's own
    // API. Deliberately not the bottom: collapsing the header line shortens
    // the scrolled content by its own height, so an offset at the very end
    // is clamped back up again and the line re-opens — a wobble of the
    // screen's own, and not what this case is about.
    const SCROLLED_TO = 200
    await content.evaluate(
      (el, top) =>
        (
          el as unknown as { scrollToPoint(x: number, y: number, d: number): Promise<void> }
        ).scrollToPoint(0, top, 0),
      SCROLLED_TO,
    )

    // Settled, not merely started: the header line folds over a max-height
    // transition, and an offset read while it is still travelling is not an
    // offset the list can hold. The rendered end state is the seam — the
    // wait is on what is painted, never on a clock.
    const header = visible(page).getByTestId('m4-header')
    await expect(header).toHaveClass(/collapsed/)
    await expect(header).toHaveCSS('max-height', '0px')
    expect(await offset()).toBe(SCROLLED_TO)

    // A row wholly inside the *content's* box, so opening it moves nothing by
    // itself: Playwright scrolls whatever it is told to click into view, and
    // a row sitting under the app bar is on the page without being on screen
    // — asking for that one scrolled the list back to the top on WebKit.
    const rowId = await visible(page).evaluate((pageEl) => {
      const box = pageEl.querySelector('ion-content.pack-content')!.getBoundingClientRect()
      const row = [...pageEl.querySelectorAll('[data-testid^="m4-row-"]')].find((el) => {
        const rect = el.getBoundingClientRect()
        return rect.top >= box.top && rect.bottom <= box.bottom
      })
      return row?.getAttribute('data-testid') ?? ''
    })
    expect(rowId).not.toBe('')

    await page.locator(`[data-testid="${rowId}"]`).getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // Read once the sheet is gone: the offset is a settled state of a page
    // that was never replaced, so there is nothing to wait for — a remount
    // (the mutation this case is proved against) is at the top by the time
    // the sheet has closed.
    expect(await offset()).toBe(SCROLLED_TO)
    // …and the header line came back folded with it, which is the other
    // half of "where it was": it holds 84 px of the scrolled content, so a
    // list restored under an open line shows different rows at the same
    // number.
    await expect(visible(page).getByTestId('m4-header')).toHaveClass(/collapsed/)
  })

  /*
   * E2E-G6-01 (G-6): the hold, which is the half of the stepper no test had
   * ever performed.
   *
   * That qty=1 renders a checkbox and qty>1 a stepper is asserted by
   * E2E-M4-56, and that a tap counts without opening M5 by E2E-G6-02. What
   * neither reaches is the shortcut the pattern exists for: holding + packs
   * the lot, holding − takes it all back. Both are `emit`s the row has to
   * be wired to, and a row wired to neither passes every other stepper case.
   *
   * The hold is a press whose *outcome* is waited on — the count is read
   * until it changes, with the button still down — rather than a sleep of
   * the component's own duration.
   */
  test('E2E-G6-01: holding + packs every unit and holding − takes them all back', async ({
    page,
  }) => {
    test.slow()
    // A quantity can only come from a template position (spec §2.4).
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Camping')
    await addPosition(page, 'Heringe')
    await page.keyboard.press('Escape')
    await visible(page).locator('ion-item h2').filter({ hasText: 'Heringe' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-position-close').click()
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)

    await createTripFollowingGroup(page, 'Haltetest', 'Camping')

    const row = visible(page).getByTestId('m4-row-Heringe')
    const count = row.locator('.stepper-count')
    await expect(count).toHaveText('0/3')

    // A tap first, so the hold below is demonstrably doing something a tap
    // does not — one is +1, the other is all of them.
    await row.getByTestId('row-plus').click()
    await expect(count).toHaveText('1/3')

    const hold = async (testid: string, until: string, reads: Locator) => {
      // `hover` first, so the press lands on the button through Playwright's
      // own hit-target check — `mouse.down` at a computed point does not
      // check. And the *outcome* is what the press is held for: no sleep of
      // the component's own duration anywhere.
      await row.getByTestId(testid).hover()
      await page.mouse.down()
      await expect(reads).toContainText(until)
      await page.mouse.up()
    }

    // Holding + packs the lot — and a fully packed row leaves the list
    // (FR-25.2), so the outcome is read on the trip's own counter and on the
    // reveal that now has something to reveal.
    await hold('row-plus', '3/3', visible(page).getByTestId('m4-progress'))
    await expect(visible(page).getByTestId('m4-done-bar')).toBeVisible()
    await visible(page).getByTestId('m4-done-bar').click()
    await expect(count).toHaveText('3/3')

    // And holding − takes all three back in one gesture.
    await hold('row-minus', '0/3', count)
    await expect(visible(page).getByTestId('m4-progress')).toContainText('0/3')
  })

  /*
   * E2E-G12-03 (G-12): the app-bar cluster survives the collapsing header.
   *
   * This is the reason the cluster lives in the bar rather than on the trip
   * line: the line folds to nothing as soon as the list is scrolled, and a
   * search that folded with it would be reachable only from the top of a
   * list you are searching *because* it is long. E2E-M4-45 collapses the
   * same header and asserts what the list does with its offset; nothing had
   * ever reached for the bar afterwards.
   *
   * Tappable is asserted through the *outcome* — the list narrows, the
   * panel opens — because a button that is present and inert would satisfy
   * a visibility check.
   */
  test('E2E-G12-03: search and filter still act once the header has collapsed', async ({
    page,
  }) => {
    // Sixteen rows through the quick-add, as E2E-M4-45 pays for the same
    // scroll (spec §2.4).
    test.slow()
    await page.setViewportSize({ width: 390, height: 640 })
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, SCROLL_ROWS)

    const content = visible(page).locator('ion-content.pack-content')
    await content.evaluate((el) =>
      (
        el as unknown as { scrollToPoint(x: number, y: number, d: number): Promise<void> }
      ).scrollToPoint(0, 200, 0),
    )

    // Settled, not merely started: the line folds over a transition, and the
    // rendered end state is the seam this case waits on.
    const header = visible(page).getByTestId('m4-header')
    await expect(header).toHaveClass(/collapsed/)
    await expect(header).toHaveCSS('max-height', '0px')

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Sache 1')
    // It searched: the row that does not match is gone, the one that does
    // is on screen. Asserting the field alone would pass against a search
    // whose input never reached the list.
    await expect(visible(page).getByTestId('m4-row-Sache 1')).toBeVisible()
    await expect(visible(page).getByTestId('m4-row-Sache 2')).toHaveCount(0)

    // Still open, deliberately: both halves of the cluster have to be
    // reachable from the same collapsed state.
    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
  })

  /*
   * E2E-G12-04 (G-12): what the header line carries, and how many lines it
   * is.
   *
   * The spec sentence promised "a single line" unconditionally and named
   * the filter chip row as absent by default. Read against the screen, both
   * halves are narrower than that: the line is *two* rows on a phone and
   * becomes one only above the G-9 breakpoint, where ADR-011's app bar has
   * already taken the trip name off it; and the chip row is always there,
   * because FR-25.11a/b made it the place the grouping is stated
   * (E2E-M4-15). The clause that survives unchanged is the search field,
   * which is absent until it is opened — and that is what nothing asserted.
   */
  test('E2E-G12-04: the header line is two rows on a phone and one above the breakpoint', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 860 })
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    const header = visible(page).getByTestId('m4-header')
    const ids = header.locator('.trip-id')
    const stats = header.locator('.trip-stats')

    // Default state: no search field. It is the one thing the header gains
    // rather than always carries.
    await expect(page.getByTestId('m4-search-input')).toHaveCount(0)

    const phoneIds = (await ids.boundingBox())!
    const phoneStats = (await stats.boundingBox())!
    expect(phoneStats.y).toBeGreaterThanOrEqual(phoneIds.y + phoneIds.height)

    await page.setViewportSize({ width: 1280, height: 900 })
    // The trip name leaves the line here — the app bar carries it (ADR-011)
    // — which is what makes room for one row.
    await expect(visible(page).getByTestId('m4-trip-name')).toHaveCount(0)
    const wideIds = (await ids.boundingBox())!
    const wideStats = (await stats.boundingBox())!
    expect(Math.abs(wideStats.y - wideIds.y)).toBeLessThan(wideIds.height)

    // Still no search field at either width; opening it is what produces one.
    await expect(page.getByTestId('m4-search-input')).toHaveCount(0)
    await page.getByTestId('m4-search').click()
    await expect(page.getByTestId('m4-search-input')).toBeVisible()
  })

  // E2E-M4-56 (UX pass 2026-08-25, UX-9): the packing control column holds
  // one width whatever it carries, so the name column is straight — before
  // this rule a stepper row started its name 86 px right of a checkbox row.
  // Built through M8 per spec §2.4, because a quantity can only come from a
  // position; measured on rendered boxes, not on the stylesheet.
  test('E2E-M4-56: a checkbox row and a stepper row start the name at the same x', async ({
    page,
  }) => {
    test.slow()
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Camping')
    await addPosition(page, 'Heringe')
    await addPosition(page, 'Lampe')
    await page.keyboard.press('Escape')
    await visible(page).locator('ion-item h2').filter({ hasText: 'Heringe' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-qty-inc').click()
    await page.getByTestId('m8-position-close').click()
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)

    await createTripFollowingGroup(page, 'Spaltenprobe', 'Camping')

    const stepperRow = page.getByTestId('m4-row-Heringe')
    const checkboxRow = page.getByTestId('m4-row-Lampe')
    // The variants really are on screen — without this, a world where both
    // rows render the same control would pass the equality vacuously.
    await expect(stepperRow.getByTestId('row-minus')).toBeVisible()
    await expect(checkboxRow.getByTestId('row-check').locator('ion-checkbox')).toBeVisible()

    const stepperName = await stepperRow.locator('h3').first().boundingBox()
    const checkboxName = await checkboxRow.locator('h3').first().boundingBox()
    expect(stepperName!.x).toBe(checkboxName!.x)

    // The rule behind it: the control column is one width for every row.
    const stepperSlot = await stepperRow.locator('.row-start').boundingBox()
    const checkboxSlot = await checkboxRow.locator('.row-start').boundingBox()
    expect(stepperSlot!.width).toBe(checkboxSlot!.width)
  })

  /*
   * E2E-M4-57 (G-12, UX-13): the bar keeps the actions used while packing
   * and puts the once-per-trip ones behind the ⋮, where they are read as
   * words. Before it, six glyphs plus the gear sat in a bar that on a phone
   * had already given up its title to make room.
   */
  test('E2E-M4-57: the rare trip actions move behind the bar menu', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Elba' })
    await expect(visible(page).getByTestId('m4-header')).toBeVisible()

    // What stays: the three tapped while packing.
    await expect(page.getByTestId('m4-search')).toBeVisible()
    await expect(page.getByTestId('m4-filter')).toBeVisible()
    await expect(page.getByTestId('m4-fold-all')).toBeVisible()
    // What went: no longer a glyph of its own.
    await expect(page.getByTestId('m4-edit')).toHaveCount(0)
    await expect(page.getByTestId('m4-start')).toHaveCount(0)

    await page.getByTestId('header-overflow').click()

    // Named, not merely present — the whole reason for the menu.
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Trip properties')
    await expect(sheet).toContainText('Start trip')

    // And it acts: the properties entry lands on the rendered edit screen.
    await sheet.getByText('Trip properties').click()
    await expect(visible(page).getByTestId('trip-edit-name')).toBeVisible()

    /*
     * By role, not only by test id — and that distinction is the case's
     * sharpest half. While an overlay is up Ionic marks the router outlet
     * `aria-hidden`; an action that navigates from inside the sheet's own
     * handler races the teardown and the flag stays behind, leaving the
     * screen fully painted, fully clickable and absent from the
     * accessibility tree. Every pixel assertion above stays green through
     * that. This one does not.
     */
    await expect(visible(page).getByRole('textbox').first()).toBeVisible()
  })
})

test.describe('M4 packing list — the rendered remainder @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-25, with E2E-M4-08 (FR-7.3/25.2): the preparation lifecycle, end to
   * end on the list.
   *
   * `packingView.spec.ts` covers the arithmetic — a packed row with open prep
   * is not done. This is the rendered half, and it is where the defect the FR
   * was amended for actually showed: open-prep must be derived from the todos
   * at read time, and the prototype's stored count meant that resolving the
   * last todo left the row on the list forever. Resolving the badge away and
   * watching the row leave is the only assertion that catches that.
   */
  test('E2E-M4-08, E2E-M4-25: a packed row with open prep stays on the list until the todo is resolved', async ({
    page,
  }) => {
    const TODO = 'Akku laden'
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Kamera'])

    await page.getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId('m5-todo-input').locator('input').fill(TODO)
    await page.getByTestId('m5-todo-add').click()
    await expect(page.getByTestId(`m5-todo-${TODO}`)).toBeVisible()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // E2E-M4-08: the row carries the badge, counting what is open.
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toContainText('1')

    await visible(page).getByTestId('m4-row-Kamera').getByTestId('row-check').click()

    // Packed, and still on the working list: work remains. The reveal bar is
    // the positive signal for "nothing is done" — its absence is what would
    // otherwise be indistinguishable from a list that failed to update.
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-done-bar')).toHaveCount(0)

    await visible(page).getByTestId('m4-row-Kamera').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await page.getByTestId(`m5-todo-${TODO}`).click()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    // The last todo resolved: the row is done and leaves.
    await expect(visible(page).getByTestId('m4-row-Kamera')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-done-bar')).toBeVisible()

    // Revealed, it comes back without a badge — the badge counts *open* prep,
    // so a badge surviving its todo would be the stored-count defect again.
    await visible(page).getByTestId('m4-done-bar').click()
    await expect(visible(page).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(page).getByTestId('m4-prep-badge-Kamera')).toHaveCount(0)
  })

  /**
   * E2E-M4-24 (FR-25.17): the packing stamp, and that it never outlives the
   * state it describes.
   *
   * Local Mode has no account, so `packed_by_user_id` is null here and the
   * stamp reads its time alone — the *name* half is the server's answer and is
   * asserted in `server/multi-user.spec.ts` (E2E-FLOW-01), where the server
   * stamps the column itself (invariant 3). What this case owns is the half
   * that has no account in it: the stamp appears with the pack, and un-packing
   * takes it back.
   */
  test('E2E-M4-24: a packed row says when, and un-packing takes the stamp back', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await visible(page).getByTestId('m4-row-Zelt').getByTestId('row-check').click()
    await visible(page).getByTestId('m4-done-bar').click()

    const row = visible(page).getByTestId('m4-row-Zelt')
    await expect(row.getByTestId('m4-packed-stamp')).toBeVisible()
    // A time, not merely a rendered element: a stamp with nothing in it would
    // satisfy visibility and say nothing.
    await expect(row.getByTestId('m4-packed-stamp')).toContainText(/\d{1,2}[:.]\d{2}/)

    // The same record on M5, which the UI-Test-Spec calls an M5 case and
    // nothing had ever driven: read-only there, because the server stamps
    // it and no control may pick it (invariant 3).
    await row.getByRole('heading').click()
    await page.getByTestId('m5-details').click()
    await expect(page.getByTestId('m5-stamp')).toContainText(/\d{1,2}[:.]\d{2}/)
    await expect(page.getByTestId('m5-stamp').locator('ion-select, input, button')).toHaveCount(0)
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await row.getByTestId('row-check').click()

    // Back on the working list, and the stamp is gone with the state it
    // described. The row still being there is the positive half — a stamp that
    // vanished with its row would satisfy the first assertion alone.
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(visible(page).getByTestId('m4-packed-stamp')).toHaveCount(0)
  })

  /**
   * E2E-M4-11 (FR-3.2): the shopping badge counts, and stays away when there is
   * nothing to buy.
   *
   * The entry itself is always there — M6 is a screen, not a notification — so
   * the badge is the part that carries information, and a badge that renders a
   * zero is worse than none.
   */
  test('E2E-M4-11: the shopping entry carries a count only once something is to be bought', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    const nav = visible(page).getByTestId('m4-nav-shopping')
    await expect(nav).toBeVisible()
    await expect(nav.locator('ion-badge')).toHaveCount(0)

    // Turning the row into a purchase is what puts it on M6 (FR-3.2).
    await visible(page).getByTestId('m4-row-Zelt').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    // The mode sits behind FR-25.7's disclosure, like every other detail.
    await page.getByTestId('m5-details').click()
    await page.getByTestId('m5-mode').click()
    await page
      .locator('ion-popover ion-select-popover ion-item')
      .filter({ hasText: /buy|Kaufen/i })
      .first()
      .click()
    await page.getByTestId('m5-close').click()
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)

    await expect(visible(page).getByTestId('m4-nav-shopping').locator('ion-badge')).toHaveText('1')
  })

  /**
   * E2E-M4-19 (FR-25.11f): the Person facet's absence bucket has a word of its
   * own.
   *
   * Only the wording is here. That the bucket *leads* its facet is asserted in
   * `domain/packingView.spec.ts`, which is where the sort lives; repeating it
   * through the browser would re-run a covered rule at a hundred times the
   * cost. What the unit deliberately does not decide is the word — it labels
   * the values it can and leaves UI copy to the caller — so the caller is
   * where the word has to be checked.
   *
   * The failure it guards is generic: three facets address absence with the
   * same empty value, and one shared label makes the Person facet read as "no
   * category". "Alle" is the other wrong answer the FR names — the bucket means
   * *nobody in particular*, not *everybody*.
   */
  test('E2E-M4-19: the Person facet names its shared bucket, and not the way the others do', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await quickAdd(page, ['Zelt'])

    await page.getByTestId('m4-filter').click()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()

    const person = page.getByTestId('facet-person-')
    const category = page.getByTestId('facet-category-')
    await expect(person).toBeVisible()
    await expect(category).toBeVisible()

    const shared = ((await person.textContent()) ?? '').trim()
    expect(shared).not.toMatch(/^(alle|all)\b/i)
    // The comparison is the assertion: "a word of its own" is a claim about two
    // labels, and asserting one string alone would pass against a shared one.
    expect(shared).not.toBe(((await category.textContent()) ?? '').trim())
  })
})

/**
 * FR-20.4's missing sentence and FR-9.4's silent card, both ruled *build it*
 * by the owner on 2026-08-31.
 */
test.describe('M4 — what the quick-add says about what it took along @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-66 (FR-20.4/20.2): quick-adding an item pulls its required
   * companions **and says so**.
   *
   * `addRequiredCompanions` returned nothing and no caller raised anything, so
   * the companions simply appeared on the list — while FR-20.2's *skip* names
   * exactly what it took along, and it is that contrast which made the silence
   * read as an omission rather than as a decision (E2E-M4-32's third clause,
   * retired 2026-08-30 with the finding).
   */
  test('E2E-M4-66: the quick-add names the required companions it pulled in', async ({ page }) => {
    // Built through M10's own form: a dependency written straight into the
    // store would assert the pull against a relation the app cannot make.
    await createMasterItem(page, 'Kamera')
    await createMasterItem(page, 'Ersatzakku')
    // The editor is open on the Ersatzakku, which is the side that declares
    // the relation; *required* is the default mode (FR-20.1).
    await visible(page).getByTestId('m10-add-dependency').click()
    await visible(page).getByTestId('m10-dependency-main-Kamera').click()
    await expect(visible(page).getByTestId('m10-dependency-mode-Kamera')).toBeVisible()

    await createTripViaWizard(page, { name: 'Fotoreise' })
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Kame')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Kamera' }).click()

    // The companion is on the list…
    await expect(visible(page).getByTestId('m4-row-Ersatzakku')).toBeVisible()
    // …and the app said so, naming it. A bare count would send the reader
    // looking for what changed, which is the whole complaint.
    const notice = page.locator('ion-toast').filter({ hasText: 'Ersatzakku' })
    await expect(notice).toBeVisible()

    // An item with no companions says nothing: the positive signal against a
    // snackbar that always fires.
    await page.getByTestId('quick-add-input').locator('input').fill('Sonnencreme')
    await page.getByTestId('quick-add-confirm').click()
    await expect(visible(page).getByTestId('m4-row-Sonnencreme')).toBeVisible()
    await expect(page.locator('ion-toast').filter({ hasText: 'Sonnencreme' })).toHaveCount(0)
  })
})

/**
 * FR-25.4a's quiet default. The mapping mode → glyph moved into
 * `lib/modeLabels.ts`; the dense-list rule that used to be M4's private
 * `modeIcon` became an option there, and an option can be forgotten at a
 * call site in a way a private function cannot.
 */
test.describe('M4 — the row says how an item is obtained, unless it is the usual way @local @m4', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /**
   * E2E-M4-67 (FR-25.4a): a row that is bought carries the mode glyph; a row
   * that is packed carries none, because 🧳 is what every other row means.
   *
   * The two halves are one mechanism — the same `title` on the same icon — so
   * the buy row is the positive signal that makes the pack row's silence
   * falsifiable rather than merely unrendered.
   */
  test('E2E-M4-67: only the unusual mode is drawn on a dense row', async ({ page }) => {
    await createTripViaWizard(page, { name: 'Samedan Sommer' })
    await quickAdd(page, ['Zahnpasta', 'Socken'])

    // Set through M5's own select — the only path the app offers.
    await visible(page).getByTestId('m4-row-Zahnpasta').click()
    await page.getByTestId('m5-details').click()
    await chooseInSelect(page, 'm5-mode', 'Buy before')
    await page.getByTestId('m5-close').click()

    const bought = visible(page).getByTestId('m4-row-Zahnpasta')
    const packed = visible(page).getByTestId('m4-row-Socken')
    await expect(bought).toBeVisible()

    // The mode that is worth saying is said…
    await expect(bought.getByTitle('Buy before')).toHaveCount(1)
    // …and the one that goes without saying is not, on the very same row
    // shape that just proved the glyph renders.
    await expect(packed.getByTitle('Pack')).toHaveCount(0)
  })
})
