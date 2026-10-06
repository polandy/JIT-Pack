import { test, expect, visiblePage } from './fixtures'
import { backToInventory, createItem, groupHeadings, openViewSheet } from './helpers/m9'
import { PATH } from './routes'

/**
 * M9 — the inventory's list on the tag set (§3.24, FR-24.2/24.4/24.8), and its
 * empty state (G-7).
 *
 * What is worth an end-to-end case here is exactly what a unit test cannot
 * see: that an item on two tags renders as *one* row under its primary tag,
 * that the eye-icon preference actually changes the painted row, and that the
 * chips and the heading's jump move the list the user is looking at. The
 * ordering arithmetic itself lives in `domain/__tests__/tags`.
 *
 * Local Mode throughout: the inventory is backend-free, and the mode with no
 * server is where a missing client-side rule shows up.
 */

test.describe('M9 inventory — lean list on the tag set (FR-24.2/24.4)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  test('E2E-M9-01: an item on two tags renders once, under its primary tag', async ({ page }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidung', 'Sommer'] })
    await backToInventory(page)

    const list = visiblePage(page)
    // The row exists exactly once across the whole list — the guarantee
    // FR-24.2 buys, and the one a naive "file under every tag" would break.
    await expect(list.getByTestId('m9-row').filter({ hasText: 'Badehose' })).toHaveCount(1)

    // ...and it sits under the first tag it was given, not the second.
    expect(await groupHeadings(list)).toContain('kleidung')
    expect(await groupHeadings(list)).not.toContain('sommer')
  })

  test('E2E-M9-06: the tag chip filters on any tag, not only the primary one', async ({ page }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidung', 'Sommer'] })
    await backToInventory(page)
    await createItem(page, 'Kabel', { tags: ['Technik'] })
    await backToInventory(page)

    const list = visiblePage(page)
    await expect(list.getByTestId('m9-row')).toHaveCount(2)

    // Sommer is the swimsuit's *second* tag; filtering by it must still
    // surface the row — that reach is the point of the tag set. The control
    // is one of FR-24.8's three chips; it was a segment button until then.
    await list.getByTestId('m9-tag-chip-Sommer').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Badehose')
  })

  test('E2E-M9-05: the list is lean until the view sheet’s chips say otherwise', async ({
    page,
  }) => {
    await createItem(page, 'Wanderschuhe', { tags: ['Schuhe'], weight: '900' })
    await backToInventory(page)

    const row = visiblePage(page).getByTestId('m9-row').first()
    // Lean by default: the weight exists on the item but not on the row.
    await expect(row).not.toContainText('900 g')

    // The properties are chips in the head of „Ansicht & Filter" (UX-05),
    // and the chip says it is off before the tap — the positive signal the
    // pressed state below is asserted against.
    const sheet = await openViewSheet(page)
    const weight = sheet.getByTestId('m9-property-weight')
    await expect(weight).toHaveAttribute('aria-pressed', 'false')
    await weight.click()
    await expect(weight).toHaveAttribute('aria-pressed', 'true')
    await sheet.getByTestId('m9-filter-apply').click()
    await expect(sheet).not.toHaveAttribute('data-presented', 'true')

    // The painted row changed — not merely the stored preference.
    const shown = visiblePage(page).getByTestId('m9-row').first()
    await expect(shown).toContainText('900 g')
    // *Exactly* those: enabling one property must not paint the other two,
    // which is the whole reason FR-24.4 is three switches and not one.
    await expect(shown).not.toContainText('Schuhe')
  })

  /**
   * E2E-M9-14 (FR-24.8): the axis is gone, and what replaced it can do the
   * two things it could not — name how many items a tag holds, and hold two
   * tags at once.
   */
  test('E2E-M9-14: three chips, a sheet behind them, and two tags at once', async ({ page }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidung', 'Sommer'] })
    await backToInventory(page)
    await createItem(page, 'Sonnenhut', { tags: ['Sommer'] })
    await backToInventory(page)
    await createItem(page, 'Kabel', { tags: ['Technik'] })
    await backToInventory(page)

    const list = visiblePage(page)
    // The swipe axis is not merely hidden: the screen renders no segment at
    // all. Asserted on the element rather than on a test id — an absence
    // assertion against an id nothing declares is green whatever the app does,
    // which is what `scripts/testid-gate.mjs` refuses.
    await expect(list.locator('ion-segment')).toHaveCount(0)

    // A chip says what it leads to — the axis never carried a count.
    await expect(list.getByTestId('m9-tag-chip-Sommer')).toContainText('2')

    await list.getByTestId('m9-tag-chip-Sommer').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(2)

    // Two tags, and the question the single-select axis could not ask.
    await list.getByTestId('m9-tag-chip-Kleidung').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(2)
    await list.getByTestId('m9-filter-open').click()
    await expect(page.getByTestId('m9-filter-sheet')).toHaveAttribute('data-presented', 'true')
    await page.getByTestId('m9-filter-mode-all').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Badehose')

    // The sheet's own count is the list's, not a second arithmetic. Written
    // out at one, which is the singular arm of the catalogue entry.
    await expect(page.getByTestId('m9-filter-apply')).toContainText('one item')
    await page.getByTestId('m9-filter-close').click()
    // A sheet declared with `:is-open` stays in the DOM and is marked hidden,
    // so the settled signal is the presentation attribute, not the element.
    await expect(page.getByTestId('m9-filter-sheet')).not.toHaveAttribute('data-presented', 'true')
  })

  /**
   * E2E-M9-15 (FR-24.8): what the axis was actually used for. The jump moves
   * the list and takes nothing out of it: scrolling, not anchoring.
   */
  test('E2E-M9-15: the group heading jumps without filtering anything away', async ({ page }) => {
    test.slow()
    // Twelve rows in four groups, on a short viewport: the list has to be
    // *tall* for this case to mean anything. While the sheet is up Ionic
    // locks the scroll host, so a jump issued into that lock is clamped to
    // what is already reachable — on a short list that is the whole distance,
    // and the case would pass against the defect it exists for.
    for (const [name, tag] of [
      ['Anorak', 'Aussen'],
      ['Buff', 'Aussen'],
      ['Campingkocher', 'Aussen'],
      ['Daunenjacke', 'Camping'],
      ['Eispickel', 'Camping'],
      ['Faltmatte', 'Camping'],
      ['Gaskartusche', 'Kueche'],
      ['Handtuch', 'Kueche'],
      ['Isomatte', 'Kueche'],
      ['Jause', 'Zuletzt'],
      ['Kocher', 'Zuletzt'],
      ['Lampe', 'Zuletzt'],
    ] as const) {
      await createItem(page, name, { tags: [tag] })
      await backToInventory(page)
    }
    await page.setViewportSize({ width: 390, height: 360 })

    const list = visiblePage(page)
    const scroller = list.locator('ion-content')
    const offset = () =>
      scroller.evaluate(async (el) => {
        const content = el as unknown as { getScrollElement(): Promise<HTMLElement> }
        return (await content.getScrollElement()).scrollTop
      })

    expect(await offset()).toBe(0)
    await expect(list.getByTestId('m9-row')).toHaveCount(12)

    await list.getByTestId('m9-jump-open').first().click()
    await expect(page.getByTestId('m9-jump-sheet')).toHaveAttribute('data-presented', 'true')
    await page.getByTestId('m9-jump-Zuletzt').click()

    // The list moved *to the group asked for*, which „scrolled a bit" would
    // equally satisfy: while the sheet is up Ionic locks the scroll host, and
    // a jump issued into that lock moved the list 120 px of the 9 000 it
    // owed. The heading settles directly under the tool bar, within a row's
    // height of it. Polled on that position rather than on „the offset moved":
    // the sheet hands focus back to the heading as it closes, which nudges the
    // list a few pixels before the jump itself lands.
    const tools = (await list.getByTestId('m9-tools').boundingBox())!
    const targetY = async () =>
      (await list.getByTestId('m9-group-head').filter({ hasText: 'Zuletzt' }).boundingBox())!.y
    await expect.poll(targetY).toBeLessThan(tools.y + tools.height + 60)
    expect(await targetY()).toBeGreaterThanOrEqual(tools.y + tools.height - 2)
    expect(await offset()).toBeGreaterThan(0)
    // ...and it is still the whole inventory: a jump is not a filter.
    await expect(list.getByTestId('m9-row')).toHaveCount(12)
    await expect(list.getByTestId('m9-tools')).toBeVisible()
  })
})

/**
 * E2E-M9-04 (G-7/NFR-4.7): the empty inventory offers the way in. Its own
 * describe because the world is the interesting part — every other case
 * here creates an item first, and this one must not.
 *
 * Elsewhere in the suite `m9-empty` appears only as G9-13's *absence*
 * assertion, where it stands in for "not the inventory screen".
 */
test.describe('M9 inventory — the empty state (G-7)', () => {
  test('E2E-M9-04: an empty inventory offers the spreadsheet import', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)

    const list = visiblePage(page)
    await expect(list.getByTestId('m9-empty')).toBeVisible()
    // G-7 is an offer, not a shrug: the tools and the no-match state are both
    // absent, so what is on screen is the empty state and not a list that
    // happens to have painted nothing. (Both are elements the screen does
    // render — an absence assertion against an element nothing renders is
    // green by construction.)
    await expect(list.getByTestId('m9-tools')).toHaveCount(0)
    await expect(list.getByTestId('m9-no-match')).toHaveCount(0)

    await list.getByTestId('m9-import').click()
    await expect(visiblePage(page).getByTestId('import-paste')).toBeVisible()

    // NFR-4.7: the way back is the way in reversed, and it lands on the
    // inventory rather than on M15's other parent, the trip list.
    await page.getByTestId('header-back').click()
    await expect(visiblePage(page).getByTestId('m9-empty')).toBeVisible()
  })
})
