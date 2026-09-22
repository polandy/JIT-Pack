/**
 * Comment and todo actions (FR-7.1/7.2/7.3/7.4) — one group, because they are one
 * table: a todo is a comment with `is_task = 1`, and `flagCommentAsTask`
 * carries a row across the line. Moved out of the orchestrator closure under
 * R-4; moves only, so `useSyncOrchestrator`'s return shape is untouched.
 *
 * `toggleNoteTick` (FR-7.9) sits here too: a note is the same trip-level
 * comment shape, and its tick hangs off `comment.id` the way a todo's
 * resolution hangs off the same row.
 */
import { commentRow, noteAckRow, todoRow, tripTodoRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import type { ItemComment, ItemTodo, NoteAck, TaskPhase, TripTodo } from '@/types/domain'
import { TASK_PHASE_BEFORE } from '@/types/domain'
import type { SyncContext } from '../context'

/** createCommentActions binds the comment/todo group to one sync context. */
export function createCommentActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain } = ctx

  function addComment(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
  ): string {
    const { mutation, id } = mutations.addComment(tripId, tripItemId, authorId, body)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  /** Promote a plain comment into an open ticket (FR-7.2). */
  function flagCommentAsTask(tripId: string, comment: ItemComment) {
    const mut = mutations.flagCommentAsTask(comment.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, commentRow(comment)),
    })
  }

  function deleteComment(tripId: string, commentId: string) {
    const mutation = mutations.deleteComment(commentId)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  /**
   * FR-7.9: tick or un-tick a note. `existing` is this reader's own
   * `note_acks` row, if `domain/tripNotes.ts`'s `myAckFor` found one — the
   * first tick inserts a fresh row (one per (note, person), ADR-073),
   * every later tap flips the row that already exists.
   */
  function toggleNoteTick(
    tripId: string,
    noteId: string,
    userId: string,
    existing: NoteAck | null,
  ) {
    if (!existing) {
      const { mutation } = mutations.tickNote(tripId, noteId, userId)
      enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      return
    }
    const mut = mutations.setNoteAcked(existing.id, !existing.acked)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, noteAckRow(existing)),
    })
  }

  /**
   * FR-7.3 with FR-7.7's phase: a preparation is written *before* the trip
   * unless the caller says otherwise — M5 writes one while packing, M25 can
   * write one for the road.
   */
  function addPrepTodo(
    tripId: string,
    tripItemId: string,
    authorId: string,
    body: string,
    phase: TaskPhase = TASK_PHASE_BEFORE,
  ) {
    const { mutation } = mutations.addTodo(tripId, tripItemId, authorId, body, phase)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
  }

  function resolvePrepTodo(tripId: string, todo: ItemTodo) {
    const mut = mutations.resolveTodo(todo.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, todoRow(todo)),
    })
  }

  function reopenPrepTodo(tripId: string, todo: ItemTodo) {
    const mut = mutations.reopenTodo(todo.id)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, todoRow(todo)),
    })
  }

  // --- Trip todos (FR-7.4): the same row with no anchor ---

  function addTripTodo(
    tripId: string,
    authorId: string,
    body: string,
    phase: TaskPhase = TASK_PHASE_BEFORE,
  ): string {
    const { mutation, id } = mutations.addTodo(tripId, null, authorId, body, phase)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  function resolveTripTodo(todo: TripTodo) {
    const mut = mutations.resolveTodo(todo.id)
    enqueueAndDrain('trip', todo.trip_id, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, tripTodoRow(todo)),
    })
  }

  function reopenTripTodo(todo: TripTodo) {
    const mut = mutations.reopenTodo(todo.id)
    enqueueAndDrain('trip', todo.trip_id, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, tripTodoRow(todo)),
    })
  }

  /** FR-7.5: `null` hands it back to everybody. */
  function assignTripTodo(todo: TripTodo, userId: string | null) {
    const mut = mutations.setTodoAssignee(todo.id, userId)
    enqueueAndDrain('trip', todo.trip_id, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, tripTodoRow(todo)),
    })
  }

  /**
   * FR-7.7: a preparation is somebody's job too. The same column and the same
   * mutation as the trip's own task — what differs is only which row the
   * optimistic update is rebuilt from, because the two kinds live in
   * different buckets of the store.
   */
  function assignPrepTodo(tripId: string, todo: ItemTodo, userId: string | null) {
    const mut = mutations.setTodoAssignee(todo.id, userId)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, todoRow(todo)),
    })
  }

  /**
   * FR-7.7's crossing: the task moves to the other phase and nothing else
   * about it changes. Both kinds pass through here — the caller says which
   * row to rebuild, because that is the only difference.
   */
  function setTaskPhase(tripId: string, todo: ItemTodo | TripTodo, phase: TaskPhase | null) {
    const mut = mutations.setTaskPhase(todo.id, phase)
    const row = 'trip_item_id' in todo ? todoRow(todo) : tripTodoRow(todo)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, { ...row, phase }),
    })
  }

  /**
   * FR-7.8: the one tag a task carries, given, changed or taken off. One
   * field, like the phase beside it — the task keeps everything else it was.
   */
  function setTaskTag(tripId: string, todo: ItemTodo | TripTodo, taskTagId: string | null) {
    const mut = mutations.setTaskTag(todo.id, taskTagId)
    const row = 'trip_item_id' in todo ? todoRow(todo) : tripTodoRow(todo)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, { ...row, task_tag_id: taskTagId }),
    })
  }

  function deleteTripTodo(todo: TripTodo) {
    const mutation = mutations.deleteTodo(todo.id)
    enqueueAndDrain('trip', todo.trip_id, {
      mutation,
      optimistic: optimisticDelete(mutation),
    })
  }

  return {
    addComment,
    flagCommentAsTask,
    deleteComment,
    toggleNoteTick,
    addPrepTodo,
    resolvePrepTodo,
    reopenPrepTodo,
    addTripTodo,
    resolveTripTodo,
    reopenTripTodo,
    assignTripTodo,
    assignPrepTodo,
    setTaskPhase,
    setTaskTag,
    deleteTripTodo,
  }
}
