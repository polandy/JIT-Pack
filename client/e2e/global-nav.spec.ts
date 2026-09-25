import { readFile } from 'node:fs/promises'

import {
  addInComposer,
  test,
  expect,
  createTripViaWizard,
  expectTripOpen,
  openTripFromList,
  openTripView,
  openQuickAdd,
  setDateField,
  tripAction,
  expectTripActionOffered,
  visiblePage,
} from './fixtures'
import type { Page } from '@playwright/test'
import { PATH } from './routes'
import { backToInventory, createItem } from './helpers/m9'

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
const TABLET = { width: 744, height: 1133 } // iPad mini portrait, logical points

/**
 * An element, but only where it sits on a screen the user can see.
 *
 * A locator rather than a read, deliberately: `expect` retries this while
 * Ionic finishes its transition, where a one-shot read would assert
 * against whichever frame it happened to catch — the timing dependency
 * the project forbids anywhere in its suites.
 */
function onVisibleScreen(page: Page, testid: string) {
  return visiblePage(page).getByTestId(testid)
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
 * Close the bar's ⋮ the way a reader does — through its own *Cancel*.
 *
 * Not `Escape`: Ionic ignores a key until the sheet has finished presenting,
 * and a case that has only waited for an entry to render has waited for the
 * markup rather than for the overlay. On a loaded CI shard the key went
 * nowhere and the sheet outlived the assertion after it (E2E-G12-07, twice).
 * A click waits for the button to be actionable, which is that same moment
 * stated as a state instead of hoped for.
 */
async function dismissMenu(page: Page) {
  const sheet = page.locator('ion-action-sheet')
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toHaveCount(0)
}

/**
 * Every page the outlet is currently showing. Ionic marks the ones it has
 * stacked away with `ion-page-hidden`, so a healthy outlet shows exactly
 * one and a leaked stack shows more — which is the only way to see the
 * ADR-012 defect from outside, since the URL is right either way.
 */
const ANCHOR_RUN = ['trips', 'templates', 'items', 'trips', 'dashboard', 'trips'] as const

function visiblePages(page: Page) {
  return visiblePage(page)
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
    await page.goto(PATH.dashboard)
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
    await page.goto(PATH.items)
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
    await page.getByTestId('m2-spreadsheet-import').click()
    await expect(page).toHaveURL(/\/import(\?|$)/)
  })

  // E2E-G1-06 (G-1): the same rule on the other side of the breakpoint.
  // One rule expressed in two templates needs two cases — the bar and the
  // rail render from one anchor list but navigate through their own markup.
  test('E2E-G1-06: switching anchors on the tab bar leaves one page in the outlet', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(PATH.items)
    await expect(visiblePages(page)).toHaveCount(1)

    for (const anchor of ANCHOR_RUN) {
      await page.getByTestId(`tab-${anchor}`).click({ noWaitAfter: true })
      await page.waitForFunction((a) => location.pathname === `/tabs/${a}`, anchor)
    }
    await expect(page).toHaveURL(/\/tabs\/trips$/)
    await expect(visiblePages(page)).toHaveCount(1)

    await page.getByTestId('m2-spreadsheet-import').click()
    await expect(page).toHaveURL(/\/import(\?|$)/)
  })

  // E2E-G1-01 (G-1): below the breakpoint the same four anchors are the
  // bottom bar. Mobile had no way between them at all.
  test('E2E-G1-01: the mobile tab bar carries the four anchors and navigates', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(PATH.dashboard)

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
    await page.goto(PATH.trips)

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

    await openTripView(page, 'luggage')
    await expect(onVisibleScreen(page, 'm11-fab')).toBeVisible()
    // The bar belongs to the screen now shown, not the one that left (G-12).
    await expect(page.getByTestId('m4-search')).toHaveCount(0)
    await expect(page.getByTestId('m4-filter')).toHaveCount(0)

    // The head switches with the screen too (G-9, ADR-050): the registry is
    // keyed per path, and a stale entry would leave M11's name standing on
    // the packing list after back. M11's second line names the trip it
    // belongs to, which is the fact the composed title used to carry.
    await expect(page.getByTestId('header-title')).toHaveText('Luggage')
    await expect(page.getByTestId('header-meta')).toHaveText(TRIP.name)

    await page.getByTestId('header-back').click()
    await expect(onVisibleScreen(page, 'm4-fab')).toBeVisible()
    await expect(page.getByTestId('m11-fab')).toHaveCount(0)
    // …and the head comes back with it, rather than leaving the page unnamed.
    await expect(page.getByTestId('header-title')).toHaveText(TRIP.name)
    await expect(page.getByTestId('header-meta')).toHaveCount(0)
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
  //
  // The second screen was M9 until FR-24.6 took the inventory's field out of
  // the magnifier — the one exception to G-12, and a screen that no longer
  // has the action cannot carry the case for it. M7 is the nearest
  // equivalent: a master-data list with a header search, reached as a tab.
  test('E2E-G12-02: the magnifier travels to the template list and searches it there', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(PATH.templates)

    await page.getByTestId('search').click()
    await expect(onVisibleScreen(page, 'templates-search-input')).toBeVisible()
    // The trip list's field belongs to the trip list, not to this screen.
    await expect(page.getByTestId('trips-search-input')).toHaveCount(0)

    // And the inventory, which no longer registers the action at all, offers
    // its field without one — the exception, asserted where the rule is.
    await page.goto(PATH.items)
    await expect(page.getByTestId('search')).toHaveCount(0)
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
    await addInComposer(page, 'Zelt')
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
    await page.goto(PATH.newTrip)

    await page.getByTestId('wizard-name').locator('input').fill('Samedan irgendwann')
    // No date touched anywhere: straight through the wizard.
    // Reach through to the inner button: `toBeEnabled()` on the ion-button
    // host checks nothing, since a disabled IonButton keeps its host element
    // enabled and only disables the button inside it (see smoke.spec.ts).
    await expect(page.getByTestId('wizard-next').locator('button')).toBeEnabled()
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
    await page.goto(PATH.newTrip)

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
    await page.goto(PATH.trips)

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
  test('E2E-G2-08: the sheet glyph starts on the same line as its title', async ({ page }) => {
    // The width every design decision is made against; the offset is
    // width-independent, but the number below is not a desktop artefact.
    await page.setViewportSize(MOBILE)
    await page.goto(PATH.trips)
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
      return glyph.top - line.top
    })

    // Revised 2026-09-07 (FR-21.12): the shared head sets the lead against
    // the *top* of the title, as the concept prototype draws it — a 38px
    // glyph beside a 27px line cannot also be centred on it. The defect the
    // case was written for is still what it catches: a stray h1 margin
    // pushes the line down and nothing else does.
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
    await page.goto(PATH.masterConflicts)

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

  /*
   * E2E-G7-02 (G-7, U-8): every empty state is the same object, so the inset
   * above is a property of all of them rather than of the screen that was
   * repaired. Ten screens used to spell it themselves in four different ways.
   *
   * Read from the *rendered* box rather than from the source: a vitest gate
   * already refuses a screen that declares its own `.empty-state` rule, and
   * what it cannot see is a global stylesheet overriding the component from
   * outside. Two unrelated screens agreeing is what says the rule survived
   * the cascade — and the numbers are named, because an equality on its own
   * would be just as happy with two screens that both inset by nothing.
   */
  test('E2E-G7-02: two unrelated screens inset their empty state identically', async ({ page }) => {
    await page.setViewportSize(MOBILE)

    const insetOf = async (path: string, testid: string) => {
      await page.goto(path)
      const empty = visiblePage(page).getByTestId(testid)
      await expect(empty).toBeVisible()
      return empty.evaluate((node) => {
        const style = getComputedStyle(node)
        return { top: style.paddingTop, left: style.paddingLeft, right: style.paddingRight }
      })
    }

    const master = await insetOf(PATH.masterConflicts, 'conflict-empty')
    const inventory = await insetOf(PATH.items, 'm9-empty')

    expect(master).toEqual({ top: '48px', left: '24px', right: '24px' })
    expect(inventory).toEqual(master)
  })

  // E2E-G8-02: the dev sample-trip seed is a development affordance, not
  // Demo Mode returning. This suite runs the production build, where it
  // must not exist at all.
  test('E2E-G8-02: no dev seeding affordance exists in a production build', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(PATH.trips)

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
  test('E2E-M22-06: the trip editor is reached from the trip’s menu and gives the trip back', async ({
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
    // Back leads to the trip — the ADR-011 declared parent, not whatever the
    // history happens to hold: since 2026-09-25 the editor is opened from M2's
    // menu, and it still gives back the trip rather than the list.
    await expect(page).toHaveURL(new RegExp(`${trip}$`))
    await expect(onVisibleScreen(page, 'm4-fab')).toBeVisible()
    // And the head names the trip again rather than the editor it just left.
    // The head is keyed by route path because Ionic keeps the outgoing page
    // mounted through the transition, so "which name is showing" is the
    // question that keying answers — and this is the moment it is asked.
    // Until ADR-050 it could not be asked here at all: M4 was the one screen
    // registering no title below the breakpoint, so the actions below had to
    // stand in for a name the screen was designed not to show.
    await expectTripOpen(page, TRIP.name)
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
    await page.goto(PATH.settings)
    await expect(onVisibleScreen(page, 'settings-language')).toBeVisible()

    await page.getByTestId('header-back').click()

    await atPath(page, '/tabs/dashboard')
    await expect(onVisibleScreen(page, 'dashboard')).toBeVisible()
  })

  /*
   * E2E-G1-07 (G-1, ADR-012): the gear leaves one page behind it, not two.
   *
   * E2E-G1-04 taps the same gear and could not see this, because it arrives
   * on the trip straight out of the wizard: one page in the outlet, and one
   * page is too shallow for Ionic to disagree with itself about which one is
   * leaving. Reached the way a user reaches a trip — from the list — the
   * outlet holds two, and the settings form came up over a still-live
   * packing list that went on taking taps meant for it.
   *
   * `m4-fab` is read off the whole page and asserted *hidden*, not absent:
   * scoping it to the visible screen would assert nothing, because a leaked
   * page is visible, and asserting absence would fail on the fixed build
   * too, because Ionic keeps the page it stacked away mounted. `oneLivePage`
   * catches this after the fact and without naming the gear; this says which
   * control owes it.
   */
  test('E2E-G1-07: the gear opened from a listed trip leaves one page in the outlet', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await createTripViaWizard(page, TRIP)
    await openTripFromList(page, TRIP.name)
    await expect(onVisibleScreen(page, 'm4-fab')).toBeVisible()

    await page.getByTestId('header-settings').click()

    await expect(onVisibleScreen(page, 'settings-language')).toBeVisible()
    await expect(visiblePages(page)).toHaveCount(1)
    await expect(page.getByTestId('m4-fab')).toBeHidden()
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
    await page.goto(PATH.trips)
    await expect(page.getByTestId('m2-portable-import')).toBeVisible()

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
    await page.goto(PATH.trips)
    await expect(page.getByTestId('m2-spreadsheet-import')).toBeVisible()

    await page.getByTestId('m2-spreadsheet-import').click()
    await expect(onVisibleScreen(page, 'import-paste')).toBeVisible()
    // M15 names itself and puts its step on the head's second line, where it
    // used to be half of a composed "Import · step 1/4" title (ADR-050).
    await expect(page.getByTestId('header-title')).toHaveText('Import spreadsheet')
    await expect(page.getByTestId('header-meta')).toHaveText('Step 1 of 4')

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
    await page.goto(PATH.settings)
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

  /**
   * E2E-G9-22 (FR-24.12, M24): the same contract for the cleanup screen. It is
   * reached from M9's ⋮ — a word, not a glyph — named only by the app bar,
   * and its back returns to the inventory, which the bar names again.
   */
  test('E2E-G9-22: the cleanup screen is reached from the inventory’s ⋮ and returns to it', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(PATH.items)
    await createItem(page, 'Kartenspiel')
    await backToInventory(page)

    await page.getByTestId('header-overflow').click()
    await page.getByText('Tidy up', { exact: true }).click()

    await atPath(page, PATH.inventoryCleanup)
    await expect(onVisibleScreen(page, 'm24-rule-untagged')).toBeVisible()
    await expect(page.getByTestId('header-title')).toHaveText('Tidy up')

    await page.getByTestId('header-back').click()

    await atPath(page, PATH.items)
    await expect(onVisibleScreen(page, 'm9-fab')).toBeVisible()
    await expect(page.getByTestId('header-title')).toHaveText('Inventory')
  })

  /*
   * E2E-G9-15 (G-9): the gear is on every screen except the one it opens.
   * On M17 it pointed at the page the user was already on (UX review
   * 2026-08-25, UX-16).
   */
  test('E2E-G9-15: the settings gear is everywhere but on settings itself', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto(PATH.dashboard)
    await expect(onVisibleScreen(page, 'dashboard')).toBeVisible()
    await expect(page.getByTestId('header-settings')).toBeVisible()

    await page.getByTestId('header-settings').click()

    // Rendered, not routed: the settings screen is on the display, and the
    // gear — which would only reopen it — is gone from the bar.
    await expect(onVisibleScreen(page, 'settings-language')).toBeVisible()
    await expect(page.getByTestId('header-settings')).toHaveCount(0)
  })

  /*
   * E2E-G12-05 (G-12): the destinations wear literal glyphs.
   *
   * The regression it guards is one generic icon standing for several
   * places, which is what makes dropping the labels affordable in the
   * first place. Asserted as pairwise distinctness of the glyph each
   * button actually renders — including against the inventory anchor,
   * because the trip's three neighbours are not the only icons the reader
   * is holding in their head.
   */
  test('E2E-G12-05: shopping, luggage, analytics and the inventory wear four different glyphs', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)

    const glyph = async (testid: string) => {
      const icon = page.getByTestId(testid).locator('ion-icon').first()
      await expect(icon).toBeVisible()
      // The chosen glyph, read off the element Ionic renders from. A
      // rendered-pixel comparison would be the visual suite's job; what
      // this case has to see is that four destinations did not reach for
      // one icon.
      return icon.evaluate((el) => (el as unknown as { icon?: string }).icon ?? '')
    }

    // The shopping list wears its glyph on the trip's switcher — at every
    // width since ADR-051 amendment 3, where the glyph is all a view you are
    // not standing on shows. Read off the element Ionic renders.
    const glyphs = [await glyph('trip-view-shopping')]

    // The other two are words in the bar's ⋮ since ADR-051 amendment 1, and
    // carry the same glyph there — which is the point: a reader who learned
    // the icon in one shape must not meet a different one in the other.
    await page.getByTestId('header-overflow').click()
    await expect(page.locator('ion-action-sheet')).toBeVisible()
    glyphs.push(await glyph('trip-view-luggage'), await glyph('trip-view-analytics'))
    await dismissMenu(page)
    // The rail is the fourth reader of the same vocabulary.
    await page.goto(PATH.items)
    glyphs.push(await glyph('rail-items'))

    for (const g of glyphs) expect(g).not.toBe('')
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  /*
   * E2E-G12-06 (G-12): an icon with no label still has a name.
   *
   * The spec sentence said "every unlabelled navigation icon", and read
   * against the app that is a smaller set than it sounds: the four anchors
   * carry visible labels in both presentations, and since ADR-050 the trip's
   * three destinations are words in a menu. What is left unlabelled is the
   * bar's own cluster. Two icons — back and the settings gear — carried
   * `aria-label` and no `title`, so a pointer hovering them was told
   * nothing; fixed with this case.
   *
   * Since ADR-051 amendment 3 the trip's switcher has unlabelled glyphs of
   * its own — every view but the current one — so its pills are read here
   * too. Their bubble on a held press is E2E-G12-08's.
   */
  test('E2E-G12-06: every unlabelled icon names itself, and a plain tap just navigates', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)

    for (const testid of [
      'm4-search',
      'm4-filter',
      'm4-fold-all',
      'header-overflow',
      'trip-view-shopping',
      'trip-view-tasks',
    ]) {
      const el = page.getByTestId(testid)
      await expect(el).toBeVisible()
      const title = (await el.getAttribute('title')) ?? ''
      expect(title, testid).not.toBe('')
      // The two names agree: a hover and a screen reader must not be told
      // different things about the same button. Read as the *accessible*
      // name rather than off the attribute — Ionic relays `aria-label` into
      // its shadow button, so the host element carries none (PR #228).
      await expect(el, testid).toHaveAccessibleName(title)
    }

    // One tap, and it is the navigation — no bubble in between to dismiss.
    await openTripView(page, 'shopping')
    await expect(onVisibleScreen(page, 'm6-page')).toBeVisible()
  })

  /*
   * E2E-G12-07 (G-12, ADR-050, ADR-051 and its amendments): the trip's
   * destinations are named — the ones it is worked in on the screen, the
   * other two as words in the bar's ⋮ — and every one of them is reachable
   * from every one.
   *
   * The clause this case was written for read "one tap each. No ⋯ exists",
   * and both halves had been reversed by a decision: UX-13 gave M4 a ⋮, and
   * ADR-050 put the three destinations in it so the bar could stop growing
   * glyphs — with §3.25's directive written down as the cost. FR-21.21 paid
   * it back with four pills; amendment 1 keeps two of them, because a row of
   * four made the two views read once a trip as loud as the two worked in
   * daily. Amendment 3 (2026-09-25) took the words off every pill but the
   * current one, because the row with its counts no longer fitted a 390 px
   * phone. What this pins is what survived all of it: every view **named**,
   * the one you stand on in a word, where you are marked, and every view
   * reachable from every one — since 2026-09-25 the luggage and the
   * analytics through the packing list, whose views they are.
   */
  test("E2E-G12-07: the trip's views are named, and reachable from each other", async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)

    // Named, not merely present — a glyph is read by its name — and the view
    // you stand on says its word on screen, because a row of glyphs that
    // marked nothing in words would have stopped saying where you are.
    for (const [id, name] of [
      ['trip-view-packing', 'Packing list'],
      ['trip-view-shopping', 'Shopping'],
      ['trip-view-tasks', 'Tasks'],
    ] as const) {
      await expect(page.getByTestId(id)).toHaveAccessibleName(name)
    }
    await expect(page.getByTestId('trip-view-packing')).toHaveText('Packing list')
    await expect(page.getByTestId('trip-view-shopping')).toHaveText('')

    // The row is measured rather than assumed — at the **narrowest** phone the
    // app targets, and in its widest shape, standing on a view that joins the
    // row (four pills). Two clauses, because a row can fail either way: every
    // pill inside the viewport, and all on one line, since a row that wrapped
    // would have „fitted" by every width assertion on its own.
    const viewport = page.viewportSize()!
    await openTripView(page, 'luggage')
    await expect(onVisibleScreen(page, 'm11-empty')).toBeVisible()
    await page.setViewportSize({ width: 360, height: 780 })
    const boxes = await Promise.all(
      ['trip-view-packing', 'trip-view-shopping', 'trip-view-tasks', 'trip-view-luggage'].map(
        async (id) => (await page.getByTestId(id).boundingBox())!,
      ),
    )
    for (const box of boxes) expect(box.x + box.width).toBeLessThanOrEqual(360 - 16)
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1)
    await page.setViewportSize(viewport)
    await openTripView(page, 'packing')
    await expect(onVisibleScreen(page, 'm4-header')).toBeVisible()
    // The two the row leaves out are not gone: they are words in the ⋮, which
    // is the half of the amendment that keeps them reachable at all.
    await expect(page.getByTestId('trip-view-luggage')).toHaveCount(0)
    await page.getByTestId('header-overflow').click()
    await expect(page.locator('ion-action-sheet').getByTestId('trip-view-luggage')).toHaveText(
      'Luggage',
    )
    await expect(page.locator('ion-action-sheet').getByTestId('trip-view-analytics')).toHaveText(
      'Analytics',
    )
    await dismissMenu(page)

    // Where you are is marked, and only there — otherwise "current" says
    // nothing (the packing list is the screen we are standing on).
    await expect(page.getByTestId('trip-view-packing')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('trip-view-shopping')).not.toHaveAttribute('aria-current', 'page')

    // One tap each, from M4 …
    await openTripView(page, 'shopping')
    await expect(onVisibleScreen(page, 'm6-page')).toBeVisible()
    await expect(page.getByTestId('trip-view-shopping')).toHaveAttribute('aria-current', 'page')

    // … but not sideways into packing's own views (owner, 2026-09-25, ADR-051
    // amendment 2): a ⋮ acts on the context it sits in, so the shopping list
    // has none, and the luggage is reached through the packing pill.
    await expect(page.getByTestId('header-overflow')).toHaveCount(0)
    await openTripView(page, 'packing')
    await openTripView(page, 'luggage')
    await expect(onVisibleScreen(page, 'm11-empty')).toBeVisible()
    // Standing in a view the row does not otherwise show, it says so: the
    // pill appears for as long as you are there (ADR-051 amendment 1).
    await expect(page.getByTestId('trip-view-luggage')).toHaveAttribute('aria-current', 'page')
    await openTripView(page, 'analytics')
    await expect(onVisibleScreen(page, 'analytics-dim-category')).toBeVisible()
    await expect(page.getByTestId('trip-view-luggage')).toHaveCount(0)

    // And back to the list it all belongs to.
    await openTripView(page, 'packing')
    await expect(onVisibleScreen(page, 'm4-header')).toBeVisible()

    // The tasks are a context of their own too: no ⋮ there either, read on a
    // screen that demonstrably rendered.
    await openTripView(page, 'tasks')
    await expect(onVisibleScreen(page, 'm25-segment')).toBeVisible()
    await expect(page.getByTestId('header-back')).toBeVisible()
    await expect(page.getByTestId('header-overflow')).toHaveCount(0)
  })

  /*
   * E2E-G12-08 (G-12, ADR-051 amendment 3): a glyph on the trip's switcher
   * says its name when it is held, and the hold is not a tap.
   *
   * A phone has no hover, so the `title` E2E-G12-06 reads is a desktop's
   * answer; the held press is the finger's. The release that ends a hold
   * still fires a click, which is the defect this case exists for: a reader
   * who asked "what is this" must not be taken there.
   */
  test('E2E-G12-08: holding a glyph on the switcher shows its name and goes nowhere', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await expect(page.getByTestId('trip-view-packing')).toHaveAttribute('aria-current', 'page')

    const box = (await page.getByTestId('trip-view-shopping').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(page.getByTestId('trip-view-bubble')).toHaveText('Shopping')
    await page.mouse.up()

    // The bubble lingers and then goes on its own; by the time it has gone,
    // a navigation the release had started would long have landed — so the
    // packing list still being current is a settled answer, not an early one.
    await expect(page.getByTestId('trip-view-bubble')).toHaveCount(0)
    await expect(onVisibleScreen(page, 'm4-header')).toBeVisible()
    await expect(page.getByTestId('trip-view-packing')).toHaveAttribute('aria-current', 'page')

    // And a plain tap on the same glyph is still the navigation.
    await openTripView(page, 'shopping')
    await expect(onVisibleScreen(page, 'm6-page')).toBeVisible()
    await expect(page.getByTestId('trip-view-bubble')).toHaveCount(0)
  })

  /*
   * E2E-G20-01 (G-20, owner 2026-09-24): a selection wears the app bar, so
   * starting one moves nothing on the page. The bar that counted it used to be
   * inserted above the list and pushed every row down — the user lost the row
   * they had just held. Measured, not eyeballed: the first row's top before
   * and after, on the shopping list, where the field and its chips also stay.
   */
  test('E2E-G20-01: starting a selection moves nothing — the count is in the app bar', async ({
    page,
  }) => {
    await createTripViaWizard(page, TRIP)
    await openTripView(page, 'shopping')
    const live = visiblePage(page)
    await live.getByTestId('m6-add-input').locator('input').fill('Brot')
    await live.getByTestId('m6-add-submit').click()
    const row = live.getByTestId('m6-row').filter({ hasText: 'Brot' })
    await expect(row).toBeVisible()
    const before = (await row.boundingBox())!.y

    await page.getByTestId('m6-select').click()

    // The bar is the selection's: its count, „Alle", the way out — and the
    // page's own controls gone from it.
    await expect(page.getByTestId('m6-select-count')).toHaveText('Nothing selected')
    await expect(page.getByTestId('m6-select-all')).toHaveText('All 1')
    await expect(page.getByTestId('header-back')).toHaveCount(0)
    await expect(live.getByTestId('m6-row-check-Brot')).toBeVisible()
    expect((await row.boundingBox())!.y).toBe(before)
    // The field stays where it was, at rest.
    await expect(live.getByTestId('m6-add-input')).toBeVisible()
    await expect(live.getByTestId('m6-composer')).toHaveAttribute('inert', '')

    await page.getByTestId('m6-select-exit').click()
    await expect(page.getByTestId('header-back')).toBeVisible()
    await expect(page.getByTestId('m6-select-count')).toHaveCount(0)
    expect((await row.boundingBox())!.y).toBe(before)
  })

  /*
   * E2E-G9-19 (G-9, ADR-050): a tab root is named by the frame too, and the
   * control that used to sit beside its name is in the bar.
   *
   * The three tab roots each wrote their own display-face `h1` into their
   * content before ADR-050, so they are the screens where "the head comes
   * from the registry" could silently stop being true — a title that simply
   * vanished would break no other case, because none of them ever had a test
   * id. The import control is the second half: it moved from beside the name
   * into the bar's cluster, and a move is only complete if it still works.
   *
   * M1 is the fourth root and joined them on 2026-09-09 (FR-21.27). It had
   * kept its own `h1` — the greeting — which put the app's first line 26 px
   * lower and a size smaller than the tab beside it, and left this case
   * asserting "a tab root" while one of them was not one.
   */
  test('E2E-G9-19: a tab root names itself in the page head, and its control is in the bar', async ({
    page,
  }) => {
    await page.goto(PATH.templates)
    await expect(page.getByTestId('header-title')).toHaveText('Templates')
    // A tab root has no back edge, so the bar keeps the logo rather than a
    // chevron — the positive signal that this head is the frame's and not a
    // drill-down's.
    await expect(page.getByTestId('header-logo')).toBeVisible()
    await expect(page.getByTestId('header-back')).toHaveCount(0)

    await page.getByTestId('m7-portable-import').click()
    await expect(onVisibleScreen(page, 'portable-paste')).toBeVisible()

    await page.goto(PATH.items)
    await expect(page.getByTestId('header-title')).toHaveText('Inventory')

    await page.goto(PATH.trips)
    await expect(page.getByTestId('header-title')).toHaveText('Trips')

    // M1's name is its greeting and the subtitle is the meta line under it —
    // the two lines the page used to draw into its own content. The screen
    // itself is asserted as visible, because since the move the head would
    // stand there unchanged if the dashboard had failed to render at all.
    await page.goto(PATH.dashboard)
    await expect(onVisibleScreen(page, 'dashboard')).toBeVisible()
    await expect(page.getByTestId('header-title')).not.toBeEmpty()
    await expect(page.getByTestId('header-meta')).toHaveText('Your packing tasks')
  })

  /*
   * E2E-G9-21 (G-9, M17): the build names itself once, and the same way in
   * both places that name it.
   *
   * The bar's label used to be `v${__APP_VERSION__}` while the string
   * already carried the tag's own `v` — from `git describe --tags` and from
   * the release workflow's `APP_VERSION=${{ github.ref_name }}` alike — so
   * every build, the shipped image included, read `vv0.10.0-…`. The unit
   * that covered it asserted the component's own template back to itself and
   * would have passed against any prefix; this asserts the two surfaces
   * agree, which is what the UI-Spec actually promises.
   */
  test('E2E-G9-21: the header and the About block name the same build', async ({ page }) => {
    await page.goto(PATH.trips)
    const header = page.getByTestId('header-app-version')
    await expect(header).not.toBeEmpty()
    const shown = (await header.innerText()).trim()

    await page.goto(PATH.settings)
    // "Version <string> · <commit>" — the About line carries the same build
    // string, so a prefix invented by one surface shows up as a mismatch
    // here rather than as a screenshot nobody reads.
    await expect(onVisibleScreen(page, 'settings-app-version')).toContainText(shown)
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
    await page.goto(PATH.settings)
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

  /*
   * E2E-G9-20 (G-9, FR-21.26): the column also grows in the tablet gap
   * between the phone width it is inert below and the desktop breakpoint
   * above which it goes flat again — an iPad mini otherwise ran the same
   * capped column as a phone turned sideways, stranding the frame's
   * native scrollbar in the unused gutter rather than at the screen edge.
   */
  test('E2E-G9-20: an iPad-mini-width screen gets a wider column than the desktop cap', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(PATH.settings)
    const area = () => page.locator('.app-content').boundingBox()

    const capped = (await area())!.width

    await page.setViewportSize(TABLET)
    const tablet = (await area())!.width

    // Wider than the flat desktop cap — the gap is no longer inert…
    expect(tablet).toBeGreaterThan(capped + 40)
    // …but still short of the viewport, so a gutter remains on both sides.
    expect(tablet).toBeLessThan(TABLET.width - 40)

    // Past the app's other breakpoint the column is capped flat again,
    // same as the desktop measurement above — the widening does not
    // simply keep growing into a normal laptop window.
    await page.setViewportSize(DESKTOP)
    expect((await area())!.width).toBe(capped)
  })
})
