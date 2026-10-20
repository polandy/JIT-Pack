import { test, expect, visiblePage } from './fixtures'
import { fillIonic } from './helpers/ionic'
import { backToInventory, commitNewItem, createItem, groupHeadings } from './helpers/m9'
import { pageSettled } from './helpers/page'
import { PATH } from './routes'

/**
 * M10 — the item's tags: where it is filed (FR-24.9), and the shelf of tags
 * an empty query offers (FR-24.1).
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
 * FR-24.1: with an empty query every unassigned tag is offered, folded to two
 * lines — a grown instance carries dozens of tags, and all of them open would
 * push the rest of every item form down — and one tap opens the rest, so no
 * tag is reachable only by typing its name. A long de placeholder runs out of
 * its box at phone width.
 *
 * Phone viewport on purpose: the fold is about the narrow column, and the
 * placeholder assertion could not fail at the behaviour projects' desktop width.
 */
test.describe('M10 item editor — every tag on a folded shelf (FR-24.1)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ seedMode, page }) => {
    // German on purpose: the de placeholder is the one that clipped, and the
    // suite's default English would leave it unmeasured (the #151 trap —
    // an assertion that never sees the string it is about).
    await seedMode({ mode: 'local', locale: 'de' })
    await page.goto(PATH.items)
  })

  test('E2E-M10-16: an empty query folds every tag to two lines, and one tap opens the rest', async ({
    page,
  }) => {
    test.slow() // ten tags are built through the form itself (§2.4)

    // Names long enough that two share a line at 390 px, so ten need five
    // lines and the fold has something to hold back. The last one created
    // is last in the vocabulary's order, below the fold.
    const tags = [
      'Erste-Hilfe-Ausrüstung',
      'Fahrradreparaturset',
      'Ferienwohnungsküche',
      'Kinderbetreuungsmaterial',
      'Wintersportbekleidung',
      'Schwimmausrüstung',
      'Campingküchenzubehör',
      'Kletterausrüstung',
      'Reisedokumentenmappe',
      'Werkzeugkiste',
    ]
    await createItem(page, 'Träger', { tags })
    await backToInventory(page)

    // A fresh form: all ten are unassigned, the query is empty.
    await visiblePage(page).getByTestId('m9-fab').click()
    await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
    // The toggle is tapped next, and a tap issued into the form's incoming
    // transition can land on neither page.
    await pageSettled(page)

    const offers = visiblePage(page).locator('[data-testid^="m10-tag-offer-"]')
    const toggle = visiblePage(page).getByTestId('m10-tag-shelf-toggle')
    const lines = () =>
      offers.evaluateAll(
        (chips) => new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size,
      )

    // Folded: the offers fill exactly two lines, and the toggle names all ten.
    await expect(toggle).toHaveText('Alle 10 zeigen')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(await lines()).toBe(2)
    expect(await offers.count()).toBeLessThan(tags.length)
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Werkzeugkiste')).toHaveCount(0)

    // The search reaches a folded tag, and a query is not folded.
    await fillIonic(visiblePage(page).getByTestId('m10-tag-search'), 'Werkzeug')
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Werkzeugkiste')).toBeVisible()
    await expect(toggle).toHaveCount(0)

    // Clearing it folds the shelf again. Cleared by keys, not fill(''):
    // deleting through the keyboard dispatches an input event per keystroke,
    // the same reason fillIonic types (see its comment).
    const searchInput = visiblePage(page).getByTestId('m10-tag-search').locator('input')
    await searchInput.click()
    await searchInput.press('ControlOrMeta+a')
    await searchInput.press('Backspace')
    await expect(searchInput).toHaveValue('')
    await expect(toggle).toHaveText('Alle 10 zeigen')
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Werkzeugkiste')).toHaveCount(0)

    // One tap opens all ten in place, without typing…
    await toggle.click()
    await expect(offers).toHaveCount(tags.length)
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Werkzeugkiste')).toBeVisible()
    await expect(toggle).toHaveText('Weniger zeigen')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // …and the next new item finds the shelf as it was left.
    await backToInventory(page)
    await visiblePage(page).getByTestId('m9-fab').click()
    await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
    // The toggle is tapped next, and a tap issued into the form's incoming
    // transition can land on neither page.
    await pageSettled(page)
    await expect(offers).toHaveCount(tags.length)

    // Folding it back returns to two lines.
    await toggle.click()
    await expect(toggle).toHaveText('Alle 10 zeigen')
    await expect(visiblePage(page).getByTestId('m10-tag-offer-Werkzeugkiste')).toHaveCount(0)
    expect(await lines()).toBe(2)

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
