/**
 * The optimistic twin of a mutation.
 *
 * Every write shows its effect before the server has seen it, by feeding the
 * stores the same row the server will later send back. Building that row by
 * hand carried a trap the stores make invisible: `applyChange` **replaces**
 * the row it is given, so a column the mutation does not mention is blanked
 * until a pull puts it back — and in Local Mode no pull ever comes.
 *
 * These helpers exist so the trap cannot be stepped in. `optimisticUpdate`
 * performs the merge itself, so a caller has no way to pass fields alone;
 * `optimisticInsert` is the one shape where fields alone *are* the whole row.
 * Both take the table and the id from the mutation rather than beside it, so
 * the change and the write it stands for cannot address different rows.
 */

import type { Mutation, PullChange } from '@/api/types'

/** A row as the stores hold it — whatever columns the entity has. */
export type Row = Record<string, unknown>

/**
 * The sequence number of a change that never came from the feed. The server
 * assigns real ones; an optimistic change is not in the log yet and must not
 * advance any cursor.
 */
const OPTIMISTIC_SEQ = 0

/**
 * optimisticInsert shows a row that did not exist before. Only here are the
 * mutation's fields the whole row, because there is nothing underneath them.
 */
export function optimisticInsert(mutation: Mutation): PullChange {
  return {
    seq: OPTIMISTIC_SEQ,
    table: mutation.table,
    id: mutation.id,
    deleted: false,
    row: { ...mutation.fields },
  }
}

/**
 * optimisticUpdate shows a change to a row that is already on screen.
 * `current` is that row as the store holds it; the mutation's fields are laid
 * over it, never in place of it.
 */
export function optimisticUpdate(mutation: Mutation, current: Row): PullChange {
  return {
    seq: OPTIMISTIC_SEQ,
    table: mutation.table,
    id: mutation.id,
    deleted: false,
    row: { ...current, ...mutation.fields },
  }
}

/** optimisticDelete removes the row its mutation deletes. */
export function optimisticDelete(mutation: Mutation): PullChange {
  return {
    seq: OPTIMISTIC_SEQ,
    table: mutation.table,
    id: mutation.id,
    deleted: true,
    row: null,
  }
}

/**
 * localChange feeds the stores a row that belongs to no mutation. The item
 * image is the case it exists for: the bytes travel outside the sync envelope
 * (ADR-002), so in Local Mode the hash has to reach the store on its own.
 */
export function localChange(table: string, id: string, row: Row | undefined): PullChange {
  return { seq: OPTIMISTIC_SEQ, table, id, deleted: false, row: { ...row } }
}

/** localTombstone is `localChange`'s removal half. */
export function localTombstone(table: string, id: string): PullChange {
  return { seq: OPTIMISTIC_SEQ, table, id, deleted: true, row: null }
}
