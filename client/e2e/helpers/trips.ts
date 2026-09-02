/**
 * A trip, from the outside: made through M3, opened, acted on from M2's menu
 * or its swipe. Spec §2.4 requires preconditions to be built through the
 * app's own paths rather than injected, so every unit that needs a trip comes
 * through here.
 */
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { setDateField } from './ionic'
import { DESKTOP_BREAKPOINT, visiblePage } from './page'

/** Minimum a trip needs to be creatable — the wizard's step-1 gate. */
export interface TripSeed {
  name: string
  /** Optional since FR-2.1b — only the year is required, and it is preselected. */
  endDate?: string
  startDate?: string
  /** Traveler names; each is added as an Adult (FR-2.5). */
  travelers?: string[]
  /**
   * Series name (FR-13.1). First use creates the series via "New
   * series…"; later seeds with the same name pick the existing one.
   */
  series?: string
}

/**
 * Create a trip by driving M3, and return the new trip's path.
 *
 * Spec §2.4 requires preconditions to be built through the app's own
 * mutation paths rather than injected, so every later unit that needs a
 * trip comes through here. Call after `seed`/`seedMode` — it navigates.
 */
export async function createTripViaWizard(page: Page, trip: TripSeed): Promise<string> {
  await page.goto('/trips/new')

  await page.getByTestId('wizard-name').locator('input').fill(trip.name)
  // FR-2.1c: the dates and the series live behind the "More options" row,
  // so a seed that wants them has to open it — one that does not never
  // sees it.
  if (trip.startDate || trip.endDate || trip.series) {
    await page.getByTestId('wizard-more').click()
    if (trip.startDate) {
      await setDateField(page, 'wizard-start-date', trip.startDate)
    }
    if (trip.endDate) {
      await setDateField(page, 'wizard-end-date', trip.endDate)
    }
    if (trip.series) {
      await page.getByTestId('wizard-series').click()
      const popover = page.locator('ion-popover ion-select-popover')
      await expect(popover).toBeVisible()
      // Prefer the existing series of that name; fall back to creating it.
      const existing = popover.locator('ion-item', { hasText: trip.series })
      if (await existing.count()) {
        await existing.click()
      } else {
        await popover.locator('ion-item', { hasText: 'New series' }).click()
        await expect(page.locator('ion-popover')).toHaveCount(0)
        await page.getByTestId('wizard-series-name').locator('input').fill(trip.series)
      }
      await expect(page.locator('ion-popover')).toHaveCount(0)
    }
  }
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  for (const name of trip.travelers ?? []) {
    await page.getByTestId('wizard-add-traveler').click()
    await page.getByTestId('wizard-traveler-name').last().locator('input').fill(name)
  }
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()

  // M4 has opened on the new trip; its path is the handle later steps need.
  await expectTripOpen(page, trip.name)
  return new URL(page.url()).pathname
}

/**
 * M4 is open on the named trip.
 *
 * Which element carries the name depends on the width (UI-Spec M4,
 * 2026-08-19): below the breakpoint the app bar has no room for it — the
 * G-12 cluster left 54 px and it rendered as "S…" — so M4 registers no title
 * and its header line leads with the name; above it the bar takes the title
 * back and the line drops the name rather than printing it twice. The helper
 * asks the viewport rather than trying both, so a missing name fails instead
 * of being satisfied by the other half.
 *
 * The header-line branch is scoped to the *painted* page: that name lives
 * inside the router outlet, where Ionic keeps the outgoing page mounted
 * through a transition, so an unscoped match can read the trip being left.
 */
export async function expectTripOpen(page: Page, name: string) {
  const width = page.viewportSize()?.width ?? DESKTOP_BREAKPOINT
  if (width >= DESKTOP_BREAKPOINT) {
    await expect(page.getByTestId('header-title')).toHaveText(name)
  } else {
    await expect(visiblePage(page).getByTestId('m4-trip-name')).toHaveText(name)
  }
}

/**
 * Open the quick-add composer — clicking the ＋ only when it is closed.
 *
 * Since 2026-08-17 the ＋ hides while the composer is open (FR-25.13a): it
 * would open what is already open. The composer also *stays* open after an add
 * (FR-25.13), so a loop that adds three items must not tap the ＋ three times —
 * it would wait forever on the second. Tests that add in a loop go through
 * here; the guard is the same one `addPosition` has always had.
 */
export async function openQuickAdd(page: Page, fab: 'm4-fab' | 'm8-fab' = 'm4-fab') {
  const input = visiblePage(page).getByTestId('quick-add-input')
  if (await input.isVisible().catch(() => false)) return
  await visiblePage(page).getByTestId(fab).click()
  await expect(input).toBeVisible()
}

/**
 * M3, picking one group as the trip's only source (FR-27.4). Returns the
 * trip's path.
 *
 * Shared rather than per-spec: "a trip that follows a group" is the premise of
 * the refresh, of ADR-015's restore and of everything else built on FR-27.4,
 * and three copies of the wizard walk would drift apart.
 */
export async function createTripFollowingGroup(
  page: Page,
  name: string,
  group: string,
): Promise<string> {
  await page.goto('/trips/new')
  await page.getByTestId('wizard-name').locator('input').fill(name)
  await expect(page.getByTestId('wizard-next')).not.toHaveAttribute('aria-disabled', 'true')
  await page.getByTestId('wizard-next').click()
  await expect(page.getByTestId('wizard-step-2')).toBeVisible()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-3')).toBeVisible()
  await visiblePage(page)
    .getByTestId('wizard-section-groups')
    .locator('ion-item')
    .filter({ hasText: group })
    .first()
    .locator('ion-checkbox')
    .click()
  await page.getByTestId('wizard-next').click()

  await expect(page.getByTestId('wizard-step-4')).toBeVisible()
  await page.getByTestId('wizard-create').click()
  await expectTripOpen(page, name)
  return new URL(page.url()).pathname
}

/**
 * The M4 bar's once-per-trip actions live behind the ⋮ since UX-13 (G-12):
 * *Trip properties* and the one lifecycle step. Six specs used to click
 * their glyphs directly, so the move is absorbed here rather than in each
 * of them — and the next change to the cluster has one caller again.
 */
export const TRIP_ACTION = {
  edit: 'Trip properties',
  start: 'Start trip',
  archive: 'Finish trip',
} as const

/** Open the bar's ⋮ and return it, settled and readable. */
async function openTripMenu(page: Page) {
  await page.getByTestId('header-overflow').click()
  const sheet = page.locator('ion-action-sheet')
  await expect(sheet).toBeVisible()
  return sheet
}

/** Run one of M4's overflow actions through the menu the user sees. */
export async function tripAction(page: Page, action: keyof typeof TRIP_ACTION) {
  const sheet = await openTripMenu(page)
  await sheet.getByText(TRIP_ACTION[action], { exact: true }).click()
  // The dismissal belongs to the interaction: a sheet still on screen
  // swallows the next click, which surfaces as an unrelated timeout.
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}

/**
 * What the menu offers right now — the readable form of "is this action
 * available?". Returns the entries so an *absence* is asserted against a
 * list that is demonstrably populated, never against a menu that failed
 * to open.
 */
export async function tripActions(page: Page): Promise<string[]> {
  const sheet = await openTripMenu(page)
  const labels = await sheet.locator('.action-sheet-button-inner').allInnerTexts()
  await page.keyboard.press('Escape')
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
  return labels.map((l) => l.trim())
}

/**
 * That an action is offered — the settled signal the lifecycle cases used
 * to take from the glyph pair swapping. Reads the whole menu, so the
 * assertion sits on a list that is demonstrably there.
 */
export async function expectTripActionOffered(page: Page, action: keyof typeof TRIP_ACTION) {
  expect(await tripActions(page)).toContain(TRIP_ACTION[action])
}

/** And that one is not — against the same populated list. */
export async function expectTripActionAbsent(page: Page, action: keyof typeof TRIP_ACTION) {
  const offered = await tripActions(page)
  expect(offered.length).toBeGreaterThan(0)
  expect(offered).not.toContain(TRIP_ACTION[action])
}

/**
 * M2's per-row actions live behind the slide gesture (FR-4.5, FR-18.3), and
 * until 2026-08-30 no test had ever operated one — the Share entry was
 * asserted as present in the DOM and nothing else. Opened through the
 * element's own `open()` rather than by simulating a drag: how far and how
 * fast a swipe has to travel is the animation's business, and a test that
 * has to guess it is a test that can miss for reasons that are not the rule.
 */
export async function openTripSwipe(page: Page, trip: string) {
  const sliding = visiblePage(page)
    .locator('ion-item-sliding')
    .filter({ has: page.getByTestId(`trip-row-${trip}`) })
  await expect(sliding).toHaveCount(1)
  await sliding.evaluate((el) =>
    (el as unknown as { open(side: string): Promise<void> }).open('end'),
  )
  return sliding
}

/**
 * What that row offers right now, by the names the user reads. Returns the
 * whole list so an *absence* — G-8's omitted Share, a non-owner's missing
 * Delete — is asserted against options that are demonstrably there.
 */
export async function tripSwipeActions(page: Page, trip: string): Promise<string[]> {
  const sliding = await openTripSwipe(page, trip)
  return sliding
    .locator('ion-item-option')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label') ?? ''))
}
