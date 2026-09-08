// @vitest-environment jsdom
/**
 * The trip's four views under the page's name (FR-21.21, ADR-051).
 *
 * Three things live here that no screen test can see: the four are all
 * offered, in order; the one you are standing on is the one marked; and the
 * shopping pill counts **things to buy** rather than rows — the arithmetic
 * M6's own segments use (FR-25.6), which the bar menu it replaced got wrong
 * unnoticed for as long as the two numbers were never on one screen.
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, it, expect, vi } from 'vitest'

import TripViewNav from '../TripViewNav.vue'
import { useTripStore } from '@/stores/tripStore'
import { installHarness } from '@/__tests__/harness'

const push = vi.fn()
const navigate = vi.fn()

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@ionic/vue', () => ({
  useIonRouter: () => ({ navigate }),
  IonIcon: { template: '<i class="icon" />' },
}))

const TRIP = 't1'

/** A trip with two people and one per-person purchase for both of them. */
function seed() {
  const tripStore = useTripStore()
  tripStore.applyChange({
    seq: 0,
    table: 'trips',
    id: TRIP,
    deleted: false,
    row: { name: 'Samedan', status: 'active', year: 2026 },
  })
  for (const [id, name] of [
    ['tr1', 'Andy'],
    ['tr2', 'Sia'],
  ] as const) {
    tripStore.applyChange({
      seq: 0,
      table: 'travelers',
      id,
      deleted: false,
      row: { trip_id: TRIP, name },
    })
  }
  for (const [id, traveler] of [
    ['i1', 'tr1'],
    ['i2', 'tr2'],
  ] as const) {
    tripStore.applyChange({
      seq: 0,
      table: 'trip_items',
      id,
      deleted: false,
      row: {
        trip_id: TRIP,
        name: 'Sonnenhut',
        quantity: 1,
        packed_count: 0,
        state: 'open',
        mode: 'buy_before',
        category_name: 'Kleidung',
        assigned_traveler_id: traveler,
      },
    })
  }
  return tripStore
}

function mountNav(current: 'packing' | 'shopping' | 'luggage' | 'analytics' = 'packing') {
  return mount(TripViewNav, { props: { tripId: TRIP, current } })
}

beforeEach(() => {
  installHarness()
  push.mockClear()
  navigate.mockClear()
})

describe('TripViewNav', () => {
  it('offers all four views, in the order the trip is worked through', () => {
    seed()
    const labels = mountNav()
      .findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(['Packing list', 'Shopping (1)', 'Luggage', 'Analytics'])
  })

  it('counts things to buy, not rows', () => {
    const tripStore = seed()
    // The two rows really are two rows on the trip — without this the count
    // below would be satisfied by a store that had simply lost one of them.
    expect(tripStore.getShoppingItems(TRIP).buyBefore).toHaveLength(2)
    // …and they are one thing to buy, because they are one item per person.
    expect(mountNav().get('[data-testid="trip-view-shopping"]').text()).toBe('Shopping (1)')
  })

  it('offers the shopping view without a number while there is nothing to buy', () => {
    const tripStore = useTripStore()
    tripStore.applyChange({
      seq: 0,
      table: 'trips',
      id: TRIP,
      deleted: false,
      row: { name: 'Samedan', status: 'active', year: 2026 },
    })
    expect(mountNav().get('[data-testid="trip-view-shopping"]').text()).toBe('Shopping')
  })

  it('marks the view being looked at, and only it', () => {
    seed()
    const wrapper = mountNav('luggage')
    expect(wrapper.get('[data-testid="trip-view-luggage"]').attributes('aria-current')).toBe('page')
    for (const other of ['packing', 'shopping', 'analytics']) {
      expect(wrapper.get(`[data-testid="trip-view-${other}"]`).attributes('aria-current')).toBe(
        undefined,
      )
    }
  })

  it('goes to a sibling, and returns to the list rather than stacking it', async () => {
    seed()
    const wrapper = mountNav('shopping')

    await wrapper.get('[data-testid="trip-view-luggage"]').trigger('click')
    expect(push).toHaveBeenCalledWith(`/trips/${TRIP}/containers`)

    await wrapper.get('[data-testid="trip-view-packing"]').trigger('click')
    expect(navigate).toHaveBeenCalledWith(`/trips/${TRIP}`, 'back', 'replace')
  })

  it('does nothing when the view you are on is tapped', async () => {
    seed()
    const wrapper = mountNav('shopping')
    await wrapper.get('[data-testid="trip-view-shopping"]').trigger('click')
    expect(push).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
