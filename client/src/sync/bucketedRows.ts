/**
 * A `Map<parentId, Row[]>` with the operations every one of them needs, and
 * the two `RowSink` shapes (`sinks.ts`) every store's tables are held in —
 * the kernel's stores and the feature modules' alike, which is why it lives
 * in `sync/` (a module may import it, `scripts/module-boundary-gate.mjs`).
 *
 * A bucket key is a parent id — `trip_id`, `template_id` — so a screen reads
 * one trip's rows without scanning every trip's. `remove` still scans every
 * bucket: no bucket key can change today, but if one ever becomes mutable, a
 * remove that stopped at the first bucket would leave the row in its old one
 * as well, which is the failure that has no symptom.
 */
import type { Ref } from 'vue'
import type { RowSink } from './sinks'

/** A row that can live in a bucket: it has an id of its own. */
export interface BucketedRow {
  id: string
}

/** The operations a bucketed map needs. */
export interface BucketedRows<T extends BucketedRow> {
  /** The rows of one bucket, empty when the bucket is unknown. */
  get(bucket: string): T[]
  /** Insert the row, or replace the one with its id. */
  upsert(row: T): void
  /** Remove the row with this id from wherever it is. */
  remove(id: string): void
  /** The row with this id, from whichever bucket holds it. */
  find(id: string): T | undefined
  /** Every row, bucket by bucket. */
  all(): T[]
}

/**
 * bucketedRows wraps a store's `Map<parentId, Row[]>` ref. `bucketOf` reads
 * the parent id off a row — the one thing that differs between the seven.
 */
export function bucketedRows<T extends BucketedRow>(
  rows: Ref<Map<string, T[]>>,
  bucketOf: (row: T) => string,
): BucketedRows<T> {
  return {
    get(bucket: string): T[] {
      return rows.value.get(bucket) ?? []
    },
    upsert(row: T): void {
      const bucket = bucketOf(row)
      const list = rows.value.get(bucket) ?? []
      const idx = list.findIndex((r) => r.id === row.id)
      if (idx >= 0) {
        list[idx] = row
      } else {
        list.push(row)
      }
      rows.value.set(bucket, list)
    },
    remove(id: string): void {
      for (const [bucket, list] of rows.value) {
        const filtered = list.filter((r) => r.id !== id)
        // An emptied bucket goes too, so a deleted trip leaves no key behind.
        if (filtered.length === 0) rows.value.delete(bucket)
        else if (filtered.length !== list.length) rows.value.set(bucket, filtered)
      }
    },
    find(id: string): T | undefined {
      for (const list of rows.value.values()) {
        const row = list.find((r) => r.id === id)
        if (row) return row
      }
      return undefined
    },
    all(): T[] {
      return [...rows.value.values()].flat()
    },
  }
}

/** The bucket as a `RowSink`: `upsert` under the sink's name. */
export function bucketSink<T extends BucketedRow>(rows: BucketedRows<T>): RowSink<T> {
  return {
    set: (row) => rows.upsert(row),
    remove: (id) => rows.remove(id),
    get: (id) => rows.find(id),
    rows: () => rows.all(),
  }
}

/** A `Map` keyed by row id as a `RowSink`. */
export function keyedSink<T extends BucketedRow>(map: Ref<Map<string, T>>): RowSink<T> {
  return {
    set: (row) => map.value.set(row.id, row),
    remove: (id) => map.value.delete(id),
    get: (id) => map.value.get(id),
    rows: () => map.value.values(),
  }
}
