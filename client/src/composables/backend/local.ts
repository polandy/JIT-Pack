import { computed, ref } from 'vue'

import type { PullChange } from '@/api/types'
import type { IndexedDBPersistence } from '@/local/persistence'
import type { SyncBackend } from './port'
import type { useSyncStatus } from '../useSyncStatus'

export interface LocalBackendDeps {
  persistence: IndexedDBPersistence
  syncStatus: ReturnType<typeof useSyncStatus>
  /** Routes loaded rows into the stores. */
  apply: (changes: PullChange[]) => void
  /** FR-19.8: a change the backup reminder should count. */
  onLocalWrite: () => void
}

/** Local Mode (FR-19.2): no server, no outbox, no socket; IndexedDB is the only copy. */
export function createLocalBackend(deps: LocalBackendDeps): SyncBackend {
  const { persistence, syncStatus, apply, onLocalWrite } = deps
  syncStatus.setLocal()

  const hydrated = ref(false)
  let writes = 0
  // FR-25.15: the save indicator follows the transaction, not the tap.
  const uncaptured = ref(0)

  const none = () => Promise.resolve()

  return {
    deviceHoldsEverything: true,
    outbox: null,
    capturePending: computed(() => uncaptured.value > 0),

    async connect() {
      // FR-19.2: the startup load passes through the same apply path as a
      // server pull; NFR-4.11: ask for storage durability.
      apply(await persistence.load())
      hydrated.value = true
      void persistence.requestDurability()
    },
    resume() {},
    disconnect() {},

    applied(changes) {
      if (changes.length === 0) return
      // The startup load passes through here too, and re-saving what was
      // already on the device is not a change the backup could miss (FR-19.8).
      if (hydrated.value) onLocalWrite()
      writes += 1
      uncaptured.value += 1
      syncStatus.setSyncing()
      // The indicator follows the write rather than the tap: a fire-and-forget
      // save told the user it was safe while the transaction was still open.
      persistence
        .save(changes)
        .finally(() => {
          writes -= 1
          uncaptured.value -= 1
        })
        .then(() => {
          if (writes === 0) syncStatus.setLocal()
        })
        .catch(() => syncStatus.setOffline())
    },
    enqueue() {},
    push() {},
    drainPartitions() {},

    drainTrip: none,
    drainMaster: none,
    drainAll: none,
    whenSent: none,

    tripDataLoaded: () => hydrated.value,
    masterDataLoaded: () => hydrated.value,

    setViewing() {},
    subscribeTrip() {},
    shareLocation() {},
  }
}
