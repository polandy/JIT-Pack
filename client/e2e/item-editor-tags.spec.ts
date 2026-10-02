import { test, expect, visiblePage } from './fixtures'
import { fillIonic } from './helpers/ionic'
import { backToInventory, commitNewItem, createItem, groupHeadings } from './helpers/m9'
import { PATH } from './routes'

/**
 * M10 — the item's tags: where it is filed (FR-24.9), and the shelf of tags
 * an empty query offers (UX-14).
 */

test.describe('M10 — where an item is filed (FR-24.9)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  /**
   * E2E-M10-21 (FR-24.9): the chip row had one action and it was the
   * destructive one — where an item was filed was decided by the accident of
   * which tag was assigned first, and changing it meant removing them all.
   */
  test('E2E-M10-21: a chip files the item under its tag, and the ✕ still removes it', async ({
    page,
  }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidung', 'Sommer'] })
    await backToInventory(page)

    const list = visiblePage(page)
    expect(await groupHeadings(list)).toEqual(['kleidung'])

    await list.getByTestId('m9-row').click()
    const editor = visiblePage(page)

    // FR-25.15 rides along here rather than in a case of its own, because this
    // is the one M10 case that opens a *saved* item and then edits a field —
    // which is exactly the before/after the indicator needs. The lamp is
    // silent until the editor has written something, so the absence is the
    // positive signal the presence below is read against. Its row still holds
    // its height while it is silent: alone on a line, a collapsing row would
    // move the whole form up and drop it back on the first edit.
    await expect(editor.getByTestId('save-indicator')).toHaveCount(0)
    // Read against the token rather than a copy of its value: a number here
    // would be a second place `--jp-control-round` is written down.
    const [headHeight, roundControl] = await editor
      .getByTestId('m10-edit-head')
      .evaluate((el) => [
        el.getBoundingClientRect().height,
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--jp-control-round'),
        ),
      ])
    expect(roundControl).toBeGreaterThan(0)
    expect(headHeight).toBeGreaterThanOrEqual(roundControl)

    // Tapping the *name* files the item; the ✕ beside it removes the tag.
    await editor.getByTestId('m10-tag-primary-Sommer').click()
    await expect(editor.getByTestId('m10-tag-summary')).toContainText('Sommer')
    await expect(editor.getByTestId('save-indicator')).toBeVisible()

    // Not a bare header-back click: the heading read below is empty until the
    // list has come back, which the helper waits for.
    await backToInventory(page)
    // The row moved: the inventory files it under the tag that is now first.
    expect(await groupHeadings(visiblePage(page))).toEqual(['sommer'])

    // The primary chip stops offering the act it has already performed,
    // and the ✕ is unchanged — E2E-M10-08's own target.
    await visiblePage(page).getByTestId('m9-row').click()
    await expect(visiblePage(page).getByTestId('m10-tag-primary-Sommer')).toBeDisabled()
    await visiblePage(page).getByTestId('m10-tag-assigned-Sommer').click()
    await expect(visiblePage(page).getByTestId('m10-tag-assigned-Sommer')).toHaveCount(0)
  })

  /**
   * E2E-M10-22 (FR-24.9): the same control while *creating*, where there is
   * no row to move yet — the draft's order is what gets written, so the act
   * is a reordering of the draft and only the saved item says whether it
   * worked.
   */
  test('E2E-M10-22: the chip files a brand-new item too, before it exists', async ({ page }) => {
    const list = visiblePage(page)
    await list.getByTestId('m9-fab').click()
    await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
    await fillIonic(visiblePage(page).getByTestId('m10-name'), 'Sonnenhut')

    for (const tag of ['Kleidung', 'Sommer']) {
      await fillIonic(visiblePage(page).getByTestId('m10-tag-search'), tag)
      await visiblePage(page).getByTestId('m10-tag-create').click()
      await expect(visiblePage(page).getByTestId(`m10-tag-assigned-${tag}`)).toBeVisible()
    }

    // Kleidung was assigned first and would file it; the second chip's name
    // moves it to the front of the draft.
    await visiblePage(page).getByTestId('m10-tag-primary-Sommer').click()
    await expect(visiblePage(page).getByTestId('m10-tag-summary')).toContainText('Sommer')

    await commitNewItem(page, 'Sonnenhut')
    await backToInventory(page)
    expect(await groupHeadings(visiblePage(page))).toEqual(['sommer'])
  })
})

/**
 * UX-14: with a grown vocabulary, an empty query that rendered every
 * unassigned tag as a chip would put twenty on each form on the real
 * instance, and a long de placeholder runs out of its box at phone width.
 * The empty query offers a capped shelf with a "more via search" tail, and
 * the search still reaches everything.
 *
 * Phone viewport on purpose: the placeholder assertion is about fitting the
 * narrow box, and at the behaviour projects' desktop width it could not fail.
 */
test.describe('M10 item editor — the tag shelf stays short (UX-14)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ seedMode, page }) => {
    // German on purpose: the de placeholder is the one that clipped, and the
    // suite's default English would leave it unmeasured (the #151 trap —
    // an assertion that never sees the string it is about).
    await seedMode({ mode: 'local', locale: 'de' })
    await page.goto(PATH.items)
  })

  test('E2E-M10-16: an empty query offers a capped shelf, and search reaches past it', async ({
    page,
  }) => {
    test.slow() // ten tags are built through the form itself (§2.4)

    // Alphabetical creation order, so the shelf's "first eight" is the same
    // set whether the list orders by sort_order or by name.
    const tags = [
      'Angeln',
      'Baden',
      'Camping',
      'Deko',
      'Elektro',
      'Fischen',
      'Garten',
      'Hygiene',
      'Werkzeug',
      'Zubehör',
    ]
    await createItem(page, 'Träger', { tags })
    await backToInventory(page)

    // A fresh form: all ten are unassigned, the query is empty.
    await visiblePage(page).getByTestId('m9-fab').click()
    await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()

    const offers = visiblePage(page).locator('[data-testid^="m10-tag-offer-"]')
    await expect(offers).toHaveCount(8)
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Werkzeug')).toHaveCount(0)
    // The tail names what the shelf holds back, so the cap is visible state
    // rather than a silently shorter vocabulary.
    await expect(visiblePage(page).getByTestId('m10-tag-more')).toContainText('2')

    // The search reaches past the cap…
    await fillIonic(visiblePage(page).getByTestId('m10-tag-search'), 'Werkzeug')
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Werkzeug')).toBeVisible()

    // …and clearing it returns to the shelf. Cleared by keys, not fill(''):
    // deleting through the keyboard dispatches an input event per keystroke,
    // the same reason fillIonic types (see its comment).
    const searchInput = visiblePage(page).getByTestId('m10-tag-search').locator('input')
    await searchInput.click()
    await searchInput.press('ControlOrMeta+a')
    await searchInput.press('Backspace')
    await expect(searchInput).toHaveValue('')
    await expect(offers).toHaveCount(8)

    // The tail hands over to the search: after the tap, typing starts there.
    await visiblePage(page).getByTestId('m10-tag-more').click()
    await expect(visiblePage(page).getByTestId('m10-tag-search').locator('input')).toBeFocused()

    // The placeholder fits its box at phone width — a longer de string runs
    // out of the searchbar. Measured by rendering, not by reproducing the
    // font: the text briefly becomes the value, and scrollWidth then reports
    // what the box actually shows (a canvas re-measure quietly used the wrong
    // font and could not fail).
    const fits = await searchInput.evaluate((input: HTMLInputElement) => {
      input.value = input.placeholder
      const width = { text: input.scrollWidth, box: input.clientWidth }
      input.value = ''
      return width
    })
    expect(fits.text, `placeholder ${fits.text}px must fit ${fits.box}px`).toBeLessThanOrEqual(
      fits.box,
    )
  })
})
