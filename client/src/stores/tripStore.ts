/**
 * Trip store — reactive state for trips and their items.
 *
 * Populated from pull responses. Mutations go through the SyncOutbox (G-5).
 * The store itself is a plain data cache; sync orchestration lives elsewhere.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Trip,
  TripItem,
  TripKPIs,
  GroupBy,
  Traveler,
  Container,
  ItemTodo,
} from '@/types/domain'
import type { PullChange } from '@/api/types'

export const useTripStore = defineStore('trips', () => {
  const trips = ref<Map<string, Trip>>(new Map())
  const tripItems = ref<Map<string, TripItem[]>>(new Map())
  const travelers = ref<Map<string, Traveler[]>>(new Map())
  const containers = ref<Map<string, Container[]>>(new Map())
  const todos = ref<Map<string, ItemTodo[]>>(new Map())
  const groupByPrefs = ref<Map<string, GroupBy>>(new Map())

  // --- Getters ---

  const tripList = computed(() => [...trips.value.values()])

  function getTrip(id: string): Trip | undefined {
    return trips.value.get(id)
  }

  function getItems(tripId: string): TripItem[] {
    return tripItems.value.get(tripId) ?? []
  }

  function getTravelers(tripId: string): Traveler[] {
    return travelers.value.get(tripId) ?? []
  }

  function getContainers(tripId: string): Container[] {
    return containers.value.get(tripId) ?? []
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

  function getGroupBy(tripId: string): GroupBy {
    return groupByPrefs.value.get(tripId) ?? 'category'
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

    return { totalItems, packedItems, totalWeight, packedWeight, totalValue, packedValue, totalTodos, resolvedTodos }
  }

  function groupedItems(tripId: string): Map<string, TripItem[]> {
    const items = getItems(tripId)
    const groupBy = getGroupBy(tripId)
    const groups = new Map<string, TripItem[]>()

    for (const item of items) {
      let key: string
      switch (groupBy) {
        case 'category':
          key = item.category_name ?? 'Uncategorized'
          break
        case 'container':
          key = item.container_id ?? 'Unassigned'
          break
        case 'person':
          key = item.assigned_traveler_id ?? 'Unassigned'
          break
        case 'status':
          key = item.state
          break
      }
      const group = groups.get(key) ?? []
      group.push(item)
      groups.set(key, group)
    }

    return groups
  }

  // --- Mutations ---

  function setTrip(trip: Trip): void {
    trips.value.set(trip.id, trip)
  }

  function removeTrip(id: string): void {
    trips.value.delete(id)
    tripItems.value.delete(id)
    travelers.value.delete(id)
    containers.value.delete(id)
    todos.value.delete(id)
  }

  function setGroupBy(tripId: string, groupBy: GroupBy): void {
    groupByPrefs.value.set(tripId, groupBy)
  }

  /** Apply a pull change to the local store. */
  function applyChange(change: PullChange): void {
    const row = change.row as Record<string, unknown> | null

    switch (change.table) {
      case 'trips':
        if (change.deleted) {
          removeTrip(change.id)
        } else if (row) {
          setTrip(rowToTrip(change.id, row))
        }
        break

      case 'trip_items':
        if (change.deleted) {
          removeTripItem(change.id)
        } else if (row) {
          upsertTripItem(rowToTripItem(change.id, row))
        }
        break

      case 'travelers':
        if (change.deleted) {
          removeTraveler(change.id)
        } else if (row) {
          upsertTraveler(rowToTraveler(change.id, row))
        }
        break

      case 'containers':
        if (change.deleted) {
          removeContainer(change.id)
        } else if (row) {
          upsertContainer(rowToContainer(change.id, row))
        }
        break

      case 'comments':
        if (change.deleted) {
          removeTodo(change.id)
        } else if (row && row['is_task']) {
          upsertTodo(rowToTodo(change.id, row))
        }
        break
    }
  }

  function applyChanges(changes: PullChange[]): void {
    for (const c of changes) {
      applyChange(c)
    }
  }

  // --- Internal helpers ---

  function upsertTripItem(item: TripItem): void {
    const items = tripItems.value.get(item.trip_id) ?? []
    const idx = items.findIndex((i) => i.id === item.id)
    if (idx >= 0) {
      items[idx] = item
    } else {
      items.push(item)
    }
    tripItems.value.set(item.trip_id, items)
  }

  function removeTripItem(id: string): void {
    for (const [tripId, items] of tripItems.value) {
      const filtered = items.filter((i) => i.id !== id)
      if (filtered.length !== items.length) {
        tripItems.value.set(tripId, filtered)
        break
      }
    }
  }

  function upsertTraveler(traveler: Traveler): void {
    const list = travelers.value.get(traveler.trip_id) ?? []
    const idx = list.findIndex((t) => t.id === traveler.id)
    if (idx >= 0) {
      list[idx] = traveler
    } else {
      list.push(traveler)
    }
    travelers.value.set(traveler.trip_id, list)
  }

  function removeTraveler(id: string): void {
    for (const [tripId, list] of travelers.value) {
      const filtered = list.filter((t) => t.id !== id)
      if (filtered.length !== list.length) {
        travelers.value.set(tripId, filtered)
        break
      }
    }
  }

  function upsertContainer(container: Container): void {
    const list = containers.value.get(container.trip_id) ?? []
    const idx = list.findIndex((c) => c.id === container.id)
    if (idx >= 0) {
      list[idx] = container
    } else {
      list.push(container)
    }
    containers.value.set(container.trip_id, list)
  }

  function removeContainer(id: string): void {
    for (const [tripId, list] of containers.value) {
      const filtered = list.filter((c) => c.id !== id)
      if (filtered.length !== list.length) {
        containers.value.set(tripId, filtered)
        break
      }
    }
  }

  function upsertTodo(todo: ItemTodo): void {
    const list = todos.value.get(todo.trip_id) ?? []
    const idx = list.findIndex((t) => t.id === todo.id)
    if (idx >= 0) {
      list[idx] = todo
    } else {
      list.push(todo)
    }
    todos.value.set(todo.trip_id, list)
  }

  function removeTodo(id: string): void {
    for (const [tripId, list] of todos.value) {
      const filtered = list.filter((t) => t.id !== id)
      if (filtered.length !== list.length) {
        todos.value.set(tripId, filtered)
        break
      }
    }
  }

  return {
    trips,
    tripList,
    getTrip,
    getItems,
    getTravelers,
    getContainers,
    getTodos,
    getItemTodos,
    getOpenTodos,
    itemsWithOpenPrep,
    getGroupBy,
    kpis,
    groupedItems,
    setTrip,
    removeTrip,
    setGroupBy,
    applyChange,
    applyChanges,
  }
})

// --- Row converters ---

function rowToTrip(id: string, row: Record<string, unknown>): Trip {
  return {
    id,
    name: row['name'] as string,
    status: row['status'] as Trip['status'],
    start_date: (row['start_date'] as string) ?? null,
    end_date: row['end_date'] as string,
    duration_days: (row['duration_days'] as number) ?? null,
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
    container_id: (row['container_id'] as string) ?? null,
    packing_now_by: (row['packing_now_by'] as string) ?? null,
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
    profile: (row['profile'] as Traveler['profile']) ?? 'adult',
    linked_user_id: (row['linked_user_id'] as string) ?? null,
  }
}

function rowToContainer(id: string, row: Record<string, unknown>): Container {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    carrier_traveler_id: (row['carrier_traveler_id'] as string) ?? null,
    max_weight_grams: (row['max_weight_grams'] as number) ?? null,
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
