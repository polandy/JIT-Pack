/**
 * Preparation tasks and their tags (FR-7.3, FR-7.8, FR-7.14). Spread into `createMutations`
 * (`../mutations.ts`).
 */

import { TABLE } from '@/api/tables'
import { newId } from '@/lib/ids'
import type { Mutation } from '@/api/types'
import type { TaskPhase } from '@/types/domain'
import type { MutationContext } from './context'

/**
 * FR-7.14: what a new task may be filed under as it is written — its one tag
 * and its due day. Both optional: absent means the task has none.
 */
export interface TaskFiling {
  taskTagId?: string | null
  dueDate?: string | null
  /** FR-7.17: the task's place in its group; absent for never placed. */
  position?: number
  /** FR-29.13: the idea a trip task is made from. */
  ideaId?: string | null
}

export function createTasksMutations({ make, nowIso }: MutationContext) {
  // --- Task mutations, either kind (FR-7.3/FR-7.4) ---
  //
  // See CLIENT_ACTOR_PLACEHOLDER for what callers pass as the author.

  /**
   * addTask creates an open task: on a row (FR-7.3) when `tripItemId` names
   * one, on the trip itself (FR-7.4) when it is null.
   */
  function addTask(
    tripId: string,
    tripItemId: string | null,
    authorId: string,
    body: string,
    phase: TaskPhase,
    filed: TaskFiling = {},
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const mutation = make('insert', TABLE.comments, id, {
      trip_id: tripId,
      trip_item_id: tripItemId,
      author_id: authorId,
      body,
      is_task: 1,
      task_state: 'open',
      // FR-7.7: every task is written with a phase — the composer it was
      // typed into knows which, and a task that arrived without one would
      // have to be guessed at by every reader instead of once, here.
      phase,
      // FR-7.7: the moment it was written, named by the client for the same
      // reason `packed_at` is (FR-25.17) — and for one more: the column's
      // DEFAULT is the database's, and **Local Mode has no database server**,
      // so a task written offline would carry no creation time at all and its
      // line would say nothing. A clock is not an identity claim; the author
      // beside it stays the server's (invariant 3).
      created_at: nowIso(),
      // FR-7.14: filed as it is typed — M25's composer names a tag and a day
      // beside the words, and one insert carries them rather than an insert
      // and two updates that a reader could see half-applied. Only what was
      // named: a task without them is written as it always was.
      ...(filed.taskTagId ? { task_tag_id: filed.taskTagId } : {}),
      ...(filed.dueDate ? { due_date: filed.dueDate } : {}),
      // FR-7.17: a task typed by hand lands at the end of its group.
      ...(filed.position !== undefined ? { position: filed.position } : {}),
      // FR-29.13: made from an idea, it names the idea.
      ...(filed.ideaId ? { idea_id: filed.ideaId } : {}),
    })
    return { mutation, id }
  }

  /**
   * FR-7.7: ticking a task off writes the moment of the tap beside the state,
   * the way `packItem` writes `packed_at` — a task is ticked off away from a
   * network and the push can land days later. The *who* is the server's
   * (invariant 3), which is why nothing here names one: in Local Mode there
   * is nobody to name, and the line then says when without saying who (G-8).
   */
  function resolveTask(taskId: string): Mutation {
    return make('upsert', TABLE.comments, taskId, {
      task_state: 'resolved',
      resolved_at: nowIso(),
    })
  }

  /** Unticking clears the record with the state it described. */
  function reopenTask(taskId: string): Mutation {
    return make('upsert', TABLE.comments, taskId, {
      task_state: 'open',
      resolved_at: null,
    })
  }

  /**
   * FR-7.7: the crossing — the salve that was not fetched before departure is
   * now a task for the trip itself. One field, because that is the only thing
   * that changes about it: it is the same task, still open, still whosever it
   * was, and it keeps the day it was written.
   */
  function setTaskPhase(taskId: string, phase: TaskPhase | null): Mutation {
    return make('upsert', TABLE.comments, taskId, { phase })
  }

  function deleteTask(taskId: string): Mutation {
    return make('delete', TABLE.comments, taskId)
  }

  /**
   * setTaskAssignee hands a task to somebody, or back to everybody (FR-7.5)
   * — `setPacker`'s counterpart, and like it the client's to choose; the
   * server turns it into the FR-6.2 delegation notification. Since FR-7.7 it
   * reaches both kinds of task: a preparation can be somebody's job too.
   */
  function setTaskAssignee(taskId: string, userId: string | null): Mutation {
    return make('upsert', TABLE.comments, taskId, { assignee_user_id: userId })
  }

  // --- Task tag mutations (FR-7.8) ---

  /**
   * Create a task tag. Its own table, not the inventory's: a task is filed
   * by what it is *about*, an item by what it *is*, and the two never share
   * a picker.
   */
  function createTaskTag(
    name: string,
    sortOrder: number = 0,
    icon: string | null = null,
  ): { mutation: Mutation; id: string } {
    const id = newId()
    const fields = icon ? { name, sort_order: sortOrder, icon } : { name, sort_order: sortOrder }
    return { mutation: make('insert', TABLE.taskTags, id, fields), id }
  }

  /**
   * FR-7.8: the one tag a task carries. `null` takes it off, which is a
   * state and not a gap — the task then reads under the group named after
   * where it came from.
   *
   * One field, because that is the only thing that changes: the task keeps
   * its words, its phase, its assignee and the day it was written.
   */
  function setTaskTag(taskId: string, taskTagId: string | null): Mutation {
    return make('upsert', TABLE.comments, taskId, { task_tag_id: taskTagId })
  }

  /**
   * FR-7.11: the day a task is due, `YYYY-MM-DD`, or `null` for none. One
   * field, like the tag: a date set on one device and a tag on another
   * both stand (NFR-4.2a).
   */
  function setTaskDueDate(taskId: string, dueDate: string | null): Mutation {
    return make('upsert', TABLE.comments, taskId, { due_date: dueDate })
  }

  /**
   * FR-7.17: where the task stands inside its group, by hand (ADR-083). One
   * field, so a move on one device and a retag on another both stand.
   */
  function placeTask(taskId: string, position: number): Mutation {
    return make('upsert', TABLE.comments, taskId, { position })
  }

  /**
   * FR-7.14: a task's words, corrected. One field, and no `edited_at`: that
   * stamp is a note's (FR-7.13), where it says the words are no longer the
   * ones its author was first read saying. A task is shared work, not a
   * signed entry, so any member may reword it — the server's author rule
   * reaches notes only.
   */
  function setTaskBody(taskId: string, body: string): Mutation {
    return make('upsert', TABLE.comments, taskId, { body })
  }

  return {
    addTask,
    resolveTask,
    reopenTask,
    setTaskPhase,
    deleteTask,
    setTaskAssignee,
    createTaskTag,
    setTaskTag,
    setTaskDueDate,
    placeTask,
    setTaskBody,
  }
}
