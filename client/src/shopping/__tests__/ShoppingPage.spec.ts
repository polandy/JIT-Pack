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
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'
import type { Mutation } from '@/api/types'
import { SHOPPING_SOURCES, type ShoppingLine, type ShoppingSource } from '@/lib/shoppingSources'
import type { ModuleHost } from '@/sync/featureModule'
import { changesOf } from '@/sync/optimistic'
import type { ShoppingMode } from '@/types/domain'

import { identityStub } from '@/composables/__tests__/identityStub'
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
    nowIso: () => TAP,
    writeTrip: (_tripId, ...muts) => {
      for (const mut of muts) {
        written.push(mut.mutation)
        useShoppingStore().applyChanges(changesOf(mut.optimistic))
      }
    },
  }
}

/** The clock the fake host reads, so a purchase's time is a known value. */
const TAP = '2026-09-19T14:32:00.000Z'

/** Who the instance knows: the viewer and a second account (FR-30.4). */
const people = [
  { user_id: 'u-andy', display_name: 'Andy' },
  { user_id: 'u-sia', display_name: 'Sia' },
]

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
    [ORCHESTRATOR]: {
      ...identityStub(),
      fetchUsers: async () => people,
      ...tripScreen,
      moduleHost: fakeHost(),
    },
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
    // FR-30.4: the tap's time travels with the purchase; who is the server's.
    expect(written.at(-1)).toMatchObject({
      op: 'upsert',
      id: 'e1',
      fields: { bought: 1, bought_at: TAP },
    })
    expect(page.findAll('[data-testid="m6-row"]')).toHaveLength(0)

    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    const bought = page.findAll('[data-testid="m6-bought-row"]')
    expect(bought.map((r) => r.find('h3').text())).toEqual(['Brot'])
    // An entry was never anywhere but here, so there is nowhere to say it went.
    expect(page.find('[data-testid="m6-bought-note"]').exists()).toBe(false)

    await bought[0]!.find('ion-checkbox').trigger('ionChange')
    expect(written.at(-1)).toMatchObject({
      op: 'upsert',
      id: 'e1',
      fields: { bought: 0, bought_at: null, bought_by_user_id: null },
    })
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

describe('M6 — the ＋ bottom right (FR-30.6)', () => {
  it('takes the reader to the field: scrolled to the top, focused', async () => {
    const page = mountPage()
    const content = page.find('ion-content').element as HTMLElement & { scrollToTop?: unknown }
    const input = page.find('ion-input').element as HTMLElement & { setFocus?: unknown }
    const calls: string[] = []
    content.scrollToTop = vi.fn(async () => void calls.push('scroll'))
    input.setFocus = vi.fn(async () => void calls.push('focus'))

    await page.find('[data-testid="m6-fab"]').trigger('click')
    await flushPromises()

    // Scrolled first: a focus on a field still off-screen opens the keyboard
    // over the list instead of beside the field.
    expect(calls).toEqual(['scroll', 'focus'])
    expect(written).toEqual([])
  })
})

describe('M6 — who bought it, and when (FR-30.4)', () => {
  it('names the buyer and the time on a bought entry, from the trip’s people', async () => {
    seedEntry('e1', {
      name: 'Brot',
      bought: 1,
      bought_at: new Date().toISOString(),
      bought_by_user_id: 'u-sia',
    })
    const page = mountPage()
    await flushPromises()

    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    const stamp = page.find('[data-testid="m6-bought-stamp"]')
    // The span, not the line: the avatar beside it contributes its initials.
    expect(stamp.findAll('span').at(-1)?.text()).toMatch(/^bought by Sia · today \S/)
    expect(stamp.find('[data-testid="user-avatar"]').exists()).toBe(true)
  })

  it('names the buyer on a source line too, from the id the source hands over', async () => {
    const bought = line({
      name: 'Sonnencreme',
      boughtNote: t('shopping.wentToPacking'),
      boughtAt: new Date().toISOString(),
      boughtBy: 'u-andy',
    })
    const page = mountPage([source({}, { buy_before: [bought] })])
    await flushPromises()

    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    const row = page.find('[data-testid="m6-bought-row"]')
    expect(row.find('[data-testid="m6-bought-note"]').text()).toBe(t('shopping.wentToPacking'))
    expect(row.findAll('[data-testid="m6-bought-stamp"] span').at(-1)?.text()).toMatch(
      /^bought by Andy · today /,
    )
  })

  it('states only the time where nobody can be named (Local Mode, G-8)', async () => {
    seedEntry('e1', { name: 'Brot', bought: 1, bought_at: new Date().toISOString() })
    const page = mountPage()
    await flushPromises()

    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    const stamp = page.find('[data-testid="m6-bought-stamp"]')
    expect(stamp.text()).toMatch(/^bought · today \S/)
    expect(stamp.find('[data-testid="user-avatar"]').exists()).toBe(false)
  })

  it('says nothing where the purchase carries no record at all', async () => {
    seedEntry('e1', { name: 'Brot', bought: 1 })
    const page = mountPage()
    await page.find('[data-testid="m6-bought-bar"]').trigger('click')
    // The positive signal beside the absence: the bought row itself is there.
    expect(page.findAll('[data-testid="m6-bought-row"]')).toHaveLength(1)
    expect(page.find('[data-testid="m6-bought-stamp"]').exists()).toBe(false)
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

/**
 * FR-30.8 — which list M6 opens on.
 *
 * „Vor der Abreise" is the right answer only while departure is ahead. The
 * rule itself is pinned in `list.spec.ts`; what is pinned here is that the
 * screen *asks* it — and that it waits for the trip before doing so, since a
 * rule read off an absent trip would open a planned trip at the destination
 * and then move the tab under the reader (ADR-033's reasoning).
 */
describe('M6 — the list that is now (FR-30.8)', () => {
  function seedTrip(row: Record<string, unknown>) {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.trips,
      id: 't1',
      deleted: false,
      row: { name: 'Samedan', year: 2026, ...row },
    })
  }

  const openTab = (page: ReturnType<typeof mountPage>) =>
    page.findComponent({ name: 'IonSegment' }).props('value')

  it('opens a planned trip on the list before departure', async () => {
    seedTrip({ status: 'planning' })

    const page = mountPage()
    await flushPromises()

    expect(openTab(page)).toBe('buy_before')
  })

  it('opens a running trip at the destination', async () => {
    seedTrip({ status: 'active' })

    const page = mountPage()
    await flushPromises()

    expect(openTab(page)).toBe('buy_local')
  })

  it('opens a planned trip at the destination once its packing is finished (FR-5.10)', async () => {
    seedTrip({ status: 'planning', packing_closed_at: '2026-09-20T18:40:00.000Z' })

    const page = mountPage()
    await flushPromises()

    expect(openTab(page)).toBe('buy_local')
  })

  it('keeps the tab the reader picked', async () => {
    seedTrip({ status: 'active' })

    const page = mountPage()
    await flushPromises()
    await page.findComponent({ name: 'IonSegment' }).vm.$emit('ionChange', {
      detail: { value: 'buy_before' },
    })

    expect(openTab(page)).toBe('buy_before')
  })

  it('stays on the list before departure while the trip itself is not here yet', async () => {
    const page = mountPage()
    await flushPromises()

    expect(openTab(page)).toBe('buy_before')
  })
})
