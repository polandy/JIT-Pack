// @vitest-environment jsdom
/**
 * M11 — ADR-033, on the trip partition this time: `useTripScreen` exposes
 * `loaded` (U-10), and a screen with an empty state owes the guard. Without
 * it, the G-7 state invites the user to create the first piece of luggage over
 * the three the trip already has, and a bag created that way is a duplicate
 * nobody asked for.
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
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { barAll, barCount, barSelection } from '@/__tests__/headerSelection'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('@/composables/useHeaderSelection', async (actual) => ({
  ...(await actual<typeof import('@/composables/useHeaderSelection')>()),
  setHeaderSelection: (await import('@/__tests__/headerSelection')).captureSelection,
}))

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
    global: {
      provide: { [ORCHESTRATOR]: orchestratorFake },
      // jsdom never presents an `ion-modal`, so the picker is read in place.
      stubs: {
        SheetModal: { props: ['isOpen'], template: '<div v-if="isOpen"><slot /></div>' },
      },
    },
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

/*
 * FR-10.2 over ADR-075: the unassigned bucket selects like every other list,
 * and „In Gepäckstück …" opens the one picker once for the whole selection.
 * What is asserted is which positions the screen asked to assign where.
 */
describe('M11 luggage — several into one bag (FR-10.2, ADR-075)', () => {
  type Page = ReturnType<typeof mountPage>

  function seedBucket() {
    const trips = seedTrip()
    trips.applyChange({
      seq: 0,
      table: TABLE.containers,
      id: 'c1',
      deleted: false,
      row: { trip_id: 't1', name: 'Rucksack' },
    })
    for (const [id, name] of [
      ['ti-1', 'Zelt'],
      ['ti-2', 'Schlafsack'],
      ['ti-3', 'Kocher'],
    ]) {
      trips.applyChange({
        seq: 0,
        table: TABLE.tripItems,
        id: id!,
        deleted: false,
        row: { trip_id: 't1', name, quantity: 1, status: 'open' },
      })
    }
    tripScreen.loadedTrips.add('t1')
  }

  const rowNamed = (page: Page, name: string) =>
    page.findAll('[data-testid="m11-unassigned-row"]').find((r) => r.text().includes(name))!
  const assigned = () =>
    orchestratorFake.assignContainer.mock.calls.map(([, item, container]) => [
      (item as { id: string }).id,
      container,
    ])

  function headerActions(): HeaderAction[] {
    const build = vi.mocked(setHeaderActions).mock.calls.at(-1)![0] as () => HeaderAction[]
    return build()
  }

  it('a tap outside the mode still opens the picker for that one position', async () => {
    seedBucket()
    const page = mountPage()
    await flushPromises()

    await rowNamed(page, 'Zelt').trigger('pointerdown')
    await rowNamed(page, 'Zelt').trigger('click')
    await flushPromises()

    expect(barSelection()).toBeNull()
    expect(page.get('[data-testid="m11-picker-subject"]').text()).toBe('Zelt')
    await page.get('[data-testid="m11-picker-option"]').trigger('click')
    expect(assigned()).toEqual([['ti-1', 'c1']])
  })

  it('a right-click selects, a tap picks, and the bar assigns the selection in one pick', async () => {
    seedBucket()
    const page = mountPage()
    await flushPromises()

    await rowNamed(page, 'Zelt').trigger('contextmenu')
    // The release's own click, with no press of its own: spent on the hold.
    await rowNamed(page, 'Zelt').trigger('click')
    await rowNamed(page, 'Kocher').trigger('pointerdown')
    await rowNamed(page, 'Kocher').trigger('click')
    await flushPromises()

    expect(barCount()).toBe(t('selection.count', { n: 2 }))
    // Tapping a row in the mode picks it; it does not open the picker.
    expect(page.find('[data-testid="m11-picker-subject"]').exists()).toBe(false)
    expect(page.find('[data-testid="m11-fab"]').exists()).toBe(false)

    await page.get('[data-testid="m11-bulk-assign"]').trigger('click')
    await flushPromises()
    expect(page.get('[data-testid="m11-picker-subject"]').text()).toBe(
      t('container.assignCount', { n: 2 }),
    )
    await page.get('[data-testid="m11-picker-option"]').trigger('click')
    await flushPromises()

    expect(assigned().sort()).toEqual(
      [
        ['ti-1', 'c1'],
        ['ti-3', 'c1'],
      ].sort(),
    )
    expect(barSelection()).toBeNull()
  })

  it('ends the mode after a batch of one, as after any batch', async () => {
    seedBucket()
    const page = mountPage()
    await flushPromises()

    await rowNamed(page, 'Kocher').trigger('contextmenu')
    await rowNamed(page, 'Kocher').trigger('click')
    await page.get('[data-testid="m11-bulk-assign"]').trigger('click')
    await flushPromises()
    await page.get('[data-testid="m11-picker-option"]').trigger('click')
    await flushPromises()

    expect(assigned()).toEqual([['ti-3', 'c1']])
    expect(barSelection()).toBeNull()
  })

  it('arms from the app bar only while the bucket holds something, and „Alle" takes it all', async () => {
    const trips = seedTrip()
    tripScreen.loadedTrips.add('t1')
    mountPage()
    await flushPromises()
    expect(headerActions().map((a) => a.id)).not.toContain('m11-select')

    trips.applyChange({
      seq: 0,
      table: TABLE.tripItems,
      id: 'ti-9',
      deleted: false,
      row: { trip_id: 't1', name: 'Stirnlampe', quantity: 1, status: 'open' },
    })
    await flushPromises()
    headerActions()
      .find((a) => a.id === 'm11-select')!
      .onClick()
    await flushPromises()
    expect(barCount()).toBe(t('selection.none'))

    await barAll()
    expect(barCount()).toBe(t('selection.count', { n: 1 }))
  })
})
