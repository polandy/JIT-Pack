/**
 * Who an item is usually somebody's job for (FR-1.9), decided for many items
 * at once (FR-24.9) — pure, no I/O.
 *
 * The whole rule is *which items the batch may not skip*, and it exists as a
 * function rather than a filter inline in the screen for the reason every
 * bulk plan does: the batch has to report what it actually wrote, and an
 * item already naming the person asked for is not a write. Under field-level
 * LWW (ADR-022) it is worse than redundant — a no-op write still carries a
 * newer clock, so it would beat a real change made on another device in the
 * meantime with a value nobody chose.
 */
import type { MasterItem } from '@/types/domain'

/** One item the batch will rewrite, and the value to put back on undo. */
export interface AssigneeChange {
  item: MasterItem
  previous: string | null
}

/**
 * The items whose default assignee actually differs from the one asked for.
 * `null` is the value for *nobody*, which is a decision like any other: it is
 * how a batch takes an assignment away again.
 */
export function planDefaultAssignee(
  items: MasterItem[],
  assigneeId: string | null,
): AssigneeChange[] {
  return items
    .filter((item) => (item.default_assignee_id ?? null) !== assigneeId)
    .map((item) => ({ item, previous: item.default_assignee_id ?? null }))
}
