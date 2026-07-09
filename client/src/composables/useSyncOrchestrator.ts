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

import { APIClient } from '@/api/client'
import { HLCGenerator } from '@/sync/hlc'
import { SyncOutbox } from './useSyncOutbox'
import { useWebSocket } from './useWebSocket'
import { useMutations } from './useMutations'
import { useSyncStatus, type SyncStatus } from './useSyncStatus'
import { useTripStore } from '@/stores/tripStore'
import { useMasterStore } from '@/stores/masterStore'
import type { PullChange, WSEvent } from '@/api/types'
import { durationDays, type GeneratedItem } from '@/domain/instantiate'
import type { IndexedDBPersistence } from '@/local/persistence'
import type { ItemMode, ItemTodo, MasterItem, Template, TemplateItem, TripItem } from '@/types/domain'

/** Everything the M3 wizard collected before "Create trip". */
export interface TripWizardDraft {
  name: string
  startDate: string | null
  endDate: string
  attributes: Record<string, unknown> | null
  travelers: { name: string; profile: 'adult' | 'child'; linkedUserId?: string | null }[]
  items: GeneratedItem[]
}

export interface SyncOrchestratorConfig {
  baseUrl: string
  getToken: () => string | null
  /**
   * Local Mode (Addendum 3.19, FR-19.2): when set, mutations persist to
   * this store instead of the sync outbox, and no network or WebSocket
   * is ever touched. The optimistic rows are authoritative.
   */
  local?: IndexedDBPersistence
}

export function useSyncOrchestrator(config: SyncOrchestratorConfig) {
  const tripStore = useTripStore()
  const masterStore = useMasterStore()
  const syncStatus = useSyncStatus()
  const local = config.local ?? null
  if (local) syncStatus.setLocal()

  const client = new APIClient(config.baseUrl, config.getToken)

  const deviceId = localStorage.getItem('jitpack_device_id') ?? generateDeviceId()
  localStorage.setItem('jitpack_device_id', deviceId)

  const hlc = new HLCGenerator(() => Date.now(), deviceId)
  const mutations = useMutations(hlc)

  const outbox = new SyncOutbox(client, hlc, onPullChanges)

  const ws = useWebSocket({
    baseUrl: config.baseUrl,
    getToken: config.getToken,
    onEvent: onWSEvent,
  })

  // --- Pull change routing ---

  function onPullChanges(changes: PullChange[]) {
    const tripTables = new Set(['trips', 'trip_items', 'travelers', 'containers', 'comments', 'notifications'])
    const masterTables = new Set(['categories', 'items', 'templates', 'template_items'])

    const tripChanges: PullChange[] = []
    const masterChanges: PullChange[] = []

    for (const c of changes) {
      if (tripTables.has(c.table)) {
        tripChanges.push(c)
      } else if (masterTables.has(c.table)) {
        masterChanges.push(c)
      }
    }

    if (tripChanges.length > 0) tripStore.applyChanges(tripChanges)
    if (masterChanges.length > 0) masterStore.applyChanges(masterChanges)

    // FR-19.2: in Local Mode every applied change is durable — this is
    // the single funnel all mutations and startup loads pass through.
    if (local) local.save(changes).catch(() => {})
  }

  // --- WebSocket event handling ---

  function onWSEvent(event: WSEvent) {
    switch (event.type) {
      case 'trip.changed': {
        const tripId = event.payload['trip_id'] as string | undefined
        if (tripId) {
          drainTrip(tripId)
        }
        break
      }
      case 'master.changed':
        drainMaster()
        break
      case 'presence':
        // Future: update presence store
        break
    }
  }

  // --- Drain operations ---

  async function drainTrip(tripId: string): Promise<void> {
    if (local) return
    syncStatus.setSyncing()
    try {
      await outbox.drain('trip', tripId)
      syncStatus.setPendingCount(outbox.totalPending())
      syncStatus.setSynced()
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
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function packDecrement(tripId: string, item: TripItem) {
    const mut = mutations.decrementPacked(item.id, item.packed_count)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function packComplete(tripId: string, item: TripItem) {
    const mut = mutations.completePacked(item.id, item.quantity)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function packZero(tripId: string, item: TripItem) {
    const mut = mutations.zeroPacked(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function packToggle(tripId: string, item: TripItem) {
    const mut = mutations.togglePacked(item.id, item.packed_count)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function skipItem(tripId: string, item: TripItem) {
    const mut = mutations.skipItem(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function unskipItem(tripId: string, item: TripItem) {
    const mut = mutations.unskipItem(item.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function setMode(tripId: string, item: TripItem, mode: ItemMode) {
    const mut = mutations.setItemMode(item.id, mode)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function assignTraveler(tripId: string, item: TripItem, travelerId: string | null) {
    const mut = mutations.assignTraveler(item.id, travelerId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function assignContainer(tripId: string, item: TripItem, containerId: string | null) {
    const mut = mutations.assignContainer(item.id, containerId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function setLatePacker(tripId: string, item: TripItem, latePacker: boolean) {
    const mut = mutations.setLatePacker(item.id, latePacker)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'trip_items', id: item.id, deleted: false,
        row: { ...itemRow(item), ...mut.fields },
      },
    })
  }

  function quickAddItem(
    tripId: string,
    name: string,
    opts: { sourceItemId?: string | null; weightGrams?: number | null; valueCents?: number | null; categoryName?: string | null; mode?: ItemMode },
    isActive: boolean,
  ) {
    const { mutation, id } = mutations.addTripItem(tripId, name, {
      ...opts,
      flagMissing: isActive,
    })
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: {
        seq: 0, table: 'trip_items', id, deleted: false,
        row: mutation.fields as Record<string, unknown>,
      },
    })
  }

  /**
   * createTripFromWizard commits an M3 draft: the trips row goes to the
   * master partition, travelers and generated items to the new trip's
   * partition. The master partition drains first — the server creates
   * the trip row and the creator's owner membership there, without
   * which the trip-partition push would be rejected (403/FK).
   */
  function createTripFromWizard(draft: TripWizardDraft): string {
    const { mutation: tripMut, id: tripId } = mutations.createTrip(
      draft.name, draft.startDate, draft.endDate, { attributes: draft.attributes },
    )
    onPullChanges([{
      seq: 0, table: 'trips', id: tripId, deleted: false,
      row: {
        ...tripMut.fields,
        duration_days: durationDays(draft.startDate, draft.endDate),
      },
    }])
    if (!local) outbox.enqueue('master', null, tripMut)

    const travelerIds = draft.travelers.map((tr) => {
      const { mutation, id } = mutations.addTraveler(tripId, tr.name, tr.profile, tr.linkedUserId ?? null)
      onPullChanges([{ seq: 0, table: 'travelers', id, deleted: false, row: mutation.fields as Record<string, unknown> }])
      if (!local) outbox.enqueue('trip', tripId, mutation)
      return id
    })

    for (const item of draft.items) {
      const assignedTravelerId =
        item.traveler_index === null ? null : travelerIds[item.traveler_index] ?? null
      const { mutation, id } = mutations.addGeneratedTripItem(tripId, item, assignedTravelerId)
      onPullChanges([{ seq: 0, table: 'trip_items', id, deleted: false, row: mutation.fields as Record<string, unknown> }])
      if (!local) outbox.enqueue('trip', tripId, mutation)
    }

    if (local) return tripId
    syncStatus.setPendingCount(outbox.totalPending())
    drainMaster().then(() => drainTrip(tripId)).catch(() => {})
    return tripId
  }

  // --- Master data actions (M7–M10; master partition) ---

  function createMasterItem(
    name: string,
    opts: Parameters<typeof mutations.createMasterItem>[1] = {},
  ): string {
    const { mutation, id } = mutations.createMasterItem(name, opts)
    enqueueAndDrain('master', null, {
      mutation,
      optimistic: { seq: 0, table: 'items', id, deleted: false, row: mutation.fields as Record<string, unknown> },
    })
    return id
  }

  function updateMasterItem(item: MasterItem, fields: Record<string, unknown>) {
    enqueueAndDrain('master', null, {
      mutation: mutations.updateMasterItem(item.id, fields),
      optimistic: {
        seq: 0, table: 'items', id: item.id, deleted: false,
        row: { ...masterItemRow(item), ...fields },
      },
    })
  }

  function deleteMasterItem(itemId: string) {
    enqueueAndDrain('master', null, {
      mutation: mutations.deleteMasterItem(itemId),
      optimistic: { seq: 0, table: 'items', id: itemId, deleted: true, row: null },
    })
  }

  function updateTemplate(template: Template, fields: Record<string, unknown>) {
    enqueueAndDrain('master', null, {
      mutation: mutations.updateTemplate(template.id, fields),
      optimistic: {
        seq: 0, table: 'templates', id: template.id, deleted: false,
        row: { ...templateRow(template), ...fields },
      },
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
      optimistic: { seq: 0, table: 'template_items', id, deleted: false, row: mutation.fields as Record<string, unknown> },
    })
    return id
  }

  function updateTemplateItem(templateItem: TemplateItem, fields: Record<string, unknown>) {
    enqueueAndDrain('master', null, {
      mutation: mutations.updateTemplateItem(templateItem.id, fields),
      optimistic: {
        seq: 0, table: 'template_items', id: templateItem.id, deleted: false,
        row: { ...templateItemRow(templateItem), ...fields },
      },
    })
  }

  function deleteTemplateItem(templateItemId: string) {
    enqueueAndDrain('master', null, {
      mutation: mutations.deleteTemplateItem(templateItemId),
      optimistic: { seq: 0, table: 'template_items', id: templateItemId, deleted: true, row: null },
    })
  }

  // --- Todo actions (FR-7.3) ---

  function addPrepTodo(tripId: string, tripItemId: string, authorId: string, body: string) {
    const { mutation, id } = mutations.addTodo(tripId, tripItemId, authorId, body)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: {
        seq: 0, table: 'comments', id, deleted: false,
        row: mutation.fields as Record<string, unknown>,
      },
    })
  }

  function resolvePrepTodo(tripId: string, todo: ItemTodo) {
    const mut = mutations.resolveTodo(todo.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'comments', id: todo.id, deleted: false,
        row: {
          trip_id: todo.trip_id,
          trip_item_id: todo.trip_item_id,
          author_id: todo.author_id,
          body: todo.body,
          is_task: 1,
          task_state: 'resolved',
        },
      },
    })
  }

  function reopenPrepTodo(tripId: string, todo: ItemTodo) {
    const mut = mutations.reopenTodo(todo.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: {
        seq: 0, table: 'comments', id: todo.id, deleted: false,
        row: {
          trip_id: todo.trip_id,
          trip_item_id: todo.trip_item_id,
          author_id: todo.author_id,
          body: todo.body,
          is_task: 1,
          task_state: 'open',
        },
      },
    })
  }

  // --- Lifecycle ---

  async function connect(): Promise<void> {
    if (local) {
      // FR-19.2: startup load goes through the same applyChanges path
      // as a server pull; NFR-4.11: ask for storage durability.
      onPullChanges(await local.load())
      void local.requestDurability()
      return
    }
    ws.connect()
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

    // Drain
    drainTrip,
    drainMaster,
    drainAll,

    // Actions
    createTripFromWizard,
    packIncrement,
    packDecrement,
    packComplete,
    packZero,
    packToggle,
    skipItem,
    unskipItem,
    setMode,
    assignTraveler,
    assignContainer,
    setLatePacker,
    quickAddItem,

    // Master data
    createMasterItem,
    updateMasterItem,
    deleteMasterItem,
    updateTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,

    // Todos
    addPrepTodo,
    resolvePrepTodo,
    reopenPrepTodo,

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

function masterItemRow(item: MasterItem): Record<string, unknown> {
  return {
    name: item.name,
    category_id: item.category_id,
    weight_grams: item.weight_grams,
    value_cents: item.value_cents,
    is_consumable: item.is_consumable ? 1 : 0,
    unit: item.unit,
    per_day_rate: item.per_day_rate,
  }
}

function templateRow(template: Template): Record<string, unknown> {
  return {
    owner_id: template.owner_id,
    name: template.name,
    is_published: template.is_published ? 1 : 0,
  }
}

function templateItemRow(ti: TemplateItem): Record<string, unknown> {
  return {
    template_id: ti.template_id,
    item_id: ti.item_id,
    quantity_formula: ti.quantity_formula,
    assignment: ti.assignment,
    dedup: ti.dedup,
    conditions: ti.conditions ? JSON.stringify(ti.conditions) : null,
    default_mode: ti.default_mode,
    late_packer: ti.late_packer ? 1 : 0,
  }
}

function itemRow(item: TripItem): Record<string, unknown> {
  return {
    trip_id: item.trip_id,
    name: item.name,
    source_item_id: item.source_item_id,
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
    container_id: item.container_id,
    packing_now_by: item.packing_now_by,
    flag_unused: item.flag_unused ? 1 : 0,
    flag_missing: item.flag_missing ? 1 : 0,
    updated_hlc: item.updated_hlc,
  }
}
