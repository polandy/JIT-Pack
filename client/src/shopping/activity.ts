/**
 * How the activity log reads the shopping list's own entries (FR-32.2) —
 * pure, no I/O, no Vue. The log knows no module's columns; it asks this
 * reader, which the composition root binds (`lib/activityReaders.ts`).
 *
 * A packing row bought from the list is the packing side's write and is read
 * there; this is only the list's own entries.
 */
import { ACTIVITY_OP } from '@/api/types'
import {
  changedField,
  truthy,
  valueAfter,
  type ActivityReader,
  type ActivityReaders,
} from '@/lib/activityReaders'
import type { ShoppingEntry } from '@/types/domain'
import { TABLE } from '@/api/tables'

const BOUGHT = 'bought' satisfies keyof ShoppingEntry

const entries: ActivityReader = {
  area: 'shopping',
  classify(entry) {
    if (!changedField(entry, BOUGHT) || entry.op !== ACTIVITY_OP.update) return undefined
    return truthy(valueAfter(entry, BOUGHT)) ? 'bought' : 'unbought'
  },
}

/** The module's readers, by table. */
export const shoppingActivityReaders: ActivityReaders = {
  [TABLE.shoppingEntries]: entries,
}
