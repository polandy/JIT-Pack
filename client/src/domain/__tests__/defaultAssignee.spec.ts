/**
 * FR-1.9 over FR-24.9 — who a batch of items is usually somebody's job for.
 *
 * The rule under test is only which rows a batch may skip, and that is the
 * whole point of it: under field-level LWW a write nobody asked for is not
 * harmless, it is a newer clock carrying an unchanged value.
 */
import { describe, it, expect } from 'vitest'

import { planDefaultAssignee } from '../defaultAssignee'
import type { MasterItem } from '@/types/domain'

function item(id: string, assignee?: string | null): MasterItem {
  return {
    id,
    name: id,
    weight_grams: null,
    value_cents: null,
    // Absent rather than null where none was passed: the column is optional,
    // and the two spellings of „nobody" are one of the cases below.
    ...(assignee === undefined ? {} : { default_assignee_id: assignee }),
  }
}

describe('planDefaultAssignee (FR-1.9, FR-24.9)', () => {
  it('rewrites only the items that name somebody else', () => {
    const items = [item('i1', null), item('i2', 'u-sia'), item('i3', 'u-max')]

    const plan = planDefaultAssignee(items, 'u-sia')

    expect(plan.map((c) => c.item.id)).toEqual(['i1', 'i3'])
  })

  it('carries each item’s own previous value, which is what an undo needs', () => {
    const plan = planDefaultAssignee([item('i1', null), item('i3', 'u-max')], 'u-sia')

    expect(plan).toEqual([
      { item: expect.objectContaining({ id: 'i1' }), previous: null },
      { item: expect.objectContaining({ id: 'i3' }), previous: 'u-max' },
    ])
  })

  it('treats an item that has never named anybody as naming nobody', () => {
    // The column is optional, so „nobody" arrives as both `null` and absent —
    // and clearing an item that already carries neither must write nothing.
    expect(planDefaultAssignee([item('i1'), item('i2', null)], null)).toEqual([])
  })

  it('takes the assignment away again when nobody is asked for', () => {
    const plan = planDefaultAssignee([item('i1', 'u-sia'), item('i2', null)], null)

    expect(plan).toEqual([{ item: expect.objectContaining({ id: 'i1' }), previous: 'u-sia' }])
  })
})
