/**
 * Reactive sync status — drives the G-2 sync indicator.
 *
 * Tracks connection state and pending mutation count so the UI can show
 * synced / syncing / offline at a glance.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'

export type SyncState = 'synced' | 'syncing' | 'offline' | 'local'

export interface SyncStatus {
  /** Current connection/sync state. */
  state: ComputedRef<SyncState>
  /** Number of mutations queued but not yet pushed. */
  pendingCount: Ref<number>
  /** Human-readable label for the current state. */
  label: ComputedRef<string>

  /** Mark that a sync cycle has started. */
  setSyncing(): void
  /** Mark that a sync cycle completed successfully. */
  setSynced(): void
  /** Mark the connection as offline. */
  setOffline(): void
  /** Enter Local Mode (FR-19.6): a fixed state, no server involved. */
  setLocal(): void
  /** Update the pending mutation count. */
  setPendingCount(n: number): void
}

export function useSyncStatus(): SyncStatus {
  const connectionState = ref<'connected' | 'offline'>('connected')
  const isSyncing = ref(false)
  const isLocal = ref(false)
  const pendingCount = ref(0)

  const state = computed<SyncState>(() => {
    if (isLocal.value) return 'local'
    if (connectionState.value === 'offline') return 'offline'
    if (isSyncing.value) return 'syncing'
    return 'synced'
  })

  const label = computed(() => {
    switch (state.value) {
      case 'synced':
        return 'Synced'
      case 'syncing':
        return 'Syncing...'
      case 'local':
        return 'Local'
      case 'offline':
        return pendingCount.value > 0
          ? `Offline (${pendingCount.value} queued)`
          : 'Offline'
    }
  })

  function setSyncing() {
    isSyncing.value = true
  }

  function setSynced() {
    isSyncing.value = false
    connectionState.value = 'connected'
  }

  function setOffline() {
    connectionState.value = 'offline'
    isSyncing.value = false
  }

  function setLocal() {
    isLocal.value = true
  }

  function setPendingCount(n: number) {
    pendingCount.value = n
  }

  return { state, pendingCount, label, setSyncing, setSynced, setOffline, setLocal, setPendingCount }
}
