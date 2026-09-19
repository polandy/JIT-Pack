// @vitest-environment jsdom
/**
 * M1's way onto a trip's shopping list (FR-30.5).
 *
 * The count is the shopping module's, provided by the composition root the
 * way the trip switcher gets it (FR-30.3) — so the dashboard never imports the
 * module, and the two pills cannot disagree about how many things are left.
 */
import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'

import TripShoppingLink from '../TripShoppingLink.vue'
import { TRIP_VIEW_COUNTS, type TripViewCounts } from '@/lib/tripViews'

function mountLink(counts?: TripViewCounts) {
  return mount(TripShoppingLink, {
    props: { tripId: 't1', testid: 'dashboard-shopping-Elba' },
    global: {
      stubs: { RouterLink: RouterLinkStub },
      provide: counts ? { [TRIP_VIEW_COUNTS]: counts } : {},
    },
  })
}

describe('TripShoppingLink (FR-30.5)', () => {
  it('leads to the trip’s shopping list', () => {
    const link = mountLink({ shopping: () => 3 })
    expect(link.getComponent(RouterLinkStub).props('to')).toBe('/trips/t1/shopping')
    expect(link.find('[data-testid="dashboard-shopping-Elba"]').exists()).toBe(true)
  })

  it('carries the things still to buy, as the trip switcher does', () => {
    expect(mountLink({ shopping: (id) => (id === 't1' ? 4 : 0) }).text()).toBe('Shopping (4)')
  })

  it('offers the word alone when nothing is left, because the list is a destination either way', () => {
    expect(mountLink({ shopping: () => 0 }).text()).toBe('Shopping')
    expect(mountLink().text()).toBe('Shopping')
  })
})
