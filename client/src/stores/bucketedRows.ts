/**
 * A `Map<parentId, Row[]>` with the three operations every one of them needs.
 *
 * Seven of these existed as hand-written `upsertX`/`removeX` pairs across the
 * two stores — six in `tripStore`, one in `masterStore` — each twenty lines
 * of the same find-or-push and filter-the-bucket. They were not quite
 * identical, which is the point: `removeComment` scanned every bucket while
 * the other six stopped at the first one that changed. Nothing depended on
 * the difference, and nothing said which was intended.
 *
 * This keeps the scanning version. A bucket key is a parent id — `trip_id`,
 * `template_id` — and none of them can change today, so the two behave the
 * same; if one ever becomes mutable, the version that stops early leaves the
 * row in its old bucket and the row is then in two places at once, which is
 * the failure that has no symptom.
 */
import type { Ref } from 'vue'
import type { RowSink } from '@/sync/tableRegistry'

/** A row that can live in a bucket: it has an id of its own. */
export interface BucketedRow {
  id: string
}

/** The three operations a bucketed map needs. */
export interface BucketedRows<T extends BucketedRow> {
  /** The rows of one bucket, empty when the bucket is unknown. */
  get(bucket: string): T[]
  /** Insert the row, or replace the one with its id. */
  upsert(row: T): void
  /** Remove the row with this id from wherever it is. */
  remove(id: string): void
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
        if (filtered.length !== list.length) {
          rows.value.set(bucket, filtered)
        }
      }
    },
  }
}

/** The bucket as a `RowSink`: `upsert` under the sink's name. */
export function bucketSink<T extends BucketedRow>(rows: BucketedRows<T>): RowSink<T> {
  return { set: (row) => rows.upsert(row), remove: (id) => rows.remove(id) }
}

/** A `Map` keyed by row id as a `RowSink`. */
export function keyedSink<T extends BucketedRow>(map: Ref<Map<string, T>>): RowSink<T> {
  return {
    set: (row) => map.value.set(row.id, row),
    remove: (id) => map.value.delete(id),
  }
}
