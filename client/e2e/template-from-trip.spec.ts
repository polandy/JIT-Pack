import {
  test,
  expect,
  expectTripOpen,
  tripAction,
  expectTripActionOffered,
  expectTripActionAbsent,
} from './fixtures'
import {
  addPosition,
  addToGroup,
  backToTemplateList as backToList,
  createTemplate,
  createTripFollowingGroup,
  includeGroup,
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
  await tripAction(page, 'start')
  // The archive action appearing is the settled signal that the status
  // write landed — a fixed wait would only probably hold.
  await expectTripActionOffered(page, 'archive')
  await tripAction(page, 'archive')
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
    await expectTripActionAbsent(page, 'archive')
    await expect(visible(page).getByTestId('m4-template-from-trip')).toHaveCount(0)

    await tripAction(page, 'start')

    // Active: archiving is offered, starting is not offered twice — and the
    // closing card still stays away. The card belongs to a *finished* trip,
    // and a running one offering "make a template of this" would be an
    // invitation to harvest a trip that has not happened yet.
    await expectTripActionOffered(page, 'archive')
    await expectTripActionAbsent(page, 'start')
    await expect(visible(page).getByTestId('m4-template-from-trip')).toHaveCount(0)

    await tripAction(page, 'archive')
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
    await expect(group.getByTestId('m21-choice-update')).toHaveClass(/segment-button-checked/)
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

    // The blast note is the screen's own claim about that reach, and this is
    // the only world in the suite that can tell its two branches apart: with
    // no following trip it reads "no trip follows it right now", which a note
    // that never counted anything would produce just as well (E2E-M21-02
    // asserts it visible in exactly that world). Here one trip follows, so
    // the number is a fact rather than a shape.
    await expect(visible(page).getByTestId('m21-blast')).toContainText('1 trip will be asked')

    await visible(page).getByTestId('m21-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Samedan Sommer 2027')

    await page.goto(following)
    const proposal = visible(page).getByTestId('m4-group-proposal')
    await expect(proposal).toContainText('Stativ')
  })

  test('E2E-M21-04: an unchecked loose row is left behind, a checked one is carried', async ({
    page,
  }) => {
    // The word the promise turns on is *checked*: "carries the **checked**
    // loose rows as own positions". Every other case in this file leaves the
    // pre-checked state alone, so nothing in the suite has ever operated a
    // loose row's checkbox — a create that simply took every loose row would
    // have been green throughout, and so would a checkbox wired to nothing.
    await seedGroup(page)
    const trip = await tripFromGroup(page, 'Samedan Sommer 2026')
    await quickAddVerbatim(page, 'Reisefön')
    await quickAddVerbatim(page, 'Powerbank')
    await archiveTrip(page)

    await openM21(page, trip)
    await expect(visible(page).getByTestId('m21-loose-head')).toContainText('2 of 2')

    const powerbank = visible(page).getByTestId('m21-loose').filter({ hasText: 'Powerbank' })
    await expect(powerbank.locator('ion-checkbox')).toHaveJSProperty('checked', true)
    await powerbank.locator('ion-checkbox').click()

    // The head's count is the screen's own read-back, and it could not have
    // been true before the tap — "2 of 2" is what the case just asserted.
    await expect(visible(page).getByTestId('m21-loose-head')).toContainText('1 of 2')
    await expect(powerbank.locator('ion-checkbox')).toHaveJSProperty('checked', false)

    await visible(page).getByTestId('m21-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Samedan Sommer 2027')

    // Both directions on the resulting Vorlage: the kept row is the positive
    // control the dropped one is read against, so "nothing was carried over"
    // cannot pass for "the unchecked row stayed out".
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Reisefön' })).toHaveCount(
      1,
    )
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Powerbank' })).toHaveCount(
      0,
    )
  })

  test('E2E-M21-05: a name another template holds is refused where it is typed', async ({
    page,
  }) => {
    // FR-1.6 on M21's own two writers. M7's create sheet has had this case
    // since 2026-08-25 (E2E-M7-10); M21 writes a Vorlage *and* optionally a
    // group into the same instance-wide name space, and neither refusal had
    // ever been rendered. The second half of the rule exists nowhere else in
    // the app: the two names this one screen writes must also differ from
    // each other.
    await seedGroup(page)
    const trip = await tripFromGroup(page, 'Samedan Sommer 2026')
    await quickAddVerbatim(page, 'Reisefön')
    await archiveTrip(page)

    await openM21(page, trip)
    const name = visible(page).getByTestId('m21-name').locator('input')
    const create = visible(page).getByTestId('m21-create')

    // Differing only in capitals — the fold is the rule, not the string.
    await name.fill('makro')
    await expect(visible(page).getByTestId('m21-name-taken')).toContainText('Makro')
    await expect(create).toHaveAttribute('aria-disabled', 'true')

    // The positive control: a free name lifts the refusal again, so the
    // disabled state above is a fact about the name and not about the screen.
    await name.fill('Samedan Sommer 2027')
    await expect(visible(page).getByTestId('m21-name-taken')).toHaveCount(0)
    await expect(create).not.toHaveAttribute('aria-disabled', 'true')

    await visible(page).getByTestId('m21-bundle').click()
    const bundle = visible(page).getByTestId('m21-bundle-name').locator('input')

    // The group would take the Vorlage's own name — one write, two rows, one
    // name. Refused with its own sentence rather than with the taken one,
    // because nothing holds the name yet.
    await bundle.fill('Samedan Sommer 2027')
    await expect(visible(page).getByTestId('m21-bundle-name-taken')).toContainText(
      'different names',
    )
    await expect(create).toHaveAttribute('aria-disabled', 'true')

    // And the same field is held to the taken rule as well.
    await bundle.fill('Makro')
    await expect(visible(page).getByTestId('m21-bundle-name-taken')).toContainText('Makro')
    await expect(create).toHaveAttribute('aria-disabled', 'true')

    await bundle.fill('Samedan Extras')
    await expect(visible(page).getByTestId('m21-bundle-name-taken')).toHaveCount(0)
    await expect(create).not.toHaveAttribute('aria-disabled', 'true')
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
    await expect(visible(page).getByTestId('m8-groups-head')).toBeVisible()
    await expect(
      visible(page).locator('ion-item').filter({ hasText: 'Samedan Extras' }),
    ).toHaveCount(1)
    // "A second include" is what the sentence promises, and a row bearing the
    // group's name proves only that the name is somewhere on the screen — M8
    // renders an include and an own position as the same element. The Vorlage
    // having *no* own positions at all is what separates the two readings.
    await expect(visible(page).getByTestId('m8-positions-empty')).toBeVisible()
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Reisefön' })).toHaveCount(
      0,
    )
  })
})

/**
 * E2E-FLOW-09 — the template round trip, over a year.
 *
 * The one §5 flow whose steps all have cases and whose *loop* has none: M3
 * generates from a composition, the trip learns something, M21 folds that back
 * into the groups, and the next year's M3 run has to arrive at the full
 * learned set. Every screen on the way is covered on its own; nothing has ever
 * closed the circle, and a round trip is exactly where a rule that is right at
 * each step can still lose something between two of them.
 *
 * **Local Mode, where the flow's own line said `single`.** Generation,
 * recognition, the fold-back plan and the FR-27.4 question all run client-side
 * (invariant 4) and the flow has one device: a backend would add a partition
 * to pull and not one rule to this chain. Local is also the stricter run —
 * anything here that quietly needed a round trip would fail rather than pass
 * for the wrong reason.
 */
test.describe('FLOW-09 — a template learns across a year (FR-27.1–27.5, FR-2.3a)', () => {
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  /** The owner's scenario: two groups sharing a camera, under one Vorlage. */
  async function seedComposition(page: Page) {
    await page.goto('/tabs/templates')
    await createTemplate(page, 'group', 'Makro')
    await addPosition(page, 'Kamera')
    await addPosition(page, 'Makro-Objektiv')
    await backToList(page)

    await createTemplate(page, 'group', 'Wildlife')
    await addPosition(page, 'Kamera')
    await addPosition(page, 'Teleobjektiv')
    await backToList(page)

    await createTemplate(page, 'template', 'Fototage')
    await includeGroup(page, 'Makro')
    await includeGroup(page, 'Wildlife')
    await backToList(page)
  }

  /** M3 with one Vorlage picked in step 3. Returns the trip's path. */
  async function tripFromTemplate(page: Page, name: string, vorlage: string, items: number) {
    await page.goto('/trips/new')
    await page.getByTestId('wizard-name').locator('input').fill(name)
    await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible()
    await page.getByTestId('wizard-next').click()

    await expect(page.getByTestId('wizard-step-3')).toBeVisible()
    await visible(page)
      .getByTestId('wizard-section-templates')
      .locator('ion-item')
      .filter({ hasText: vorlage })
      .first()
      .locator('ion-checkbox')
      .click()
    await expect(visible(page).getByTestId('wizard-item-count')).toContainText(`${items} items`)
  }

  test('E2E-FLOW-09: next year’s Vorlage carries what this year’s trip learned', async ({
    page,
  }) => {
    await seedComposition(page)

    // 1 — generation from the composition. The camera arrives once and the
    // preview names both groups that asked for it (E2E-M3-11 owns that clause
    // in full; here it is the premise the rest of the year is built on).
    await tripFromTemplate(page, 'Fototour 2026', 'Fototage', 3)
    await expect(visible(page).getByTestId('wizard-merges')).toContainText('Makro & Wildlife')
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-4')).toBeVisible()
    await page.getByTestId('wizard-create').click()
    await expectTripOpen(page, 'Fototour 2026')
    const harvested = new URL(page.url()).pathname

    // 2 — the trip learns something the templates do not know.
    await quickAddVerbatim(page, 'Reisefön')

    // 3 — and it ends.
    await archiveTrip(page)

    // 4 — the deviation: the group drops a position the finished trip carried.
    await removeGroupPosition(page, 'Makro', 'Makro-Objektiv')

    // A trip planned *after* the removal follows the thinner group, so the
    // fold-back is a real change for it rather than a no-op (the ordering
    // E2E-M21-03c had to discover).
    const following = await createTripFollowingGroup(page, 'Fototour Winter 2027', 'Makro')

    // 5 — M21 recognises *both* groups, from provenance alone. Wildlife is the
    // one worth naming: its camera is shared, so the only row that can point
    // at it is the telephoto.
    await openM21(page, harvested)
    const groups = visible(page).getByTestId('m21-group')
    await expect(groups).toHaveCount(2)
    await expect(groups.filter({ hasText: 'Makro' }).first()).toContainText('came from it')
    await expect(groups.filter({ hasText: 'Wildlife' }).first()).toContainText('came from it')
    await expect(visible(page).getByTestId('m21-deviation')).toContainText('Makro-Objektiv')

    await visible(page).getByTestId('m21-create').click()
    await expect(page.getByTestId('header-title')).toHaveText('Fototour 2027')

    // …and *references* both, rather than copying their positions in: the
    // second half of the flow's "recognised & referenced", and the reason the
    // next generation can still learn from the groups.
    await expect(visible(page).getByTestId('m8-groups-head')).toBeVisible()
    for (const group of ['Makro', 'Wildlife']) {
      await expect(visible(page).locator('ion-item').filter({ hasText: group })).toHaveCount(1)
    }
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Reisefön' })).toHaveCount(1)
    await expect(visible(page).locator('ion-item h2').filter({ hasText: 'Kamera' })).toHaveCount(0)

    // 6 — the fold-back reaches the trip that still follows the group, as the
    // *question* FR-27.4 has asked since 2026-08-18 rather than as the applied
    // change the flow's own sentence still promised.
    await page.goto(following)
    await expect(visible(page).getByTestId('m4-group-proposal')).toContainText('Makro-Objektiv')

    // 6b — and never the trip it was harvested from. E2E-M21-02's note has
    // stated that rule since M21 shipped ("a past trip is never asked to
    // follow along") with nothing asserting it: an archived trip is a record
    // of what was packed, and a proposal on it would offer to edit history.
    //
    // The change has to be one *neither* trip carries, which the fold-back
    // itself can never be: it makes the group match the harvested trip, so
    // that trip has nothing to be offered whatever the rule says. Proved —
    // with the archived guard deleted from `followsGroups`, the earlier draft
    // of this case stayed green. The group therefore grows a position here,
    // and the two trips are asked about the same one.
    await addToGroup(page, 'Makro', 'Blitz')

    await page.goto(following)
    await expect(visible(page).getByTestId('m4-group-proposal')).toContainText('Blitz')

    await page.goto(harvested)
    // The second positive signal is that this page rendered at all — an
    // absence asserted on a screen that never painted would pass against
    // anything.
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
    await expect(visible(page).getByTestId('m4-group-proposal')).toHaveCount(0)

    // 7 — the circle closes: next year's run off the harvested Vorlage brings
    // both groups' items *and* what the trip added, each exactly once. Blitz
    // is the fifth, and it is the reference proving itself: it was added to
    // the group after the Vorlage was written, and it arrives anyway.
    await tripFromTemplate(page, 'Fototour 2027 · Tessin', 'Fototour 2027', 5)
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-4')).toBeVisible()
    const rows = visible(page).getByTestId('wizard-review-row')
    for (const learned of ['Kamera', 'Makro-Objektiv', 'Teleobjektiv', 'Reisefön', 'Blitz']) {
      await expect(rows.filter({ hasText: learned })).toHaveCount(1)
    }
  })
})
