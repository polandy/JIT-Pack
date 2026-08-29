import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { bootPage, uniq } from '../serverMode'

/**
 * E2E-M2-14 (FR-2.8, ADR-033) — the opening walk waits for a settled list.
 *
 * `single` because only a backend-backed run has the moment this is about:
 * the master partition arrives over the wire, after the screen is already on
 * the display. Zeros read off a list that has not come yet are not zeros, and
 * without the guard every cold start lands in the archive and — since the
 * walk decides on entry only — stays there.
 *
 * What is *not* asserted here is which segment it lands on: the run shares
 * one database, so other tests' trips are in this device's list too. The
 * isolated targets are E2E-M2-13's, in the `local` project.
 */
const MASTER_PULL = /\/api\/v1\/master\/sync.*cursor=/

test.describe('M2 opening segment, backend-backed @single @m2', () => {
  test('E2E-M2-14: no counts and no walk until the trip list has arrived', async ({ browser }) => {
    const trip = `Settled ${uniq()}`
    const context = await browser.newContext()
    const setup = await bootPage(context)
    await createTripViaWizard(setup, { name: trip })
    await expect(setup.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    await setup.close()

    // A second page of the same device, with its first master pull held. The
    // gate is a promise this test resolves — nothing here waits on a clock.
    const page = await context.newPage()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let firstPull = true
    await page.route(MASTER_PULL, async (route) => {
      if (firstPull) {
        firstPull = false
        await held
      }
      await route.fulfill({ response: await route.fetch() })
    })
    await page.goto('/tabs/trips')

    const segments = visiblePage(page).locator('ion-segment-button')
    await expect(segments).toHaveCount(3)
    // Label alone: unknown is not zero, and it is not a number either.
    await expect(visiblePage(page).locator('.segment-count')).toHaveCount(0)

    release()

    // The counts arriving is the settled signal, and the deferred decision
    // fires with them: whatever segment the list ends on holds trips.
    await expect(visiblePage(page).locator('.segment-count')).toHaveCount(3)
    const chosen = await visiblePage(page)
      .locator('ion-segment')
      .evaluate((el) => (el as HTMLElement & { value?: string }).value)
    const count = await visiblePage(page)
      .getByTestId(`trips-filter-${chosen}`)
      .locator('.segment-count')
      .innerText()
    // `(3)` — the brackets are part of the rendered count (FR-2.8).
    expect(Number(count.replace(/[^\d]/g, ''))).toBeGreaterThan(0)

    await context.close()
  })
})
