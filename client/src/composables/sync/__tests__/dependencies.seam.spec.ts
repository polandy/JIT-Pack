/**
 * The dependency group runs on a context, not on the orchestrator (R-4) —
 * and on the **master** partition, which is the half a trip-scoped seam spec
 * cannot show. Constructed here with a hand-written context: no `fetch`, no
 * WebSocket, no outbox, no orchestrator.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createDependencyActions } from '../actions/dependencies'
import { makeSeamContext, pullIn, type Recorded, paintedRow, type SeamContext } from './seamContext'
import { TABLE } from '@/types/tables'
import type { ItemDependency } from '@/types/domain'

let queued: Recorded[]
let ctx: SeamContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('createDependencyActions without an orchestrator', () => {
  it('addItemDependency queues one insert on the master partition, with no trip', () => {
    const id = createDependencyActions(ctx).addItemDependency('item-a', 'item-b', {
      // Not `required`: that is `rowToDependency`'s fallback, and a fixture
      // equal to its mapper's default reports nothing.
      mode: 'suggested',
      quantity: 2,
    })

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.id).toBeNull()
    expect(queued[0]!.muts[0]!.mutation.op).toBe('insert')
    expect(queued[0]!.muts[0]!.mutation.id).toBe(id)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      item_id: 'item-a',
      depends_on_item_id: 'item-b',
      mode: 'suggested',
      quantity: 2,
    })
  })

  it('updateItemDependency paints the whole row, not only the changed field', () => {
    pullIn(ctx.masterStore, TABLE.itemDependencies, 'dep-1', {
      item_id: 'item-a',
      depends_on_item_id: 'item-b',
      mode: 'suggested',
      quantity: 2,
    })
    const dependency = ctx.masterStore.getItemDependencies('item-a')[0] as ItemDependency

    createDependencyActions(ctx).updateItemDependency(dependency, { quantity: 3 })

    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      item_id: 'item-a',
      depends_on_item_id: 'item-b',
      mode: 'suggested',
      quantity: 3,
    })
  })

  it('deleteItemDependency queues a tombstone on the master partition', () => {
    createDependencyActions(ctx).deleteItemDependency('dep-1')

    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('dep-1')
  })
})
