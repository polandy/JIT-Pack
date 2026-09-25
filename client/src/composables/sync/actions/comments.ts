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
import { cascadeChanges } from '@/sync/cascade'
import { TABLE } from '@/types/tables'
import type { ItemComment, ItemTodo, NoteAck, TaskPhase, TripTodo } from '@/types/domain'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'
import type { SyncContext } from '../context'
import { phaseForNewTask } from '@/domain/closePacking'
import { isPackingClosed } from '@/lib/tripPhase'

/** createCommentActions binds the comment/todo group to one sync context. */
export function createCommentActions(ctx: SyncContext) {
  const { mutations, enqueueAndDrain, tripStore, masterStore } = ctx

  /** FR-7.12: never into a *before* the finished packing has closed. */
  function newTaskPhase(tripId: string, asked: TaskPhase): TaskPhase {
    return phaseForNewTask(asked, isPackingClosed(tripStore.getTrip(tripId)))
  }

  /**
   * FR-7.13: `thread` opens a titled thread or answers one — see
   * `mutations.addComment`.
   */
  function addComment(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
    thread?: { title?: string | null; parentId?: string | null },
  ): string {
    const { mutation, id } = mutations.addComment(tripId, tripItemId, authorId, body, thread)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: optimisticInsert(mutation),
    })
    return id
  }

  /** Promote a plain comment into an open ticket (FR-7.2). */
  function flagCommentAsTask(tripId: string, comment: ItemComment) {
    const closed = isPackingClosed(tripStore.getTrip(tripId))
    const mut = mutations.flagCommentAsTask(comment.id, closed ? TASK_PHASE_DURING : undefined)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, commentRow(comment)),
    })
  }

  /** A first note goes with its thread (FR-7.13), as the server's cascade does. */
  function deleteComment(tripId: string, commentId: string) {
    const mutation = mutations.deleteComment(commentId)
    enqueueAndDrain('trip', tripId, {
      mutation,
      optimistic: [
        ...cascadeChanges(TABLE.comments, commentId, { tripStore, masterStore }),
        optimisticDelete(mutation),
      ],
    })
  }

  /**
   * FR-7.13: the author changes an entry's words. `title` only for a first
   * note — `undefined` leaves a reply's (absent) title alone.
   */
  function editNote(tripId: string, note: ItemComment, body: string, title?: string | null) {
    const mut = mutations.editNote(note.id, body, title)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, commentRow(note)),
    })
  }

  /**
   * FR-7.9/FR-7.13: tick or un-tick a thread. `existing` is this reader's own
   * `note_acks` row, if `domain/tripNotes.ts`'s `myAckFor` found one — the
   * first tick inserts a fresh row (one per (note, person), ADR-073), every
   * later tap writes the row that already exists.
   *
   * What the tap means is the thread's, not the row's: a thread ticked last
   * week with a reply since shows unticked, and its tap ticks it again
   * through the newest entry rather than taking the old tick away. So the
   * caller says whether the thread reads `ticked` now, and `seenThrough` is
   * how far a new tick reaches.
   */
  function toggleNoteTick(
    tripId: string,
    noteId: string,
    userId: string,
    existing: NoteAck | null,
    seen: { ticked: boolean; seenThrough: string | null },
  ) {
    if (!existing) {
      const { mutation } = mutations.tickNote(tripId, noteId, userId, seen.seenThrough)
      enqueueAndDrain('trip', tripId, { mutation, optimistic: optimisticInsert(mutation) })
      return
    }
    const mut = seen.ticked
      ? mutations.setNoteAcked(existing.id, false)
      : mutations.setNoteAcked(existing.id, true, seen.seenThrough)
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
    const { mutation } = mutations.addTodo(
      tripId,
      tripItemId,
      authorId,
      body,
      newTaskPhase(tripId, phase),
    )
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
    const { mutation, id } = mutations.addTodo(
      tripId,
      null,
      authorId,
      body,
      newTaskPhase(tripId, phase),
    )
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

  /** FR-7.11: the day a task is due, set, moved or taken off — one field. */
  function setTaskDueDate(tripId: string, todo: ItemTodo | TripTodo, dueDate: string | null) {
    const mut = mutations.setTaskDueDate(todo.id, dueDate)
    const row = 'trip_item_id' in todo ? todoRow(todo) : tripTodoRow(todo)
    enqueueAndDrain('trip', tripId, {
      mutation: mut,
      optimistic: optimisticUpdate(mut, { ...row, due_date: dueDate }),
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
    editNote,
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
    setTaskDueDate,
    deleteTripTodo,
  }
}
