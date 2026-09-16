import { test, expect, createTripViaWizard, visiblePage } from '../fixtures'
import { bootPage, uniq } from '../serverMode'
import { PATH } from '../routes'

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
    await page.goto(PATH.trips)

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

/**
 * E2E-M2-18 (FR-2.8, ADR-033, G-7) — the empty state is a claim, and it waits
 * until the list can support it.
 *
 * The sibling defect of the case above, from the same cold start: the counts
 * were guarded, the *screen* was not. `isEmpty` read the store directly, so a
 * device whose master pull had not landed painted „No active trips" over a
 * list that was merely on its way — the ADR-033 mistake in the one place the
 * user actually reads. Nothing waits on a clock here either: the pull is held
 * by a promise this test resolves.
 */
test.describe('M2 empty state, backend-backed @single @m2', () => {
  test('E2E-M2-18: says the list is loading, and claims no absence until it has arrived', async ({
    browser,
  }) => {
    const trip = `Hydrating ${uniq()}`
    const context = await browser.newContext()
    const setup = await bootPage(context)
    await createTripViaWizard(setup, { name: trip })
    await expect(setup.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    await setup.close()

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
    await page.goto(PATH.trips)

    // The positive half: the screen says what is true — the list is coming.
    await expect(visiblePage(page).getByTestId('m2-list-loading')).toBeVisible()
    // The half this case exists for, which is only meaningful beside the
    // line above: no absence is asserted while none has been established.
    await expect(visiblePage(page).getByTestId('m2-empty')).toHaveCount(0)

    release()

    await expect(visiblePage(page).getByTestId('m2-list-loading')).toHaveCount(0)
    // The trip is `planning`, and the segment is named rather than walked to:
    // the run shares a database, so which segment the walk picks is not this
    // case's business (see E2E-M2-14).
    await visiblePage(page).getByTestId('trips-filter-planned').click()
    await expect(visiblePage(page).getByTestId(`trip-row-${trip}`)).toBeVisible()

    await context.close()
  })
})

/**
 * E2E-M23-05 (ADR-033, G-7) — the archive's segments, not its note.
 *
 * M23 said „Artikel (0)" and „Vorlagen (0)" over a body that was still saying
 * the archive was loading, and the two claims disagreed inside ninety vertical
 * pixels. The counts are the half a reader acts on — they came here to find
 * something they retired — so they wait for the partition. The zero returns
 * once it is real: an empty tab is worth naming.
 *
 * The held master pull is E2E-M2-18's, which is why it lives beside it.
 */
test.describe('M23 before the archive has arrived @single @m23', () => {
  test('E2E-M23-05: names its segments without a count until the archive has arrived', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const setup = await bootPage(context)
    await expect(setup.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'synced')
    await setup.close()

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
    await page.goto(PATH.masterRetired)

    // The positive half, and the proof the moment was actually caught.
    await expect(visiblePage(page).getByTestId('m23-list-loading')).toBeVisible()
    // Exact text, because a „contains" clause would be satisfied by „(0)".
    await expect(visiblePage(page).getByTestId('m23-segment-items')).toHaveText('Items')
    await expect(visiblePage(page).getByTestId('m23-segment-templates')).toHaveText('Templates')

    release()

    // The partition is here, so a count is a count. The run shares a database
    // and other cases retire rows, so the figure itself is not this case's
    // business — that it is *stated* is.
    await expect(visiblePage(page).getByTestId('m23-list-loading')).toHaveCount(0)
    await expect(visiblePage(page).getByTestId('m23-segment-items')).toContainText('(')
    await expect(visiblePage(page).getByTestId('m23-segment-templates')).toContainText('(')

    await context.close()
  })
})
