import type { Page } from '@playwright/test'

import { test, expect, openQuickAdd, expectTripOpen } from './fixtures'
import {
  addPosition,
  backToTemplateList as backToList,
  createTemplate,
  includeGroup,
  visiblePage as visible,
} from './fixtures'

/** Types instead of fill(): WebKit loses fill()'s one input event on Ionic
 * fields — the full account is on inventory.spec.ts's fillIonic. */
async function fillIonic(field: ReturnType<typeof visible>, value: string) {
  await expect(field).toHaveClass(/hydrated/)
  const input = field.locator('input')
  await input.click()
  await input.fill('')
  await input.pressSequentially(value)
  await expect(input).toHaveValue(value)
}

/**
 * A tagged master item through M10's own path (E2E-M8-21 needs primary
 * tags, which the plain name-only creation cannot give). Starts and ends
 * on the M9 list; the waits mirror inventory.spec.ts's createItem —
 * settled offer-or-create branch, painted editor, chevron back.
 */
async function createTaggedItem(page: Page, name: string, tag: string) {
  await visible(page).getByTestId('m9-fab').click()
  await expect(visible(page).getByTestId('m10-new-hint')).toBeVisible()
  await fillIonic(visible(page).getByTestId('m10-name'), name)

  await fillIonic(visible(page).getByTestId('m10-tag-search'), tag)
  const offer = visible(page).getByTestId(`m10-tag-offer-${tag}`)
  const create = visible(page).getByTestId('m10-tag-create')
  await expect(offer.or(create).first()).toBeVisible()
  if ((await offer.count()) > 0) await offer.click()
  else await create.click()
  await expect(visible(page).getByTestId(`m10-tag-assigned-${tag}`)).toBeVisible()

  await visible(page).getByTestId('m10-create').click()
  await expect(page.getByTestId('header-title')).toHaveText(name)
  await page.getByTestId('header-back').click()
  await expect(visible(page).getByTestId('m9-fab')).toBeVisible()
  // Settled, not merely arriving (the backToInventory account).
  await expect(visible(page).getByTestId('m10-tag-search')).toHaveCount(0)
}

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

    // FR-25.13c: the FAB expands the quick-add but no longer focuses it —
    // the empty composer leads with chips, and an auto-raised keyboard
    // would cover them. Asserted after the confirm has rendered, so the
    // old open()'s awaited focus would have landed by now and the unfixed
    // build fails here rather than racing past.
    await openQuickAdd(page, 'm8-fab')
    const input = visible(page).getByTestId('quick-add-input').locator('input')

    // The confirm is labelled for the scope (E2E-M8-13).
    await expect(visible(page).getByTestId('quick-add-confirm')).toContainText('Add to group')
    await expect(input).not.toBeFocused()

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

  test('E2E-M8-21: the empty composer offers chips, never the already chosen, and a chip lands a row (FR-25.13c)', async ({
    page,
  }) => {
    // Tagged inventory through M10's own path: two Hygiene items, one Technik.
    await page.goto('/tabs/items')
    await createTaggedItem(page, 'Zahnbürste', 'Hygiene')
    await createTaggedItem(page, 'Shampoo', 'Hygiene')
    await createTaggedItem(page, 'Ladekabel', 'Technik')

    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Bad')
    await openQuickAdd(page, 'm8-fab')

    // Nothing chosen, nothing used on this device yet: no chips to offer.
    await expect(visible(page).getByTestId('quick-add-confirm')).toBeVisible()
    await expect(visible(page).getByTestId('quick-add-chips')).toHaveCount(0)

    // First position via the typed autocomplete — this also feeds the trail.
    const input = visible(page).getByTestId('quick-add-input').locator('input')
    await input.fill('Zahn')
    await visible(page)
      .getByTestId('quick-add-suggestion')
      .filter({ hasText: 'Zahnbürste' })
      .click()
    await expect(
      visible(page).locator('ion-item').filter({ hasText: 'Zahnbürste' }).first(),
    ).toBeVisible()

    // The emptied composer now offers the related row: the other Hygiene
    // item, headed by the tag — and the chosen Zahnbürste is not offered
    // again in it (the positive signal for that absence is Shampoo,
    // rendered in the very same row).
    const chipArea = visible(page).getByTestId('quick-add-chips')
    await expect(chipArea).toContainText('Goes with Hygiene')
    const related = visible(page).getByTestId('quick-add-chip-related')
    await expect(related.filter({ hasText: 'Shampoo' })).toBeVisible()
    await expect(related.filter({ hasText: 'Zahnbürste' })).toHaveCount(0)
    // Technik shares no tag with the group's contents.
    await expect(related.filter({ hasText: 'Ladekabel' })).toHaveCount(0)

    // One tap on the chip lands a Standard row (FR-25.7 defaults).
    await related.filter({ hasText: 'Shampoo' }).click()
    const row = visible(page).locator('ion-item').filter({ hasText: 'Shampoo' }).first()
    await expect(row).toContainText('Standard')
    // Both Hygiene items are chosen now, so the composer has nothing left
    // to offer — the rows above are the positive signal.
    await expect(visible(page).getByTestId('quick-add-chips')).toHaveCount(0)

    // The trail crosses scopes: a fresh group offers the two items just
    // used, recency first, under the recent heading.
    await backToList(page)
    await createTemplate(page, 'group', 'Kulturbeutel')
    await openQuickAdd(page, 'm8-fab')
    await expect(visible(page).getByTestId('quick-add-chips')).toContainText('Recently used')
    const recent = visible(page).getByTestId('quick-add-chip-recent')
    await expect(recent.first()).toHaveText('Shampoo')
    await expect(recent.filter({ hasText: 'Zahnbürste' })).toBeVisible()

    // And a recent chip adds just the same.
    await recent.filter({ hasText: 'Zahnbürste' }).click()
    await expect(
      visible(page).locator('ion-item').filter({ hasText: 'Zahnbürste' }).first(),
    ).toBeVisible()
  })

  test('E2E-M8-22: the browse-sheet assembles a group in a run, carried items turning into a state (FR-25.13d)', async ({
    page,
  }) => {
    await page.goto('/tabs/items')
    await createTaggedItem(page, 'Zahnbürste', 'Hygiene')
    await createTaggedItem(page, 'Shampoo', 'Hygiene')
    await createTaggedItem(page, 'Ladekabel', 'Technik')

    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Bad')
    await openQuickAdd(page, 'm8-fab')

    // The door sits in the empty composer, beside the chips' offers.
    await visible(page).getByTestId('quick-add-browse-open').click()
    const sheet = page.getByTestId('inventory-browse-sheet')
    await expect(sheet).toBeVisible()

    // The M9 tag axis narrows on any tag; the un-matching item is gone and
    // the two Hygiene rows are the positive signal for that absence.
    await sheet.getByTestId('browse-tag-Hygiene').click()
    await expect(sheet.getByTestId('browse-row')).toHaveCount(2)
    await expect(sheet.getByTestId('browse-row').filter({ hasText: 'Ladekabel' })).toHaveCount(0)

    // A run: two taps, no keyboard, and each tapped row flips to the
    // "already in" state right in place — the sheet never closes between.
    await sheet.getByTestId('browse-row').filter({ hasText: 'Zahnbürste' }).click()
    await expect(
      sheet.getByTestId('browse-row-carried').filter({ hasText: 'Zahnbürste' }),
    ).toContainText('already in')
    await sheet.getByTestId('browse-row').filter({ hasText: 'Shampoo' }).click()
    await expect(sheet.getByTestId('browse-row-carried')).toHaveCount(2)

    // Free text is an explicit footer line that hands back to the
    // composer's field — the sheet itself never raises a keyboard.
    await expect(sheet.locator('input')).toHaveCount(0)
    await sheet.getByTestId('browse-free-text').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
    await expect(visible(page).getByTestId('quick-add-input').locator('input')).toBeFocused()

    // The run landed as positions with the FR-25.7 defaults.
    const rows = visible(page).locator('ion-item')
    await expect(rows.filter({ hasText: 'Zahnbürste' }).first()).toContainText('Standard')
    await expect(rows.filter({ hasText: 'Shampoo' }).first()).toBeVisible()
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

/**
 * E2E-M8-15 — the group picker's search (FR-27.13).
 *
 * One walk, because the world it needs — seven groups and a Vorlage — is
 * expensive to build through M7/M8 and every clause below shares it: the
 * field's six-group gate, the item-name hit with its stated reason, the
 * FR-27.12 summary on the result rows, the already-included report, and the
 * no-match path ending in prefilled creation.
 */
test.describe('M8 group picker search (FR-27.13)', () => {
  // The world is built through the UI (§2.4); on WebKit under suite load that
  // sits near the budget — the account is on the composition describe above.
  test.slow()

  test('E2E-M8-15: search gate, item hits with reason, included report, no-match creation', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await page.goto('/tabs/templates')

    // Two groups with content, four empty ones — six searchable candidates.
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)
    await createTemplate(page, 'group', 'Wildlife')
    await addPosition(page, 'Kamera')
    await addPosition(page, 'Stativ')
    await backToList(page)
    for (const name of ['Strand', 'Camping', 'Erste Hilfe', 'Winter']) {
      await createTemplate(page, 'group', name)
      await backToList(page)
    }

    await createTemplate(page, 'template', 'Fototage')
    await includeGroup(page, 'Makro')

    // At six searchable groups the field stays away — scanning chips wins.
    // Positive signal beside the absence: the chips are rendered.
    await visible(page).getByTestId('m8-include-open').click()
    const picker = visible(page).getByTestId('m8-group-picker')
    await expect(picker.locator('.pick').filter({ hasText: 'Wildlife' })).toBeVisible()
    await expect(picker.getByTestId('m8-picker-search')).toHaveCount(0)
    await picker.locator('.picker-close').click()

    // The seventh group is the mutation that makes the field appear.
    await backToList(page)
    await createTemplate(page, 'group', 'Sieben')
    await backToList(page)
    await visible(page).locator('ion-item').filter({ hasText: 'Fototage' }).first().click()
    await expect(page.getByTestId('header-title')).toHaveText('Fototage')
    await visible(page).getByTestId('m8-include-open').click()
    const search = visible(page).getByTestId('m8-picker-search')
    await expect(search).toBeVisible()
    // Deliberately not auto-focused: this picker exists to be tapped.
    await expect(search.locator('input')).not.toBeFocused()

    // An item name finds the groups that carry it; each row states the
    // reason ("via Kamera") and the FR-27.12 summary.
    await fillIonic(search, 'Kamera')
    const wildlifeHit = visible(page).locator('button.result').filter({ hasText: 'Wildlife' })
    await expect(wildlifeHit).toBeVisible()
    await expect(wildlifeHit).toContainText('via Kamera')
    await expect(wildlifeHit.locator('.preview')).toContainText('Kamera · Stativ')

    // The included Makro is reported, not silently absent.
    const includedHit = visible(page).locator('.result.included').filter({ hasText: 'Makro' })
    await expect(includedHit).toBeVisible()
    await expect(includedHit).toContainText('Already included')
    await expect(includedHit).toContainText('via Kamera')

    // A result row includes like a chip does.
    await wildlifeHit.click()
    await expect(
      visible(page)
        .locator('ion-item')
        .filter({ hasText: 'Wildlife' })
        .filter({ hasText: 'Kamera · Stativ' }),
    ).toBeVisible()

    // No match ends in creation with the typed name (the M7 rule: no row
    // without a name), prefilled from the query.
    await visible(page).getByTestId('m8-include-open').click()
    await fillIonic(visible(page).getByTestId('m8-picker-search'), 'Schnorchel')
    await expect(visible(page).getByTestId('m8-search-empty')).toBeVisible()
    await visible(page).getByTestId('m8-new-group').click()
    await expect(visible(page).getByTestId('m8-new-group-name').locator('input')).toHaveValue(
      'Schnorchel',
    )
    await visible(page).getByTestId('m8-new-group-commit').click()
    await expect(
      visible(page).locator('ion-item h2').filter({ hasText: 'Schnorchel' }),
    ).toBeVisible()
  })
})

/**
 * E2E-M8-23 — recognising a Gruppe among the loose positions (FR-27.15).
 *
 * Two walks over the same shape. The first is the offer and the fold: what the
 * row says before the tap, the two guards that keep it rare, the FR-27.12 peek,
 * the swap and the undo. The second is the dismissal, which needs a reload and
 * a changed group and would otherwise stretch the first past its budget.
 */
test.describe('M8 group recognition (FR-27.15)', () => {
  // The world is built through the UI (§2.4) — the account is on E2E-M8-15.
  test.slow()

  /** Erste Hilfe (two items) + Solo (one), then a Vorlage carrying all three. */
  async function seedWorld(page: Page) {
    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Erste Hilfe')
    await addPosition(page, 'Reiseapotheke')
    await addPosition(page, 'Blasenpflaster')
    await backToList(page)
    await createTemplate(page, 'group', 'Solo')
    await addPosition(page, 'Zelt')
    await backToList(page)

    await createTemplate(page, 'template', 'Fototage')
    await addPosition(page, 'Reiseapotheke')
    await addPosition(page, 'Blasenpflaster')
    await addPosition(page, 'Zelt')
  }

  /** Reopen the Vorlage from M7 — what a reload or a detour comes back to. */
  async function reopenVorlage(page: Page) {
    await visible(page).locator('ion-item').filter({ hasText: 'Fototage' }).first().click()
    await expect(page.getByTestId('header-title')).toHaveText('Fototage')
  }

  test('E2E-M8-23: the offer states its cost, the guards hold, and the fold is undoable', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await seedWorld(page)

    // A deviating quantity does not block the match — it is stated (FR-27.15).
    // The prep task rides along so the undo has an FR-27.7 child to lose.
    await visible(page).locator('ion-item').filter({ hasText: 'Reiseapotheke' }).first().click()
    await expect(page.getByTestId('m8-position-sheet')).toBeVisible()
    await page.getByTestId('m8-qty-inc').click()
    await expect(page.getByTestId('m8-qty')).toHaveText('2')
    const task = page.getByTestId('m8-task-input').locator('input')
    await task.fill('Ablaufdaten prüfen')
    await task.press('Enter')
    await expect(page.getByTestId('m8-task-row')).toContainText('Ablaufdaten prüfen')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('m8-position-sheet')).toHaveCount(0)
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    const hint = visible(page).locator('.fold-hint')
    await expect(hint).toContainText('2 positions match the group “Erste Hilfe”')
    await expect(hint).toContainText('1 position defines something differently')
    // The one-item group never claims the list that mentions its item — with
    // the Erste Hilfe row beside it as the proof the detector ran at all.
    await expect(visible(page).locator('.fold-hint').filter({ hasText: 'Solo' })).toHaveCount(0)

    // FR-27.12: what the group would bring is one tap away, before the tap.
    await hint.locator('.fold-peek').click()
    await expect(page.getByTestId('group-peek-sheet')).toContainText('Reiseapotheke')
    // Its own close, not Escape: the sheet's dismissal is part of the
    // interaction, and WebKit leaves the overlay swallowing taps otherwise.
    await page.getByTestId('group-peek-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)

    // An already-included group is never offered — its items are covered.
    await includeGroup(page, 'Erste Hilfe')
    await expect(visible(page).locator('.fold-hint')).toHaveCount(0)
    const resolved = await visible(page)
      .getByTestId('m8-resolution')
      .locator('.res-big')
      .innerText()
    await visible(page)
      .locator('ion-item')
      .filter({ hasText: 'Erste Hilfe' })
      .locator('.rm')
      .click()
    await expect(visible(page).locator('.fold-hint')).toHaveCount(1)

    // Zusammenfassen: the positions become the include, and the resolution is
    // the proof nothing was gained or lost.
    await visible(page).locator('.fold-accept').click()
    await expect(
      visible(page).locator('ion-item h2').filter({ hasText: 'Reiseapotheke' }),
    ).toHaveCount(0)
    await expect(
      visible(page).locator('ion-item h2').filter({ hasText: 'Erste Hilfe' }),
    ).toBeVisible()
    await expect(visible(page).getByTestId('m8-resolution').locator('.res-big')).toHaveText(
      resolved,
    )

    // Rückgängig restores exactly what went — both positions, the deviated
    // quantity and the FR-27.7 task, and the include goes again.
    await page.locator('ion-toast').getByRole('button', { name: 'Undo' }).click()
    await expect(
      visible(page).locator('ion-item h2').filter({ hasText: 'Erste Hilfe' }),
    ).toHaveCount(0)
    await expect(
      visible(page).locator('ion-item h2').filter({ hasText: 'Blasenpflaster' }),
    ).toBeVisible()
    await visible(page).locator('ion-item').filter({ hasText: 'Reiseapotheke' }).first().click()
    await expect(page.getByTestId('m8-qty')).toHaveText('2')
    await expect(page.getByTestId('m8-task-row')).toContainText('Ablaufdaten prüfen')
  })

  test('E2E-M8-23: Ignorieren survives a reload and lapses when the group changes', async ({
    seedMode,
    page,
  }) => {
    await seedMode({ mode: 'local' })
    await seedWorld(page)

    await expect(visible(page).locator('.fold-hint')).toHaveCount(1)
    await visible(page).locator('.fold-dismiss').click()
    // The positive signal beside the absence: the positions are untouched.
    await expect(visible(page).locator('.fold-hint')).toHaveCount(0)
    await expect(
      visible(page).locator('ion-item h2').filter({ hasText: 'Reiseapotheke' }),
    ).toBeVisible()

    // Device-local memory: a reload does not re-ask.
    await page.reload()
    await expect(page.getByTestId('header-title')).toHaveText('Fototage')
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Zelt' })).toBeVisible()
    await expect(visible(page).locator('.fold-hint')).toHaveCount(0)

    // A changed item set is a new question, so it is asked again.
    await page.getByTestId('header-back').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Erste Hilfe' }).first().click()
    await addPosition(page, 'Zelt')
    await backToList(page)
    await reopenVorlage(page)
    await expect(visible(page).locator('.fold-hint')).toContainText(
      '3 positions match the group “Erste Hilfe”',
    )
  })
})
