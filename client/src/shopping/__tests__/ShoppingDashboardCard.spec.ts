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
import { presentToast } from '@/lib/toast'

vi.mock('@/lib/toast', () => ({ presentToast: vi.fn(() => Promise.resolve()) }))

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
    buy: vi.fn(),
    unbuy: vi.fn(),
  }
}

function source(open: Partial<Record<ShoppingMode, ShoppingLine[]>>): ShoppingSource {
  return { open: (_trip, list) => open[list] ?? [], bought: () => [] }
}

function entry(
  id: string,
  name: string,
  list: ShoppingMode = 'buy_local',
  tag: string | null = null,
) {
  useShoppingStore().applyChanges([
    {
      seq: 0,
      table: 'shopping_entries',
      id,
      deleted: false,
      row: { trip_id: 't1', name, list, bought: 0, tag },
    },
  ])
}

function mountCard(
  opts: {
    planned?: boolean
    packingClosed?: boolean
    embedded?: boolean
    sources?: ShoppingSource[]
  } = {},
) {
  return mount(ShoppingDashboardCard, {
    props: {
      tripId: 't1',
      tripName: 'Elba',
      planned: opts.planned ?? false,
      packingClosed: opts.packingClosed ?? false,
      embedded: opts.embedded ?? false,
    },
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
  localStorage.clear()
  vi.mocked(presentToast).mockClear()
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

  it('shows an entry’s tag, and puts the check-off at the end of the row (FR-30.9)', () => {
    entry('e1', 'Brot', 'buy_local', 'Supermarkt')
    const card = mountCard()

    const row = card.get('[data-testid="dash-shop-row"]')
    expect(row.get('[data-testid="dash-shop-row-tag"]').text()).toBe('Supermarkt')
    const children = [...row.element.children].map((el) => el.tagName.toLowerCase())
    expect(children.at(-1)).toBe('ion-checkbox')
  })

  it('opens a planned trip on the list before departure, and names the trip', () => {
    const card = mountCard({ planned: true, sources: [source({ buy_before: [line('Adapter')] })] })
    expect(rows(card)).toEqual(['Adapter'])
    expect(card.get('.title').text()).toBe(t('shopping.cardTitleFor', { trip: 'Elba' }))
  })

  // FR-30.8: the same rule M6 opens on, so the two never disagree about the
  // same trip. Closed packing on a trip nobody has tapped *Reise starten* on
  // is exactly the case the phase alone gets wrong.
  it('opens a planned trip at the destination once its packing is finished (FR-5.10)', () => {
    const card = mountCard({
      planned: true,
      packingClosed: true,
      sources: [source({ buy_before: [line('Adapter')], buy_local: [line('Brot')] })],
    })
    expect(rows(card)).toEqual(['Brot'])
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

/**
 * FR-7.10: once the packing is finished the card is a block of the hero — the
 * same object as the task block, seven lines, no chip. The list it reads is
 * still the one in focus, and every write is still the card's own.
 */
describe('ShoppingDashboardCard as a block of the hero (FR-7.10)', () => {
  const blockRows = (card: ReturnType<typeof mountCard>) =>
    card.findAll('[data-testid="dash-shop-row"]').map((r) => r.find('.title').text())
  const embedded = (opts: Parameters<typeof mountCard>[0] = {}) =>
    mountCard({ ...opts, embedded: true, packingClosed: true })

  it('shows seven lines and says how many more there are', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(line)
    const card = embedded({ sources: [source({ buy_local: many })] })
    expect(blockRows(card)).toHaveLength(7)
    expect(card.get('[data-testid="dashboard-shopping-Elba-count"]').text()).toBe('9')
    expect(card.get('[data-testid="dashboard-shopping-Elba-more"]').text()).toContain(
      t('shopping.moreLines', { n: 2 }),
    )
    expect(card.getComponent(RouterLinkStub).props('to')).toBe('/trips/t1/shopping')
  })

  it('has no chip: it reads the list in focus and nothing else', () => {
    const card = embedded({ sources: [source({ buy_before: [line('Hut')] })] })
    expect(card.find('[data-testid="dash-shop-tab-before"]').exists()).toBe(false)
    expect(blockRows(card)).toEqual([])
  })

  it('checks a line off on the right, through the line’s own write, with the card’s undo', async () => {
    const sunscreen = line('Sonnencreme')
    const card = embedded({ sources: [source({ buy_local: [sunscreen] })] })

    await card.get('[data-testid="dash-shop-row-check"]').trigger('click')

    expect(sunscreen.buy).toHaveBeenCalledTimes(1)
    expect(card.get('[data-testid="dash-shop-undo"]').text()).toContain(
      t('shopping.boughtUndoable', { name: 'Sonnencreme' }),
    )
  })

  it('adds an entry to the list shown and says where it went', async () => {
    const card = embedded()
    await card.get('[data-testid="dashboard-shopping-Elba-add-input"]').setValue(' Milch ')
    await card.get('[data-testid="dashboard-shopping-Elba-add"]').trigger('submit')

    expect(written[0]).toMatchObject({
      op: 'insert',
      fields: { trip_id: 't1', name: 'Milch', list: 'buy_local' },
    })
    expect(presentToast).toHaveBeenCalledWith({
      message: t('shopping.addedToList', { name: 'Milch' }),
    })
    expect(blockRows(card)).toEqual(['Milch'])
  })

  it('does not unfold when something is added to it — the count moves and the toast speaks', async () => {
    const card = embedded()
    await card.get('[data-testid="dashboard-shopping-Elba-fold"]').trigger('click')
    expect(card.get('[data-testid="dashboard-shopping-Elba"]').attributes('data-folded')).toBe(
      'true',
    )

    await card.get('[data-testid="dashboard-shopping-Elba-add-input"]').setValue('Milch')
    await card.get('[data-testid="dashboard-shopping-Elba-add"]').trigger('submit')

    expect(card.get('[data-testid="dashboard-shopping-Elba"]').attributes('data-folded')).toBe(
      'true',
    )
    expect(card.get('[data-testid="dashboard-shopping-Elba-count"]').text()).toBe('1')
    expect(presentToast).toHaveBeenCalledTimes(1)
  })

  it('stays with its field and a sentence when nothing is left to buy', () => {
    const card = embedded()
    expect(card.get('[data-testid="dashboard-shopping-Elba-empty"]').text()).toBe(
      t('shopping.emptyLocal'),
    )
    expect(card.find('[data-testid="dashboard-shopping-Elba-add-input"]').exists()).toBe(true)
  })

  it('remembers its fold apart from the task block’s', async () => {
    const card = embedded()
    await card.get('[data-testid="dashboard-shopping-Elba-fold"]').trigger('click')
    expect(localStorage.getItem('jp_dash_fold_shopping')).toBe('folded')
    expect(localStorage.getItem('jp_dash_fold_tasks')).toBeNull()
  })
})
