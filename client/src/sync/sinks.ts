/**
 * Where a store puts each table's rows, and the one way rows go in and out.
 *
 * Every store — the trip and master stores and each feature module's — offers
 * one `RowSink` per table it holds, and the rest is derived: a pulled or
 * optimistic change is parsed by its table's codec and handed to its sink
 * (`applyChangesToSinks`), a tombstone takes what `cascade.ts` derives from
 * `TABLE_SPECS` with it (`removeCascading`), and a write reads its base row
 * back out (`currentRowIn`). A module store is its sinks; it restates neither
 * the switch over its tables nor its cascade (FR-30.3, ADR-066).
 */
import type { PullChange } from '@/api/types'
import type { SyncTable } from '@/api/tables'
import { cascadeOf } from './cascade'
import { codecFor, encodedRow, type SyncRow } from './tableRegistry'

/**
 * Where a store puts one table's rows. Two shapes cover every table: a
 * `Map` keyed by row id (`keyedSink`), and a `bucketedRows` map keyed by a
 * parent id (`bucketSink`).
 *
 * The parameter is `never` so that a `RowSink<Tag>` may sit in a map of
 * sinks for every table; `applyToSink` is the one place that casts back.
 */
export interface RowSink<T = never> {
  set(row: T): void
  /** Drops the row alone — what goes with it is `removeCascading`'s. */
  remove(id: string): void
  /** The row with this id as the store holds it — what a write paints over. */
  get(id: string): T | undefined
  /** Every row the sink holds — what the cascade reads its children out of. */
  rows(): Iterable<T>
}

/** A sink of some table's rows, as a map of sinks for every table holds it. */
export type AnyRowSink = Omit<RowSink, 'get' | 'rows'> & {
  get(id: string): unknown
  rows(): Iterable<unknown>
}

/** The sinks a store offers, one per table it holds. */
export type RowSinks = Partial<Record<SyncTable, AnyRowSink>>

/** Anything that holds rows on the device: a store, as the cascade reads it. */
export interface SinkHolder {
  readonly sinks: RowSinks
}

/** Whether a store holds this table's rows — a sink for it is the whole statement. */
export function holdsTable(holder: SinkHolder, table: string): boolean {
  return Object.hasOwn(holder.sinks, table)
}

/**
 * applyToSink hands a parsed row to its table's sink. The cast is the price
 * of one map holding sinks of different row types; it is sound because
 * `TABLE_SPECS[table].parse` and the sink were declared for the same table,
 * and it is confined to this function.
 */
export function applyToSink(sinks: RowSinks, table: SyncTable, row: unknown): void {
  ;(sinks[table] as RowSink<unknown> | undefined)?.set(row)
}

/**
 * removeCascading drops a row and everything a delete of it takes along,
 * as far as these sinks hold it. It is the applied half of the cascade the
 * optimistic path paints (`cascadeChanges`): a tombstone arriving alone —
 * the children's own follow a pull page later, or, for a deleted trip's
 * rows, never — leaves nothing on screen the other path would have removed.
 */
export function removeCascading(sinks: RowSinks, table: SyncTable, id: string): void {
  for (const child of cascadeOf(table, id, { sinks })) sinks[child.table]?.remove(child.id)
  sinks[table]?.remove(id)
}

/**
 * applyChangesToSinks applies pulled or optimistic changes to the sinks that
 * hold their tables, and skips the rest — a change for a table these sinks
 * do not hold belongs to another store, and one this build has no codec for
 * belongs to no store at all.
 */
export function applyChangesToSinks(sinks: RowSinks, changes: readonly PullChange[]): void {
  for (const change of changes) {
    const known = codecFor(change.table)
    if (!known || !sinks[known.table]) continue
    if (change.deleted) removeCascading(sinks, known.table, change.id)
    else if (change.row) {
      applyToSink(sinks, known.table, known.codec.parse(change.id, change.row as SyncRow))
    }
  }
}

/**
 * currentRowIn reads one row out of a store's sinks in its wire shape, or
 * undefined where the store does not hold it — the base an optimistic update
 * is laid over (`sync/writeFunnel.ts`).
 */
export function currentRowIn(sinks: RowSinks, table: string, id: string): SyncRow | undefined {
  const known = codecFor(table)
  const value = known ? sinks[known.table]?.get(id) : undefined
  return value === undefined ? undefined : encodedRow(known!.table, value)
}
