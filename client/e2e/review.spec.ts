import {
  test,
  expect,
  addPosition,
  backToTemplateList,
  createTemplate,
  createTripViaWizard,
  expectTripOpen,
  openQuickAdd,
  visiblePage as visible,
  tripAction,
  expectTripActionOffered,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M14 — Post-Trip Review Assistant (UI-Test-Spec §4, unit "M14 review").
 *
 * The positive cases were blocked twice over, and both blocks are gone:
 * a proposal needs FR-9.1 flags, a flag needs an *active* trip — which
 * M21 made reachable on 2026-08-19 — and *unused*, the flag the
 * assistant is mostly about, had no control anywhere in the app until
 * this unit's PR built it into M5's Details block. So every case here
 * builds its flags the way a user does, through M5 and the quick-add,
 * and reads the result back out of M8 rather than out of the store.
 *
 * The list *semantics* stay pinned in
 * views/trips/__tests__/ReviewPage.spec.ts, which reaches states this
 * unit deliberately does not stage.
 */

const TRIP = { name: 'Herbst Tessin', travelers: ['Andy'] }
const GROUP = 'Makro'
const OTHER_GROUP = 'Regen'
/** Typed on the road, so it carries no provenance — an FR-9.1 *missing*. */
const MISSING_ITEM = 'Powerbank'

test.describe('M14 review assistant @local @m14', () => {
  test('E2E-M14-06: no flags → archiving skips the assistant, and opening it is honest', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local' })
    const tripPath = await createTripViaWizard(page, TRIP)

    // Nothing was flagged, so the closing pass archives and stops: an
    // assistant with nothing to propose is worse than no assistant.
    await startTrip(page)
    await archiveThroughPass(page)
    // Filtered by its text, not by being *a* toast: `startTrip` raised one
    // seconds earlier and the two overlap, which is a strict-mode failure
    // rather than a wrong assertion — and it is intermittent, so it reads
    // as a flake.
    await expect(page.locator('ion-toast', { hasText: 'Nothing to review' })).toBeVisible()
    // …and the *page* is still the packing list. The toast alone would not
    // say so: `review.nothingToast` and `review.empty` are the same
    // sentence in both catalogues, so a case reading only the text would
    // pass just as well on the screen this clause is about not reaching.
    // The closing card is the archived trip's own M4, so one locator says
    // both halves: the trip *was* archived, and the assistant was not opened.
    await expect(visible(page).getByTestId('m4-template-from-trip')).toBeVisible()
    await expect(visible(page).getByTestId('m14-open-count')).toHaveCount(0)

    await page.goto(`${tripPath}/review`)

    // A list with a count, not a card stack (FR-27.11): the header says
    // how much is open even when that is nothing.
    await expect(visible(page).getByTestId('m14-open-count')).toContainText('0')
    await expect(visible(page).getByTestId('m14-empty')).toBeVisible()
    await expect(visible(page).getByTestId('m14-open-row')).toHaveCount(0)
  })

  test('E2E-G9 coverage: back from the review renders the packing list', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local' })
    const tripPath = await createTripViaWizard(page, TRIP)

    await page.goto(`${tripPath}/review`)
    await expect(visible(page).getByTestId('m14-empty')).toBeVisible()

    await page.getByTestId('header-back').click()

    // Rendered, not just routed (the rule every navigation case follows).
    await expect(visible(page).getByTestId('m4-fab')).toBeVisible()
  })
})

/**
 * The world every positive case needs, built through the app (spec §2.4):
 * a group with two positions, a second group that shares neither, a trip
 * generated from the first, started, one row judged *unused* and one
 * ad-hoc row auto-flagged *missing*.
 */
async function seedGroups(page: Page) {
  await page.goto('/tabs/templates')
  await createTemplate(page, 'group', GROUP)
  await addPosition(page, 'Kamera')
  await addPosition(page, 'Stativ')
  await backToTemplateList(page)
  await createTemplate(page, 'group', OTHER_GROUP)
  await addPosition(page, 'Regenjacke')
  await backToTemplateList(page)
}

/** M3 with one named group picked in step 3 — rows arrive with provenance. */
async function tripFromGroup(page: Page, name: string, group: string): Promise<string> {
  await page.goto('/trips/new')
  await page.getByTestId('wizard-name').locator('input').fill(name)
  await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await visible(page)
    .getByTestId('wizard-section-groups')
    .locator('ion-item')
    .filter({ hasText: group })
    .locator('ion-checkbox')
    .first()
    .click()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()
  await expectTripOpen(page, name)
  return new URL(page.url()).pathname
}

/** FR-9.1 through the app's only door: M5's Details control. */
async function flagUnused(page: Page, item: string) {
  await visible(page).getByTestId(`m4-row-${item}`).getByRole('heading').click()
  await expect(page.getByTestId('m5-sheet')).toBeVisible()
  await page.getByTestId('m5-details').click()
  await page.getByTestId('m5-flag-unused').click()
  // The glance chip is the settled signal that the write landed — it
  // renders off the stored row, not off the toggle's own state.
  await expect(page.getByTestId('m5-glance')).toContainText('Unused')
  await page.getByTestId('m5-close').click()
  await expect(page.getByTestId('m5-sheet')).toHaveCount(0)
}

/** Quick-add on an *active* trip, which auto-flags Missing (FR-5.6). */
async function quickAddMissing(page: Page, name: string) {
  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill(name)
  await page.getByTestId('quick-add-input').locator('input').press('Enter')
  await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
}

/** Start the trip; the archive action appearing is the settled signal. */
async function startTrip(page: Page) {
  await tripAction(page, 'start')
  await expectTripActionOffered(page, 'archive')
}

/**
 * FR-9.3: *Reise abschliessen* opens the closing pass, and *Fertig* is what
 * archives. The pass is skippable by design, so finishing it without marking
 * anything is the ordinary path to M14.
 */
async function archiveThroughPass(page: Page) {
  await tripAction(page, 'archive')
  await expect(visible(page).getByTestId('m4-pass-banner')).toBeVisible()
  await page.getByTestId('m4-pass-finish').click()
}

/** Everything above, in order, ending on the *archived* trip's M4. */
async function flaggedTrip(page: Page): Promise<string> {
  await seedGroups(page)
  const path = await tripFromGroup(page, TRIP.name, GROUP)
  await startTrip(page)
  await flagUnused(page, 'Stativ')
  await quickAddMissing(page, MISSING_ITEM)
  return path
}

/** The open row whose proposal is about `item`. */
function row(page: Page, item: string) {
  return visible(page).getByTestId('m14-open-row').filter({ hasText: item })
}

/** The same proposal after it was handled — FR-9.4 moves it, keeps it. */
function handledRow(page: Page, item: string) {
  return visible(page).getByTestId('m14-handled-row').filter({ hasText: item })
}

/**
 * Read a row's target picker and close it again.
 *
 * Closed by *choosing the value it already has* rather than by Escape:
 * dismissal is Ionic's own path then, so the wait is on a state the app
 * reaches by itself. Escape left the popover up often enough to be seen.
 */
async function targetOptions(page: Page, item: string, current: string): Promise<string[]> {
  await row(page, item).getByTestId('m14-target').click()
  const options = page.locator('ion-popover ion-select-popover ion-item')
  await expect(options.first()).toBeVisible()
  const names = await options.allInnerTexts()
  await options.filter({ hasText: current }).first().click()
  await expect(page.locator('ion-popover')).toHaveCount(0)
  return names.map((n) => n.trim())
}

/** Open the group in M8 and read its positions back. */
async function openGroup(page: Page, group: string) {
  await page.goto('/tabs/templates')
  await visible(page).getByTestId('m7-scope-group').click()
  await visible(page).locator('ion-item').filter({ hasText: group }).first().click()
  await expect(page.getByTestId('header-title')).toHaveText(group)
}

test.describe('M14 review assistant — the positive half @local @m14', () => {
  // Each case builds its world through M7/M8/M3/M4/M5 (spec §2.4), which
  // on WebKit lands near the 30 s default budget.
  test.slow()

  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  test('E2E-M14-01: archiving a flagged trip opens the assistant, and a proposal reads', async ({
    page,
  }) => {
    await flaggedTrip(page)

    await archiveThroughPass(page)

    // Rendered, not routed: archiving lands on the assistant itself.
    await expect(visible(page).getByTestId('m14-open-count')).toContainText('2')
    await expect(row(page, 'Stativ')).toContainText('unused')
    await expect(row(page, 'Stativ')).toContainText('not needed on this trip')
    await expect(row(page, MISSING_ITEM)).toContainText('missing')
    await expect(row(page, MISSING_ITEM)).toContainText('was not on the list')
  })

  /**
   * E2E-M14-07 (FR-9.4): the closing card *teases* the first proposals.
   *
   * UI-Spec M14 has promised that since the screen shipped and the card read
   * none — it rendered a heading, a hint and two buttons, so it said the same
   * thing whether eleven suggestions were waiting or none, which is the one
   * question the tap answers. No case id claimed the clause, so nothing was
   * ever red (found 2026-08-30, the M14 audit).
   *
   * Here rather than in `closing-pass.spec.ts` because a proposal needs a row
   * with **provenance**: an ad-hoc row judged *unused* proposes nothing, since
   * there is no position to zero. That world is this file's fixture.
   */
  test('E2E-M14-07: the closing card names the proposals it would offer', async ({ page }) => {
    const path = await flaggedTrip(page)
    await archiveThroughPass(page)

    // Back to the archived trip, where the card lives.
    await page.goto(path)
    const teaser = visible(page).getByTestId('m4-closing-teaser')
    await expect(teaser).toBeVisible()
    await expect(teaser).toContainText('Stativ')
    // Two, not everything: the card is a tease and the list is one tap away.
    await expect(teaser).not.toContainText('…and')
  })

  test('E2E-M14-04: every row targets a group, and an unused row only where the item is', async ({
    page,
  }) => {
    await flaggedTrip(page)
    await archiveThroughPass(page)
    await expect(row(page, 'Stativ')).toBeVisible()

    // The unused row defaults to the group the position came from, and
    // may only move to a group that carries the item — zeroing a position
    // that does not exist would apply as nothing (FR-27.11).
    await expect(row(page, 'Stativ')).toContainText('From group')
    expect(await targetOptions(page, 'Stativ', GROUP)).toEqual([GROUP])

    // A missing row may land in any group — but never in a Ferien-Vorlage,
    // which is not offered at all.
    expect(await targetOptions(page, MISSING_ITEM, GROUP)).toEqual([GROUP, OTHER_GROUP])

    // FR-27.12: the chevron beside the picker looks *into* the group the
    // proposal is about to be written to. It is the one control on this
    // screen no case had ever clicked, and the question it answers —
    // "what is in there already?" — is the difference between choosing a
    // target and guessing one.
    await row(page, MISSING_ITEM).getByTestId(`m14-peek-${MISSING_ITEM}`).click()
    const peek = page.getByTestId('group-peek-sheet')
    await expect(peek.getByTestId('group-peek-name')).toHaveText(GROUP)
    await expect(peek.getByTestId('group-peek-item')).toHaveText(['Kamera', 'Stativ'])
    // The item being proposed is not in there yet — which is why there is
    // a proposal — so the sheet lists the group, not the proposal.
    await expect(peek.getByTestId('group-peek-item').filter({ hasText: MISSING_ITEM })).toHaveCount(
      0,
    )
    await peek.getByTestId('group-peek-close').click()
    await expect(page.getByTestId('group-peek-sheet')).toHaveCount(0)
  })

  test('E2E-M14-04b: a target a planning trip still follows states its blast radius', async ({
    page,
  }) => {
    const tripPath = await flaggedTrip(page)
    // A second trip, still planning, generated from the same group: the
    // write is about to reach it (FR-27.4).
    await tripFromGroup(page, 'Frühling Makro', GROUP)
    await page.goto(`${tripPath}/review`)

    await expect(row(page, 'Stativ').getByTestId('m14-blast')).toContainText(GROUP)
  })

  test('E2E-M14-02: apply writes to the group — zeroing one position, adding the other', async ({
    page,
  }) => {
    await flaggedTrip(page)
    await archiveThroughPass(page)
    await expect(row(page, 'Stativ')).toBeVisible()

    await row(page, 'Stativ').getByTestId('m14-apply').click()
    // Applied rows are read back under the outcome block (FR-9.4).
    await expect(handledRow(page, 'Stativ').getByTestId('m14-state')).toContainText('applied')
    await row(page, MISSING_ITEM).getByTestId('m14-apply').click()
    await expect(handledRow(page, MISSING_ITEM).getByTestId('m14-state')).toContainText('applied')

    await openGroup(page, GROUP)
    const positions = visible(page).locator('ion-item')
    // FR-9.2: unused zeroes the position rather than deleting it — the
    // knowledge that it exists and is not needed is the harvest.
    await expect(positions.filter({ hasText: 'Stativ' })).toContainText('0×')
    await expect(positions.filter({ hasText: MISSING_ITEM })).toHaveCount(1)
    await expect(positions.filter({ hasText: 'Kamera' })).toContainText('1×')
  })

  test('E2E-M14-05: decided rows stay visible and marked, and the count follows', async ({
    page,
  }) => {
    await flaggedTrip(page)
    await archiveThroughPass(page)
    await expect(visible(page).getByTestId('m14-open-count')).toContainText('2')

    await row(page, 'Stativ').getByTestId('m14-skip').click()

    // Skipped is a decision, not a disappearance (FR-27.11) — and since
    // FR-9.4 the decided row leaves *Offen* for the outcome block instead
    // of sitting under a heading that no longer counts it.
    await expect(handledRow(page, 'Stativ').getByTestId('m14-state')).toContainText('skipped')
    await expect(row(page, 'Stativ')).toHaveCount(0)
    await expect(visible(page).getByTestId('m14-open-count')).toContainText('1')
    await expect(visible(page).getByTestId('m14-handled-count')).toContainText('1')

    await row(page, MISSING_ITEM).getByTestId('m14-apply').click()
    await expect(visible(page).getByTestId('m14-open-count')).toContainText('0')
    await expect(visible(page).getByTestId('m14-summary')).toBeVisible()
    // The finished pass is reachable by finishing it: the empty state used
    // to be behind „never ask again" for both rows (FR-9.4).
    await expect(visible(page).getByTestId('m14-empty')).toBeVisible()
    await expect(visible(page).getByTestId('m14-handled-row')).toHaveCount(2)
  })

  test('E2E-M14-03: “never ask again” removes the pair for good, and only that pair', async ({
    page,
  }) => {
    const tripPath = await flaggedTrip(page)
    await archiveThroughPass(page)
    await expect(row(page, 'Stativ')).toBeVisible()

    await row(page, 'Stativ').getByTestId('m14-never').click()
    await expect(row(page, 'Stativ')).toHaveCount(0)
    await expect(row(page, MISSING_ITEM)).toHaveCount(1)

    // Resumability: the dismissal outlives the visit, the other row does not
    // inherit it (FR-9.2 — the scope is the item–group pair).
    await page.goto(`${tripPath}/review`)
    await expect(row(page, MISSING_ITEM)).toHaveCount(1)
    await expect(row(page, 'Stativ')).toHaveCount(0)
  })
})
