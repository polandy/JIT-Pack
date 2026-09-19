/**
 * The packing list's half of the shopping contract (FR-30.2, ADR-066).
 *
 * What these pin is what crosses the boundary: a packing row in a buy mode
 * reaches the shopping list as a line, and checking the line off writes
 * FR-3.3/FR-25.11j on the packing row — every instance of it, with the list it
 * was bought from — without the shopping module knowing any of that.
 */
import { describe, expect, it } from 'vitest'

import { t } from '@/i18n'
import type { ShoppingMode, Traveler, TripItem } from '@/types/domain'
import { createPackingShoppingSource } from '../packingShoppingSource'

let seq = 0
function item(over: Partial<TripItem> = {}): TripItem {
  seq += 1
  return {
    id: `i${seq}`,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: `Item ${seq}`,
    weight_grams: null,
    value_cents: null,
    category_name: 'Pflege',
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'buy_local',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
    bought_at: null,
    bought_by_user_id: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...over,
  }
}

const andy: Traveler = { id: 'tr1', trip_id: 't1', name: 'Andy', linked_user_id: null }
const mia: Traveler = { id: 'tr2', trip_id: 't1', name: 'Mia', linked_user_id: null }

function sourceWith(lists: {
  buyBefore?: TripItem[]
  buyLocal?: TripItem[]
  boughtBefore?: TripItem[]
  boughtLocal?: TripItem[]
}) {
  const writes: Array<{ verb: 'buy' | 'unbuy'; id: string; from: ShoppingMode }> = []
  const source = createPackingShoppingSource(
    {
      getShoppingItems: () => ({
        buyBefore: lists.buyBefore ?? [],
        buyLocal: lists.buyLocal ?? [],
        boughtBefore: lists.boughtBefore ?? [],
        boughtLocal: lists.boughtLocal ?? [],
      }),
      getTravelers: () => [andy, mia],
    },
    {
      buyItem: (_trip, row, from) => writes.push({ verb: 'buy', id: row.id, from }),
      unbuyItem: (_trip, row, from) => writes.push({ verb: 'unbuy', id: row.id, from }),
    },
  )
  return { source, writes }
}

describe('createPackingShoppingSource (FR-30.2)', () => {
  it('offers each list only the rows in its own mode', () => {
    const sunscreen = item({ name: 'Sonnencreme', mode: 'buy_before' })
    const bread = item({ name: 'Brot', mode: 'buy_local' })
    const { source } = sourceWith({ buyBefore: [sunscreen], buyLocal: [bread] })

    expect(source.open('t1', 'buy_before').map((l) => l.name)).toEqual(['Sonnencreme'])
    expect(source.open('t1', 'buy_local').map((l) => l.name)).toEqual(['Brot'])
  })

  it('files a line under its category, and a line without one under null', () => {
    const { source } = sourceWith({
      buyLocal: [item({ name: 'Brot', category_name: null }), item({ name: 'Duschgel' })],
    })
    expect(source.open('t1', 'buy_local').map((l) => [l.name, l.section])).toEqual([
      ['Brot', null],
      ['Duschgel', 'Pflege'],
    ])
  })

  it('a per-person item is one line, and buying it settles every instance from that list', () => {
    const forAndy = item({ name: 'Hut', source_item_id: 'm1', assigned_traveler_id: andy.id })
    const forMia = item({ name: 'Hut', source_item_id: 'm1', assigned_traveler_id: mia.id })
    const { source, writes } = sourceWith({ buyLocal: [forMia, forAndy] })

    const lines = source.open('t1', 'buy_local')
    expect(lines).toHaveLength(1)
    expect(lines[0]?.recipients.map((r) => r.name)).toEqual(['Andy', 'Mia'])

    lines[0]?.buy()
    expect(writes).toEqual([
      { verb: 'buy', id: forAndy.id, from: 'buy_local' },
      { verb: 'buy', id: forMia.id, from: 'buy_local' },
    ])
  })

  it('a bought line says where it went and puts itself back on its own list', () => {
    const toPack = item({ name: 'Sonnencreme', mode: 'pack', bought_from: 'buy_before' })
    const { source, writes } = sourceWith({ boughtBefore: [toPack] })

    const [line] = source.bought('t1', 'buy_before')
    expect(line?.boughtNote).toBe(t('shopping.wentToPacking'))
    line?.unbuy()
    expect(writes).toEqual([{ verb: 'unbuy', id: toPack.id, from: 'buy_before' }])
  })

  it('a bought line carries its purchase record, who and when (FR-30.4)', () => {
    const at = '2026-09-19T14:32:00Z'
    const bought = item({
      name: 'Kaffee',
      mode: 'pack',
      bought_from: 'buy_before',
      bought_at: at,
      bought_by_user_id: 'u-sia',
    })
    const { source } = sourceWith({ boughtBefore: [bought] })
    const [line] = source.bought('t1', 'buy_before')
    expect(line?.boughtAt).toBe(at)
    expect(line?.boughtBy).toBe('u-sia')
  })

  it('an open line carries no purchase record', () => {
    const { source } = sourceWith({
      buyLocal: [item({ bought_at: 'stale', bought_by_user_id: 'x' })],
    })
    const [line] = source.open('t1', 'buy_local')
    expect(line?.boughtAt).toBeUndefined()
    expect(line?.boughtBy).toBeUndefined()
  })

  it('a line bought at the destination reads as packed', () => {
    const packed = item({ name: 'Brot', state: 'packed', bought_from: 'buy_local' })
    const { source } = sourceWith({ boughtLocal: [packed] })
    expect(source.bought('t1', 'buy_local')[0]?.boughtNote).toBe(t('shopping.wentPacked'))
  })

  it('offers no remove — a packing row leaves the list by being bought or changing mode', () => {
    const { source } = sourceWith({ buyLocal: [item()] })
    expect(source.open('t1', 'buy_local')[0]?.remove).toBeUndefined()
  })
})
