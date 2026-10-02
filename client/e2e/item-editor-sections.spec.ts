import { test, expect, visiblePage } from './fixtures'
import { TALL_PNG, WIDE_PNG } from './helpers/images'
import type { Page } from '@playwright/test'
import { backToInventory, createItem } from './helpers/m9'
import { writesLanded } from './helpers/page'
import { PATH } from './routes'

/**
 * M10 — the sections a saved item owns: its dependencies (FR-20.1), its
 * photo (FR-22.1), and their words in the app language (NFR-4.12).
 */

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
 * The two sections a saved item owns, operated rather than only found: the
 * heading E2E-M10-13 reads for its German word is not a behaviour.
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
   * E2E-M10-31 (FR-20.1): a name in either list is the way to that item.
   * Without it, inspecting a dependent means finding it again by hand in
   * the inventory; the name is the link, and only the name — the row's
   * mode select and remove button must not navigate.
   */
  test('E2E-M10-31: a dependency’s name leads to that item, from either list', async ({ page }) => {
    test.slow() // both items are built through M10's own form (§2.4)

    await createItem(page, 'Kamera')
    await backToInventory(page)
    await createItem(page, 'Ersatzakku')
    await visiblePage(page).getByTestId('m10-add-dependency').click()
    await visiblePage(page).getByTestId('m10-dependency-main-Kamera').click()
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Kamera')).toBeVisible()
    await writesLanded(page)

    // „Hängt ab von" → the main item's own editor, rendered, not only routed.
    await visiblePage(page).getByTestId('m10-dependency-open-Kamera').click()
    await expect(page.getByTestId('header-title')).toHaveText('Kamera')
    await expect(visiblePage(page).getByTestId('m10-companion-Ersatzakku')).toBeVisible()

    // And back the other way: „Begleitartikel" → the dependent.
    await visiblePage(page).getByTestId('m10-companion-open-Ersatzakku').click()
    await expect(page.getByTestId('header-title')).toHaveText('Ersatzakku')
    await expect(visiblePage(page).getByTestId('m10-dependency-mode-Kamera')).toBeVisible()
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
   * yet would otherwise mean leaving the item in hand, creating the other one
   * in M9, finding the first again and only then declaring the pair.
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
