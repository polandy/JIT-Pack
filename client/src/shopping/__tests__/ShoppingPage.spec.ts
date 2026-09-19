// @vitest-environment jsdom
/**
 * M6 — the shopping list as its own module (FR-30, ADR-066).
 *
 * The screen renders lines and never learns whose they are: the list's own
 * entries, written through the module host, and whatever a provided source
 * contributes — here a fake, because what a *packing* line means is the
 * packing side's contract (`composables/__tests__/packingShoppingSource.spec.ts`,
 * `domain/__tests__/buyRows.spec.ts`). What this spec pins is the module's
 * half: entries are added, checked off, put back and removed as rows of their
 * own table; a source line's check-off goes to the source and nowhere else;
 * and the reveal, the counts and the ADR-033 guard read both alike.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IonInput } from '@ionic/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import ShoppingPage from '../ShoppingPage.vue'
import { useShoppingStore } from '../store'
import { t } from '@/i18n'
import type { Mutation } from '@/api/types'
import { SHOPPING_SOURCES, type ShoppingLine, type ShoppingSource } from '@/lib/shoppingSources'
import type { ModuleHost } from '@/sync/featureModule'
import { changesOf } from '@/sync/optimistic'
import type { ShoppingMode } from '@/types/domain'

import { tripScreenStub } from '@/composables/__tests__/tripScreenStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const tripScreen = tripScreenStub()

/** Every mutation the module queued, in order. */
let written: Mutation[] = []

/**
 * The host the orchestrator hands out, doing what the real one does to the
 * device: the optimistic rows reach the module's store before anything else.
 */
function fakeHost(): ModuleHost {
  let seq = 0
  return {
    mutation: (op, table, id, fields) => ({
      mutation_id: `m${++seq}`,
      op,
      table,
      id,
      fields,
      hlc: `hlc-${seq}`,
    }),
    writeTrip: (_tripId, ...muts) => {
      for (const mut of muts) {
        written.push(mut.mutation)
        useShoppingStore().applyChanges(changesOf(mut.optimistic))
      }
    },
  }
}

/** A line as a source would hand it over, with its writes recorded. */
function line(over: Partial<ShoppingLine> = {}): ShoppingLine {
  return {
    key: `src:${over.name ?? 'x'}`,
    name: 'Sonnencreme',
    quantity: 1,
    recipients: [],
    section: 'Pflege',
    buy: vi.fn(),
    unbuy: vi.fn(),
    ...over,
  }
}

function source(
  open: Partial<Record<ShoppingMode, ShoppingLine[]>>,
  bought: Partial<Record<ShoppingMode, ShoppingLine[]>> = {},
): ShoppingSource {
  return {
    open: (_trip, list) => open[list] ?? [],
    bought: (_trip, list) => bought[list] ?? [],
  }
}

function mountPage(sources?: ShoppingSource[]) {
  const provide: Record<symbol, unknown> = {
    [ORCHESTRATOR]: { ...tripScreen, moduleHost: fakeHost() },
  }
  if (sources) provide[SHOPPING_SOURCES] = sources
  return mount(ShoppingPage, { props: { tripId: 't1' }, global: { provide } })
}

function seedEntry(id: string, row: Record<string, unknown>) {
  useShoppingStore().applyChanges([
    {
      seq: 0,
      table: 'shopping_entries',
      id,
      deleted: false,
      row: { trip_id: 't1', list: 'buy_before', bought: 0, ...row },
    },
  ])
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  written = []
  tripScreen.loadedTrips.clear()
  tripScreen.loadedTrips.add('t1')
})

describe('M6 — the list’s own entries (FR-30.1)', () => {
  it('adds what was typed to the open tab’s list, as a shopping entry, and clears the field', async () => {
    const page = mountPage()
    await page.findComponent({ name: 'IonSegment' }).vm.$emit('ionChange', {
      detail: { value: 'buy_local' },
    })

    const input = page.findComponent(IonInput)
    await input.setValue('  Milch  ')
    expect(input.props('modelValue')).toBe('  Milch  ')
    await page.find('[data-testid="m6-add"]').trigger('submit')

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      op: 'insert',
      table: 'shopping_entries',
      fields: { trip_id: 't1', name: 'Milch', list: 'buy_local', bought: 0 },
    })
    const rows = page.findAll('[data-testid="m6-row"]')
    expect(rows.map((r) => r.text())).toEqual(['Milch'])
    expect(page.find('[data-testid="m6-group-own"]').text()).toContain(t('shopping.ownEntries'))
    expect(input.props('modelValue')).toBe('')
  })

  it('adds nothing for a blank field', async () => {
    const page = mountPage()
    await page.findComponent(IonInput).setValue('   ')
    await page.find('[data-testid="m6-add"]').trigger('submit')

    expect(written).toEqual([])
    expect(page.find('[data-testid="m6-empty"]').exists()).toBe(true)
  })

  it('checking an entry off buys it and moves it under the reveal; unchecking puts it back', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')
    expect(written.at(-1)).toMatchObject({ op: 'upsert', id: 'e1', fields: { bought: 1 } })
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(0)

    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    const bought = page.findAll('[data-testid="m6-bought-row"]')
    expect(bought.map((r) => r.text())).toEqual(['Brot'])
    // An entry was never anywhere but here, so there is nowhere to say it went.
    expect(page.find('[data-testid="m6-bought-note"]').exists()).toBe(false)

    await bought[0]!.find('ion-checkbox').trigger('ionChange')
    expect(written.at(-1)).toMatchObject({ op: 'upsert', id: 'e1', fields: { bought: 0 } })
    expect(page.findAll('[data-testid="m6-row"]').map((r) => r.text())).toEqual(['Brot'])
  })

  it('removes an entry as a delete of its own row', async () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()

    await page.find('[data-testid="m6-row-remove"]').trigger('click')

    expect(written.at(-1)).toMatchObject({ op: 'delete', table: 'shopping_entries', id: 'e1' })
    expect(page.find('[data-testid="m6-row"]').exists()).toBe(false)
  })

  it('lists entries by name, so the order survives a reload', () => {
    seedEntry('e2', { name: 'Milch' })
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage()
    expect(page.findAll('[data-testid="m6-row"]').map((r) => r.text())).toEqual(['Brot', 'Milch'])
  })

  it('keeps each list’s entries on their own tab', () => {
    seedEntry('e1', { name: 'Brot', list: 'buy_local' })
    const page = mountPage()
    expect(page.find('[data-testid="m6-row"]').exists()).toBe(false)
    expect(page.find('[data-testid="m6-tab-local"]').text()).toBe(
      t('shopping.atDestinationCount', { n: 1 }),
    )
  })
})

describe('M6 — lines from a source (FR-30.2)', () => {
  it('files the own entries first, then the source’s lines under its headings', () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage([
      source({
        buy_before: [
          line({ name: 'Sonnencreme', section: 'Pflege' }),
          line({ name: 'Adapter', section: null }),
        ],
      }),
    ])

    const groups = page.findAll('ion-item-group')
    expect(groups.map((g) => g.attributes('data-testid'))).toEqual([
      'm6-group-own',
      'm6-group-Pflege',
      'm6-group-none',
    ])
    expect(groups[2]?.text()).toContain(t('shopping.uncategorized'))
  })

  it('checking a source line off calls its own write and writes no entry', async () => {
    const sunscreen = line({ name: 'Sonnencreme' })
    const page = mountPage([source({ buy_before: [sunscreen] })])

    await page.find('[data-testid="m6-row"] ion-checkbox').trigger('ionChange')

    expect(sunscreen.buy).toHaveBeenCalledTimes(1)
    expect(written).toEqual([])
  })

  it('offers no remove on a source line', () => {
    const page = mountPage([source({ buy_before: [line()] })])
    // The positive signal beside the absence: the row is there.
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m6-row-remove"]').exists()).toBe(false)
  })

  it('renders the amount and the recipients a source aggregated (FR-25.6)', () => {
    const page = mountPage([
      source({
        buy_before: [
          line({
            name: 'Kurze Hosen',
            quantity: 6,
            recipients: [
              { id: 'tr1', name: 'Andy' },
              { id: 'tr2', name: 'Mia' },
            ],
          }),
        ],
      }),
    ])
    const row = page.find('[data-testid="m6-row"]')
    expect(row.text()).toContain('6×')
    expect(row.find('[data-testid="m6-row-for"]').text()).toContain(
      t('shopping.forWhom', { names: 'Andy, Mia' }),
    )
  })

  it('the tabs count own entries and source lines alike', () => {
    seedEntry('e1', { name: 'Brot' })
    const page = mountPage([source({ buy_before: [line()], buy_local: [line({ name: 'Wein' })] })])
    expect(page.find('[data-testid="m6-tab-before"]').text()).toBe(
      t('shopping.beforeDepartureCount', { n: 2 }),
    )
    expect(page.find('[data-testid="m6-tab-local"]').text()).toBe(
      t('shopping.atDestinationCount', { n: 1 }),
    )
  })
})

describe('M6 — what was bought stays reversible (FR-25.11j)', () => {
  it('offers no reveal while nothing has been bought', () => {
    const page = mountPage([source({ buy_before: [line()] })])
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m6-bought-bar"]').exists()).toBe(false)
  })

  it('reveals what was bought, counted in the bar, hidden until tapped, with the source’s note', async () => {
    const bought = line({ name: 'Sonnencreme', boughtNote: t('shopping.wentToPacking') })
    const page = mountPage([
      source({ buy_before: [line({ name: 'Kaffee' })] }, { buy_before: [bought] }),
    ])

    const bar = page.find('[data-testid="m6-bought-bar"]')
    expect(bar.text()).toBe(t('shopping.showBought', { n: 1 }))
    expect(page.find('[data-testid="m6-bought-list"]').exists()).toBe(false)

    await bar.trigger('click')

    const rows = page.findAll('[data-testid="m6-bought-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.find('[data-testid="m6-bought-note"]').text()).toBe(t('shopping.wentToPacking'))
    expect(page.find('[data-testid="m6-bought-bar"]').text()).toBe(
      t('shopping.hideBought', { n: 1 }),
    )

    await rows[0]!.find('ion-checkbox').trigger('ionChange')
    expect(bought.unbuy).toHaveBeenCalledTimes(1)
  })
})

/**
 * ADR-033. „Nothing to buy before departure" is a sentence somebody leaves the
 * house on, and until this trip's partition is here it is a guess — for the
 * entries as much as for the packing rows, which travel the same partition.
 */
describe('M6 — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the list is loading rather than claiming there is nothing to buy', async () => {
    tripScreen.loadedTrips.clear()

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

  it('names its segments without a count until the list is on the device', async () => {
    tripScreen.loadedTrips.clear()

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
