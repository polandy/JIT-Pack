/**
 * FR-5.8: removing a packing-list row. The rule worth pinning is *when the
 * removal asks first* — a row with nothing on it goes at once behind an undo,
 * and a row carrying progress, notes or companions says what it takes along
 * before it takes it.
 */
import { describe, it, expect } from 'vitest'

import { planRemoval, removalNeedsConfirm, type RemovableRow } from '@/domain/rowRemoval'
import type { ItemDependency } from '@/types/domain'

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
