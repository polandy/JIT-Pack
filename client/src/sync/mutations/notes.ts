/**
 * Trip notes, their threads and ticks (FR-7.1/7.2, FR-7.9, FR-7.13). Spread into `createMutations`
 * (`../mutations.ts`).
 */

import { TABLE } from '@/types/tables'
import { dbBool } from '@/sync/columns'
import { newId } from '@/lib/ids'
import type { Mutation } from '@/api/types'
import type { TaskPhase } from '@/types/domain'
import type { MutationContext } from './context'

/**
 * FR-7.13/FR-7.15: what a trip note is written with beyond its words — a
 * first note's title and the excursion it is about, or a reply's first
 * note. A reply carries neither of the other two.
 */
export interface NoteThreadFields {
  title?: string | null
  parentId?: string | null
  excursionId?: string | null
}

export function createNotesMutations({ make, nowIso }: MutationContext) {
  // --- Comment mutations (FR-7.1/7.2) ---

  /**
   * addComment creates a plain comment; tripItemId null anchors it to the
   * trip. FR-7.13: a trip note may open a thread with a `title`, or answer
   * one by naming its first note as `parentId` — never both, since a reply
   * carries no title (the server drops it). FR-7.15: a first note may name
   * the excursion it is about, which a reply never does. `created_at` is the
   * device's, because a thread is ordered by it and Local Mode has no server
   * to default it.
   */
  function addComment(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
    thread: NoteThreadFields = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.comments, id, {
      trip_id: tripId,
      trip_item_id: tripItemId,
      author_id: authorId,
      body,
      is_task: 0,
      created_at: nowIso(),
      ...(thread.parentId ? { parent_id: thread.parentId } : {}),
      ...(!thread.parentId && thread.title ? { title: thread.title } : {}),
      ...(!thread.parentId && thread.excursionId ? { excursion_id: thread.excursionId } : {}),
    })
    return { mutation, id }
  }

  /**
   * FR-7.13: an entry's words changed by its author — the body, and on a
   * first note the title (`undefined` leaves it alone; `null` takes it off).
   * `edited_at` is the device's clock, named like `resolved_at`, because an
   * edit happens offline too.
   */
  function editNote(noteId: string, body: string, title?: string | null): Mutation {
    return make('upsert', TABLE.comments, noteId, {
      body,
      ...(title !== undefined ? { title } : {}),
      edited_at: nowIso(),
    })
  }

  /**
   * FR-7.15: the excursion a thread is about, or null for none — the one
   * field, and no `edited_at`: which plan a note is about is not a change of
   * its words, and must not make the thread new for everybody who read it.
   */
  function setNoteExcursion(noteId: string, excursionId: string | null): Mutation {
    return make('upsert', TABLE.comments, noteId, { excursion_id: excursionId })
  }

  /** flagCommentAsTask promotes a comment into an open ticket (FR-7.2). */
  /**
   * FR-7.2: a comment becomes an open task. `phase` is written only when the
   * caller names one — FR-7.12's *during*, once *before* is closed; without
   * it the task reads as *before*, as every task without a phase does.
   */
  function flagCommentAsTask(commentId: string, phase?: TaskPhase): Mutation {
    const fields = { is_task: 1, task_state: 'open' }
    return make('upsert', TABLE.comments, commentId, phase ? { ...fields, phase } : fields)
  }

  function deleteComment(commentId: string): Mutation {
    return make('delete', TABLE.comments, commentId)
  }

  // --- Trip note tick mutations (FR-7.9) ---

  /**
   * Tick a note for the first time — a fresh row, one per (note, person),
   * so two people ticking the same note offline both keep their own tick
   * (ADR-073, the same reason FR-24.2's `assignTag` is an insert). userId is
   * the client placeholder; the server stamps it (invariant 3).
   */
  function tickNote(
    tripId: string,
    commentId: string,
    userId: string,
    seenThrough: string | null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.noteAcks, id, {
      trip_id: tripId,
      comment_id: commentId,
      user_id: userId,
      acked: 1,
      seen_through: seenThrough,
    })
    return { mutation, id }
  }

  /**
   * Flip an existing tick — the row already names its person, so the field
   * is the whole change, the same shape as `moveTag`. Un-ticking sets
   * `acked` back rather than deleting the row (NFR-4.2a never deletes).
   * FR-7.13: a tick also says how far it reached — the stamp of the
   * thread's newest entry — so a later reply makes the thread new again;
   * an un-tick leaves that mark alone, it no longer counts.
   */
  function setNoteAcked(ackId: string, acked: boolean, seenThrough?: string | null): Mutation {
    return make('upsert', TABLE.noteAcks, ackId, {
      acked: dbBool(acked),
      ...(acked && seenThrough !== undefined ? { seen_through: seenThrough } : {}),
    })
  }

  return {
    addComment,
    editNote,
    setNoteExcursion,
    flagCommentAsTask,
    deleteComment,
    tickNote,
    setNoteAcked,
  }
}
