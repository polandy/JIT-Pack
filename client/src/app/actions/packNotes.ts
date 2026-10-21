/**
 * The pack note (FR-25.33) — what exactly went in, on a trip row. A group of
 * its own beside `packing`: the note is an attribute of the row, written
 * before or after the pack alike, and touches neither the count nor the
 * FR-25.17 stamp.
 */
import { packNoteValue } from '@/domain/packNote'
import type { TripItem } from '@/types/domain'
import type { SyncContext } from '../context'

/** createPackNoteActions binds the pack-note group to one sync context. */
export function createPackNoteActions(ctx: SyncContext) {
  const { mutations, write } = ctx

  /**
   * The note as typed — the domain decides what that stores (one line, at
   * most the column's length, blank as none), so a note the column would
   * refuse never reaches the outbox.
   */
  function setPackNote(item: TripItem, typed: string) {
    write(mutations.setPackNote(item.id, packNoteValue(typed)))
  }

  return { setPackNote }
}
