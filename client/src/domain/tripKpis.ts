/**
 * A trip's packing figures (FR-25.22) — pure, no I/O. `stores/tripStore` is
 * the one caller, over its own rows.
 */
import { unitsOf } from './packState'
import { TASK_STATE_OPEN, TASK_STATE_RESOLVED } from '@/types/domain'
import type { PrepTask, TripItem, TripKPIs } from '@/types/domain'

/**
 * `hidden` names rows the caller no longer shows although they are still
 * stored — FR-25.31's removals waiting for their undo to lapse. A hidden
 * trip item takes its own preparations out of the count with it.
 */
export function tripKpis(
  items: readonly TripItem[],
  prepTasks: readonly PrepTask[],
  hidden: ReadonlySet<string> = new Set(),
): TripKPIs {
  const visibleItems = items.filter((item) => !hidden.has(item.id))
  const prepared = prepTasks.filter(
    (task) => !hidden.has(task.id) && !(task.trip_item_id && hidden.has(task.trip_item_id)),
  )
  let totalItems = 0
  let packedItems = 0
  let totalWeight = 0
  let packedWeight = 0
  let totalValue = 0
  let packedValue = 0

  for (const item of visibleItems) {
    // FR-25.22: the same units M4's group and cluster heads count, so the
    // trip line is the sum of the fractions drawn under it.
    const units = unitsOf(item)
    totalItems += units.total
    packedItems += units.done
    if (item.weight_grams) {
      totalWeight += item.weight_grams * item.quantity
      packedWeight += item.weight_grams * item.packed_count
    }
    if (item.value_cents) {
      totalValue += item.value_cents * item.quantity
      packedValue += item.value_cents * item.packed_count
    }
  }

  const totalPrepTasks = prepared.length
  const resolvedPrepTasks = prepared.filter((t) => t.task_state === TASK_STATE_RESOLVED).length

  return {
    totalItems,
    packedItems,
    totalWeight,
    packedWeight,
    totalValue,
    packedValue,
    totalPrepTasks,
    resolvedPrepTasks,
  }
}

/** Items that are packed but still have an open preparation. */
export function itemsWithOpenPrep(
  items: readonly TripItem[],
  prepTasks: readonly PrepTask[],
): Array<{ item: TripItem; openPrepTasks: PrepTask[] }> {
  const result: Array<{ item: TripItem; openPrepTasks: PrepTask[] }> = []
  for (const item of items) {
    const openPrepTasks = prepTasks.filter(
      (t) => t.trip_item_id === item.id && t.task_state === TASK_STATE_OPEN,
    )
    if (openPrepTasks.length > 0) {
      result.push({ item, openPrepTasks })
    }
  }
  return result
}
