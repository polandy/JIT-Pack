/**
 * FR-31.8 — an excursion's vor-Ort lines on M6's Vor-Ort list: a projection
 * of the line, filed under the excursion's name, bought by stamping the line.
 */
import { describe, expect, it, vi } from 'vitest'

import { createExcursionShoppingSource } from '../excursionShoppingSource'
import type { Excursion, ExcursionItem, Traveler } from '@/types/domain'

const excursion: Excursion = {
  id: 'ex-1',
  trip_id: 't',
  name: 'Hüttentour',
  starts_on: null,
  ends_on: null,
  source_template_id: null,
}
const sia: Traveler = { id: 'tr-sia', trip_id: 't', name: 'Sia', linked_user_id: null }

function line(id: string, extra: Partial<ExcursionItem> = {}): ExcursionItem {
  return {
    id,
    trip_id: 't',
    excursion_id: 'ex-1',
    trip_item_id: null,
    source_item_id: null,
    name: id,
    category_name: null,
    assigned_traveler_id: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'buy_local',
    bought_at: null,
    not_in_luggage: false,
    for_all_participants: false,
    ...extra,
  }
}

function source(lines: ExcursionItem[]) {
  const markBought = vi.fn()
  const placeLineOnShopping = vi.fn()
  const src = createExcursionShoppingSource(
    { getExcursions: () => [excursion], getExcursionItems: () => lines, getTravelers: () => [sia] },
    { markBought, placeLineOnShopping },
  )
  return { src, markBought, placeLineOnShopping }
}

describe('the excursion shopping source (FR-31.8)', () => {
  it('offers the open vor-Ort lines under the excursion’s name, for whom they are', () => {
    const { src } = source([
      line('Proviant', { quantity: 2, assigned_traveler_id: 'tr-sia' }),
      line('Stirnlampe', { mode: 'pack' }),
      line('Brot', { bought_at: '2026-07-16T07:00:00Z' }),
      line('Hut', { quantity: 0, state: 'skipped' }),
    ])
    const open = src.open('t', 'buy_local')
    expect(
      open.map((l) => [l.name, l.quantity, l.section, l.recipients.map((r) => r.name)]),
    ).toEqual([['Proviant', 2, 'Hüttentour', ['Sia']]])
    expect(src.bought('t', 'buy_local').map((l) => l.name)).toEqual(['Brot'])
  })

  it('never offers anything before departure — an excursion is on the road', () => {
    const { src } = source([line('Proviant')])
    expect(src.open('t', 'buy_before')).toEqual([])
    expect(src.bought('t', 'buy_before')).toEqual([])
  })

  it('reads and writes the line’s place on the Vor-Ort list (FR-30.13)', () => {
    const proviant = line('Proviant', { shopping_position: 2 })
    const { src, placeLineOnShopping } = source([proviant])
    const [shown] = src.open('t', 'buy_local')
    expect(shown?.position).toBe(2)
    shown!.place(0)
    expect(placeLineOnShopping).toHaveBeenLastCalledWith(proviant, 0)
  })

  it('buys by stamping the line and puts it back by clearing the stamp', () => {
    const proviant = line('Proviant')
    const { src, markBought } = source([proviant])
    src.open('t', 'buy_local')[0]!.buy()
    expect(markBought).toHaveBeenLastCalledWith(proviant, true)
    src.open('t', 'buy_local')[0]!.unbuy()
    expect(markBought).toHaveBeenLastCalledWith(proviant, false)
  })
})
