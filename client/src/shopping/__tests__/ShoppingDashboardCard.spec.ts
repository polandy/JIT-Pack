// @vitest-environment jsdom
/**
 * The shopping list on the dashboard (FR-30.7): the one card on M1 that can be
 * worked, by owner decision — check off, undo, add — with everything else left
 * to M6. What these pin: which list is *now*, the five-line cap and the way on,
 * that a check-off goes to the line's own write (an entry, or the packing
 * row's FR-3.3 through its source), and that a planned trip with nothing to
 * buy has no card at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'

import ShoppingDashboardCard from '../ShoppingDashboardCard.vue'
import { useShoppingStore } from '../store'
import { t } from '@/i18n'
import type { Mutation } from '@/api/types'
import { SHOPPING_SOURCES, type ShoppingLine, type ShoppingSource } from '@/lib/shoppingSources'
import type { ModuleHost } from '@/sync/featureModule'
import { changesOf } from '@/sync/optimistic'
import type { ShoppingMode } from '@/types/domain'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

let written: Mutation[] = []
const loadedTrips = reactive(new Set<string>(['t1']))

function fakeHost(): ModuleHost {
  let seq = 0
  return {
    mutation: (op, table, id, fields) => ({
      mutation_id: `m${++seq}`,
      op,
      table,
      id,
      fields,
      hlc: `h${seq}`,
    }),
    nowIso: () => '2026-09-19T14:32:00.000Z',
    writeTrip: (_trip, ...muts) => {
      for (const mut of muts) {
        written.push(mut.mutation)
        useShoppingStore().applyChanges(changesOf(mut.optimistic))
      }
    },
  }
}

function line(name: string): ShoppingLine {
  return {
    key: `src:${name}`,
    name,
    quantity: 1,
    recipients: [],
    section: null,
    buy: vi.fn(),
    unbuy: vi.fn(),
  }
}

function source(open: Partial<Record<ShoppingMode, ShoppingLine[]>>): ShoppingSource {
  return { open: (_trip, list) => open[list] ?? [], bought: () => [] }
}

function entry(id: string, name: string, list: ShoppingMode = 'buy_local') {
  useShoppingStore().applyChanges([
    {
      seq: 0,
      table: 'shopping_entries',
      id,
      deleted: false,
      row: { trip_id: 't1', name, list, bought: 0 },
    },
  ])
}

function mountCard(opts: { planned?: boolean; sources?: ShoppingSource[] } = {}) {
  return mount(ShoppingDashboardCard, {
    props: { tripId: 't1', tripName: 'Elba', planned: opts.planned ?? false },
    global: {
      stubs: { RouterLink: RouterLinkStub },
      provide: {
        [ORCHESTRATOR]: {
          moduleHost: fakeHost(),
          tripDataLoaded: (id: string) => loadedTrips.has(id),
        },
        [SHOPPING_SOURCES]: opts.sources ?? [],
      },
    },
  })
}

const rows = (card: ReturnType<typeof mountCard>) =>
  card.findAll('[data-testid="dash-shop-row"]').map((r) => r.find('.name').text())

beforeEach(() => {
  setActivePinia(createPinia())
  written = []
  loadedTrips.clear()
  loadedTrips.add('t1')
})

describe('ShoppingDashboardCard (FR-30.7)', () => {
  it('opens a running trip on the destination list, own entries first, packing lines tagged', () => {
    entry('e1', 'Brot')
    const card = mountCard({
      sources: [source({ buy_local: [line('Sonnencreme')], buy_before: [line('Hut')] })],
    })

    expect(rows(card)).toEqual(['Brot', 'Sonnencreme'])
    const [own, packing] = card.findAll('[data-testid="dash-shop-row"]')
    expect(own?.find('.tag').exists()).toBe(false)
    expect(packing?.find('.tag').text()).toBe(t('shopping.fromPacking'))
    expect(card.get('[data-testid="dash-shop-tab-local"]').attributes('aria-pressed')).toBe('true')
    expect(card.get('[data-testid="dash-shop-tab-before"]').text()).toBe(
      t('shopping.beforeDepartureCount', { n: 1 }),
    )
  })

  it('opens a planned trip on the list before departure, and names the trip', () => {
    const card = mountCard({ planned: true, sources: [source({ buy_before: [line('Adapter')] })] })
    expect(rows(card)).toEqual(['Adapter'])
    expect(card.get('.title').text()).toBe(t('shopping.cardTitleFor', { trip: 'Elba' }))
  })

  it('switches the list with the chip', async () => {
    const card = mountCard({ sources: [source({ buy_before: [line('Hut')] })] })
    await card.get('[data-testid="dash-shop-tab-before"]').trigger('click')
    expect(rows(card)).toEqual(['Hut'])
  })

  it('shows five lines and hands the rest over to M6', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(line)
    const card = mountCard({ sources: [source({ buy_local: many })] })
    expect(rows(card)).toHaveLength(5)
    const more = card.get('[data-testid="dash-shop-more"]')
    expect(more.text()).toContain(t('shopping.showAll', { n: 7 }))
    expect(card.getComponent(RouterLinkStub).props('to')).toBe('/trips/t1/shopping')
  })

  it('offers the way onto the list even when it is short', () => {
    const card = mountCard()
    expect(card.get('[data-testid="dash-shop-more"]').text()).toContain(t('shopping.openList'))
  })

  it('checks a packing line off through its own write, and undoes it from the card', async () => {
    const sunscreen = line('Sonnencreme')
    const card = mountCard({ sources: [source({ buy_local: [sunscreen] })] })

    await card.get('[data-testid="dash-shop-row"] ion-checkbox').trigger('ionChange')
    expect(sunscreen.buy).toHaveBeenCalledTimes(1)
    expect(written).toEqual([])
    expect(card.get('[data-testid="dash-shop-undo"]').text()).toContain(
      t('shopping.boughtUndoable', { name: 'Sonnencreme' }),
    )

    await card.get('[data-testid="dash-shop-undo-button"]').trigger('click')
    expect(sunscreen.unbuy).toHaveBeenCalledTimes(1)
    expect(card.find('[data-testid="dash-shop-undo"]').exists()).toBe(false)
  })

  it('checks an entry off as a purchase of the entry', async () => {
    entry('e1', 'Brot')
    const card = mountCard()
    await card.get('[data-testid="dash-shop-row"] ion-checkbox').trigger('ionChange')
    expect(written.at(-1)).toMatchObject({ op: 'upsert', id: 'e1', fields: { bought: 1 } })
    expect(rows(card)).toEqual([])
  })

  it('adds an entry to the list it shows', async () => {
    const card = mountCard({ planned: true, sources: [source({ buy_before: [line('Adapter')] })] })
    await card.get('[data-testid="dash-shop-add-input"]').setValue('  Vignette ')
    await card.get('[data-testid="dash-shop-add"]').trigger('submit')

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      op: 'insert',
      fields: { trip_id: 't1', name: 'Vignette', list: 'buy_before' },
    })
    expect(rows(card)).toEqual(['Vignette', 'Adapter'])
    expect(
      (card.get('[data-testid="dash-shop-add-input"]').element as HTMLInputElement).value,
    ).toBe('')
  })

  it('shows no card for a planned trip with nothing to buy — once its rows are here', async () => {
    loadedTrips.clear()
    const card = mountCard({ planned: true })
    // Not yet known: the card stands, and says nothing about an empty list.
    expect(card.find('[data-testid="dashboard-shopping-Elba"]').exists()).toBe(true)
    expect(card.find('[data-testid="dash-shop-empty"]').exists()).toBe(false)

    loadedTrips.add('t1')
    await flushPromises()
    expect(card.find('[data-testid="dashboard-shopping-Elba"]').exists()).toBe(false)
  })

  it('keeps the card of a running trip with nothing to buy, and says so', () => {
    const card = mountCard()
    expect(card.get('[data-testid="dash-shop-empty"]').text()).toBe(t('shopping.emptyLocal'))
  })
})
