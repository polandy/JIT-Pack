import { test, expect } from './fixtures'
import {
  addPosition,
  backToTemplateList as backToList,
  createTemplate,
  includeGroup,
  visiblePage as visible,
} from './fixtures'

/**
 * M7 — Template List, scope-shaped (§3.27, FR-27.6).
 *
 * Covers E2E-M7-07 (segmentation, sections, chip, resolved count), E2E-M7-08
 * (the FAB's scope chooser with the name field in the same sheet) and
 * E2E-M7-04 (the row menu carrying export, driven through `contextmenu` —
 * the same handler the touch hold fires into; the 500 ms themselves are
 * unit-tested in useLongPress, because neither a real-time hold nor
 * page.clock is deterministic here — the faked clock keeps Ionic's overlay
 * from attaching, nondeterministically, on a warm app). The include-dependent half
 * of M7-07 — the "N Gruppen ·" prefix and the "enthält: …" line — needs a
 * template that includes a group, which only the M8 rebuild can create; the
 * resolution arithmetic behind it is covered in `domain/__tests__/templates`.
 *
 * Local Mode throughout: M7 is backend-free, and the run mode that has no
 * server is the one where a missing client-side rule shows up.
 */

test.describe('M7 template list — scopes (FR-27.6)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')
  })

  test('E2E-M7-08: the FAB asks which scope to create, and creates that scope', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    // The editor opens in the scope it was created as — not the default —
    // and shaped for it: a Gruppe has no groups section (FR-27.6).
    await expect(visible(page).getByTestId('m8-scope-group')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(visible(page).getByTestId('m8-groups-head')).toHaveCount(0)

    await backToList(page)
    await createTemplate(page, 'template', 'Fotoreise')
    await expect(visible(page).getByTestId('m8-scope-template')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(visible(page).getByTestId('m8-groups-head')).toBeVisible()
  })

  test('E2E-M7-07: Alle renders both scopes as sections, vacation templates first', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)
    await createTemplate(page, 'template', 'Fotoreise')
    await backToList(page)

    const list = visible(page)
    await expect(list.getByTestId('m7-section-template')).toBeVisible()
    await expect(list.getByTestId('m7-section-group')).toBeVisible()

    // Order is the point of the section split: a trip starts from a Vorlage,
    // groups are the building blocks. Asserted on the rendered sequence, not
    // on the two locators existing.
    const heads = await list.locator('.section-head').allInnerTexts()
    expect(heads.map((h) => h.split('\n')[0])).toEqual(['Vacation templates', 'Groups'])
  })

  test('E2E-M7-07: a group row carries the Gruppe chip and a Vorlage row does not', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)
    await createTemplate(page, 'template', 'Fotoreise')
    await backToList(page)

    const list = visible(page)
    await expect(list.locator('ion-item', { hasText: 'Makro' }).locator('.scope-chip')).toHaveText(
      'Group',
    )
    await expect(
      list.locator('ion-item', { hasText: 'Fotoreise' }).locator('.scope-chip'),
    ).toHaveCount(0)
  })

  test('E2E-M7-07: the scope tabs filter to one scope and drop the section heads', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)
    await createTemplate(page, 'template', 'Fotoreise')
    await backToList(page)

    const list = visible(page)
    await list.getByTestId('m7-scope-group').click()
    await expect(list.locator('ion-item', { hasText: 'Makro' })).toBeVisible()
    await expect(list.locator('ion-item', { hasText: 'Fotoreise' })).toHaveCount(0)
    // One scope needs no section label — the segment already said which.
    await expect(list.locator('.section-head')).toHaveCount(0)

    await list.getByTestId('m7-scope-template').click()
    await expect(list.locator('ion-item', { hasText: 'Fotoreise' })).toBeVisible()
    await expect(list.locator('ion-item', { hasText: 'Makro' })).toHaveCount(0)
  })

  test('E2E-M7-07: a composed row counts the resolved set, not its own positions', async ({
    page,
  }) => {
    // The clause of M7-07 that no case asserted (found 2026-08-30, backlog
    // item 6): M8-07 builds a composition and asserts the "N groups ·"
    // prefix and the "contains: …" line, but every group in it is empty, so
    // the raw count and the resolved count are both 0 there — the one
    // arithmetic this row exists to get right is the one that case cannot
    // see. A Vorlage with no positions of its own reading "0 items"
    // describes the row rather than the trip it would produce.
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)
    await createTemplate(page, 'template', 'Fototage')
    await includeGroup(page, 'Makro')
    await backToList(page)

    const list = visible(page)
    const composed = list.locator('ion-item').filter({ hasText: 'Fototage' }).first()
    await expect(composed).toContainText('1 group')
    await expect(composed).toContainText('1 item')
    // The group itself is the control: the same sentence, arrived at without
    // any resolution, so "1 item" on the row above is a fact about the
    // include rather than about the label being printed twice.
    await expect(list.locator('ion-item').filter({ hasText: 'Makro' }).first()).toContainText(
      '1 item',
    )
  })

  test('E2E-M7-08: the commit is disabled until a name exists — no unnamed row is ever written', async ({
    page,
  }) => {
    await page.getByTestId('m7-fab').click()
    // Two options, each with the one line that says what it is for — the
    // reason the chooser exists at all is that "Gruppe" alone does not
    // (FR-27.6). Asserted on both cards: a shared hint would satisfy either
    // one on its own.
    await expect(page.getByTestId('m7-kind-template')).toContainText('The starting point for a trip')
    await expect(page.getByTestId('m7-kind-group')).toContainText('A reusable block of items')

    await page.getByTestId('m7-kind-group').click()
    // The pick is stated where the eye is — on the card, not only in state.
    await expect(page.getByTestId('m7-kind-group')).toHaveClass(/picked/)
    // Not toBeDisabled(): an ion-button's disabled state lives on the custom
    // element as aria-disabled, which Playwright's matcher does not read —
    // the same false-green this suite already paid for once on toBeEnabled().
    const commit = page.getByTestId('m7-create-commit')
    await expect(commit).toHaveAttribute('aria-disabled', 'true')

    // The attribute flips with the name — proof the guard is the name, not
    // a permanently dead button.
    await page.getByTestId('m7-name-field').locator('input').fill('x')
    await expect(commit).not.toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('m7-name-field').locator('input').clear()
    await expect(commit).toHaveAttribute('aria-disabled', 'true')

    // Dismissing the half-finished sheet leaves the list untouched: the
    // whole point of name-in-sheet over create-then-rename (owner decision
    // 2026-08-15) is that no row exists before the commit.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('m7-kind-chooser')).toBeHidden()
    await expect(visible(page).getByTestId('m7-empty')).toBeVisible()
  })

  test('E2E-M7-09: the ＋ follows the scope segment (FR-27.6)', async ({ page }) => {
    // The scope segment only exists once something is in the list, so the case
    // starts by creating through the *unchanged* path — which is also the Alle
    // behaviour this change deliberately keeps.
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)

    // Now on Gruppen the scope has one possible answer, so the chooser is
    // skipped and the sheet opens on the only thing still missing.
    await visible(page).getByTestId('m7-scope-group').click()
    await page.getByTestId('m7-fab').click()
    await expect(page.getByTestId('m7-name-field')).toBeVisible()
    await expect(page.getByTestId('m7-kind-template')).toHaveCount(0)

    await page.getByTestId('m7-name-field').locator('input').fill('Wildlife')
    await page.getByTestId('m7-create-commit').click()

    // A Gruppe, and the editor proves it: a Gruppe has no Gruppen section.
    await expect(page.getByTestId('header-title')).toHaveText('Wildlife')
    await expect(visible(page).getByTestId('m8-include-open')).toHaveCount(0)

    await backToList(page)

    // On Alle both scopes are plausible, so the question is real and stays.
    await visible(page).getByTestId('m7-scope-all').click()
    await page.getByTestId('m7-fab').click()
    await expect(page.getByTestId('m7-kind-template')).toBeVisible()
    await expect(page.getByTestId('m7-kind-group')).toBeVisible()
  })

  test('E2E-M7-04: the row menu carries export, and opening it does not navigate', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)

    const row = visible(page).locator('ion-item', { hasText: 'Makro' })
    await expect(row).toBeVisible()
    // The inline button is gone — matched by its aria-label, because the row
    // itself renders as a button and would answer a bare role query. The
    // positive signal for the absence is the menu below carrying export.
    await expect(row.locator('[aria-label="Export template"]')).toHaveCount(0)

    // contextmenu is the same handler the touch long-press fires into —
    // the seam that keeps this case free of a real 500 ms hold.
    await row.dispatchEvent('contextmenu')
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Export template' })).toBeVisible()

    // While the menu lives, a row click must be inert. dispatchEvent, not
    // click(): the overlay intercepts real pointers, and the guard exists
    // precisely for the click that reaches the row anyway — a touch hold's
    // own release racing the overlay attach. The sheet staying up is the
    // positive signal that the click changed nothing.
    await row.dispatchEvent('click')
    await expect(sheet).toBeVisible()
    await expect(visible(page).getByTestId('m7-scope-segment')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await sheet.getByRole('button', { name: 'Export template' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Makro.yaml')

    // Dismissed, the guard lifts with it: the next plain tap opens the row.
    // First caught red against a one-shot swallow-next-click flag that went
    // stale when the release click never arrived — the guard is a state
    // with an end, not a counter.
    await expect(sheet).toBeHidden()
    await row.click()
    await expect(visible(page).getByTestId('m8-scope-switch')).toBeVisible()
  })

  test('E2E-M7-06 (partial): the empty state names both scopes and drops the segment', async ({
    page,
  }) => {
    const list = visible(page)
    await expect(list.getByTestId('m7-empty')).toContainText('No templates yet')
    // With nothing to filter, the segment would be a control over an empty set.
    await expect(list.getByTestId('m7-scope-segment')).toHaveCount(0)
  })

  test('E2E-M7-06: nothing matching is a different state from nothing at all', async ({ page }) => {
    // M7's States line has promised both sentences since the screen was
    // built; only the first had a case (backlog item 6, 2026-08-30). They
    // share one element, so what tells them apart is the words in it and the
    // segment beside it — a search narrowing to nothing still has something
    // to widen back to, and an empty instance does not.
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)

    await page.getByTestId('search').click()
    const list = visible(page)
    await list.getByTestId('templates-search-input').fill('makro')
    await expect(list.locator('ion-item').filter({ hasText: 'Makro' })).toHaveCount(1)
    await expect(list.getByTestId('m7-empty')).toHaveCount(0)

    await list.getByTestId('templates-search-input').fill('zzz')
    await expect(list.locator('ion-item')).toHaveCount(0)
    await expect(list.getByTestId('m7-empty')).toContainText('No template found')
    await expect(list.getByTestId('m7-scope-segment')).toBeVisible()
  })

  test('E2E-M7-05: the header icon opens the portable import and comes back to M7', async ({
    page,
  }) => {
    // What survives of M7-05 (backlog item 6, 2026-08-30): the FAB "+" menu
    // it names was never built, and import has been a header icon since. The
    // icon had never been tapped by anything — E2E-G9-12 asserts the same
    // return-to-origin rule for M18's *other* entrance, from M2, and the
    // whole reason that rule exists is that M18 declares Settings as its
    // parent, so an unasserted entrance is one that can silently land there.
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)

    await page.getByTestId('m7-portable-import').click()
    await expect(visible(page).getByTestId('portable-paste')).toBeVisible()

    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m7-fab')).toBeVisible()
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Makro' })).toHaveCount(1)
    // Not the declared parent: the settings screen's own control is absent.
    await expect(page.getByTestId('settings-language')).toHaveCount(0)
  })
})

/**
 * E2E-M7-10 — the name is the instance-wide key, so M7 says so while it is
 * being typed (FR-1.6).
 *
 * `templates.name` is UNIQUE across the whole instance *and* across both
 * scopes, so a Gruppe blocks a Ferien-Vorlage. Local Mode is the run mode
 * that has no constraint behind the client at all: whatever this case proves
 * here, nothing else would have caught.
 */
test.describe('M7 — a taken name never becomes a write (FR-1.6)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')
  })

  test('E2E-M7-10: a taken name is named with its scope, offers the row that holds it, and a free one still writes', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)

    // Same name, other scope, other capitals — one name to a person, and one
    // row to the database.
    await page.getByTestId('m7-fab').click()
    await page.getByTestId('m7-kind-template').click()
    await page.getByTestId('m7-name-field').locator('input').fill('makro')
    const taken = page.getByTestId('m7-name-taken')
    await expect(taken).toContainText('The group “Makro” already exists.')
    // aria-disabled, not :disabled — an ion-button renders the native
    // attribute on its shadow child and Playwright reads the host.
    await expect(page.getByTestId('m7-create-commit')).toHaveAttribute('aria-disabled', 'true')

    // The offer is the point: it hands over the row that holds the name.
    await page.getByTestId('m7-name-taken-open').click()
    await expect(page.getByTestId('header-title')).toHaveText('Makro')
    await backToList(page)

    // The positive signal beside the refusal: the same field, a free name,
    // and the write lands. Without it "nothing was created" is true of a
    // broken button too.
    await page.getByTestId('m7-fab').click()
    await page.getByTestId('m7-kind-template').click()
    await page.getByTestId('m7-name-field').locator('input').fill('Makro Fotoreise')
    await expect(page.getByTestId('m7-name-taken')).toHaveCount(0)
    await page.getByTestId('m7-create-commit').click()
    await expect(page.getByTestId('header-title')).toHaveText('Makro Fotoreise')

    await backToList(page)
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Makro' })).toHaveCount(2)
  })

  test('E2E-M7-10: renaming onto a taken name is refused and the alert keeps the edit', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)
    await createTemplate(page, 'template', 'Fotoreise')
    await backToList(page)

    const row = visible(page).locator('ion-item').filter({ hasText: 'Fotoreise' }).first()
    await row.click({ button: 'right' })
    await page.locator('ion-action-sheet').last().getByRole('button', { name: 'Rename' }).click()

    const alert = page.locator('ion-alert').last()
    await expect(alert).toBeVisible()
    await alert.locator('input').fill('Makro')
    await alert.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator('ion-toast').last()).toContainText(
      'The name “Makro” is already taken.',
    )
    // The alert stays open with the typed name, so the edit survives the
    // refusal — and the row is still called what it was.
    await expect(alert.locator('input')).toHaveValue('Makro')
    await alert.getByRole('button', { name: 'Cancel' }).click()
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Fotoreise' })).toHaveCount(1)

    // Positive signal: the same menu, a free name, and the rename lands.
    await row.click({ button: 'right' })
    await page.locator('ion-action-sheet').last().getByRole('button', { name: 'Rename' }).click()
    await alert.locator('input').fill('Fotoreise 2027')
    await alert.getByRole('button', { name: 'Save' }).click()
    await expect(
      visible(page).locator('ion-item').filter({ hasText: 'Fotoreise 2027' }),
    ).toHaveCount(1)
  })
})
