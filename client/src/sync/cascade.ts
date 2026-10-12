/**
 * The client's mirror of the server's delete cascade.
 *
 * SQLite removes child rows inside the engine, where no change feed can see
 * them, so `cascadeChildren` (`internal/store/master.go`) collects them before
 * the parent goes and tombstones each one. A client has to produce the same
 * list for itself, for two reasons that arrive in different modes:
 *
 * - **Local Mode has no server at all.** The optimistic change list is what
 *   `IndexedDBPersistence` writes, and it deletes exactly the keys it is
 *   handed — so a delete naming only the parent leaves every child row on the
 *   device, where the next start reads them straight back (C-3a). The store
 *   dropping its own buckets hides this completely: the screen is right and
 *   the disk is not.
 * - **Server Mode paints before the tombstones arrive**, and for a deleted
 *   trip most of them never do — `change_log.trip_id` cascades too, so the
 *   trip partition's feed dies with the row it describes.
 *
 * The shape this produces is the server's: **one mutation, many changes**. A
 * mutation per child would ask the server to repeat a cascade it performs
 * itself, and would queue rows whose parent is already gone.
 *
 * Ordering is leaf-first — a child before the parent it hangs off — for the
 * same reason the server orders its own.
 */
import type { SyncTable } from '@/api/tables'
import { localTombstone } from './optimistic'
import type { PullChange } from '@/api/types'
import type { RowSinks, SinkHolder, SpecifiedSink } from './sinks'

/** One row a delete takes with it. */
export interface CascadeRow {
  table: SyncTable
  id: string
}

/** A child table's reference to a parent, seen from the parent. */
interface ChildRef {
  table: SyncTable
  column: string
}

/**
 * Each parent table's children, inverted from the `cascadeParents` of the
 * sinks' specs. Only a table some sink holds can have rows to find, so the
 * edges of the stores at hand are all the walk needs — a module's tables
 * reach it on its store, never through a kernel list.
 */
function childrenOf(sinks: RowSinks): ReadonlyMap<SyncTable, readonly ChildRef[]> {
  const children = new Map<SyncTable, ChildRef[]>()
  for (const [table, sink] of Object.entries(sinks) as [SyncTable, SpecifiedSink][]) {
    for (const parent of sink.spec.cascadeParents ?? []) {
      const list = children.get(parent.table) ?? []
      list.push({ table, column: parent.column })
      children.set(parent.table, list)
    }
  }
  return children
}

const keyOf = (row: CascadeRow) => `${row.table}\u0000${row.id}`

/**
 * cascadeOf names every row a delete of `table`/`id` takes with it, leaf-first
 * and excluding the parent, out of whatever the given stores hold. Nothing
 * here names a table: the edges are the sinks' `cascadeParents`, followed
 * as far as they reach — a trip item takes its notes, a note its replies and
 * the ticks of both, as SQLite's own cascade does.
 *
 * Children are found a level at a time, each child table scanned once per
 * level for every parent the level found, so a deleted trip's thousand rows
 * cost a few passes rather than a scan per row. The order is then a
 * post-order walk of what was found: a row stands after everything that hangs
 * off it, whichever of its parents it was reached through.
 */
export function cascadeOf(table: SyncTable, id: string, ...stores: SinkHolder[]): CascadeRow[] {
  const sinks: RowSinks = Object.assign({}, ...stores.map((s) => s.sinks))
  const children = childrenOf(sinks)
  const root: CascadeRow = { table, id }
  const below = new Map<string, CascadeRow[]>()
  const found = new Set<string>([keyOf(root)])

  let level = new Map<SyncTable, Set<string>>([[table, new Set([id])]])
  while (level.size > 0) {
    const next = new Map<SyncTable, Set<string>>()
    for (const [parentTable, parentIds] of level) {
      for (const child of children.get(parentTable) ?? []) {
        for (const row of sinks[child.table]?.rows() ?? []) {
          const fields = row as Record<string, unknown> & { id: string }
          const parentId = fields[child.column]
          if (typeof parentId !== 'string' || !parentIds.has(parentId)) continue
          const childRow: CascadeRow = { table: child.table, id: fields.id }
          const parentKey = keyOf({ table: parentTable, id: parentId })
          const siblings = below.get(parentKey)
          if (siblings) siblings.push(childRow)
          else below.set(parentKey, [childRow])
          if (found.has(keyOf(childRow))) continue
          found.add(keyOf(childRow))
          next.set(child.table, (next.get(child.table) ?? new Set()).add(childRow.id))
        }
      }
    }
    level = next
  }

  const ordered: CascadeRow[] = []
  const placed = new Set<string>([keyOf(root)])
  const place = (row: CascadeRow): void => {
    for (const child of below.get(keyOf(row)) ?? []) {
      if (placed.has(keyOf(child))) continue
      placed.add(keyOf(child))
      place(child)
      ordered.push(child)
    }
  }
  place(root)
  return ordered
}

/**
 * cascadeChanges is `cascadeOf` as the optimistic changes a caller hands to
 * `write` as a `QueuedMutation`'s paint — the children's tombstones, without
 * the parent's own.
 */
export function cascadeChanges(
  table: SyncTable,
  id: string,
  ...stores: SinkHolder[]
): PullChange[] {
  return cascadeTombstones(cascadeOf(table, id, ...stores))
}

/**
 * cascadeTombstones paints rows a delete takes with it as removals — for a
 * caller that wants the rows themselves too (the planner forgets a deleted
 * idea's picture bytes by them, FR-29.5), so this file stays the one place a
 * child's tombstone is built.
 */
export function cascadeTombstones(rows: readonly CascadeRow[]): PullChange[] {
  return rows.map((child) => localTombstone(child.table, child.id))
}
