/**
 * M5 — the FR-9.1 trip-feedback control behind *Details ▾* (UI-Spec M5).
 *
 * The sheet listed the two flags as a read-only note, which made *unused*
 * unwritable anywhere in the app — and *unused* is the half M14's
 * assistant is mostly about (FR-9.2, overpacked). These cases pin the
 * control: it exists on a live trip, it writes through the orchestrator,
 * and it is absent before the trip runs, where a judgement about it
 * would be meaningless.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ItemDetailSheet from '../ItemDetailSheet.vue'
import { useTripStore } from '@/stores/tripStore'
import type { Trip, TripItem, TripStatus } from '@/types/domain'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

const orchestratorFake = {
  syncStatus: { state: { value: 'synced' } },
  setReviewFlag: vi.fn(),
  setLatePacker: vi.fn(),
}

function seedTrip(status: TripStatus, flags: Partial<Pick<TripItem, 'flag_unused' | 'flag_missing'>> = {}) {
  const store = useTripStore()
  const trip: Omit<Trip, 'id'> = {
    name: 'Herbst Tessin',
    status,
    start_date: null,
    end_date: null,
    destination: null,
    series_id: null,
    notes: null,
    updated_hlc: '',
  } as Omit<Trip, 'id'>
  store.applyChange({ seq: 0, table: 'trips', id: 't1', deleted: false, row: trip })

  const item: Omit<TripItem, 'id'> = {
    trip_id: 't1',
    name: 'Regenhose',
    quantity: 1,
    packed_count: 1,
    state: 'packed',
    mode: 'pack',
    flag_unused: false,
    flag_missing: false,
    ...flags,
  } as Omit<TripItem, 'id'>
  store.applyChange({ seq: 0, table: 'trip_items', id: 'ti1', deleted: false, row: item })
  return store
}

function mountSheet() {
  return mount(ItemDetailSheet, {
    props: { tripId: 't1', itemId: 'ti1', participants: [] },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

/** The flags live behind *Details ▾*, folded on open (FR-25.7 idiom). */
async function openDetails(wrapper: ReturnType<typeof mountSheet>) {
  await wrapper.get('[data-testid="m5-details"]').trigger('click')
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('M5 FR-9.1 flags', () => {
  it('writes the unused flag through the orchestrator on an active trip', async () => {
    seedTrip('active')
    const wrapper = await openDetails(mountSheet())

    await wrapper.get('[data-testid="m5-flag-unused"]').trigger('ionChange', {
      detail: { checked: true },
    })

    expect(orchestratorFake.setReviewFlag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'ti1' }),
      'unused',
      true,
    )
  })

  it('takes a flag back again — the control is a judgement, not a stamp', async () => {
    seedTrip('active', { flag_missing: true })
    const wrapper = await openDetails(mountSheet())

    await wrapper.get('[data-testid="m5-flag-missing"]').trigger('ionChange', {
      detail: { checked: false },
    })

    expect(orchestratorFake.setReviewFlag).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'ti1' }),
      'missing',
      false,
    )
  })

  it('offers no flag control before the trip runs (FR-9.1: active trips only)', async () => {
    seedTrip('planning')
    const wrapper = await openDetails(mountSheet())

    expect(wrapper.find('[data-testid="m5-flag-unused"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-flag-missing"]').exists()).toBe(false)
  })

  it('shows an unused flag in the glance row, like missing (UI-Spec M5)', () => {
    seedTrip('active', { flag_unused: true })

    expect(mountSheet().get('[data-testid="m5-glance"]').text()).toContain('Unused')
  })
})
