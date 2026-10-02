import {
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  visiblePage,
  itemDetail,
} from './fixtures'
import { backToInventory, createItem, groupHeadings } from './helpers/m9'
import { writesLanded } from './helpers/page'
import { PATH } from './routes'

/**
 * M9 — the selection and what it can be acted on with (FR-24.9, ADR-075): a
 * tag for several rows, a dependency for several items, and two duplicates
 * merged into one (FR-24.15).
 *
 * Local Mode throughout: the inventory is backend-free, and the mode with no
 * server is where a missing client-side rule shows up.
 */

test.describe('M9 inventory — lean list on the tag set (FR-24.2/24.4)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  /**
   * E2E-M9-16 (FR-24.9): the way out of a „Diverses" with 49 rows in it. The
   * measurement behind the feature: without a bulk action, refiling those 49
   * costs 49 round trips through M10 — open, search the tag, assign, remove
   * the old one, back.
   */
  test('E2E-M9-16: several rows are refiled in one act, and the act can be taken back', async ({
    page,
  }) => {
    test.slow()
    for (const name of ['Sonnencreme', 'Sonnenbrille', 'Taschenmesser']) {
      await createItem(page, name, { tags: ['Diverses'] })
      await backToInventory(page)
    }
    // The tag to refile them under exists already, so this case picks it;
    // creating one from the sheet is E2E-M9-24's.
    await createItem(page, 'Sonnenhut', { tags: ['Sonnenschutz'] })
    await backToInventory(page)

    const list = visiblePage(page)
    await expect(list.getByTestId('m9-row')).toHaveCount(4)

    // Narrow to the junk drawer, then take what is on screen — which is the
    // point of "Alle N": it means the filtered list, not the inventory.
    await list.getByTestId('m9-tag-chip-Diverses').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(3)
    await page.getByTestId('m9-select').click()
    await page.getByTestId('m9-select-all').click()
    await expect(page.getByTestId('m9-select-count')).toContainText('3')

    await list.getByTestId('m9-bulk-give').click()
    await expect(page.getByTestId('m9-bulk-tag-sheet')).toHaveAttribute('data-presented', 'true')
    // The switch is what refiles rather than merely labels; it is on by
    // default, and this is the case that says so.
    await expect(page.getByTestId('m9-bulk-primary')).toBeChecked()
    await page.getByTestId('m9-bulk-tag-search').fill('Sonnen')
    await page.getByTestId('m9-bulk-tag-Sonnenschutz').click()

    // Refiling keeps the old tag — the rows still answer the Diverses filter,
    // which is the difference between *moving* an item and *retagging* it.
    await expect(list.getByTestId('m9-row')).toHaveCount(3)
    // ...and the mode ended with the batch.
    await expect(page.getByTestId('m9-selbar')).toHaveCount(0)

    // With the filter dropped, all four rows are under one heading: the three
    // are filed under Sonnenschutz now, so „Diverses" heads nothing and is
    // not rendered.
    await list.getByTestId('m9-tag-chip-Diverses').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(4)
    expect(await groupHeadings(list)).toEqual(['sonnenschutz'])

    // The snackbar's undo puts all three back where they were.
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect
      .poll(async () => (await groupHeadings(list)).sort())
      .toEqual(['diverses', 'sonnenschutz'])
    await expect(list.getByTestId('m9-row')).toHaveCount(4)
  })

  /**
   * E2E-M9-26 (FR-24.9 widened, FR-20.1): a dependency declared for several
   * items at once, in both of the directions it can be declared in.
   *
   * The assertion is M10's own two lists rather than anything M9 paints: the
   * inventory shows no edges, so a bulk link that wrote nothing would look
   * exactly like one that worked. The stored row is the same edge either way,
   * and the end it is read from is the only thing that tells the directions
   * apart — which is why each is checked on the list it writes to.
   *
   * **The undo is asserted against a list that still has a row in it.** An
   * empty section would be „absent" whether or not the undo did anything, so
   * the batch that is taken back is the second of two: the first row is still
   * there afterwards, and the second is gone.
   */
  test('E2E-M9-26: a dependency is declared for several items at once, and taken back', async ({
    page,
  }) => {
    test.slow()
    for (const name of ['Kamera', 'Ersatzakku', 'Ladegeraet', 'Stativ', 'Regenhuelle']) {
      await createItem(page, name)
      await backToInventory(page)
    }

    const list = visiblePage(page)
    const openItem = async (name: string) => {
      await list.getByTestId('m9-row').filter({ hasText: name }).click()
      await expect(page.getByTestId('header-title')).toHaveText(name)
    }

    await page.getByTestId('m9-select').click()
    await list.getByTestId('m9-row-check-Ersatzakku').click()
    await list.getByTestId('m9-row-check-Ladegeraet').click()
    await expect(page.getByTestId('m9-select-count')).toContainText('2')

    await list.getByTestId('m9-bulk-more').click()
    await page.locator('ion-action-sheet').getByText('Depends on').click()
    await expect(page.getByTestId('m9-bulk-dep-sheet')).toHaveAttribute('data-presented', 'true')
    // Required by default; this batch asks for the other mode (FR-20.4).
    await expect(page.getByTestId('m9-bulk-dep-suggested')).not.toBeChecked()
    await page.getByTestId('m9-bulk-dep-suggested').check()
    await page.getByTestId('m9-bulk-dep-search').fill('Kam')
    await page.getByTestId('m9-bulk-dep-pick-Kamera').click()

    // The mode ends with the batch, exactly as a tag batch does.
    await expect(page.getByTestId('m9-selbar')).toHaveCount(0)
    await writesLanded(page)

    // Both rows now depend on the camera, in the mode the sheet was set to.
    // `.select-text` and not the host: an `ion-select`'s own text is every
    // option it offers, so asserting „Suggested" on the host is green against
    // a batch that wrote „Required" — see E2E-M22-13 in the ledger.
    for (const name of ['Ersatzakku', 'Ladegeraet']) {
      await openItem(name)
      await expect(
        visiblePage(page).getByTestId('m10-dependency-mode-Kamera').locator('.select-text'),
      ).toHaveText('Suggested')
      await backToInventory(page)
    }

    // The other direction writes the same edge from the other end, so it is
    // read on the other list: the camera's companions. Two items nothing has
    // linked yet, because an edge that is already there is skipped by design.
    const giveCompanion = async (companion: string) => {
      await page.getByTestId('m9-select').click()
      await list.getByTestId('m9-row-check-Kamera').click()
      await list.getByTestId('m9-bulk-more').click()
      await page.locator('ion-action-sheet').getByText('Companion item').click()
      await page.getByTestId('m9-bulk-dep-search').fill(companion)
      await page.getByTestId(`m9-bulk-dep-pick-${companion}`).click()
      await expect(page.getByTestId('m9-selbar')).toHaveCount(0)
      await writesLanded(page)
    }

    await giveCompanion('Stativ')
    await openItem('Kamera')
    await expect(visiblePage(page).getByTestId('m10-companion-Stativ')).toBeVisible()
    await backToInventory(page)

    // A second batch, taken back through its own snackbar before it expires.
    await giveCompanion('Regenhuelle')
    await page.getByRole('button', { name: 'Undo' }).click()
    await writesLanded(page)

    await openItem('Kamera')
    // The undone row is gone from a list that still carries the other one —
    // one undo is one batch, and the section is rendered either way.
    await expect(visiblePage(page).getByTestId('m10-companion-Stativ')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-companion-Regenhuelle')).toHaveCount(0)
    await backToInventory(page)
  })

  /**
   * E2E-M9-31 (FR-24.9, ADR-075): the inventory selects the way M6 and M25
   * do. A hold on a row — here its desktop twin, a *real* right-click, whose
   * own pointerdown is what once re-fired the hold and ate the next tap —
   * starts the selection with that row and opens nothing; a tap then picks
   * and unpicks; leaving the mode gives the tap back to opening the item.
   *
   * Every assertion that the editor stayed shut is paired with the positive
   * signal that the tap did land (the count moved), so none is an absence.
   */
  test('E2E-M9-31: a hold selects a row, a tap picks, and outside the mode a tap opens', async ({
    page,
  }) => {
    test.slow()
    await createItem(page, 'Kamera', { tags: ['Foto'] })
    await backToInventory(page)
    await createItem(page, 'Stativ', { tags: ['Foto'] })
    await backToInventory(page)
    await createItem(page, 'Zelt', { tags: ['Camping'] })
    await backToInventory(page)

    const list = visiblePage(page)
    const row = (name: string) => list.getByTestId('m9-row').filter({ hasText: name })

    // The heading wears its count and is still the jump control (FR-24.8).
    await expect(list.getByTestId('m9-jump-open').filter({ hasText: 'Foto' })).toContainText('2')

    await row('Kamera').click({ button: 'right' })
    await expect(page.getByTestId('m9-selbar')).toBeVisible()
    await expect(page.getByTestId('m9-select-count')).toHaveText('One selected')
    await expect(list.getByTestId('m9-row-check-Kamera')).toHaveClass(/\bon\b/)
    await expect(page.getByTestId('header-title')).not.toHaveText('Kamera')

    // The very next tap is a tap, not the hold's ghost click.
    await row('Zelt').click()
    await expect(page.getByTestId('m9-select-count')).toHaveText('2 selected')
    await row('Kamera').click()
    await expect(page.getByTestId('m9-select-count')).toHaveText('One selected')
    await expect(list.getByTestId('m9-row-check-Kamera')).not.toHaveClass(/\bon\b/)
    await expect(list.getByTestId('m9-bulkbar')).toBeVisible()

    await page.getByTestId('m9-select-exit').click()
    await expect(page.getByTestId('m9-selbar')).toHaveCount(0)
    await row('Stativ').click()
    await expect(page.getByTestId('header-title')).toHaveText('Stativ')
    await backToInventory(page)
  })

  /**
   * E2E-M9-30 (FR-24.15): two rows that are the same thing become one.
   *
   * The whole point of the act is what the survivor ends up holding, so the
   * case is built around a **loser that carries what the survivor lacks**: a
   * tag the survivor does not have, a weight it has none of, and a companion
   * edge pointing at it. Each is read back where it is rendered — the tag on
   * M9's heading, the weight and the companion in M10 — because the inventory
   * list would look identical after a merge that wrote nothing but the delete.
   *
   * And the losing row is asserted twice: gone from the inventory, and *named*
   * on M23 as merged rather than merely retired. A restore offered without
   * that sentence is an offer to make the duplicate again.
   *
   * The remark carried over from the loser's trip is the case's fourth claim
   * and the one ADR-069 exists for. It is also the only assertion that reaches
   * the *page's* wiring: the domain's two halves are covered separately, and
   * with `[props.itemId]` back in M10 everything above this still passes.
   */
  test('E2E-M9-30: two duplicate items are merged into one, and the loser says where it went', async ({
    page,
  }) => {
    test.slow()
    await createItem(page, 'Stirnlampe', { tags: ['Technik'] })
    await backToInventory(page)
    await createItem(page, 'Stirnlampe Petzl', { tags: ['Licht'], weight: '90' })
    await backToInventory(page)
    // The companion edge points at the row that is about to lose, so the
    // merge has to move it — M10 renders it on the survivor afterwards.
    await createItem(page, 'Ersatzbatterien')
    const editor = visiblePage(page)
    await editor.getByTestId('m10-add-dependency').click()
    await editor.getByTestId('m10-dependency-search').locator('input').fill('Petzl')
    await editor.getByTestId('m10-dependency-main-Stirnlampe Petzl').click()
    await backToInventory(page)

    // A trip packed the loser once. That row is what the merge deliberately
    // does *not* re-point (a finished trip is a snapshot), so it is also what
    // makes FR-24.3 answer the loser's delete by **retiring** it — the state
    // the M23 half of this case is about.
    await createTripViaWizard(page, { name: 'Sils 2026' })
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Stirnlampe P')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Petzl' }).click()
    await expect(page.getByTestId('m4-row-Stirnlampe Petzl')).toBeVisible()
    // The remark is written on the row that is about to lose. Its trip is the
    // one the merge deliberately leaves alone, so reading this back on the
    // survivor afterwards is the whole claim the alias exists for (ADR-069) —
    // and the only place the *page* is proven to ask for the merged ids.
    await page.getByTestId('m4-row-Stirnlampe Petzl').click()
    await itemDetail(page).getByTestId('m5-note-input').locator('input').fill('Akku hält 4 h')
    await itemDetail(page).getByTestId('m5-note-add').click()
    await expect(itemDetail(page).getByTestId('m5-note-Akku hält 4 h')).toBeVisible()
    await writesLanded(page)
    await page.goto(PATH.items)

    const list = visiblePage(page)
    await page.getByTestId('m9-select').click()
    await list.getByTestId('m9-row-check-Stirnlampe').click()
    await list.getByTestId('m9-row-check-Stirnlampe Petzl').click()
    await expect(page.getByTestId('m9-select-count')).toContainText('2')

    await list.getByTestId('m9-bulk-more').click()
    await page.locator('ion-action-sheet').getByText('Merge').click()
    await expect(page.getByTestId('m9-merge-sheet')).toHaveAttribute('data-presented', 'true')
    await page.getByTestId('m9-merge-keep-Stirnlampe').click()
    await page.getByTestId('m9-merge-confirm').getByRole('button', { name: 'Merge' }).click()
    await expect(page.locator('ion-toast')).toContainText('is now filed under')
    await writesLanded(page)

    // One row where there were two, and it carries both tags — the loser's
    // filing moved rather than being dropped with the row.
    await expect(list.getByTestId('m9-row').filter({ hasText: 'Stirnlampe' })).toHaveCount(1)
    // Under the survivor's own heading, not the loser's and not a third one:
    // „Ohne Tag" is the battery, which carries no tag and never did.
    expect(await groupHeadings(list)).toEqual(['technik', 'untagged'])

    await list.getByTestId('m9-row').filter({ hasText: 'Stirnlampe' }).click()
    await expect(page.getByTestId('header-title')).toHaveText('Stirnlampe')
    // The weight the survivor never had, and the companion that pointed at
    // the other row: both are the survivor's now.
    await expect(visiblePage(page).getByTestId('m10-tag-summary')).toContainText('Licht')
    await expect(visiblePage(page).getByTestId('m10-companion-Ersatzbatterien')).toBeVisible()
    // No „Mehr ▾" here: that disclosure is the *creation* form's (FR-24.5).
    await expect(visiblePage(page).getByTestId('m10-weight').locator('input')).toHaveValue('90')
    // What the loser was told on its own trip, read here as the survivor's.
    // The trip row still names the loser — nothing re-pointed it — so this
    // section is empty unless the page reads through the alias.
    const comments = visiblePage(page).locator('[data-testid^="m10-comment-"]')
    await expect(comments).toHaveCount(1)
    await expect(comments.first()).toContainText('Akku hält 4 h')
    await expect(comments.first()).toContainText('Sils 2026')

    // M23 says where the losing row went, so its restore is not a silent
    // offer to create the duplicate again.
    await page.goto(PATH.masterRetired)
    const retired = visiblePage(page)
    await expect(retired.getByTestId('m23-row').filter({ hasText: 'Petzl' })).toContainText(
      'merged into',
    )
  })
})
