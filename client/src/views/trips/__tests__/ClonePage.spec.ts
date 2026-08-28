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
import DateField from '@/components/global/DateField.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const orchestratorFake = {
  loadedTrips: new Set<string>(),
  tripDataLoaded: vi.fn((tripId: string) => orchestratorFake.loadedTrips.has(tripId)),
  ensureTripData: vi.fn(() => Promise.resolve()),
  cloneTrip: vi.fn(() => null),
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
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  orchestratorFake.loadedTrips = new Set<string>()
  vi.clearAllMocks()
})

describe('ClonePage — rows not on the device (ADR-033)', () => {
  it('asks for the rows, says it is loading, and does not offer the clone', async () => {
    seedSource()
    const wrapper = mountPage()

    // It asked for the partition rather than summing an absence.
    expect(orchestratorFake.ensureTripData).toHaveBeenCalledWith('src')

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

describe('ClonePage — the two dates bound each other (FR-2.1d)', () => {
  const fields = (w: ReturnType<typeof mountPage>) => {
    const [start, end] = w.findAllComponents(DateField)
    return { start: start!, end: end! }
  }

  it('offers no end before the start it already has', async () => {
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    const wrapper = mountPage()

    await fields(wrapper).start.vm.$emit('update', '2026-09-26')

    // The bound travels to the calendar, so the invalid day is never
    // offered — there is no state to reject afterwards.
    expect(fields(wrapper).end.props('min')).toBe('2026-09-26')
  })

  it('offers no start after the end it already has', async () => {
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    const wrapper = mountPage()

    await fields(wrapper).end.vm.$emit('update', '2026-09-05')

    expect(fields(wrapper).start.props('max')).toBe('2026-09-05')
  })

  it('leaves the counterpart unbounded while it is empty', () => {
    seedSource()
    orchestratorFake.loadedTrips.add('src')
    const wrapper = mountPage()

    // No date set is no restriction: a clone of a trip whose dates are still
    // open must be able to reach any day in either field.
    expect(fields(wrapper).start.props('max')).toBe('')
    expect(fields(wrapper).end.props('min')).toBe('')
  })
})
