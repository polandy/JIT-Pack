import { test, expect, visiblePage } from './fixtures'
import type { Page } from '@playwright/test'
import { backToInventory, createItem, groupHeadings } from './helpers/m9'
import { writesLanded } from './helpers/page'
import { PATH } from './routes'

/**
 * M9 — the tags themselves, behind the tag manager (FR-24.10/24.14): renamed,
 * refused a delete, merged away, reordered by their grip.
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
   * FR-24.10's three cases share one entrance, so it is written once.
   *
   * Everything the manager does is asserted on **M9's group headings** and
   * not inside the sheet: the sheet would render a renamed row, or a row
   * gone, whether or not a mutation was ever written. The heading is where
   * the tag actually files something.
   */
  /**
   * Type into a `promptText` alert's field.
   *
   * Not `fillIonic`: an `ion-alert` input is a plain `<input>` the overlay
   * renders itself, with no web component around it to go `hydrated` — the
   * helper waits for a class that never arrives.
   */
  async function fillPrompt(page: Page, value: string): Promise<void> {
    const field = page.locator('ion-alert input[aria-label="name"]')
    await expect(field).toBeVisible()
    await field.fill(value)
  }

  async function openTagManager(page: Page): Promise<void> {
    await page.getByTestId('header-overflow').click()
    await page.getByText('Manage tags', { exact: true }).click()
    await expect(page.getByTestId('m9-tags-sheet')).toHaveAttribute('data-presented', 'true')
  }

  /**
   * E2E-M9-17 (FR-24.10): a tag is not only created and given away but
   * renamed — without it, a name typed wrong stays wrong.
   */
  test('E2E-M9-17: a tag is renamed, and a name another tag holds is refused', async ({ page }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidun'] })
    await backToInventory(page)
    await createItem(page, 'Kamera', { tags: ['Technik'] })
    await backToInventory(page)

    const list = visiblePage(page)
    expect(await groupHeadings(list)).toEqual(['kleidun', 'technik'])

    await openTagManager(page)
    await page.getByTestId('m9-tag-rename-Kleidun').click()
    await fillPrompt(page, 'Kleidung')
    await page.getByRole('button', { name: 'Rename' }).click()
    // The toast, before `writesLanded`, and it is not decoration: clicking an
    // alert button only *dismisses* the alert — the handler runs after
    // `onDidDismiss` resolves. `writesLanded` asserts the indicator is
    // settled, which it still is in that gap, so on its own it can pass
    // before the first write of the action exists. The toast is the
    // production code's own signal that the action has run.
    await expect(page.locator('ion-toast')).toContainText('is now called')
    await writesLanded(page)

    // The heading, not the sheet row: this is the write being observable.
    await page.getByTestId('m9-tags-close').click()
    expect(await groupHeadings(list)).toEqual(['kleidung', 'technik'])

    // And the refusal. „Technik" is taken, so the alert stays up with the
    // typed text — dismissing it would throw away an edit one character from
    // right — and nothing on the list behind it moves.
    await openTagManager(page)
    await page.getByTestId('m9-tag-rename-Kleidung').click()
    await fillPrompt(page, 'Technik')
    await page.getByRole('button', { name: 'Rename' }).click()
    await expect(page.getByTestId('m9-tag-rename-prompt')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByTestId('m9-tags-close').click()
    expect(await groupHeadings(list)).toEqual(['kleidung', 'technik'])
  })

  /**
   * E2E-M9-18 (FR-24.10, ADR-063): `item_tags.tag_id` is ON DELETE CASCADE,
   * so the delete the database would happily perform strips the tag from
   * every item and drops each one it filed into the leftover bucket. The app
   * refuses it and hands back the merge instead.
   */
  test('E2E-M9-18: a tag items carry is not deleted, and the refusal offers the merge', async ({
    page,
  }) => {
    await createItem(page, 'Badehose', { tags: ['Kleidung'] })
    await backToInventory(page)

    const list = visiblePage(page)
    await openTagManager(page)
    await page.getByTestId('m9-tag-delete-Kleidung').click()

    // The positive signal the absence is read against: the refusal says the
    // count out loud, and its confirming button is the merge rather than a
    // delete.
    const refusal = page.getByTestId('m9-tag-in-use')
    await expect(refusal).toBeVisible()
    await expect(refusal).toContainText('One item carries the tag')
    await expect(refusal.getByRole('button', { name: 'Merge' })).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByTestId('m9-tags-close').click()
    // A delete that had gone through would have taken the heading with it.
    expect(await groupHeadings(list)).toEqual(['kleidung'])
  })

  /**
   * E2E-M9-19 (FR-24.10, ADR-063): the merge, reached through the refusal.
   *
   * The item carries **both** tags, with the source first — the case that
   * makes the promotion clause observable. Re-pointing the assignment and
   * dropping the collision is not enough: without carrying the source's
   * position over, the surviving assignment keeps its own, and the row is
   * filed under whatever sorts first next.
   */
  test('E2E-M9-19: merging a tag away files its items under the target', async ({ page }) => {
    test.slow()
    // „Sommer" is assigned first, so it is the primary tag and the heading.
    await createItem(page, 'Badehose', { tags: ['Sommer', 'Kleidung'] })
    await backToInventory(page)

    const list = visiblePage(page)
    expect(await groupHeadings(list)).toEqual(['sommer'])

    await openTagManager(page)
    await page.getByTestId('m9-tag-delete-Sommer').click()
    await page.getByTestId('m9-tag-in-use').getByRole('button', { name: 'Merge' }).click()
    await page.getByTestId('m9-tag-merge-into-Kleidung').click()
    await page.getByTestId('m9-tag-merge-confirm').getByRole('button', { name: 'Merge' }).click()
    // See E2E-M9-17 on why the toast comes first — this case is the one that
    // paid for it, on a CI shard, with the item still under „Sommer".
    await expect(page.locator('ion-toast')).toContainText('is now filed under')
    await writesLanded(page)

    await page.getByTestId('m9-tags-close').click()
    // One row, under the target — and „Sommer" heads nothing, because the
    // merge deleted it once nothing carried it.
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    expect(await groupHeadings(list)).toEqual(['kleidung'])
  })

  /**
   * E2E-M9-28 (FR-24.14): three tags for one idea, merged in one act.
   *
   * Three tags for one idea — the shape a grown axis actually has. The case
   * the per-pair merge cannot do: **one item carries two of the
   * sources**, so merging them one after another would re-point both of its
   * assignments onto the survivor — two `item_tags` rows for one item, which
   * `UNIQUE (item_id, tag_id)` refuses after the outbox has taken them. The
   * row surviving with exactly one tag is what says the plan was made over
   * the whole selection.
   *
   * The item's heading is the second assertion, and it is the one the merge
   * exists for: „sommer" is its primary tag, and if the surviving assignment
   * kept its own position the row would move to a heading neither tag had.
   */
  test('E2E-M9-28: several tags are merged into one, and an item that carried two keeps one', async ({
    page,
  }) => {
    test.slow()
    // Badehose carries two of the three; the survivor is the one with the
    // most items, so „Sommer" has to be the biggest of them.
    await createItem(page, 'Badehose', { tags: ['Sommerurlaub', 'Sommersachen'] })
    await backToInventory(page)
    await createItem(page, 'Sonnenhut', { tags: ['Sommer'] })
    await backToInventory(page)
    await createItem(page, 'Sonnencreme', { tags: ['Sommer'] })
    await backToInventory(page)

    const list = visiblePage(page)
    expect(await groupHeadings(list)).toHaveLength(2)

    await openTagManager(page)
    await page.getByTestId('m9-tags-select').click()
    await page.getByTestId('m9-tag-pick-Sommer').click()
    await page.getByTestId('m9-tag-pick-Sommerurlaub').click()
    await page.getByTestId('m9-tag-pick-Sommersachen').click()
    await expect(page.getByTestId('m9-tags-select-count')).toContainText('3')

    await page.getByTestId('m9-tags-merge-many').click()
    // Largest first, and it is the one this act keeps.
    await page.getByTestId('m9-tag-merge-into-Sommer').click()
    await page
      .getByTestId('m9-tags-merge-many-confirm')
      .getByRole('button', { name: 'Merge' })
      .click()
    // **One** item, not three: the two that already carried „Sommer" were
    // never under a source, and the one that carried two of them moves once.
    // The count is items and not assignments, which is the difference a merge
    // over a set has from a merge per pair.
    await expect(page.locator('ion-toast')).toContainText('One item is now filed under')
    await writesLanded(page)

    await page.getByTestId('m9-tags-close').click()
    // One heading for all three items: the two misspellings are gone, and the
    // item that carried both of them is filed under the survivor exactly once.
    expect(await groupHeadings(list)).toEqual(['sommer'])
    await expect(list.getByTestId('m9-row')).toHaveCount(3)

    await openTagManager(page)
    await expect(page.getByTestId('m9-tag-row-Sommer')).toContainText('3')
    await expect(page.getByTestId('m9-tag-row-Sommerurlaub')).toHaveCount(0)
    await expect(page.getByTestId('m9-tag-row-Sommersachen')).toHaveCount(0)
  })

  /**
   * E2E-M9-32 (FR-24.14, ADR-075): the tag manager selects the way every
   * list does — a hold (its right-click twin) on a row picks it, a tap picks
   * the next, and the merge waits in the same bulk bar M9's own list uses.
   *
   * The right-click lands on the name, which outside the mode is the rename
   * control: the row's hold has to take it wherever on the row it lands.
   * That a *touch* hold's release click does not then rename is the unit
   * spec's (`TagManagerSheet.spec.ts`) — a right-click sends no click, so an
   * absence asserted here would hold whatever the guard did.
   */
  test('E2E-M9-32: a hold on a tag starts picking, and the merge waits in the bulk bar', async ({
    page,
  }) => {
    await createItem(page, 'Kamera', { tags: ['Foto'] })
    await backToInventory(page)
    await createItem(page, 'Zelt', { tags: ['Camping'] })
    await backToInventory(page)

    await openTagManager(page)
    await expect(page.getByTestId('m9-tags-select-count')).toHaveCount(0)
    await page.getByTestId('m9-tag-rename-Foto').click({ button: 'right' })

    // G-20 in a sheet: the head's line under the title is the count.
    await expect(page.getByTestId('m9-tags-select-count')).toHaveText('One selected')
    await expect(page.getByTestId('m9-tag-row-Foto')).toHaveAttribute('data-picked', 'true')
    // One tag is a selection on its way to two: the bar is there, the merge
    // in it is not yet live.
    await expect(page.getByTestId('m9-tags-merge-many')).toBeDisabled()

    await page.getByTestId('m9-tag-name-Camping').click()
    await expect(page.getByTestId('m9-tags-select-count')).toHaveText('2 selected')
    await expect(page.getByTestId('m9-tags-merge-many')).toBeEnabled()

    // Leaving the mode — the head's checkbox, lit while it is on — gives the
    // rows their acts back.
    await page.getByTestId('m9-tags-select').click()
    await expect(page.getByTestId('m9-tags-select-count')).toHaveCount(0)
    await expect(page.getByTestId('m9-tag-rename-Foto')).toBeVisible()
  })

  /**
   * E2E-M9-33 (FR-24.10, ADR-075): a tag is moved on the axis by the grip M6
   * and M25 drag with, not by arrows. The drag waits on `data-drag` returning
   * to `idle`, which `useDragToGroup` holds until the write is enqueued, and
   * the order is read where it matters — M9's own headings, after the sheet
   * is closed — rather than in the sheet that was just dragged.
   */
  test('E2E-M9-33: a tag is dragged by its grip to another place on the axis', async ({ page }) => {
    await createItem(page, 'Kamera', { tags: ['Foto'] })
    await backToInventory(page)
    await createItem(page, 'Zelt', { tags: ['Camping'] })
    await backToInventory(page)
    await createItem(page, 'Karte', { tags: ['Navigation'] })
    await backToInventory(page)
    const list = visiblePage(page)
    expect(await groupHeadings(list)).toEqual(['foto', 'camping', 'navigation'])

    await openTagManager(page)
    const host = page.getByTestId('m9-tags-body')
    await expect(host).toHaveAttribute('data-drag', 'idle')
    const grip = page.getByTestId('m9-tag-grip-Navigation')
    const target = page.getByTestId('m9-tag-row-Foto')
    const g = (await grip.boundingBox())!
    const t = (await target.boundingBox())!

    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2, g.y + 4, { steps: 3 })
    await expect(host).toHaveAttribute('data-drag', 'dragging')
    // Above the middle of the first row: the gap before it.
    await page.mouse.move(t.x + t.width / 2, t.y + 6, { steps: 8 })
    await expect(target).toHaveClass(/gap-before/)
    // The chip above the finger names the place on the axis (G-21).
    await expect(page.locator('[data-drag-ghost] [data-carry-title]')).toHaveText('Navigation')
    await expect(page.locator('[data-drag-ghost] [data-carry-where]')).toHaveText('→ position 1')
    await page.mouse.up()
    await expect(host).toHaveAttribute('data-drag', 'idle')
    await writesLanded(page)

    await page.getByTestId('m9-tags-close').click()
    await expect.poll(() => groupHeadings(list)).toEqual(['navigation', 'foto', 'camping'])
  })
})
