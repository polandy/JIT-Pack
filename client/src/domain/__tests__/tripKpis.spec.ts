/**
 * A trip's packing figures (FR-25.22): units not rows, a skipped row
 * contributing none, and FR-25.31's hidden rows taking their own
 * preparations out of the count with them.
 */
import { describe, it, expect } from 'vitest'

import { itemsWithOpenPrep, tripKpis } from '../tripKpis'
import type { PrepTask, TripItem } from '@/types/domain'

function item(id: string, overrides: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: id,
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
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
    updated_hlc: '',
    ...overrides,
  }
}

function prepTask(id: string, tripItemId: string, overrides: Partial<PrepTask> = {}): PrepTask {
  return {
    id,
    trip_id: 't1',
    trip_item_id: tripItemId,
    author_id: 'u1',
    body: id,
    task_state: 'open',
    task_tag_id: null,
    phase: null,
    due_date: null,
    created_at: null,
    assignee_user_id: null,
    resolved_at: null,
    resolved_by_user_id: null,
    ...overrides,
  }
}

describe('tripKpis', () => {
  it('sums units, weight and value across items (FR-25.22)', () => {
    const k = tripKpis(
      [
        item('i1', { quantity: 2, packed_count: 1, weight_grams: 100, value_cents: 500 }),
        item('i2', {
          quantity: 3,
          packed_count: 3,
          state: 'packed',
          weight_grams: 200,
          value_cents: 1000,
        }),
      ],
      [],
    )

    expect(k.totalItems).toBe(5) // 2 + 3
    expect(k.packedItems).toBe(4) // 1 + 3
    expect(k.totalWeight).toBe(800) // 100*2 + 200*3
    expect(k.packedWeight).toBe(700) // 100*1 + 200*3
    expect(k.totalValue).toBe(4000) // 500*2 + 1000*3
    expect(k.packedValue).toBe(3500) // 500*1 + 1000*3
  })

  it('takes a hidden row out of the count (FR-25.31)', () => {
    const items = [
      item('i1', { quantity: 2, packed_count: 1 }),
      item('i2', { quantity: 3, packed_count: 3, state: 'packed' }),
    ]

    const hidden = tripKpis(items, [], new Set(['i2']))
    expect(hidden.totalItems).toBe(2)
    expect(hidden.packedItems).toBe(1)
  })

  it('counts a skipped row as no units — not packed, not owed (amends FR-25.22)', () => {
    // A consciously-skipped row is neither packed nor part of what is left
    // to pack — it must not inflate the trip line the way a real packed row
    // does, or a trip with many skipped rows reads as further along than it is.
    const k = tripKpis([item('i1', { quantity: 0, packed_count: 0, state: 'skipped' })], [])
    expect(k.totalItems).toBe(0)
    expect(k.packedItems).toBe(0)
  })

  it('includes preparation counts, hiding a row with its own preparations', () => {
    const tasks = [
      prepTask('prep1', 'i1', { task_state: 'open' }),
      prepTask('prep2', 'i1', { task_state: 'resolved' }),
    ]
    const items = [item('i1')]

    const k = tripKpis(items, tasks)
    expect(k.totalPrepTasks).toBe(2)
    expect(k.resolvedPrepTasks).toBe(1)

    // FR-25.31: a row hidden while its removal's undo is live takes its preparations
    // out of the count with it; a hidden preparation leaves on its own.
    expect(tripKpis(items, tasks, new Set(['i1'])).totalPrepTasks).toBe(0)
    expect(tripKpis(items, tasks, new Set(['prep2']))).toMatchObject({
      totalPrepTasks: 1,
      resolvedPrepTasks: 0,
    })
  })
})

describe('itemsWithOpenPrep', () => {
  it('returns items with an open preparation', () => {
    const result = itemsWithOpenPrep(
      [
        item('i1', { name: 'Camera', packed_count: 1, state: 'packed' }),
        item('i2', { name: 'Clothes' }),
      ],
      [prepTask('prep1', 'i1', { body: 'Charge battery' })],
    )

    expect(result).toHaveLength(1)
    expect(result[0]!.item.name).toBe('Camera')
    expect(result[0]!.openPrepTasks).toHaveLength(1)
  })
})
