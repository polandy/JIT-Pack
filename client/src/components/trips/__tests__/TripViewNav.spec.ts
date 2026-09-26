// @vitest-environment jsdom
/**
 * The trip's views under the page's name (FR-21.21, ADR-051 amendment 1).
 *
 * Three things live here that no screen test can see: which views the row
 * offers, in order; the one you are standing on is the one marked; and the
 * shopping pill counts **things to buy** rather than rows — the arithmetic
 * M6's own segments use (FR-25.6), and a mismatch goes unnoticed for as
 * long as the two numbers are never on one screen.
 *
 * Under FR-30.3 the count is provided rather than computed here; the mount
 * below provides it the way `App.vue` does, so the rule is held through the
 * real wiring and not through a number the spec made up.
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

import TripViewNav from '../TripViewNav.vue'
import { LONG_PRESS_MS } from '@/composables/useLongPress'
import { useTripStore } from '@/stores/tripStore'
import { installHarness } from '@/__tests__/harness'
import { createPackingShoppingSource } from '@/composables/packingShoppingSource'
import { TRIP_VIEW_COUNTS } from '@/lib/tripViews'
import { shoppingCount } from '@/shopping'
import { useShoppingStore } from '@/shopping/store'

const label = (wrapper: ReturnType<typeof mount>, id: string) =>
  wrapper.get(`[data-testid="trip-view-${id}"]`).attributes('aria-label')

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

function mountNav(
  current: 'packing' | 'shopping' | 'notes' | 'luggage' | 'analytics' = 'packing',
  notes = 0,
) {
  // App.vue's wiring: the packing list as the shopping list's source.
  const source = createPackingShoppingSource(useTripStore(), {
    buyItem: vi.fn(),
    unbuyItem: vi.fn(),
  })
  return mount(TripViewNav, {
    props: { tripId: TRIP, current },
    global: {
      provide: {
        [TRIP_VIEW_COUNTS]: { shopping: shoppingCount([source]), notes: () => notes },
      },
    },
  })
}

beforeEach(() => {
  installHarness()
  push.mockClear()
  navigate.mockClear()
})

describe('TripViewNav', () => {
  it('offers the four views a trip is worked in, in the order it is worked through', () => {
    seed()
    const labels = mountNav()
      .findAll('button')
      .map((b) => b.attributes('aria-label'))
    expect(labels).toEqual(['Packing list', 'Shopping (1)', 'Tasks', 'Notes'])
  })

  // FR-7.13: the notes pill counts what is new, in the colour a new thing wears.
  it('badges the notes with what is new, marked apart from the shopping count', () => {
    seed()
    const nav = mountNav('packing', 2)
    expect(label(nav, 'notes')).toBe('Notes · 2 new')
    const badge = nav.get('[data-testid="trip-view-notes-count"]')
    expect(badge.text()).toBe('2')
    expect(badge.classes()).toContain('count-new')
    expect(nav.get('[data-testid="trip-view-shopping-count"]').classes()).not.toContain('count-new')
    expect(mountNav('packing', 0).find('[data-testid="trip-view-notes-count"]').exists()).toBe(
      false,
    )
  })

  /*
   * ADR-051 amendment 1: the luggage and the analytics left the row, but the
   * row still has to say where you are — so the view being looked at stands
   * in it while you are there, and leaves again when you go.
   */
  it('makes room for the view being looked at when it is none of the four', () => {
    seed()
    const labels = mountNav('luggage')
      .findAll('button')
      .map((b) => b.attributes('aria-label'))
    expect(labels).toEqual(['Packing list', 'Shopping (1)', 'Tasks', 'Notes', 'Luggage'])
    expect(mountNav('luggage').find('[data-testid="trip-view-analytics"]').exists()).toBe(false)
  })

  it('counts things to buy, not rows', () => {
    const tripStore = seed()
    // The two rows really are two rows on the trip — without this the count
    // below would be satisfied by a store that had simply lost one of them.
    expect(tripStore.getShoppingItems(TRIP).buyBefore).toHaveLength(2)
    // …and they are one thing to buy, because they are one item per person.
    expect(label(mountNav(), 'shopping')).toBe('Shopping (1)')
  })

  // FR-30.1: an entry typed into the list is a thing to buy too.
  it('counts the shopping list’s own entries beside the packing list’s', () => {
    seed()
    useShoppingStore().applyChanges([
      {
        seq: 0,
        table: 'shopping_entries',
        id: 'e1',
        deleted: false,
        row: { trip_id: TRIP, name: 'Milch', list: 'buy_local', bought: 0 },
      },
    ])
    expect(label(mountNav(), 'shopping')).toBe('Shopping (2)')
  })

  it('offers the shopping view without a count where none is provided', () => {
    seed()
    const bare = mount(TripViewNav, { props: { tripId: TRIP, current: 'packing' } })
    expect(label(bare, 'shopping')).toBe('Shopping')
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
    expect(label(mountNav(), 'shopping')).toBe('Shopping')
    expect(mountNav().find('[data-testid="trip-view-shopping-count"]').exists()).toBe(false)
  })

  it('marks the view being looked at, and only it', () => {
    seed()
    const wrapper = mountNav('luggage')
    expect(wrapper.get('[data-testid="trip-view-luggage"]').attributes('aria-current')).toBe('page')
    for (const other of ['packing', 'shopping']) {
      expect(wrapper.get(`[data-testid="trip-view-${other}"]`).attributes('aria-current')).toBe(
        undefined,
      )
    }
  })

  it('goes to a sibling, and returns to the list rather than stacking it', async () => {
    seed()
    const wrapper = mountNav('luggage')

    await wrapper.get('[data-testid="trip-view-shopping"]').trigger('click')
    expect(push).toHaveBeenCalledWith(`/trips/${TRIP}/shopping`)

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

  /*
   * ADR-051 amendment 3: the word stays where you stand, every other view is
   * its glyph — and a glyph's number is a badge, since there is no word left
   * to put it in.
   */
  it('words the view you stand on, and gives the others a glyph and a badge', () => {
    seed()
    const wrapper = mountNav('packing')
    expect(wrapper.get('[data-testid="trip-view-packing"]').text()).toBe('Packing list')
    expect(wrapper.get('[data-testid="trip-view-shopping"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="trip-view-shopping-count"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="trip-view-tasks"]').text()).toBe('')
    // A hovering pointer is told the same name a screen reader is (G-12).
    expect(wrapper.get('[data-testid="trip-view-shopping"]').attributes('title')).toBe(
      'Shopping (1)',
    )
  })

  describe('the name on a held press', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const bubble = () => document.body.querySelector('[data-testid="trip-view-bubble"]')

    it('shows the name after a hold, and the release does not navigate', async () => {
      seed()
      const wrapper = mountNav('packing')
      const pill = wrapper.get('[data-testid="trip-view-shopping"]')

      await pill.trigger('pointerdown')
      // Not before the hold has lasted: a tap is a tap.
      vi.advanceTimersByTime(LONG_PRESS_MS - 1)
      await wrapper.vm.$nextTick()
      expect(bubble()).toBeNull()
      vi.advanceTimersByTime(1)
      await wrapper.vm.$nextTick()
      expect(bubble()?.textContent?.trim()).toBe('Shopping (1)')

      await pill.trigger('pointerup')
      await pill.trigger('click')
      expect(push).not.toHaveBeenCalled()
      wrapper.unmount()
      expect(bubble()).toBeNull()
    })

    it('navigates on a plain tap, with no bubble in between', async () => {
      seed()
      const wrapper = mountNav('packing')
      const pill = wrapper.get('[data-testid="trip-view-tasks"]')
      await pill.trigger('pointerdown')
      await pill.trigger('pointerup')
      vi.advanceTimersByTime(LONG_PRESS_MS)
      await pill.trigger('click')
      expect(bubble()).toBeNull()
      expect(push).toHaveBeenCalledWith(`/trips/${TRIP}/tasks`)
      wrapper.unmount()
    })

    it('offers no bubble on the view you stand on, which already says its word', async () => {
      seed()
      const wrapper = mountNav('packing')
      await wrapper.get('[data-testid="trip-view-packing"]').trigger('pointerdown')
      vi.advanceTimersByTime(LONG_PRESS_MS)
      await wrapper.vm.$nextTick()
      expect(bubble()).toBeNull()
      wrapper.unmount()
    })
  })
})
