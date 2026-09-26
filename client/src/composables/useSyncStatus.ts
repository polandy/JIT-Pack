/**
 * Reactive sync status — drives the G-2 sync indicator.
 *
 * Tracks connection state and pending mutation count so the UI can show
 * synced / syncing / offline at a glance.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'

import type { RequestFailure } from '@/api/client'
import { t, type MessageKey } from '@/i18n'
import { defaultNowMs, type NowMs } from '@/lib/clock'

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
   * Why the most recent refusal happened (Sync-API §5), or null when there
   * was none. The count says that something was refused; only this says
   * what the user can do about it.
   */
  parkedReason: Ref<string | null>
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
  /**
   * Whether the WebSocket is open right now (Sync-API §7/§9). Independent
   * of `state`: the HTTP path can be healthy while the socket is dead, and a
   * device in that condition learns of nobody else's changes until it writes
   * something itself — "synced" would be true of its own changes and false
   * of everyone else's. Local Mode has no socket and reads this as false.
   */
  live: Ref<boolean>
  /**
   * The last request that failed, or null while none has (FR-19.6).
   *
   * The glyph carries four situations and a failure carries none of them: a
   * 401, a 500 and a dead radio are one indistinguishable *offline*, so the
   * person holding the device can report nothing and the maintainer — whose
   * instance keeps no request log — can work backwards from nothing. It is
   * deliberately **not** cleared by a later success: a background drain that
   * failed under a green glyph is exactly the case nobody was looking at.
   */
  lastFailure: Ref<RequestFailure | null>
  /**
   * Epoch-ms of the last sync cycle that completed, or null while none has
   * this session. The glyph says *synced* and nothing says since when — a
   * device left in a drawer for a weekend reads exactly like one that just
   * pulled. Session-scoped on purpose: after a reload the outbox has not yet
   * talked to the server, and an age remembered from before would vouch for
   * a connection this page never made.
   */
  lastSyncedAt: Ref<number | null>
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
  /**
   * Update how many mutations the server refused for good, and why the most
   * recent one was refused — the count and the reason move together because
   * a count without a reason is a number nobody can act on.
   */
  setParked(n: number, reason: string | null): void
  /** Adds to this session's tally of merged-away fields (NFR-4.2a). */
  addConflicts(n: number): void
  /** Report whether the queue is still being written to the device. */
  setQueueDurable(durable: boolean): void
  /** Report whether the WebSocket is open. */
  setLive(live: boolean): void
  /** Record the request that just failed — the transport's report (FR-19.6). */
  setLastFailure(failure: RequestFailure): void
}

export function useSyncStatus(now: NowMs = defaultNowMs): SyncStatus {
  const connectionState = ref<'connected' | 'offline'>('connected')
  const isSyncing = ref(false)
  const isLocal = ref(false)
  const pendingCount = ref(0)
  const parkedCount = ref(0)
  const parkedReason = ref<string | null>(null)
  const conflictCount = ref(0)
  // Optimistic on purpose: the outbox announces the *loss* of durability,
  // and a device that never had a queue to keep has lost nothing.
  const queueDurable = ref(true)
  const live = ref(false)
  const lastFailure = ref<RequestFailure | null>(null)
  const lastSyncedAt = ref<number | null>(null)

  // Order matters, and 'syncing' deliberately outranks 'local': Local
  // Mode still writes, and while a write is open the honest answer is
  // "not on the device yet". Saying "Local" from the tap onwards would be
  // a promise made before it was kept.
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
    lastSyncedAt.value = now()
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

  function setParked(n: number, reason: string | null) {
    parkedCount.value = n
    parkedReason.value = reason
  }

  /** Adds to the session's tally; the log holds what was actually lost. */
  function addConflicts(n: number) {
    conflictCount.value += n
  }

  function setQueueDurable(durable: boolean) {
    queueDurable.value = durable
  }

  function setLive(isLive: boolean) {
    live.value = isLive
  }

  function setLastFailure(failure: RequestFailure) {
    lastFailure.value = failure
  }

  return {
    state,
    pendingCount,
    parkedCount,
    parkedReason,
    conflictCount,
    queueDurable,
    live,
    lastFailure,
    lastSyncedAt,
    label,
    setSyncing,
    setSynced,
    setOffline,
    setLocal,
    setPendingCount,
    setParked,
    addConflicts,
    setQueueDurable,
    setLive,
    setLastFailure,
  }
}
