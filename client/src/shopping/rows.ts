/**
 * The shopping module's rows on the wire (FR-30.1, ADR-066 amendment 2): how
 * an entry is read from a pulled row and rebuilt for an optimistic one, and
 * what its delete follows. The store hands these specs to the kernel on its
 * sinks, so no kernel file names the table's codec.
 */
import { TABLE } from '@/api/tables'
import { dbBool } from '@/sync/columns'
import { MODULE_ROWS, type RowSpecs } from '@/sync/tableRegistry'
import { ITEM_MODE_BUY_LOCAL } from '@/types/domain'
import type { ShoppingEntry } from './types'

function rowToShoppingEntry(id: string, row: Record<string, unknown>): ShoppingEntry {
  return {
    id,
    trip_id: row['trip_id'] as string,
    name: row['name'] as string,
    list: (row['list'] as ShoppingEntry['list']) ?? ITEM_MODE_BUY_LOCAL,
    bought: Boolean(row['bought']),
    tag: (row['tag'] as string) ?? null,
    bought_at: (row['bought_at'] as string) ?? null,
    bought_by_user_id: (row['bought_by_user_id'] as string) ?? null,
    due_date: (row['due_date'] as string | null | undefined) ?? null,
    assignee_user_id: (row['assignee_user_id'] as string | null | undefined) ?? null,
    carried_over_at: (row['carried_over_at'] as string | null | undefined) ?? null,
    position: (row['position'] as number | null | undefined) ?? null,
    idea_id: (row['idea_id'] as string | null | undefined) ?? null,
  }
}

/** FR-30.1: a shopping entry as its row. */
export function shoppingEntryRow(entry: ShoppingEntry): Record<string, unknown> {
  return {
    trip_id: entry.trip_id,
    name: entry.name,
    list: entry.list,
    bought: dbBool(entry.bought),
    tag: entry.tag,
    bought_at: entry.bought_at,
    bought_by_user_id: entry.bought_by_user_id,
    due_date: entry.due_date,
    assignee_user_id: entry.assignee_user_id,
    carried_over_at: entry.carried_over_at ?? null,
    position: entry.position ?? null,
    idea_id: entry.idea_id ?? null,
  }
}

/** The module's tables, specified — the sinks of `store.ts` carry them. */
export const SHOPPING_ROWS = {
  [TABLE.shoppingEntries]: { ...MODULE_ROWS, parse: rowToShoppingEntry, encode: shoppingEntryRow },
} satisfies RowSpecs
