/**
 * Reactive sync status — drives the G-2 sync indicator.
 *
 * Tracks connection state and pending mutation count so the UI can show
 * synced / syncing / offline at a glance.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'

import { t } from '@/i18n'

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

  // Order matters, and 'syncing' deliberately outranks 'local': Local
  // Mode still writes, and while a write is open the honest answer is
  // "not on the device yet". The glyph used to say "Local" from the tap
  // onwards, which is a promise made before it was kept.
  const state = computed<SyncState>(() => {
    if (connectionState.value === 'offline') return 'offline'
    if (isSyncing.value) return 'syncing'
    if (isLocal.value) return 'local'
    return 'synced'
  })

  const label = computed(() => {
    switch (state.value) {
      case 'synced':
        return t('sync.synced')
      case 'syncing':
        return t('sync.syncing')
      case 'local':
        return t('sync.local')
      case 'offline':
        return pendingCount.value > 0
          ? t('sync.offlineQueued', { n: pendingCount.value })
          : t('sync.offline')
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
    isSyncing.value = false
    // Local Mode has no connection to lose: 'offline' here only ever
    // means a write did not land, and a write that *does* land is the
    // evidence that the condition cleared. Leaving it set would strand
    // the glyph on "offline" for the rest of the session.
    connectionState.value = 'connected'
  }

  function setPendingCount(n: number) {
    pendingCount.value = n
  }

  return {
    state,
    pendingCount,
    label,
    setSyncing,
    setSynced,
    setOffline,
    setLocal,
    setPendingCount,
  }
}
