import {
  test,
  expect,
  createMasterItem,
  createTemplate,
  addPosition,
  backToTemplateList,
  createTripViaWizard,
  openQuickAdd,
  visiblePage,
  itemDetail,
} from './fixtures'
import { PATH } from './routes'

/**
 * M10 — what hangs off an item and what was said about it (FR-27.8/27.9).
 */

/**
 * M10's rear-view — FR-27.8 and FR-27.9. They are the two halves of the
 * question the owner actually asks at an item: what hangs off this, and what
 * did we say about it last time.
 */
test.describe("M10 — the item's rear-view @local @m10", () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M10-17 (FR-27.8): which groups and Vorlagen hold this item, and the
  // way into each. The delete card's count says how many; this says which,
  // which is the question asked before an item is edited.
  test('E2E-M10-17: the item names the groups holding it, and leads into one', async ({ page }) => {
    await createMasterItem(page, 'Wanderstöcke')
    // createTemplate starts on M7's FAB; creating the item ended on M10.
    await page.goto(PATH.templates)
    await createTemplate(page, 'group', 'Wandern')
    await addPosition(page, 'Wanderstöcke')
    await backToTemplateList(page)
    // A Ferien-Vorlage as well, so the list is mixed: the two scopes wear the
    // same chip, and a group chip asserted alone would pass on a screen that
    // marks nothing else.
    await page.goto(PATH.templates)
    await createTemplate(page, 'template', 'Sommerferien')
    await addPosition(page, 'Wanderstöcke')
    await backToTemplateList(page)

    await page.goto(PATH.items)
    await visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Wanderstöcke' }).click()
    await expect(page.getByTestId('header-title')).toHaveText('Wanderstöcke')

    const row = visiblePage(page).getByTestId('m10-contained-Wandern')
    await expect(row).toBeVisible()
    // The scope chip M7's own rows wear, so the two lists read alike.
    // Anchored on the test id rather than on the word, because this suite's
    // language is a setting and an assertion on text goes green the moment
    // the chip is translated (the trap E2E-M10-07 records).
    await expect(visiblePage(page).getByTestId('m10-contained-group-Wandern')).toBeVisible()
    // Both scopes wear the same chip, so a mixed list reads as one rule. The
    // positive signal against the group chip is a *vacation* row carrying its
    // own — an assertion on the group alone passes on a screen that marks
    // nothing else.
    await expect(visiblePage(page).getByTestId('m10-contained-template-Sommerferien')).toBeVisible()

    // Tappable straight into that template's editor — the whole point of a
    // list over a count — and the way back lands on the item again.
    await row.click()
    await expect(page.getByTestId('header-title')).toHaveText('Wandern')
    await page.goBack()
    await expect(page.getByTestId('header-title')).toHaveText('Wanderstöcke')
    await expect(visiblePage(page).getByTestId('m10-contained-Wandern')).toBeVisible()
  })

  // E2E-M10-18 (FR-27.9): what was said about this item while packing, across
  // trips. The remark made on last year's trip is worth most where next
  // year's list is curated, not left in an archived trip.
  test('E2E-M10-18: a remark made on a trip is readable at the item', async ({ page }) => {
    await createMasterItem(page, 'Wanderstöcke')
    await createTripViaWizard(page, { name: 'Laos 2025' })
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Wanders')
    await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Wanderstöcke' }).click()
    await expect(page.getByTestId('m4-row-Wanderstöcke')).toBeVisible()

    await page.getByTestId('m4-row-Wanderstöcke').click()
    await itemDetail(page).getByTestId('m5-note-input').locator('input').fill('Spitzen sind stumpf')
    await itemDetail(page).getByTestId('m5-note-add').click()
    await expect(itemDetail(page).getByTestId('m5-note-Spitzen sind stumpf')).toBeVisible()

    await page.goto(PATH.items)
    await visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Wanderstöcke' }).click()
    const section = visiblePage(page).getByTestId('m10-section-comments')
    await expect(section).toBeVisible()
    // The body, and the trip it was written on — a remark with no trip is a
    // remark you cannot weigh.
    const comments = visiblePage(page).locator('[data-testid^="m10-comment-"]')
    await expect(comments).toHaveCount(1)
    await expect(comments.first()).toContainText('Spitzen sind stumpf')
    await expect(comments.first()).toContainText('Laos 2025')
    // Local Mode holds every trip, so the list is complete and says nothing
    // about being partial — the positive signal the Server-Mode hedge stands
    // against, and the reason it is asserted here rather than nowhere.
    await expect(visiblePage(page).getByTestId('m10-comments-partial')).toHaveCount(0)
  })

  // E2E-M10-19 (FR-27.9/FR-27.8): an item nothing has used shows neither
  // section — absent, not empty, the FR-24.5 stance. The positive signal is
  // the delete card, which *is* on the screen: a page that failed to load
  // would satisfy an absence assertion just as well.
  test('E2E-M10-19: an unused item carries neither section, on a screen that loaded', async ({
    page,
  }) => {
    await createMasterItem(page, 'Regenhut')
    await page.goto(PATH.items)
    await visiblePage(page).getByTestId('m9-row').filter({ hasText: 'Regenhut' }).click()
    await expect(visiblePage(page).getByTestId('m10-section-delete')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-section-containment')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m10-section-comments')).toHaveCount(0)
  })
})
