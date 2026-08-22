import { test, expect, createTripViaWizard, openQuickAdd, visiblePage as visible } from './fixtures'
import type { Page } from '@playwright/test'

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
    await page.goto('/portable-import')
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
    await page.goto('/portable-import')
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
    // There is no confirm affordance at all — not hidden, absent.
    await expect(page.getByTestId('filter-apply')).toHaveCount(0)

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
    await page.goto('/tabs/items')
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
    await page.goto('/tabs/items')
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
      await page.goto('/tabs/items')
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
test.describe('M4 packing list — scroll memory @local @m4', () => {
  test.use({ reducedMotion: 'reduce' })

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M4-45 (ADR-012's overlay amendment): the sheet's URL is an *alias*
  // of the trip route and opening it `replace`s — which re-renders the list
  // and returned it to the top. The ADR recorded that as a carried cost and
  // named the repair ("remember M4's offset per trip"); this case is it.
  // The assertion is on the rendered scroll position, never on the URL, and
  // it waits on the page's own restoration signal rather than on a clock.
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

    // The signal the production code owes: it appears once an offset has
    // actually been re-applied, so there is something to wait on.
    await expect(content).toHaveAttribute('data-scroll-restored', 'true')
    expect(await offset()).toBe(SCROLLED_TO)
    // …and the header line came back folded with it, which is the other
    // half of "where it was": it holds 84 px of the scrolled content, so a
    // list restored under an open line shows different rows at the same
    // number.
    await expect(visible(page).getByTestId('m4-header')).toHaveClass(/collapsed/)
  })
})
