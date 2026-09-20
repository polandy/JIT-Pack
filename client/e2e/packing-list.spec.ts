import {
  addInComposer,
  confirmCreateSheet,
  test,
  expect,
  createTripViaWizard,
  openTripView,
  openQuickAdd,
  chooseInSelect,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'
import { FAB_ANCHOR } from './fabAnchors'
import { PATH } from './routes'
import { M4_TRIP, chooseInRowMenu, openRowMenu, quickAddRows, tripWithRows } from './helpers/m4'
import { createItem } from './helpers/m9'

/**
 * M4 — the packing list itself (UI-Test-Spec §4, unit "M4 packing list").
 *
 * Local Mode throughout: M4's own behaviour is client-side, so it needs no
 * backend, and the cases that genuinely need one (remote pack attribution,
 * delegation notifications) are marked `server` in the spec and are not here.
 *
 * This file held every M4 case until 2026-09-20, when it was 960 of the
 * suite's 6249 test-seconds — one file worth 15 % of the run, which is what
 * defeats any attempt to balance the CI legs (dev-docs/implementation-log.md,
 * "The CI legs were split by counting, not by timing"). What is left here is
 * the list and its rows; its neighbours are named in that entry.
 *
 * What is deliberately *not* covered yet, and why — the ledger repeats it:
 * every facet case beyond the panel's own structure needs rows that carry a
 * category, a traveler or a buy mode, and none of those can be set from M4
 * today. They land with M5 and the M9/M10 rebuild, which is what produces
 * such rows through the app's own paths (spec §2.4).
 */

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Schlafsack', 'Kocher'])

    await expect(page.getByTestId('m4-progress')).toContainText('0/3')

    await page.getByTestId('m4-search').click()
    await page.getByTestId('m4-search-input').fill('Zelt')

    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-row-Kocher')).toHaveCount(0)
    // The point of the case: the count did not follow the list.
    await expect(page.getByTestId('m4-progress')).toContainText('0/3')
  })

  // E2E-M4-04 (FR-5.6, FR-25.13a): the visible confirm button is the commit,
  // and the form stays open for the next row. The name is new to the
  // inventory, so the commit goes through the create sheet (FR-24.11).
  test('E2E-M4-04: the FAB opens the quick-add, which commits by button and stays open', async ({
    page,
  }) => {
    await createTripViaWizard(page, M4_TRIP)

    await openQuickAdd(page)
    const input = page.getByTestId('quick-add-input').locator('input')
    await input.fill('Zelt')
    await expect(visible(page).getByTestId('quick-add-offer-title')).toContainText('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await confirmCreateSheet(page, 'Zelt')

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
    await createTripViaWizard(page, M4_TRIP)

    await expect(page.getByTestId('m4-fab')).toBeVisible()
    await openQuickAdd(page)

    await expect(page.getByTestId('m4-fab')).toHaveCount(0)
    // The anchor survives the button: M4 positions its FR-25.2 undo snackbar
    // against the fab *container*, so hiding the whole IonFab would drop the
    // snackbar behind the tab bar — the M7/M8 defect of 2026-08-15.
    await expect(page.locator(`#${FAB_ANCHOR.m4}`)).toHaveCount(1)

    // Adding does not bring it back — the composer stays open (FR-25.13), so
    // the ＋ still has nothing to do.
    await addInComposer(page, 'Zelt')
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

    // The body of the same row is what opens the sheet — asserted on the
    // rendered sheet, not on the URL, which since ADR-046 is the list's own.
    await row.getByRole('heading').click()
    await expect(page.getByTestId('m5-sheet')).toBeVisible()
    await expect(page.getByText('not found')).toHaveCount(0)
  })

  // E2E-G6-03 (G-6, owner report 2026-09-19: "beim Packen trifft man die
  // Checkbox zu wenig gut"): the checkbox's target was the glyph and nothing
  // around it, and the 44 px column it sat in swallowed every tap that
  // missed — a near miss neither packed the row nor opened it. The click
  // lands off the glyph on purpose: at its centre the case would pass
  // before the fix as well.
  test('E2E-G6-03: a tap beside the checkbox still packs the row', async ({ page }) => {
    await tripWithRows(page, ['Zelt', 'Lampe'], 'Zielprobe')

    // Two near misses: left of the glyph, into the column that used to
    // swallow the tap, and just below the checkbox's own 44 px box, where
    // the tap used to open M5 instead.
    const zelt = await page
      .getByTestId('m4-row-Zelt')
      .getByTestId('row-check')
      .locator('ion-checkbox')
      .boundingBox()
    await page.mouse.click(zelt!.x - 10, zelt!.y + zelt!.height / 2)
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)

    const lampeRow = page.getByTestId('m4-row-Lampe')
    const lampe = await lampeRow.getByTestId('row-check').locator('ion-checkbox').boundingBox()
    const edge = await lampeRow.boundingBox()
    const below = lampe!.y + lampe!.height + 1
    expect(below).toBeLessThan(edge!.y + edge!.height - 1)
    await page.mouse.click(lampe!.x + lampe!.width / 2, below)

    await expect(page.getByTestId('packing-empty')).toContainText('🎉')
    await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
  })

  // E2E-M4-18 (FR-25.11e): "Alles gepackt" may appear only when nothing is
  // narrowing the list. The regression this guards actually happened: the
  // check looked at the filter count alone, so an unmatched *search*
  // announced completion.
  test('E2E-M4-18: an unmatched search says "no matches", not "all packed"', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Kocher'])

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Kocher'])

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Kocher'])

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt', 'Kocher'])

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

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

    await createTripViaWizard(page, M4_TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-filter-bar')).toContainText(/Category/i)

    await openTripView(page, 'analytics')
    // The button, not the label inside it: the segment button swallows a
    // click aimed at its own `ion-label`.
    await page.getByTestId('analytics-dim-person').click()
    await page.getByTestId('analytics-slice-none').click()
    await page.getByTestId('analytics-open-list').click()

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

    await createTripViaWizard(page, M4_TRIP)
    await openQuickAdd(page)
    const input = page.getByTestId('quick-add-input').locator('input')
    await input.fill('Zel')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // Same query again: the positive signal for the absent suggestion is
    // FR-24.11's offer, which renders in the same pass as the suggestions.
    await input.fill('Zel')
    await expect(visible(page).getByTestId('quick-add-offer-title')).toContainText('Zel')
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

    await createTripViaWizard(page, M4_TRIP)
    await openQuickAdd(page)
    const input = page.getByTestId('quick-add-input').locator('input')
    // Via the suggestion, so the row carries its master-item provenance.
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

    await createTripViaWizard(page, M4_TRIP)
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
    await createTripViaWizard(page, M4_TRIP)

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
    await createTripViaWizard(page, M4_TRIP)

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
    await createTripViaWizard(page, M4_TRIP)

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
    await createTripViaWizard(page, M4_TRIP)

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

  /**
   * E2E-M4-83 (FR-25.13i): a decision outlives the sheet, and so must the way
   * back out of it.
   *
   * The case is written across a **close and reopen** on purpose: that is the
   * exact boundary FR-25.13f's line-local „Rückgängig" could not cross, and
   * the reason the settled line needed a control of its own. The assertions on
   * M4 afterwards are what separate a reset from a line that merely stopped
   * saying „staying home" — the row has to be back on the working list.
   */
  test('E2E-M4-83: a settled line can be reset after the sheet was reopened (FR-25.13i)', async ({
    page,
  }) => {
    await inventory(page, ['Zelt', 'Lampe'])
    await createTripViaWizard(page, M4_TRIP)

    let sheet = await openBrowseSheet(page)
    await sheet.getByRole('button', { name: 'Deliberately leave "Zelt" behind' }).click()
    await expect(sheet.getByTestId('browse-skipped-now')).toHaveCount(1)
    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // The run's ledger died with the modal: the line now renders from the trip
    // alone, states its decision, and carries FR-25.13i's reset instead of the
    // undo it no longer has.
    sheet = await openBrowseSheet(page)
    const zelt = sheet.getByTestId('browse-row-carried').filter({ hasText: 'Zelt' })
    await expect(zelt.getByTestId('browse-settled')).toHaveText(/staying home/i)
    await expect(sheet.getByTestId('browse-undo')).toHaveCount(0)

    await zelt.getByTestId('browse-reopen').click()

    // What is left is an ordinary carried line — so a second decision is one
    // tap away, which is the point of resetting rather than deleting.
    await expect(zelt.getByTestId('browse-carried-state')).toHaveText(/already in/i)
    await expect(zelt.getByTestId('browse-pack')).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    // Back on the working list at amount one, not behind the reveal bar: the
    // skip is undone on the row, not only in the sheet's wording.
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-row-Zelt')).not.toContainText(/deliberately skipped/i)
    await expect(page.getByTestId('m4-done-bar')).toBeHidden()
  })

  /**
   * E2E-M4-84 (FR-25.13i): the filter that makes the reset reachable — in a
   * real inventory the decided lines are scattered through the whole list, so
   * a control nothing can find is a control nobody has.
   */
  test('E2E-M4-84: the sheet can show what has been decided, and nothing else (FR-25.13i)', async ({
    page,
  }) => {
    await inventory(page, ['Zelt', 'Lampe', 'Kocher'])
    await createTripViaWizard(page, M4_TRIP)

    let sheet = await openBrowseSheet(page)
    await sheet.getByRole('button', { name: 'Mark "Lampe" as packed' }).click()
    await sheet.getByRole('button', { name: 'Deliberately leave "Zelt" behind' }).click()
    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    sheet = await openBrowseSheet(page)
    await expect(sheet.getByTestId('browse-settled-count')).toHaveText('2 decided')
    await sheet.getByTestId('browse-settled-toggle').click()

    // Only the two decisions are left: Kocher, which nothing was decided
    // about, is what the filter takes away.
    await expect(sheet.getByTestId('browse-settled')).toHaveCount(2)
    await expect(sheet.getByTestId('browse-row')).toHaveCount(0)
    // FR-25.13e's switch steps aside rather than sitting there doing nothing.
    await expect(sheet.getByTestId('browse-hide-toggle')).toHaveCount(0)

    await sheet
      .getByTestId('browse-row-carried')
      .filter({ hasText: 'Lampe' })
      .getByTestId('browse-reopen')
      .click()
    await sheet
      .getByTestId('browse-row-carried')
      .filter({ hasText: 'Zelt' })
      .getByTestId('browse-reopen')
      .click()

    // FR-25.13e's snapshot rule, which this filter inherits: a reset line
    // stays where it is and flips to „schon drin" rather than dropping out of
    // the list — a row vanishing here would reflow the next one into the
    // finger mid-pass. The count is the live one, so it says what is left.
    await expect(sheet.getByTestId('browse-row-carried')).toHaveCount(2)
    await expect(sheet.getByTestId('browse-carried-state')).toHaveCount(2)
    await expect(sheet.getByTestId('browse-settled-count')).toHaveText('0 decided')

    await sheet.getByTestId('browse-settled-toggle').click()
    await expect(sheet.getByTestId('browse-row').filter({ hasText: 'Kocher' })).toBeVisible()

    await sheet.getByTestId('browse-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    // Both decisions really were reset: two open rows, nothing packed and
    // nothing left at home.
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-row-Lampe')).toBeVisible()
    await expect(page.getByTestId('m4-progress')).toContainText('0/2')
  })

  // E2E-M4-02 (FR-8.2/25.18): the grouping is durable per trip — it arranges
  // rows rather than hiding them, so nothing can be lost behind it.
  test('E2E-M4-02: the grouping choice survives a reload', async ({ page }) => {
    const path = await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])

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
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zelt'])
    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').click()

    await page.getByTestId('m4-done-bar').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // A real round trip: out to the shopping list and back into M4. The
    // first version of this case only *left* M4 and asserted the row was
    // still there — which passed for the wrong reason, because back used
    // to leave the packing list mounted underneath the page it opened.
    await openTripView(page, 'shopping')
    // Ionic keeps the page it came from mounted, so this asks whether M4
    // is on *screen*, not whether it is in the DOM.
    await expect(page.getByTestId('m4-progress')).toBeHidden()

    await page.getByTestId('header-back').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  })

  // E2E-M4-44 (UI-Spec M4, G-9, ADR-050): the trip is named exactly once,
  // in the page's own head, and at every width. It used to be named in two
  // places depending on the viewport — the app bar above the breakpoint,
  // M4's header line below it, because beside six icons at 390 px the name
  // rendered as "S…". The bar no longer names any page, so the width no
  // longer decides anything, and the header line carries figures alone.
  test('E2E-M4-44: the trip is named once, in the page head, at either width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createTripViaWizard(page, M4_TRIP)

    await expect(page.getByTestId('header-title')).toHaveText(M4_TRIP.name)
    // Once: the header line below it states figures, not the name again.
    await expect(visible(page).getByTestId('m4-header')).not.toContainText(M4_TRIP.name)

    // It reads as a page title, so it has to *be* one: the role class carries
    // the display face (G-13). Asserted on the resolved family rather than on
    // the class attribute, which would pass against a role never defined.
    const family = await page
      .getByTestId('header-title')
      .evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase())
    expect(family).toContain('fraunces')

    // A sub-screen names itself and puts the trip on its second line — the
    // fact the composed "Luggage · Samedan" title used to carry in one string.
    await openTripView(page, 'shopping')
    await expect(page.getByTestId('header-title')).toHaveText('Shopping')
    await expect(page.getByTestId('header-meta')).toHaveText(M4_TRIP.name)
    await page.getByTestId('header-back').click()
    await expect(page.getByTestId('header-title')).toHaveText(M4_TRIP.name)

    // Widened, nothing swaps: the head is the one place either way.
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByTestId('header-title')).toHaveText(M4_TRIP.name)
    await expect(visible(page).getByTestId('m4-header')).not.toContainText(M4_TRIP.name)
  })

  /**
   * E2E-M4-87 (FR-25.25): the late-packer flag, set from the row.
   *
   * It had lived in M5 alone — four taps and a scroll for one boolean that a
   * person sets on half a dozen rows in one pass. The rendered ⏰ is the
   * evidence the write landed; the menu's *next* offer is the evidence it
   * read the row back rather than merely painting a glyph.
   */
  test('E2E-M4-87: a row is made a late packer from its own menu', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zahnbürste'])

    const row = visible(page).getByTestId('m4-row-Zahnbürste')
    await expect(row.getByTestId('row-late')).toHaveCount(0)

    await openRowMenu(page, 'Zahnbürste')
    await chooseInRowMenu(page, /late packer on/i)
    await expect(row.getByTestId('row-late')).toBeVisible()

    // The way back is offered in its place — the entry states the row's
    // state, so a menu built from a stale row would still say "on".
    await openRowMenu(page, 'Zahnbürste')
    await expect(
      page.locator('ion-action-sheet').getByRole('button', { name: /late packer on/i }),
    ).toHaveCount(0)
    await chooseInRowMenu(page, /late packer off/i)
    await expect(row.getByTestId('row-late')).toHaveCount(0)
  })

  /**
   * E2E-M4-119 (FR-5.9): a row is switched to *buy there* from its own menu.
   *
   * The mode had lived in M5 alone. The badge is the row reading its mode
   * back; M6's *Vor Ort* tab is the same write reaching the other screen
   * that reads it — a badge painted from the menu's own state would pass
   * the first and fail the second.
   */
  test('E2E-M4-119: a row is bought at the destination from its own menu', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Sonnencreme'])

    const row = visible(page).getByTestId('m4-row-Sonnencreme')
    await expect(row.getByTitle('Buy there')).toHaveCount(0)

    await openRowMenu(page, 'Sonnencreme')
    await chooseInRowMenu(page, /^buy there$/i)
    await expect(row.getByTitle('Buy there')).toHaveCount(1)

    await openTripView(page, 'shopping')
    await page.getByTestId('m6-tab-local').click()
    await expect(visible(page).getByTestId('m6-row')).toHaveText([/Sonnencreme/])
    await page.getByTestId('header-back').click()

    // The way back stands in its place, read from the row rather than from
    // the menu that wrote it.
    await openRowMenu(page, 'Sonnencreme')
    await expect(
      page.locator('ion-action-sheet').getByRole('button', { name: /^buy there$/i }),
    ).toHaveCount(0)
    await chooseInRowMenu(page, /take it along instead/i)
    await expect(
      visible(page).getByTestId('m4-row-Sonnencreme').getByTitle('Buy there'),
    ).toHaveCount(0)

    // FR-25.31: like every act on the list, the switch is taken back from its
    // snackbar — and the badge returning is the row reading the undo back.
    await page
      .locator('ion-toast.pack-toast:not(.overlay-hidden)')
      .filter({ hasText: /taken along after all/i })
      .getByRole('button', { name: /undo/i })
      .click()
    await expect(
      visible(page).getByTestId('m4-row-Sonnencreme').getByTitle('Buy there'),
    ).toHaveCount(1)
  })

  /**
   * E2E-M4-89 (FR-25.25, G-8): the assignment control is absent in Local
   * Mode, where there are no accounts to hand a row to.
   *
   * The positive half of this pair is E2E-SRV-11, which assigns from the row
   * in Server Mode: an absence asserted alone would also pass against a build
   * where the control was never wired up anywhere.
   */
  test('E2E-M4-89: Local Mode offers no assignment on the row (G-8)', async ({ page }) => {
    await createTripViaWizard(page, M4_TRIP)
    await quickAddRows(page, ['Zahnbürste'])

    const row = visible(page).getByTestId('m4-row-Zahnbürste')
    await expect(row).toBeVisible()
    await expect(row.getByTestId('m4-assign-Zahnbürste')).toHaveCount(0)
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
    await quickAddRows(page, ['Zahnpasta', 'Socken'])

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
