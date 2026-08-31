import { readFile } from 'node:fs/promises'

import {
  test,
  expect,
  createTripViaWizard,
  openQuickAdd,
  setDateField,
  tripAction,
  expectTripActionOffered,
} from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Global navigation and the app bar (UI-Test-Spec §3: G-1, G-9, G-12).
 *
 * These exist because every one of them broke in a way the per-screen
 * suites could not see: the URL changed while the previous screen stayed
 * on the display, `‹ back` left the packing list showing, and one
 * screen's search icon went on filtering that screen after the user had
 * left it. A green M3 and M4 unit said nothing about any of it.
 *
 * The shape of every assertion is therefore the same and is the point:
 * **assert what is rendered, never only the URL.** A route change that
 * does not repaint is precisely the class of defect being guarded.
 */

const TRIP = { name: 'Samedan Sommer', endDate: '2026-12-31' }

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 400, height: 860 }

/**
 * An element, but only where it sits on a screen the user can see.
 *
 * A locator rather than a read, deliberately: `expect` retries this while
 * Ionic finishes its transition, where a one-shot read would assert
 * against whichever frame it happened to catch — the timing dependency
 * the project forbids anywhere in its suites.
 */
function onVisibleScreen(page: Page, testid: string) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)').getByTestId(testid)
}

/**
 * The *path* the app settled on, never the whole URL.
 *
 * `toHaveURL(/\/tabs\/trips$/)` also matches a URL whose **query** ends
 * that way — which is exactly how the first version of E2E-G9-12 passed
 * against the unfixed build, now that a route can carry `?from=/tabs/trips`.
 * A predicate keeps Playwright's retry while comparing the one part that
 * identifies the screen.
 */
function atPath(page: Page, path: string) {
  return expect(page).toHaveURL((url) => url.pathname === path)
}

/**
 * Every page the outlet is currently showing. Ionic marks the ones it has
 * stacked away with `ion-page-hidden`, so a healthy outlet shows exactly
 * one and a leaked stack shows more — which is the only way to see the
 * ADR-012 defect from outside, since the URL is right either way.
 */
const ANCHOR_RUN = ['trips', 'templates', 'items', 'trips', 'dashboard', 'trips'] as const

function visiblePages(page: Page) {
  return page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')
}

test.describe('Global navigation @local @g9 @g1 @g12', () => {
  test.beforeEach(async ({ seedMode }) => {
    await seedMode({ mode: 'local' })
  })

  // E2E-G9-09 (G-9): the desktop rail. The regression it guards left the
  // outgoing screen painted while the URL had already moved on.
  test('E2E-G9-09: the desktop rail navigates, and the target screen is the one rendered', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/dashboard')
    await expect(page.getByTestId('rail-trips')).toBeVisible()

    await page.getByTestId('rail-trips').click()

    await expect(page).toHaveURL(/\/tabs\/trips$/)
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()
  })

  /**
   * E2E-G9-17 (G-9/ADR-012): an anchor switch survives being interrupted
   * by the next one.
   *
   * Each anchor was a plain `<router-link>`, so every switch **pushed** —
   * and a push interrupted mid-transition leaves both pages live. Measured
   * 2026-08-31: tapping items → trips → templates → items → trips without
   * waiting leaves M7's page at z-index 101 over M2's at 100, while the URL
   * says `/tabs/trips`; every tap on the screen the user is looking at goes
   * to the one two anchors ago. Waiting for each transition hides it
   * completely, which is why E2E-G9-09 and E2E-G1-01 — one settled switch
   * each — could not see it.
   *
   * The case therefore taps as a person does, without waiting, and asserts
   * a **settled** outcome afterwards: the number of pages the outlet is
   * showing. Not a race — the count is read once the URL has arrived, and
   * an interrupted push leaves its extra page there for good.
   */
  test('E2E-G9-17: switching anchors on the rail leaves one page in the outlet', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/items')
    await expect(visiblePages(page)).toHaveCount(1)

    // No settling between taps — that is the case. `noWaitAfter` keeps
    // Playwright from doing the waiting the user does not do either.
    for (const anchor of ANCHOR_RUN) {
      await page.getByTestId(`rail-${anchor}`).click({ noWaitAfter: true })
      await page.waitForFunction((a) => location.pathname === `/tabs/${a}`, anchor)
    }
    await expect(page).toHaveURL(/\/tabs\/trips$/)
    await expect(visiblePages(page)).toHaveCount(1)

    // The positive signal the count stands against: the screen the URL
    // names is not merely alone, it still answers a tap. Against the
    // unfixed build this click is intercepted by a page two anchors old.
    await onVisibleScreen(page, 'm2-spreadsheet-import').click()
    await expect(page).toHaveURL(/\/import(\?|$)/)
  })

  // E2E-G1-06 (G-1): the same rule on the other side of the breakpoint.
  // One rule expressed in two templates needs two cases — the bar and the
  // rail render from one anchor list but navigate through their own markup.
  test('E2E-G1-06: switching anchors on the tab bar leaves one page in the outlet', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/items')
    await expect(visiblePages(page)).toHaveCount(1)

    for (const anchor of ANCHOR_RUN) {
      await page.getByTestId(`tab-${anchor}`).click({ noWaitAfter: true })
      await page.waitForFunction((a) => location.pathname === `/tabs/${a}`, anchor)
    }
    await expect(page).toHaveURL(/\/tabs\/trips$/)
    await expect(visiblePages(page)).toHaveCount(1)

    await onVisibleScreen(page, 'm2-spreadsheet-import').click()
    await expect(page).toHaveURL(/\/import(\?|$)/)
  })

  // E2E-G1-01 (G-1): below the breakpoint the same four anchors are the
  // bottom bar. Mobile had no way between them at all.
  test('E2E-G1-01: the mobile tab bar carries the four anchors and navigates', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/dashboard')

    await expect(page.getByTestId('rail-trips')).toBeHidden()
    for (const anchor of ['dashboard', 'trips', 'templates', 'items']) {
      await expect(page.getByTestId(`tab-${anchor}`)).toBeVisible()
    }

    await page.getByTestId('tab-items').click()
    await expect(page).toHaveURL(/\/tabs\/items$/)
    await expect(page.getByTestId('tab-items')).toBeVisible()
  })

  // E2E-G1-02 (§3.25): M4 is full-screen to win list height — and is the
  // only screen that hides the bar, because `‹ back` is what leads out.
  test('E2E-G1-02: the tab bar hides on the packing list and nowhere else', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await createTripViaWizard(page, TRIP)

    await expect(page.getByTestId('m4-header')).toBeVisible()
    await expect(page.getByTestId('tab-trips')).toBeHidden()

    await page.getByTestId('header-back').click()
    await expect(page.getByTestId('tab-trips')).toBeVisible()
  })

  // E2E-G1-03 (G-1, ADR-012): "nowhere else" above is the whole rule, and
  // the rule was over-applied — `/trips/new` matched the same shape as
  // `/trips/:id`, so the wizard silently lost its anchors too. Its own
  // screen, because M3 is where a first-time user starts.
  test('E2E-G1-03: the trip wizard keeps the tab bar — only the packing list drops it', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/trips')

    await page.getByTestId('trips-new').click()

    await expect(onVisibleScreen(page, 'wizard-step-1')).toBeVisible()
    await expect(page.getByTestId('tab-trips')).toBeVisible()
  })

  // E2E-G9-10 (ADR-011): back is the way out of a drill-down, so it has
  // to *land*. It moved the URL and left the packing list on screen.
  test('E2E-G9-10: back from the packing list renders the trip list', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await createTripViaWizard(page, TRIP)

    await page.getByTestId('header-back').click()

    await expect(page).toHaveURL(/\/tabs\/trips$/)
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()
    // Nothing of the screen just left may still be on the bar (G-12).
    await expect(page.getByTestId('m4-search')).toHaveCount(0)
    await expect(page.getByTestId('m4-filter')).toHaveCount(0)
  })

  // E2E-G9-11 (G-12, ADR-011): M11 is reached from the packing list's
  // app-bar cluster and left by back. The M11 unit exercises the screen;
  // this owns getting *to* and *from* it — the class of defect the working
  // agreement added this file for, after four navigation bugs that both
  // green screen suites had missed.
  test('E2E-G9-11: the luggage button reaches the containers and back returns', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await createTripViaWizard(page, TRIP)

    await onVisibleScreen(page, 'm4-nav-luggage').click()
    await expect(onVisibleScreen(page, 'm11-fab')).toBeVisible()
    // The bar belongs to the screen now shown, not the one that left (G-12).
    await expect(page.getByTestId('m4-search')).toHaveCount(0)
    await expect(page.getByTestId('m4-filter')).toHaveCount(0)

    // The title slot switches with the screen too (G-9, 2026-08-19): the
    // registry is keyed per path, and a stale entry would leave M11's title
    // standing on the packing list after back.
    await expect(page.getByTestId('header-title')).toContainText('Luggage')

    await page.getByTestId('header-back').click()
    await expect(onVisibleScreen(page, 'm4-fab')).toBeVisible()
    // …and coming back restores it, rather than leaving a bar with nothing
    // behind it.
    await expect(page.getByTestId('m4-nav-luggage')).toBeVisible()
    await expect(page.getByTestId('m11-fab')).toHaveCount(0)
    // …the title with it. This runs at the desktop width, where M4 does have
    // one; the *absence* below the breakpoint is E2E-M4-44's half.
    await expect(page.getByTestId('header-title')).toHaveText(TRIP.name)
  })

  // E2E-G12-01 (G-12, FR-25.11k): the magnifier searches the screen the
  // user is on. It used to keep filtering the one they had left.
  test('E2E-G12-01: the magnifier searches the current screen', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await createTripViaWizard(page, TRIP)
    await page.getByTestId('header-back').click()
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()

    // The wizard leaves a *planning* trip, and the list opens on Active.
    await page.getByTestId('trips-filter-planned').click()
    await expect(page.getByTestId('trip-row-Samedan Sommer')).toBeVisible()

    await page.getByTestId('search').click()
    const field = onVisibleScreen(page, 'trips-search-input')
    await expect(field).toBeVisible()

    await field.fill('Samedan')
    await expect(page.getByTestId('trip-row-Samedan Sommer')).toBeVisible()

    await field.fill('Kajakwoche')
    await expect(page.getByTestId('trip-row-Samedan Sommer')).toHaveCount(0)
  })

  // E2E-G12-02: the same mechanism on a second screen, so "current
  // context" is a property of the pattern rather than of one page.
  test('E2E-G12-02: the magnifier travels to the item inventory and searches it there', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/items')

    await page.getByTestId('search').click()
    await expect(onVisibleScreen(page, 'items-search-input')).toBeVisible()
    // The trip list's field belongs to the trip list, not to this screen.
    await expect(page.getByTestId('trips-search-input')).toHaveCount(0)
  })

  // E2E-M4-32: a cold boot straight into M4. The teleported app-bar
  // actions crashed the render mid-patch, and an empty list read as lost
  // data — the rows were in IndexedDB the whole time.
  test('E2E-M4-32: a reload straight into the packing list still shows its rows', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    const path = await createTripViaWizard(page, TRIP)
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill('Zelt')
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()

    // Wait for the *state*, never for a duration: the indicator returns
    // to "on this device" when the IndexedDB write has actually landed
    // (FR-19.2), which is the thing a reload depends on.
    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
    await page.goto(path)

    await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
    await expect(page.getByTestId('m4-progress')).toContainText('0/1')
  })

  // E2E-M3-15 (FR-2.1b): a trip needs only its year. The wizard's step 1
  // must let you through with a name alone — the year is preselected —
  // and the trip then reads by its year where a date would have stood.
  test('E2E-M3-15: a trip can be created with no dates at all', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/trips/new')

    await page.getByTestId('wizard-name').locator('input').fill('Samedan irgendwann')
    // No date touched anywhere: straight through the wizard.
    await expect(page.getByTestId('wizard-next')).toBeEnabled()
    await page.getByTestId('wizard-next').click()
    await expect(page.getByTestId('wizard-step-2')).toBeVisible()
    await page.getByTestId('wizard-next').click()
    await page.getByTestId('wizard-next').click()
    await page.getByTestId('wizard-create').click()

    await expect(page.getByTestId('m4-header')).toBeVisible()

    // In the list it is named by its year, since nothing finer is known.
    await page.getByTestId('header-back').click()
    await page.getByTestId('trips-filter-planned').click()
    const row = page.getByTestId('trip-row-Samedan irgendwann')
    await expect(row).toBeVisible()
    await expect(row.getByTestId('trip-when')).toHaveText(String(new Date().getFullYear()))
  })

  // E2E-M3-16 (FR-2.1c): step 1 shows what it requires and folds the rest
  // away, but never hides *state*: a set value appears on the folded row.
  test('E2E-M3-16: the optional trip fields are folded, and say so when set', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/trips/new')

    // Folded: the optional inputs are absent, not merely invisible.
    await expect(page.getByTestId('wizard-start-date')).toHaveCount(0)
    await expect(page.getByTestId('wizard-more-summary')).toBeVisible()

    await page.getByTestId('wizard-more').click()
    await setDateField(page, 'wizard-end-date', '2026-09-20')
    await page.getByTestId('wizard-more').click()

    // Folded again — with what was set now stated on the row itself.
    await expect(page.getByTestId('wizard-end-date')).toHaveCount(0)
    await expect(page.getByTestId('wizard-more-summary')).toContainText('Sep 20, 2026')
  })

  // E2E-G2-02 (G-2/FR-19.6): the glyph used to be a symbol with nothing
  // behind it — tapping it navigated to a trip's conflict log when a trip
  // happened to be open, and did nothing at all anywhere else. Here there is
  // no trip, which is exactly where it used to be silent.
  test('E2E-G2-02: the sync glyph explains its state on any screen', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/trips')

    // The distinct device glyph is half of what G-2 promises in this mode —
    // the detail is what the other half is *behind*.
    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')
    await page.getByTestId('sync-indicator').click()

    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('sync-detail-title')).toHaveText('On this device')
    await expect(sheet.getByTestId('sync-detail-explain')).toContainText('no server')
    // Local Mode has one writer, so the conflict log must not be offered.
    await expect(sheet.getByTestId('sync-detail-conflicts')).toHaveCount(0)
    // NFR-4.11: the storage section is the point of the Local Mode detail.
    await expect(sheet.getByTestId('sync-detail-storage')).toBeVisible()

    await sheet.getByTestId('sync-detail-close').click()
    await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
  })

  // E2E-G2-03 (FR-19.6/NFR-4.11): the one-tap backup. In Local Mode this
  // file is the only copy of everything, so the assertion is the download
  // itself plus the sheet then saying a backup exists.
  test('E2E-G2-03: the storage detail backs the device up in one tap', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await createTripViaWizard(page, TRIP)
    // The write has to have landed before it can be in a backup (FR-19.2).
    await expect(page.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'local')

    await page.getByTestId('sync-indicator').click()
    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet.getByTestId('sync-detail-backup-age')).toHaveText('Never backed up')

    const downloadPromise = page.waitForEvent('download')
    await sheet.getByTestId('sync-detail-backup').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^jitpack-backup-\d{4}-\d{2}-\d{2}\.yaml$/)

    // Read the file, not just its name: "holds every trip and template" is the
    // promise, and a correctly named empty file would keep every other
    // assertion here green while losing the user's data.
    const path = await download.path()
    const backup = await readFile(path, 'utf8')
    expect(backup).toContain('kind: trip')
    expect(backup).toContain(TRIP.name)

    // The stamp is what the FR-19.6 reminder reads later, so it is part of
    // the behaviour rather than an implementation detail.
    await expect(sheet.getByTestId('sync-detail-backup-age')).toHaveText('Last backup today')
  })

  /*
   * E2E-G2-08 (G-2): the sheet's state glyph is centred on its title.
   *
   * It was not: `.head` aligned the 38px circle to the top of the title
   * *block*, and the h1 inside carried a 20px top margin nothing had asked
   * for — `.jp-sheet-title` names a type role and no spacing at all. The
   * circle therefore rode half a line high on every screen that can open the
   * sheet, in every mode.
   *
   * Geometry rather than a visual baseline, deliberately: a baseline reports
   * that a pixel moved, this reports which rule broke. The baseline added
   * beside it guards the rest of the sheet.
   */
  test('E2E-G2-08: the sheet glyph is centred on its title', async ({ page }) => {
    // The width every design decision is made against; the offset is
    // width-independent, but the number below is not a desktop artefact.
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/trips')
    await page.getByTestId('sync-indicator').click()

    const sheet = page.getByTestId('sync-detail-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('sync-detail-glyph')).toBeVisible()
    // The display face is self-hosted: measuring before it resolves would
    // measure the fallback's line box. A settled state, not a wait.
    await page.evaluate(() => document.fonts.ready)

    const offset = await sheet.evaluate((el) => {
      const glyph = el.querySelector('[data-testid="sync-detail-glyph"]')!.getBoundingClientRect()
      const title = el.querySelector('h1')!
      // The first line's own box, which is what the eye pairs the circle
      // with — not the h1's border box, which includes any leading.
      const range = document.createRange()
      range.selectNodeContents(title)
      const line = range.getClientRects()[0]!
      return glyph.top + glyph.height / 2 - (line.top + line.height / 2)
    })

    // One CSS pixel of half-leading is invisible; half a line is not.
    expect(Math.abs(offset)).toBeLessThanOrEqual(2)
  })

  /*
   * E2E-G2-09 (G-7): the master log's empty state is inset like every other
   * empty state in the app.
   *
   * `.empty-state` here was copied from the house pattern without its
   * `padding` and `text-align`, which nothing noticed while the only string
   * it held was short enough to fit one line and shrink-to-fit looked
   * centred. The master log's sentence names three things and wraps, and the
   * wrapped paragraph then ran from edge to edge under a centred icon.
   *
   * Driven in Local Mode and by URL rather than through the sheet: the mode
   * has no server, so `fetchMasterConflicts` answers `[]` and the empty state
   * is reached without a backend and without depending on a shared database
   * being empty. The button that leads here is server-only by design (G-8).
   */
  test('E2E-G2-09: the empty master conflict log is inset from both edges', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/master/conflicts')

    const empty = page.getByTestId('conflict-empty')
    await expect(empty).toBeVisible()
    const paragraph = empty.locator('p')
    // The long sentence is the whole point: a short one would fit one line
    // and pass against the unfixed build.
    await expect(paragraph).toContainText('inventory')
    await page.evaluate(() => document.fonts.ready)

    const box = (await paragraph.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(16)
    expect(MOBILE.width - (box.x + box.width)).toBeGreaterThanOrEqual(16)
  })

  // E2E-G8-02: the dev sample-trip seed is a development affordance, not
  // Demo Mode returning. This suite runs the production build, where it
  // must not exist at all.
  test('E2E-G8-02: no dev seeding affordance exists in a production build', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/trips')

    await expect(page.getByTestId('trips-new')).toBeVisible()
    await expect(page.getByTestId('dev-sample-trip')).toHaveCount(0)
  })

  /*
   * FR-2.7's screen is reached from M4's G-12 cluster, so getting there and
   * back is a global-pattern behaviour rather than something the M22 unit can
   * speak for. The rule exists because four navigation defects survived two
   * green screen suites: a route that changes without repainting, and a back
   * chevron that leaves the previous screen on the display.
   */
  test('E2E-M22-06: the trip editor is reached from M4 and gives the trip back', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    const trip = await createTripViaWizard(page, TRIP)

    await tripAction(page, 'edit')
    // The painted screen, not the URL: a route change that does not repaint
    // keeps every URL assertion green.
    await expect(onVisibleScreen(page, 'trip-edit-name')).toBeVisible()
    await expect(page.getByTestId('header-title')).toHaveText('Trip properties')

    await page.getByTestId('header-back').click()
    // Back leads to the trip it was opened from — the ADR-011 declared parent,
    // not whatever the history happens to hold.
    await expect(page).toHaveURL(new RegExp(`${trip}$`))
    await expect(onVisibleScreen(page, 'm4-fab')).toBeVisible()
    // And the app bar belongs to M4 again: below the breakpoint that screen
    // registers no title, so its own actions are the positive signal.
    await expectTripActionOffered(page, 'edit')
    await expect(onVisibleScreen(page, 'trip-edit-name')).toHaveCount(0)
  })
  /*
   * E2E-G1-04 (G-1, ADR-011 amendment): the owner's symptom. The gear is
   * offered on every screen, so /tabs/settings cannot name one parent that
   * is true — it declared /tabs/dashboard, and the chevron carried the user
   * out of their trip. The route now records where it was entered from.
   */
  test('E2E-G1-04: the gear opened inside a trip gives the trip back', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    const trip = await createTripViaWizard(page, TRIP)

    await page.getByTestId('header-settings').click()
    await expect(onVisibleScreen(page, 'settings-language')).toBeVisible()

    await page.getByTestId('header-back').click()

    await atPath(page, trip)
    // Rendered, not routed: M4's own FAB is the positive signal that the
    // packing list is the screen on the display, and the settings control
    // is the negative one — a screen that stayed would still show it.
    await expect(onVisibleScreen(page, 'm4-fab')).toBeVisible()
    await expect(page.getByTestId('settings-language')).toHaveCount(0)
  })

  /*
   * E2E-G1-05: the other half, and the one that keeps the fix from being a
   * blanket "back = history". A cold start straight into settings has no
   * origin at all — the case ADR-011 decoupled back from history for — and
   * the declared parent has to answer.
   */
  test('E2E-G1-05: settings opened cold falls back to its declared parent', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/settings')
    await expect(onVisibleScreen(page, 'settings-language')).toBeVisible()

    await page.getByTestId('header-back').click()

    await atPath(page, '/tabs/dashboard')
    await expect(onVisibleScreen(page, 'dashboard-greeting')).toBeVisible()
  })

  /*
   * E2E-G9-12 (Navigation_Concept §7, the "flows" class): §7 promised a flow
   * returns to the origin it was entered from and nothing implemented it.
   * M18 is entered from M2, M7 and Settings while declaring /tabs/settings —
   * so from the trip list the chevron used to land in Settings.
   */
  test('E2E-G9-12: the portable import entered from the trip list returns to it', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/trips')
    await expect(onVisibleScreen(page, 'm2-portable-import')).toBeVisible()

    await page.getByTestId('m2-portable-import').click()
    await expect(onVisibleScreen(page, 'portable-paste')).toBeVisible()

    await page.getByTestId('header-back').click()

    await atPath(page, '/tabs/trips')
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()
    // Not `onVisibleScreen`: the declared parent was Settings, and a page
    // left mounted mid-transition is briefly not hidden either. The
    // settings control existing anywhere at all is the discriminator.
    await expect(page.getByTestId('settings-language')).toHaveCount(0)
  })

  /**
   * E2E-G9-13 (Navigation_Concept §7): the same contract for the *other*
   * import. M15 is entered from M2 and from M9's empty state and declares
   * one parent like M18 does, so it is the same shape — and until this PR
   * touched M15 it had no e2e case of any kind to notice with.
   */
  test('E2E-G9-13: the spreadsheet import entered from the trip list returns to it', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/trips')
    await expect(onVisibleScreen(page, 'm2-spreadsheet-import')).toBeVisible()

    await page.getByTestId('m2-spreadsheet-import').click()
    await expect(onVisibleScreen(page, 'import-paste')).toBeVisible()

    await page.getByTestId('header-back').click()

    await atPath(page, '/tabs/trips')
    await expect(onVisibleScreen(page, 'trips-new')).toBeVisible()
    // The declared parent is the inventory, so that is where a chevron
    // without the origin lands; its empty state existing anywhere at all is
    // the discriminator, for the same mid-transition reason as G9-12.
    await expect(page.getByTestId('m9-empty')).toHaveCount(0)
  })

  /**
   * E2E-G9-14 (FR-24.3, M23): the same contract for the newest screen of
   * this class. M23 is reached from Settings and declares `/tabs/settings`
   * as its parent, so the interesting half is the app bar — the screen owns
   * no title of its own and relies entirely on the one header bar naming it
   * (ADR-011), which is exactly the promise a route added without a
   * `titleKey` breaks silently.
   */
  test('E2E-G9-14: the hidden-rows screen is named by the app bar and returns to settings', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/settings')
    await expect(onVisibleScreen(page, 'settings-retired')).toBeVisible()

    await onVisibleScreen(page, 'settings-retired').click()

    await atPath(page, '/master/retired')
    await expect(onVisibleScreen(page, 'm23-segment')).toBeVisible()
    // The screen renders no heading of its own, so this is the only place
    // the user is told what they are looking at.
    await expect(page.getByTestId('header-title')).toHaveText('Hidden master data')

    await page.getByTestId('header-back').click()

    await atPath(page, '/tabs/settings')
    await expect(onVisibleScreen(page, 'settings-language')).toBeVisible()
    // And the bar goes back to naming Settings rather than keeping the
    // title of the screen that has been left.
    await expect(page.getByTestId('header-title')).toHaveText('Settings')
  })

  /*
   * E2E-G9-15 (G-9): the gear is on every screen except the one it opens.
   * On M17 it pointed at the page the user was already on (UX review
   * 2026-08-25, UX-16).
   */
  test('E2E-G9-15: the settings gear is everywhere but on settings itself', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/tabs/dashboard')
    await expect(onVisibleScreen(page, 'dashboard-greeting')).toBeVisible()
    await expect(page.getByTestId('header-settings')).toBeVisible()

    await page.getByTestId('header-settings').click()

    // Rendered, not routed: the settings screen is on the display, and the
    // gear — which would only reopen it — is gone from the bar.
    await expect(onVisibleScreen(page, 'settings-language')).toBeVisible()
    await expect(page.getByTestId('header-settings')).toHaveCount(0)
  })

  /*
   * E2E-G9-16 (G-9): on a wide screen the content stops at a column.
   * Edge to edge, a settings row put its label and its control 1100 px
   * apart and the M9 tag segment spread three chips across 1176 px — a
   * line nobody can read as one thing (UX review 2026-08-25, UX-17).
   */
  test('E2E-G9-16: wide screens get a content column, narrow ones the full width', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/tabs/settings')
    // A block that spans whatever the content is given — a section heading,
    // not a control that would sit at one edge whatever the width is.
    const row = onVisibleScreen(page, 'settings-section-appearance')
    await expect(row).toBeVisible()

    const wide = (await row.boundingBox())!
    // Capped: the row is far narrower than the area it sits in…
    expect(wide.width).toBeLessThan(DESKTOP.width - 200)
    // …and centred in it, rather than parked against the nav rail. The
    // gutters are measured against the content area (the rail is outside
    // it), so they are equal to within a pixel of rounding.
    const area = (await page.locator('.app-content').boundingBox())!
    const left = wide.x - area.x
    const right = area.x + area.width - (wide.x + wide.width)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)

    // The phone keeps every pixel it has: the cap must not become a
    // margin on the screen the app is actually built for.
    await page.setViewportSize(MOBILE)
    await expect(row).toBeVisible()
    const narrow = (await row.boundingBox())!
    expect(narrow.width).toBeGreaterThan(MOBILE.width - 60)
  })
})
