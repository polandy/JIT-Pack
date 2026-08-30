import {
  test,
  expect,
  seed,
  createTemplate,
  addPosition,
  createTripViaWizard,
  expectTripOpen,
  tripAction,
  expectTripActionOffered,
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
    await tripAction(page, 'start')
    await expectTripActionOffered(page, 'archive')
    await tripAction(page, 'archive')
    // FR-9.3: the archive action opens the closing pass; *Fertig* archives.
    await page.getByTestId('m4-pass-finish').click()
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

  /*
   * E2E-M18-10 (FR-18.4, ADR-030): the same file, restored twice.
   *
   * The invitation is real — a restore is what you run when you are not sure
   * whether the last one worked — and before ADR-030 the second run built a
   * second copy of every trip, silently and with the first still on screen.
   * A trip's identity is its year and its name, so the second run adds nothing
   * and says which trips it left alone.
   *
   * The positive signal is `toHaveCount(1)`: a case that only asserted "no
   * second row" would pass just as well against a restore that deleted the
   * first one.
   */
  test('E2E-M18-10: restoring the same backup twice leaves one trip, not two', async ({
    page,
    browser,
  }) => {
    test.slow()

    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await backToList(page)
    // A Ferien-Vorlage as well as a group: the two used to be handled
    // differently here, the group linking and the Vorlage landing beside
    // itself under a suffix.
    await createTemplate(page, 'template', 'Fototage')
    await addPosition(page, 'Stativ')
    await backToList(page)
    await createTripViaWizard(page, TRIP)

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

    const restoreOnce = async () => {
      await restored.goto('/tabs/trips')
      await restored.getByTestId('m2-portable-import').click()
      await restored.getByTestId('portable-paste').locator('textarea').fill(backup)
      await restored.getByTestId('portable-preview').click()
      await expect(restored.getByTestId('portable-restore')).toBeVisible()
    }

    await restoreOnce()
    // Nothing is here yet, so the preview says nothing is here yet.
    await expect(restored.getByTestId('portable-already-here')).toHaveCount(0)
    await restored.getByTestId('portable-restore-commit').click()
    await expect(visible(restored).getByTestId(`trip-row-${TRIP.name}`)).toHaveCount(1)

    // --- the same file again, on the device that just took it -----------
    await restoreOnce()
    // Every document of the file is already here now — the trip, the group and
    // the Vorlage — so the list says so on each of them, not only on the trip.
    const rows = restored.getByTestId('portable-restore-row')
    await expect(
      rows.filter({ hasText: TRIP.name }).getByTestId('portable-already-here'),
    ).toBeVisible()
    await expect(
      rows.filter({ hasText: 'Fototage' }).getByTestId('portable-already-here'),
    ).toBeVisible()
    await expect(restored.getByTestId('portable-already-here')).toHaveCount(await rows.count())

    await restored.getByTestId('portable-restore-commit').click()
    // `seed()` pins the app language to English, so the catalogue text is
    // known rather than guessed at with an alternation.
    await expect(restored.locator('ion-toast')).toContainText('already here')

    // One trip, still there — not two, and not none.
    await expect(visible(restored).getByTestId(`trip-row-${TRIP.name}`)).toHaveCount(1)

    // One group and one Ferien-Vorlage, both linked by name rather than copied
    // (ADR-017 for the group, ADR-030 for the Vorlage, which used to arrive a
    // second time as "Fototage (import)").
    await restored.getByTestId('rail-templates').click()
    await expect(visible(restored).getByRole('heading', { name: 'Makro' })).toHaveCount(1)
    await expect(visible(restored).getByRole('heading', { name: 'Fototage' })).toHaveCount(1)
    await expect(visible(restored).getByText('(import)')).toHaveCount(0)

    await fresh.close()
  })

  /*
   * E2E-M18-11 (FR-18.4, ADR-030): the *single-document* half of the same rule.
   *
   * A file holding one document is M18's merge preview, not the restore list —
   * a different branch of the screen, with its own way of saying "already
   * here" and its own commit. E2E-M18-10 covers the restore list; without this
   * the preview's note and its toast were written into a template nothing ran.
   *
   * A device with one trip and no template produces exactly one document, so
   * the file is taken from the app's own backup rather than hand-written —
   * which also keeps the year out of the fixture, where it would have been
   * whatever `new Date()` said on the day.
   */
  test('E2E-M18-11: a single trip document that is already here says so before importing', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)

    await page.getByTestId('sync-indicator').click()
    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await sheet.getByTestId('sync-detail-backup').click()
    const oneDocument = await readFile(await (await downloadPromise).path(), 'utf8')

    await page.goto('/tabs/trips')
    await page.getByTestId('m2-portable-import').click()
    await page.getByTestId('portable-paste').locator('textarea').fill(oneDocument)
    await page.getByTestId('portable-preview').click()

    // The merge preview, not the restore list — and it answers before the
    // button is pressed.
    await expect(page.getByTestId('portable-restore')).toHaveCount(0)
    await expect(page.getByTestId('portable-already-here')).toBeVisible()

    await page.getByTestId('portable-commit').click()

    await expect(page.locator('ion-toast')).toContainText('already on this device')
    // It opened the trip that was already here rather than a copy of it.
    await expectTripOpen(page, TRIP.name)

    await page.goto('/tabs/trips?status=planned')
    await expect(visible(page).getByTestId(`trip-row-${TRIP.name}`)).toHaveCount(1)
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

/**
 * M18's *other* branch — the merge preview a single document opens
 * (FR-18.4/18.5, FR-16.3).
 *
 * The restore list above is the branch a backup file takes; a file holding
 * one document takes this one, and until this block nothing drove it. The
 * preview's own promises — the summary header, the three per-item states, the
 * merge/keep-separate choice, the schema warning and the parse error — were
 * written in 2026-07 and rendered by no test: the two cases in
 * `packing-list.spec.ts` that come through here use it as a *fixture* for a
 * trip with quantities, click straight past the preview and assert nothing
 * about it.
 *
 * The inventory these cases match against is built by an import of their own,
 * which is both the cheapest path and the honest one: M18 is the screen that
 * creates master items out of a file, so the file that arrives second meets
 * exactly what the first one left behind.
 */
test.describe('M18 portable import preview @local @m18', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /** One portable template document, the shape `serializeTemplate` writes. */
  function templateDoc(name: string, items: string[]): string {
    return [
      'kind: template',
      'schema_version: 1',
      `name: ${name}`,
      'items:',
      ...items.flatMap((item) => [`  - name: ${item}`, '    quantity: 1']),
    ].join('\n')
  }

  /** The inventory the later documents match against: Zelt and Sonnencreme. */
  const BASIS = templateDoc('Basis', ['Zelt', 'Sonnencreme'])

  /** Paste a document into M18 and open its preview, the way M18-11 does. */
  async function pastePreview(page: Page, text: string) {
    await page.goto('/portable-import')
    await page.getByTestId('portable-paste').locator('textarea').fill(text)
    await page.getByTestId('portable-preview').click()
  }

  // E2E-M18-01 (FR-18.4/18.5): the preview reads the document out loud —
  // header and per-item state — and Import lands it. The states are the whole
  // point of the screen: they are what tells the user, before the button,
  // whether this file is about to add three items or re-use two they have.
  test('E2E-M18-01: the preview names the document and every item state, then imports it', async ({
    page,
  }) => {
    await pastePreview(page, BASIS)
    await page.getByTestId('portable-commit').click()
    await expect(page.getByTestId('header-title')).toHaveText('Basis')

    await pastePreview(page, templateDoc('Fototage', ['Zelt', 'Sonnenkreme', 'Kamera']))

    const summary = visible(page).getByTestId('portable-summary')
    await expect(summary).toContainText('Fototage')
    await expect(summary).toContainText('Template')
    await expect(summary).toContainText('3 items')
    await expect(summary).toContainText('schema v1')

    // The three states of FR-16.3's matcher, each on its own row.
    await expect(visible(page).getByTestId('portable-match-Zelt')).toContainText('matched')
    await expect(visible(page).getByTestId('portable-match-Kamera')).toContainText('new')
    const near = visible(page).getByTestId('portable-match-Sonnenkreme')
    await expect(near).toContainText('similar to: Sonnencreme')
    // Only the ambiguous row is asked about: a decided state offers no choice,
    // which is what keeps the near row's segment meaningful.
    await expect(near.getByTestId('portable-separate')).toBeVisible()
    await expect(
      visible(page).getByTestId('portable-match-Zelt').getByTestId('portable-separate'),
    ).toHaveCount(0)

    await page.getByTestId('portable-commit').click()
    await expect(page.getByTestId('header-title')).toHaveText('Fototage')
    // Three positions: the template is landed whole, not as a name. Counted on
    // the head's own number rather than on rows, which is what M8 shows the
    // user.
    await expect(visible(page).getByTestId('m8-positions-head')).toContainText('3')
  })

  // E2E-M18-03 (FR-16.3): the choice on a near-duplicate row is a decision
  // about the *inventory*, and the only place it becomes visible is M9. Both
  // branches run in one case on purpose: "no second item appeared" is equally
  // green against an import that created nothing at all, so the row that was
  // kept apart is the positive signal for the row that was merged.
  test('E2E-M18-03: keep-separate creates a second item where merge creates none', async ({
    page,
  }) => {
    await pastePreview(page, BASIS)
    await page.getByTestId('portable-commit').click()
    await expect(page.getByTestId('header-title')).toHaveText('Basis')

    await pastePreview(page, templateDoc('Fototage', ['Zelte', 'Sonnenkreme']))
    // Sonnenkreme keeps the default the screen offers (merge); Zelte is told
    // to stay apart.
    await visible(page).getByTestId('portable-match-Zelte').getByTestId('portable-separate').click()
    await page.getByTestId('portable-commit').click()
    await expect(page.getByTestId('header-title')).toHaveText('Fototage')

    await page.goto('/tabs/items')
    const named = (name: string) => visible(page).getByRole('heading', { name, exact: true })
    await expect(named('Zelte')).toHaveCount(1)
    await expect(named('Sonnenkreme')).toHaveCount(0)
    await expect(named('Sonnencreme')).toHaveCount(1)
    // Three, not two and not four: the count is what stops a merge that
    // silently dropped the item and a keep-separate that duplicated both.
    await expect(visible(page).getByTestId('m9-row')).toHaveCount(3)
  })

  // E2E-M18-02 (FR-18.4, ADR-024): a trip document arrives in the status it
  // carries. ADR-024 rejected honouring the status only on the restore path
  // precisely because the same file would then behave differently depending on
  // which button opened it — and this, the preview branch, is the half that
  // rejection is about. E2E-M18-09 covers the restore branch; nothing covered
  // this one.
  test('E2E-M18-02: a trip document arrives in the status it carries, not as a plan', async ({
    page,
  }) => {
    await pastePreview(
      page,
      [
        'kind: trip',
        'schema_version: 1',
        'name: Samedan 2019',
        'end_date: "2019-12-31"',
        'status: archived',
        'travelers:',
        '  - name: Andy',
        'containers: []',
        'items:',
        '  - name: Zelt',
        '    quantity: 1',
        '    traveler: Andy',
        '    category: Aktivität',
        '    mode: pack',
        '    late_packer: false',
      ].join('\n'),
    )
    await expect(visible(page).getByTestId('portable-summary')).toContainText('Trip')
    await page.getByTestId('portable-commit').click()
    await expectTripOpen(page, 'Samedan 2019')

    await page.goto('/tabs/trips?status=archived')
    await expect(visible(page).getByTestId('trip-row-Samedan 2019')).toHaveCount(1)
    // The negative half, on the segment it used to land on: before ADR-024
    // every imported trip was planning, so a decade of archived history
    // imported as a decade of plans.
    await page.goto('/tabs/trips?status=planned')
    await expect(visible(page).getByTestId('trip-row-Samedan 2019')).toHaveCount(0)
  })

  // E2E-M18-04 (FR-18.5): the two ends of the format's tolerance, on the one
  // screen that has to state both — a file it cannot read at all is refused
  // here, with its reason, and a file from a newer app is warned about and
  // imported anyway. Both are rendered by nothing else: the parser's own rules
  // are exhaustively unit-covered in `domain/__tests__/portable.spec.ts`, and
  // a rule nobody paints is a rule the user never hears.
  test('E2E-M18-04: an unreadable file is refused with its reason, a newer one still imports', async ({
    page,
  }) => {
    await page.goto('/portable-import')
    await page.getByTestId('portable-paste').locator('textarea').fill('just some notes I wrote')
    await page.getByTestId('portable-preview').click()

    await expect(visible(page).getByTestId('portable-parse-error')).toContainText(
      'not a portable document',
    )
    // Refused *at the picker*: neither branch of the screen opened, and the
    // form is still there to correct — an error that navigated away would
    // leave nothing to fix.
    await expect(visible(page).getByTestId('portable-summary')).toHaveCount(0)
    await expect(visible(page).getByTestId('portable-restore')).toHaveCount(0)
    await expect(visible(page).getByTestId('portable-paste')).toBeVisible()
    // …with what was pasted still in it, which is what makes the refusal
    // correctable rather than merely reported.
    await expect(visible(page).getByTestId('portable-paste').locator('textarea')).toHaveValue(
      'just some notes I wrote',
    )

    await page.getByTestId('portable-paste').locator('textarea').fill(
      [
        'kind: trip',
        'schema_version: 99',
        'name: Zukunft',
        'end_date: "2027-12-31"',
        // A field this build has never heard of, which FR-18.5 says is
        // ignored rather than fatal.
        'mood: hopeful',
        'travelers: []',
        'containers: []',
        'items:',
        '  - name: Zelt',
        '    quantity: 1',
        '    mode: pack',
        '    late_packer: false',
      ].join('\n'),
    )
    await page.getByTestId('portable-preview').click()

    await expect(visible(page).getByTestId('portable-newer-schema')).toBeVisible()
    await expect(visible(page).getByTestId('portable-summary')).toContainText('schema v99')
    await page.getByTestId('portable-commit').click()
    // Best-effort means the trip is here, unknown field and all.
    await expectTripOpen(page, 'Zukunft')
    await expect(visible(page).getByTestId('m4-row-Zelt')).toBeVisible()
  })
})
