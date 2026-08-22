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

  test('E2E-M9-02: the tag axis filters on any tag, not only the primary one', async ({ page }) => {
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

  test('E2E-M9-03: the list is lean until the properties sheet says otherwise', async ({
    page,
  }) => {
    await createItem(page, 'Wanderschuhe', ['Schuhe'], { weight: '900' })
    await backToInventory(page)

    const row = visible(page).getByTestId('m9-row').first()
    // Lean by default: the weight exists on the item but not on the row.
    await expect(row).not.toContainText('900 g')

    await page.getByTestId('m9-properties').click()
    await expect(page.getByTestId('m9-properties-sheet')).toBeVisible()
    await page.getByTestId('m9-property-weight').click()
    await page.keyboard.press('Escape')

    // The painted row changed — not merely the stored preference.
    await expect(visible(page).getByTestId('m9-row').first()).toContainText('900 g')
  })
})

test.describe('M10 item editor — minimal creation (FR-24.5)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/items')
  })

  test('E2E-M10-01: creating hides the sections an item cannot have yet', async ({ page }) => {
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
    await expect(form.getByTestId('m10-weight')).toHaveCount(0)

    await form.getByTestId('m10-more').click()
    await expect(form.getByTestId('m10-weight')).toBeVisible()
  })

  test('E2E-M10-02: a missing name is answered with a hint, not a dead button', async ({
    page,
  }) => {
    await visible(page).getByTestId('m9-fab').click()
    await visible(page).getByTestId('m10-create').click()

    // The button is live and says why nothing happened — the user should
    // not have to diagnose a disabled control (FR-24.5).
    await expect(visible(page).getByTestId('m10-name-error')).toBeVisible()
    await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
  })

  test('E2E-M10-03: a duplicate name is reported before it reaches the push', async ({ page }) => {
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

  test('E2E-M10-04: an unmatched tag name is created and assigned in one step', async ({
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

  test('E2E-M10-05: unassigning a tag refiles the item in the inventory', async ({ page }) => {
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

    // The positive counterpart to E2E-M10-01's absence assertions: present,
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
