/**
 * Closing a sheet opened by a pushed query (M28's idea, M27's line): the
 * promise resolves only once the route has left the sheet, so what follows —
 * removing the idea, a tap on another view — never runs ahead of the back
 * step and is never undone by it (FR-29.13, E2E-M28-23).
 */
import { describe, it, expect } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { closeOverlayRoute } from '../closeOverlay'

const Noop = { template: '<div />' }
const BOARD = '/trips/t1/ideas'
const SHEET = `${BOARD}?idea=i1`

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:tripId', component: Noop },
      { path: '/trips/:tripId/ideas', component: Noop },
    ],
  })
}

describe('closeOverlayRoute', () => {
  it('pushed from the page: steps back, and resolves only once the step has landed', async () => {
    const router = makeRouter()
    await router.push('/trips/t1')
    await router.push(BOARD)
    await router.push(SHEET)

    await closeOverlayRoute(router, BOARD, BOARD)

    expect(router.currentRoute.value.fullPath).toBe(BOARD)
    // A step back, not a replace: the sheet's entry is gone from behind.
    router.back()
    await new Promise<void>((resolve) => {
      const stop = router.afterEach(() => (stop(), resolve()))
    })
    expect(router.currentRoute.value.fullPath).toBe('/trips/t1')
  })

  it('opened by a link: replaces, and resolves once the page is shown', async () => {
    const router = makeRouter()
    await router.push('/trips/t1')
    await router.push(SHEET)

    await closeOverlayRoute(router, BOARD, null)

    expect(router.currentRoute.value.fullPath).toBe(BOARD)
  })
})
