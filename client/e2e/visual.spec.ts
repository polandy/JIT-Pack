import { test, expect, createTripViaWizard } from './fixtures'
import type { Page } from '@playwright/test'

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

/** The visible page. A hidden outlet page would otherwise be in the shot. */
const shown = (page: Page) => page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')

/** Settled: fonts loaded, so no baseline is taken mid-swap. */
async function settled(page: Page) {
  await page.waitForFunction(() => document.fonts.ready.then(() => true))
}

async function packingList(page: Page, names: string[]) {
  await createTripViaWizard(page, { name: 'Samedan 2026', travelers: ['Andy', 'Mia'] })
  for (const name of names) {
    await page.getByTestId('m4-fab').click()
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
    await expect(shown(page)).toBeVisible()
    await settled(page)
    await expect(page).toHaveScreenshot(`tab-${name}.png`)
  })
}

// E2E-VIS-02: M4 with rows — the product's core screen, and the one every
// token decision was judged against.
test('visual: M4 packing list @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await packingList(page, ['Zelt', 'Schlafsack', 'Stirnlampe', 'Regenjacke'])
  await expect(page).toHaveScreenshot('m4-list.png')
})

// E2E-VIS-03: the state FR-25.2 creates — some rows gone, the reveal bar up,
// and the same list with the done rows shown dimmed.
test('visual: M4 with packed rows hidden and revealed @local @visual', async ({
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
  await expect(shown(page).getByTestId('m4-row-Schlafsack')).toBeVisible()
  await settled(page)
  await expect(page).toHaveScreenshot('m4-done-revealed.png')
})

// E2E-VIS-04: the facet sheet — a layer over the list, and the surface the
// G-14 plane rules are most visible on.
test('visual: M4 filter sheet @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local' })
  await packingList(page, ['Zelt', 'Schlafsack'])

  await page.getByTestId('m4-filter').click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  await settled(page)
  await expect(page).toHaveScreenshot('m4-filter-sheet.png')
})

// E2E-VIS-05: the same list in Latte. One flavour spot-check rather than a
// second copy of every state: the flavour is decided in one token block, so
// one screen that uses brand, done, both planes and the elevation ink is
// enough to notice it moving. Doubling the set would double what a digest
// bump rewrites, for coverage of the same block.
test('visual: M4 in Latte @local @visual', async ({ page, seedMode }) => {
  await freeze(page)
  await seedMode({ mode: 'local', theme: 'latte' })
  await packingList(page, ['Zelt', 'Schlafsack', 'Stirnlampe'])
  await expect(page.locator('html')).toHaveClass(/jitpack-latte/)
  await expect(page).toHaveScreenshot('m4-list-latte.png')
})
