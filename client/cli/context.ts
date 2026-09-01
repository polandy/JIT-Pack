/**
 * The app's own action groups, bound to a command line (FR-18.8, ADR-042).
 *
 * A command must write what the app writes, and for most of the model that
 * is one mutation — but not all of it: adding a person to a trip that still
 * follows its groups also generates that person's positions (FR-2.7, the
 * FR-27.4 amendment), and the rule lives in `createTripLifecycleActions`,
 * not in the mutation factory. A command that composes the mutation itself
 * therefore gets the row and not the consequence, which is a half-write no
 * screen would ever have produced.
 *
 * `SyncContext` is the seam that avoids the copy: the groups were extracted
 * behind it precisely so they can run without the orchestrator (R-4). Here
 * the spine is a pinia store pair, a collecting sink and an injected clock —
 * everything the app fills with an outbox, a device store and a browser.
 */
import { createPinia, setActivePinia } from 'pinia'
import type { PullChange } from '@/api/types'
import type { PendingWrites } from './common'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { useMutations } from '@/composables/useMutations'
import { createNameGuards } from '@/composables/sync/names'
import { createCommentActions } from '@/composables/sync/actions/comments'
import { createPackingActions } from '@/composables/sync/actions/packing'
import { createGroupRefreshActions } from '@/composables/sync/actions/groupRefresh'
import { createTripLifecycleActions } from '@/composables/sync/actions/tripLifecycle'
import type { EnqueueAndDrain, SyncContext } from '@/composables/sync/context'
import type { HLCGenerator } from '@/sync/hlc'

/**
 * A command's spine: the two stores it reads, the writes it collected, and
 * the app's actions bound to both.
 */
export interface CommandContext {
  master: ReturnType<typeof useMasterStore>
  trips: ReturnType<typeof useTripStore>
  mutations: ReturnType<typeof useMutations>
  pending: PendingWrites
  tripLifecycle: ReturnType<typeof createTripLifecycleActions>
  /** Feed a pull's changes to whichever store owns each row. */
  applyPulled(partition: 'master' | 'trip', changes: PullChange[]): void
  /** Remember that this trip's rows are here — the refresh's ADR-016 guard. */
  markTripLoaded(tripId: string): void
}

/**
 * createCommandContext wires one run. It creates the pinia the stores need,
 * so a command does not have to remember to.
 */
export function createCommandContext(hlc: HLCGenerator, now: () => number): CommandContext {
  setActivePinia(createPinia())
  const master = useMasterStore()
  const trips = useTripStore()
  const mutations = useMutations(hlc)
  const pending: PendingWrites = { master: [], trips: new Map() }
  const loaded = new Set<string>()

  /**
   * The app applies optimistically, queues and drains; a command applies,
   * collects and pushes at the end. Applying is not optional either way —
   * the groups read their own writes back (the refresh resolves against the
   * roster the traveller was just added to).
   */
  const enqueueAndDrain: EnqueueAndDrain = (type, id, ...muts) => {
    for (const queued of muts) {
      if (queued.optimistic) applyPulled(type, [queued.optimistic])
      if (type === 'trip' && id) {
        pending.trips.set(id, [...(pending.trips.get(id) ?? []), queued.mutation])
      } else {
        pending.master.push(queued.mutation)
      }
    }
  }

  function applyPulled(partition: 'master' | 'trip', changes: PullChange[]): void {
    // The `trips` table travels the master partition and belongs to the trip
    // store, so master changes are offered to both; a trip's own rows are
    // never master data.
    if (partition === 'master') master.applyChanges(changes)
    trips.applyChanges(changes)
  }

  const ctx: SyncContext = {
    tripStore: trips,
    masterStore: master,
    mutations,
    enqueueAndDrain,
    names: createNameGuards(master),
    // Local Mode is a device, never a command line: what this run can see is
    // what it pulled, so FR-24.3's exact reference count is not claimed here.
    local: null,
    today: () => new Date(now()).toISOString().slice(0, 'YYYY-MM-DD'.length),
    tripDataLoaded: (tripId) => loaded.has(tripId),
  }

  const comments = createCommentActions(ctx)
  const groupRefresh = createGroupRefreshActions(ctx, { comments })
  const tripLifecycle = createTripLifecycleActions(ctx, {
    comments,
    packing: createPackingActions(ctx),
    groupRefresh,
  })

  return {
    master,
    trips,
    mutations,
    pending,
    tripLifecycle,
    applyPulled,
    markTripLoaded: (tripId) => loaded.add(tripId),
  }
}
