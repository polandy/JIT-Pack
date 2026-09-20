/**
 * Comment and todo actions (FR-7.1/7.2/7.3/7.4) — one group, because they are one
 * table: a todo is a comment with `is_task = 1`, and `flagCommentAsTask`
 * carries a row across the line. Moved out of the orchestrator closure under
 * R-4; moves only, so `useSyncOrchestrator`'s return shape is untouched.
 */
import { commentRow, todoRow, tripTodoRow } from '../rows'
import { optimisticDelete, optimisticInsert, optimisticUpdate } from '@/sync/optimistic'
import type { ItemComment, ItemTodo, TripTodo } from '@/types/domain'
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

  function addPrepTodo(tripId: string, tripItemId: string, authorId: string, body: string) {
    const { mutation } = mutations.addTodo(tripId, tripItemId, authorId, body)
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

  function addTripTodo(tripId: string, authorId: string, body: string): string {
    const { mutation, id } = mutations.addTodo(tripId, null, authorId, body)
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
    addPrepTodo,
    resolvePrepTodo,
    reopenPrepTodo,
    addTripTodo,
    resolveTripTodo,
    reopenTripTodo,
    assignTripTodo,
    deleteTripTodo,
  }
}
