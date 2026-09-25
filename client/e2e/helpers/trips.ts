/**
 * A trip, from the outside: made through M3, opened, acted on from M2's menu
 * or its row menu. Spec §2.4 requires preconditions to be built through the
 * app's own paths rather than injected, so every unit that needs a trip comes
 * through here.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { setDateField } from './ionic'
import { pageSettled, visiblePage, writesLanded } from './page'
import { PATH } from '../routes'

/**
 * Open a trip the way a user does — through M2, in-SPA. `page.goto` is a full
 * reload, and a reload with a Local Mode write still open loses the write
 * (see `writesLanded`), so the device is settled first.
 */
export async function openTripFromList(page: Page, name: string) {
  await writesLanded(page)
  await page.goto(`${PATH.trips}?status=planned`)
  await visiblePage(page).getByTestId(`trip-row-${name}`).click()
  await expectTripOpen(page, name)
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
  await writesLanded(page)
  await page.goto(PATH.newTrip)

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
  await writesLanded(page)
  return new URL(page.url()).pathname
}

/**
 * M4 is open on the named trip.
 *
 * Which element carried the name used to depend on the width (UI-Spec M4,
 * 2026-08-19): below the breakpoint the app bar had no room for it and M4's
 * own header line led with the name; above it the bar took the title back.
 * Since ADR-050 the name is in the page head at every width, so the branch
 * on the viewport that used to be here — bar above the breakpoint, M4's own
 * header line below it — is gone with it.
 */
export async function expectTripOpen(page: Page, name: string) {
  await expect(page.getByTestId('header-title')).toHaveText(name)
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

/** How {@link addInComposer} got the name onto the scope. */
export type ComposerAdd = 'created' | 'added'

/**
 * The composer's create sheet that is on show. Every mounted page carries its
 * own `CreateItemSheet` (M9 stays mounted under M10, M4 under M5), so the one
 * presented is the one that answers.
 */
export function createItemSheet(page: Page): Locator {
  return page.getByTestId('create-item-sheet').and(page.locator('.show-modal'))
}

/**
 * The composer's suggestion row for exactly this item — an exact name, not a
 * partial hit („Zelt" must not settle on *Zeltheringe*).
 */
export function exactSuggestion(scope: Locator, name: string): Locator {
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  return scope.getByTestId('quick-add-suggestion').filter({ has: scope.page().getByText(exact) })
}

/**
 * Type a name into the open composer (M4, M6, M8) and commit it with ✓.
 *
 * Since FR-24.11 reached the composer every add goes through the inventory: a
 * name it holds is added at once, any other opens `CreateItemSheet`, and only
 * that sheet's „Anlegen" writes. Which of the two happens is decided from a
 * **settled** signal, never from a one-shot `isVisible()` that may run before
 * Vue has re-rendered: the offer naming this query and the exact suggestion
 * exclude each other, so whichever is on screen is the answer. A retired name
 * (the restore offer) is not handled here — its case says so itself.
 *
 * Ends with the sheet gone; the caller asserts the row, because what a row is
 * called differs per screen.
 */
export async function addInComposer(
  page: Page,
  name: string,
  scope: Locator = visiblePage(page),
): Promise<ComposerAdd> {
  await scope.getByTestId('quick-add-input').locator('input').fill(name)
  const offer = scope.getByTestId('quick-add-offer-title').filter({ hasText: name })
  const known = exactSuggestion(scope, name)
  await expect(offer.or(known).first()).toBeVisible()
  const creates = (await offer.count()) > 0
  await scope.getByTestId('quick-add-confirm').click()
  if (!creates) return 'added'
  await confirmCreateSheet(page, name)
  return 'created'
}

/**
 * FR-24.11: the sheet the composer opened for `name` is on show; „Anlegen"
 * creates the item and hands it back to the composer, which adds it.
 */
export async function confirmCreateSheet(page: Page, name: string): Promise<void> {
  const sheet = createItemSheet(page)
  await expect(sheet).toHaveAttribute('data-presented', 'true')
  await expect(sheet.getByTestId('create-item-name').locator('input')).toHaveValue(name)
  await sheet.getByTestId('create-item-confirm').click()
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
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
  await writesLanded(page)
  await page.goto(PATH.newTrip)
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
  await writesLanded(page)
  return new URL(page.url()).pathname
}

/**
 * The once-per-trip actions, by the words the user reads. *Finish packing*
 * is M4's ⋮ (FR-5.10); the other three change the whole trip and are M2's
 * alone since 2026-09-25 — the trip's row menu, or its hero card's — because
 * a ⋮ acts on the context it sits in (G-12). Specs name the action, and this
 * helper takes them to whichever menu holds it, so they read as before.
 */
export const TRIP_ACTION = {
  edit: 'Trip properties',
  start: 'Start trip',
  // FR-5.10, and deliberately one word away from *Finish trip*: finishing
  // the packing is not finishing the trip.
  closePacking: 'Finish packing',
  archive: 'Finish trip',
} as const

/** The actions M2 carries rather than M4's ⋮. */
type TripWideAction = Exclude<keyof typeof TRIP_ACTION, 'closePacking'>

function isTripWide(action: keyof typeof TRIP_ACTION): action is TripWideAction {
  return action !== 'closePacking'
}

/** Open the bar's ⋮ and return it, settled and readable. */
async function openTripMenu(page: Page) {
  await page.getByTestId('header-overflow').click()
  const sheet = page.locator('ion-action-sheet')
  await expect(sheet).toBeVisible()
  return sheet
}

/** The M2 segment each lifecycle state is listed on (FR-2.8). */
const SEGMENTS = ['planned', 'active', 'archived'] as const

/** M2's anchor, whichever of the two navigations the width renders (G-9). */
function tripsAnchor(page: Page): Locator {
  return page
    .locator('[data-testid="tab-trips"]:visible, [data-testid="rail-trips"]:visible')
    .first()
}

/**
 * The trip's card on M2 — its row, or the hero when it is the running trip —
 * on whichever segment lists it. Found rather than assumed, because the
 * trip's status is exactly what these actions change; each segment is judged
 * only once M2 knows its lists (ADR-033), so an absence is a fact.
 *
 * In-SPA throughout, never `page.goto`: a case may be offline, and a reload
 * there boots an app with no list to show.
 */
async function tripCardOnM2(page: Page, name: string): Promise<Locator> {
  const live = visiblePage(page)
  await expect(live.getByTestId('m2-list-loading')).toHaveCount(0)
  for (const segment of SEGMENTS) {
    await live.getByTestId(`trips-filter-${segment}`).click()
    // The checked state is a class on the host — the idiom E2E-M2-33 uses.
    await expect(live.getByTestId(`trips-filter-${segment}`)).toHaveClass(/segment-button-checked/)
    const card = live.getByTestId(`trip-row-${name}`).or(live.getByTestId(`trip-hero-${name}`))
    if ((await card.count()) > 0) return card.first()
  }
  throw new Error(`no trip „${name}" on any of M2's segments`)
}

/**
 * Leave the open trip for its own row menu on M2 and return the sheet. The
 * trip's name is read off the page head, so a spec does not repeat it.
 */
async function openTripMenuOnM2(page: Page) {
  const name = (await page.getByTestId('header-title').innerText()).trim()
  await pageSettled(page)
  // The anchor where the width shows one; inside a trip on a phone the tab
  // bar yields, and M4's back is M2 — its declared parent (ADR-011).
  const anchor = tripsAnchor(page)
  if ((await anchor.count()) > 0) await anchor.click()
  else await page.getByTestId('header-back').click()
  await expect(visiblePage(page).getByTestId('trips-filter-planned')).toBeVisible()
  return { sheet: await openCardMenu(page, name), name }
}

/** The trip's own menu, from its card on M2. */
async function openCardMenu(page: Page, name: string): Promise<Locator> {
  const card = await tripCardOnM2(page, name)
  await card.dispatchEvent('contextmenu')
  const sheet = page.locator('ion-action-sheet').last()
  await expect(sheet).toBeVisible()
  return sheet
}

/**
 * One of the trip-wide actions for a case already standing on M2 — the menu
 * of the named trip's card, on whichever segment lists it.
 */
export async function tripActionFromList(page: Page, name: string, action: TripWideAction) {
  const sheet = await openCardMenu(page, name)
  await sheet.getByText(TRIP_ACTION[action], { exact: true }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
}

/**
 * Back into the trip from M2, through its own card. Dispatched on the card
 * rather than clicked at a point: right after *Start trip* M2 is still laying
 * out — the trip moves segments and a hero can arrive above the rows — and a
 * pointer click at the card's last position opened the trip beside it
 * (e2e-server, #598).
 */
async function reopenFromM2(page: Page, name: string) {
  await pageSettled(page)
  const card = await tripCardOnM2(page, name)
  await card.dispatchEvent('click')
  await expectTripOpen(page, name)
}

/**
 * Run one of the trip's once-per-trip actions through the menu the user
 * sees. The trip-wide ones leave the case where their own destination is —
 * the closing pass for *Finish trip*, the properties for *Trip properties* —
 * and *Start trip*, which has none, brings it back to the trip it came from.
 */
export async function tripAction(page: Page, action: keyof typeof TRIP_ACTION) {
  if (!isTripWide(action)) {
    const sheet = await openTripMenu(page)
    await sheet.getByText(TRIP_ACTION[action], { exact: true }).click()
    // The dismissal belongs to the interaction: a sheet still on screen
    // swallows the next click, which surfaces as an unrelated timeout.
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)
    return
  }
  const { sheet, name } = await openTripMenuOnM2(page)
  await sheet.getByText(TRIP_ACTION[action], { exact: true }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
  if (action === 'start') await reopenFromM2(page, name)
}

/**
 * The id each of the trip's views is reached by (FR-21.21). Written out
 * rather than interpolated: `scripts/testid-gate.mjs` matches a template
 * literal by its literal edge, and the app builds these from `trip-view-`.
 *
 * One id per view whichever shape it is wearing — a pill under the page's
 * name or an entry in the bar's ⋮ — because the app gives the two the same
 * id on purpose (AppHeader): a case that knows where to click should not
 * have to know which shape the view is in today.
 */
const TRIP_VIEW = {
  packing: 'trip-view-packing',
  shopping: 'trip-view-shopping',
  tasks: 'trip-view-tasks',
  notes: 'trip-view-notes',
  luggage: 'trip-view-luggage',
  analytics: 'trip-view-analytics',
} as const

/**
 * The views that stand in the switcher; the others are behind the ⋮ (ADR-051
 * amendment 1). Restated here rather than imported, like every other binding
 * in this file: the suite reads the app from the outside, and a helper that
 * imported the rule would agree with a wrong app.
 */
const PILL_VIEWS: readonly (keyof typeof TRIP_VIEW)[] = ['packing', 'shopping', 'tasks', 'notes']

/**
 * One of the trip's six views → another (FR-21.21, ADR-051). They were
 * glyphs on M4's header line, then words in the bar's ⋮ (ADR-050), then four
 * pills under the page's name — and since amendment 1 the two views a trip is
 * worked in are pills and the other two are words in the ⋮ again — three
 * since FR-7.7 gave the tasks a screen, four since FR-7.13 gave the notes
 * one. Either way this reaches them from any of the six screens, so the luggage is still one step from the shopping
 * list rather than going back through M4.
 *
 * The head is scrolled back into view first, unconditionally: on M4 it yields
 * on the way down (FR-21.17) and takes the switcher with it, so a case that
 * has scrolled would otherwise click a pill of zero height.
 */
export async function openTripView(page: Page, view: keyof typeof TRIP_VIEW): Promise<void> {
  // Never into a transition: a pill is in the frame rather than in a page, so
  // it stays clickable while the outlet is still swapping — and the
  // navigation that click makes lands in a stack nobody can read (pageSettled).
  await pageSettled(page)
  await visiblePage(page)
    .locator('ion-content')
    .first()
    .evaluate((el) => (el as HTMLElement & { scrollToTop?: (ms: number) => void }).scrollToTop?.(0))
  if (!PILL_VIEWS.includes(view)) {
    await openTripMenu(page)
    await page.getByTestId(TRIP_VIEW[view]).click()
    // The sheet's own teardown, as tripAction waits for it: one still on
    // screen swallows the next click as an unrelated timeout.
    await expect(page.locator('ion-action-sheet')).toHaveCount(0)
    return
  }
  const pill = page.getByTestId(TRIP_VIEW[view])
  await expect(pill).toBeVisible()
  await pill.click()
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
  // Closed through its own *Cancel*, not with `Escape`: Ionic ignores a key
  // until the sheet has finished presenting, so the key can land on nothing
  // and leave the sheet up to swallow the next click. A click waits for the
  // button to be actionable, which is that moment as a state rather than a
  // hope — measured on a loaded CI shard, twice, against E2E-G12-07.
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
  return labels.map((l) => l.trim())
}

/**
 * What the open trip's M2 menu offers, and back to the trip. The same
 * reading as `tripActions`, for the actions that live there.
 */
async function tripWideActions(page: Page): Promise<string[]> {
  const { sheet, name } = await openTripMenuOnM2(page)
  const labels = await sheet.locator('.action-sheet-button-inner').allInnerTexts()
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
  await reopenFromM2(page, name)
  return labels.map((l) => l.trim())
}

/** Whichever menu holds the action, read whole. */
function menuFor(page: Page, action: keyof typeof TRIP_ACTION): Promise<string[]> {
  return isTripWide(action) ? tripWideActions(page) : tripActions(page)
}

/**
 * That an action is offered — the settled signal the lifecycle cases used
 * to take from the glyph pair swapping. Reads the whole menu, so the
 * assertion sits on a list that is demonstrably there.
 */
export async function expectTripActionOffered(page: Page, action: keyof typeof TRIP_ACTION) {
  expect(await menuFor(page, action)).toContain(TRIP_ACTION[action])
}

/** And that one is not — against the same populated list. */
export async function expectTripActionAbsent(page: Page, action: keyof typeof TRIP_ACTION) {
  const offered = await menuFor(page, action)
  expect(offered.length).toBeGreaterThan(0)
  expect(offered).not.toContain(TRIP_ACTION[action])
}

/**
 * The ids of M2's row-menu entries. Written out rather than interpolated,
 * like `TRIP_VIEW`: the app declares each as a whole literal, and restating
 * them keeps the suite reading the app from the outside.
 */
export const TRIP_ROW_ACTION = {
  edit: 'm2-menu-edit',
  export: 'm2-menu-export',
  share: 'm2-menu-share',
  clone: 'm2-menu-clone',
  start: 'm2-menu-start',
  archive: 'm2-menu-archive',
  delete: 'm2-menu-delete',
} as const

/**
 * Open a trip row's action sheet on M2 (FR-4.5, FR-12.1, FR-18.3) — the hold
 * or right-click menu M4 and M7 already had, which replaced M2's swipe on
 * 2026-09-24. `contextmenu` rather than a held pointer, as `openRowMenu` in
 * `helpers/m4.ts`: it is the handler the hold fires into, and the hold's
 * 500 ms are `useLongPress`'s unit-tested business, not a timing to guess.
 */
export async function openTripRowMenu(page: Page, trip: string): Promise<Locator> {
  await visiblePage(page).getByTestId(`trip-row-${trip}`).dispatchEvent('contextmenu')
  // The newest sheet: the last menu may still be in its leave animation when
  // a confirm that followed it was answered quickly (E2E-M2-05), and M2 opens
  // the new one meanwhile rather than swallowing the request.
  const sheet = page.locator('ion-action-sheet').last()
  await expect(sheet).toBeVisible()
  return sheet
}

/**
 * Choose one entry of a row's menu. The sheet's teardown is *not* awaited
 * here, because several entries open a sheet or an alert of their own
 * (export asks progress-or-clean, delete confirms); the caller's next
 * assertion is on whatever that entry leads to.
 */
export async function chooseTripRowAction(
  page: Page,
  trip: string,
  action: keyof typeof TRIP_ROW_ACTION,
): Promise<void> {
  const sheet = await openTripRowMenu(page, trip)
  await sheet.getByTestId(TRIP_ROW_ACTION[action]).click()
}

/**
 * What that row's menu offers right now, by the names the user reads, with
 * *Cancel* left out. The whole list, so an *absence* — G-8's omitted Share, a
 * non-owner's missing Delete — is asserted against a menu that demonstrably
 * opened. Closed through its own *Cancel* for the reason `tripActions` gives.
 */
export async function tripRowMenuActions(page: Page, trip: string): Promise<string[]> {
  const sheet = await openTripRowMenu(page, trip)
  const labels = await sheet.locator('.action-sheet-button-inner').allInnerTexts()
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('ion-action-sheet')).toHaveCount(0)
  return labels.map((l) => l.trim()).filter((l) => l !== 'Cancel')
}
