import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { Theme } from '../src/theme/theme'

/**
 * Shared E2E fixtures for JIT-Pack (dev-docs/UI_Test_Spec_v1.0.md §2.4).
 *
 * Run modes are selected by seeding the same localStorage keys the app
 * itself writes (see src/config.ts, src/App.vue) *before* the first
 * navigation, via `addInitScript`. Playwright gives each test an
 * isolated browser context, so there is no storage bleed between tests
 * and no manual clearing is needed.
 *
 * Backend-backed helpers (starting jitpackd, a mock IdP, seeding
 * OIDC tokens for the `server` multi-client cases) will extend this
 * file in later milestones; the scaffold ships only the backend-free
 * seeding used by the smoke path.
 */

export type Mode = 'local' | 'server'

export interface SeedOptions {
  /** Persisted `jitpack_mode`. Omit to leave first-launch (M19) showing. */
  mode?: Mode
  /** `jitpack_server_url` for Server / Single-User mode. */
  serverUrl?: string
  /**
   * Device-local theme preference (`jitpack_theme`).
   *
   * These are the values `readTheme` actually recognises. It used to read
   * `'dark' | 'light'`, which nothing in the app matches — anything but
   * `'latte'` resolves to Mocha, so seeding a light theme silently gave a
   * dark one and any case built on it would have been false-green.
   */
  theme?: Theme
  /**
   * App language (`jitpack_locale`). Defaults to English, and that default is
   * load-bearing rather than incidental: the browser locale is `de-CH` so the
   * suite runs on the device the family holds, and without this the app would
   * follow `navigator.languages` into German and every English assertion in
   * the suite would fail. A case that wants the German UI asks for it.
   */
  locale?: 'en' | 'de'
}

/** Seed the app's localStorage before it boots. Call before `page.goto`. */
export async function seed(page: Page, opts: SeedOptions): Promise<void> {
  await page.addInitScript((o: SeedOptions) => {
    if (o.mode) localStorage.setItem('jitpack_mode', o.mode)
    if (o.serverUrl) localStorage.setItem('jitpack_server_url', o.serverUrl)
    // Literal, not the exported constant: addInitScript serialises this
    // function, so a closure variable would be undefined in the page.
    if (o.theme) localStorage.setItem('jitpack_theme', o.theme)
    // Only when absent. addInitScript runs before *every* navigation, so an
    // unconditional write would re-seed after a reload and overwrite a choice
    // the user made in the app — which is what E2E-M17-10 asserts survives.
    // This is the device's default language, not an override of the app's.
    if (!localStorage.getItem('jitpack_locale')) {
      localStorage.setItem('jitpack_locale', o.locale ?? 'en')
    }
  }, opts)
}

interface Fixtures {
  /** Seed run-mode localStorage for the current test's page. */
  seedMode: (opts: SeedOptions) => Promise<void>
}

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
 * Sets a DateField (ADR-035): opens its picker sheet, walks the calendar to
 * the target month with the header arrows and confirms the day. Replaces the
 * fill() that drove the native date input the field used to be. Every hop
 * asserts the rendered month header, so the walk is bounded and observable —
 * never a wait.
 */
export async function setDateField(page: Page, testid: string, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-').map(Number)
  await page.getByTestId(testid).click()
  const picker = page.getByTestId(`${testid}-picker`)
  await expect(picker).toBeVisible()

  const headerFor = (y: number, m: number) =>
    new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  const monthIndex = (name: string) =>
    Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2000, i, 1)),
    ).indexOf(name) + 1

  const target = headerFor(year, month)
  const MAX_HOPS = 36
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const shown = (await picker.locator('.calendar-month-year').innerText()).trim()
    if (shown === target) break
    if (hop === MAX_HOPS) throw new Error(`date picker never reached ${target}, still at ${shown}`)
    const [shownMonth, shownYear] = shown.split(' ')
    const forward = Number(shownYear) * 12 + monthIndex(shownMonth) < year * 12 + month
    const arrows = picker.locator('.calendar-next-prev ion-button')
    await arrows.nth(forward ? 1 : 0).click()
    await expect(picker.locator('.calendar-month-year')).not.toHaveText(shown)
  }

  // The working (centre) grid is the navigated month; the neighbours can
  // carry the same day as an adjacent-day cell, so the scope matters.
  const cell = picker.locator(
    `.calendar-month:nth-child(2) .calendar-day[data-day="${day}"][data-month="${month}"][data-year="${year}"]`,
  )

  // Dispatched, not clicked at a point. A real click is delivered at
  // coordinates, and the calendar may still be scrolling its grids into
  // place: a point that lands one month over selects the day at the same row
  // and column — 22 August and 26 September 2026 are both the fourth Saturday
  // — and Ionic *confirms* immediately on an adjacent-day cell, so the wrong
  // date is taken silently and surfaces screens later. The day button carries
  // a plain `onClick`, so dispatching removes the coordinates from the
  // question entirely rather than racing them.
  //
  // Enabled is asserted first, because dispatching also bypasses the
  // `disabled` a bound puts on an out-of-range day (FR-2.1d) — the helper
  // must not be able to set what the app refuses to offer.
  await expect(cell).toBeEnabled()
  await cell.dispatchEvent('click')

  await picker.getByText('Done', { exact: true }).click()
  await expect(picker).toBeHidden()
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

/** G-9's breakpoint: the width above which the desktop layout applies. */
export const DESKTOP_BREAKPOINT = 900

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
 * The page that is actually painted. A route change alone proves nothing —
 * a navigation that does not repaint keeps every URL assertion green, and
 * during a transition two `.ion-page` elements exist at once.
 */
export function visiblePage(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

/**
 * Create a template through the app's own path (spec §2.4): M7 FAB → scope
 * chooser → name in the same sheet. Ends on the new template's M8 editor,
 * which is where creating hands over to editing.
 */
export async function createTemplate(page: Page, kind: 'template' | 'group', name: string) {
  await page.getByTestId('m7-fab').click()
  await expect(page.getByTestId('m7-kind-chooser')).toBeVisible()
  await page.getByTestId(`m7-kind-${kind}`).click()

  // FR-27.6 one-surface flow: the name field joins the sheet on the pick.
  const field = page.getByTestId('m7-name-field')
  await expect(field).toBeVisible()
  await field.locator('input').fill(name)
  await page.getByTestId('m7-create-commit').click()

  await expect(page.getByTestId('header-title')).toHaveText(name)
  await expect(visiblePage(page).getByTestId('m8-scope-switch')).toBeVisible()
}

/**
 * Leave M8 for the list the way a user does — the ADR-011 header chevron,
 * which navigates to meta.parent. Not page.goBack(): history-back across the
 * root→tabs outlet boundary trips the known pre-existing Ionic transition
 * defect (see navigation.spec.ts), which on WebKit under full-suite load
 * leaves the outlet wedged over the page and every later tap times out.
 */
export async function backToTemplateList(page: Page) {
  await page.getByTestId('header-back').click()
  await expect(visiblePage(page).getByTestId('m7-fab')).toBeVisible()
  // Settled, not merely arriving: while the outgoing editor is still fading
  // it counts as visible, and M8 shares the `.section-head` grammar with M7 —
  // a one-shot collection over the class would read both pages at once.
  await expect(visiblePage(page).getByTestId('m8-scope-switch')).toHaveCount(0)
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

/** FR-25.13: type into M8's quick-add and commit with Enter. */
export async function addPosition(page: Page, name: string) {
  await openQuickAdd(page, 'm8-fab')
  const input = visiblePage(page).getByTestId('quick-add-input')
  await input.locator('input').fill(name)
  await input.locator('input').press('Enter')
  // The new row is the settled signal — the add is a Local Mode write.
  await expect(
    visiblePage(page).locator('ion-item h2').filter({ hasText: name }).first(),
  ).toBeVisible()
}

/** FR-27.1: include a group into the open Ferien-Vorlage via M8's picker. */
export async function includeGroup(page: Page, groupName: string) {
  await visiblePage(page).getByTestId('m8-include-open').click()
  await visiblePage(page)
    .getByTestId('m8-group-picker')
    .locator('.pick')
    .filter({ hasText: groupName })
    .click()
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

/** Add one position to an existing group, through M7 → M8. */
export async function addToGroup(page: Page, group: string, item: string) {
  await page.goto('/tabs/templates')
  await visiblePage(page).getByTestId('m7-scope-group').click()
  await visiblePage(page).locator('ion-item').filter({ hasText: group }).first().click()
  await expect(page.getByTestId('header-title')).toHaveText(group)
  await addPosition(page, item)
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

export const test = base.extend<Fixtures>({
  seedMode: async ({ page }, use) => {
    await use((opts: SeedOptions) => seed(page, opts))
  },
})

export { expect }
