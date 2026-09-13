// @vitest-environment jsdom
/**
 * M11 — ADR-033, on the trip partition this time: `useTripScreen` has exposed
 * `loaded` since U-10 and its own doc comment says a screen with an empty state
 * owes the guard, but M11 only destructured `trip`. So the G-7 state invited the
 * user to create the first piece of luggage over the three the trip already had,
 * and a bag created that way is a duplicate nobody asked for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ContainerPage from '../ContainerPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const tripScreen = tripScreenStub()
const orchestratorFake = {
  ...tripScreen,
  addContainer: vi.fn(() => 'c-new'),
  assignContainer: vi.fn(),
}

function seedTrip() {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: TABLE.trips,
    id: 't1',
    deleted: false,
    row: { name: 'Samedan', year: 2026, status: 'active' },
  })
  return trips
}

function mountPage() {
  return mount(ContainerPage, {
    props: { tripId: 't1' },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  tripScreen.loadedTrips.clear()
})

describe('M11 luggage — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the luggage is loading rather than claiming there is none', async () => {
    seedTrip()

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m11-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m11-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('container.listUnknown'))

    // The partition arrives and the trip genuinely has no luggage: only now is
    // the G-7 invitation the honest answer.
    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m11-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m11-empty"]').exists()).toBe(true)
  })

  it('shows neither state once a container is on the device', async () => {
    const trips = seedTrip()
    trips.applyChange({
      seq: 0,
      table: TABLE.containers,
      id: 'c1',
      deleted: false,
      row: { trip_id: 't1', name: 'Rucksack' },
    })
    tripScreen.loadedTrips.add('t1')

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m11-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m11-empty"]').exists()).toBe(false)
    expect(page.findAll('[data-testid="m11-container-card"]')).toHaveLength(1)
  })
})
