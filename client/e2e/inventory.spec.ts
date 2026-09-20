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
import { fillIonic } from './helpers/ionic'
import type { Locator, Page } from '@playwright/test'
import { backToInventory, createItem } from './helpers/m9'
import { writesLanded } from './helpers/page'
import { PATH } from './routes'

/**
 * M9/M10 — the inventory and the item editor, rebuilt on the tag set
 * (§3.24, FR-24.1/24.2/24.4/24.5).
 *
 * What is worth an end-to-end case here is exactly what a unit test cannot
 * see: that an item on two tags renders as *one* row under its primary tag,
 * that the eye-icon preference actually changes the painted row, and that
 * creating an item is the minimal form rather than the full editor. The
 * ordering arithmetic itself lives in `domain/__tests__/tags`.
 *
 * Local Mode throughout: the inventory is backend-free, and the mode with no
 * server is where a missing client-side rule shows up.
 */

/**
 * Two decodable PNGs for the photo case, differing in *shape* rather than in
 * colour: FR-22.3 keeps the aspect ratio, so the rendered `naturalWidth` is
 * a signal about the bytes behind the preview. Both are far under the
 * FR-22.4 cap — the 150 KB backoff itself is measured where it is
 * deterministic, in `lib/__tests__/imageResize.spec.ts`.
 */
const WIDE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAQCAIAAADrtar6AAAAIElEQVR4nGO4o6ExIIhh1OJRi0ctHrV41OJRi0cthiEAX9ruH4ZT4goAAAAASUVORK5CYII=',
  'base64',
)
const TALL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAoCAIAAAB4uO32AAAAIElEQVR4nGPQsLlDEmIY1TCqYVTDqIZRDaMaRjXQSwMAeQMgLkk8R3gAAAAASUVORK5CYII=',
  'base64',
)

/**
 * Commit the creation form and wait for the *edit* page to be painted.
 *
 * A helper rather than two lines inline, because leaving this wait out is
 * invisible until it bites: committing does a `router.replace`, and going
 * back immediately overlaps two outlet transitions — after which
 * `ion-router-outlet` intercepts pointer events and the next tap simply
 * never lands. That surfaces as an unclickable FAB 30 s later, nothing
 * resembling a navigation error. The edit head exists only once the item
 * does, so it is a positive signal that the replaced page — and not the
 * form it replaced — is the one now on screen. It used to be the FR-25.15
 * indicator inside that head, which stopped saying so on 2026-09-20: the
 * indicator is silent until it has written something, and the write that
 * created the item can well have landed before its page was painted.
 */
async function commitNewItem(page: Page, name: string) {
  await visiblePage(page).getByTestId('m10-create').click()
  // Creating ends where editing continues — the saved item, by name.
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visiblePage(page).getByTestId('m10-edit-head')).toBeVisible()
}

/**
 * The group headings, normalised. Lower-cased on purpose: the heading wears
 * the `.jp-eyebrow` role, which uppercases in CSS, so the rendered casing is
 * a styling decision and not the data these cases are about.
 */
async function groupHeadings(scope: Locator): Promise<string[]> {
  const heads = await scope.getByTestId('m9-group-head').allInnerTexts()
  return heads.map((h) => h.split('\n')[0]!.trim().toLowerCase())
}

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

  test('E2E-M9-05: the list is lean until the properties sheet says otherwise', async ({
    page,
  }) => {
    await createItem(page, 'Wanderschuhe', { tags: ['Schuhe'], weight: '900' })
    await backToInventory(page)

    const row = visiblePage(page).getByTestId('m9-row').first()
    // Lean by default: the weight exists on the item but not on the row.
    await expect(row).not.toContainText('900 g')
    // ...and the eye carries no badge while nothing is shown. This is the
    // positive signal the count below is asserted against: "the badge reads
    // 1" is equally satisfied by a badge that always reads 1.
    const eye = page.getByTestId('m9-properties')
    await expect(eye.locator('ion-badge')).toHaveCount(0)

    await eye.click()
    await expect(page.getByTestId('m9-properties-sheet')).toBeVisible()
    await page.getByTestId('m9-property-weight').click()
    await page.keyboard.press('Escape')

    // The painted row changed — not merely the stored preference.
    const shown = visiblePage(page).getByTestId('m9-row').first()
    await expect(shown).toContainText('900 g')
    // *Exactly* those: enabling one property must not paint the other two,
    // which is the whole reason FR-24.4 is three switches and not one.
    await expect(shown).not.toContainText('Schuhe')
    await expect(eye.locator('ion-badge')).toHaveText('1')
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
    // all any more. Asserted on the element rather than on the old test id —
    // an absence assertion against an id nothing declares is green whatever
    // the app does, which is what `scripts/testid-gate.mjs` refuses.
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
   * the list and takes nothing out of it — the owner's call, 2026-09-13:
   * scrolling, not anchoring.
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

    // The list moved — the positive signal that the jump did anything at all.
    await expect.poll(offset).toBeGreaterThan(0)

    // ...and it moved *to the group asked for*, which „scrolled a bit" would
    // equally satisfy: while the sheet is up Ionic locks the scroll host, and
    // a jump issued into that lock moved the list 120 px of the 9 000 it
    // owed. The heading sits directly under the tool bar, within a row's
    // height of it.
    const tools = (await list.getByTestId('m9-tools').boundingBox())!
    const target = (await list
      .getByTestId('m9-group-head')
      .filter({ hasText: 'Zuletzt' })
      .boundingBox())!
    expect(target.y).toBeGreaterThanOrEqual(tools.y + tools.height - 2)
    expect(target.y).toBeLessThan(tools.y + tools.height + 60)
    // ...and it is still the whole inventory: a jump is not a filter.
    await expect(list.getByTestId('m9-row')).toHaveCount(12)
    await expect(list.getByTestId('m9-tools')).toBeVisible()
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
    await list.getByTestId('m9-select-all').click()
    await expect(list.getByTestId('m9-select-count')).toContainText('3')

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
    await expect(list.getByTestId('m9-selbar')).toHaveCount(0)

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
    await expect(list.getByTestId('m9-select-count')).toContainText('2')

    await list.getByTestId('m9-bulk-more').click()
    await page.locator('ion-action-sheet').getByText('Depends on').click()
    await expect(page.getByTestId('m9-bulk-dep-sheet')).toHaveAttribute('data-presented', 'true')
    // Required by default; this batch asks for the other mode (FR-20.4).
    await expect(page.getByTestId('m9-bulk-dep-suggested')).not.toBeChecked()
    await page.getByTestId('m9-bulk-dep-suggested').check()
    await page.getByTestId('m9-bulk-dep-search').fill('Kam')
    await page.getByTestId('m9-bulk-dep-pick-Kamera').click()

    // The mode ends with the batch, exactly as a tag batch does.
    await expect(list.getByTestId('m9-selbar')).toHaveCount(0)
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
      await expect(list.getByTestId('m9-selbar')).toHaveCount(0)
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
   * E2E-M9-17 (FR-24.10): a tag could be created and given away and never
   * fixed — `createTag` and `moveTag` were the only two tag mutations in the
   * product, so a name typed wrong stayed wrong.
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
    await expect(page.getByTestId('m9-tags-selected')).toContainText('3')

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
    await writesLanded(page)
    await page.goto(PATH.items)

    const list = visiblePage(page)
    await page.getByTestId('m9-select').click()
    await list.getByTestId('m9-row-check-Stirnlampe').click()
    await list.getByTestId('m9-row-check-Stirnlampe Petzl').click()
    await expect(list.getByTestId('m9-select-count')).toContainText('2')

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

    // M23 says where the losing row went, so its restore is not a silent
    // offer to create the duplicate again.
    await page.goto(PATH.masterRetired)
    const retired = visiblePage(page)
    await expect(retired.getByTestId('m23-row').filter({ hasText: 'Petzl' })).toContainText(
      'merged into',
    )
  })

  /*
   * E2E-M9-08 measured the gap between the tag axis and the first group
   * heading (UX-4). The axis is gone with FR-24.8, and the geometry that
   * replaced its promise — the heading stacked *below* the tool bar rather
   * than sliding under it — is asserted by E2E-M9-13. The id is struck in
   * the ledger rather than renumbered onto this case.
   */

  /**
   * E2E-M9-10 (FR-1.1): the "searchable" half of M9-01's sentence, which
   * until now nothing typed into. G-12's own case asserts that the
   * magnifier opens *this* screen's field; that the field then filters the
   * list is a different promise and belongs here.
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
   * E2E-M9-11 (FR-24.7): what the old rule could not be typed into. Both
   * halves were measured against the family instance before they were
   * written — „gurtel" and „guertel" each returned 0 of 184 rows, and a tag
   * every row carries could not be searched at all.
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
   * E2E-M9-12 (FR-24.7): the dead end that cost the audit its clearest
   * screenshot — „socken" under an unrelated tag chip, answered with a bare
   * „Kein Artikel gefunden" while three socks sat in the list.
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
   * two swipes the old screen had no heading, no axis and no field left, and
   * filtering meant scrolling fifteen screens back.
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

/**
 * E2E-M9-04 (G-7/NFR-4.7): the empty inventory offers the way in. Its own
 * describe because the world is the interesting part — every other case
 * here creates an item first, and this one must not.
 *
 * Nothing had ever rendered this state: `m9-empty` appears in the suite
 * exactly once before this case, as G9-13's *absence* assertion, where it
 * stands in for "not the inventory screen".
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

    // FR-25.15 rides along here rather than in a case of its own, because
    // this is the one M10 case that opens a *saved* item and then edits a
    // field — which is exactly the before/after the indicator needs. Since
    // 2026-09-20 the lamp is silent until the editor has written something,
    // so the absence is the positive signal the presence below is read
    // against. Its row still holds its height while it is silent: alone on
    // a line, a collapsing row would move the whole form up and drop it back
    // on the first edit.
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

    // Tapping the *name* is the new target; the ✕ beside it is the old one.
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
    // happens to have painted nothing. (It read `m9-tag-axis` until FR-24.8
    // removed that control — an absence assertion against an element nothing
    // renders any more is green by construction.)
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
    // Since 2026-08-31 the two FR-24.5 also names are real sections, so
    // their absence here asserts something at last: „Enthalten in"
    // (FR-27.8) and „Kommentare aus Reisen" (FR-27.9) are built, and an
    // item that does not exist yet is in no group and carries no remark.
    // E2E-M10-17 and E2E-M10-18 are the positive halves.
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

/*
 * The half of M10 that only exists once the item does — and the half that had
 * stayed English through the i18n migration (NFR-4.12).
 *
 * Seeded in German on purpose. The suite's app language is English by design
 * (see `seed`), and against English an assertion cannot tell a catalogue
 * lookup from the hard-coded word it replaced: both render "Photo". Only the
 * *other* language separates them, which is why this is the one block that
 * asks for it.
 */
test.describe('M10 item editor — the saved item speaks the catalogue (NFR-4.12)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local', locale: 'de' })
    await page.goto(PATH.items)
  })

  test('E2E-M10-13: the sections an existing item owns follow the app language', async ({
    page,
  }) => {
    await createItem(page, 'Fernglas')

    // The positive counterpart to E2E-M10-07's absence assertions: present,
    // and worded by the catalogue rather than by the template.
    const form = visiblePage(page)
    await expect(form.getByTestId('m10-section-photo')).toHaveText('Foto')
    await expect(form.getByTestId('m10-section-depends')).toHaveText('Hängt ab von')
    await expect(form.getByTestId('m10-add-dependency')).toContainText('Abhängigkeit hinzufügen')
    await expect(form.getByTestId('m10-section-companions')).toHaveText('Begleitartikel')
    await expect(form.getByTestId('m10-add-companion')).toContainText('Begleitartikel hinzufügen')

    // The dependency picker is behind a tap, and carried three literals of
    // its own — the search, the empty answer, and the way out.
    await form.getByTestId('m10-add-dependency').click()
    await expect(visiblePage(page).getByPlaceholder('Artikel durchsuchen…')).toBeVisible()
  })
})

/*
 * The two sections a saved item owns that nothing had ever rendered
 * (audit 2026-08-30, backlog item 6). Both were specified in July, both are
 * built, and between them they carried one `data-testid` — the heading
 * E2E-M10-13 reads for its German word. A heading is not a behaviour.
 */
test.describe('M10 item editor — the sections a saved item owns (FR-20.1/22.1)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto(PATH.items)
  })

  /** Open an item from the inventory list, settled on its editor. */
  async function openItem(page: Page, name: string) {
    await visiblePage(page).getByTestId('m9-row').filter({ hasText: name }).click()
    await expect(page.getByTestId('header-title')).toHaveText(name)
  }

  test('E2E-M10-03: a dependency that would close a circle is refused in words', async ({
    page,
  }) => {
    test.slow() // both items are built through M10's own form (§2.4)

    await createItem(page, 'Kamera')
    await backToInventory(page)
    await createItem(page, 'Ersatzakku')

    // The editor is open on the Ersatzakku: it depends on the Kamera, and
    // the mode a new relation takes is *nötig* until someone says otherwise
    // (FR-20.1) — which is what makes E2E-M4-40's cascade the default.
    await visiblePage(page).getByTestId('m10-add-dependency').click()
    await visiblePage(page).getByTestId('m10-dependency-main-Kamera').click()
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Kamera')).toContainText(
      'Required',
    )

    await backToInventory(page)
    await openItem(page, 'Kamera')

    // The reverse list: the items that need this one. It shows the same
    // relation from the other end, with the same mode the dependent side
    // declared (FR-20.4).
    await expect(visiblePage(page).getByTestId('m10-companion-Ersatzakku')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-companion-mode-Ersatzakku')).toContainText(
      'Required',
    )

    // The circle: the Kamera cannot in turn depend on the Ersatzakku.
    await visiblePage(page).getByTestId('m10-add-dependency').click()
    await visiblePage(page).getByTestId('m10-dependency-main-Ersatzakku').click()
    // Readable, and it names the hops rather than saying "invalid": the
    // path is the only part of the refusal the user can act on.
    await expect(visiblePage(page).getByTestId('m10-dependency-error')).toContainText(
      'Kamera → Ersatzakku → Kamera',
    )

    // Refused at save time, not reported after the write: the relation is
    // absent afterwards. The companion row above is the positive signal
    // that assertion is made against — this screen does render the pair,
    // so "no dependency row" cannot be produced by it rendering nothing.
    await visiblePage(page).getByTestId('m10-dependency-cancel').click()
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Ersatzakku')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m10-companion-Ersatzakku')).toBeVisible()
  })

  /*
   * FR-20.1 says an item can carry dependencies "in either direction", and
   * the relation is one row either way — but only the dependent's editor
   * could write it, so declaring "the tripod needs this plate" meant leaving
   * the item in hand and finding the other one first.
   */
  test('E2E-M10-20: a companion is declared, re-moded and removed from the main item', async ({
    page,
  }) => {
    test.slow() // both items are built through M10's own form (§2.4)

    await createItem(page, 'Arca-Platte')
    await writesLanded(page)
    await backToInventory(page)
    await createItem(page, 'Teleobjektiv')

    // Declared from the main item's side: the lens takes the plate along.
    await visiblePage(page).getByTestId('m10-add-companion').click()
    await visiblePage(page).getByTestId('m10-companion-pick-Arca-Platte').click()
    await expect(visiblePage(page).getByTestId('m10-companion-mode-Arca-Platte')).toContainText(
      'Required',
    )

    // The same edge, read from the end that has always been able to write it:
    // this is what says the relation was stored rather than only drawn.
    await writesLanded(page)
    await backToInventory(page)
    await openItem(page, 'Arca-Platte')
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Teleobjektiv')).toContainText(
      'Required',
    )

    // A circle refused from this direction too — the lens cannot become the
    // plate's companion while the plate is already the lens's.
    await visiblePage(page).getByTestId('m10-add-companion').click()
    await visiblePage(page).getByTestId('m10-companion-pick-Teleobjektiv').click()
    await expect(visiblePage(page).getByTestId('m10-companion-error')).toContainText(
      'Teleobjektiv → Arca-Platte → Teleobjektiv',
    )
    await visiblePage(page).getByTestId('m10-companion-cancel').click()
    // Refused at save time: the dependent side still lists exactly the one
    // relation, and the picker's own row is gone rather than written.
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Teleobjektiv')).toHaveCount(1)

    // Mode and removal are the main item's to change as well.
    await writesLanded(page)
    await backToInventory(page)
    await openItem(page, 'Teleobjektiv')
    await visiblePage(page).getByTestId('m10-companion-mode-Arca-Platte').click()
    await page.getByRole('radio', { name: 'Suggested' }).click()
    await writesLanded(page)
    await backToInventory(page)
    await openItem(page, 'Arca-Platte')
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Teleobjektiv')).toContainText(
      'Suggested',
    )

    await writesLanded(page)
    await backToInventory(page)
    await openItem(page, 'Teleobjektiv')
    await visiblePage(page).getByTestId('m10-companion-remove-Arca-Platte').click()
    await expect(visiblePage(page).getByTestId('m10-companion-mode-Arca-Platte')).toHaveCount(0)
    await writesLanded(page)
    await backToInventory(page)
    await openItem(page, 'Arca-Platte')
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Teleobjektiv')).toHaveCount(0)
  })

  /*
   * FR-24.11 inside FR-20.1's picker: a companion the inventory does not hold
   * yet used to mean leaving the item in hand, creating the other one in M9,
   * finding the first again and only then declaring the pair.
   */
  test('E2E-M10-23: a companion the inventory lacks is created from the picker and declared at once', async ({
    page,
  }) => {
    await createItem(page, 'Stirnlampe', { tags: ['Technik'] })
    await writesLanded(page)

    const editor = visiblePage(page)
    await editor.getByTestId('m10-add-companion').click()
    await editor.getByTestId('m10-companion-search').locator('input').fill('Ersatzbatterien')
    await expect(editor.getByTestId('m10-companion-offer-title')).toContainText('Ersatzbatterien')

    await editor.getByTestId('m10-companion-offer').click()
    // M9 stays mounted under the editor with a sheet of its own; the one
    // this page presents is the one on show.
    const sheet = page.getByTestId('create-item-sheet').and(page.locator('.show-modal'))
    await expect(sheet).toHaveAttribute('data-presented', 'true')
    await expect(sheet.getByTestId('create-item-name').locator('input')).toHaveValue(
      'Ersatzbatterien',
    )
    // The item in hand's tag leads the offers: the batteries live where the lamp does.
    await expect(sheet.locator('[data-testid^="create-item-tag-offer-"]').first()).toHaveText(
      'Technik',
    )
    await sheet.getByTestId('create-item-tag-offer-Technik').click()
    await sheet.getByTestId('create-item-confirm').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // Still in the lamp's editor, the pair declared and the picker closed.
    await expect(page.getByTestId('header-title')).toHaveText('Stirnlampe')
    await expect(editor.getByTestId('m10-companion-mode-Ersatzbatterien')).toContainText('Required')
    await expect(editor.getByTestId('m10-add-companion')).toBeVisible()

    // „Create and open" declares the pair first and then continues in the new
    // item's editor, which reads the relation from its own end.
    await editor.getByTestId('m10-add-companion').click()
    await editor.getByTestId('m10-companion-search').locator('input').fill('Ladekabel')
    await editor.getByTestId('m10-companion-offer').click()
    await expect(sheet).toHaveAttribute('data-presented', 'true')
    await sheet.getByTestId('create-item-open').click()
    await expect(page.getByTestId('header-title')).toHaveText('Ladekabel')
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Stirnlampe')).toContainText(
      'Required',
    )

    // Stored, not only drawn: the new item exists with its tag and names the
    // lamp from its own end of the relation.
    await writesLanded(page)
    await backToInventory(page)
    await openItem(page, 'Ersatzbatterien')
    await expect(visiblePage(page).getByTestId('m10-tag-primary-Technik')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Stirnlampe')).toContainText(
      'Required',
    )
  })

  test('E2E-M10-26: a main item the inventory lacks is created from the dependency picker and depended on', async ({
    page,
  }) => {
    await createItem(page, 'Ersatzakku', { tags: ['Technik'] })
    await writesLanded(page)

    const editor = visiblePage(page)
    await editor.getByTestId('m10-add-dependency').click()
    await editor.getByTestId('m10-dependency-search').locator('input').fill('Kamera')
    await expect(editor.getByTestId('m10-dependency-offer-title')).toContainText('Kamera')
    await editor.getByTestId('m10-dependency-offer').click()

    // M9 stays mounted under the editor with a sheet of its own.
    const sheet = page.getByTestId('create-item-sheet').and(page.locator('.show-modal'))
    await expect(sheet).toHaveAttribute('data-presented', 'true')
    await expect(sheet.getByTestId('create-item-name').locator('input')).toHaveValue('Kamera')
    await expect(sheet.locator('[data-testid^="create-item-tag-offer-"]').first()).toHaveText(
      'Technik',
    )
    await sheet.getByTestId('create-item-confirm').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // The direction is the picker's: this item depends on the new one.
    await expect(page.getByTestId('header-title')).toHaveText('Ersatzakku')
    await expect(editor.getByTestId('m10-dependency-mode-Kamera')).toContainText('Required')
    await expect(editor.getByTestId('m10-add-dependency')).toBeVisible()

    await writesLanded(page)
    await backToInventory(page)
    await openItem(page, 'Kamera')
    await expect(visiblePage(page).getByTestId('m10-companion-Ersatzakku')).toBeVisible()
  })

  test('E2E-M10-04: a photo is added, replaced, and removed on the item', async ({ page }) => {
    await createItem(page, 'Fernglas')

    const form = visiblePage(page)
    await expect(form.getByTestId('m10-photo-empty')).toBeVisible()
    await expect(form.getByTestId('m10-photo-add')).toContainText('Add photo')
    // Nothing to remove yet, and the control says so by not being there.
    await expect(form.getByTestId('m10-photo-remove')).toHaveCount(0)

    await form
      .getByTestId('m10-photo-file')
      .setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: WIDE_PNG })

    const preview = form.getByTestId('m10-photo-preview')
    await expect(preview).toBeVisible()
    await expect(form.getByTestId('m10-photo-empty')).toHaveCount(0)
    // The one trigger words itself for the state it is in (FR-22.5).
    await expect(form.getByTestId('m10-photo-add')).toContainText('Replace photo')
    // The aspect ratio is the source's, which is what says the picked file
    // reached the canvas: FR-22.3 rescales, it never crops to a square.
    await expect(preview).toHaveJSProperty('naturalWidth', 40)

    // Replace. The two sources differ in *shape*, so the assertion is about
    // the bytes behind the preview and not about the object URL, which a
    // rewrite changes whether or not the image did.
    await form
      .getByTestId('m10-photo-file')
      .setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: TALL_PNG })
    await expect(preview).toHaveJSProperty('naturalWidth', 16)

    // Stored, not merely previewed: the preview is read back from the
    // device by `image_hash`, so leaving and returning proves the write.
    await backToInventory(page)
    await openItem(page, 'Fernglas')
    await expect(visiblePage(page).getByTestId('m10-photo-preview')).toHaveJSProperty(
      'naturalWidth',
      16,
    )

    await visiblePage(page).getByTestId('m10-photo-remove').click()
    await expect(visiblePage(page).getByTestId('m10-photo-empty')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m10-photo-preview')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m10-photo-add')).toContainText('Add photo')
    await expect(visiblePage(page).getByTestId('m10-photo-remove')).toHaveCount(0)
  })
})

/**
 * UX-14 (review 2026-08-25): with a grown vocabulary, an empty query rendered
 * every unassigned tag as a chip — twenty per form on the real instance — and
 * the de placeholder ran out of its box at phone width. The empty query now
 * offers a capped shelf with a "more via search" tail, and the search still
 * reaches everything.
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

    // The placeholder fits its box at phone width — the de string used to run
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

/**
 * M10's rear-view — FR-27.8 and FR-27.9, built 2026-08-31.
 *
 * Both were mocked in the concept prototype in July, written into three
 * specs, and existed in no build. They are the two halves of the question the
 * owner actually asks at an item: what hangs off this, and what did we say
 * about it last time.
 */
test.describe("M10 — the item's rear-view @local @m10", () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M10-17 (FR-27.8): which groups and Vorlagen hold this item, and the
  // way into each. The delete card's count says how many; until now nothing
  // said which, which is the question asked before an item is edited.
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
  // year's list is curated, and until now it died in an archived trip.
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
