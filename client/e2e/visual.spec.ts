import { test, expect, createTripViaWizard, openQuickAdd, visiblePage } from './fixtures'
import { fillIonic } from './helpers/ionic'
import type { Page } from '@playwright/test'
import { PATH } from './routes'

/**
 * Visual baselines (ADR-013; UI-Test-Spec §3).
 *
 * These are the only cases in the suite that assert *appearance*. Every
 * other case asserts behaviour and is deliberately blind to how the screen
 * looks — which is why the four token PRs before this each had to ship a
 * hand-built screenshot artifact to show what changed.
 *
 * Run by `make visual`, never by `npm run test:e2e`: the `visual-*` projects
 * are excluded from the default run, and the images only mean anything
 * inside the digest-pinned Playwright image both sides use (ADR-013).
 *
 * **Two sources of randomness are removed here rather than masked.**
 * Masking the avatars would blind the baselines to the one component the
 * whole colour step was about; freezing the clock and the id source makes
 * the entire app deterministic instead, and costs nothing in production.
 */

/**
 * A baseline must contain no motion at all, and reduced motion is also how
 * FR-25.2's packed row is removed: on that path the leave hook finishes
 * synchronously instead of waiting for a `transitionend` a screenshot would
 * race.
 */
test.use({ reducedMotion: 'reduce' })

/**
 * Ids are `crypto.randomUUID()`, and `UserAvatar` hashes its seed — the
 * traveler's id — into a palette colour. Left alone, every run paints the
 * avatars differently and every baseline fails on its second execution.
 *
 * **The clock is deliberately not frozen**, and that is a finding rather
 * than an omission. `page.clock.setFixedTime` looks like the obvious
 * companion — a pinned instant means a rendered year cannot drift — but
 * with it the pack never reaches the store: the checkbox flips and the
 * header count, which reads the store, stays where it was, so the row never
 * leaves.
 *
 * The cause was **not** traced, and the obvious suspect is already ruled
 * out: `HLCGenerator.next()` handles equal timestamps correctly
 * (`if (now <= lastMillis) counter++`), so it is something else in the
 * write path. None of these baselines renders a date — only the greeting
 * reads the clock, and its hour is pinned in `freeze` below — so the full
 * freeze bought nothing and cost the one state that exercises FR-25.2; it
 * was dropped rather than investigated. If a dated screen is added here later, pin the
 * date on the *trip* rather than on the browser, and expect to find this
 * note first.
 */
async function freeze(page: Page) {
  await page.addInitScript(() => {
    let n = 0
    const uuid = () => {
      n += 1
      const hex = n.toString(16).padStart(12, '0')
      return `00000000-0000-4000-8000-${hex}` as `${string}-${string}-${string}-${string}-${string}`
    }
    Object.defineProperty(crypto, 'randomUUID', { value: uuid, configurable: true })
    // The dashboard greeting reads the wall clock's hour — the one
    // time-of-day the suite renders. Found 2026-08-15, when a 19:49 UTC
    // run met a baseline recorded in the morning: the job was green only
    // inside the baseline's own time window. Pinning the *hour* keeps
    // Date.now() untouched (freezing it breaks the Local Mode write path
    // — see the header), so the seam is exactly as wide as the defect.
    Date.prototype.getHours = () => 9
  })
}

/** Settled: fonts loaded, so no baseline is taken mid-swap. */
async function settled(page: Page) {
  await page.waitForFunction(() => document.fonts.ready.then(() => true))
}

async function packingList(page: Page, names: string[]) {
  await createTripViaWizard(page, { name: 'Samedan 2026', travelers: ['Andy', 'Mia'] })
  for (const name of names) {
    await openQuickAdd(page)
    await page.getByTestId('quick-add-input').locator('input').fill(name)
    await page.getByTestId('quick-add-confirm').click()
    await expect(page.getByTestId(`m4-row-${name}`)).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()
  await settled(page)
}

// E2E-VIS-01: the four tab roots, which is where every screen rebuild lands.
for (const [name, path] of [
  ['dashboard', '/tabs/dashboard'],
  ['trips', '/tabs/trips'],
  ['templates', '/tabs/templates'],
  ['items', '/tabs/items'],
] as const) {
  test(`visual: ${name} tab root @local @visual`, async ({ page, seedMode }) => {
    await freeze(page)
    await seedMode({ mode: 'local' })
    await page.goto(path)
    await expect(visiblePage(page)).toBeVisible()
    await settled(page)
    await expect(page).toHaveScreenshot(`tab-${name}.png`)
  })
}

// E2E-VIS-02: M4 with rows — the product's core screen, and the one every
// token decision was judged against.
test('E2E-VIS-02: visual: M4 packing list @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await packingList(page, ['Zelt', 'Schlafsack', 'Stirnlampe', 'Regenjacke'])
  await expect(page).toHaveScreenshot('m4-list.png')
})

// E2E-VIS-03: the state FR-25.2 creates — some rows gone, the reveal bar up,
// and the same list with the done rows shown dimmed.
test('E2E-VIS-03: visual: M4 with packed rows hidden and revealed @local @visual', async ({
  page,
  seedMode,
}) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await packingList(page, ['Zelt', 'Schlafsack', 'Stirnlampe'])

  await page
    .getByTestId('m4-row-Schlafsack')
    .getByTestId('row-check')
    .locator('ion-checkbox')
    .click()
  await expect(page.getByTestId('m4-row-Schlafsack')).toBeHidden()
  // The snackbar is on a timer, so it is dismissed rather than waited out —
  // a baseline that sometimes contains a toast is a baseline that fails at
  // random.
  await page.locator('ion-toast.pack-toast').evaluate((el: HTMLIonToastElement) => el.dismiss())
  await expect(page.locator('ion-toast.pack-toast')).toHaveCount(0)
  await settled(page)
  await expect(page).toHaveScreenshot('m4-done-hidden.png')

  await page.getByTestId('m4-done-bar').click()
  await expect(visiblePage(page).getByTestId('m4-row-Schlafsack')).toBeVisible()
  await settled(page)
  await expect(page).toHaveScreenshot('m4-done-revealed.png')
})

// E2E-VIS-04: the facet sheet — a layer over the list, and the surface the
// G-14 plane rules are most visible on.
test('E2E-VIS-04: visual: M4 filter sheet @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await packingList(page, ['Zelt', 'Schlafsack'])

  await page.getByTestId('m4-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  await settled(page)
  await expect(page).toHaveScreenshot('m4-filter-sheet.png')
})

/** Close the M11 sheet and wait for the overlay to be *gone*, not merely detached. */
async function closeSheet(page: Page) {
  await page.getByTestId('m11-sheet-close').click()
  await expect(page.getByTestId('m11-sheet')).toHaveCount(0)
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
}

/**
 * One M11 state that carries everything the screen decides visually: a card
 * with a graded weight bar (amber at 91 % — an FR-10.3 role colour), a pair
 * with its imbalance line, a carrier avatar, and the unassigned bucket below.
 * The weight is real and arrives through the app's own paths, because a bar
 * with no load grades nothing.
 */
async function containers(page: Page) {
  await page.goto(PATH.items)
  await visiblePage(page).getByTestId('m9-fab').click()
  await expect(visiblePage(page).getByTestId('m10-new-hint')).toBeVisible()
  await fillIonic(visiblePage(page).getByTestId('m10-name'), 'Zelt')
  await visiblePage(page).getByTestId('m10-more').click()
  await fillIonic(visiblePage(page).getByTestId('m10-weight'), '5000')
  await visiblePage(page).getByTestId('m10-create').click()
  await expect(page.getByTestId('header-title')).toHaveText('Zelt')

  await createTripViaWizard(page, { name: 'Samedan 2026', travelers: ['Andy', 'Mia'] })

  await openQuickAdd(page)
  await page.getByTestId('quick-add-input').locator('input').fill('Zel')
  await page.getByTestId('quick-add-suggestion').filter({ hasText: 'Zelt' }).click()
  await expect(page.getByTestId('m4-row-Zelt')).toBeVisible()
  await page.getByTestId('quick-add-input').locator('input').fill('Schlafsack')
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.getByTestId('m4-row-Schlafsack')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-add-input')).toBeHidden()

  await visiblePage(page).getByTestId('m4-nav-luggage').click()
  await expect(visiblePage(page).getByTestId('m11-fab')).toBeVisible()
  await expect(visiblePage(page).getByTestId('m4-nav-luggage')).toHaveCount(0)

  for (const [name, limit] of [
    ['Links', '5.5'],
    ['Rechts', '9'],
  ] as const) {
    await visiblePage(page).getByTestId('m11-fab').click()
    await expect(page.getByTestId('m11-sheet')).toBeVisible()
    await fillIonic(page.getByTestId('m11-name-input'), name)
    await page.getByTestId('m11-name-input').locator('input').press('Enter')
    await expect(page.getByTestId('m11-sheet-name')).toHaveText(name)
    await fillIonic(page.getByTestId('m11-max-input'), limit)
    // The commit seam is blur (G-5).
    await page.getByTestId('m11-max-input').locator('input').press('Tab')
    if (name === 'Links') {
      await page.getByTestId('m11-sheet').getByRole('button', { name: 'Andy', exact: true }).click()
    } else {
      await page
        .getByTestId('m11-sheet')
        .getByRole('button', { name: 'Links', exact: true })
        .click()
    }
    await closeSheet(page)
  }

  // 5 kg of 5.5 kg is 91 % — amber — and against an empty partner it is
  // also the imbalance the pair reports.
  await visiblePage(page).getByTestId('m11-unassigned-row').filter({ hasText: 'Zelt' }).click()
  await expect(page.getByTestId('m11-picker')).toBeVisible()
  await page.getByTestId('m11-picker-option').filter({ hasText: 'Links' }).click()
  await expect(page.getByTestId('m11-picker')).toHaveCount(0)
  await expect(page.locator('ion-modal.show-modal')).toHaveCount(0)
  await settled(page)
}

// E2E-VIS-05: the same list in Latte. One flavour spot-check rather than a
// second copy of every state: the flavour is decided in one token block, so
// one screen that uses brand, done, both planes and the elevation ink is
// enough to notice it moving. Doubling the set would double what a digest
// bump rewrites, for coverage of the same block.
test('E2E-VIS-05: visual: M4 in Latte @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local', theme: 'latte' })
  await packingList(page, ['Zelt', 'Schlafsack', 'Stirnlampe'])
  await expect(page.locator('html')).toHaveClass(/jitpack-latte/)
  await expect(page).toHaveScreenshot('m4-list-latte.png')
})

// E2E-VIS-06: M11, the first screen outside M4 to get a baseline. It earns
// one because it renders three things no other baseline does — a load bar
// whose fill carries an FR-10.3 grade colour, the paired/imbalance line, and
// the card list itself — and because the rebuild that introduced them was
// judged on exactly those pixels.
test('E2E-VIS-06: visual: M11 container list @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await containers(page)
  await expect(page).toHaveScreenshot('m11-list.png')
})

// E2E-VIS-07: the container sheet. The M4 filter sheet already baselines the
// *plane*, so this is not a second copy of it: the sheet is the M5 grammar
// applied to a container, and the load line and pairing chips inside it exist
// on no other surface.
test('E2E-VIS-07: visual: M11 container sheet @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await containers(page)

  await visiblePage(page).getByTestId('m11-container-card').filter({ hasText: 'Links' }).click()
  await expect(page.getByTestId('m11-sheet')).toBeVisible()
  await expect(page.getByTestId('m11-sheet-load')).toBeVisible()
  await settled(page)
  await expect(page).toHaveScreenshot('m11-sheet.png')
})

/*
 * E2E-VIS-08: the G-2 detail sheet. It is the one surface reachable from
 * every screen in every mode, and it was covered by no baseline at all —
 * which is how its state glyph came to sit half a line above its title
 * without anything going red. E2E-G2-08 guards that one measurement; this
 * guards the rest of the header, the state line and the sheet's own plane.
 */
test('E2E-G2-08, E2E-VIS-08: visual: G-2 sync detail sheet @local @visual', async ({
  page,
  seedMode,
}) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await page.goto(PATH.trips)
  await expect(visiblePage(page)).toBeVisible()

  await page.getByTestId('sync-indicator').click()
  await expect(page.getByTestId('sync-detail-sheet')).toBeVisible()
  // The storage block resolves asynchronously; baselining before it lands
  // would bake in whichever of its two states won the race.
  await expect(page.getByTestId('sync-detail-storage')).toBeVisible()
  await settled(page)
  await expect(page).toHaveScreenshot('g2-sheet.png')
})

/**
 * E2E-VIS-09: M16, the series and destination profile.
 *
 * The screen that had **no coverage at any layer** until 2026-08-30 — no spec
 * file, no unit, not one `data-testid` — and whose first render found FR-13.3's
 * checklist input at **width 0**, because Ionic gives `ion-select` `width:
 * 100%` and as a flex item that is a basis of the whole row. That is the class
 * of defect a baseline exists for: every assertion passed, the element was in
 * the DOM with the right computed flex and height, and only the pixel said the
 * box was empty (invariant 9b, G-14).
 *
 * The row is deliberately in frame *with content on both sides* — a select
 * carrying a value and an input carrying text — because an empty row of the
 * same geometry would not show the collapse coming back.
 */
test('E2E-VIS-09: visual: M16 series profile @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await createTripViaWizard(page, { name: 'Elba 2026', series: 'Elba' })

  await page.goto(PATH.trips)
  await visiblePage(page).getByTestId('series-header-Elba').click()
  await expect(page.getByTestId('header-title')).toHaveText('Elba')

  // The FR-13.3 editor with something in it: the select beside the input is
  // the geometry the baseline is here for.
  await visiblePage(page).getByTestId('m16-notes').locator('textarea').fill('Fähre ab Piombino')
  await visiblePage(page).getByTestId('m16-checklist-input').locator('input').fill('Reisepässe')
  await visiblePage(page).getByTestId('m16-checklist-add').click()
  await expect(visiblePage(page).getByTestId('m16-checklist-row')).toHaveCount(1)

  // Where the page sits at capture time is not part of the screen's state:
  // `fill()` focuses a field, and the browser scrolls a focused field into
  // view on its own schedule, so the mobile baseline was recorded 102px down
  // and met a run that had stayed at the top (2026-08-31, a 6 % diff on a
  // docs-only commit). Blur first, then put the scroller back, so the shot is
  // of the top of the screen every time rather than of whichever scroll won.
  await visiblePage(page)
    .locator('ion-content')
    .evaluate(async (el) => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      const ionContent = el as unknown as { getScrollElement(): Promise<HTMLElement> }
      ;(await ionContent.getScrollElement()).scrollTop = 0
    })

  await settled(page)
  await expect(page).toHaveScreenshot('m16-series.png')
})
