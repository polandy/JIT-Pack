// @vitest-environment jsdom
/**
 * M11 container sheet (FR-10.1/10.3): the load header, the exclusive
 * pairing selector and the commit-on-the-spot edits (G-5). The write
 * *semantics* (both sides, releases) are specified in
 * domain/__tests__/containers.spec.ts — here we pin that the sheet calls
 * the right orchestrator action with the right arguments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ContainerSheet from '../ContainerSheet.vue'
import { useTripStore } from '@/stores/tripStore'
import type { Container, TripItem } from '@/types/domain'

function container(id: string, overrides: Partial<Container> = {}): Container {
  return {
    id,
    trip_id: 't1',
    name: id,
    carrier_traveler_id: null,
    max_weight_grams: null,
    paired_container_id: null,
    ...overrides,
  }
}

function item(id: string, containerId: string, weightGrams: number): TripItem {
  return {
    id,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: id,
    weight_grams: weightGrams,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: containerId,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '',
  }
}

/** Seeds through the store's public applyChange, the same door sync uses. */
function seed(
  store: ReturnType<typeof useTripStore>,
  table: 'containers' | 'trip_items',
  entity: Container | TripItem,
) {
  const { id, ...row } = entity
  store.applyChange({ seq: 0, table, id, deleted: false, row })
}

const orchestratorFake = {
  syncStatus: { state: { value: 'idle' } },
  updateContainer: vi.fn(),
  pairContainer: vi.fn(),
  unpairContainer: vi.fn(),
  deleteContainer: vi.fn(),
}

function mountSheet(containerId = 'left') {
  return mount(ContainerSheet, {
    props: { tripId: 't1', containerId },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('ContainerSheet', () => {
  it('shows the load against the limit and flags going over (FR-10.3)', () => {
    const store = useTripStore()
    seed(store, 'containers', container('left', { name: 'Left', max_weight_grams: 1000 }))
    seed(store, 'trip_items', item('towel', 'left', 1200))

    const wrapper = mountSheet()
    const loadLine = wrapper.get('[data-testid="m11-sheet-load"]')

    expect(loadLine.text()).toContain('1.2 kg of 1.0 kg')
    expect(loadLine.text()).toContain('Over the weight limit')
  })

  it('pairs via the orchestrator, both ids in order (FR-10.3)', async () => {
    const store = useTripStore()
    seed(store, 'containers', container('left'))
    seed(store, 'containers', container('right'))

    const wrapper = mountSheet('left')
    await wrapper.get('[data-testid="m11-pair-right"]').trigger('click')

    expect(orchestratorFake.pairContainer).toHaveBeenCalledWith('t1', 'left', 'right')
    expect(orchestratorFake.unpairContainer).not.toHaveBeenCalled()
  })

  it('tapping the active partner clears the pair for both sides', async () => {
    const store = useTripStore()
    seed(store, 'containers', container('left', { paired_container_id: 'right' }))
    seed(store, 'containers', container('right', { paired_container_id: 'left' }))

    const wrapper = mountSheet('left')
    await wrapper.get('[data-testid="m11-pair-right"]').trigger('click')

    expect(orchestratorFake.unpairContainer).toHaveBeenCalledWith('t1', 'left')
    expect(orchestratorFake.pairContainer).not.toHaveBeenCalled()
  })

  it('shows the imbalance only beyond the threshold (FR-10.3, default 15 %)', () => {
    const store = useTripStore()
    seed(store, 'containers', container('left', { paired_container_id: 'right' }))
    seed(store, 'containers', container('right', { paired_container_id: 'left' }))
    seed(store, 'trip_items', item('tent', 'left', 1000))
    seed(store, 'trip_items', item('pegs', 'right', 900)) // 10 % — balanced enough

    const balanced = mountSheet('left')
    expect(balanced.find('[data-testid="m11-imbalance"]').exists()).toBe(false)

    seed(store, 'trip_items', item('pegs', 'right', 500)) // 50 %
    const skewed = mountSheet('left')
    expect(skewed.get('[data-testid="m11-imbalance"]').text()).toContain('50 % imbalance')
  })

  it('commits a changed name on blur and ignores a no-op (G-5)', async () => {
    const store = useTripStore()
    seed(store, 'containers', container('left', { name: 'Left' }))

    const wrapper = mountSheet('left')
    const input = wrapper.get('[data-testid="m11-name-input"]')
    ;(input.element as HTMLInputElement & { value: string }).value = 'Left pannier'
    await input.trigger('ionBlur')

    expect(orchestratorFake.updateContainer).toHaveBeenCalledTimes(1)
    expect(orchestratorFake.updateContainer.mock.calls[0]![2]).toEqual({ name: 'Left pannier' })

    // The store still says 'Left' (the fake persists nothing): blurring
    // with the unchanged name must not produce a second write.
    ;(input.element as HTMLInputElement & { value: string }).value = 'Left'
    await input.trigger('ionBlur')
    expect(orchestratorFake.updateContainer).toHaveBeenCalledTimes(1)
  })

  it('omits the carrier section when the trip has no travelers (absent, not emptied)', () => {
    const store = useTripStore()
    seed(store, 'containers', container('left'))

    const wrapper = mountSheet('left')

    expect(wrapper.text()).not.toContain('Carried by')
  })

  it('renders the not-found state for a deleted container', () => {
    const wrapper = mountSheet('gone')

    expect(wrapper.find('[data-testid="m11-sheet"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('This container does not exist.')
  })
})
