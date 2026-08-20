import { test, expect, openQuickAdd, expectTripOpen } from './fixtures'
import {
  addPosition,
  backToTemplateList as backToList,
  createTemplate,
  includeGroup,
  visiblePage as visible,
} from './fixtures'

/**
 * M8 — Template Editor, scope-shaped (§3.27, FR-27.6/27.7).
 *
 * Covers E2E-M8-07 (scope shapes, picker offers groups only, inline group
 * creation), E2E-M8-10 (guarded scope switch, both directions), E2E-M8-13/04/12
 * (the shared quick-add: scope-labelled confirm, duplicate report, free-text
 * master-item creation, Standard defaults), E2E-M8-01/02/03/14 (the M5-pattern
 * position sheet: stepper with 0, assignment, dedup, condition chips behind
 * "Details ▾"), E2E-M8-11's editor half (task list with the blocking rule),
 * E2E-M8-05/08 (blast-radius note, resolution footer with named merges). What
 * a group edit then *does* to a trip moved to `group-refresh.spec.ts` when it
 * became a question the trip is asked rather than a write (FR-27.4).
 *
 * Local Mode throughout: every rule here is client-side (invariant 4), and the
 * run mode without a server is the one where a missing client rule shows up.
 */

test.describe('M8 template editor — scope shape and quick-add (FR-27.6/25.13)', () => {
  // Same budget note as the composition describe below.
  test.slow()

  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')
  })

  test('E2E-M8-07/13/12: a Gruppe shows only positions, and the quick-add lands a Standard row', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')

    // Scope shape: no groups section, positions headed "Positions".
    await expect(visible(page).getByTestId('m8-groups-head')).toHaveCount(0)
    await expect(visible(page).getByTestId('m8-positions-head')).toContainText('Positions')

    // FR-25.13a: the FAB expands *and focuses* the quick-add.
    await openQuickAdd(page, 'm8-fab')
    const input = visible(page).getByTestId('quick-add-input').locator('input')
    await expect(input).toBeFocused()

    // The confirm is labelled for the scope (E2E-M8-13).
    await expect(visible(page).getByTestId('quick-add-confirm')).toContainText('Add to group')

    // FR-25.7: one commit lands a collapsed row with the defaults.
    await input.fill('Kamera')
    await input.press('Enter')
    const row = visible(page).locator('ion-item').filter({ hasText: 'Kamera' }).first()
    await expect(row).toContainText('Standard')
    await expect(row).toContainText('1×')

    // The field stays open and empty for the next position (FR-25.13).
    await expect(input).toHaveValue('')
    await expect(input).toBeVisible()
  })

  test('E2E-M8-17: the ＋ steps aside while the quick-add is open (FR-25.13a)', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')

    await expect(visible(page).getByTestId('m8-fab')).toBeVisible()
    await openQuickAdd(page, 'm8-fab')
    await expect(visible(page).getByTestId('quick-add-input')).toBeVisible()

    // Nothing left for it to do, and the composer needs the room.
    await expect(visible(page).getByTestId('m8-fab')).toHaveCount(0)

    // The anchor survives, and that is the point: toasts on this screen are
    // positioned against the fab *container*. Hiding the whole IonFab would
    // have dropped the anchor and let toasts fall behind the tab bar — the
    // M7/M8 defect from 2026-08-15, nearly rebuilt while fixing this one.
    await expect(visible(page).locator('#m8-fab-anchor')).toHaveCount(1)

    // And it comes back once the composer closes.
    await visible(page).getByTestId('quick-add-close').click()
    await expect(visible(page).getByTestId('m8-fab')).toBeVisible()
  })

  test('E2E-M8-13/04: a duplicate is reported and not added twice; free text created the master item', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')

    const input = visible(page).getByTestId('quick-add-input').locator('input')
    await input.fill('Kamera')
    await input.press('Enter')
    // Positive signal for the "nothing happened" claim: the report itself.
    await expect(page.locator('ion-toast').last()).toContainText('not added twice')
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Kamera' })).toHaveCount(1)

    // FR-1.1: the free-text add created the master item — the inventory has it.
    await backToList(page)
    await page.goto('/tabs/items')
    await expect(
      visible(page).locator('ion-item').filter({ hasText: 'Kamera' }).first(),
    ).toBeVisible()
  })

  test('E2E-M8-07: the picker offers groups only, hides included ones, and creates one inline', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)
    await createTemplate(page, 'template', 'Fotoreise')
    await backToList(page)
    await createTemplate(page, 'template', 'Fototage')

    // Groups only: the other Ferien-Vorlage is not on offer.
    await visible(page).getByTestId('m8-include-open').click()
    const picker = visible(page).getByTestId('m8-group-picker')
    await expect(picker.locator('.pick').filter({ hasText: 'Makro' })).toBeVisible()
    await expect(picker.locator('.pick').filter({ hasText: 'Fotoreise' })).toHaveCount(0)

    // Including removes it from the next offer.
    await picker.locator('.pick').filter({ hasText: 'Makro' }).click()
    await expect(
      visible(page).locator('[data-testid^="m8-group-"]').filter({ hasText: 'Makro' }),
    ).toBeVisible()
    await visible(page).getByTestId('m8-include-open').click()
    await expect(
      visible(page).getByTestId('m8-group-picker').locator('.pick').filter({ hasText: 'Makro' }),
    ).toHaveCount(0)

    // "Neue Gruppe anlegen…": created and included in one step (FR-27.6).
    await visible(page).getByTestId('m8-new-group').click()
    await visible(page).getByTestId('m8-new-group-name').locator('input').fill('Wildlife')
    await visible(page).getByTestId('m8-new-group-name').locator('input').press('Enter')
    await expect(
      visible(page).locator('[data-testid^="m8-group-"]').filter({ hasText: 'Wildlife' }),
    ).toBeVisible()
    // And it exists as a real group on M7 — where the composed row now shows
    // the include-dependent half of E2E-M7-07 that waited for this write:
    // the "N groups ·" prefix and the "contains: …" line.
    await backToList(page)
    const composedRow = visible(page).locator('ion-item').filter({ hasText: 'Fototage' }).first()
    await expect(composedRow).toContainText('2 groups')
    await expect(composedRow).toContainText('contains:')
    await expect(composedRow).toContainText('Makro')
    await expect(composedRow).toContainText('Wildlife')
    await visible(page).getByTestId('m7-scope-group').click()
    await expect(
      visible(page).locator('ion-item').filter({ hasText: 'Wildlife' }).first(),
    ).toBeVisible()
  })

  test('E2E-M8-10: the scope switch is guarded in both directions and free otherwise', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await backToList(page)
    await createTemplate(page, 'template', 'Fototage')
    await visible(page).getByTestId('m8-include-open').click()
    await visible(page)
      .getByTestId('m8-group-picker')
      .locator('.pick')
      .filter({ hasText: 'Makro' })
      .click()

    // Demotion refused while groups are included — and nothing switched.
    await visible(page).getByTestId('m8-scope-group').click()
    await expect(page.locator('ion-toast').last()).toContainText('Remove the included groups')
    await expect(visible(page).getByTestId('m8-scope-template')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // The included group refuses promotion and names its consumer.
    await backToList(page)
    await visible(page).getByTestId('m7-scope-group').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Makro' }).first().click()
    await expect(visible(page).getByTestId('m8-included-in')).toContainText('Fototage')
    await visible(page).getByTestId('m8-scope-template').click()
    await expect(page.locator('ion-toast').last()).toContainText('Fototage')
    await expect(visible(page).getByTestId('m8-scope-group')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Unconstrained, the switch is free — and reshapes the editor.
    await backToList(page)
    await visible(page).getByTestId('m7-scope-all').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Fototage' }).first().click()
    await visible(page).locator('[data-testid^="m8-group-remove-"]').click()
    await visible(page).getByTestId('m8-scope-group').click()
    await expect(visible(page).getByTestId('m8-scope-group')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(visible(page).getByTestId('m8-groups-head')).toHaveCount(0)
  })
})

test.describe('M8 position sheet — the M5 pattern (FR-25.7, FR-27.7)', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await visible(page).locator('ion-item').filter({ hasText: 'Kamera' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
  })

  test('E2E-M8-01/12/14: Menge and Vorbereitung come first; the stepper allows 0', async ({
    page,
  }) => {
    // Before the fold: quantity and preparation, nothing else (FR-25.7).
    await expect(page.getByTestId('m8-qty')).toHaveText('1')
    await expect(page.getByTestId('m8-task-input')).toBeVisible()
    await expect(page.getByTestId('m8-details-body')).toHaveCount(0)

    // No formula input anywhere — FR-1.3/1.5 are retired (E2E-M8-01).
    await expect(page.getByTestId('m8-position-sheet').locator('input[type="text"]')).toHaveCount(1) // the task composer only

    await page.getByTestId('m8-qty-dec').click()
    await expect(page.getByTestId('m8-qty')).toHaveText('0')
    // 0 is a statement, and the sheet says which (FR-5.5).
    await expect(page.getByTestId('m8-position-sheet')).toContainText('deliberately not packed')
    await page.getByTestId('m8-qty-dec').click()
    await expect(page.getByTestId('m8-qty')).toHaveText('0')
    await page.getByTestId('m8-qty-inc').click()
    await expect(page.getByTestId('m8-qty')).toHaveText('1')
  })

  test('E2E-M8-02/03/12/14: the advanced parameters live behind Details and reach the glance row', async ({
    page,
  }) => {
    await page.getByTestId('m8-details').click()
    await expect(page.getByTestId('m8-details-body')).toBeVisible()

    // FR-1.4 assignment, FR-2.3 dedup, FR-15.2 condition — each commits.
    await page.getByTestId('m8-assign-person').click()
    await page.getByTestId('m8-dedup-sum').click()
    await page.getByTestId('m8-cond-summer').click()

    // The glance row now carries all three (FR-25.14 idiom).
    const glance = page.getByTestId('m8-position-sheet').locator('.glance')
    await expect(glance).toContainText('Per person')
    await expect(glance).toContainText('Summer')

    // FR-25.15: the sheet's indicator has settled back to ✓ — the transient
    // ● is unit-tested (SaveIndicator), racing it here would be a timing bet.
    const indicator = page.getByTestId('m8-position-sheet').getByTestId('save-indicator')
    await expect(indicator).toHaveAttribute('title', 'Saved')

    // The fold collapses again, and the row below reflects the edits.
    await page.getByTestId('m8-details').click()
    await expect(page.getByTestId('m8-details-body')).toHaveCount(0)
    await page.getByTestId('m8-position-close').click()
    await expect(page.getByTestId('m8-position-sheet')).not.toBeVisible()
    const row = visible(page).locator('ion-item').filter({ hasText: 'Kamera' }).first()
    await expect(row).toContainText('Per person')
    await expect(row).toContainText('Summer')
  })

  test('E2E-M8-11: tasks add per Enter, remove per row, and count on the collapsed chip', async ({
    page,
  }) => {
    await expect(page.getByTestId('m8-position-sheet')).toContainText('Open tasks block')

    const composer = page.getByTestId('m8-task-input').locator('input')
    await composer.fill('Akkus laden')
    await composer.press('Enter')
    await expect(page.getByTestId('m8-task-row')).toContainText('Akkus laden')
    await composer.fill('Speicherkarte leeren')
    await composer.press('Enter')
    await expect(page.getByTestId('m8-task-row')).toHaveCount(2)

    await page.getByTestId('m8-position-close').click()
    const row = visible(page).locator('ion-item').filter({ hasText: 'Kamera' }).first()
    await expect(row).toContainText('📋 2')

    // Removing brings the chip down — and the remove is the positive signal
    // that the first add was real state, not a rendering artefact.
    await row.click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page
      .getByTestId('m8-task-row')
      .filter({ hasText: 'Akkus laden' })
      .locator('button')
      .click()
    await expect(page.getByTestId('m8-task-row')).toHaveCount(1)
  })
})

test.describe('M8 composition — resolution footer and blast radius (FR-27.2/27.4)', () => {
  // Every case here builds two groups, their positions and a Vorlage through
  // M7/M8, because spec §2.4 forbids injecting them. That is the most UI work
  // of any unit in the suite and it sits near WebKit's 30 s default; the M3
  // composition unit hit the same wall on 2026-08-16, and the failures land at
  // whatever step the clock runs out on — which reads as four unrelated bugs.
  test.slow()

  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')
  })

  test('E2E-M8-08: the footer names every merge with its contributing groups', async ({ page }) => {
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await addPosition(page, 'Ringlicht')
    await backToList(page)
    await createTemplate(page, 'group', 'Wildlife')
    await addPosition(page, 'Kamera')
    await addPosition(page, 'Stativ')
    await backToList(page)

    await createTemplate(page, 'template', 'Fototage')
    await includeGroup(page, 'Makro')
    await includeGroup(page, 'Wildlife')
    await addPosition(page, 'Reiseapotheke')

    const footer = visible(page).getByTestId('m8-resolution')
    // 4 unique items over 2 groups + 1 own position — the deduped count.
    await expect(footer).toContainText('4 items resolved')
    await expect(footer).toContainText('2 groups + 1 own position')
    const merge = visible(page).getByTestId('m8-merge-line')
    await expect(merge).toHaveCount(1)
    await expect(merge).toContainText('Kamera only 1×')
    await expect(merge).toContainText('Makro & Wildlife')
  })

  test('E2E-M8-16: the footer opens the list of what the Vorlage resolves to', async ({ page }) => {
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await addPosition(page, 'Ringlicht')
    await backToList(page)
    await createTemplate(page, 'group', 'Wildlife')
    await addPosition(page, 'Kamera')
    await backToList(page)

    await createTemplate(page, 'template', 'Fototage')
    await includeGroup(page, 'Makro')
    await includeGroup(page, 'Wildlife')
    await addPosition(page, 'Reiseapotheke')

    // FR-27.14: the count is the door. Before this it was the whole answer.
    const footer = visible(page).getByTestId('m8-resolution')
    await expect(footer).toContainText('3 items resolved')
    await footer.click()

    const sheet = page.getByTestId('group-peek-sheet')
    await expect(sheet.getByTestId('group-peek-name')).toHaveText('Fototage')
    await expect(sheet.getByTestId('group-peek-item')).toHaveText([
      'Kamera',
      'Reiseapotheke',
      'Ringlicht',
    ])

    // The shared camera is marked as merged and names both groups; the own
    // position says so rather than repeating the Vorlage's name.
    const camera = sheet.getByTestId('group-peek-line').filter({ hasText: 'Kamera' })
    await expect(camera).toContainText('Makro & Wildlife')
    await expect(
      sheet.getByTestId('group-peek-line').filter({ hasText: 'Reiseapotheke' }),
    ).toContainText('own position')

    // A look, not an editor — and the editor is still behind it.
    await expect(sheet.locator('button')).toHaveCount(1)
    await sheet.getByTestId('group-peek-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(visible(page).getByTestId('m8-resolution')).toBeVisible()
  })

  test('E2E-M8-05: a template a trip still follows shows the blast-radius note', async ({
    page,
  }) => {
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)
    await createTemplate(page, 'template', 'Fototage')
    await includeGroup(page, 'Makro')
    // An own position beside the group: the blast radius has to be found
    // through both provenance paths, the Vorlage's own rows and the group's.
    await addPosition(page, 'Reiseapotheke')
    await backToList(page)

    // No trip yet — no note. The positive counterpart follows.
    await visible(page).getByTestId('m7-scope-all').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Fototage' }).first().click()
    await expect(visible(page).getByTestId('m8-blast-note')).toHaveCount(0)

    // Generate a trip from the Vorlage through M3 (spec §2.4: the app's own path).
    await page.goto('/trips/new')
    await page.getByTestId('wizard-name').locator('input').fill('Engadin 2027')
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-3')).toBeVisible()
    await page.locator('ion-item').filter({ hasText: 'Fototage' }).locator('ion-checkbox').click()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-4')).toBeVisible()
    await page.getByTestId('wizard-create').click()
    await expectTripOpen(page, 'Engadin 2027')

    // The Vorlage names the trip it reaches (FR-27.4)…
    await page.goto('/tabs/templates')
    await visible(page).locator('ion-item').filter({ hasText: 'Fototage' }).first().click()
    const note = visible(page).getByTestId('m8-blast-note')
    await expect(note).toContainText('Engadin 2027')
    // …and says what will actually happen there. The note used to promise an
    // immediate change and a freeze on departure; both were retired
    // 2026-08-18, and a warning that outlives its rule is worse than none.
    await expect(note).toContainText('proposed')

    // …and so does the group, reached through the include.
    await backToList(page)
    await visible(page).getByTestId('m7-scope-group').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Makro' }).first().click()
    await expect(visible(page).getByTestId('m8-blast-note')).toContainText('Engadin 2027')
  })
})
