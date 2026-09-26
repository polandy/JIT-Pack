import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { bootPage, uniq } from '../serverMode'

/**
 * E2E-M4-86 (ADR-033, G-7) — the trip partition's half of the same rule.
 *
 * E2E-M2-18 drives it one partition up, where the master feed decides whether
 * the trip *list* is known. This is the case for every screen inside a trip:
 * `useTripScreen` has exposed `loaded` since U-10, and until 2026-09-13 only
 * M4's sibling `ClonePage` read it — so opening a shared link straight onto
 * M4 painted „everything is packed" over rows that were on their way.
 *
 * `single` for the reason E2E-M2-18 is: only a backend-backed run has the
 * moment, because Local Mode hydrates the whole database before the first
 * paint. Nothing waits on a clock — the pull is held by a promise this test
 * resolves.
 */
const TRIP_PULL = /\/api\/v1\/trips\/[^/]+\/sync/

test.describe('M4 before its rows have arrived @single @m4', () => {
  test('E2E-M4-86: says the list is loading, and claims no absence until it has arrived', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const setup = await bootPage(context)
    const tripPath = await createTripViaWizard(setup, { name: `Hydrating M4 ${uniq()}` })
    await expect(setup.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    await setup.close()

    // A second page of the same device, opened straight onto M4 with every
    // trip pull held. Held rather than failed: an offline device is the G-2
    // indicator's story (FR-2.8), and this case is about the moment before
    // either answer exists.
    const page = await context.newPage()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let holding = true
    await page.route(TRIP_PULL, async (route) => {
      if (holding) await gate
      await route.fulfill({ response: await route.fetch() })
    })
    await page.goto(tripPath)

    // The positive half: the screen says the one thing that is true.
    await expect(visiblePage(page).getByTestId('m4-list-loading')).toBeVisible()
    // The half this case exists for, and it is only meaningful beside the line
    // above: none of M4's three empty states is asserted yet, least of all the
    // one that congratulates the user.
    await expect(visiblePage(page).getByTestId('packing-empty')).toHaveCount(0)
    // Nor the figure above them, which said „0/0 packed" over a full track —
    // the same verdict in the form a reader trusts over a sentence. This
    // clause was added 2026-09-16, after a render found it standing.
    await expect(visiblePage(page).getByTestId('m4-progress')).toHaveCount(0)

    holding = false
    release()

    // The partition lands, and the trip really is empty — so now the G-7 state
    // is earned, and it is the „nothing on this list yet" one.
    await expect(visiblePage(page).getByTestId('m4-list-loading')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('packing-empty')).toBeVisible()
    await expect(visiblePage(page).getByTestId('m4-fab')).toBeVisible()
    // 0/0 is a measurement now, so the figure is owed: without this the fix
    // above would be satisfied by a header that never comes back.
    await expect(visiblePage(page).getByTestId('m4-progress')).toBeVisible()

    await context.close()
  })
})

/**
 * E2E-M6-24 (ADR-033, G-7) — nothing claims the list is empty before it is here.
 *
 * M6 once printed „Vor der Abreise (0)" over a body that was still saying the
 * list was loading. Both statements were on one screen and they disagreed;
 * the number is the one a reader believes, because a count looks settled in
 * a way a sentence does not. Since the tabs became sections (owner,
 * 2026-09-26) the claim that can run ahead of the partition is the empty
 * state and the two list heads — so while the pull is held neither stands,
 * and once it lands the empty state is owed.
 *
 * The same held pull as the case above, which is why it lives beside it.
 */
test.describe('M6 before its rows have arrived @single @m6', () => {
  test('E2E-M6-24: says nothing to buy only once the list has arrived', async ({ browser }) => {
    const context = await browser.newContext()
    const setup = await bootPage(context)
    const tripPath = await createTripViaWizard(setup, { name: `Hydrating M6 ${uniq()}` })
    await expect(setup.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    await setup.close()

    const page = await context.newPage()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let holding = true
    await page.route(TRIP_PULL, async (route) => {
      if (holding) await gate
      await route.fulfill({ response: await route.fetch() })
    })
    await page.goto(`${tripPath}/shopping`)

    // The positive half: the screen states the one thing it knows.
    await expect(visiblePage(page).getByTestId('m6-list-loading')).toBeVisible()
    // The half the case exists for: no „nothing to buy" while there is
    // nothing to judge from — neither the screen's empty state nor a list's.
    await expect(visiblePage(page).getByTestId('m6-empty')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m6-list-empty')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m6-before')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m6-local')).toHaveCount(0)

    holding = false
    release()

    // The partition lands and the trip really holds nothing to buy, so now the
    // empty state is a measurement and is owed — the other end of the same rule.
    await expect(visiblePage(page).getByTestId('m6-list-loading')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m6-empty')).toContainText('Nothing to buy')

    await context.close()
  })
})
