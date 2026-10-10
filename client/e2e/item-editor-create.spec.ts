import { test, expect, visiblePage, writesLanded } from './fixtures'
import { fillIonic } from './helpers/ionic'
import { backToInventory, commitNewItem, createItem, groupHeadings } from './helpers/m9'
import { PATH } from './routes'

/**
 * M10 — creating an item: the minimal form (FR-24.5), its name and tag
 * rules (FR-24.1), and what Local Mode leaves out of it (FR-1.9).
 */

test.describe('M10 item editor — minimal creation (FR-24.5)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  test('E2E-M10-07: creating hides the sections an item cannot have yet', async ({ page }) => {
    await visiblePage(page).getByTestId('m9-fab').click()

    const form = visiblePage(page)
    await expect(form.getByTestId('m10-new-hint')).toBeVisible()
    await expect(form.getByTestId('m10-name')).toBeVisible()
    await expect(form.getByTestId('m10-tag-search')).toBeVisible()

    // Absent, not emptied: an item that does not exist cannot have a photo
    // or a companion, and weight/price are folded behind "Mehr".
    //
    // Anchored on test ids rather than on the headings' words: this suite runs
    // in German, so an assertion on English text goes green the moment the
    // section is *translated* — which is exactly what it must not do.
    await expect(form.getByTestId('m10-section-photo')).toHaveCount(0)
    await expect(form.getByTestId('m10-section-depends')).toHaveCount(0)
    // The two FR-24.5 also names are real sections, so their absence here
    // asserts something: „Enthalten in" (FR-27.8) and „Kommentare aus Reisen"
    // (FR-27.9) are built, and an item that does not exist yet is in no group
    // and carries no remark. E2E-M10-17 and E2E-M10-18 are the positive
    // halves.
    await expect(form.getByTestId('m10-section-delete')).toHaveCount(0)
    await expect(form.getByTestId('m10-section-containment')).toHaveCount(0)
    await expect(form.getByTestId('m10-section-comments')).toHaveCount(0)
    await expect(form.getByTestId('m10-weight')).toHaveCount(0)

    await form.getByTestId('m10-more').click()
    await expect(form.getByTestId('m10-weight')).toBeVisible()

    // And an unset optional field must not render a *number* as its
    // placeholder. „0" and „0.00" read as values — an item that weighs
    // nothing and is worth nothing — and both columns feed FR-8/FR-14, so
    // the lie would travel. The assertion is that the placeholder is not a
    // number rather than that it is one particular sentence: the wording is
    // the catalogue's, and this suite must not go green on a translation.
    for (const field of ['m10-weight', 'm10-price']) {
      const placeholder = await form.getByTestId(field).locator('input').getAttribute('placeholder')
      expect(placeholder, `${field} placeholder`).not.toMatch(/^[\d.,]+$/)
      expect(placeholder ?? '').not.toBe('')
    }
  })

  test('E2E-M10-07: a missing name is answered with a hint, not a dead button', async ({
    page,
  }) => {
    await visiblePage(page).getByTestId('m9-fab').click()
    await visiblePage(page).getByTestId('m10-create').click()

    // The button is live and says why nothing happened — the user should
    // not have to diagnose a disabled control (FR-24.5).
    await expect(visiblePage(page).getByTestId('m10-name-error')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
  })

  test('E2E-M10-10: a duplicate name is reported before it reaches the push', async ({ page }) => {
    await createItem(page, 'Sackmesser')
    await backToInventory(page)

    await visiblePage(page).getByTestId('m9-fab').click()
    await fillIonic(visiblePage(page).getByTestId('m10-name'), 'Sackmesser')
    await visiblePage(page).getByTestId('m10-create').click()

    // FR-24.1 dropped the category from the item's UNIQUE, so the name is
    // the identity — and the clash is answered here, not by a rejection.
    await expect(visiblePage(page).getByTestId('m10-name-error')).toContainText('Sackmesser')
    await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
  })

  test('E2E-M10-08: an unmatched tag name is created and assigned in one step', async ({
    page,
  }) => {
    await visiblePage(page).getByTestId('m9-fab').click()
    await fillIonic(visiblePage(page).getByTestId('m10-name'), 'Zelt')

    await fillIonic(visiblePage(page).getByTestId('m10-tag-search'), 'Camping')
    // Nothing matches, so the offer is to create it.
    await expect(visiblePage(page).getByTestId('m10-tag-create')).toBeVisible()
    await visiblePage(page).getByTestId('m10-tag-create').click()

    const assigned = visiblePage(page).getByTestId('m10-tag-assigned-Camping')
    await expect(assigned).toBeVisible()
    // The summary names it as primary — what M9 will file the item under.
    await expect(visiblePage(page).getByTestId('m10-tag-summary')).toContainText('Camping')

    // Assigned tags stay pinned above the matches: the filter may narrow
    // what is *offered* and must never hide what the item already carries.
    // The ＋ chip is the positive signal that the query is live — without
    // it, "the chip is still there" is equally satisfied by a search field
    // that filters nothing at all.
    await fillIonic(visiblePage(page).getByTestId('m10-tag-search'), 'Winter')
    await expect(visiblePage(page).getByTestId('m10-tag-create')).toBeVisible()
    await expect(assigned).toBeVisible()

    // The second item finds it as an existing tag rather than making a
    // duplicate: the same field, now filtering instead of creating.
    await commitNewItem(page, 'Zelt')
    await backToInventory(page)
    await visiblePage(page).getByTestId('m9-fab').click()
    await fillIonic(visiblePage(page).getByTestId('m10-name'), 'Schlafsack')
    await fillIonic(visiblePage(page).getByTestId('m10-tag-search'), 'Camping')
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Camping')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-tag-create')).toHaveCount(0)
  })

  test('E2E-M10-08: unassigning a tag refiles the item in the inventory', async ({ page }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidung'] })

    // The editor is open on the saved item; drop its only tag.
    await visiblePage(page).getByTestId('m10-tag-assigned-Kleidung').click()
    await expect(visiblePage(page).getByTestId('m10-tag-assigned-Kleidung')).toHaveCount(0)

    await backToInventory(page)
    expect(await groupHeadings(visiblePage(page))).toEqual(['untagged'])
  })
})

/**
 * FR-1.9, the Local Mode half (G-8): a default assignee names an account, and
 * Local Mode has none, so the control is absent rather than present and inert.
 * The server half is E2E-M10-29 in `server/multi-user.spec.ts`.
 */
test.describe('M10 — no default assignee where there are no accounts (FR-1.9)', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M10-30: the editor offers no assignee in Local Mode, and still offers everything else', async ({
    page,
  }) => {
    await page.goto(PATH.newItem)
    // The positive signal: the form has rendered and is usable, so a missing
    // assignee cannot be a page that never got that far.
    await expect(visiblePage(page).getByTestId('m10-name')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-more')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-assignee')).toHaveCount(0)
  })
})

/**
 * The typed numbers across both modes (FR-24.1, FR-24.5, G-5): staged while
 * creating and committed with the item, then written when the field is left.
 * Leaving and reopening the item is what says the row holds them — the input
 * alone would show what was typed whether or not it was stored.
 */
test.describe('M10 — weight and price are kept in both modes', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  test('E2E-M10-32: weight and price survive the create, an edit and a reopen', async ({
    page,
  }) => {
    const editor = () => visiblePage(page)
    const value = (testId: string) => editor().getByTestId(testId).locator('input')

    await createItem(page, 'Stirnlampe', { weight: '85', price: '24.5' })
    await expect(value('m10-weight')).toHaveValue('85')
    await expect(value('m10-price')).toHaveValue('24.50')

    await fillIonic(editor().getByTestId('m10-weight'), '90')
    await value('m10-weight').blur()
    await fillIonic(editor().getByTestId('m10-price'), '19.9')
    await value('m10-price').blur()
    await writesLanded(page)

    await backToInventory(page)
    await editor().getByTestId('m9-row').filter({ hasText: 'Stirnlampe' }).click()
    await expect(page.getByTestId('header-title')).toHaveText('Stirnlampe')
    await expect(value('m10-weight')).toHaveValue('90')
    await expect(value('m10-price')).toHaveValue('19.90')
  })
})
