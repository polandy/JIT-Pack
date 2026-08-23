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
  packToggle: vi.fn(),
  lockHolder: vi.fn(() => null as string | null),
}

function seedTrip(
  status: TripStatus,
  flags: Partial<Pick<TripItem, 'flag_unused' | 'flag_missing'>> = {},
) {
  const store = useTripStore()
  const trip: Omit<Trip, 'id'> = {
    name: 'Herbst Tessin',
    status,
    year: 2026,
    start_date: null,
    end_date: null,
    duration_days: null,
    series_id: null,
    series_name: null,
    attributes: null,
    imported: false,
  }
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
  orchestratorFake.lockHolder.mockReturnValue(null)
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

  // A view can name a key no catalogue defines; `t` then renders the key
  // itself and the integrity test — which only compares the two catalogues
  // to each other — stays green.
  it('spells out what each flag means', async () => {
    seedTrip('active')
    const wrapper = await openDetails(mountSheet())

    expect(wrapper.text()).toContain('Taken along, never needed')
    expect(wrapper.text()).toContain('Was needed and was not there')
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

/**
 * G-3: an item somebody else is packing is "non-interactive for others
 * except viewing", and it renders "the locker's avatar and name". The
 * padlock stopped at M4's row — one tap deeper the sheet handed the row
 * over in full, which is the collision G-3 exists to prevent.
 */
describe('M5 respects the G-3 lock', () => {
  function seedLocked(holder: string | null) {
    const store = seedTrip('active')
    store.applyChange({
      seq: 1,
      table: 'trip_items',
      id: 'ti1',
      deleted: false,
      row: {
        ...store.getItems('t1')[0]!,
        state: 'packing_now',
        packing_now_by: holder,
        packing_now_at: new Date().toISOString(),
      },
    })
    orchestratorFake.lockHolder.mockReturnValue(holder)
    return store
  }

  it('names who is holding it', () => {
    seedLocked('user-sarah')
    const wrapper = mount(ItemDetailSheet, {
      props: {
        tripId: 't1',
        itemId: 'ti1',
        participants: [
          { user_id: 'user-sarah', display_name: 'Sarah', avatar_url: null, role: 'editor' },
        ],
      },
      global: { provide: { orchestrator: orchestratorFake } },
    })

    expect(wrapper.get('[data-testid="m5-lock"]').text()).toContain('Sarah')
  })

  it('says it is locked even when the holder cannot be named', () => {
    seedLocked('')
    const wrapper = mountSheet()

    const banner = wrapper.get('[data-testid="m5-lock"]')
    expect(banner.text().length).toBeGreaterThan(0)
    expect(banner.text()).not.toContain('{who}')
  })

  it('takes the packing controls away rather than only dimming the row', () => {
    seedLocked('user-sarah')
    const wrapper = mountSheet()

    expect(wrapper.find('[data-testid="m5-skip"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-todo-add"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-note-add"]').exists()).toBe(false)
  })

  /**
   * The stepper is the write G-3 is actually about, and it is the one
   * control the sheet keeps on screen — a locked row still has to show
   * "3/5". Disabled, therefore, not removed: the count is the readable
   * half G-3 preserves. Both directions are asserted, because "no call
   * was made" proves nothing on its own.
   */
  it('freezes the packing control while leaving the count readable', async () => {
    seedLocked('user-sarah')
    const locked = mountSheet()

    const check = locked.get('[data-testid="row-check"]')
    expect((check.get('ion-checkbox').element as unknown as { disabled: boolean }).disabled).toBe(
      true,
    )
    await check.trigger('click')
    expect(orchestratorFake.packToggle).not.toHaveBeenCalled()

    // The positive signal: the same tap on the same control writes as soon
    // as nobody holds the row.
    orchestratorFake.lockHolder.mockReturnValue(null)
    const free = mountSheet()
    await free.get('[data-testid="row-check"]').trigger('click')
    expect(orchestratorFake.packToggle).toHaveBeenCalledTimes(1)
  })

  it('leaves the details controls unwritable while the lock holds', async () => {
    seedLocked('user-sarah')
    const wrapper = await openDetails(mountSheet())

    await wrapper.get('[data-testid="m5-late"]').trigger('ionChange', { detail: { checked: true } })

    expect(orchestratorFake.setLatePacker).not.toHaveBeenCalled()
    // Both halves matter: the handler refuses the write, and the control
    // says so — a toggle that flips back on its own is worse than one
    // that never moved.
    expect(
      (wrapper.get('[data-testid="m5-late"]').element as unknown as { disabled: boolean }).disabled,
    ).toBe(true)
  })

  it('still shows what the row is — viewing is the half G-3 keeps', () => {
    seedLocked('user-sarah')
    const wrapper = mountSheet()

    expect(wrapper.get('[data-testid="m5-name"]').text()).toBe('Regenhose')
    expect(wrapper.find('[data-testid="m5-pack"]').exists()).toBe(true)
  })

  it('hands the sheet back in full once nobody holds it', () => {
    seedTrip('active')
    orchestratorFake.lockHolder.mockReturnValue(null)
    const wrapper = mountSheet()

    expect(wrapper.find('[data-testid="m5-lock"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="m5-skip"]').exists()).toBe(true)
  })
})
