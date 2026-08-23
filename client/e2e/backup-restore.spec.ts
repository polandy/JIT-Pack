import {
  test,
  expect,
  seed,
  createTemplate,
  addPosition,
  createTripViaWizard,
  expectTripOpen,
} from './fixtures'
import {
  addToGroup,
  backToTemplateList as backToList,
  createTripFollowingGroup,
  includeGroup,
  openQuickAdd,
  visiblePage as visible,
} from './fixtures'
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'

/**
 * Backup and restore — the Local Mode round trip (NFR-4.11, FR-19.6, ADR-015).
 *
 * E2E-G2-03 already proves the *write* half: the G-2 detail downloads a file
 * with the right name that contains the trip. What nothing covered was the
 * half that makes it a backup at all — reading it back. `commitPortableRestore`
 * has unit cases, and M18's restore branch had none: a file that downloads and
 * cannot be restored is not a backup, and in Local Mode it is the only copy
 * there is.
 *
 * The restore runs in a **second browser context**, which is a device that has
 * never seen this data. Restoring onto the device that wrote the file would
 * pass against an importer that did nothing at all, because everything asserted
 * would already be on screen.
 */

const TRIP = { name: 'Samedan 2026', travelers: ['Andy', 'Mia'] }

/** Open a trip the way a user does — through M2, in-SPA. */
async function openTripFromList(page: Page, name: string) {
  await page.goto('/tabs/trips?status=planned')
  await visible(page).getByTestId(`trip-row-${name}`).click()
  await expectTripOpen(page, name)
}

test.describe('Local Mode backup and restore @local @m18', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-M18-05 (NFR-4.11/FR-19.6/FR-18.4, ADR-015): the whole round trip. It
  // builds both partitions through the app's own paths (spec §2.4) because a
  // backup of one document never reaches the restore branch — that branch is
  // what a *device* file looks like, and a device has templates and trips.
  test('E2E-M18-05: a backup taken on one device restores onto an empty one', async ({
    page,
    browser,
  }) => {
    // Two templates' worth of UI work plus a trip: the same budget note as the
    // M8 composition unit, and for the same reason (see the e2e ledger).
    test.slow()

    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)

    await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await page.getByTestId('quick-add-close').click()

    // Packed, because progress travelling with the file is a promise of the
    // backup shape (`includeProgress`) and a restore that silently unpacked
    // everything would be worse than none.
    await page.getByTestId('m4-row-Zelt').getByTestId('row-check').locator('ion-checkbox').click()
    await expect(page.getByTestId('m4-row-Zelt')).toHaveCount(0)

    // The G-2 detail is the only way to a backup — the same door the user has.
    await page.getByTestId('sync-indicator').click()
    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await sheet.getByTestId('sync-detail-backup').click()
    const backup = await readFile(await (await downloadPromise).path(), 'utf8')

    // --- a second device, which has never seen any of this ---------------
    const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin })
    const restored = await fresh.newPage()
    await seed(restored, { mode: 'local' })
    await restored.goto('/tabs/trips')
    // Positive proof that it *is* empty, so the assertions below cannot be
    // satisfied by data that was already there.
    await expect(restored.getByTestId(`trip-row-${TRIP.name}`)).toHaveCount(0)

    await restored.getByTestId('m2-portable-import').click()
    await restored.getByTestId('portable-paste').locator('textarea').fill(backup)
    await restored.getByTestId('portable-preview').click()

    // A multi-document file is a restore, not the single-document merge
    // preview: the list names every document rather than asking fifty
    // per-item questions.
    await expect(restored.getByTestId('portable-restore')).toBeVisible()
    const rows = restored.getByTestId('portable-restore-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'Makro' })).toContainText('Template')
    await expect(rows.filter({ hasText: TRIP.name })).toContainText('Trip')

    await restored.getByTestId('portable-restore-commit').click()

    // The restore lands on the segment its own result is on. Every imported
    // trip is *planning* (FR-18.4) and M2 opens on Active, so before the fix a
    // successful restore ended on the words "No active trips" — asserted here
    // without tapping the segment, which is the whole difference.
    // Ionic marks the chosen segment with a class; its `aria-selected` sits in
    // the shadow root and reads empty from here.
    await expect(visible(restored).getByTestId('trips-filter-planned')).toHaveClass(
      /segment-button-checked/,
    )

    // Both partitions came back, and the trip kept what it knew. The row, not
    // its name as text: the pasted YAML is still in the textarea behind an
    // unfinished restore, so a bare text match reads the *input* and passes on
    // a screen that never navigated — which is exactly how the missing
    // `/tabs/trips` redirect stayed invisible.
    await expect(visible(restored).getByTestId(`trip-row-${TRIP.name}`)).toBeVisible()
    await visible(restored).getByTestId(`trip-row-${TRIP.name}`).click()
    await expectTripOpen(restored, TRIP.name)
    await expect(visible(restored).getByTestId('m4-row-Zelt')).toHaveCount(0)
    await visible(restored).getByTestId('m4-done-bar').click()
    await expect(visible(restored).getByTestId('m4-row-Zelt')).toBeVisible()

    // The rail rather than the tab bar: the behaviour projects run at desktop
    // width, where G-9 puts the four anchors on the left — and the trip screen
    // hides the bottom bar entirely.
    await restored.getByTestId('rail-templates').click()
    await expect(visible(restored).getByRole('heading', { name: 'Makro' })).toBeVisible()

    await fresh.close()
  })

  /*
   * E2E-M18-09 (ADR-024): a backup gives back the *status* it saved.
   *
   * Every imported trip used to be `planning` (FR-18.4), which is right for a
   * file somebody shared and wrong for the only copy of a device: a restore
   * turned a finished trip back into a plan, and with it the historical
   * quantities FR-3.14 reads. Asserted through the segment the restore lands
   * on as well as through the row, because the two used to be the same
   * constant and are now derived — landing on an empty Planned list is the
   * failure mode this replaces, one status over.
   *
   * The marks and tags half of ADR-024 is unit-covered end to end
   * (`portableImport.spec.ts`, buildBackup → commitPortableRestore on a fresh
   * store); this case buys the status, which is the half a user sees.
   */
  test('E2E-M18-09: an archived trip restores archived, not as a plan', async ({
    page,
    browser,
  }) => {
    test.slow()

    // A template as well as the trip: a single-document file is the merge
    // preview, not the restore branch, and a *device* backup always has both
    // (the same reason E2E-M18-05 builds two partitions).
    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)

    await createTripViaWizard(page, TRIP)
    // Planning → active → archived, the only path the app offers (E2E-M4-43).
    await page.getByTestId('m4-start').click()
    await expect(page.getByTestId('m4-archive')).toBeVisible()
    await page.getByTestId('m4-archive').click()
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()

    await page.getByTestId('sync-indicator').click()
    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await sheet.getByTestId('sync-detail-backup').click()
    const backup = await readFile(await (await downloadPromise).path(), 'utf8')

    // --- a device that has never seen this trip -------------------------
    const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin })
    const restored = await fresh.newPage()
    await seed(restored, { mode: 'local' })
    await restored.goto('/tabs/trips')
    await expect(restored.getByTestId(`trip-row-${TRIP.name}`)).toHaveCount(0)

    await restored.getByTestId('m2-portable-import').click()
    await restored.getByTestId('portable-paste').locator('textarea').fill(backup)
    await restored.getByTestId('portable-preview').click()
    await restored.getByTestId('portable-restore-commit').click()

    // The restore put the user where its own result is, which for a device of
    // finished trips is Archived and not the old constant.
    await expect(visible(restored).getByTestId('trips-filter-archived')).toHaveClass(
      /segment-button-checked/,
    )
    await expect(visible(restored).getByTestId(`trip-row-${TRIP.name}`)).toBeVisible()

    // The positive companion: it is on Archived *because it is archived*, not
    // because the segment was picked for it. Planned is where it used to land.
    await visible(restored).getByTestId('trips-filter-planned').click()
    await expect(visible(restored).getByTestId(`trip-row-${TRIP.name}`)).toHaveCount(0)

    await fresh.close()
  })

  // E2E-M18-07 (FR-27.1/27.7, ADR-017): the composition is part of the only
  // copy. A Vorlage that came back as a bare name would look restored and
  // generate an empty trip — the failure would surface a wizard run later, on
  // a device that no longer has the file.
  test('E2E-M18-07: a composed Vorlage restores with its group, not as a name', async ({
    page,
    browser,
  }) => {
    test.slow()

    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)
    await createTemplate(page, 'template', 'Fototage')
    await includeGroup(page, 'Makro')
    await backToList(page)

    await page.getByTestId('sync-indicator').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('sync-detail-sheet').getByTestId('sync-detail-backup').click()
    const backup = await readFile(await (await downloadPromise).path(), 'utf8')

    // --- a second device, which has never seen the group ------------------
    const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin })
    const restored = await fresh.newPage()
    await seed(restored, { mode: 'local' })
    await restored.goto('/tabs/templates')
    await expect(visible(restored).getByRole('heading', { name: 'Makro' })).toHaveCount(0)

    await restored.goto('/tabs/trips')
    await restored.getByTestId('m2-portable-import').click()
    await restored.getByTestId('portable-paste').locator('textarea').fill(backup)
    await restored.getByTestId('portable-preview').click()
    await restored.getByTestId('portable-restore-commit').click()

    await restored.getByTestId('rail-templates').click()
    // Exactly one Makro: the backup carries the group twice — nested in the
    // Vorlage and as its own document — and a restore that took both at face
    // value would leave a second one here, suffixed and included by nothing.
    // Counted on the row *title*, the same locator the absence check above
    // used: a bare row match also catches the Vorlage's "enthält: Makro"
    // line, which is the composition working rather than a duplicate.
    await expect(visible(restored).getByRole('heading', { name: 'Makro' })).toHaveCount(1)
    await visible(restored).locator('ion-item').filter({ hasText: 'Fototage' }).first().click()
    await expect(restored.getByTestId('header-title')).toHaveText('Fototage')

    // The Vorlage is still composed: the group is under it, and the FR-27.2
    // footer resolves through it rather than counting the Vorlage's own
    // (nonexistent) positions.
    await expect(visible(restored).getByTestId('m8-groups-head')).toBeVisible()
    await expect(visible(restored).locator('ion-item').filter({ hasText: 'Makro' })).toHaveCount(1)
    await expect(visible(restored).getByTestId('m8-resolution')).toContainText('1')

    await fresh.close()
  })

  // E2E-M18-06 (ADR-015): partial damage is survivable. The file is written by
  // hand here rather than downloaded: producing a *corrupt* backup through the
  // app is not something the app can be asked to do, and the shape is the one
  // `buildBackup` writes (`---`-separated portable documents).
  test('E2E-M18-06: an unreadable document is reported in its place and the rest still import', async ({
    page,
  }) => {
    const damaged = [
      'kind: template',
      'schema_version: 1',
      'name: Makro',
      'items:',
      '  - name: Kamera',
      '    quantity: 1',
      '    assignment: trip_global',
      '---',
      'kind: nonsense',
      'name: Halb geschrieben',
      '---',
      'kind: trip',
      'schema_version: 1',
      'name: Samedan 2026',
      'year: 2026',
      'travelers: []',
      'containers: []',
      'items:',
      '  - name: Zelt',
      '    quantity: 1',
      '    mode: pack',
      '',
    ].join('\n')

    await page.goto('/portable-import')
    await page.getByTestId('portable-paste').locator('textarea').fill(damaged)
    await page.getByTestId('portable-preview').click()

    const rows = page.getByTestId('portable-restore-row')
    await expect(rows).toHaveCount(3)
    // The damaged one keeps its place in the list and says why, rather than
    // vanishing: a document silently missing from a restore is data loss the
    // user is never told about.
    await expect(rows.nth(1)).toContainText('Unreadable document')
    await expect(rows.nth(1)).toContainText('skipped')

    await page.getByTestId('portable-restore-commit').click()

    // No segment tap here either — the restore arrives where its trips are.
    await expect(visible(page).getByTestId('trip-row-Samedan 2026')).toBeVisible()
    await page.getByTestId('rail-templates').click()
    await expect(visible(page).getByRole('heading', { name: 'Makro' })).toBeVisible()
  })

  // E2E-M18-08 (FR-27.4, NFR-4.11, ADR-015): the backup carries *how* a trip
  // follows its groups, not only what is on it. Before this, a restored device
  // kept the trips and started following afresh — every proposal the user had
  // already answered came back on the new device, and a position they had
  // refused reappeared as a fresh offer.
  test('E2E-M18-08: a restored trip keeps the answers it already gave its group', async ({
    page,
    browser,
  }) => {
    // M7/M8 twice, M3, M4 and a two-context restore: declared rather than raced.
    test.slow()

    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)
    await createTripFollowingGroup(page, 'Fototour 2026', 'Makro')

    // One answered "yes" — this becomes the FR-27.4 applied-changes log …
    await addToGroup(page, 'Makro', 'Stativ')
    await openTripFromList(page, 'Fototour 2026')
    await expect(visible(page).getByTestId('m4-group-proposal')).toContainText('Stativ')
    await visible(page).getByTestId('m4-group-proposal-apply').click()
    await expect(visible(page).getByTestId('m4-row-Stativ')).toBeVisible()

    // … and one answered "no", which lives only in the ledger: the row is not
    // there and nothing else records that it was refused.
    await addToGroup(page, 'Makro', 'Blitz')
    await openTripFromList(page, 'Fototour 2026')
    await expect(visible(page).getByTestId('m4-group-proposal')).toContainText('Blitz')
    await visible(page).getByTestId('m4-group-proposal-decline').click()
    await expect(visible(page).getByTestId('m4-group-proposal')).toHaveCount(0)

    await page.getByTestId('sync-indicator').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('sync-detail-sheet').getByTestId('sync-detail-backup').click()
    const backup = await readFile(await (await downloadPromise).path(), 'utf8')

    // --- a second device, which has never seen any of this -----------------
    const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin })
    const restored = await fresh.newPage()
    await seed(restored, { mode: 'local' })
    await restored.goto('/tabs/trips')
    await expect(restored.getByTestId('trip-row-Fototour 2026')).toHaveCount(0)

    await restored.getByTestId('m2-portable-import').click()
    await restored.getByTestId('portable-paste').locator('textarea').fill(backup)
    await restored.getByTestId('portable-preview').click()
    // The restore list says the trip follows a group — the only place that is
    // visible before the trip is opened, and the rendered proof that the
    // section reached the file at all.
    await expect(
      restored.getByTestId('portable-restore-row').filter({ hasText: 'Fototour 2026' }),
    ).toContainText('follows 1 group')
    await restored.getByTestId('portable-restore-commit').click()

    // M2 keeps the record of what the trip took over, with the date it
    // happened rather than the date of the restore.
    await expect(visible(restored).getByTestId('m2-applied-chip-Fototour 2026')).toContainText('1')
    await expect(visible(restored).getByTestId('m2-applied-log-Fototour 2026')).toContainText(
      'Stativ',
    )
    // Nothing is being proposed: the refused Blitz is not offered again.
    await expect(visible(restored).getByTestId('m2-proposed-chip-Fototour 2026')).toHaveCount(0)

    await visible(restored).getByTestId('trip-row-Fototour 2026').click()
    await expectTripOpen(restored, 'Fototour 2026')
    await expect(visible(restored).getByTestId('m4-group-proposal')).toHaveCount(0)
    await expect(visible(restored).getByTestId('m4-row-Kamera')).toBeVisible()
    await expect(visible(restored).getByTestId('m4-row-Stativ')).toBeVisible()
    await expect(visible(restored).getByTestId('m4-row-Blitz')).toHaveCount(0)

    // The positive signal behind all three "not offered" assertions: the
    // machinery is alive on this device and does follow the restored group —
    // a new position is proposed, and only the new one. Without the restored
    // sources nothing would be proposed at all; without the restored ledger
    // Blitz would be proposed alongside it.
    await addToGroup(restored, 'Makro', 'Filter')
    await openTripFromList(restored, 'Fototour 2026')
    const proposal = visible(restored).getByTestId('m4-group-proposal')
    await expect(proposal).toContainText('Filter')
    await expect(proposal).not.toContainText('Blitz')

    await fresh.close()
  })
})
