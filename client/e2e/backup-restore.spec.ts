import { test, expect, seed, createTemplate, addPosition, createTripViaWizard } from './fixtures'
import {
  backToTemplateList as backToList,
  includeGroup,
  openQuickAdd,
  visiblePage as visible,
} from './fixtures'
import { readFile } from 'node:fs/promises'

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
    await expect(restored.getByTestId('header-title')).toHaveText(TRIP.name)
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
})
