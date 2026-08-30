import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

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

/** The page that is actually painted — a route change alone proves nothing. */
function visible(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

/**
 * Fill an Ionic input whose *bound state* the test then depends on.
 *
 * `fill()` sets the inner `<input>` and dispatches a single DOM `input`
 * event, which the Ionic component has to re-emit as `ionInput` for Vue to
 * see it. On WebKit that one event is sometimes lost, and the field then
 * shows the text while the bound ref stays empty — which on the tag search
 * means neither a match chip nor a create chip is rendered, since both are
 * derived from the query. It surfaces 30 s later as "element not found",
 * with a screen that looks perfectly filled in.
 *
 * Waiting for Ionic's own `hydrated` class was not enough (one run in
 * fourteen still lost it), so this types instead: real key events give the
 * component one `input` per character, and losing all of them is not a race
 * that exists. The cost is a few milliseconds per character.
 */
async function fillIonic(field: ReturnType<typeof visible>, value: string) {
  await expect(field).toHaveClass(/hydrated/)
  const input = field.locator('input')
  await input.click()
  await input.fill('')
  await input.pressSequentially(value)
  await expect(input).toHaveValue(value)
}

/** Create through the app's own path: FAB → minimal form → commit. */
async function createItem(
  page: Page,
  name: string,
  tags: string[] = [],
  extra?: { weight?: string },
) {
  await visible(page).getByTestId('m9-fab').click()
  await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()

  await fillIonic(visible(page).getByTestId('m10-name'), name)

  for (const tag of tags) {
    await fillIonic(visible(page).getByTestId('m10-tag-search'), tag)

    // Filter-or-create: an existing tag is offered, an unmatched name is
    // created. Which of the two is on screen has to be *settled* before we
    // branch — a one-shot isVisible() runs before Vue has re-rendered the
    // chips and then picks the wrong arm, which surfaces 30 s later as a
    // missing chip rather than as a race.
    const offer = visible(page).getByTestId(`m10-tag-offer-${tag}`)
    const create = visible(page).getByTestId('m10-tag-create')
    await expect(offer.or(create).first()).toBeVisible()

    if ((await offer.count()) > 0) await offer.click()
    else await create.click()

    await expect(visible(page).getByTestId(`m10-tag-assigned-${tag}`)).toBeVisible()
  }

  if (extra?.weight) {
    await visible(page).getByTestId('m10-more').click()
    await fillIonic(visible(page).getByTestId('m10-weight'), extra.weight)
  }

  await commitNewItem(page, name)
}

/**
 * Commit the creation form and wait for the *edit* page to be painted.
 *
 * A helper rather than two lines inline, because leaving this wait out is
 * invisible until it bites: committing does a `router.replace`, and going
 * back immediately overlaps two outlet transitions — after which
 * `ion-router-outlet` intercepts pointer events and the next tap simply
 * never lands. That surfaces as an unclickable FAB 30 s later, nothing
 * resembling a navigation error. The FR-25.15 indicator exists only once
 * the item does, so it is a positive signal that the replaced page — and
 * not the form it replaced — is the one now on screen.
 */
async function commitNewItem(page: Page, name: string) {
  await visible(page).getByTestId('m10-create').click()
  // Creating ends where editing continues — the saved item, by name.
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visible(page).getByTestId('save-indicator')).toBeVisible()
}

/**
 * Back to the list via the ADR-011 header chevron rather than page.goBack():
 * history-back across the root→tabs outlet boundary trips the known
 * pre-existing Ionic transition defect (see navigation.spec.ts).
 */
async function backToInventory(page: Page) {
  await page.getByTestId('header-back').click()
  await expect(visible(page).getByTestId('m9-fab')).toBeVisible()
  // Settled, not merely arriving: while the outgoing editor still fades it
  // counts as visible, and a one-shot read would see both pages at once.
  await expect(visible(page).getByTestId('m10-tag-search')).toHaveCount(0)
}

/**
 * The group headings, normalised. Lower-cased on purpose: the heading wears
 * the `.jp-eyebrow` role, which uppercases in CSS, so the rendered casing is
 * a styling decision and not the data these cases are about.
 */
async function groupHeadings(scope: ReturnType<typeof visible>): Promise<string[]> {
  const heads = await scope.getByTestId('m9-group-head').allInnerTexts()
  return heads.map((h) => h.split('\n')[0]!.trim().toLowerCase())
}

test.describe('M9 inventory — lean list on the tag set (FR-24.2/24.4)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/items')
  })

  test('E2E-M9-01: an item on two tags renders once, under its primary tag', async ({ page }) => {
    await createItem(page, 'Badehose', ['Kleidung', 'Sommer'])
    await backToInventory(page)

    const list = visible(page)
    // The row exists exactly once across the whole list — the guarantee
    // FR-24.2 buys, and the one a naive "file under every tag" would break.
    await expect(list.getByTestId('m9-row').filter({ hasText: 'Badehose' })).toHaveCount(1)

    // ...and it sits under the first tag it was given, not the second.
    expect(await groupHeadings(list)).toContain('kleidung')
    expect(await groupHeadings(list)).not.toContain('sommer')
  })

  test('E2E-M9-06: the tag axis filters on any tag, not only the primary one', async ({ page }) => {
    await createItem(page, 'Badehose', ['Kleidung', 'Sommer'])
    await backToInventory(page)
    await createItem(page, 'Kabel', ['Technik'])
    await backToInventory(page)

    const list = visible(page)
    await expect(list.getByTestId('m9-row')).toHaveCount(2)

    // Sommer is the swimsuit's *second* tag; filtering by it must still
    // surface the row — that reach is the point of the tag set.
    await list.getByTestId('m9-tag-chip-Sommer').click()
    await expect(list.getByTestId('m9-row')).toHaveCount(1)
    await expect(list.getByTestId('m9-row')).toContainText('Badehose')
  })

  test('E2E-M9-05: the list is lean until the properties sheet says otherwise', async ({
    page,
  }) => {
    await createItem(page, 'Wanderschuhe', ['Schuhe'], { weight: '900' })
    await backToInventory(page)

    const row = visible(page).getByTestId('m9-row').first()
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
    const shown = visible(page).getByTestId('m9-row').first()
    await expect(shown).toContainText('900 g')
    // *Exactly* those: enabling one property must not paint the other two,
    // which is the whole reason FR-24.4 is three switches and not one.
    await expect(shown).not.toContainText('Schuhe')
    await expect(eye.locator('ion-badge')).toHaveText('1')
  })

  test('E2E-M9-08: the first group heading clears the tag axis instead of touching it', async ({
    page,
  }) => {
    await createItem(page, 'Badehose', ['Kleidung'])
    await backToInventory(page)

    const list = visible(page)
    const axis = list.getByTestId('m9-tag-axis')
    await expect(axis).toBeVisible()
    const head = list.getByTestId('m9-group-head').first()
    await expect(head).toBeVisible()

    // Geometry, not pixels: at a 0px gap the segment's active underline sits
    // flush against the heading and reads as the heading sliding under the
    // axis (UX-4). Both elements are settled — the boxes are layout facts.
    const axisBox = (await axis.boundingBox())!
    const headBox = (await head.boundingBox())!
    expect(headBox.y).toBeGreaterThanOrEqual(axisBox.y + axisBox.height + 8)
  })

  /**
   * E2E-M9-10 (FR-1.1): the "searchable" half of M9-01's sentence, which
   * until now nothing typed into. G-12's own case asserts that the
   * magnifier opens *this* screen's field; that the field then filters the
   * list is a different promise and belongs here.
   */
  test('E2E-M9-10: the search filters the list and says so when nothing matches', async ({
    page,
  }) => {
    await createItem(page, 'Badehose', ['Kleidung'])
    await backToInventory(page)
    await createItem(page, 'Kabel', ['Technik'])
    await backToInventory(page)

    const list = visible(page)
    await expect(list.getByTestId('m9-row')).toHaveCount(2)

    await page.getByTestId('search').click()
    // A plain <input>, not an ion-input, so fill() is enough — the shared
    // search row owns the element itself (the fillIonic note above is about
    // Ionic's re-emitted event, which does not apply here).
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
test.describe('M9 inventory — the empty state (G-7)', () => {
  test('E2E-M9-04: an empty inventory offers the spreadsheet import', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/items')

    const list = visible(page)
    await expect(list.getByTestId('m9-empty')).toBeVisible()
    // G-7 is an offer, not a shrug: the tag axis and the no-match state are
    // both absent, so what is on screen is the empty state and not a list
    // that happens to have painted nothing.
    await expect(list.getByTestId('m9-tag-axis')).toHaveCount(0)
    await expect(list.getByTestId('m9-no-match')).toHaveCount(0)

    await list.getByTestId('m9-import').click()
    await expect(visible(page).getByTestId('import-paste')).toBeVisible()

    // NFR-4.7: the way back is the way in reversed, and it lands on the
    // inventory rather than on M15's other parent, the trip list.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m9-empty')).toBeVisible()
  })
})

test.describe('M10 item editor — minimal creation (FR-24.5)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/items')
  })

  test('E2E-M10-07: creating hides the sections an item cannot have yet', async ({ page }) => {
    await visible(page).getByTestId('m9-fab').click()

    const form = visible(page)
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
    // The delete card is the third of them, and the only one of the three
    // FR-24.5 names that this screen has ever built: „Enthalten in"
    // (FR-27.8) and „Kommentare aus Reisen" (FR-27.9) exist in neither
    // mode, so their absence here asserts nothing (audit 2026-08-30).
    await expect(form.getByTestId('m10-section-delete')).toHaveCount(0)
    await expect(form.getByTestId('m10-weight')).toHaveCount(0)

    await form.getByTestId('m10-more').click()
    await expect(form.getByTestId('m10-weight')).toBeVisible()
  })

  test('E2E-M10-07: a missing name is answered with a hint, not a dead button', async ({
    page,
  }) => {
    await visible(page).getByTestId('m9-fab').click()
    await visible(page).getByTestId('m10-create').click()

    // The button is live and says why nothing happened — the user should
    // not have to diagnose a disabled control (FR-24.5).
    await expect(visible(page).getByTestId('m10-name-error')).toBeVisible()
    await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
  })

  test('E2E-M10-10: a duplicate name is reported before it reaches the push', async ({ page }) => {
    await createItem(page, 'Sackmesser')
    await backToInventory(page)

    await visible(page).getByTestId('m9-fab').click()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Sackmesser')
    await visible(page).getByTestId('m10-create').click()

    // FR-24.1 dropped the category from the item's UNIQUE, so the name is
    // the identity — and the clash is answered here, not by a rejection.
    await expect(visible(page).getByTestId('m10-name-error')).toContainText('Sackmesser')
    await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
  })

  test('E2E-M10-08: an unmatched tag name is created and assigned in one step', async ({
    page,
  }) => {
    await visible(page).getByTestId('m9-fab').click()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Zelt')

    await fillIonic(visible(page).getByTestId('m10-tag-search'), 'Camping')
    // Nothing matches, so the offer is to create it.
    await expect(visible(page).getByTestId('m10-tag-create')).toBeVisible()
    await visible(page).getByTestId('m10-tag-create').click()

    const assigned = visible(page).getByTestId('m10-tag-assigned-Camping')
    await expect(assigned).toBeVisible()
    // The summary names it as primary — what M9 will file the item under.
    await expect(visible(page).getByTestId('m10-tag-summary')).toContainText('Camping')

    // Assigned tags stay pinned above the matches: the filter may narrow
    // what is *offered* and must never hide what the item already carries.
    // The ＋ chip is the positive signal that the query is live — without
    // it, "the chip is still there" is equally satisfied by a search field
    // that filters nothing at all.
    await fillIonic(visible(page).getByTestId('m10-tag-search'), 'Winter')
    await expect(visible(page).getByTestId('m10-tag-create')).toBeVisible()
    await expect(assigned).toBeVisible()

    // The second item finds it as an existing tag rather than making a
    // duplicate: the same field, now filtering instead of creating.
    await commitNewItem(page, 'Zelt')
    await backToInventory(page)
    await visible(page).getByTestId('m9-fab').click()
    await fillIonic(visible(page).getByTestId('m10-name'), 'Schlafsack')
    await fillIonic(visible(page).getByTestId('m10-tag-search'), 'Camping')
    await expect(visible(page).getByTestId('m10-tag-offer-Camping')).toBeVisible()
    await expect(visible(page).getByTestId('m10-tag-create')).toHaveCount(0)
  })

  test('E2E-M10-08: unassigning a tag refiles the item in the inventory', async ({ page }) => {
    await createItem(page, 'Badehose', ['Kleidung'])

    // The editor is open on the saved item; drop its only tag.
    await visible(page).getByTestId('m10-tag-assigned-Kleidung').click()
    await expect(visible(page).getByTestId('m10-tag-assigned-Kleidung')).toHaveCount(0)

    await backToInventory(page)
    expect(await groupHeadings(visible(page))).toEqual(['untagged'])
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
    await page.goto('/tabs/items')
  })

  test('E2E-M10-13: the sections an existing item owns follow the app language', async ({
    page,
  }) => {
    await createItem(page, 'Fernglas')

    // The positive counterpart to E2E-M10-07's absence assertions: present,
    // and worded by the catalogue rather than by the template.
    const form = visible(page)
    await expect(form.getByTestId('m10-section-photo')).toHaveText('Foto')
    await expect(form.getByTestId('m10-section-depends')).toHaveText('Hängt ab von')
    await expect(form.getByTestId('m10-add-dependency')).toContainText('Abhängigkeit hinzufügen')

    // The dependency picker is behind a tap, and carried three literals of
    // its own — the search, the empty answer, and the way out.
    await form.getByTestId('m10-add-dependency').click()
    await expect(visible(page).getByPlaceholder('Artikel durchsuchen…')).toBeVisible()
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
    await page.goto('/tabs/items')
  })

  /** Open an item from the inventory list, settled on its editor. */
  async function openItem(page: Page, name: string) {
    await visible(page).getByTestId('m9-row').filter({ hasText: name }).click()
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
    await visible(page).getByTestId('m10-add-dependency').click()
    await visible(page).getByTestId('m10-dependency-main-Kamera').click()
    await expect(visible(page).getByTestId('m10-dependency-mode-Kamera')).toContainText('Required')

    await backToInventory(page)
    await openItem(page, 'Kamera')

    // The reverse list: the items that need this one. It only reads — the
    // relation is owned by the item that declared it, so this row offers
    // neither the mode select nor the removal the other side has (FR-20.4).
    const companion = visible(page).getByTestId('m10-companion-Ersatzakku')
    await expect(companion).toContainText('Required')
    await expect(companion.locator('ion-select')).toHaveCount(0)
    await expect(companion.locator('ion-button')).toHaveCount(0)

    // The circle: the Kamera cannot in turn depend on the Ersatzakku.
    await visible(page).getByTestId('m10-add-dependency').click()
    await visible(page).getByTestId('m10-dependency-main-Ersatzakku').click()
    // Readable, and it names the hops rather than saying "invalid": the
    // path is the only part of the refusal the user can act on.
    await expect(visible(page).getByTestId('m10-dependency-error')).toContainText(
      'Kamera → Ersatzakku → Kamera',
    )

    // Refused at save time, not reported after the write: the relation is
    // absent afterwards. The companion row above is the positive signal
    // that assertion is made against — this screen does render the pair,
    // so "no dependency row" cannot be produced by it rendering nothing.
    await visible(page).getByTestId('m10-dependency-cancel').click()
    await expect(visible(page).getByTestId('m10-dependency-mode-Ersatzakku')).toHaveCount(0)
    await expect(visible(page).getByTestId('m10-companion-Ersatzakku')).toBeVisible()
  })

  test('E2E-M10-04: a photo is added, replaced, and removed on the item', async ({ page }) => {
    await createItem(page, 'Fernglas')

    const form = visible(page)
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
    await expect(visible(page).getByTestId('m10-photo-preview')).toHaveJSProperty(
      'naturalWidth',
      16,
    )

    await visible(page).getByTestId('m10-photo-remove').click()
    await expect(visible(page).getByTestId('m10-photo-empty')).toBeVisible()
    await expect(visible(page).getByTestId('m10-photo-preview')).toHaveCount(0)
    await expect(visible(page).getByTestId('m10-photo-add')).toContainText('Add photo')
    await expect(visible(page).getByTestId('m10-photo-remove')).toHaveCount(0)
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
    await page.goto('/tabs/items')
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
    await createItem(page, 'Träger', tags)
    await backToInventory(page)

    // A fresh form: all ten are unassigned, the query is empty.
    await visible(page).getByTestId('m9-fab').click()
    await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()

    const offers = visible(page).locator('[data-testid^="m10-tag-offer-"]')
    await expect(offers).toHaveCount(8)
    await expect(visible(page).getByTestId('m10-tag-offer-Werkzeug')).toHaveCount(0)
    // The tail names what the shelf holds back, so the cap is visible state
    // rather than a silently shorter vocabulary.
    await expect(visible(page).getByTestId('m10-tag-more')).toContainText('2')

    // The search reaches past the cap…
    await fillIonic(visible(page).getByTestId('m10-tag-search'), 'Werkzeug')
    await expect(visible(page).getByTestId('m10-tag-offer-Werkzeug')).toBeVisible()

    // …and clearing it returns to the shelf. Cleared by keys, not fill(''):
    // deleting through the keyboard dispatches an input event per keystroke,
    // the same reason fillIonic types (see its comment).
    const searchInput = visible(page).getByTestId('m10-tag-search').locator('input')
    await searchInput.click()
    await searchInput.press('ControlOrMeta+a')
    await searchInput.press('Backspace')
    await expect(searchInput).toHaveValue('')
    await expect(offers).toHaveCount(8)

    // The tail hands over to the search: after the tap, typing starts there.
    await visible(page).getByTestId('m10-tag-more').click()
    await expect(visible(page).getByTestId('m10-tag-search').locator('input')).toBeFocused()

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
