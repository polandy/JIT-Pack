/**
 * One hand-written `SyncContext` for the seam specs — no `fetch`, no
 * WebSocket, no outbox, no orchestrator, and a recording `enqueueAndDrain`
 * instead of a queue.
 *
 * It is shared rather than repeated per spec so that growing `SyncContext`
 * costs one edit, and the compiler still names it: a new field is a TS2739
 * here rather than a silently half-built context in four places.
 */
import { createNameGuards } from '../names'
import type { QueuedMutation, SyncContext } from '../context'
import type { IndexedDBPersistence } from '@/local/persistence'
import { useMutations } from '@/composables/useMutations'
import { HLCGenerator } from '@/sync/hlc'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

/** One recorded `enqueueAndDrain` call, in the order the group made it. */
export interface Recorded {
  type: 'trip' | 'master'
  id: string | null
  muts: QueuedMutation[]
}

/**
 * makeSeamContext builds the context and the log its `enqueueAndDrain`
 * writes to. Pinia must already be active.
 *
 * `local` decides the mode the group is asked in: null is Server Mode, any
 * store is Local Mode. It is only ever compared against null by the groups,
 * so a spec that needs Local Mode passes an empty stand-in.
 */
export function makeSeamContext(opts: { local?: IndexedDBPersistence | null } = {}): {
  ctx: SyncContext
  queued: Recorded[]
} {
  const queued: Recorded[] = []
  const masterStore = useMasterStore()
  const ctx: SyncContext = {
    tripStore: useTripStore(),
    masterStore,
    mutations: useMutations(new HLCGenerator(() => 1, 'aabbccdd')),
    enqueueAndDrain: (type, id, ...muts) => {
      queued.push({ type, id, muts })
    },
    names: createNameGuards(masterStore),
    local: opts.local ?? null,
  }
  return { ctx, queued }
}

/** Seeds one row into a store the way a pull would, so the store maps it itself. */
export function pullIn(store: { $id: string }, table: string, id: string, row: object): void {
  ;(store as unknown as { applyChange: (c: never) => void }).applyChange({
    seq: 1,
    table,
    id,
    deleted: false,
    row,
  } as never)
}
