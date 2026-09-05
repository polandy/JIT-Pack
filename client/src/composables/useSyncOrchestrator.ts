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
import { markLocalWrite } from '@/local/exportReminder'
import { clearMigrationPending, deviceId } from '@/mode'
import { TABLE } from '@/types/tables'
import { computed, reactive, ref } from 'vue'

import { APIClient, type TokenProvider } from '@/api/client'
import { loadTokens, subjectOf } from '@/auth/tokens'
import { HLCGenerator } from '@/sync/hlc'
import { SyncOutbox, type ConflictReport, type RejectionReport } from './useSyncOutbox'
import {
  changesOf,
  localChange,
  optimisticDelete,
  optimisticInsert,
  optimisticUpdate,
} from '@/sync/optimistic'
import { MASTER_STORE_TABLES, TRIP_STORE_TABLES } from '@/sync/routing'
import { hashBlob, itemRow, masterItemRow, memberRow } from './sync/rows'
import { createContainerActions } from './sync/actions/containers'
import { createCommentActions } from './sync/actions/comments'
import { createDependencyActions } from './sync/actions/dependencies'
import { createSeriesActions } from './sync/actions/series'
import { createMasterDataActions } from './sync/actions/masterData'
import { createPackingActions } from './sync/actions/packing'
import { createGroupRefreshActions } from './sync/actions/groupRefresh'
import { createTripLifecycleActions } from './sync/actions/tripLifecycle'
import { createPostTripActions } from './sync/actions/postTrip'
import { createTripCreationActions } from './sync/actions/tripCreation'
// The screens read this module rather than the group, so the type keeps its
// public home even though FR-24.3's rules moved.
export type { DeletionOutlook } from './sync/actions/masterData'
export type { CloneDraft, TripWizardDraft } from './sync/actions/tripCreation'
import { createNameGuards } from './sync/names'
import type { QueuedMutation, SyncContext } from './sync/context'
import { useWebSocket } from './useWebSocket'
import { CLIENT_ACTOR_PLACEHOLDER, useMutations } from './useMutations'
import { useSyncStatus } from './useSyncStatus'
import { useIdentityStore } from '@/stores/identityStore'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import type {
  AdminUserListResponse,
  APITokenExpiry,
  APITokenResponse,
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
import { localIsoDate } from '@/domain/trips'
import { defaultNowMs, isoFrom, type NowMs } from '@/lib/clock'
import { optimizeItemImage } from '@/lib/imageResize'
import type { PortableDocument } from '@/domain/portable'
import { importPortableBackup, importPortableDocument } from '@/domain/portableImport'
import type { PortableImportEnv, PortableImportResult } from '@/domain/portableImport'
import type { NotificationPrefs, ServerNotification } from '@/notifications/format'
import type { PushServerAPI } from '@/notifications/push'
import type { AdminUserRow } from '@/domain/admin'
import type { IndexedDBPersistence } from '@/local/persistence'
import { IndexedDBOutboxStore, type OutboxStore } from '@/sync/outboxStore'
import type { MasterItem, TripItem, TripMember } from '@/types/domain'

/** One entry of a trip's presence facepile (G-10, Sync-API §7). */
// Both shapes come from the contract now (NFR-4.14). The names are kept as
// aliases because the screens read this module, not the wire: what changed is
// that neither can drift from what the server sends — the conflict entry had
// already lost `mutation_id` and `actor_user_id` that way.
export type PresenceUser = PresenceMember
export type { ConflictEntry, LockEvent }

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
   * The device's clock, in milliseconds. One value feeds all three things
   * that ask what time it is — the HLC generator, `today`, and the ISO
   * stamps the mutations write — so they cannot answer differently.
   */
  now?: NowMs
  /**
   * The clock behind FR-27.4's "is this trip past?" question. Injected so a
   * test can stand on either side of a trip's end date without moving the
   * machine's clock; defaults to the local date, not UTC, because the day a
   * trip ends is the day the traveller is living in.
   *
   * Derived from `now` when only that is given; supply it directly to move
   * the calendar day without moving the instant.
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
   * Called when a push came back with refused mutations (Sync-API §5,
   * ADR-031). The change is undone either way — by the row the server
   * re-logged or by the client dropping it — and this is what lets the user
   * be told rather than watch a row change back by itself.
   */
  onRejections?: (report: RejectionReport) => void
  /**
   * Where the outbox keeps its queue between sessions (B2, NFR-4.1).
   * Injected so a test can drive a store it can see; Server Mode defaults
   * to IndexedDB, and Local Mode never builds one — it has no outbox.
   */
  outboxStore?: OutboxStore
  /**
   * Called once per Local Mode write that lands after hydration (FR-19.8's
   * last-write stamp). Injected so a test can count the calls.
   */
  onLocalWrite?: () => void
  /**
   * The `deviceId` half of every HLC stamp. Defaults to this device's stored
   * identity; injected so a test can name the device it is standing on
   * instead of reaching into storage.
   */
  deviceId?: string
}

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
  const now = config.now ?? defaultNowMs
  const nowIso = isoFrom(now)
  const today = config.today ?? (() => localIsoDate(now()))
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

  const hlc = new HLCGenerator(now, config.deviceId ?? deviceId())
  const mutations = useMutations(hlc, nowIso)

  // Local Mode never pushes, so it never queues — building a store there
  // would create a database that nothing ever writes to.
  const outboxStore = local ? null : (config.outboxStore ?? new IndexedDBOutboxStore())
  const onLocalWrite = config.onLocalWrite ?? markLocalWrite

  const outbox = new SyncOutbox(client, hlc, onPullChanges, {
    store: outboxStore ?? undefined,
    onParked: (entry) => syncStatus.setParked(outbox.parkedCount(), entry.reason),
    onCaptureChanged: (uncaptured) => (outboxUncaptured.value = uncaptured),
    onConflicts: (report) => {
      syncStatus.addConflicts(report.count)
      config.onConflicts?.(report)
    },
    onRejections: (report) => config.onRejections?.(report),
    onDurabilityChanged: (durable) => syncStatus.setQueueDurable(durable),
  })

  /** Trips this device has asked the hub about — the set every new socket is told. */
  const subscribedTrips = new Set<string>()

  const ws = useWebSocket({
    baseUrl: config.baseUrl,
    getToken: config.getToken,
    onEvent: onWSEvent,
    onLive: (live) => syncStatus.setLive(live),
    onOpen: ({ reconnect }) => {
      // The first open is covered by the boot pull App.vue runs; every later
      // one follows a gap the hub cannot replay (P-1), so the gap is pulled.
      if (reconnect) void catchUp()
    },
  })

  /**
   * Pull everything this device is watching. The socket only ever says
   * *that* something changed; after a gap nobody said anything, so the
   * master partition and every subscribed trip are asked directly.
   * Background: this is the app catching up, not the user doing something,
   * and eight trips flickering the glyph through *syncing* would be noise.
   */
  async function catchUp(): Promise<void> {
    if (local) return
    await drainMaster()
    for (const tripId of subscribedTrips) {
      await drainTrip(tripId, { background: true })
    }
  }

  /**
   * Which trips' rows are actually on this device (FR-27.4). Server Mode
   * pulls a trip's partition only when the trip is opened, and Local Mode
   * hydrates from IndexedDB asynchronously — refreshing a trip before its
   * rows are here would read an empty trip and re-add every position it
   * already has. The refresh needs a *settled* signal, not a hopeful one.
   */
  /*
   * Reactive, both of them: since ADR-033 a *screen* reads them — M2's ring
   * asks whether a trip's rows are here — and a plain Set is a value Vue
   * cannot see change. The row loaded correctly and went on saying it was
   * still loading.
   */
  const loadedTripPartitions = reactive(new Set<string>())
  const localHydrated = ref(false)
  const masterPulled = ref(false)

  /** Whether another save has been queued behind the one just finished. */
  let localWrites = 0
  function localWritesPending(): boolean {
    return localWrites > 0
  }

  // FR-25.15: "captured on this device" — the signal the sheets' save
  // indicator renders. It is deliberately not `syncStatus.state`, whose
  // job is the server: that state answers `offline` before `syncing`, so
  // reading it made an open write offline look settled, which is the one
  // case the requirement exists for. Two writers, one per mode: the
  // Local Mode save below, and the outbox's own append.
  const localUncaptured = ref(0)
  const outboxUncaptured = ref(0)
  const capturePending = computed(() => localUncaptured.value > 0 || outboxUncaptured.value > 0)

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
      // FR-19.8: the startup load passes through here too, and re-saving what
      // was already on the device is not a change the backup could miss.
      if (localHydrated.value) onLocalWrite()
      localWrites += 1
      localUncaptured.value += 1
      syncStatus.setSyncing()
      local
        .save(changes)
        .finally(() => {
          localWrites -= 1
          localUncaptured.value -= 1
        })
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

  /**
   * `background` is a drain nobody asked for — since ADR-033 a list loads the
   * rows it is showing. It leaves the G-2 glyph alone: that glyph answers for
   * what the *user* did, and a row that fails (a trip they were removed from
   * answers 403 while the network is fine) would otherwise announce an outage
   * nobody caused, and eight rows appearing at once would flicker it through
   * *syncing* on every visit to the list.
   */
  async function drainTrip(
    tripId: string,
    { background = false }: { background?: boolean } = {},
  ): Promise<void> {
    if (local) return
    if (!background) syncStatus.setSyncing()
    try {
      await outbox.drain('trip', tripId)
      loadedTripPartitions.add(tripId)
      if (!background) {
        syncStatus.setPendingCount(outbox.totalPending())
        syncStatus.setSynced()
      }
      // Report the new cursor so the server recomputes in_sync (§7).
      ws.sendCursor(tripId, outbox.getCursor('trip', tripId))
    } catch {
      if (!background) syncStatus.setOffline()
    }
  }

  async function drainMaster(): Promise<void> {
    if (local) return
    syncStatus.setSyncing()
    try {
      await outbox.drain('master', null)
      masterPulled.value = true
      syncStatus.setPendingCount(outbox.totalPending())
      syncStatus.setSynced()
      // FR-27.4: a group edited on another device arrives with this pull, and
      // the trips that follow it work out what it would mean for them here —
      // the device does not have to be on any particular screen. Local Mode
      // returns above, and App.vue sweeps once after its hydration instead.
      groupRefreshActions.proposeRefreshForLoadedTrips()
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

  /**
   * enqueue is the write funnel: it paints what the mutations will do and
   * queues them for their partition, and it is the *whole* of a write apart
   * from pushing it. A cascade that writes across both partitions calls it
   * once per row and drains once at the end (`drainPartitions`); everything
   * else writes one row and pushes it immediately (`enqueueAndDrain`).
   * Neither is allowed to spell the pair out again — the paint step carries
   * ADR-016's trap (a change that reaches no store shows nothing) and the
   * queue step carries the partition, and a second copy of them drifts.
   */
  function enqueue(type: 'trip' | 'master', id: string | null, ...muts: QueuedMutation[]) {
    for (const m of muts) {
      const painted = changesOf(m.optimistic)
      if (painted.length > 0) {
        onPullChanges(painted)
      }
      if (!local) {
        outbox.enqueue(type, id, m.mutation)
      }
    }
    if (local) return
    syncStatus.setPendingCount(outbox.totalPending())
  }

  /**
   * drainPartitions pushes what a cascade queued: the master partition
   * first, then one trip at a time. The order is the server's foreign keys —
   * a trip's rows are refused until the trips row and the creator's
   * membership exist in the master partition.
   *
   * Fire-and-forget, like the drain in `enqueueAndDrain`: the write is
   * already on the device and in the queue, and a failed push is the
   * outbox's business, not the caller's.
   */
  function drainPartitions(tripIds: string[]): void {
    if (local) return
    syncStatus.setPendingCount(outbox.totalPending())
    drainMaster()
      .then(async () => {
        for (const id of tripIds) await drainTrip(id)
      })
      .catch(() => {})
  }

  function enqueueAndDrain(type: 'trip' | 'master', id: string | null, ...muts: QueuedMutation[]) {
    enqueue(type, id, ...muts)
    if (local) return

    // Fire-and-forget drain
    const drainFn = type === 'master' ? drainMaster() : drainTrip(id!)
    drainFn.catch(() => {})
  }

  /** The spine the extracted action groups are bound to (R-4). */
  const names = createNameGuards(masterStore)
  const ctx: SyncContext = {
    tripStore,
    masterStore,
    mutations,
    enqueueAndDrain,
    names,
    local,
    today,
    nowIso,
    tripDataLoaded,
    enqueue,
    drainPartitions,
  }
  const containerActions = createContainerActions(ctx)
  const commentActions = createCommentActions(ctx)
  const dependencyActions = createDependencyActions(ctx)
  const seriesActions = createSeriesActions(ctx)
  const masterDataActions = createMasterDataActions(ctx)
  const packingActions = createPackingActions(ctx)
  const groupRefreshActions = createGroupRefreshActions(ctx, { comments: commentActions })
  const postTripActions = createPostTripActions(ctx, { masterData: masterDataActions })
  const tripCreationActions = createTripCreationActions(ctx)
  const tripLifecycleActions = createTripLifecycleActions(ctx, {
    comments: commentActions,
    packing: packingActions,
    groupRefresh: groupRefreshActions,
  })

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

  /**
   * tripDataLoaded answers whether this trip's rows are on the device. It is
   * the guard that keeps the refresh from mistaking "not pulled yet" for
   * "empty trip" — the one way this feature could duplicate the whole list
   * it exists to keep right.
   */
  function tripDataLoaded(tripId: string): boolean {
    return local ? localHydrated.value : loadedTripPartitions.has(tripId)
  }

  /**
   * masterDataLoaded answers the same question for the master partition: are
   * the trips, groups and inventory this device is entitled to actually here?
   *
   * FR-2.8 is the first caller and the reason it exists: M2 picks its opening
   * segment from what the trip list holds, and a list that has not arrived yet
   * is not an empty one — deciding on it would send every cold start to the
   * archive. Same doctrine as the ring above (ADR-033), one partition up.
   */
  function masterDataLoaded(): boolean {
    return local ? localHydrated.value : masterPulled.value
  }

  /** One in-flight `ensureTripData` per trip, so callers share a request. */
  const tripDataRequests = new Map<string, Promise<void>>()

  /**
   * ensureTripData fetches a trip's own rows for a caller that needs them
   * without opening the trip — M2's progress ring is the first (ADR-033).
   *
   * Callers are deduplicated because the caller is a *list*: eight rows
   * scrolling into view together is the ordinary case, and eight identical
   * requests would be the cost this was supposed to avoid. A failed attempt
   * drops out of the map rather than being remembered, or one lost packet
   * would leave the row blank until the app restarts.
   */
  function ensureTripData(tripId: string): Promise<void> {
    if (tripDataLoaded(tripId)) return Promise.resolve()
    const existing = tripDataRequests.get(tripId)
    if (existing) return existing
    const request = drainTrip(tripId, { background: true }).finally(() =>
      tripDataRequests.delete(tripId),
    )
    tripDataRequests.set(tripId, request)
    return request
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
        enqueue(partition, tripId, { mutation, optimistic: optimisticInsert(mutation) })
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
    drainPartitions(result.kind === 'trip' ? [result.id] : [])
    return result
  }

  /** Restore a whole backup file (NFR-4.11), then push what it produced. */
  function commitPortableRestore(docs: PortableDocument[]): PortableImportResult[] {
    const imported = importPortableBackup(docs, portableImportEnv())
    // FR-19.8: a restore onto a server is the third step of the move; in
    // Local Mode there is no move to finish.
    if (!local) clearMigrationPending()
    // Every trip the file brought, not none of them: a restore is the whole
    // device, and its rows live in one partition per trip (FR-19.5).
    drainPartitions(imported.filter((r) => r.kind === 'trip').map((r) => r.id))
    return imported
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
    await refreshIdentity()
  }

  async function reactivateUser(userID: string): Promise<void> {
    await client.post(API.adminReactivateUser(userID), {})
    await refreshIdentity()
  }

  async function adminResetAvatar(userID: string): Promise<void> {
    await client.delete(API.adminResetAvatar(userID))
  }

  async function adminResetDisplayName(userID: string): Promise<void> {
    await client.delete(API.adminResetDisplayName(userID))
    await refreshIdentity()
  }

  /**
   * Mint an API token (FR-23.7). The response is the only time the token is
   * ever readable, so it is handed straight to the caller and kept nowhere:
   * this must not reach localStorage or any store.
   */
  async function createAPIToken(
    name: string,
    expiry: APITokenExpiry,
  ): Promise<APITokenResponse | null> {
    if (local) return null
    return client.post<APITokenResponse>(API.meTokens, { name, expiry })
  }

  async function saveDisplayName(userId: string, name: string): Promise<void> {
    if (local) return
    await client.put(API.userDisplayName(userId), { display_name: name })
    await refreshIdentity()
  }

  /**
   * The four writers above are the only things that change who the instance
   * knows about, so they are where the session-wide answer is fetched again
   * (ADR-047) — never the screen that happened to trigger them. A rename made
   * on M17 has to reach the name M4 puts on a packed row, and only one of
   * those two screens is mounted at the time.
   *
   * The avatar writers are deliberately not among them: the bytes are fetched
   * by URL with a cache-busting version, and the directory carries no image.
   */
  function refreshIdentity(): Promise<void> {
    if (local) return Promise.resolve()
    return useIdentityStore().refresh({ fetchUsers, fetchMe })
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

  // --- Lifecycle ---

  async function connect(): Promise<void> {
    if (local) {
      // FR-19.2: startup load goes through the same applyChanges path
      // as a server pull; NFR-4.11: ask for storage durability.
      onPullChanges(await local.load())
      localHydrated.value = true
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
    syncStatus.setParked(outbox.parkedCount(), outbox.lastParkedReason())
    for (const partition of restored) {
      await (partition.type === 'master' ? drainMaster() : drainTrip(partition.id!))
    }
    ws.connect()
    // FR-6.2: notifications that arrived while this device was away.
    void surfaceUnreadNotifications()
  }

  function subscribeTrip(tripId: string) {
    if (local) return
    subscribedTrips.add(tripId)
    ws.subscribe([`trip:${tripId}`])
  }

  /**
   * The app is back in view or back online. Makes sure a socket exists — a
   * frozen tab's backoff never fired, and its socket may be dead without a
   * close — and pulls what was missed meanwhile, without waiting for the
   * socket, since the pull is the recovery and the socket only the notice.
   */
  function resume() {
    if (local) return
    ws.ensureConnected()
    void catchUp()
  }

  function disconnect() {
    if (local) return
    ws.disconnect()
  }

  return {
    syncStatus,
    capturePending,
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
    tripDataLoaded,
    masterDataLoaded,
    ensureTripData,
    drainMaster,
    drainAll,

    // Actions
    createTripFromWizard: tripCreationActions.createTripFromWizard,
    // The FR-27.4 clock, exposed so a view asking "which trips does this
    // reach?" answers with the same date the refresh itself uses — two
    // clocks would let the warning and the behaviour disagree by a day.
    today,
    proposeTripRefresh: groupRefreshActions.proposeTripRefresh,
    acceptTripRefresh: groupRefreshActions.acceptTripRefresh,
    declineTripRefresh: groupRefreshActions.declineTripRefresh,
    proposeRefreshForLoadedTrips: groupRefreshActions.proposeRefreshForLoadedTrips,
    refreshProposals: groupRefreshActions.refreshProposals,
    cloneTrip: tripCreationActions.cloneTrip,
    commitImport: tripCreationActions.commitImport,
    commitPortableImport,
    commitPortableRestore,
    packingNow,
    addGroupToTrip: tripLifecycleActions.addGroupToTrip,
    updateTrip: tripLifecycleActions.updateTrip,
    renameTraveler: tripLifecycleActions.renameTraveler,
    addTravelerToTrip: tripLifecycleActions.addTravelerToTrip,
    removeTraveler: tripLifecycleActions.removeTraveler,
    packedRowsOf: tripLifecycleActions.packedRowsOf,

    // Master data
    setItemImage,
    deleteItemImage,
    itemImageUrl,
    templateNameCollision: names.templateNameCollision,
    seriesNameCollision: names.seriesNameCollision,
    ...dependencyActions,

    // Comments and todos (FR-7.1/7.2/7.3)
    ...commentActions,

    // Containers (FR-10.1, M11)
    ...containerActions,

    // Trip membership (FR-4.5/4.7)
    addTripMember,
    setTripMemberRole,
    removeTripMember,
    fetchUsers,

    // Series & destinations (FR-13.1/13.2, M16)
    ...seriesActions,
    ...masterDataActions,
    ...packingActions,

    // Profile & data (M17)
    fetchMe,
    createAPIToken,
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
    activateTrip: tripLifecycleActions.activateTrip,
    archiveTrip: tripLifecycleActions.archiveTrip,
    deleteTrip: tripLifecycleActions.deleteTrip,
    applyReviewProposal: postTripActions.applyReviewProposal,
    createTemplateFromTrip: postTripActions.createTemplateFromTrip,

    // Lifecycle
    connect,
    subscribeTrip,
    resume,
    disconnect,
  }
}
