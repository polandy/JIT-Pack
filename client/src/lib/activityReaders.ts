/**
 * The contract between the activity log and the feature modules whose rows it
 * reads (FR-32.2, ADR-066).
 *
 * The server records every write as it happened (FR-32.1): a table, a row,
 * each field's before and after. Which act that was — a purchase, a vote — is
 * a rule about the table's rows, and a feature module's rows are the module's
 * to explain: the log's reading (`domain/activity.ts`) must not know what a
 * shopping entry's `bought` or an idea's `vote` means, or the module stops
 * being one. So a module hands over an {@link ActivityReader} per table it
 * owns, the composition root (`App.vue`) binds them under
 * {@link ACTIVITY_READERS}, and the log asks the reader before it falls back
 * to the words every row shares — added, removed, reordered, changed.
 *
 * The words themselves are the kernel's: every kind and area is a line the
 * log's screen renders, so the vocabulary lives here and a module picks from it.
 */
import type { InjectionKey } from 'vue'

import type { ActivityEntry } from '@/api/types'

/** What a write did, in the words the log uses. */
export type ActivityKind =
  | 'added'
  | 'removed'
  | 'changed'
  | 'reordered'
  | 'packed'
  | 'unpacked'
  | 'skipped'
  | 'bought'
  | 'unbought'
  | 'done'
  | 'reopened'
  | 'read'
  | 'unread'
  | 'voted'
  | 'unvoted'
  | 'retired'
  | 'restored'

/** Which part of the app a write happened in — the log's second word. */
export type ActivityArea =
  | 'packing'
  | 'luggage'
  | 'travellers'
  | 'shopping'
  | 'tasks'
  | 'notes'
  | 'excursions'
  | 'ideas'
  | 'trip'
  | 'members'
  | 'inventory'
  | 'tags'
  | 'templates'
  | 'series'

/** How a module reads the log's entries about one of its tables. */
export interface ActivityReader {
  /** Where every write to the table happened. */
  area: ActivityArea
  /**
   * The act one write was: a kind, null for a write that is no act at all,
   * or undefined to leave it to the shared reading.
   */
  classify?(entry: ActivityEntry): ActivityKind | null | undefined
}

/** The bound readers, by table. */
export type ActivityReaders = Readonly<Partial<Record<string, ActivityReader>>>

export const ACTIVITY_READERS = Symbol('activityReaders') as InjectionKey<ActivityReaders>

/** A field's value before the write; null where it had none. */
export function valueBefore(entry: ActivityEntry, field: string): unknown {
  return entry.changes?.[field]?.[0] ?? null
}

/** A field's value after the write; null where it has none. */
export function valueAfter(entry: ActivityEntry, field: string): unknown {
  return entry.changes?.[field]?.[1] ?? null
}

/** Whether the write changed the field. */
export function changedField(entry: ActivityEntry, field: string): boolean {
  return entry.changes?.[field] !== undefined
}

/** A stored boolean arrives as 0/1 or true/false, depending on who wrote it. */
export function truthy(v: unknown): boolean {
  return v === true || v === 1
}
