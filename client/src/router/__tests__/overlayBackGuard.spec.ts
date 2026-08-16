/**
 * A history pop leaving a route with an active overlay closes the overlay
 * instead (ADR-011): the overlay replaced the entry of the screen beneath
 * it, so a raw pop would skip that screen. Found by the owner pressing
 * the browser's back button on an open M5 sheet (2026-08-16).
 */
import { describe, it, expect } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { installOverlayBackGuard } from '../overlayBackGuard'

const Noop = { template: '<div />' }

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tabs/trips', component: Noop },
      {
        // The trip-detail shape: one record, the overlay as an alias.
        path: '/trips/:tripId',
        alias: '/trips/:tripId/items/:itemId',
        component: Noop,
        meta: {
          parent: '/tabs/trips',
          overlayParam: 'itemId',
          overlayParent: '/trips/:tripId',
        },
      },
      { path: '/trips/:tripId/review', component: Noop, meta: { parent: '/trips/:tripId' } },
    ],
  })
  installOverlayBackGuard(router)
  return router
}

/** Resolves after the next `count` completed navigations. */
function nextNavs(router: ReturnType<typeof makeRouter>, count: number): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0
    const remove = router.afterEach(() => {
      if (++seen === count) {
        remove()
        resolve()
      }
    })
  })
}

/** The owner's history: list → trip → sheet replacing the trip's entry. */
async function openSheet(router: ReturnType<typeof makeRouter>) {
  await router.push('/tabs/trips')
  await router.push('/trips/t1')
  await router.replace('/trips/t1/items/i9')
}

describe('overlayBackGuard', () => {
  it('a pop with the sheet open closes it instead of skipping the trip', async () => {
    const router = makeRouter()
    await openSheet(router)

    // Two completed navigations: the pop itself, then the correction.
    const settled = nextNavs(router, 2)
    router.go(-1)
    await settled

    expect(router.currentRoute.value.path).toBe('/trips/t1')
  })

  it('the correction restores the natural chain: the next pop reaches the list', async () => {
    const router = makeRouter()
    await openSheet(router)

    const corrected = nextNavs(router, 2)
    router.go(-1)
    await corrected
    const second = nextNavs(router, 1)
    router.go(-1)
    await second

    // The corrective push rebuilt [list, trip], so the second pop lands
    // on the list — never on the sheet again.
    expect(router.currentRoute.value.path).toBe('/tabs/trips')
  })

  it('a pop without an overlay stays an ordinary pop', async () => {
    const router = makeRouter()
    await router.push('/tabs/trips')
    await router.push('/trips/t1')
    await router.push('/trips/t1/review')

    router.go(-1)
    await new Promise<void>((resolve) => router.afterEach(() => resolve()))

    expect(router.currentRoute.value.path).toBe('/trips/t1')
  })

  it('the chevron path is untouched: replacing to the overlay parent is not intercepted', async () => {
    const router = makeRouter()
    await openSheet(router)

    await router.replace('/trips/t1')

    expect(router.currentRoute.value.path).toBe('/trips/t1')
    // …and history was not rewritten underneath: back leaves the trip.
    const settled = nextNavs(router, 1)
    router.go(-1)
    await settled
    expect(router.currentRoute.value.path).toBe('/tabs/trips')
  })
})
