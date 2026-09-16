// @vitest-environment jsdom
/**
 * M6 — FR-25.11j: leaving a shopping list stays reversible.
 *
 * Checking off a BUY_BEFORE row changes its mode (FR-3.3), so the row is
 * gone from the shopping side; what this spec pins is that the list it left
 * travels with the change, that the reveal finds it again and says where it
 * went, and that unchecking puts it back. The e2e case covers the rendered
 * flow; the wiring — which orchestrator call, with which list — lives here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ShoppingPage from '../ShoppingPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { t } from '@/i18n'

import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const tripScreen = tripScreenStub()

const orchestratorFake = {
  ...tripScreen,
  buyItem: vi.fn(),
  unbuyItem: vi.fn(),
  quickAddItem: vi.fn(),
}

function seedTravelers(names: string[]) {
  const trips = useTripStore()
  for (const [i, name] of names.entries()) {
    trips.applyChange({
      seq: 0,
      table: 'travelers',
      id: `tr${i + 1}`,
      deleted: false,
      row: { trip_id: 't1', name },
    })
  }
}

function seedTrip(rows: Record<string, unknown>[]) {
  const trips = useTripStore()
  trips.applyChange({
    seq: 0,
    table: 'trips',
    id: 't1',
    deleted: false,
    row: { name: 'Samedan', status: 'active', year: 2026 },
  })
  for (const [i, row] of rows.entries()) {
    trips.applyChange({
      seq: 0,
      table: 'trip_items',
      id: `ti${i + 1}`,
      deleted: false,
      row: { trip_id: 't1', quantity: 1, packed_count: 0, state: 'open', mode: 'pack', ...row },
    })
  }
  return trips
}

function mountPage() {
  return mount(ShoppingPage, {
    props: { tripId: 't1' },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  tripScreen.loadedTrips.clear()
})

describe('M6 shopping — buying a row stays reversible (FR-25.11j)', () => {
  it('checks a row off naming the list it was bought from', async () => {
    seedTrip([{ name: 'Sonnencreme', mode: 'buy_before' }])
    const page = mountPage()

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')

    expect(orchestratorFake.buyItem).toHaveBeenCalledTimes(1)
    expect(orchestratorFake.buyItem.mock.calls[0]?.[2]).toBe('buy_before')
  })

  it('offers no reveal while nothing has been bought', () => {
    seedTrip([{ name: 'Sonnencreme', mode: 'buy_before' }])
    const page = mountPage()

    // The positive signal beside the absent bar: the row it would be about
    // is on screen and open, so the list is rendered and simply has nothing
    // done in it.
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m6-bought-bar"]').exists()).toBe(false)
  })

  it('reveals what was bought, counted in the bar and hidden until tapped', async () => {
    seedTrip([
      { name: 'Sonnencreme', mode: 'pack', bought_from: 'buy_before' },
      { name: 'Kaffee', mode: 'buy_before' },
    ])
    const page = mountPage()

    const bar = page.find('[data-testid="m6-bought-bar"]')
    expect(bar.text()).toBe(t('shopping.showBought', { n: 1 }))
    expect(page.find('[data-testid="m6-bought-list"]').exists()).toBe(false)

    await bar.trigger('click')

    const rows = page.findAll('[data-testid="m6-bought-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('Sonnencreme')
    expect(page.find('[data-testid="m6-bought-bar"]').text()).toBe(
      t('shopping.hideBought', { n: 1 }),
    )
  })

  it('a revealed row says where it went — read off the row, not off the tab', async () => {
    seedTrip([{ name: 'Sonnencreme', mode: 'pack', bought_from: 'buy_before' }])
    const page = mountPage()

    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    expect(page.find('[data-testid="m6-bought-note"]').text()).toBe(t('shopping.wentToPacking'))
  })

  it('a purchase at the destination never left its list, and says so instead', async () => {
    seedTrip([
      {
        name: 'Brot',
        mode: 'buy_local',
        state: 'packed',
        packed_count: 1,
        bought_from: 'buy_local',
      },
    ])
    const page = mountPage()

    await page.find('ion-segment').trigger('ionChange', { detail: { value: 'buy_local' } })
    await page.find('[data-testid="m6-bought-bar"]').trigger('click')

    const row = page.find('[data-testid="m6-bought-row"]')
    expect(row.text()).toContain('Brot')
    expect(page.find('[data-testid="m6-bought-note"]').text()).toBe(t('shopping.wentPacked'))
  })

  it('undoing a purchase puts it back on the list it was bought from', async () => {
    seedTrip([{ name: 'Sonnencreme', mode: 'pack', bought_from: 'buy_before' }])
    const page = mountPage()

    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    await page.find('[data-testid="m6-bought-row"] ion-checkbox').trigger('ionChange')

    expect(orchestratorFake.unbuyItem).toHaveBeenCalledTimes(1)
    expect(orchestratorFake.unbuyItem.mock.calls[0]?.[2]).toBe('buy_before')
  })
})

/**
 * FR-25.6 — a per-person item is one thing to buy.
 *
 * The row count is the assertion that matters here and it is a *shrinking*
 * one: three instances render as one row. Under the screen this replaced,
 * every one of them was its own row with its own check-off, and the amounts
 * made it plainly wrong rather than merely redundant.
 */
describe('M6 shopping — a per-person item is one buy row (FR-25.6)', () => {
  function seedPerPerson(mode: string) {
    seedTravelers(['Andy', 'Leonardo', 'Mia'])
    seedTrip([
      { name: 'Kurze Hosen', mode, source_item_id: 'm1', assigned_traveler_id: 'tr1', quantity: 2 },
      { name: 'Kurze Hosen', mode, source_item_id: 'm1', assigned_traveler_id: 'tr2', quantity: 3 },
      { name: 'Kurze Hosen', mode, source_item_id: 'm1', assigned_traveler_id: 'tr3', quantity: 1 },
    ])
  }

  it('renders one row with the summed amount and the recipients', () => {
    seedPerPerson('buy_before')
    const page = mountPage()

    const rows = page.findAll('[data-testid="m6-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('Kurze Hosen')
    expect(rows[0]?.text()).toContain('6×')
    expect(page.find('[data-testid="m6-row-for"]').text()).toContain(
      t('shopping.forWhom', { names: 'Andy, Leonardo, Mia' }),
    )
  })

  it('the tab counts things to buy, not rows', () => {
    seedPerPerson('buy_before')
    // The count is what this case is about, and since ADR-033 it is stated
    // only once the partition is here.
    tripScreen.loadedTrips.add('t1')
    const page = mountPage()

    expect(page.find('[data-testid="m6-tab-before"]').text()).toBe(
      t('shopping.beforeDepartureCount', { n: 1 }),
    )
  })

  it('checking it off settles every instance, not just the first (FR-3.3)', async () => {
    seedPerPerson('buy_before')
    const page = mountPage()

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')

    expect(orchestratorFake.buyItem).toHaveBeenCalledTimes(3)
    const settled = orchestratorFake.buyItem.mock.calls.map((call) => call[1].id)
    expect(new Set(settled)).toEqual(new Set(['ti1', 'ti2', 'ti3']))
  })

  it('comes back under the reveal as one row too, and goes back whole', async () => {
    seedTravelers(['Andy', 'Leonardo'])
    seedTrip([
      {
        name: 'Kurze Hosen',
        mode: 'pack',
        bought_from: 'buy_before',
        source_item_id: 'm1',
        assigned_traveler_id: 'tr1',
      },
      {
        name: 'Kurze Hosen',
        mode: 'pack',
        bought_from: 'buy_before',
        source_item_id: 'm1',
        assigned_traveler_id: 'tr2',
      },
    ])
    const page = mountPage()

    // The bar counts purchases, not rows — the same rule as the open tab's
    // segment, and the number a person compares against what they see.
    expect(page.find('[data-testid="m6-bought-bar"]').text()).toBe(
      t('shopping.showBought', { n: 1 }),
    )
    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    const rows = page.findAll('[data-testid="m6-bought-row"]')
    expect(rows).toHaveLength(1)

    await page.find('[data-testid="m6-bought-row"] ion-checkbox').trigger('ionChange')
    expect(orchestratorFake.unbuyItem).toHaveBeenCalledTimes(2)
  })

  it('a shared row is left alone: no recipients, one call', async () => {
    seedTravelers(['Andy', 'Leonardo'])
    seedTrip([{ name: 'Zelt', mode: 'buy_before', quantity: 2 }])
    const page = mountPage()

    expect(page.find('[data-testid="m6-row-for"]').exists()).toBe(false)
    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')
    expect(orchestratorFake.buyItem).toHaveBeenCalledTimes(1)
  })
})

/**
 * ADR-033. „Nothing to buy before departure" is a sentence somebody leaves the
 * house on, and until this trip's partition is here it is a guess. M6 read
 * `grouped` — empty before the pull and empty when the list really is done —
 * and said the same thing to both.
 */
describe('M6 shopping — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the list is loading rather than claiming there is nothing to buy', async () => {
    seedTrip([])

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m6-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m6-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('shopping.listUnknown'))

    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m6-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m6-empty"]').exists()).toBe(true)
    expect(page.text()).toContain(t('shopping.emptyBefore'))
  })

  /*
   * M23's defect, one partition down: „Before departure (0)" over a body that
   * says the list is still loading. Same rule, separate fix, because the two
   * screens read different guards — M6's is the trip partition's.
   */
  it('names its segments without a count until the list is on the device', async () => {
    seedTrip([])

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m6-tab-before"]').text()).toBe(t('shopping.beforeDeparture'))
    expect(page.find('[data-testid="m6-tab-local"]').text()).toBe(t('shopping.atDestination'))

    tripScreen.loadedTrips.add('t1')
    await flushPromises()

    expect(page.find('[data-testid="m6-tab-before"]').text()).toBe(
      t('shopping.beforeDepartureCount', { n: 0 }),
    )
    expect(page.find('[data-testid="m6-tab-local"]').text()).toBe(
      t('shopping.atDestinationCount', { n: 0 }),
    )
  })
})
