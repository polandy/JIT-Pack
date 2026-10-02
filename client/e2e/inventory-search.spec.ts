import { test, expect, visiblePage } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { backToInventory, createItem, groupHeadings } from './helpers/m9'
import { writesLanded } from './helpers/page'
import { PATH } from './routes'

/**
 * M9 — the search (FR-1.1, FR-24.6/24.7) and what it offers to create when it
 * finds nothing by that name (FR-24.11).
 *
 * Local Mode throughout: the inventory is backend-free, and the mode with no
 * server is where a missing client-side rule shows up.
 */

test.describe('M9 inventory — lean list on the tag set (FR-24.2/24.4)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  /*
   * E2E-M9-08 measured the gap between the tag axis and the first group
   * heading (UX-4). The axis is gone with FR-24.8, and the geometry that
   * replaced its promise — the heading stacked *below* the tool bar rather
   * than sliding under it — is asserted by E2E-M9-13. The id is struck in
   * the ledger rather than renumbered onto this case.
   */

  /**
   * E2E-M9-10 (FR-1.1): the "searchable" half of M9-01's sentence. G-12's own
   * case asserts that the magnifier opens *this* screen's field; that the
   * field then filters the list is a different promise and belongs here.
   */
  test('E2E-M9-10: the search filters the list and says so when nothing matches', async ({
    page,
  }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidung'] })
    await backToInventory(page)
    await createItem(page, 'Kabel', { tags: ['Technik'] })
    await backToInventory(page)

    const list = visiblePage(page)
    await expect(list.getByTestId('m9-row')).toHaveCount(2)

    // No magnifier: on M9 the field is part of the screen (FR-24.6, the one
    // G-12 exception). A plain <input>, not an ion-input, so fill() is enough
    // — the shared search row owns the element itself (the fillIonic note
    // above is about Ionic's re-emitted event, which does not apply here).
    await expect(list.getByTestId('items-search-input')).toBeVisible()
    await list.getByTestId('items-search-input').fill('bade')
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Badehose')
    // The group the surviving row is *not* under is gone with it: the
    // search filters before the grouping, so an empty heading would be a
    // heading over nothing.
    expect(await groupHeadings(list)).not.toContain('technik')

    // A term nothing matches is answered, not left as a blank page — and it
    // is answered with the *no-match* state rather than G-7's empty one,
    // which would offer to import an inventory that already exists.
    await list.getByTestId('items-search-input').fill('zzz')
    await expect(list.getByTestId('m9-row')).toHaveCount(0)
    await expect(list.getByTestId('m9-no-match')).toBeVisible()
    await expect(list.getByTestId('m9-empty')).toHaveCount(0)
  })

  /**
   * E2E-M9-11 (FR-24.7): what a plain name match cannot be typed into. Both
   * halves are measured against the family instance — without them,
   * „gurtel" and „guertel" each return 0 of 184 rows, and a tag every row
   * carries cannot be searched at all.
   */
  test('E2E-M9-11: the search reaches an umlaut name and a tag, and says which', async ({
    page,
  }) => {
    await createItem(page, 'Gürtel', { tags: ['Diverses'] })
    await backToInventory(page)
    await createItem(page, 'Finken', { tags: ['Schuhe'] })
    await backToInventory(page)

    const list = visiblePage(page)
    const field = list.getByTestId('items-search-input')

    // Stripped diacritic and written-out umlaut both arrive at the same row.
    await field.fill('gurtel')
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Gürtel')
    await field.fill('guertel')
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Gürtel')

    // A tag is searchable, and the row says what carried the match — the row
    // itself does not contain the query, so without this it reads as a bug.
    await field.fill('schuhe')
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Finken')
    await expect(list.getByTestId('m9-row-via')).toContainText('Schuhe')
    expect(await groupHeadings(list)).toEqual(['matched a tag'])
  })

  /**
   * E2E-M9-12 (FR-24.7): the dead end — „socken" under an unrelated tag
   * chip, answered with a bare „Kein Artikel gefunden" while three socks sit
   * in the list.
   */
  test('E2E-M9-12: a filtered dead end names the filter and offers the way out', async ({
    page,
  }) => {
    await createItem(page, 'Normale Socken', { tags: ['Unterwäsche'] })
    await backToInventory(page)
    await createItem(page, 'Zahnbürste', { tags: ['Hygiene'] })
    await backToInventory(page)

    const list = visiblePage(page)
    await list.getByTestId('m9-tag-chip-Hygiene').click()
    await list.getByTestId('items-search-input').fill('socken')

    const empty = list.getByTestId('m9-no-match')
    await expect(empty).toBeVisible()
    // It names the tag that is narrowing the list, and counts what lies
    // outside it — the two facts the bare sentence withheld. The count is
    // written out at one, which is the singular arm of the catalogue entry.
    await expect(empty).toContainText('Hygiene')
    await expect(empty).toContainText('one match')

    await list.getByTestId('m9-search-everywhere').click()
    // The query survives the filter being dropped: the user asked for socks,
    // not for the unfiltered inventory.
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Normale Socken')
    await expect(list.getByTestId('items-search-input')).toHaveValue('socken')
  })

  /**
   * E2E-M9-13 (FR-24.6): the bar stays while the list moves. Measured on the
   * family instance, the list is 10 391 px against a 671 px viewport — after
   * two swipes a scrolling bar leaves no heading and no field on screen, and
   * filtering means scrolling fifteen screens back.
   */
  test('E2E-M9-13: the tools stay put while the list scrolls', async ({ page }) => {
    for (const name of ['Anorak', 'Buff', 'Campingstuhl', 'Daunenjacke', 'Eispickel']) {
      await createItem(page, name, { tags: ['Ausrüstung'] })
      await backToInventory(page)
    }
    await page.setViewportSize({ width: 390, height: 500 })

    const list = visiblePage(page)
    const tools = list.getByTestId('m9-tools')
    const before = (await tools.boundingBox())!

    await list.locator('ion-content').evaluate(async (el) => {
      const content = el as unknown as { getScrollElement(): Promise<HTMLElement> }
      const scroller = await content.getScrollElement()
      scroller.scrollTop = scroller.scrollHeight
    })

    // Settled by the scroller's own offset rather than by a wait: the bar is
    // where it was, with the list moved under it.
    await expect
      .poll(() =>
        list.locator('ion-content').evaluate(async (el) => {
          const content = el as unknown as { getScrollElement(): Promise<HTMLElement> }
          return (await content.getScrollElement()).scrollTop
        }),
      )
      .toBeGreaterThan(0)

    const after = (await tools.boundingBox())!
    expect(after.y).toBeCloseTo(before.y, 0)
    await expect(list.getByTestId('items-search-input')).toBeVisible()

    // ...and the heading under it stays a heading rather than sliding beneath
    // the bar: the two sticky elements are stacked, not overlapping.
    const head = list.getByTestId('m9-group-head').first()
    const headBox = (await head.boundingBox())!
    expect(headBox.y).toBeGreaterThanOrEqual(after.y + after.height - 1)
  })
})

test.describe('M9 — the search creates what it did not find (FR-24.11)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  /** The creation sheet, once Ionic has actually presented it. */
  async function openOffer(page: Page): Promise<Locator> {
    await visiblePage(page).getByTestId('m9-offer').click()
    const sheet = page.getByTestId('create-item-sheet')
    await expect(sheet).toHaveAttribute('data-presented', 'true')
    return sheet
  }

  test('E2E-M9-21: a partial hit still offers the missing name, and the list survives creating it', async ({
    page,
  }) => {
    await createItem(page, 'Zeltheringe', { tags: ['Camping'] })
    await backToInventory(page)
    await createItem(page, 'Kabel', { tags: ['Technik'] })
    await backToInventory(page)

    const list = visiblePage(page)
    await list.getByTestId('items-search-input').fill('Zelt')
    // The partial hit is on screen, and the tent is still offered above it.
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-offer-title')).toContainText('Zelt')

    const sheet = await openOffer(page)
    await expect(sheet.getByTestId('create-item-name').locator('input')).toHaveValue('Zelt')
    // The pegs' tag leads the offers — the tent is most likely camping gear too.
    await expect(sheet.locator('[data-testid^="create-item-tag-offer-"]').first()).toHaveText(
      'Camping',
    )
    await sheet.getByTestId('create-item-tag-offer-Camping').click()
    await expect(sheet.getByTestId('create-item-tag-primary-Camping')).toBeVisible()
    await sheet.getByTestId('create-item-confirm').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await writesLanded(page)

    // Still on M9, still searching: the new row is a hit and says it is new,
    // and the offer is gone because the name now exists — the same event
    // reaching both places.
    await expect(list.getByTestId('items-search-input')).toHaveValue('Zelt')
    await expect(list.getByTestId('m9-row')).toHaveCount(2)
    await expect(
      list.getByTestId('m9-row').filter({ has: page.getByTestId('m9-row-new') }),
    ).toContainText('Zelt')
    await expect(list.getByTestId('m9-offer')).toHaveCount(0)

    // The toast offering „Open" sits above the ＋ rather than over it — the
    // first render of this screen had it covering the button.
    const toast = page.locator('ion-toast[data-presented="true"]').filter({ hasText: 'Zelt' })
    await expect(toast).toHaveCount(1)
    const toastBox = await toast.locator('.toast-wrapper').boundingBox()
    const fabBox = await list.getByTestId('m9-fab').boundingBox()
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(fabBox!.y)

    // Filed where the sheet said: under Camping, beside the pegs.
    await list.getByTestId('search-clear').click()
    await list.getByTestId('m9-tag-chip-Camping').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(2)
  })

  test('E2E-M9-22: the active filter tag comes along, and „create and open" returns to the same search', async ({
    page,
  }) => {
    await createItem(page, 'Kabel', { tags: ['Technik'] })
    await backToInventory(page)

    const list = visiblePage(page)
    await list.getByTestId('m9-tag-chip-Technik').click()
    await list.getByTestId('items-search-input').fill('Ladegerät')
    // The dead end still names itself; the offer sits above it.
    await expect(list.getByTestId('m9-no-match')).toBeVisible()

    const sheet = await openOffer(page)
    // Without the filter's tag the new item would vanish from this list.
    await expect(sheet.getByTestId('create-item-tag-primary-Technik')).toBeVisible()
    await sheet.getByTestId('create-item-open').click()

    await expect(page.getByTestId('header-title')).toHaveText('Ladegerät')
    await expect(visiblePage(page).getByTestId('m10-edit-head')).toBeVisible()
    await writesLanded(page)

    await backToInventory(page)
    await expect(list.getByTestId('items-search-input')).toHaveValue('Ladegerät')
    await expect(list.getByTestId('m9-tag-chip-Technik')).toHaveAttribute('aria-pressed', 'true')
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Ladegerät')
    await expect(list.getByTestId('m9-offer')).toHaveCount(0)
  })
})
