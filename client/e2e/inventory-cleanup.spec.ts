import { test, expect, visiblePage } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { backToInventory, createItem } from './helpers/m9'
import { writesLanded } from './helpers/page'
import { PATH } from './routes'

/**
 * M24 and the tag work around it (FR-24.12, FR-24.13, FR-24.9's amendment).
 *
 * Every repair on M24 is asserted where it *files* something — M9's group
 * headings after going back — and never inside M24 alone: a finding that
 * disappears from the list is equally what a screen that wrote nothing and
 * merely re-rendered would show.
 *
 * Local Mode throughout: the rules are client-side (invariant 4), and the
 * mode with no server is where one that leaned on it would break.
 *
 * Not here: *Lange nicht gebraucht*. Its finding needs a trip that ended more
 * than six months ago, which the wizard cannot date without a clock seam the
 * suite does not have; the rule, its window and its honesty line are
 * `inventoryHygiene.spec.ts` and `InventoryCleanupPage.spec.ts`.
 */

/** The group headings, normalised — see `inventory.spec.ts` for why lower-cased. */
async function groupHeadings(scope: Locator): Promise<string[]> {
  const heads = await scope.getByTestId('m9-group-head').allInnerTexts()
  return heads.map((h) => h.split('\n')[0]!.trim().toLowerCase())
}

/** M9's ⋮ word, by the name it is read as. */
async function openFromOverflow(page: Page, label: string): Promise<void> {
  await page.getByTestId('header-overflow').click()
  await page.getByText(label, { exact: true }).click()
}

/** M24, reached the way the owner does — the sentence at M9's foot. */
async function openCleanup(page: Page): Promise<Locator> {
  await visiblePage(page).getByTestId('m9-cleanup-note').click()
  await expect(page.getByTestId('header-title')).toHaveText('Tidy up')
  return visiblePage(page)
}

async function backToList(page: Page): Promise<void> {
  await page.getByTestId('header-back').click()
  await expect(visiblePage(page).getByTestId('m9-fab')).toBeVisible()
}

test.describe('M9 — tags are marked, and created where they are given @local @m9', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  /**
   * E2E-M9-24 (FR-24.9 amended): the give sheet used to offer only tags that
   * existed, so a new category for forty items was a detour through M10.
   */
  test('E2E-M9-24: giving a tag creates the one the search did not find, and the undo takes it back', async ({
    page,
  }) => {
    for (const name of ['Schnorchel', 'Taucherbrille']) {
      await createItem(page, name, { tags: ['Diverses'] })
      await backToInventory(page)
    }
    const list = visiblePage(page)
    expect(await groupHeadings(list)).toEqual(['diverses'])

    await page.getByTestId('m9-select').click()
    await list.getByTestId('m9-select-all').click()
    await list.getByTestId('m9-bulk-give').click()
    await expect(page.getByTestId('m9-bulk-tag-sheet')).toHaveAttribute('data-presented', 'true')

    // „diverses" names an existing tag under the uniqueness fold: no offer.
    await page.getByTestId('m9-bulk-tag-search').fill('diverses')
    await expect(page.getByTestId('m9-bulk-tag-Diverses')).toBeVisible()
    await expect(page.getByTestId('m9-bulk-tag-create')).toHaveCount(0)

    await page.getByTestId('m9-bulk-tag-search').fill('Wasser')
    await page.getByTestId('m9-bulk-tag-create').click()
    await expect(page.locator('ion-toast')).toContainText('created and given')
    await writesLanded(page)

    // Refiled, not merely labelled: the switch was on, so both rows moved.
    expect(await groupHeadings(list)).toEqual(['wasser'])

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => groupHeadings(list)).toEqual(['diverses'])

    // And the tag itself is gone — the manager lists only the one left.
    await openFromOverflow(page, 'Manage tags')
    await expect(page.getByTestId('m9-tag-row-Diverses')).toBeVisible()
    await expect(page.getByTestId('m9-tag-row-Wasser')).toHaveCount(0)
  })

  /**
   * E2E-M9-25 (FR-24.13): the mark is set where the tag is fixed, and read on
   * the list — on the heading, and lent, muted, to a row without its own.
   */
  test('E2E-M9-25: a tag’s mark is set in the manager and shows on its heading and its rows', async ({
    page,
  }) => {
    await createItem(page, 'Zelt', { tags: ['Camping'] })
    await backToInventory(page)

    await openFromOverflow(page, 'Manage tags')
    await expect(page.getByTestId('m9-tags-sheet')).toHaveAttribute('data-presented', 'true')
    await page.getByTestId('m9-tag-mark-Camping').click()
    await expect(page.getByTestId('mark-picker')).toBeVisible()
    await page.getByTestId('mark-search').fill('zelt')
    const tile = page.getByTestId('mark-tile').first()
    const mark = (await tile.innerText()).trim()
    await tile.click()
    await expect(page.getByTestId('mark-picker')).toHaveCount(0)
    await expect(page.getByTestId('m9-tag-mark-Camping')).toContainText(mark)
    await writesLanded(page)
    await page.getByTestId('m9-tags-close').click()

    const list = visiblePage(page)
    await expect(list.getByTestId('m9-group-head')).toContainText(mark)
    // The row has no mark of its own, so it borrows the tag's — muted.
    const row = list.getByTestId('m9-row').filter({ hasText: 'Zelt' })
    await expect(row.getByTestId('item-mark')).toHaveText(mark)
    await expect(row.getByTestId('item-mark-slot')).toHaveClass(/borrowed/)
  })
})

test.describe('M24 — Aufräumen @local @m24', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  /**
   * E2E-M24-01 (FR-24.12): the owner's first rule. M9 says how many findings
   * there are, the sentence is the way in, and the suggestion — offered with
   * its reason — files the item.
   */
  test('E2E-M24-01: M9 counts the untagged items, and M24’s suggestion files one', async ({
    page,
  }) => {
    // Two items under „Bad", or the tag holding one item is a second finding.
    await createItem(page, 'Zahnbürste', { tags: ['Bad'] })
    await backToInventory(page)
    await createItem(page, 'Seife', { tags: ['Bad'] })
    await backToInventory(page)
    await createItem(page, 'Zahnseide')
    await backToInventory(page)

    const list = visiblePage(page)
    await expect(list.getByTestId('m9-cleanup-note')).toHaveText('One finding to tidy up')

    const cleanup = await openCleanup(page)
    const finding = cleanup.getByTestId('m24-untagged-Zahnseide')
    await expect(finding).toContainText('Suggested: like “Zahnbürste”')
    await finding.getByTestId('m24-suggest-Zahnseide').click()
    await expect(page.locator('ion-toast')).toContainText('is now filed under Bad')
    await writesLanded(page)
    await expect(cleanup.getByTestId('m24-done')).toBeVisible()

    await backToList(page)
    // Filed: one heading, every row under it, and nothing left to count.
    expect(await groupHeadings(list)).toEqual(['bad'])
    await expect(list.getByTestId('m9-row')).toHaveCount(3)
    await expect(list.getByTestId('m9-cleanup-note')).toHaveCount(0)
  })

  /**
   * E2E-M24-02 (FR-24.12 + FR-24.9): „Tag wählen …" is the give sheet, so a
   * tag the inventory lacks is created from M24 without a detour.
   */
  test('E2E-M24-02: choosing a tag that does not exist creates it for the item', async ({
    page,
  }) => {
    await createItem(page, 'Kartenspiel')
    await backToInventory(page)

    const cleanup = await openCleanup(page)
    await expect(cleanup.getByTestId('m24-untagged-Kartenspiel')).toContainText(
      'No suggestion — nothing to base one on.',
    )
    await cleanup.getByTestId('m24-pick-Kartenspiel').click()
    // By its content, not by the modal: M9 stays mounted under M24 and holds
    // its own, never-presented instance of the same sheet.
    await expect(page.getByTestId('m9-bulk-tag-search')).toBeVisible()
    // One untagged item: its first tag is its primary one whatever a switch
    // says, so the sheet does not ask.
    await expect(page.getByTestId('m9-bulk-primary')).toHaveCount(0)
    await page.getByTestId('m9-bulk-tag-search').fill('Spiele')
    await page.getByTestId('m9-bulk-tag-create').click()
    await expect(page.locator('ion-toast')).toContainText('is now filed under Spiele')
    await writesLanded(page)

    await backToList(page)
    expect(await groupHeadings(visiblePage(page))).toEqual(['spiele'])
  })

  /**
   * E2E-M24-03 (FR-24.12): „Behalten" is a decision the device remembers —
   * the finding stays gone after a reload, and M9's count agrees.
   */
  test('E2E-M24-03: keeping a single-item tag silences the rule across a reload', async ({
    page,
  }) => {
    await createItem(page, 'Graufilter', { tags: ['Fotografie'] })
    await backToInventory(page)
    await expect(visiblePage(page).getByTestId('m9-cleanup-note')).toHaveText(
      'One finding to tidy up',
    )

    const cleanup = await openCleanup(page)
    await expect(cleanup.getByTestId('m24-single-Fotografie')).toContainText('only on Graufilter')
    await cleanup.getByTestId('m24-keep-tag-Fotografie').click()
    await expect(cleanup.getByTestId('m24-done')).toBeVisible()

    await page.reload()
    await expect(visiblePage(page).getByTestId('m24-done')).toBeVisible()
    // The rule itself still runs — it has simply been told about this tag.
    await expect(visiblePage(page).getByTestId('m24-rule-singleTag')).toContainText('Nothing to do')
  })

  /**
   * E2E-M24-04 (FR-24.12): a rule switched off reports nothing — on M24 and
   * in M9's count, which has to be the same number.
   */
  test('E2E-M24-04: a rule switched off leaves M24 and M9’s count together', async ({ page }) => {
    await createItem(page, 'Kartenspiel')
    await backToInventory(page)

    await openFromOverflow(page, 'Tidy up')
    const cleanup = visiblePage(page)
    await expect(cleanup.getByTestId('m24-rule-untagged')).toBeVisible()

    await page.getByTestId('m24-rules').click()
    await expect(page.getByTestId('m24-rules-sheet')).toBeVisible()
    await page.getByTestId('m24-toggle-untagged').click()
    await expect(cleanup.getByTestId('m24-rule-untagged')).toHaveCount(0)
    await expect(cleanup.getByTestId('m24-done')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('m24-rules-sheet')).not.toBeVisible()

    await backToList(page)
    // The positive signal: the untagged row is still listed, under its bucket.
    await expect(visiblePage(page).getByTestId('m9-row')).toHaveCount(1)
    await expect(visiblePage(page).getByTestId('m9-cleanup-note')).toHaveCount(0)
  })
})
