// @vitest-environment jsdom
/**
 * ClonePage against a trip whose rows are not on the device (ADR-033).
 *
 * trip_items live in the trip's own partition; a device that never opened
 * the trip has none of them. Before the guard the preview read
 * "0 Packelemente, 0 Reisende" and the button cloned exactly that — an
 * empty trip, silently. The page must ask for the rows, say that it is
 * still asking, and not offer the clone until they are here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { IonButton, IonInput } from '@ionic/vue'

import ClonePage from '../ClonePage.vue'
import DateRangeField from '@/components/global/DateRangeField.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const orchestratorFake = {
  ...tripScreenStub(),
  cloneTrip: vi.fn((): string | null => null),
}

function seedSource() {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: TABLE.trips,
    id: 'src',
    deleted: false,
    row: { name: 'Engadin 2025', status: 'archived', year: 2025 },
  })
  trips.applyChange({
    seq: 0,
    table: TABLE.travelers,
    id: 'tr1',
    deleted: false,
    row: { trip_id: 'src', name: 'Andy' },
  })
  trips.applyChange({
    seq: 0,
    table: TABLE.tripItems,
    id: 'a',
    deleted: false,
    row: {
      trip_id: 'src',
      name: 'Zelt',
      quantity: 1,
      packed_count: 1,
      state: 'packed',
      mode: 'pack',
    },
  })
  return trips
}

function mountPage() {
  return mount(ClonePage, {
    props: { tripId: 'src' },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  orchestratorFake.loadedTrips.clear()
  vi.clearAllMocks()
})

describe('ClonePage — rows not on the device (ADR-033)', () => {
  it('asks for the rows, says it is loading, and does not offer the clone', async () => {
    seedSource()
    const wrapper = mountPage()

    // It asked for the partition rather than summing an absence.
    expect(orchestratorFake.drainTrip).toHaveBeenCalledWith('src')

    // The preview names the wait — never "0 Packelemente" for rows it has not seen.
    expect(wrapper.text()).toContain(t('clone.previewLoading'))
    expect(wrapper.text()).not.toContain(t('clone.previewItems', { n: 0 }))

    // A name alone must not unlock the button while the rows are missing.
    await wrapper
      .findComponent(IonInput)
      .vm.$emit('ionInput', { detail: { value: 'Engadin 2026' } })
    expect(wrapper.findComponent(IonButton).props('disabled')).toBe(true)
  })

  it('shows the real counts and offers the clone once the rows are here', async () => {
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    const wrapper = mountPage()

    expect(wrapper.text()).toContain(t('clone.previewItems', { n: 1 }))
    expect(wrapper.text()).toContain(t('clone.previewTravelers', { n: 1 }))
    expect(wrapper.text()).not.toContain(t('clone.previewLoading'))

    await wrapper
      .findComponent(IonInput)
      .vm.$emit('ionInput', { detail: { value: 'Engadin 2026' } })
    expect(wrapper.findComponent(IonButton).props('disabled')).toBe(false)
  })
})

describe('ClonePage — the new trip’s dates are one range (FR-2.1d, G-17)', () => {
  it('clones with the range picked', async () => {
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    orchestratorFake.cloneTrip.mockReturnValue('trip-2')
    const wrapper = mountPage()

    await wrapper.findComponent(DateRangeField).vm.$emit('update', '2026-10-09', '2026-10-18')
    await wrapper.get('.confirm').trigger('click')

    expect(orchestratorFake.cloneTrip).toHaveBeenCalledWith(
      'src',
      expect.objectContaining({ startDate: '2026-10-09', endDate: '2026-10-18' }),
    )
  })

  it('clones with no dates while none is picked (FR-2.1b)', async () => {
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    orchestratorFake.cloneTrip.mockReturnValue('trip-2')
    const wrapper = mountPage()

    await wrapper.get('.confirm').trigger('click')

    expect(orchestratorFake.cloneTrip).toHaveBeenCalledWith(
      'src',
      expect.objectContaining({ startDate: null, endDate: null }),
    )
  })
})

/**
 * G-17 — the clone is one act. It writes and then leaves, and the button
 * stays under the finger until the route changes; a second tap must not
 * write a second trip, with the same name, on the same day.
 */
describe('M19 writes one clone however often the button is pressed', () => {
  it('ignores the second press', async () => {
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    orchestratorFake.cloneTrip.mockReturnValue('trip-2')
    const wrapper = mountPage()

    await wrapper.get('.confirm').trigger('click')
    await wrapper.get('.confirm').trigger('click')

    expect(orchestratorFake.cloneTrip).toHaveBeenCalledTimes(1)
  })

  it('keeps the door open when the clone did not happen', async () => {
    // `cloneTrip` returns null when the source is gone — nothing was written
    // and nowhere was navigated to, so the screen must still be usable.
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    orchestratorFake.cloneTrip.mockReturnValue(null)
    const wrapper = mountPage()

    await wrapper.get('.confirm').trigger('click')
    await wrapper.get('.confirm').trigger('click')

    expect(orchestratorFake.cloneTrip).toHaveBeenCalledTimes(2)
  })
})
