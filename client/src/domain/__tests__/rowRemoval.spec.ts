/**
 * FR-5.8: removing a packing-list row. The rule worth pinning is *when the
 * removal asks first* — a row with nothing on it goes at once behind an undo,
 * and a row carrying progress, notes or companions says what it takes along
 * before it takes it.
 */
import { describe, it, expect } from 'vitest'

import {
  itemLeftUnused,
  itemLeftUnusedByRows,
  planRemoval,
  planRemovals,
  removalNeedsConfirm,
  type ItemUseSources,
  type RemovableRow,
} from '@/domain/rowRemoval'
import type { ItemDependency, TemplateItem, TripItem } from '@/types/domain'

function row(id: string, over: Partial<RemovableRow> = {}): RemovableRow {
  return { id, source_item_id: `item-${id}`, state: 'open', packed_count: 0, ...over }
}

/** Heringe depend on Zelt: removing the tent takes the pegs along (FR-20.2). */
const PEGS_ON_TENT: ItemDependency = {
  id: 'dep-1',
  item_id: 'item-pegs',
  depends_on_item_id: 'item-tent',
  mode: 'required',
  quantity: null,
}

describe('planRemoval (FR-5.8)', () => {
  it('an untouched row takes nothing along and asks nothing', () => {
    const tent = row('tent')
    const plan = planRemoval(tent, [tent], [], 0)
    expect(plan).toEqual({ packed: 0, notes: 0, companions: [] })
    expect(removalNeedsConfirm(plan)).toBe(false)
  })

  it('a row with packed units asks first — the progress goes with it', () => {
    const tent = row('tent', { packed_count: 2 })
    const plan = planRemoval(tent, [tent], [], 0)
    expect(plan.packed).toBe(2)
    expect(removalNeedsConfirm(plan)).toBe(true)
  })

  it('a row with notes asks first — its comments and todos cascade (FR-7.3)', () => {
    const tent = row('tent')
    const plan = planRemoval(tent, [tent], [], 3)
    expect(plan.notes).toBe(3)
    expect(removalNeedsConfirm(plan)).toBe(true)
  })

  it('a main item takes its companions along as co-skipped rows (FR-20.2), and asks', () => {
    const tent = row('tent')
    const pegs = row('pegs')
    const plan = planRemoval(tent, [tent, pegs], [PEGS_ON_TENT], 0)
    expect(plan.companions).toEqual([pegs])
    expect(removalNeedsConfirm(plan)).toBe(true)
  })

  it('a companion already skipped is not counted again', () => {
    const tent = row('tent')
    const pegs = row('pegs', { state: 'skipped' })
    const plan = planRemoval(tent, [tent, pegs], [PEGS_ON_TENT], 0)
    expect(plan.companions).toEqual([])
    expect(removalNeedsConfirm(plan)).toBe(false)
  })

  it('removing one per-person instance leaves the companions while another is still packed for', () => {
    const mine = row('tent-a', { source_item_id: 'item-tent' })
    const theirs = row('tent-b', { source_item_id: 'item-tent' })
    const pegs = row('pegs')
    const withSibling = planRemoval(mine, [mine, theirs, pegs], [PEGS_ON_TENT], 0)
    expect(withSibling.companions).toEqual([])
    // The same removal with the sibling gone does take them — so the empty
    // list above is the sibling's doing, not a companion rule that never fires.
    const alone = planRemoval(mine, [mine, pegs], [PEGS_ON_TENT], 0)
    expect(alone.companions).toEqual([pegs])
  })

  it('a skipped sibling does not keep the companions — the item is not on the trip (FR-20.2)', () => {
    const mine = row('tent-a', { source_item_id: 'item-tent' })
    const theirs = row('tent-b', { source_item_id: 'item-tent', state: 'skipped' })
    const pegs = row('pegs')
    const plan = planRemoval(mine, [mine, theirs, pegs], [PEGS_ON_TENT], 0)
    expect(plan.companions).toEqual([pegs])
  })

  it('a quick-added row has no master item and so no companions', () => {
    const adhoc = row('adhoc', { source_item_id: null })
    const pegs = row('pegs')
    expect(planRemoval(adhoc, [adhoc, pegs], [PEGS_ON_TENT], 0).companions).toEqual([])
  })
})

describe('planRemovals (FR-5.8, FR-25.26)', () => {
  it('sums what every row takes along', () => {
    const a = row('a', { source_item_id: 'item-tent', packed_count: 1 })
    const b = row('b', { source_item_id: 'item-tent', packed_count: 2 })
    const notes: Record<string, number> = { a: 1, b: 0 }
    const plan = planRemovals([a, b], [a, b], [], (target) => notes[target.id] ?? 0)
    expect(plan).toEqual({ packed: 3, notes: 1, companions: [] })
  })

  it('names the companions the instances only keep for each other (FR-20.2)', () => {
    // Row by row each instance still has the other on the list, so neither
    // would name the pegs — and the removal of both leaves them unneeded.
    const a = row('a', { source_item_id: 'item-tent' })
    const b = row('b', { source_item_id: 'item-tent' })
    const pegs = row('pegs')
    expect(planRemoval(a, [a, b, pegs], [PEGS_ON_TENT], 0).companions).toEqual([])
    const plan = planRemovals([a, b], [a, b, pegs], [PEGS_ON_TENT], () => 0)
    expect(plan.companions).toEqual([pegs])
  })

  it('keeps a companion an instance left out of the removal still needs', () => {
    const a = row('a', { source_item_id: 'item-tent' })
    const b = row('b', { source_item_id: 'item-tent' })
    const pegs = row('pegs')
    const plan = planRemovals([a], [a, b, pegs], [PEGS_ON_TENT], () => 0)
    expect(plan.companions).toEqual([])
  })
})

describe('itemLeftUnused (FR-5.8, ADR-065)', () => {
  const tripRow = (id: string, source_item_id: string | null): TripItem =>
    ({ id, trip_id: 't', name: id, quantity: 1, source_item_id }) as TripItem
  const position = (item_id: string): TemplateItem =>
    ({ id: `p-${item_id}`, template_id: 'tpl', item_id, quantity: 1 }) as TemplateItem
  /** `companion` comes along whenever `main` is on a list (FR-20.1). */
  const rule = (companion: string, main: string): ItemDependency => ({
    id: `dep-${companion}-${main}`,
    item_id: companion,
    depends_on_item_id: main,
    mode: 'required',
    quantity: null,
  })
  const tent = tripRow('ti-tent', 'item-tent')
  const none: ItemUseSources = { positions: [], tripItems: [tent], dependencies: [] }

  it('names the item when the removed row was its only use', () => {
    expect(itemLeftUnused(tent, none)).toBe('item-tent')
  })

  it('answers the same once the removed row has left the store', () => {
    expect(itemLeftUnused(tent, { ...none, tripItems: [] })).toBe('item-tent')
  })

  it('the rows of one item removed together are no use of each other (FR-25.26)', () => {
    const other = tripRow('ti-tent-2', 'item-tent')
    const both: ItemUseSources = { ...none, tripItems: [tent, other] }
    expect(itemLeftUnused(tent, both)).toBeNull()
    expect(itemLeftUnusedByRows([tent, other], both)).toBe('item-tent')
    expect(itemLeftUnusedByRows([tent], both)).toBeNull()
  })

  it('has no single answer for rows of different items', () => {
    const stove = tripRow('ti-stove', 'item-stove')
    expect(itemLeftUnusedByRows([tent, stove], { ...none, tripItems: [tent, stove] })).toBeNull()
  })

  it('names nothing for an ad-hoc row — it has no inventory item (FR-5.6)', () => {
    expect(itemLeftUnused(tripRow('ti-x', null), none)).toBeNull()
  })

  const kept: [string, Partial<ItemUseSources>][] = [
    ['a Vorlage or group position', { positions: [position('item-tent')] }],
    ['another traveler’s row on this trip', { tripItems: [tent, tripRow('ti-2', 'item-tent')] }],
    [
      'a row on another trip',
      { tripItems: [tent, { ...tripRow('ti-3', 'item-tent'), trip_id: 'u' }] },
    ],
    [
      'another item bringing it as a companion',
      { dependencies: [rule('item-tent', 'item-stove')] },
    ],
  ]
  it.each(kept)('keeps the item while %s uses it', (_, use) => {
    expect(itemLeftUnused(tent, { ...none, ...use })).toBeNull()
  })

  it('does not count the item’s own companions as a use — its list goes with it', () => {
    expect(itemLeftUnused(tent, { ...none, dependencies: [rule('item-pegs', 'item-tent')] })).toBe(
      'item-tent',
    )
  })
})
