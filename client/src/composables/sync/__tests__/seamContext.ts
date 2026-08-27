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
import type { PullChange } from '@/api/types'
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
 *
 * `today` and `tripDataLoaded` default to the two answers a group is normally
 * asked under — a fixed date, and rows that are on the device. A spec that is
 * *about* the other answer overrides it; a spec that is not must not have to
 * know they exist.
 */
export const SEAM_TODAY = '2026-06-01'

export function makeSeamContext(
  opts: {
    local?: IndexedDBPersistence | null
    today?: string
    tripDataLoaded?: (tripId: string) => boolean
  } = {},
): {
  ctx: SyncContext
  queued: Recorded[]
} {
  const queued: Recorded[] = []
  const masterStore = useMasterStore()
  const tripStore = useTripStore()
  const ctx: SyncContext = {
    tripStore,
    masterStore,
    mutations: useMutations(new HLCGenerator(() => 1, 'aabbccdd')),
    enqueueAndDrain: (type, id, ...muts) => {
      // The real one applies the optimistic change before it queues, and a
      // group that writes twice reads its own first write back — the FR-20.4
      // companion resolution is exactly that shape. Routed by partition
      // rather than by table, which is the one way this double is coarser
      // than production: the master partition's per-trip tables (P-3) would
      // land in the wrong store, and no group holding one has moved yet.
      for (const mut of muts) {
        if (!mut.optimistic) continue
        applyTo(type === 'trip' ? tripStore : masterStore, mut.optimistic)
      }
      queued.push({ type, id, muts })
    },
    names: createNameGuards(masterStore),
    local: opts.local ?? null,
    today: () => opts.today ?? SEAM_TODAY,
    tripDataLoaded: opts.tripDataLoaded ?? (() => true),
  }
  return { ctx, queued }
}

/** Hands one change to a store the way the pull router would. */
function applyTo(store: { $id: string }, change: PullChange): void {
  ;(store as unknown as { applyChange: (c: PullChange) => void }).applyChange(change)
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
