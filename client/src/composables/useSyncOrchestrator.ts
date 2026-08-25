/**
 * Sync orchestrator — the central glue between stores, outbox, and WebSocket.
 *
 * Responsibilities:
 * 1. Creates APIClient, HLC, SyncOutbox, WebSocket, Mutations
 * 2. Routes pull changes to the right store (trip vs master)
 * 3. Handles WebSocket events (trip.changed → drain trip, master.changed → drain master)
 * 4. Exposes action methods that create mutations → optimistic store update → enqueue
 * 5. Manages sync status for G-2 indicator
 */

import { API } from '@/api/routes'
import { TABLE } from '@/types/tables'
import { computed, ref, shallowRef } from 'vue'

import { APIClient, type TokenProvider } from '@/api/client'
import { loadTokens, subjectOf } from '@/auth/tokens'
import { HLCGenerator } from '@/sync/hlc'
import { SyncOutbox, type ConflictReport } from './useSyncOutbox'
import {
  localChange,
  localTombstone,
  optimisticDelete,
  optimisticInsert,
  optimisticUpdate,
} from './sync/optimistic'
import { useWebSocket } from './useWebSocket'
import { CLIENT_ACTOR_PLACEHOLDER, useMutations } from './useMutations'
import { useSyncStatus } from './useSyncStatus'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import type {
  AdminUserListResponse,
  ConflictEntry,
  ConflictListResponse,
  DirectoryUser,
  LockEvent,
  LockEventListResponse,
  MeResponse,
  NotificationListResponse,
  PresenceMember,
  PullChange,
  TakeoverResponse,
  UserListResponse,
  VAPIDKeyResponse,
  WSEvent,
} from '@/api/types'
import { durationDays, type GeneratedItem } from '@/domain/instantiate'
import { coSkipTargets, resolveDependencies } from '@/domain/dependencies'
import { planClone, type CloneOptions } from '@/domain/clone'
import {
  declinePlan,
  isEmptyPlan,
  planRefresh,
  proposedChangeCount,
  type RefreshPlan,
} from '@/domain/refresh'
import { followsGroups } from '@/domain/trips'
import { planGroupAddition, type GroupAdditionReport } from '@/domain/groupAdd'
import {
  pairWrites,
  releasePartnersOnDelete,
  unpairWrites,
  type PairingWrite,
} from '@/domain/containers'
import { optimizeItemImage } from '@/lib/imageResize'
import type { ImportPlan } from '@/domain/spreadsheet'
import type { PortableDocument } from '@/domain/portable'
import { importPortableBackup, importPortableDocument } from '@/domain/portableImport'
import type { PortableImportEnv, PortableImportResult } from '@/domain/portableImport'
import type { NotificationPrefs, ServerNotification } from '@/notifications/format'
import type { PushServerAPI } from '@/notifications/push'
import type { AdminUserRow } from '@/domain/admin'
import type { ReviewProposal } from '@/domain/review'
import { planTemplateFromTrip, recogniseTripComposition } from '@/domain/templateFromTrip'
import type { DeviationChoice, PositionDraft } from '@/domain/templateFromTrip'
import type { IndexedDBPersistence } from '@/local/persistence'
import { IndexedDBOutboxStore, type OutboxStore } from '@/sync/outboxStore'
import { TRIP_STATUS_PLANNING } from '@/types/domain'
import type { TripEdit } from './useMutations'
import type {
  Container,
  DestinationChecklistItem,
  DestinationProfile,
  ItemComment,
  ItemDependency,
  ItemMode,
  ItemTodo,
  MasterItem,
  ReviewFlag,
  Template,
  TemplateKind,
  TemplateItem,
  Trip,
  TripItem,
  TripMember,
  TripSeries,
  TripStatus,
  Traveler,
  TravelerChangeReport,
} from '@/types/domain'

/** One entry of a trip's presence facepile (G-10, Sync-API §7). */
// Both shapes come from the contract now (NFR-4.14). The names are kept as
// aliases because the screens read this module, not the wire: what changed is
// that neither can drift from what the server sends — the conflict entry had
// already lost `mutation_id` and `actor_user_id` that way.
export type PresenceUser = PresenceMember
export type { ConflictEntry, LockEvent }

/** Everything the M3 wizard collected before "Create trip". */
export interface TripWizardDraft {
  name: string
  /** FR-2.1b: required, and the only temporal fact that is. */
  year: number
  startDate: string | null
  endDate: string | null
  attributes: Record<string, unknown> | null
  travelers: { name: string; linkedUserId?: string | null }[]
  /** Generated rows — template items, or companions without a template (FR-20.2). */
  items: (Omit<GeneratedItem, 'source_template_id'> & { source_template_id: string | null })[]
  /** Attach to an existing series (FR-13.1). */
  seriesId?: string | null
  /** Create a series inline; its defaults seed from the trip attributes. */
  newSeriesName?: string | null
  /** Accepted destination checklist items (FR-13.3) — become trip items. */
  checklistItems?: { label: string; mode: ItemMode }[]
  /** Share with user accounts (FR-4.5) — the creator's Owner row is server-made. */
  members?: { userId: string; role: 'admin' | 'editor' }[]
  /**
   * FR-27.4: the templates the user picked, registered as the trip's
   * sources so it keeps following them while it is being planned. Empty
   * for a trip generated from nothing — it then never moves, which is
   * correct rather than a gap.
   */
  sourceTemplateIds?: string[]
}

/** cloneTrip input (FR-12.2): fresh name/dates plus the carry-over options. */
export interface CloneDraft {
  name: string
  /** FR-2.1b: required on a clone too — a copy is a trip of its own year. */
  year: number
  startDate: string | null
  endDate: string | null
  options: CloneOptions
}

/**
 * localIsoDate is `YYYY-MM-DD` in the device's own timezone.
 * `toISOString()` would answer in UTC, which puts a trip a day out for
 * anyone far enough east or west of it on the evening it ends.
 */
function localIsoDate(): string {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export interface SyncOrchestratorConfig {
  baseUrl: string
  getToken: TokenProvider
  /**
   * The account this session belongs to, or null where there is none
   * (Local Mode, Single-User Mode). Only claims consult it — see
   * `heldByAnotherAccount`. Defaults to the subject of the stored session
   * token; injected in tests.
   */
  currentUserId?: () => string | null
  /**
   * OIDC only: called when a request 401s despite the provided token —
   * forces a token refresh, and the request is retried once (Sync-API §2).
   */
  onUnauthorized?: () => Promise<string | null>
  /**
   * Local Mode (Addendum 3.19, FR-19.2): when set, mutations persist to
   * this store instead of the sync outbox, and no network or WebSocket
   * is ever touched. The optimistic rows are authoritative.
   */
  local?: IndexedDBPersistence
  /**
   * The clock behind FR-27.4's "is this trip past?" question. Injected so a
   * test can stand on either side of a trip's end date without moving the
   * machine's clock; defaults to the local date, not UTC, because the day a
   * trip ends is the day the traveller is living in.
   */
  today?: () => string
  /**
   * FR-6.2 in-app channel: invoked for each incoming notification —
   * live ones (notification.created) and unread ones found on connect.
   * The callee surfaces it (toast) and marks it read via
   * markNotificationRead. No-op in Local Mode.
   */
  onNotification?: (n: ServerNotification) => void
  /**
   * Called when a push comes back `merged`, i.e. the server dropped fields
   * of this device's changes (NFR-4.2a). The callee surfaces it; the
   * report names the partition, which is which conflict log to open.
   */
  onConflicts?: (report: ConflictReport) => void
  /**
   * Where the outbox keeps its queue between sessions (B2, NFR-4.1).
   * Injected so a test can drive a store it can see; Server Mode defaults
   * to IndexedDB, and Local Mode never builds one — it has no outbox.
   */
  outboxStore?: OutboxStore
}

/**
 * Pull routing, by owning **store** rather than by partition: trip_members,
 * trip_template_sources and trip_applied_changes all travel the *master*
 * partition (spec P-3) and are still per-trip state. A table missing from
 * both sets is dropped silently, which is why they are named constants
 * (§4a) rather than literals repeated per call.
 */
const TRIP_STORE_TABLES: ReadonlySet<string> = new Set<string>([
  TABLE.trips,
  TABLE.tripItems,
  TABLE.travelers,
  TABLE.containers,
  TABLE.comments,
  TABLE.notifications,
  TABLE.tripMembers,
  TABLE.tripTemplateSources,
  TABLE.tripGeneratedPositions,
  TABLE.tripAppliedChanges,
])

const MASTER_STORE_TABLES: ReadonlySet<string> = new Set<string>([
  TABLE.tags,
  TABLE.itemTags,
  TABLE.items,
  TABLE.templates,
  TABLE.templateItems,
  TABLE.templateIncludes,
  TABLE.templateItemTasks,
  TABLE.tripSeries,
  TABLE.destinationProfiles,
  TABLE.destinationChecklistItems,
  TABLE.itemDependencies,
])

export function useSyncOrchestrator(config: SyncOrchestratorConfig) {
  const tripStore = useTripStore()
  const masterStore = useMasterStore()
  const syncStatus = useSyncStatus()
  const local = config.local ?? null
  // Deliberately not `config.getToken`: that provider may refresh and is
  // therefore async, and a lock decision is made while rendering a row.
  // The stored session answers the same question synchronously — memoised
  // on the token itself, because M4 asks it three times per row per render
  // and the answer only changes when the session does.
  let cachedSession: { token: string | null; subject: string | null } | null = null
  const currentUserId =
    config.currentUserId ??
    (() => {
      const token = loadTokens()?.access_token ?? null
      if (!cachedSession || cachedSession.token !== token) {
        cachedSession = { token, subject: subjectOf(token) }
      }
      return cachedSession.subject
    })
  const today = config.today ?? localIsoDate
  if (local) syncStatus.setLocal()

  // G-10: per-trip presence, fed by the WS presence event.
  const presence = ref<Map<string, PresenceUser[]>>(new Map())

  function getPresence(tripId: string): PresenceUser[] {
    return presence.value.get(tripId) ?? []
  }

  // G-3 locking (FR-5.3): ephemeral locks from item.locked events plus
  // the synced packing_now state. myLocks marks claims made on this
  // device, because the device is the only distinction Local and
  // Single-User Mode have — there is one account in both.
  //
  // There is no staleness window (FR-5.7, ADR-028): a claim is claimed
  // until a person ends it, so a lock is never judged by its age.
  const itemLocks = ref<Map<string, Map<string, { by_user: string }>>>(new Map())
  const myLocks = new Set<string>()

  /**
   * Whether `holder` is somebody else — the question a device claim cannot
   * answer for itself.
   *
   * Where the session names an account (Server Mode with OIDC), a holder
   * that is a *different* account revokes this device's claim: that is what
   * a takeover is (FR-5.7), and without this the device that lost the row
   * kept rendering it as its own while the server had handed it on — the
   * notification arrived and the row contradicted it. Where there is no
   * account to compare against, the device rule stands unchanged.
   */
  function heldByAnotherAccount(holder: string | null): boolean {
    // The optimistic claim writes a placeholder until the server stamps the
    // real actor (invariant 3). It means "me, unconfirmed", so reading it
    // as a foreign account would revoke every claim the moment it is made.
    if (!holder || holder === CLIENT_ACTOR_PLACEHOLDER) return false
    const me = currentUserId()
    return me !== null && holder !== me
  }

  /** The holder the server knows of, ephemeral event first, then the pull. */
  function syncedHolder(tripId: string, item: TripItem): string | null {
    const ephemeral = itemLocks.value.get(tripId)?.get(item.id)
    if (ephemeral) return ephemeral.by_user
    if (item.state !== 'packing_now') return null
    return item.packing_now_by ?? ''
  }

  /** Whether this device's claim on the row still stands (FR-5.7). */
  function claimIsMine(tripId: string, item: TripItem): boolean {
    if (!myLocks.has(item.id)) return false
    return !heldByAnotherAccount(syncedHolder(tripId, item))
  }

  function isLockedByOther(tripId: string, item: TripItem): boolean {
    return lockHolder(tripId, item) !== null
  }

  /**
   * lockHolder answers *who* is packing this row, or null where it is not
   * locked for me (G-3 wants the name, not only the padlock). The user id
   * is what the client has; resolving it to a display name is the view's
   * job, since only it knows the trip's participants.
   */
  function lockHolder(tripId: string, item: TripItem): string | null {
    if (claimIsMine(tripId, item)) return null
    return syncedHolder(tripId, item)
  }

  /**
   * holdsClaim answers whether *this device* is the one holding the row.
   * `lockHolder` is deliberately blind to it — my own claim never locks
   * the row for me — which leaves the one screen that could say "you are
   * holding this against the others" unable to know it.
   */
  function holdsClaim(tripId: string, item: TripItem): boolean {
    return claimIsMine(tripId, item) && item.state === 'packing_now'
  }

  function setItemLock(tripId: string, itemId: string, byUser: string) {
    const next = new Map(itemLocks.value)
    const tripLocks = new Map(next.get(tripId) ?? [])
    tripLocks.set(itemId, { by_user: byUser })
    next.set(tripId, tripLocks)
    itemLocks.value = next
  }

  /**
   * clearEphemeralLock drops the WS-delivered lock without touching
   * `myLocks`, which `clearItemLock` also clears: after a takeover the
   * row *is* mine, so forgetting that would make my own claim render as
   * somebody else's.
   */
  function clearEphemeralLock(tripId: string, itemId: string) {
    const tripLocks = itemLocks.value.get(tripId)
    if (!tripLocks?.has(itemId)) return
    const next = new Map(itemLocks.value)
    const cleared = new Map(tripLocks)
    cleared.delete(itemId)
    next.set(tripId, cleared)
    itemLocks.value = next
  }

  function clearItemLock(tripId: string, itemId: string) {
    clearEphemeralLock(tripId, itemId)
    myLocks.delete(itemId)
  }

  const client = new APIClient(config.baseUrl, config.getToken, config.onUnauthorized)

  const deviceId = localStorage.getItem('jitpack_device_id') ?? generateDeviceId()
  localStorage.setItem('jitpack_device_id', deviceId)

  const hlc = new HLCGenerator(() => Date.now(), deviceId)
  const mutations = useMutations(hlc)

  // Local Mode never pushes, so it never queues — building a store there
  // would create a database that nothing ever writes to.
  const outboxStore = local ? null : (config.outboxStore ?? new IndexedDBOutboxStore())

  const outbox = new SyncOutbox(client, hlc, onPullChanges, {
    store: outboxStore ?? undefined,
    onParked: () => syncStatus.setParkedCount(outbox.parkedCount()),
    onConflicts: (report) => {
      syncStatus.addConflicts(report.count)
      config.onConflicts?.(report)
    },
    onDurabilityChanged: (durable) => syncStatus.setQueueDurable(durable),
  })

  const ws = useWebSocket({
    baseUrl: config.baseUrl,
    getToken: config.getToken,
    onEvent: onWSEvent,
  })

  /**
   * Which trips' rows are actually on this device (FR-27.4). Server Mode
   * pulls a trip's partition only when the trip is opened, and Local Mode
   * hydrates from IndexedDB asynchronously — refreshing a trip before its
   * rows are here would read an empty trip and re-add every position it
   * already has. The refresh needs a *settled* signal, not a hopeful one.
   */
  const loadedTripPartitions = new Set<string>()
  let localHydrated = false

  /** Whether another save has been queued behind the one just finished. */
  let localWrites = 0
  function localWritesPending(): boolean {
    return localWrites > 0
  }

  // --- Pull change routing ---

  function onPullChanges(changes: PullChange[]) {
    const tripChanges: PullChange[] = []
    const masterChanges: PullChange[] = []

    for (const c of changes) {
      if (TRIP_STORE_TABLES.has(c.table)) {
        tripChanges.push(c)
      } else if (MASTER_STORE_TABLES.has(c.table)) {
        masterChanges.push(c)
      }
    }

    if (tripChanges.length > 0) tripStore.applyChanges(tripChanges)
    if (masterChanges.length > 0) masterStore.applyChanges(masterChanges)

    // FR-19.2: in Local Mode every applied change is durable — this is
    // the single funnel all mutations and startup loads pass through.
    // The indicator follows the write rather than the tap, so "on this
    // device" means the row is *on* the device: a fire-and-forget save
    // told the user it was safe while the transaction was still open,
    // and a reload in that window lost the row.
    if (local && changes.length > 0) {
      localWrites += 1
      syncStatus.setSyncing()
      local
        .save(changes)
        .finally(() => (localWrites -= 1))
        .then(() => {
          if (!localWritesPending()) syncStatus.setLocal()
        })
        .catch(() => syncStatus.setOffline())
    }
  }

  // --- WebSocket event handling ---

  function onWSEvent(event: WSEvent) {
    switch (event.type) {
      case 'trip.changed': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        if (tripId) {
          drainTrip(tripId)
        }
        break
      }
      case 'master.changed':
        drainMaster()
        break
      case 'presence': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        if (tripId) {
          const users = (event.payload?.['users'] as PresenceUser[] | undefined) ?? []
          const next = new Map(presence.value)
          next.set(tripId, users)
          presence.value = next
        }
        break
      }
      case 'item.locked': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        const itemId = event.payload?.['item_id'] as string | undefined
        const byUser = (event.payload?.['by_user'] as string) ?? ''
        if (!tripId || !itemId) break
        // A lock naming another account on a row this device holds is a
        // takeover (FR-5.7): the claim is gone, so the device flag goes
        // with it rather than outliving the row it describes. The hub
        // broadcasts a claim to every subscriber including the claimer,
        // so "an event arrived" alone would misread my own claim.
        if (heldByAnotherAccount(byUser)) myLocks.delete(itemId)
        if (!myLocks.has(itemId)) setItemLock(tripId, itemId, byUser)
        break
      }
      case 'item.unlocked': {
        const tripId = event.payload?.['trip_id'] as string | undefined
        const itemId = event.payload?.['item_id'] as string | undefined
        if (tripId && itemId) {
          clearItemLock(tripId, itemId)
        }
        break
      }
      case 'notification.created':
        // Thin ping (§7): the row itself comes via GET /notifications.
        void surfaceUnreadNotifications()
        break
    }
  }

  // --- Notifications (FR-6.2) ---

  // Guards against surfacing the same notification twice when several
  // notification.created pings arrive before the first fetch settles.
  const surfacedNotifications = new Set<string>()

  async function surfaceUnreadNotifications(): Promise<void> {
    if (local || !config.onNotification) return
    try {
      const resp = await client.get<NotificationListResponse>(API.notifications, {
        unread: '1',
      })
      for (const n of resp.notifications ?? []) {
        if (surfacedNotifications.has(n.id)) continue
        surfacedNotifications.add(n.id)
        config.onNotification(n)
      }
    } catch {
      // Offline — unread notifications resurface on the next connect.
    }
  }

  async function markNotificationRead(id: string): Promise<void> {
    try {
      await client.post(API.notificationRead(id))
    } catch {
      // Offline: stays unread server-side and resurfaces at most once.
    }
  }

  async function fetchNotificationPrefs(): Promise<NotificationPrefs | null> {
    try {
      return await client.get<NotificationPrefs>(API.meNotificationPrefs)
    } catch {
      return null
    }
  }

  async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
    await client.put(API.meNotificationPrefs, prefs)
  }

  /** Server half of the Web Push dance (NFR-4.6) for notifications/push.ts. */
  const pushApi: PushServerAPI = {
    async getVapidKey() {
      return (await client.get<VAPIDKeyResponse>(API.pushVAPIDKey)).key
    },
    async registerSubscription(sub) {
      await client.post(API.pushSubscriptions, sub)
    },
    async unregisterSubscription(endpoint) {
      await client.delete(API.pushSubscriptions, { endpoint })
    },
  }

  // --- Drain operations ---

  async function drainTrip(tripId: string): Promise<void> {
    if (local) return
    syncStatus.setSyncing()
    try {
      await outbox.drain('trip', tripId)
      loadedTripPartitions.add(tripId)
      syncStatus.setPendingCount(outbox.totalPending())
      syncStatus.setSynced()
      // Report the new cursor so the server recomputes in_sync (§7).
      ws.sendCursor(tripId, outbox.getCursor('trip', tripId))
    } catch {
      syncStatus.setOffline()
    }
  }

  async function drainMaster(): Promise<void> {
    if (local) return
    syncStatus.setSyncing()
    try {
      await outbox.drain('master', null)
      syncStatus.setPendingCount(outbox.totalPending())
      syncStatus.setSynced()
      // FR-27.4: a group edited on another device arrives with this pull, and
      // the trips that follow it work out what it would mean for them here —
      // the device does not have to be on any particular screen. Local Mode
      // returns above, and App.vue sweeps once after its hydration instead.
      proposeRefreshForLoadedTrips()
    } catch {
      syncStatus.setOffline()
    }
  }

  async function drainAll(tripIds: string[]): Promise<void> {
    if (local) return
    syncStatus.setSyncing()
    try {
      await drainMaster()
      for (const id of tripIds) {
        await drainTrip(id)
      }
      syncStatus.setSynced()
    } catch {
      syncStatus.setOffline()
    }
  }

  // --- High-level actions (optimistic + enqueue) ---

  function enqueueAndDrain(
    type: 'trip' | 'master',
    id: string | null,
    ...muts: { mutation: ReturnType<typeof mutations.skipItem>; optimistic?: PullChange }[]
  ) {
    for (const m of muts) {
      if (m.optimistic) {
        onPullChanges([m.optimistic])
      }
      if (!local) {
        outbox.enqueue(type, id, m.mutation)
      }
    }
    if (local) return
    syncStatus.setPendingCount(outbox.totalPending())

    // Fire-and-forget drain
    const drainFn = type === 'master' ? drainMaster() : drainTrip(id!)
    drainFn.catch(() => {})
  }

  /** Pack: increment packed count on a trip item. */
  function packIncrement(tripId: string, item: TripItem) {
    const mut = mutations.incrementPacked(item.id, item.packed_count, item.quantity)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function packDecrement(tripId: string, item: TripItem) {
    const mut = mutations.decrementPacked(item.id, item.packed_count)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function packComplete(tripId: string, item: TripItem) {
    const mut = mutations.completePacked(item.id, item.quantity)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function packZero(tripId: string, item: TripItem) {
    const mut = mutations.zeroPacked(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * Put a row back the way FR-25.2's undo found it.
   *
   * Takes the id rather than the row, and re-reads the current one: by the
   * time undo fires, the row on screen is the *packed* one, and building an
   * optimistic patch from the caller's stale snapshot would also revert
   * anything that landed in between — a packer avatar, a sync from another
   * device. Only `packed_count` and `state` are restored, which is exactly
   * what the pack changed.
   */
  function restorePack(tripId: string, itemId: string, packedCount: number, state: string) {
    const current = tripStore.getItems(tripId).find((row) => row.id === itemId)
    // Gone between the pack and the undo — deleted here or on another
    // device. Doing nothing is the correct outcome rather than a swallowed
    // one: re-upserting would resurrect a row somebody removed on purpose.
    if (!current) return
    const mut = mutations.packItem(itemId, packedCount, state)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(current)),
    })
  }

  function packToggle(tripId: string, item: TripItem) {
    const mut = mutations.togglePacked(item.id, item.packed_count)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * Mark a row deliberately not packed (FR-5.5), taking its companions with
   * it (FR-20.2).
   *
   * Returns every row it skipped, main first, snapshotted *before* the
   * write: FR-5.5's snackbar names the companions that went along, and its
   * undo has to put back exactly those rows and no others.
   */
  function skipItem(tripId: string, item: TripItem): TripItem[] {
    const skipOne = (target: TripItem) => {
      const mut = mutations.skipItem(target.id)
      return {
        mutation: mut,
        optimistic: optimisticUpdate(mut, itemRow(target)),
      }
    }
    // FR-20.2: skipping a main item co-skips its (transitive) companions —
    // they stay skipped alongside it instead of vanishing.
    const affected = [
      item,
      ...coSkipTargets(item, tripStore.getItems(tripId), masterStore.dependencyList),
    ]
    enqueueAndDrain('trip', tripId, ...affected.map(skipOne))
    return affected
  }

  /**
   * Undo a skip: put each row back where {@link skipItem} found it.
   *
   * Re-read against the current row for the same reason {@link restorePack}
   * is — by the time the undo fires, a sync or another device may have
   * touched the row, and only the three fields the skip wrote may be
   * reverted. A row that has since been deleted is left deleted.
   */
  function restoreSkip(
    tripId: string,
    records: { itemId: string; quantity: number; packedCount: number; state: string }[],
  ) {
    const current = tripStore.getItems(tripId)
    const muts = []
    for (const record of records) {
      const row = current.find((candidate) => candidate.id === record.itemId)
      if (!row) continue
      const mut = mutations.restoreSkipped(
        record.itemId,
        record.quantity,
        record.packedCount,
        record.state,
      )
      muts.push({
        mutation: mut,
        optimistic: optimisticUpdate(mut, itemRow(row)),
      })
    }
    if (muts.length > 0) enqueueAndDrain('trip', tripId, ...muts)
  }

  function unskipItem(tripId: string, item: TripItem) {
    const mut = mutations.unskipItem(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function setMode(tripId: string, item: TripItem, mode: ItemMode) {
    const mut = mutations.setItemMode(item.id, mode)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /** Claim an item for packing (FR-5.2); locks it for others (G-3). */
  function packingNow(tripId: string, item: TripItem) {
    const mut = mutations.startPackingNow(item.id)
    myLocks.add(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * takeOverClaim ends somebody else's claim and starts mine, in one step
   * (FR-5.7). It is the only part of G-3's lock that goes through the
   * server rather than the outbox: only the server can stamp who took
   * over (invariant 3) and notify the account it was taken from, and a
   * client cannot send itself a notification.
   *
   * Nothing is written optimistically. An outbox mutation would have to
   * be undone when the server refuses — the row may have been packed or
   * released in the meantime — and a taker shown a claim they do not hold
   * is the one outcome worse than waiting for the answer. The row arrives
   * by the drain below, like every other server-originated change.
   *
   * Returns who was holding it, which the confirmation named beforehand
   * and the snackbar names afterwards. Local Mode has no server and no
   * second person, so the surface never reaches here (G-8).
   */
  async function takeOverClaim(tripId: string, item: TripItem): Promise<string> {
    if (local) return ''
    const resp = await client.post<TakeoverResponse>(API.tripItemTakeover(tripId, item.id))
    // The claim is mine from here: `myLocks` is how this device knows a
    // row is its own, and without it the row I just took would render as
    // locked against me.
    myLocks.add(item.id)
    clearEphemeralLock(tripId, item.id)
    await drainTrip(tripId)
    return resp.previous_holder ?? ''
  }

  /**
   * fetchLockEvents reads the trip's takeover record (FR-5.7) — who took
   * what from whom. Deliberately not part of the conflict log: that one
   * holds merge losers, and a list of two unrelated kinds of event stops
   * being readable (ADR-028).
   */
  async function fetchLockEvents(tripId: string): Promise<LockEvent[]> {
    if (local) return []
    const resp = await client.get<LockEventListResponse>(API.tripLockEvents(tripId), {})
    return resp.lock_events
  }

  /**
   * releaseClaim gives a row back without packing it (G-3). Until now a
   * claim ended only by packing or by ageing out of the §7 window, so a
   * tap made by mistake held the row against everyone else for a quarter
   * of an hour with no way out.
   *
   * The state it returns to is derived rather than remembered: the claim
   * overwrote whatever was there, and `packed_count` against `quantity`
   * says the same thing the stepper says — a release that always wrote
   * `open` would throw away work already in the bag.
   */
  function releaseClaim(tripId: string, item: TripItem) {
    const mut = mutations.releasePackingNow(item.id, item.packed_count, item.quantity)
    myLocks.delete(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function assignTraveler(tripId: string, item: TripItem, travelerId: string | null) {
    const mut = mutations.assignTraveler(item.id, travelerId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function assignContainer(tripId: string, item: TripItem, containerId: string | null) {
    const mut = mutations.assignContainer(item.id, containerId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function setLatePacker(tripId: string, item: TripItem, latePacker: boolean) {
    const mut = mutations.setLatePacker(item.id, latePacker)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  /**
   * FR-9.1: the M5 control's write. Same shape as setLatePacker — one
   * field, the rest of the row preserved, so flagging never touches the
   * packing record it is a judgement about.
   */
  /**
   * setPacker hands a row to somebody (FR-25.19), or takes it back with
   * `null`. The FR-6.2 notification is the server's half: it fires on any
   * push carrying `packer_user_id` and skips a self-assignment, so the
   * client owes nothing beyond the ordinary mutation.
   */
  function setPacker(tripId: string, item: TripItem, userId: string | null) {
    const mut = mutations.setPacker(item.id, userId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function setReviewFlag(tripId: string, item: TripItem, flag: ReviewFlag, value: boolean) {
    const mut = mutations.setReviewFlag(item.id, flag, value)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, itemRow(item)),
    })
  }

  function quickAddItem(
    tripId: string,
    name: string,
    opts: {
      sourceItemId?: string | null
      weightGrams?: number | null
      valueCents?: number | null
      categoryName?: string | null
      mode?: ItemMode
    },
    isActive: boolean,
  ) {
    const { mutation } = mutations.addTripItem(tripId, name, {
      ...opts,
      flagMissing: isActive,
    })
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    if (opts.sourceItemId) {
      addRequiredCompanions(tripId)
    }
  }

  /**
   * addRequiredCompanions pulls the list's missing required companions in
   * (FR-20.4: without prompting, FR-20.3: never duplicating) — called
   * after a quick-add that matched a master item.
   */
  function addRequiredCompanions(tripId: string) {
    const onList = tripStore.getItems(tripId)
    const resolution = resolveDependencies({
      onList,
      dependencies: masterStore.dependencyList,
      masterItems: masterStore.itemList,
    })
    for (const companion of resolution.required) {
      const { mutation } = mutations.addGeneratedTripItem(
        tripId,
        {
          source_item_id: companion.item_id,
          source_template_id: null,
          name: companion.name,
          category_name: companion.category_name,
          weight_grams: companion.weight_grams,
          value_cents: companion.value_cents,
          quantity: companion.quantity,
          mode: 'pack',
          late_packer: false,
        },
        null,
      )
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: optimisticInsert(mutation),
      })
    }
  }

  // --- The group refresh (FR-27.4) ---

  /**
   * The optimistic PullChange for a write — applied before the push lands.
   *
   * `fields` must be the **whole** row, not the mutation's fields: a store
   * applies a change by replacing the row it has, so a column left out here
   * is blanked until a pull puts it back — and in Local Mode no pull ever
   * comes. For an update of an existing row that means spreading the row
   * helper first (`{ ...tripRow(trip), ...mutation.fields }`); only an insert
   * may pass `mutation.fields` alone, because there the two are the same.
   */
  function change(
    table: string,
    id: string,
    fields: Record<string, unknown> | null | undefined,
  ): PullChange {
    return localChange(table, id, (fields ?? {}) as Record<string, unknown>)
  }

  function tombstone(table: string, id: string): PullChange {
    return localTombstone(table, id)
  }

  /**
   * The open questions, by trip id (FR-27.4). Derived state, deliberately
   * not synced: a proposal is a diff between rows that are already synced,
   * so every device computes the same one and none of them has to agree
   * with the others about a pending decision.
   */
  // shallowRef, not ref: a plan is replaced wholesale and never edited in
  // place, and deep reactivity over a diff of every changed row would be paid
  // for on every trip open.
  const proposals = shallowRef<Record<string, RefreshPlan>>({})
  const refreshProposals = computed(() => proposals.value)

  /**
   * proposeTripRefresh re-resolves one trip against the groups it follows
   * and *offers* what moved (FR-27.4). It runs on every trip open and after
   * every master pull, so the empty plan is the normal case and must cost
   * nothing.
   *
   * Nothing on the trip is written here — that is the whole point of the
   * split: the owner's rule (2026-08-18) is that a group change reaches a
   * trip by being asked about, and the question is asked at the trip. What
   * this *does* write, immediately and silently, is the bookkeeping half of
   * a plan that proposes nothing: adopting a hand-added row into the ledger
   * changes nothing the user could answer a question about, and leaving it
   * unwritten would re-derive it on every open forever.
   *
   * Returns the plan, so a caller (and a test) can read what is on offer
   * rather than infer it from the resulting rows.
   */
  function proposeTripRefresh(tripId: string): RefreshPlan | null {
    const plan = deriveTripRefresh(tripId)
    if (!plan) return null
    if (proposedChangeCount(plan) === 0) {
      applyRefreshPlan(tripId, plan)
      clearProposal(tripId)
      return plan
    }
    proposals.value = { ...proposals.value, [tripId]: plan }
    return plan
  }

  /**
   * acceptTripRefresh is the answer "yes": the trip takes the changes over
   * and M2's log records them.
   *
   * It re-derives rather than applying the plan it was shown. The group may
   * have moved again between the question and the answer — on this device or
   * another one — and applying the fresher diff is both simpler to reason
   * about than reconciling two plans and closer to what the user meant.
   */
  function acceptTripRefresh(tripId: string): RefreshPlan | null {
    const plan = deriveTripRefresh(tripId)
    if (!plan) return null
    applyRefreshPlan(tripId, plan)
    clearProposal(tripId)
    return plan
  }

  /**
   * declineTripRefresh is the answer "no": the trip keeps what it has and
   * the refused positions stop following the group (see declinePlan).
   */
  function declineTripRefresh(tripId: string): RefreshPlan | null {
    const plan = deriveTripRefresh(tripId)
    if (!plan) return null
    const declined = declinePlan(plan)
    applyRefreshPlan(tripId, declined)
    clearProposal(tripId)
    return declined
  }

  function clearProposal(tripId: string): void {
    if (!(tripId in proposals.value)) return
    const next = { ...proposals.value }
    delete next[tripId]
    proposals.value = next
  }

  /** The diff, derived and never applied. Null when the trip cannot be seen. */
  function deriveTripRefresh(tripId: string): RefreshPlan | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null

    return planRefresh({
      trip,
      sources: tripStore.getTemplateSources(tripId),
      templates: masterStore.templateList,
      includes: masterStore.includeList,
      templateItems: [...masterStore.templateList].flatMap((t) =>
        masterStore.getTemplateItems(t.id),
      ),
      templateItemTasks: masterStore.templateItemTaskList,
      masterItems: masterStore.itemList,
      travelers: tripStore.getTravelers(tripId),
      items: tripStore.getItems(tripId),
      todos: tripStore.getTodos(tripId),
      ledger: tripStore.getGeneratedPositions(tripId),
      today: today(),
    })
  }

  /** Writes a plan out — every half of it, in dependency order. */
  function applyRefreshPlan(tripId: string, plan: RefreshPlan): void {
    if (isEmptyPlan(plan)) return

    for (const add of plan.add) {
      const travelerId = add.traveler_id
      const { mutation, id } = mutations.addGeneratedTripItem(
        tripId,
        add.generated,
        travelerId,
        add.trip_item_id,
      )
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: change(TABLE.tripItems, id, mutation.fields),
      })
      // FR-27.7: the position's tasks arrive as ordinary prep todos, the
      // same shape generation writes — enqueued after the row they hang
      // off, or the server rejects the foreign key.
      for (const body of add.generated.tasks) {
        addPrepTodo(tripId, id, CLIENT_ACTOR_PLACEHOLDER, body)
      }
    }

    for (const update of plan.update) {
      if (Object.keys(update.fields).length > 0) {
        const mutation = mutations.updateGeneratedTripItem(update.item.id, update.fields)
        enqueueAndDrain('trip', tripId, {
          mutation,
          optimistic: change(TABLE.tripItems, update.item.id, {
            ...itemRow(update.item),
            ...mutation.fields,
          }),
        })
      }
      for (const body of update.addTasks) {
        addPrepTodo(tripId, update.item.id, CLIENT_ACTOR_PLACEHOLDER, body)
      }
      for (const todo of update.removeTodos) {
        enqueueAndDrain('trip', tripId, {
          mutation: mutations.deleteTodo(todo.id),
          optimistic: tombstone(TABLE.comments, todo.id),
        })
      }
    }

    for (const removal of plan.remove) {
      enqueueAndDrain('trip', tripId, {
        mutation: mutations.deleteTripItem(removal.item.id),
        optimistic: tombstone(TABLE.tripItems, removal.item.id),
      })
    }

    for (const entry of plan.ledgerUpsert) {
      const mutation = mutations.writeGeneratedPosition(entry)
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: change(TABLE.tripGeneratedPositions, entry.id, mutation.fields),
      })
    }

    for (const entryId of plan.ledgerDelete) {
      enqueueAndDrain('trip', tripId, {
        mutation: mutations.deleteGeneratedPosition(entryId),
        optimistic: tombstone(TABLE.tripGeneratedPositions, entryId),
      })
    }

    // The log travels the master partition so M2 can render the chip
    // without this trip's partition being loaded (P-3, migration 023).
    for (const entry of plan.log) {
      const { mutation, id } = mutations.logAppliedChange(entry)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: change(TABLE.tripAppliedChanges, id, mutation.fields),
      })
    }
  }

  /**
   * tripDataLoaded answers whether this trip's rows are on the device. It is
   * the guard that keeps the refresh from mistaking "not pulled yet" for
   * "empty trip" — the one way this feature could duplicate the whole list
   * it exists to keep right.
   */
  function tripDataLoaded(tripId: string): boolean {
    return local ? localHydrated : loadedTripPartitions.has(tripId)
  }

  /**
   * addGroupToTrip adds a whole group to a trip that already exists
   * (FR-27.10) — the M4 quick-add's second half.
   *
   * Three decisions are visible in what it writes:
   *
   * - **No FR-9.1 *Missing* flag**, unlike a single ad-hoc add on an active
   *   trip. The item was never missing from the plan; the plan grew. Flagging
   *   it would feed the M14 review assistant a lie and produce "add it to the
   *   template" proposals for items that came *from* a template.
   * - **The rows carry the group's provenance**, which is what keeps the
   *   round trip intact: FR-27.5 recognises them a year later instead of
   *   reporting them as ad-hoc additions.
   * - **The group is registered as one of the trip's sources** unless the trip
   *   is already past, so later group edits are offered to it per FR-27.4.
   *
   * Returns the report the caller shows, or null when the trip's rows are not
   * on the device: "not pulled yet" must never be read as "empty trip", which
   * is the one way this could duplicate the list it just resolved against.
   */
  function addGroupToTrip(tripId: string, templateId: string): GroupAdditionReport | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null
    const template = masterStore.getTemplate(templateId)
    if (!template) return null

    const plan = planGroupAddition({
      templateId,
      templates: masterStore.templateList,
      includes: masterStore.includeList,
      templateItems: [...masterStore.templateList].flatMap((t) =>
        masterStore.getTemplateItems(t.id),
      ),
      templateItemTasks: masterStore.templateItemTaskList,
      masterItems: masterStore.itemList,
      attributes: trip.attributes,
      duration_days: trip.duration_days,
      travelers: tripStore.getTravelers(tripId),
      items: tripStore.getItems(tripId),
    })

    for (const add of plan.add) {
      const { mutation, id } = mutations.addGeneratedTripItem(
        tripId,
        add.generated,
        add.traveler_id,
      )
      enqueueAndDrain('trip', tripId, {
        mutation,
        optimistic: change(TABLE.tripItems, id, mutation.fields),
      })
      // FR-27.7 tasks become ordinary FR-7.3 todos, enqueued after the row
      // they hang off — pushed ahead of it, the server rejects the key.
      for (const body of add.generated.tasks) {
        addPrepTodo(tripId, id, CLIENT_ACTOR_PLACEHOLDER, body)
      }
    }

    // FR-20.4, the same rule the single-item quick-add applies: what the group
    // placed brings its required companions. Adding twelve positions at once
    // must not be the one path that skips it. Once for the whole group rather
    // than per row — the resolution reads the settled list either way.
    if (plan.add.length > 0) addRequiredCompanions(tripId)

    // Registered even when the group placed nothing: following it is about
    // what it does from here on, not about what it happened to contribute.
    const registered = tripStore
      .getTemplateSources(tripId)
      .some((s) => s.template_id === templateId)
    if (!registered && followsGroups(trip, today())) {
      const { mutation, id } = mutations.registerTripSource(tripId, templateId)
      enqueueAndDrain('master', null, {
        mutation,
        optimistic: change(TABLE.tripTemplateSources, id, mutation.fields),
      })
    }

    return {
      groupName: template.name,
      added: plan.add.length,
      alreadyPresent: plan.alreadyPresent,
    }
  }

  /**
   * updateTrip writes an FR-2.7 edit of the trip's own fields. Master
   * partition: `trips` lives there, beside the templates.
   */
  function updateTrip(tripId: string, fields: TripEdit): void {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const mutation = mutations.updateTrip(tripId, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: change(TABLE.trips, tripId, { ...tripRow(trip), ...mutation.fields }),
    })
  }

  /**
   * renameTraveler changes a traveler's name (FR-2.7). Deliberately *not* a
   * removal plus an addition: every row assigned to them points at this row,
   * and re-creating it would detach all of them at the moment the user meant
   * the least by the change.
   */
  function renameTraveler(tripId: string, travelerId: string, name: string): void {
    const traveler = tripStore.getTravelers(tripId).find((t) => t.id === travelerId)
    if (!traveler) return
    const mutation = mutations.renameTraveler(travelerId, name)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: change(TABLE.travelers, travelerId, {
        ...travelerRow(traveler),
        ...mutation.fields,
      }),
    })
  }

  /**
   * addTravelerToTrip adds a person to a trip that already exists (FR-2.7)
   * and lets the trip's plan follow **immediately** — the FR-27.4 amendment
   * of 2026-08-21. It performs no resolution of its own: the travelers were
   * always part of what a trip follows, so the work is `acceptTripRefresh`,
   * the same path the "yes" on M4's card takes. That is the whole point of
   * routing it here rather than expanding per-person rows a second way.
   *
   * Returns what happened, so the screen can report it (FR-27.10's pattern)
   * rather than leave the user guessing which rows appeared. Null when the
   * trip cannot be seen or its data is not loaded.
   */
  function addTravelerToTrip(tripId: string, name: string): TravelerChangeReport | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null

    const { mutation, id } = mutations.addTraveler(tripId, name)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: change(TABLE.travelers, id, mutation.fields),
    })

    return { travelerId: id, ...applyTravelerConsequences(tripId, trip) }
  }

  /**
   * removeTraveler takes a person off a trip that has **not started** — the
   * owner's rule (FR-2.7). On a started trip it refuses and returns null;
   * the control is disabled there, so this is the second line rather than
   * the first, and it exists because a store is reachable from more than one
   * screen.
   *
   * The rows follow through FR-27.4 like the addition does, which is what
   * keeps its protection intact: the person's *untouched* rows go with them,
   * and a row that was packed, skipped or hand-edited stays on the list and
   * only loses the assignment.
   */
  /**
   * packedRowsOf counts what a traveller's removal would have to decide about:
   * their rows that packing has begun on. The editor asks its FR-2.7 question
   * only when this is non-zero — a choice offered over nothing is a dialogue
   * the user learns to dismiss.
   */
  function packedRowsOf(tripId: string, travelerId: string): number {
    return tripStore
      .getItems(tripId)
      .filter((i) => i.assigned_traveler_id === travelerId && i.packed_count > 0).length
  }

  /**
   * removeTraveler takes a person off a trip that has **not started** — the
   * owner's rule (FR-2.7). On a started trip it refuses and returns null;
   * the control is disabled there, so this is the second line rather than
   * the first, and it exists because a store is reachable from more than one
   * screen.
   *
   * Their **unpacked** rows go with them through FR-27.4, whose protection is
   * what keeps a packed one out of it. What happens to *those* is the user's
   * call, taken at the confirmation (owner, 2026-08-21): `includePacked`
   * deletes them outright — the person is not coming, so the thing comes back
   * out of the bag — while the default leaves them on the list without an
   * assignment, as the reminder that something in the bag now belongs to
   * nobody. Neither is right in general, which is why it is asked.
   */
  function removeTraveler(
    tripId: string,
    travelerId: string,
    opts: { includePacked?: boolean } = {},
  ): TravelerChangeReport | null {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return null
    if (!tripDataLoaded(tripId)) return null
    if (trip.status !== TRIP_STATUS_PLANNING) return null

    let takenPacked = 0
    for (const item of tripStore.getItems(tripId)) {
      if (item.assigned_traveler_id !== travelerId) continue
      if (opts.includePacked && item.packed_count > 0) {
        // Deleted here rather than left to the refresh: FR-27.4 protects a row
        // packing has begun on, and that protection is exactly what the user
        // just overruled for this person.
        enqueueAndDrain('trip', tripId, {
          mutation: mutations.deleteTripItem(item.id),
          optimistic: tombstone(TABLE.tripItems, item.id),
        })
        takenPacked += 1
        continue
      }
      // Detach first, then delete the traveler: a row still pointing at a
      // traveler row that is gone is a dangling reference the refresh would
      // have to guess about.
      assignTraveler(tripId, item, null)
    }

    const mutation = mutations.removeTravelerRow(travelerId)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })

    const report = applyTravelerConsequences(tripId, trip)
    return {
      travelerId,
      ...report,
      removed: report.removed + takenPacked,
      kept: Math.max(0, report.kept - takenPacked),
    }
  }

  /**
   * applyTravelerConsequences runs FR-27.4 for a roster change the user just
   * made, and reports what it did. A trip that no longer follows its groups
   * (archived, or past) changes nothing but its roster — the same boundary
   * every other refresh respects.
   */
  function applyTravelerConsequences(
    tripId: string,
    trip: Trip,
  ): Omit<TravelerChangeReport, 'travelerId'> {
    if (!followsGroups(trip, today())) return { added: 0, removed: 0, kept: 0 }
    const before = tripStore.getItems(tripId).length
    const plan = acceptTripRefresh(tripId)
    if (!plan) return { added: 0, removed: 0, kept: 0 }
    const after = tripStore.getItems(tripId).length
    return {
      added: plan.add.length,
      removed: plan.remove.length,
      // Rows the refresh deliberately left alone. Reported rather than
      // inferred: a row that stays behind after its person left is exactly
      // the thing a user finds later and does not understand.
      kept: Math.max(0, before - after - plan.remove.length) + plan.update.length,
    }
  }

  /**
   * proposeRefreshForLoadedTrips derives a proposal for every trip this
   * device actually holds. Called after a master pull: a group edited on
   * another device arrives there, and M2 must be able to say which trips it
   * concerns before any of them is opened.
   */
  function proposeRefreshForLoadedTrips(): void {
    const now = today()
    for (const trip of tripStore.tripList) {
      if (!followsGroups(trip, now)) continue
      proposeTripRefresh(trip.id)
    }
  }

  /**
   * createTripFromWizard commits an M3 draft: the trips row goes to the
   * master partition, travelers and generated items to the new trip's
   * partition. The master partition drains first — the server creates
   * the trip row and the creator's owner membership there, without
   * which the trip-partition push would be rejected (403/FK).
   */
  function createTripFromWizard(draft: TripWizardDraft): string {
    // An inline-created series must precede the trip in the same master
    // queue — a separate drain could race and push the trip's series_id
    // reference before the series row exists.
    let seriesId = draft.seriesId ?? null
    if (draft.newSeriesName) {
      const { mutation, id } = mutations.createSeries(draft.newSeriesName, draft.attributes)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('master', null, mutation)
      seriesId = id
    }

    const { mutation: tripMut, id: tripId } = mutations.createTrip(
      draft.name,
      draft.year,
      draft.startDate,
      draft.endDate,
      { attributes: draft.attributes, seriesId },
    )
    onPullChanges([optimisticInsert(tripMut)])
    if (!local) outbox.enqueue('master', null, tripMut)

    // Member grants follow the trips insert in the same master queue —
    // the server authorizes them against the freshly created trip.
    for (const member of draft.members ?? []) {
      const { mutation } = mutations.addTripMember(tripId, member.userId, member.role)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('master', null, mutation)
    }

    const travelerIds = draft.travelers.map((tr) => {
      const { mutation, id } = mutations.addTraveler(tripId, tr.name, tr.linkedUserId ?? null)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('trip', tripId, mutation)
      return id
    })

    for (const item of draft.items) {
      const assignedTravelerId =
        item.traveler_index === null ? null : (travelerIds[item.traveler_index] ?? null)
      const { mutation, id } = mutations.addGeneratedTripItem(tripId, item, assignedTravelerId)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('trip', tripId, mutation)

      // FR-27.7: a position's preparation tasks become ordinary FR-7.3 todos
      // on the row they were generated for — no new flag, so "an item with an
      // open prep todo is not done" applies without a second mechanism.
      // Enqueued inside this loop so each todo follows the trip_items row it
      // references; pushed ahead of it, the server rejects the foreign key.
      for (const taskBody of item.tasks) {
        const { mutation: todoMut } = mutations.addTodo(
          tripId,
          id,
          CLIENT_ACTOR_PLACEHOLDER,
          taskBody,
        )
        onPullChanges([optimisticInsert(todoMut)])
        if (!local) outbox.enqueue('trip', tripId, todoMut)
      }
    }

    // FR-27.4: what the trip follows from here on. Registered after the
    // trips row and in the same master queue — the server resolves the FK
    // against a trip it has already created.
    for (const templateId of draft.sourceTemplateIds ?? []) {
      const { mutation } = mutations.registerTripSource(tripId, templateId)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('master', null, mutation)
    }

    for (const chk of draft.checklistItems ?? []) {
      const { mutation } = mutations.addTripItem(tripId, chk.label, { mode: chk.mode })
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('trip', tripId, mutation)
    }

    if (local) return tripId
    syncStatus.setPendingCount(outbox.totalPending())
    drainMaster()
      .then(() => drainTrip(tripId))
      .catch(() => {})
    return tripId
  }

  /**
   * cloneTrip duplicates an archived trip per FR-12.1/12.2: the plan
   * comes from the pure domain (`planClone`), the cascade mirrors
   * createTripFromWizard — trips row to the master partition first,
   * then travelers, containers (pairing as a second pass, a forward
   * pair reference would violate the FK), then items with remapped
   * links. Returns the new trip id, or null when the source is unknown.
   */
  function cloneTrip(sourceTripId: string, draft: CloneDraft): string | null {
    const source = tripStore.getTrip(sourceTripId)
    if (!source) return null

    const plan = planClone(
      {
        trip: source,
        items: tripStore.getItems(sourceTripId),
        travelers: tripStore.getTravelers(sourceTripId),
        containers: tripStore.getContainers(sourceTripId),
      },
      draft.options,
      {
        templateItem: (templateId, itemId) =>
          masterStore.getTemplateItems(templateId).find((ti) => ti.item_id === itemId),
        masterItem: (id) => masterStore.getItem(id),
      },
      durationDays(draft.startDate, draft.endDate),
    )

    const { mutation: tripMut, id: tripId } = mutations.createTrip(
      draft.name,
      draft.year,
      draft.startDate,
      draft.endDate,
      { seriesId: source.series_id, attributes: source.attributes },
    )
    onPullChanges([optimisticInsert(tripMut)])
    if (!local) outbox.enqueue('master', null, tripMut)

    const travelerIds = plan.travelers.map((tr) => {
      const { mutation, id } = mutations.addTraveler(tripId, tr.name, null)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('trip', tripId, mutation)
      return id
    })

    const containerIds = plan.containers.map((c) => {
      const { mutation, id } = mutations.addContainer(tripId, c.name, {
        carrierTravelerId:
          c.carrier_traveler_index === null
            ? null
            : (travelerIds[c.carrier_traveler_index] ?? null),
        maxWeightGrams: c.max_weight_grams,
      })
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('trip', tripId, mutation)
      return id
    })
    plan.containers.forEach((c, i) => {
      if (c.paired_container_index === null) return
      const mutation = mutations.updateContainer(containerIds[i]!, {
        paired_container_id: containerIds[c.paired_container_index],
      })
      const base = plan.containers[i]!
      onPullChanges([
        optimisticUpdate(mutation, {
          trip_id: tripId,
          name: base.name,
          carrier_traveler_id:
            base.carrier_traveler_index === null
              ? null
              : (travelerIds[base.carrier_traveler_index] ?? null),
          max_weight_grams: base.max_weight_grams,
        }),
      ])
      if (!local) outbox.enqueue('trip', tripId, mutation)
    })

    for (const item of plan.items) {
      const { mutation } = mutations.addClonedTripItem(
        tripId,
        item,
        item.traveler_index === null ? null : (travelerIds[item.traveler_index] ?? null),
        item.container_index === null ? null : (containerIds[item.container_index] ?? null),
      )
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('trip', tripId, mutation)
    }

    if (local) return tripId
    syncStatus.setPendingCount(outbox.totalPending())
    drainMaster()
      .then(() => drainTrip(tripId))
      .catch(() => {})
    return tripId
  }

  /**
   * commitImport lands an M15 import plan (FR-16.2): categories and
   * master items on the master partition (merging where the dedup step
   * decided), then one archived `imported` trip per selected column with
   * its original quantities as packed rows; '?' noise becomes an open
   * task on the affected row (NFR-4.7). NFR-4.7's transactional rollback
   * is approximated client-side: the plan is fully validated before any
   * mutation is enqueued, parents precede children in the queues, and
   * mutation replay is idempotent — there is no server-side transaction
   * across a push batch.
   */
  /**
   * Record one item↔tag assignment on the import path, which enqueues
   * directly rather than through enqueueAndDrain: an import lands many
   * mutations and drains once at the end.
   */
  function assignTagLocally(itemId: string, tagId: string, position: number): void {
    const { mutation } = mutations.assignTag(itemId, tagId, position)
    onPullChanges([optimisticInsert(mutation)])
    if (!local) outbox.enqueue('master', null, mutation)
  }

  function commitImport(plan: ImportPlan): { tripIds: string[] } {
    // The spreadsheet's category column becomes a tag (FR-24.1): reuse by
    // (case-insensitive) name, create the rest.
    const tagIDs = new Map<string, string>()
    for (const tag of masterStore.tagList) {
      tagIDs.set(tag.name.toLowerCase(), tag.id)
    }
    for (const name of plan.newCategories) {
      if (tagIDs.has(name.toLowerCase())) continue
      const { mutation, id } = mutations.createTag(name)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('master', null, mutation)
      tagIDs.set(name.toLowerCase(), id)
    }

    const itemIDs: (string | null)[] = plan.items.map((item) => {
      if (item.existingItemId) return item.existingItemId
      const { mutation, id } = mutations.createMasterItem(item.name)
      onPullChanges([optimisticInsert(mutation)])
      if (!local) outbox.enqueue('master', null, mutation)
      // Only now: the imported category becomes the item's primary tag
      // (FR-24.2), and a tag assignment names its item by foreign key. Sent
      // first, every one of them is refused by a server that has not seen the
      // item yet — invisibly, because this device already holds both.
      const tagID = item.categoryName ? tagIDs.get(item.categoryName.toLowerCase()) : undefined
      if (tagID) assignTagLocally(id, tagID, 0)
      return id
    })

    const tripIds: string[] = []
    for (const trip of plan.trips) {
      const { mutation: tripMut, id: tripId } = mutations.createImportedTrip(
        trip.name,
        trip.year,
        trip.endDate,
        trip.seriesId,
      )
      onPullChanges([optimisticInsert(tripMut)])
      if (!local) outbox.enqueue('master', null, tripMut)
      tripIds.push(tripId)

      for (const entry of trip.items) {
        // buildImportPlan only emits in-range item indexes.
        const item = plan.items[entry.itemIndex]!
        const { mutation, id } = mutations.addImportedTripItem(tripId, {
          name: item.name,
          sourceItemId: itemIDs[entry.itemIndex] ?? null,
          categoryName: item.categoryName,
          quantity: entry.quantity,
        })
        onPullChanges([optimisticInsert(mutation)])
        if (!local) outbox.enqueue('trip', tripId, mutation)

        if (item.hasOpenTask) {
          // Author placeholder — the server stamps author_id on insert.
          const todo = mutations.addTodo(
            tripId,
            id,
            'import',
            `Imported with '?' — clarify: ${item.name}`,
          )
          onPullChanges([optimisticInsert(todo.mutation)])
          if (!local) outbox.enqueue('trip', tripId, todo.mutation)
        }
      }
    }

    if (!local) {
      syncStatus.setPendingCount(outbox.totalPending())
      drainMaster()
        .then(() => Promise.all(tripIds.map((id) => drainTrip(id))))
        .catch(() => {})
    }
    return { tripIds }
  }

  /**
   * The environment the FR-18.4 rules run in here: the device's own stores,
   * this session's mutation builders, and a write that lands optimistically
   * and queues for the server. The rules themselves are in
   * `@/domain/portableImport`, where the command line reaches them too
   * (ADR-008).
   */
  function portableImportEnv(): PortableImportEnv {
    return {
      /*
       * Trips live in the trip store rather than the master one, so the view
       * is assembled here — through getters, because ADR-030's rule reads it
       * back between writes and a snapshot taken now would not see the trip
       * the previous document just created.
       */
      master: {
        get itemList() {
          return masterStore.itemList
        },
        get tagList() {
          return masterStore.tagList
        },
        get templateList() {
          return masterStore.templateList
        },
        get tripList() {
          return tripStore.tripList
        },
      },
      mutations,
      emit(partition, tripId, mutation) {
        onPullChanges([optimisticInsert(mutation)])
        if (!local) outbox.enqueue(partition, tripId, mutation)
      },
    }
  }

  /** Land one M18 portable document, then push what it produced (FR-18.4). */
  function commitPortableImport(
    doc: PortableDocument,
    mergeDecisions: Map<string, string>,
    restoredTemplates?: Map<string, string>,
  ): PortableImportResult {
    const result = importPortableDocument(
      doc,
      mergeDecisions,
      portableImportEnv(),
      restoredTemplates,
    )
    drainAfterImport(result.kind === 'trip' ? result.id : null)
    return result
  }

  /** Restore a whole backup file (NFR-4.11), then push what it produced. */
  function commitPortableRestore(docs: PortableDocument[]): PortableImportResult[] {
    const imported = importPortableBackup(docs, portableImportEnv())
    drainAfterImport(null)
    return imported
  }

  /**
   * An import lands many mutations and drains once at the end, rather than
   * per write: the outbox is what makes that safe, and a push per row would
   * turn a restore into hundreds of requests.
   */
  function drainAfterImport(tripId: string | null): void {
    if (local) return
    syncStatus.setPendingCount(outbox.totalPending())
    drainMaster()
      .then(() => (tripId ? drainTrip(tripId) : Promise.resolve()))
      .catch(() => {})
  }

  // --- Master data actions (M7–M10; master partition) ---

  /** Create a tag by typing its name (FR-24.1) — there is no tag admin. */
  function createTag(name: string): string {
    const { mutation, id } = mutations.createTag(name, masterStore.tagList.length)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  /** Assign a tag to an item; appended last unless it is the first (FR-24.2). */
  function assignTag(itemId: string, tagId: string): string {
    const position = masterStore.getItemTags(itemId).length
    const { mutation, id } = mutations.assignTag(itemId, tagId, position)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function unassignTag(assignmentId: string): void {
    const mutation = mutations.unassignTag(assignmentId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  function createMasterItem(
    name: string,
    opts: Parameters<typeof mutations.createMasterItem>[1] = {},
  ): string {
    const { mutation, id } = mutations.createMasterItem(name, opts)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateMasterItem(item: MasterItem, fields: Record<string, unknown>) {
    const mutation = mutations.updateMasterItem(item.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, masterItemRow(item)),
    })
  }

  function deleteMasterItem(itemId: string) {
    const mutation = mutations.deleteMasterItem(itemId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /**
   * setItemImage attaches or replaces an item's reference photo (FR-22.1/
   * 22.5). The source is optimized on-device first (FR-22.2/22.3), then in
   * Server Mode uploaded (the server stamps items.image_hash, which a
   * master drain pulls back) and in Local Mode written to IndexedDB with a
   * locally computed hash funneled through the same change path.
   */
  async function setItemImage(item: MasterItem, source: Blob): Promise<void> {
    const optimized = await optimizeItemImage(source)
    if (local) {
      await local.putImage(item.id, optimized)
      const hash = await hashBlob(optimized)
      onPullChanges([
        localChange(TABLE.items, item.id, { ...masterItemRow(item), image_hash: hash }),
      ])
      return
    }
    await client.putRaw(API.itemImage(item.id), optimized, 'image/jpeg')
    await drainMaster()
  }

  /** deleteItemImage removes an item's photo (FR-22.5). */
  async function deleteItemImage(item: MasterItem): Promise<void> {
    if (local) {
      await local.deleteImage(item.id)
      onPullChanges([
        localChange(TABLE.items, item.id, { ...masterItemRow(item), image_hash: null }),
      ])
      return
    }
    await client.delete(API.itemImage(item.id))
    await drainMaster()
  }

  /**
   * itemImageUrl resolves a displayable URL for an item's photo, or null
   * when it has none. Server Mode returns the public GET endpoint (with the
   * hash as a cache-buster); Local Mode returns an object URL the caller
   * must revoke. Callers guard on item.image_hash to avoid a needless
   * lookup.
   */
  async function itemImageUrl(item: MasterItem): Promise<string | null> {
    if (!item.image_hash) return null
    if (local) {
      const blob = await local.getImage(item.id)
      return blob ? URL.createObjectURL(blob) : null
    }
    return `${config.baseUrl}${API.itemImage(item.id)}?v=${item.image_hash}`
  }

  /** createTemplate makes a new template. Templates are shared
   * instance-wide (FR-1.6 MVP), so owner_id is creator metadata only; it is
   * stamped server-side on push and the optimistic row leaves it empty.
   * Returns the new id so the caller can open M8.
   *
   * The scope is chosen at creation and never derived from usage (FR-27.1):
   * a group nothing includes yet would otherwise be unclassifiable. */
  function createTemplate(
    name: string,
    kind: TemplateKind = 'template',
    /** FR-28.8: the optional mark, set at creation by the seed and the import. */
    icon: string | null = null,
  ): string {
    const { mutation, id } = mutations.createTemplate(name, '', kind, icon)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateTemplate(template: Template, fields: Record<string, unknown>) {
    const mutation = mutations.updateTemplate(template.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, templateRow(template)),
    })
  }

  function addTemplateItem(
    templateId: string,
    itemId: string,
    opts: Parameters<typeof mutations.addTemplateItem>[2] = {},
  ): string {
    const { mutation, id } = mutations.addTemplateItem(templateId, itemId, opts)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateTemplateItem(templateItem: TemplateItem, fields: Record<string, unknown>) {
    const mutation = mutations.updateTemplateItem(templateItem.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, templateItemRow(templateItem)),
    })
  }

  function deleteTemplateItem(templateItemId: string) {
    const mutation = mutations.deleteTemplateItem(templateItemId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /** deleteTemplate removes a template; the store mirrors the cascades. */
  function deleteTemplate(templateId: string) {
    const mutation = mutations.deleteTemplate(templateId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /** addTemplateInclude references a Gruppe from a Ferien-Vorlage (FR-27.1). */
  function addTemplateInclude(templateId: string, includedTemplateId: string): string {
    const { mutation, id } = mutations.addTemplateInclude(templateId, includedTemplateId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function removeTemplateInclude(includeId: string) {
    const mutation = mutations.removeTemplateInclude(includeId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /** addTemplateItemTask attaches one FR-27.7 preparation task to a position. */
  function addTemplateItemTask(templateItemId: string, task: string): string {
    const { mutation, id } = mutations.addTemplateItemTask(templateItemId, task)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function deleteTemplateItemTask(taskId: string) {
    const mutation = mutations.deleteTemplateItemTask(taskId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  // --- Item dependency actions (Addendum 3.20, FR-20.1) ---

  function addItemDependency(
    itemId: string,
    dependsOnItemId: string,
    opts: Parameters<typeof mutations.addItemDependency>[2] = {},
  ): string {
    const { mutation, id } = mutations.addItemDependency(itemId, dependsOnItemId, opts)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateItemDependency(dependency: ItemDependency, fields: Record<string, unknown>) {
    const mutation = mutations.updateItemDependency(dependency.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, dependencyRow(dependency)),
    })
  }

  function deleteItemDependency(dependencyId: string) {
    const mutation = mutations.deleteItemDependency(dependencyId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  // --- Todo actions (FR-7.3) ---

  function addPrepTodo(tripId: string, tripItemId: string, authorId: string, body: string) {
    const { mutation } = mutations.addTodo(tripId, tripItemId, authorId, body)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
  }

  function resolvePrepTodo(tripId: string, todo: ItemTodo) {
    const mut = mutations.resolveTodo(todo.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, todoRow(todo)),
    })
  }

  function reopenPrepTodo(tripId: string, todo: ItemTodo) {
    const mut = mutations.reopenTodo(todo.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, todoRow(todo)),
    })
  }

  /**
   * fetchConflicts loads the trip's conflict log for the G-2 view.
   * Local Mode has one writer and therefore no conflicts (FR-19.6).
   */
  async function fetchConflicts(tripId: string): Promise<ConflictEntry[]> {
    if (local) return []
    const resp = await client.get<ConflictListResponse>(API.tripConflicts(tripId), {})
    return resp.conflicts
  }

  /**
   * fetchMasterConflicts loads the *master* partition's conflict log — the
   * losers on inventory, groups, series and a trip's own fields, which are
   * merged there rather than in the trip partition. It takes no trip id
   * because it belongs to none, which is why it needs its own endpoint:
   * the per-trip query filters on `trip_id` and these rows have none.
   */
  async function fetchMasterConflicts(): Promise<ConflictEntry[]> {
    if (local) return []
    const resp = await client.get<ConflictListResponse>(API.masterConflicts, {})
    return resp.conflicts
  }

  /**
   * revertConflict restores the losing value of one audited merge —
   * NFR-4.2a's second promise, beside the audit. The server writes it as
   * an ordinary mutation with a fresh HLC rather than rewriting the past
   * (ADR-023), so the restored value arrives here the normal way: the
   * drain below pulls it, and every other device pulls it too.
   *
   * `tripId` picks the partition, exactly as the two fetchers do. Local
   * Mode has one writer, so it has no conflicts to revert (FR-19.6).
   */
  async function revertConflict(conflictId: string, tripId?: string): Promise<void> {
    if (local) return
    if (tripId !== undefined) {
      await client.post(API.tripConflictRevert(tripId, conflictId))
      await drainTrip(tripId)
      return
    }
    await client.post(API.masterConflictRevert(conflictId))
    await drainMaster()
  }

  // --- Profile & data (M17) ---

  /**
   * fetchMe resolves the own identity; null in Local Mode (no server).
   * is_instance_admin gates the M20 entry point (FR-23.2).
   */
  async function fetchMe(): Promise<MeResponse | null> {
    if (local) return null
    try {
      return await client.get<MeResponse>(API.me, {})
    } catch {
      return null
    }
  }

  // --- Instance user management (Addendum 3.23, M20) ---
  // Plain REST, admin-gated server-side; nothing here touches the sync
  // partitions (users is outside both).

  async function fetchAdminUsers(): Promise<AdminUserRow[]> {
    const resp = await client.get<AdminUserListResponse>(API.adminUsers, {})
    return resp.users ?? []
  }

  async function deactivateUser(userID: string): Promise<void> {
    await client.post(API.adminDeactivateUser(userID), {})
  }

  async function reactivateUser(userID: string): Promise<void> {
    await client.post(API.adminReactivateUser(userID), {})
  }

  async function adminResetAvatar(userID: string): Promise<void> {
    await client.delete(API.adminResetAvatar(userID))
  }

  async function adminResetDisplayName(userID: string): Promise<void> {
    await client.delete(API.adminResetDisplayName(userID))
  }

  async function saveDisplayName(userId: string, name: string): Promise<void> {
    if (local) return
    await client.put(API.userDisplayName(userId), { display_name: name })
  }

  async function uploadAvatar(userId: string, jpeg: Blob): Promise<void> {
    if (local) return
    await client.putRaw(API.userAvatar(userId), jpeg, 'image/jpeg')
  }

  /** downloadExport fetches an NFR-4.5 export with the auth header. */
  async function downloadExport(path: string): Promise<Blob | null> {
    if (local) return null
    return client.getBlob(path)
  }

  function setTripStatus(tripId: string, status: TripStatus) {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const mutation = mutations.updateTripStatus(tripId, status)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, tripRow(trip)),
    })
  }

  // --- Trip membership actions (FR-4.5/4.7) ---

  /** addTripMember shares the trip with a user account; returns the row id. */
  function addTripMember(
    tripId: string,
    userId: string,
    role: 'admin' | 'editor' = 'editor',
  ): string {
    const { mutation, id } = mutations.addTripMember(tripId, userId, role)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function setTripMemberRole(member: TripMember, role: 'admin' | 'editor') {
    const mutation = mutations.setTripMemberRole(member.id, role)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, memberRow(member)),
    })
  }

  function removeTripMember(memberId: string) {
    const mutation = mutations.removeTripMember(memberId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /**
   * fetchUsers loads the instance's user directory for the M3 sharing
   * picker (FR-4.5); empty offline or in Local Mode (no accounts).
   */
  async function fetchUsers(): Promise<DirectoryUser[]> {
    if (local) return []
    try {
      const resp = await client.get<UserListResponse>(API.users, {})
      return resp.users ?? []
    } catch {
      return []
    }
  }

  // --- Series & destination actions (FR-13.1/13.2, M16) ---

  function createSeries(
    name: string,
    defaultAttributes: Record<string, unknown> | null = null,
  ): string {
    const { mutation, id } = mutations.createSeries(name, defaultAttributes)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateSeries(series: TripSeries, fields: Record<string, unknown>) {
    const mutation = mutations.updateSeries(series.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, seriesRow(series)),
    })
  }

  /** setTripSeries attaches (or, with null, detaches) a trip to a series. */
  function setTripSeries(tripId: string, seriesId: string | null) {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const mutation = mutations.setTripSeries(tripId, seriesId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, tripRow(trip)),
    })
  }

  /**
   * ensureDestinationProfile returns the series' profile id, creating
   * the (unique, FR-13.2) profile on first use.
   */
  function ensureDestinationProfile(seriesId: string): string {
    const existing = masterStore.getDestinationProfile(seriesId)
    if (existing) return existing.id
    const { mutation, id } = mutations.createDestinationProfile(seriesId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateDestinationProfile(profile: DestinationProfile, fields: Record<string, unknown>) {
    const mutation = mutations.updateDestinationProfile(profile.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, profileRow(profile)),
    })
  }

  function addChecklistItem(profileId: string, label: string, mode: ItemMode): string {
    const { mutation, id } = mutations.addChecklistItem(profileId, label, mode)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateChecklistItem(item: DestinationChecklistItem, fields: Record<string, unknown>) {
    const mutation = mutations.updateChecklistItem(item.id, fields)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticUpdate(mutation, checklistItemRow(item)),
    })
  }

  function deleteChecklistItem(itemId: string) {
    const mutation = mutations.deleteChecklistItem(itemId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  // --- Post-trip review (FR-9.2, M14) ---

  /**
   * activateTrip moves a planning trip into packing. The wizard only ever
   * creates planning trips, so without this a trip could reach *active*
   * nowhere in the app — the state that decides FR-9.1's Missing flagging
   * and M4's archive action.
   */
  function activateTrip(tripId: string) {
    setTripStatus(tripId, 'active')
  }

  /** archiveTrip completes the trip; archiving is the M14 review trigger. */
  function archiveTrip(tripId: string) {
    setTripStatus(tripId, 'archived')
  }

  /** deleteTrip removes a trip entirely (M2, Owner/Admin only — the server
   * enforces the role, this is the optimistic tombstone). Cascades on the
   * server; the local store drops the trip and its child rows at once. */
  function deleteTrip(tripId: string) {
    const mutation = mutations.deleteTrip(tripId)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /**
   * applyReviewProposal writes one review row back to master data
   * (FR-9.2). The target is a *group* (FR-27.11) — the row's picker may
   * have moved it off the proposal's default, so the group id is passed
   * explicitly. Groups are shared instance-wide (FR-1.6 MVP), so the
   * change lands in place — there is no fork step. Returns the id of
   * the group that received the change.
   */
  function applyReviewProposal(proposal: ReviewProposal, groupId: string): string {
    if (proposal.kind === 'unused') {
      // Look the position up by item at apply time: the proposal may
      // predate an edit that replaced the row.
      const target = masterStore
        .getTemplateItems(groupId)
        .find((ti) => ti.item_id === proposal.itemId)
      if (target) updateTemplateItem(target, { quantity: 0 })
      return groupId
    }
    const itemId = proposal.itemId ?? createMasterItem(proposal.itemName)
    addTemplateItem(groupId, itemId)
    return groupId
  }

  /**
   * createTemplateFromTrip folds a finished trip back into templates (M21,
   * FR-27.5) and returns the id of the composed Ferien-Vorlage it created.
   *
   * The writes run in the order FR-27.5 spells out — master items first, then
   * the group updates the user let through, then the optional bundle group,
   * then the Vorlage that **references** the recognised groups. Referencing
   * rather than copying is the whole point of the screen: a flat copy forks
   * every group the trip came from, and next year two divergent camera lists
   * exist.
   *
   * A deviation written into a group reaches every trip that still follows it
   * — the FR-27.4 question does the rest on the next open, which is why
   * nothing is recorded against those trips here.
   *
   * Returns null when the trip's own rows are not on this device: "not pulled
   * yet" must never be read as "a trip of nothing", which would silently
   * produce an empty template (the same guard addGroupToTrip carries).
   */
  function createTemplateFromTrip(
    tripId: string,
    answers: {
      templateName: string
      choices: Record<string, DeviationChoice>
      checkedLooseIds: string[]
      bundleName: string | null
    },
  ): string | null {
    if (!tripDataLoaded(tripId)) return null

    const composition = recogniseTripComposition({
      tripItems: tripStore.getItems(tripId),
      templates: masterStore.templateList,
      positions: masterStore.templateList.flatMap((t) => masterStore.getTemplateItems(t.id)),
      masterItems: masterStore.itemList,
    })
    const writes = planTemplateFromTrip({
      composition,
      templateName: answers.templateName,
      choices: answers.choices,
      checkedLooseIds: answers.checkedLooseIds,
      bundleName: answers.bundleName,
      masterItems: masterStore.itemList,
    })

    // 1. The master items the ad-hoc names had no counterpart for (FR-9.2).
    const invented = new Map<string, string>()
    for (const name of writes.newMasterItems) invented.set(name, createMasterItem(name))
    const itemIdOf = (p: PositionDraft) => p.itemId ?? invented.get(p.name)

    // A trip row is one thing somebody packed, not a per-head rule — the
    // per-person default belongs to positions written in M8, where the
    // question was actually asked.
    const write = (templateId: string, positions: PositionDraft[]) => {
      for (const p of positions) {
        const itemId = itemIdOf(p)
        if (itemId) addTemplateItem(templateId, itemId, { assignment: 'trip_global' })
      }
    }

    // 2. Deviations flowing back into their group.
    for (const update of writes.groupUpdates) write(update.groupId, update.positions)

    // 3. The optional bundle group, included like any other.
    const includeIds = [...writes.template.includeGroupIds]
    if (writes.newGroup) {
      const groupId = createTemplate(writes.newGroup.name, 'group')
      write(groupId, writes.newGroup.positions)
      includeIds.push(groupId)
    }

    // 4. The composed Ferien-Vorlage itself.
    const templateId = createTemplate(writes.template.name, 'template')
    write(templateId, writes.template.positions)
    for (const groupId of includeIds) addTemplateInclude(templateId, groupId)

    return templateId
  }

  // --- Container actions (FR-10.1, M11) ---

  function addContainer(
    tripId: string,
    name: string,
    opts: Parameters<typeof mutations.addContainer>[2] = {},
  ): string {
    const { mutation, id } = mutations.addContainer(tripId, name, opts)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function updateContainer(tripId: string, container: Container, fields: Record<string, unknown>) {
    const mutation = mutations.updateContainer(container.id, fields)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticUpdate(mutation, containerRow(container)),
    })
  }

  /** pairingMuts turns domain-computed paired_container_id writes into queue entries. */
  function pairingMuts(
    containers: Container[],
    writes: PairingWrite[],
  ): Parameters<typeof enqueueAndDrain>[2][] {
    const muts: Parameters<typeof enqueueAndDrain>[2][] = []
    for (const write of writes) {
      const current = containers.find((c) => c.id === write.containerId)
      if (!current) continue
      const mutation = mutations.updateContainer(write.containerId, {
        paired_container_id: write.paired_container_id,
      })
      muts.push({ mutation, optimistic: optimisticUpdate(mutation, containerRow(current)) })
    }
    return muts
  }

  /** applyPairingWrites persists a domain-computed set of paired_container_id writes. */
  function applyPairingWrites(tripId: string, writes: PairingWrite[]) {
    const muts = pairingMuts(tripStore.getContainers(tripId), writes)
    if (muts.length > 0) enqueueAndDrain('trip', tripId, ...muts)
  }

  /**
   * pairContainer pairs two containers exclusively, writing both sides at
   * once and releasing any previous partner of either (FR-10.3, M11).
   */
  function pairContainer(tripId: string, aId: string, bId: string) {
    applyPairingWrites(tripId, pairWrites(tripStore.getContainers(tripId), aId, bId))
  }

  /** unpairContainer clears both sides of the container's pair (FR-10.3, M11). */
  function unpairContainer(tripId: string, containerId: string) {
    applyPairingWrites(tripId, unpairWrites(tripStore.getContainers(tripId), containerId))
  }

  /**
   * deleteContainer unassigns the container's items first —
   * trip_items.container_id is a plain FK, a dangling reference would
   * reject the delete server-side. A surviving pair partner is released
   * with it (FR-10.3): deleting one side frees the other.
   */
  function deleteContainer(tripId: string, containerId: string) {
    const containers = tripStore.getContainers(tripId)
    // One enqueueAndDrain for release + unassign + delete, so the batch
    // stays atomic in the queue.
    const muts = pairingMuts(containers, releasePartnersOnDelete(containers, containerId))
    for (const item of tripStore.getItems(tripId)) {
      if (item.container_id !== containerId) continue
      const mut = mutations.assignContainer(item.id, null)
      muts.push({
        mutation: mut,
        optimistic: optimisticUpdate(mut, itemRow(item)),
      })
    }
    const deleteMut = mutations.deleteContainer(containerId)
    muts.push({
      mutation: deleteMut,
      optimistic: optimisticDelete(deleteMut),
    })
    enqueueAndDrain('trip', tripId, ...muts)
  }

  // --- Comment actions (FR-7.1/7.2) ---

  function addComment(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
  ): string {
    const { mutation, id } = mutations.addComment(tripId, tripItemId, authorId, body)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  /** Promote a plain comment into an open ticket (FR-7.2). */
  function flagCommentAsTask(tripId: string, comment: ItemComment) {
    const mut = mutations.flagCommentAsTask(comment.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, commentRow(comment)),
    })
  }

  function deleteComment(tripId: string, commentId: string) {
    const mutation = mutations.deleteComment(commentId)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  // --- Lifecycle ---

  async function connect(): Promise<void> {
    if (local) {
      // FR-19.2: startup load goes through the same applyChanges path
      // as a server pull; NFR-4.11: ask for storage durability.
      onPullChanges(await local.load())
      localHydrated = true
      void local.requestDurability()
      return
    }
    // B2: whatever an earlier session could not send is replayed *before*
    // the first pull, so a server change never overwrites a local one that
    // simply had not left the device yet. Awaited rather than fired off:
    // App.vue's own drainMaster follows this call, and two overlapping
    // drains of the same partition would push the same chunk twice.
    const restored = await outbox.restore()
    syncStatus.setPendingCount(outbox.totalPending())
    syncStatus.setParkedCount(outbox.parkedCount())
    for (const partition of restored) {
      await (partition.type === 'master' ? drainMaster() : drainTrip(partition.id!))
    }
    ws.connect()
    // FR-6.2: notifications that arrived while this device was away.
    void surfaceUnreadNotifications()
  }

  function subscribeTrip(tripId: string) {
    if (local) return
    ws.subscribe([`trip:${tripId}`])
  }

  function disconnect() {
    if (local) return
    ws.disconnect()
  }

  return {
    syncStatus,
    outbox,
    getPresence,
    fetchConflicts,
    fetchMasterConflicts,
    revertConflict,
    isLockedByOther,
    holdsClaim,
    releaseClaim,
    takeOverClaim,
    fetchLockEvents,
    lockHolder,

    // Drain
    drainTrip,
    drainMaster,
    drainAll,

    // Actions
    createTripFromWizard,
    // The FR-27.4 clock, exposed so a view asking "which trips does this
    // reach?" answers with the same date the refresh itself uses — two
    // clocks would let the warning and the behaviour disagree by a day.
    today,
    proposeTripRefresh,
    acceptTripRefresh,
    declineTripRefresh,
    proposeRefreshForLoadedTrips,
    refreshProposals,
    cloneTrip,
    commitImport,
    commitPortableImport,
    commitPortableRestore,
    packIncrement,
    packDecrement,
    packComplete,
    packZero,
    packToggle,
    restorePack,
    restoreSkip,
    skipItem,
    unskipItem,
    setMode,
    packingNow,
    assignTraveler,
    assignContainer,
    setLatePacker,
    setReviewFlag,
    setPacker,
    quickAddItem,
    addGroupToTrip,
    updateTrip,
    renameTraveler,
    addTravelerToTrip,
    removeTraveler,
    packedRowsOf,

    // Master data
    createMasterItem,
    createTag,
    assignTag,
    unassignTag,
    updateMasterItem,
    deleteMasterItem,
    setItemImage,
    deleteItemImage,
    itemImageUrl,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    addTemplateInclude,
    removeTemplateInclude,
    addTemplateItemTask,
    deleteTemplateItemTask,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
    addItemDependency,
    updateItemDependency,
    deleteItemDependency,

    // Todos
    addPrepTodo,
    resolvePrepTodo,
    reopenPrepTodo,

    // Comments (FR-7.1/7.2)
    addComment,
    flagCommentAsTask,
    deleteComment,

    // Containers (FR-10.1, M11)
    addContainer,
    updateContainer,
    pairContainer,
    unpairContainer,
    deleteContainer,

    // Trip membership (FR-4.5/4.7)
    addTripMember,
    setTripMemberRole,
    removeTripMember,
    fetchUsers,

    // Series & destinations (FR-13.1/13.2, M16)
    createSeries,
    updateSeries,
    setTripSeries,
    ensureDestinationProfile,
    updateDestinationProfile,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,

    // Profile & data (M17)
    fetchMe,
    saveDisplayName,
    uploadAvatar,
    downloadExport,

    // Instance user management (Addendum 3.23, M20)
    fetchAdminUsers,
    deactivateUser,
    reactivateUser,
    adminResetAvatar,
    adminResetDisplayName,

    // Notifications (FR-6.2 / NFR-4.6)
    markNotificationRead,
    fetchNotificationPrefs,
    saveNotificationPrefs,
    pushApi,

    // Post-trip review (FR-9.2, M14)
    activateTrip,
    archiveTrip,
    deleteTrip,
    applyReviewProposal,
    createTemplateFromTrip,

    // Lifecycle
    connect,
    subscribeTrip,
    disconnect,
  }
}

// --- Helpers ---

function generateDeviceId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// The base an optimistic row is rebuilt on — see `masterItemRow`. No
// `duration_days`: the store derives it from the dates rather than keeping it.
function tripRow(trip: Trip): Record<string, unknown> {
  return {
    name: trip.name,
    year: trip.year,
    status: trip.status,
    start_date: trip.start_date,
    end_date: trip.end_date,
    series_id: trip.series_id,
    attributes: trip.attributes ? JSON.stringify(trip.attributes) : null,
    imported: trip.imported ? 1 : 0,
  }
}

/** The base an optimistic row is rebuilt on — see `masterItemRow`. */
function travelerRow(traveler: Traveler): Record<string, unknown> {
  return {
    trip_id: traveler.trip_id,
    name: traveler.name,
    linked_user_id: traveler.linked_user_id,
  }
}

function seriesRow(series: TripSeries): Record<string, unknown> {
  return {
    owner_id: series.owner_id,
    name: series.name,
    default_attributes: series.default_attributes
      ? JSON.stringify(series.default_attributes)
      : null,
  }
}

function memberRow(member: TripMember): Record<string, unknown> {
  return {
    trip_id: member.trip_id,
    user_id: member.user_id,
    role: member.role,
  }
}

/**
 * A comment and a todo are the same row (FR-7.2), told apart by `is_task`
 * — which is why both mappers carry it: the store routes on that column,
 * so an optimistic row without it moves the row to the other list.
 */
function commentRow(comment: ItemComment): Record<string, unknown> {
  return {
    trip_id: comment.trip_id,
    trip_item_id: comment.trip_item_id,
    author_id: comment.author_id,
    body: comment.body,
    created_at: comment.created_at,
    is_task: 0,
  }
}

function todoRow(todo: ItemTodo): Record<string, unknown> {
  return {
    trip_id: todo.trip_id,
    trip_item_id: todo.trip_item_id,
    author_id: todo.author_id,
    body: todo.body,
    is_task: 1,
    task_state: todo.task_state,
  }
}

function profileRow(profile: DestinationProfile): Record<string, unknown> {
  return {
    series_id: profile.series_id,
    notes: profile.notes,
  }
}

function checklistItemRow(item: DestinationChecklistItem): Record<string, unknown> {
  return {
    profile_id: item.profile_id,
    label: item.label,
    mode: item.mode,
  }
}

function containerRow(container: Container): Record<string, unknown> {
  return {
    trip_id: container.trip_id,
    name: container.name,
    carrier_traveler_id: container.carrier_traveler_id,
    max_weight_grams: container.max_weight_grams,
    paired_container_id: container.paired_container_id,
  }
}

/** hashBlob mirrors the server's image_hash: the hex of the first 8 bytes
 * of the SHA-256 digest. Used in Local Mode, where there is no server to
 * stamp the change signal (FR-22 sync hint). */
async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// The base an optimistic row is rebuilt on, so every column the store keeps
// must appear here: a field left out is blanked until the next pull puts it
// back. That is how editing a weight used to drop the reference photo.
function masterItemRow(item: MasterItem): Record<string, unknown> {
  return {
    name: item.name,
    weight_grams: item.weight_grams,
    value_cents: item.value_cents,
    image_hash: item.image_hash ?? null,
    icon: item.icon ?? null,
  }
}

function templateRow(template: Template): Record<string, unknown> {
  return {
    owner_id: template.owner_id,
    name: template.name,
    kind: template.kind,
    icon: template.icon ?? null,
  }
}

function templateItemRow(ti: TemplateItem): Record<string, unknown> {
  return {
    template_id: ti.template_id,
    item_id: ti.item_id,
    quantity: ti.quantity,
    assignment: ti.assignment,
    dedup: ti.dedup,
    conditions: ti.conditions ? JSON.stringify(ti.conditions) : null,
    default_mode: ti.default_mode,
    late_packer: ti.late_packer ? 1 : 0,
  }
}

function dependencyRow(d: ItemDependency): Record<string, unknown> {
  return {
    item_id: d.item_id,
    depends_on_item_id: d.depends_on_item_id,
    mode: d.mode,
    quantity: d.quantity,
  }
}

/**
 * The row an optimistic update carries, and it must be *complete*: both
 * the store and IndexedDB put the whole row rather than patching it, so a
 * column missing here is a column erased from the device — permanently in
 * Local Mode, where no pull ever restores it. `source_template_id` was
 * exactly that: one M5 edit detached a generated row from the group it
 * came from, and FR-27.4, FR-27.5 and M14 all read that provenance.
 */
function itemRow(item: TripItem): Record<string, unknown> {
  return {
    trip_id: item.trip_id,
    name: item.name,
    source_item_id: item.source_item_id,
    source_template_id: item.source_template_id,
    weight_grams: item.weight_grams,
    value_cents: item.value_cents,
    category_name: item.category_name,
    quantity: item.quantity,
    packed_count: item.packed_count,
    state: item.state,
    mode: item.mode,
    late_packer: item.late_packer ? 1 : 0,
    assigned_traveler_id: item.assigned_traveler_id,
    packer_user_id: item.packer_user_id,
    packed_by_user_id: item.packed_by_user_id,
    packed_at: item.packed_at,
    container_id: item.container_id,
    packing_now_by: item.packing_now_by,
    packing_now_at: item.packing_now_at,
    flag_unused: item.flag_unused ? 1 : 0,
    flag_missing: item.flag_missing ? 1 : 0,
    updated_hlc: item.updated_hlc,
  }
}
