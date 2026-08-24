import { test, expect, expectTripOpen } from './fixtures'
import {
  addPosition,
  backToTemplateList as backToList,
  createTemplate,
  openQuickAdd,
  visiblePage as visible,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M21 — Vorlage aus Reise (§3.27, FR-27.5), plus the lifecycle step that
 * makes it reachable.
 *
 * Covers E2E-M21-01/02/03 and E2E-M4-43. The M21 cases were blocked until
 * this PR for a reason worth stating: the wizard only ever creates *planning*
 * trips, and both archive affordances are gated on *active*, so no path in
 * the app produced an archived trip at all. The „Reise starten" action closes
 * that gap, and with it M14's and M12's positive cases become reachable too.
 *
 * Local Mode throughout: recognition, the fold-back plan and every write run
 * client-side (invariant 4), so the mode without a server is where a missing
 * client rule shows up.
 */

/** One group with two positions — the least composition M21 can recognise. */
async function seedGroup(page: Page) {
  await page.goto('/tabs/templates')
  await createTemplate(page, 'group', 'Makro')
  await addPosition(page, 'Kamera')
  await addPosition(page, 'Stativ')
  await backToList(page)
}

/** M3 with the group picked in step 3 — the rows arrive with provenance. */
async function tripFromGroup(page: Page, name: string, positions = 2): Promise<string> {
  await page.goto('/trips/new')
  await page.getByTestId('wizard-name').locator('input').fill(name)
  await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await visible(page).getByTestId('wizard-section-groups').locator('ion-checkbox').first().click()
  await expect(visible(page).getByTestId('wizard-item-count')).toContainText(
    positions === 1 ? '1 item' : `${positions} items`,
  )
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()
  await expectTripOpen(page, name)
  return new URL(page.url()).pathname
}

/** Quick-add a row with no group behind it — a loose row for M21. */
async function quickAddVerbatim(page: Page, name: string) {
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(name)
  await page.getByTestId('quick-add-input').locator('input').press('Enter')
  await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
}

/** Drive the trip through its lifecycle to *archived*, where M21 lives. */
async function archiveTrip(page: Page) {
  await page.getByTestId('m4-start').click()
  // The archive action appearing is the settled signal that the status
  // write landed — a fixed wait would only probably hold.
  await expect(page.getByTestId('m4-archive')).toBeVisible()
  await page.getByTestId('m4-archive').click()
  // FR-9.3: the action opens the closing pass, and *Fertig* is what
  // archives — skipping the pass without judging anything is its own
  // supported path (E2E-M4-53 owns the pass itself).
  await page.getByTestId('m4-pass-finish').click()
  await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
}

/** Remove one position from the group, so the trip carries what it lacks. */
async function removeGroupPosition(page: Page, group: string, item: string) {
  await page.goto('/tabs/templates')
  await visible(page).getByTestId('m7-scope-group').click()
  await visible(page).locator('ion-item').filter({ hasText: group }).first().click()
  await expect(page.getByTestId('header-title')).toHaveText(group)
  await visible(page)
    .locator('ion-item')
    .filter({ hasText: item })
    .first()
    .getByLabel('Remove position')
    .click()
  await expect(visible(page).locator('ion-item').filter({ hasText: item })).toHaveCount(0)
}

async function openM21(page: Page, tripPath: string) {
  await page.goto(tripPath)
  await visible(page).getByTestId('m4-template-from-trip').click()
  await expect(visible(page).getByTestId('m21-intro')).toBeVisible()
}

test.describe('M21 — a finished trip folded back into templates (FR-27.5)', () => {
  // Each case builds its world through M7/M8/M3/M4 (spec §2.4 forbids
  // injecting preconditions), which on WebKit lands near the 30 s default.
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M4-43: a planning trip can be started, and only then archived', async ({ page }) => {
    await seedGroup(page)
    await tripFromGroup(page, 'Samedan Sommer 2026')

    // Planning: no archiving, and therefore no closing card either.
    await expect(page.getByTestId('m4-archive')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-template-from-trip')).toHaveCount(0)

    await page.getByTestId('m4-start').click()

    // Active: archiving is offered, starting is not offered twice — and the
    // closing card still stays away. The card belongs to a *finished* trip,
    // and a running one offering "make a template of this" would be an
    // invitation to harvest a trip that has not happened yet.
    await expect(page.getByTestId('m4-archive')).toBeVisible()
    await expect(page.getByTestId('m4-start')).toHaveCount(0)
    await expect(visible(page).getByTestId('m4-template-from-trip')).toHaveCount(0)

    await page.getByTestId('m4-archive').click()
    await page.getByTestId('m4-pass-finish').click()
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
  })

  test('E2E-M21-01: the closing card leads to a screen that names the recognised group', async ({
    page,
  }) => {
    await seedGroup(page)
    const trip = await tripFromGroup(page, 'Samedan Sommer 2026')
    await quickAddVerbatim(page, 'Reisefön')
    await archiveTrip(page)

    await openM21(page, trip)

    // The group is recognised from provenance and marked as reused.
    const group = visible(page).getByTestId('m21-group')
    await expect(group).toHaveCount(1)
    await expect(group).toContainText('Makro')
    await expect(group).toContainText('2 items on this trip came from it')
    await expect(group.getByTestId('m21-reused')).toBeVisible()

    // The ad-hoc row is loose, pre-checked, and says why it is loose.
    const loose = visible(page).getByTestId('m21-loose')
    await expect(loose).toHaveCount(1)
    await expect(loose).toContainText('Reisefön')
    await expect(loose).toContainText('added without a group')
    await expect(loose.locator('ion-checkbox')).toHaveJSProperty('checked', true)
    await expect(visible(page).getByTestId('m21-loose-head')).toContainText('1 of 1')

    // The name is prefilled with next year's run.
    await expect(visible(page).getByTestId('m21-name').locator('input')).toHaveValue(
      'Samedan Sommer 2027',
    )

    // Leaving is a behaviour too (working agreement, after four navigation
    // defects both screen suites missed). Asserted on the rendered page, not
    // the URL: the ADR-011 chevron goes to meta.parent, which is M4.
    await page.getByTestId('header-back').click()
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
    await expect(visible(page).getByTestId('m21-intro')).toHaveCount(0)
  })

  test('E2E-M21-02: a deviation names itself and defaults to updating the group', async ({
    page,
  }) => {
    await seedGroup(page)
    const trip = await tripFromGroup(page, 'Samedan Sommer 2026')
    await archiveTrip(page)
    // The group drops the tripod afterwards; the archived trip keeps its row,
    // and a past trip is never asked to follow along (FR-27.4).
    await removeGroupPosition(page, 'Makro', 'Stativ')

    await openM21(page, trip)

    const group = visible(page).getByTestId('m21-group')
    await expect(group.getByTestId('m21-deviation')).toContainText('Stativ')
    // Default is *update* — a trip mutation is learned truth (FR-27.5).
    // Ionic marks the chosen segment with a class, not with aria-checked;
    // asserting the attribute was green-by-absence in the wrong direction.
    await expect(group.getByTestId('m21-choice-update')).toHaveClass(
      /segment-button-checked/,
    )
    await expect(group.getByTestId('m21-blast')).toBeVisible()

    // Choosing "only in this template" retracts the blast note with it.
    await group.getByTestId('m21-choice-own').click()
    await expect(group.getByTestId('m21-blast')).toHaveCount(0)
  })

  test('E2E-M21-02b: a group position the trip did not carry is reported, never acted on', async ({
    page,
  }) => {
    await seedGroup(page)
    const trip = await tripFromGroup(page, 'Samedan Sommer 2026')
    await archiveTrip(page)
    // The group grows a position the trip never had.
    await page.goto('/tabs/templates')
    await visible(page).getByTestId('m7-scope-group').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Makro' }).first().click()
    await addPosition(page, 'Blitz')
    await backToList(page)

    await openM21(page, trip)

    const absent = visible(page).getByTestId('m21-absent')
    await expect(absent).toContainText('Blitz')
    await expect(absent).toContainText('the group stays unchanged')
    // Reported is not the same as offered: no choice appears for it.
    await expect(visible(page).getByTestId('m21-deviation')).toHaveCount(0)
  })

  test('E2E-M21-03: creating references the group, carries the loose row, and feeds the deviation back', async ({
    page,
  }) => {
    await seedGroup(page)
    const trip = await tripFromGroup(page, 'Samedan Sommer 2026')
    await quickAddVerbatim(page, 'Reisefön')
    await archiveTrip(page)
    await removeGroupPosition(page, 'Makro', 'Stativ')

    await openM21(page, trip)
    await visible(page).getByTestId('m21-create').click()

    // Hand-off into M8 on the new Vorlage — and M8 is the proof: the group
    // is listed as an *include*, not copied in as positions.
    await expect(page.getByTestId('header-title')).toHaveText('Samedan Sommer 2027')
    await expect(visible(page).getByTestId('m8-groups-head')).toBeVisible()
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Makro' })).toHaveCount(1)
    // The loose row is an own position; the group's own items are not repeated.
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Reisefön' })).toHaveCount(
      1,
    )
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Kamera' })).toHaveCount(0)

    // The deviation landed in the group itself, which is what "aktualisieren"
    // promised — visible on the group, not only on the new Vorlage.
    await backToList(page)
    await visible(page).getByTestId('m7-scope-group').click()
    await visible(page).locator('ion-item').filter({ hasText: 'Makro' }).first().click()
    await expect(page.getByTestId('header-title')).toHaveText('Makro')
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Stativ' })).toHaveCount(1)
  })

  test('E2E-M21-03c: a fold-back is offered to the trips that still follow the group', async ({
    page,
  }) => {
    // The blast line promises the deviation reaches everything including the
    // group. FR-27.4 (as revised 2026-08-18) delivers that as a *question* at
    // each following trip, not as a silent write — so what a second, still
    // planned trip must show afterwards is the proposal, not an applied
    // change.
    await seedGroup(page)
    const harvested = await tripFromGroup(page, 'Samedan Sommer 2026')
    await archiveTrip(page)

    // The group drops the tripod, so the archived trip carries what the group
    // no longer has — and the trip generated *after* that never had it. The
    // order matters: generating both trips first would make the fold-back a
    // net no-op, and the case would assert a proposal nobody owes.
    await removeGroupPosition(page, 'Makro', 'Stativ')
    const following = await tripFromGroup(page, 'Engadin 2027', 1)

    await openM21(page, harvested)
    await visible(page).getByTestId('m21-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Samedan Sommer 2027')

    await page.goto(following)
    const proposal = visible(page).getByTestId('m4-group-proposal')
    await expect(proposal).toContainText('Stativ')
  })

  test('E2E-M21-03b: the bundle toggle collects the loose rows into a fresh group', async ({
    page,
  }) => {
    await seedGroup(page)
    const trip = await tripFromGroup(page, 'Samedan Sommer 2026')
    await quickAddVerbatim(page, 'Reisefön')
    await archiveTrip(page)

    await openM21(page, trip)
    // The testid sits on the ion-toggle, which *is* the switch — asking for
    // a switch inside it finds nothing.
    await visible(page).getByTestId('m21-bundle').click()
    const bundleName = visible(page).getByTestId('m21-bundle-name').locator('input')
    await expect(bundleName).toBeVisible()
    await bundleName.fill('Samedan Extras')

    await visible(page).getByTestId('m21-create').click()

    // Two includes now, and the loose row is in the new group rather than
    // sitting as an own position of the Vorlage.
    await expect(page.getByTestId('header-title')).toHaveText('Samedan Sommer 2027')
    await expect(visible(page).locator('ion-item').filter({ hasText: 'Samedan Extras' })).toHaveCount(
      1,
    )
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Reisefön' })).toHaveCount(0)
  })
})
