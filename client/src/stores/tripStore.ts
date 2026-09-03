/**
 * Trip store — reactive state for trips and their items.
 *
 * Populated from pull responses. Mutations go through the SyncOutbox (G-5).
 * The store itself is a plain data cache; sync orchestration lives elsewhere.
 */

import { bucketedRows } from '@/stores/bucketedRows'
import { TABLE, type SyncTable } from '@/types/tables'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AppliedChange,
  GeneratedPosition,
  ShoppingMode,
  Trip,
  TripItem,
  TripKPIs,
  Traveler,
  Container,
  ItemComment,
  ItemTodo,
  TripMember,
  TripTemplateSource,
} from '@/types/domain'
import type { PullChange } from '@/api/types'
import { durationDays } from '@/domain/instantiate'

export const useTripStore = defineStore(TABLE.trips, () => {
  const trips = ref<Map<string, Trip>>(new Map())
  const tripItems = ref<Map<string, TripItem[]>>(new Map())
  const travelers = ref<Map<string, Traveler[]>>(new Map())
  const containers = ref<Map<string, Container[]>>(new Map())
  const todos = ref<Map<string, ItemTodo[]>>(new Map())
  const comments = ref<Map<string, ItemComment[]>>(new Map())
  const members = ref<Map<string, TripMember[]>>(new Map())
  // FR-27.4. Flat maps keyed by row id rather than per trip: all three are
  // read for one trip at a time, and a per-trip bucket would have to be
  // rebuilt on every tombstone.
  const templateSources = ref<Map<string, TripTemplateSource>>(new Map())
  const generatedPositions = ref<Map<string, GeneratedPosition>>(new Map())
  const appliedChanges = ref<Map<string, AppliedChange>>(new Map())

  // The six per-trip buckets, all one shape (see bucketedRows).
  const itemRows = bucketedRows(tripItems, (r) => r.trip_id)
  const travelerRows = bucketedRows(travelers, (r) => r.trip_id)
  const containerRows = bucketedRows(containers, (r) => r.trip_id)
  const memberRows = bucketedRows(members, (r) => r.trip_id)
  const commentRows = bucketedRows(comments, (r) => r.trip_id)
  const todoRows = bucketedRows(todos, (r) => r.trip_id)

  // --- Getters ---

  const tripList = computed(() => [...trips.value.values()])

  function getTrip(id: string): Trip | undefined {
    return trips.value.get(id)
  }

  function getItems(tripId: string): TripItem[] {
    return tripItems.value.get(tripId) ?? []
  }

  /**
   * getShoppingItems derives the M6 procurement lists (FR-3.2): open
   * BUY_BEFORE and BUY_LOCAL items. Purchased BUY_BEFORE items flip to
   * PACK (FR-3.3) and thereby leave the list.
   *
   * Beside each open list is what was bought from it (FR-25.11j), found by
   * `bought_from` because the purchase is exactly what removed the row from
   * its own list. The two are disjoint by construction rather than by a
   * second condition: a row still on the open list is never also reported as
   * bought, so an actionable row can never hide under the reveal — the
   * failure FR-25.11a names.
   */
  function getShoppingItems(tripId: string): {
    buyBefore: TripItem[]
    buyLocal: TripItem[]
    boughtBefore: TripItem[]
    boughtLocal: TripItem[]
  } {
    const items = getItems(tripId)
    const open = items.filter((i) => i.state !== 'packed' && i.state !== 'skipped')
    const buyBefore = open.filter((i) => i.mode === 'buy_before')
    const buyLocal = open.filter((i) => i.mode === 'buy_local')
    const stillOpen = new Set([...buyBefore, ...buyLocal].map((i) => i.id))
    const bought = (from: ShoppingMode) =>
      items.filter((i) => i.bought_from === from && !stillOpen.has(i.id))
    return {
      buyBefore,
      buyLocal,
      boughtBefore: bought('buy_before'),
      boughtLocal: bought('buy_local'),
    }
  }

  function getTravelers(tripId: string): Traveler[] {
    return travelers.value.get(tripId) ?? []
  }

  function getContainers(tripId: string): Container[] {
    return containers.value.get(tripId) ?? []
  }

  /** The trip's synced roster (FR-4.5). */
  function getMembers(tripId: string): TripMember[] {
    return members.value.get(tripId) ?? []
  }

  /** The templates this trip follows (FR-27.4) — empty for a trip created before the registry. */
  function getTemplateSources(tripId: string): TripTemplateSource[] {
    return [...templateSources.value.values()].filter((s) => s.trip_id === tripId)
  }

  /** What generation last produced for this trip, per position (FR-27.4). */
  function getGeneratedPositions(tripId: string): GeneratedPosition[] {
    return [...generatedPositions.value.values()].filter((g) => g.trip_id === tripId)
  }

  /**
   * The applied-changes log behind M2's chip (FR-27.4), newest first — a
   * list of what changed under you reads backwards, like history.
   */
  /**
   * M2's FR-27.4 log, newest first — with the id as a tiebreak, because a
   * whole plan is applied in one pass and its entries share a millisecond.
   * Timestamp alone leaves those to arrival order, so the same log reads
   * differently on two devices; the id is synced, so this order is the same
   * everywhere.
   */
  function getAppliedChanges(tripId: string): AppliedChange[] {
    return [...appliedChanges.value.values()]
      .filter((c) => c.trip_id === tripId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
  }

  function getTodos(tripId: string): ItemTodo[] {
    return todos.value.get(tripId) ?? []
  }

  function getItemTodos(tripId: string, tripItemId: string): ItemTodo[] {
    return getTodos(tripId).filter((t) => t.trip_item_id === tripItemId)
  }

  function getOpenTodos(tripId: string): ItemTodo[] {
    return getTodos(tripId).filter((t) => t.task_state === 'open')
  }

  /** Every comment of a trip, row-anchored and trip-level alike (FR-7.1). */
  function getComments(tripId: string): ItemComment[] {
    return comments.value.get(tripId) ?? []
  }

  /** Plain comments anchored to one item (FR-7.1). */
  function getItemComments(tripId: string, tripItemId: string): ItemComment[] {
    return (comments.value.get(tripId) ?? []).filter((c) => c.trip_item_id === tripItemId)
  }

  /** Plain comments anchored to the trip itself (FR-7.1). */
  function getTripComments(tripId: string): ItemComment[] {
    return (comments.value.get(tripId) ?? []).filter((c) => c.trip_item_id === null)
  }

  /** Items that are packed but still have open prep todos. */
  function itemsWithOpenPrep(tripId: string): Array<{ item: TripItem; openTodos: ItemTodo[] }> {
    const items = getItems(tripId)
    const tripTodos = getTodos(tripId)
    const result: Array<{ item: TripItem; openTodos: ItemTodo[] }> = []

    for (const item of items) {
      const openTodos = tripTodos.filter(
        (t) => t.trip_item_id === item.id && t.task_state === 'open',
      )
      if (openTodos.length > 0) {
        result.push({ item, openTodos })
      }
    }
    return result
  }

  function kpis(tripId: string): TripKPIs {
    const items = getItems(tripId)
    const tripTodos = getTodos(tripId)
    let totalItems = 0
    let packedItems = 0
    let totalWeight = 0
    let packedWeight = 0
    let totalValue = 0
    let packedValue = 0

    for (const item of items) {
      totalItems += item.quantity
      packedItems += item.packed_count
      if (item.weight_grams) {
        totalWeight += item.weight_grams * item.quantity
        packedWeight += item.weight_grams * item.packed_count
      }
      if (item.value_cents) {
        totalValue += item.value_cents * item.quantity
        packedValue += item.value_cents * item.packed_count
      }
    }

    const totalTodos = tripTodos.length
    const resolvedTodos = tripTodos.filter((t) => t.task_state === 'resolved').length

    return {
      totalItems,
      packedItems,
      totalWeight,
      packedWeight,
      totalValue,
      packedValue,
      totalTodos,
      resolvedTodos,
    }
  }

  // --- Mutations ---

  function setTrip(trip: Trip): void {
    trips.value.set(trip.id, trip)
  }

  /**
   * itemChildRows names what a delete of one trip item takes with it: its
   * comments and its FR-7.3 todos, which are one table at two layers. A
   * trip-level comment carries a null `trip_item_id` and is untouched — the
   * same distinction the server's query makes.
   */
  function itemChildRows(tripItemId: string): Array<{ table: SyncTable; id: string }> {
    const rows: Array<{ table: SyncTable; id: string }> = []
    for (const list of comments.value.values()) {
      for (const c of list) {
        if (c.trip_item_id === tripItemId) rows.push({ table: TABLE.comments, id: c.id })
      }
    }
    for (const list of todos.value.values()) {
      for (const t of list) {
        if (t.trip_item_id === tripItemId) rows.push({ table: TABLE.comments, id: t.id })
      }
    }
    return rows
  }

  /**
   * templateSourceRows names the FR-27.4 registrations that point at one
   * template. The rows live here and travel the *master* partition (spec
   * P-3), which is why a deleted group's cascade has to reach into this store.
   */
  function templateSourceRows(templateId: string): Array<{ table: SyncTable; id: string }> {
    return [...templateSources.value.values()]
      .filter((s) => s.template_id === templateId)
      .map((s) => ({ table: TABLE.tripTemplateSources, id: s.id }))
  }

  /**
   * childRows names every row a delete of this trip takes with it, leaf-first
   * — a child before the parent it hangs off, the order the server emits its
   * own cascade in (`internal/store/master.go`, `cascadeChildren`).
   *
   * The client has to derive this itself because the server can only announce
   * three of these tables. `change_log.trip_id` cascades along with the trip,
   * so the trip partition's whole feed is deleted with the row it describes
   * and the master feed carries the news for `trip_members`,
   * `trip_template_sources` and `trip_applied_changes` alone. Everything else
   * would otherwise stay on the device forever — in Local Mode durably, since
   * nothing tombstones a key nobody names.
   */
  function childRows(tripId: string): Array<{ table: SyncTable; id: string }> {
    const rows: Array<{ table: SyncTable; id: string }> = []
    const push = (table: SyncTable, ids: Iterable<string>) => {
      for (const id of ids) rows.push({ table, id })
    }
    // Comments and todos are one table seen at two layers (`is_task`).
    push(
      TABLE.comments,
      getComments(tripId).map((c) => c.id),
    )
    push(
      TABLE.comments,
      getTodos(tripId).map((t) => t.id),
    )
    push(
      TABLE.tripGeneratedPositions,
      getGeneratedPositions(tripId).map((g) => g.id),
    )
    push(
      TABLE.tripItems,
      getItems(tripId).map((i) => i.id),
    )
    push(
      TABLE.travelers,
      getTravelers(tripId).map((t) => t.id),
    )
    push(
      TABLE.containers,
      getContainers(tripId).map((c) => c.id),
    )
    push(
      TABLE.tripMembers,
      getMembers(tripId).map((m) => m.id),
    )
    push(
      TABLE.tripTemplateSources,
      getTemplateSources(tripId).map((s) => s.id),
    )
    push(
      TABLE.tripAppliedChanges,
      getAppliedChanges(tripId).map((c) => c.id),
    )
    return rows
  }

  /**
   * removeTrip drops the trip and everything that hung off it. It is the
   * in-memory half of the cascade `childRows` describes: a second device
   * receives only the trip's own tombstone for the feed-less tables, so the
   * mirror has to happen here rather than at the caller.
   */
  function removeTrip(id: string): void {
    for (const child of childRows(id)) {
      switch (child.table) {
        case TABLE.tripTemplateSources:
          templateSources.value.delete(child.id)
          break
        case TABLE.tripGeneratedPositions:
          generatedPositions.value.delete(child.id)
          break
        case TABLE.tripAppliedChanges:
          appliedChanges.value.delete(child.id)
          break
      }
    }
    trips.value.delete(id)
    tripItems.value.delete(id)
    travelers.value.delete(id)
    containers.value.delete(id)
    todos.value.delete(id)
    comments.value.delete(id)
    members.value.delete(id)
  }

  /** Apply a pull change to the local store. */
  function applyChange(change: PullChange): void {
    const row = change.row as Record<string, unknown> | null

    switch (change.table) {
      case TABLE.trips:
        if (change.deleted) {
          removeTrip(change.id)
        } else if (row) {
          setTrip(rowToTrip(change.id, row))
        }
        break

      case TABLE.tripItems:
        if (change.deleted) {
          itemRows.remove(change.id)
        } else if (row) {
          itemRows.upsert(rowToTripItem(change.id, row))
        }
        break

      case TABLE.travelers:
        if (change.deleted) {
          travelerRows.remove(change.id)
        } else if (row) {
          travelerRows.upsert(rowToTraveler(change.id, row))
        }
        break

      case TABLE.containers:
        if (change.deleted) {
          containerRows.remove(change.id)
        } else if (row) {
          containerRows.upsert(rowToContainer(change.id, row))
        }
        break

      case TABLE.tripMembers:
        if (change.deleted) {
          memberRows.remove(change.id)
        } else if (row) {
          memberRows.upsert(rowToMember(change.id, row))
        }
        break

      case TABLE.tripTemplateSources:
        if (change.deleted) {
          templateSources.value.delete(change.id)
        } else if (row) {
          templateSources.value.set(change.id, rowToTemplateSource(change.id, row))
        }
        break

      case TABLE.tripGeneratedPositions:
        if (change.deleted) {
          generatedPositions.value.delete(change.id)
        } else if (row) {
          generatedPositions.value.set(change.id, rowToGeneratedPosition(change.id, row))
        }
        break

      case TABLE.tripAppliedChanges:
        if (change.deleted) {
          appliedChanges.value.delete(change.id)
        } else if (row) {
          appliedChanges.value.set(change.id, rowToAppliedChange(change.id, row))
        }
        break

      case TABLE.comments:
        // One table, two layers: is_task rows are todos/tickets
        // (FR-7.2/7.3), the rest plain comments (FR-7.1). Flagging
        // moves a row between the two, so always clear the other side.
        if (change.deleted) {
          todoRows.remove(change.id)
          commentRows.remove(change.id)
        } else if (row && row['is_task']) {
          todoRows.upsert(rowToTodo(change.id, row))
          commentRows.remove(change.id)
        } else if (row) {
          commentRows.upsert(rowToComment(change.id, row))
          todoRows.remove(change.id)
        }
        break
    }
  }

  function applyChanges(changes: PullChange[]): void {
    for (const c of changes) {
      applyChange(c)
    }
  }

  return {
    trips,
    tripList,
    getTrip,
    getItems,
    getShoppingItems,
    getTravelers,
    getContainers,
    getMembers,
    getTemplateSources,
    getGeneratedPositions,
    getAppliedChanges,
    getTodos,
    getItemTodos,
    getOpenTodos,
    getComments,
    getItemComments,
    getTripComments,
    itemsWithOpenPrep,
    kpis,
    setTrip,
    childRows,
    itemChildRows,
    templateSourceRows,
    removeTrip,
    applyChange,
    applyChanges,
  }
})

// --- Row converters ---

function rowToTemplateSource(id: string, row: Record<string, unknown>): TripTemplateSource {
  return {
    id,
    trip_id: row['trip_id'] as string,
    template_id: row['template_id'] as string,
  }
}

function rowToGeneratedPosition(id: string, row: Record<string, unknown>): GeneratedPosition {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: row['trip_item_id'] as string,
    source_template_id: row['source_template_id'] as string,
    source_item_id: row['source_item_id'] as string,
    traveler_id: (row['traveler_id'] as string) ?? '',
    name: row['name'] as string,
    quantity: Number(row['quantity'] ?? 0),
    mode: row['mode'] as GeneratedPosition['mode'],
    late_packer: Boolean(row['late_packer']),
    weight_grams: (row['weight_grams'] as number) ?? null,
    value_cents: (row['value_cents'] as number) ?? null,
    category_name: (row['category_name'] as string) ?? null,
    // Stored as a JSON array (migration 023): one field, written only by the
    // refresh, so there is no concurrent edit for a per-row table to protect.
    tasks: parseTasks(row['tasks']),
  }
}

function parseTasks(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    // A malformed snapshot must not take the trip list down with it: an
    // empty task list reads as "the refresh will re-add them", which is
    // recoverable, where a thrown parse error is not.
    return []
  }
}

function rowToAppliedChange(id: string, row: Record<string, unknown>): AppliedChange {
  const detail = row['detail']
  return {
    id,
    trip_id: row['trip_id'] as string,
    source_template_id: row['source_template_id'] as string,
    source_template_name: row['source_template_name'] as string,
    kind: row['kind'] as AppliedChange['kind'],
    item_name: row['item_name'] as string,
    detail: typeof detail === 'string' && detail !== '' ? JSON.parse(detail) : null,
    created_at: (row['created_at'] as string) ?? '',
  }
}

function rowToTrip(id: string, row: Record<string, unknown>): Trip {
  return {
    id,
    name: row['name'] as string,
    status: row['status'] as Trip['status'],
    year: Number(row['year'] ?? new Date().getFullYear()),
    start_date: (row['start_date'] as string) ?? null,
    end_date: (row['end_date'] as string) ?? null,
    // Derived, never read off the row: `trips.duration_days` is a generated
    // column and is not syncable, so no pull ever carries it.
    duration_days: durationDays(
      (row['start_date'] as string) ?? null,
      (row['end_date'] as string) ?? null,
    ),
    series_id: (row['series_id'] as string) ?? null,
    series_name: (row['series_name'] as string) ?? null,
    attributes: row['attributes'] ? JSON.parse(row['attributes'] as string) : null,
    imported: Boolean(row['imported']),
  }
}

function rowToTripItem(id: string, row: Record<string, unknown>): TripItem {
  return {
    id,
    trip_id: row['trip_id'] as string,
    source_item_id: (row['source_item_id'] as string) ?? null,
    source_template_id: (row['source_template_id'] as string) ?? null,
    name: row['name'] as string,
    weight_grams: (row['weight_grams'] as number) ?? null,
    value_cents: (row['value_cents'] as number) ?? null,
    category_name: (row['category_name'] as string) ?? null,
    quantity: (row['quantity'] as number) ?? 1,
    packed_count: (row['packed_count'] as number) ?? 0,
    state: (row['state'] as TripItem['state']) ?? 'open',
    mode: (row['mode'] as TripItem['mode']) ?? 'pack',
    late_packer: Boolean(row['late_packer']),
    assigned_traveler_id: (row['assigned_traveler_id'] as string) ?? null,
    packer_user_id: (row['packer_user_id'] as string) ?? null,
    packed_by_user_id: (row['packed_by_user_id'] as string) ?? null,
    packed_at: (row['packed_at'] as string) ?? null,
    container_id: (row['container_id'] as string) ?? null,
    packing_now_by: (row['packing_now_by'] as string) ?? null,
    packing_now_at: (row['packing_now_at'] as string) ?? null,
    bought_from: (row['bought_from'] as TripItem['bought_from']) ?? null,
    flag_unused: Boolean(row['flag_unused']),
    flag_missing: Boolean(row['flag_missing']),
    updated_hlc: (row['updated_hlc'] as string) ?? '',
  }
}

function rowToTraveler(id: string, row: Record<string, unknown>): Traveler {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    linked_user_id: (row['linked_user_id'] as string) ?? null,
  }
}

function rowToMember(id: string, row: Record<string, unknown>): TripMember {
  return {
    id,
    trip_id: row['trip_id'] as string,
    user_id: row['user_id'] as string,
    role: (row['role'] as TripMember['role']) ?? 'editor',
  }
}

function rowToContainer(id: string, row: Record<string, unknown>): Container {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    carrier_traveler_id: (row['carrier_traveler_id'] as string) ?? null,
    max_weight_grams: (row['max_weight_grams'] as number) ?? null,
    paired_container_id: (row['paired_container_id'] as string) ?? null,
  }
}

function rowToComment(id: string, row: Record<string, unknown>): ItemComment {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: (row['trip_item_id'] as string) ?? null,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    created_at: (row['created_at'] as string) ?? null,
  }
}

function rowToTodo(id: string, row: Record<string, unknown>): ItemTodo {
  return {
    id,
    trip_id: row['trip_id'] as string,
    trip_item_id: row['trip_item_id'] as string,
    author_id: row['author_id'] as string,
    body: row['body'] as string,
    task_state: (row['task_state'] as ItemTodo['task_state']) ?? 'open',
  }
}
