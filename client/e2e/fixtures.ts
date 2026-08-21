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
}

/** Seed the app's localStorage before it boots. Call before `page.goto`. */
export async function seed(page: Page, opts: SeedOptions): Promise<void> {
  await page.addInitScript((o: SeedOptions) => {
    if (o.mode) localStorage.setItem('jitpack_mode', o.mode)
    if (o.serverUrl) localStorage.setItem('jitpack_server_url', o.serverUrl)
    // Literal, not the exported constant: addInitScript serialises this
    // function, so a closure variable would be undefined in the page.
    if (o.theme) localStorage.setItem('jitpack_theme', o.theme)
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
      await page.getByTestId('wizard-start-date').locator('input').fill(trip.startDate)
    }
    if (trip.endDate) {
      await page.getByTestId('wizard-end-date').locator('input').fill(trip.endDate)
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

export const test = base.extend<Fixtures>({
  seedMode: async ({ page }, use) => {
    await use((opts: SeedOptions) => seed(page, opts))
  },
})

export { expect }
