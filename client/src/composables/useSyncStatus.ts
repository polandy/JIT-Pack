/**
 * Reactive sync status — drives the G-2 sync indicator.
 *
 * Tracks connection state and pending mutation count so the UI can show
 * synced / syncing / offline at a glance.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'

import { t, type MessageKey } from '@/i18n'

export type SyncState = 'synced' | 'syncing' | 'offline' | 'local'

/**
 * The short label each state carries — the app-bar tooltip and the title of
 * the G-2 detail sheet. One table, because a glyph and its title disagreeing
 * about what the app is doing is the failure this pattern exists to prevent.
 */
export const SYNC_LABEL_KEYS: Record<SyncState, MessageKey> = {
  synced: 'sync.synced',
  syncing: 'sync.syncing',
  offline: 'sync.offline',
  local: 'sync.local',
}

/** The sentence the detail sheet explains each state with (G-2, FR-19.6). */
export const SYNC_EXPLAIN_KEYS: Record<SyncState, MessageKey> = {
  synced: 'sync.detail.explain.synced',
  syncing: 'sync.detail.explain.syncing',
  offline: 'sync.detail.explain.offline',
  local: 'sync.detail.explain.local',
}

export interface SyncStatus {
  /** Current connection/sync state. */
  state: ComputedRef<SyncState>
  /** Number of mutations queued but not yet pushed. */
  pendingCount: Ref<number>
  /**
   * Mutations the server permanently refused (B2). They are out of the
   * queue — keeping them would wedge it — and kept on the device as
   * evidence, which is a fact only G-2 has anywhere to say.
   */
  parkedCount: Ref<number>
  /**
   * Fields of this device's changes the server merged away, counted for
   * this session. The durable record is the conflict log (NFR-4.2a); this
   * is what lets G-2 say it happened at all.
   */
  conflictCount: Ref<number>
  /**
   * Whether the queue is actually being kept on the device (NFR-4.1). It
   * goes false when the browser refuses the write — out of space, or a
   * transaction it aborted — and G-2 must then stop promising a reload is
   * safe.
   */
  queueDurable: Ref<boolean>
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
  /** Update how many mutations the server refused for good. */
  setParkedCount(n: number): void
  /** Adds to this session's tally of merged-away fields (NFR-4.2a). */
  addConflicts(n: number): void
  /** Report whether the queue is still being written to the device. */
  setQueueDurable(durable: boolean): void
}

export function useSyncStatus(): SyncStatus {
  const connectionState = ref<'connected' | 'offline'>('connected')
  const isSyncing = ref(false)
  const isLocal = ref(false)
  const pendingCount = ref(0)
  const parkedCount = ref(0)
  const conflictCount = ref(0)
  // Optimistic on purpose: the outbox announces the *loss* of durability,
  // and a device that never had a queue to keep has lost nothing.
  const queueDurable = ref(true)

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
      // Offline is the one state whose label says more than its name: the
      // queue length is the thing the user is actually worried about.
      case 'offline':
        return pendingCount.value > 0
          ? t('sync.offlineQueued', { n: pendingCount.value })
          : t(SYNC_LABEL_KEYS.offline)
      default:
        return t(SYNC_LABEL_KEYS[state.value])
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

  function setParkedCount(n: number) {
    parkedCount.value = n
  }

  /** Adds to the session's tally; the log holds what was actually lost. */
  function addConflicts(n: number) {
    conflictCount.value += n
  }

  function setQueueDurable(durable: boolean) {
    queueDurable.value = durable
  }

  return {
    state,
    pendingCount,
    parkedCount,
    conflictCount,
    queueDurable,
    label,
    setSyncing,
    setSynced,
    setOffline,
    setLocal,
    setPendingCount,
    setParkedCount,
    addConflicts,
    setQueueDurable,
  }
}
