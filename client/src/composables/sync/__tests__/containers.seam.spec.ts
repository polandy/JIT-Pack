/**
 * The container group runs on a context, not on the orchestrator (R-4).
 *
 * This is the whole point of the extraction, so it is asserted rather than
 * assumed: the group is constructed here with a hand-written context — no
 * `fetch`, no WebSocket, no outbox, no orchestrator — and what it puts on the
 * queue is read directly. `containerActions.spec.ts` keeps covering the same
 * actions through the real facade; this one covers that they are reachable
 * without it.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createContainerActions } from '../actions/containers'
import { makeSeamContext, pullIn as seedRow, type Recorded } from './seamContext'
import type { SyncContext } from '../context'
import { TABLE } from '@/types/tables'

const TRIP_ID = 'trip-1'

let queued: Recorded[]
let ctx: SyncContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

/** Seeds one trip-partition row the way a pull would. */
function pullIn(table: string, id: string, row: object): void {
  seedRow(ctx.tripStore, table, id, { trip_id: TRIP_ID, ...row })
}

describe('createContainerActions without an orchestrator', () => {
  it('addContainer queues one insert on the trip partition', () => {
    const id = createContainerActions(ctx).addContainer(TRIP_ID, 'Left Pannier', {
      maxWeightGrams: 12000,
    })

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('trip')
    expect(queued[0]!.id).toBe(TRIP_ID)
    expect(queued[0]!.muts[0]!.mutation.op).toBe('insert')
    expect(queued[0]!.muts[0]!.mutation.id).toBe(id)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      trip_id: TRIP_ID,
      name: 'Left Pannier',
      max_weight_grams: 12000,
    })
  })

  it('updateContainer paints the whole row, not only the changed field', () => {
    pullIn(TABLE.containers, 'c1', {
      name: 'Front',
      max_weight_grams: 8000,
      carrier_traveler_id: 'trav-1',
    })
    const container = ctx.tripStore.getContainers(TRIP_ID)[0]!

    createContainerActions(ctx).updateContainer(TRIP_ID, container, { name: 'Rear' })

    expect(queued[0]!.muts[0]!.optimistic!.row).toMatchObject({
      name: 'Rear',
      max_weight_grams: 8000,
      carrier_traveler_id: 'trav-1',
    })
  })

  it('pairContainer writes both sides in one batch', () => {
    pullIn(TABLE.containers, 'c1', { name: 'Front' })
    pullIn(TABLE.containers, 'c2', { name: 'Rear' })

    createContainerActions(ctx).pairContainer(TRIP_ID, 'c1', 'c2')

    expect(queued).toHaveLength(1)
    expect(queued[0]!.muts.map((m) => m.mutation.fields?.['paired_container_id'])).toEqual([
      'c2',
      'c1',
    ])
  })

  it('deleteContainer unassigns its items before the delete, in one batch', () => {
    pullIn(TABLE.containers, 'c1', { name: 'Front' })
    pullIn(TABLE.tripItems, 'ti-1', { name: 'Zelt', container_id: 'c1', quantity: 1 })

    createContainerActions(ctx).deleteContainer(TRIP_ID, 'c1')

    expect(queued).toHaveLength(1)
    const ops = queued[0]!.muts.map((m) => `${m.mutation.table}:${m.mutation.op}`)
    expect(ops).toEqual([`${TABLE.tripItems}:upsert`, `${TABLE.containers}:delete`])
  })
})
