/**
 * The comment/todo group runs on a context, not on the orchestrator (R-4).
 *
 * Asserted rather than assumed: the group is constructed here with a
 * hand-written context — no `fetch`, no WebSocket, no outbox, no
 * orchestrator — and what it puts on the queue is read directly. The facade
 * specs keep covering the same actions through the real orchestrator; this
 * one covers that they are reachable without it.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createCommentActions } from '../actions/comments'
import { makeSeamContext, pullIn, type Recorded, paintedRow, type SeamContext } from './seamContext'
import { TABLE } from '@/types/tables'
import type { ItemComment, ItemTodo, TripTodo } from '@/types/domain'

const TRIP_ID = 'trip-1'
const AUTHOR = 'user-a'

let queued: Recorded[]
let ctx: SeamContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('createCommentActions without an orchestrator', () => {
  it('addComment queues one insert on the trip partition', () => {
    const id = createCommentActions(ctx).addComment(TRIP_ID, 'ti-1', AUTHOR, 'Wo ist das Zelt?')

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('trip')
    expect(queued[0]!.id).toBe(TRIP_ID)
    expect(queued[0]!.muts[0]!.mutation.op).toBe('insert')
    expect(queued[0]!.muts[0]!.mutation.id).toBe(id)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      trip_id: TRIP_ID,
      trip_item_id: 'ti-1',
      author_id: AUTHOR,
      body: 'Wo ist das Zelt?',
    })
  })

  it('flagCommentAsTask paints the whole row, not only is_task (FR-7.2)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'cm-1', {
      trip_id: TRIP_ID,
      trip_item_id: 'ti-1',
      author_id: AUTHOR,
      body: 'Ladekabel fehlt',
      created_at: '2026-08-01T10:00:00Z',
      is_task: 0,
    })
    const comment = ctx.tripStore.getItemComments(TRIP_ID, 'ti-1')[0] as ItemComment

    createCommentActions(ctx).flagCommentAsTask(TRIP_ID, comment)

    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      body: 'Ladekabel fehlt',
      author_id: AUTHOR,
      created_at: '2026-08-01T10:00:00Z',
    })
  })

  it('deleteComment queues a tombstone on the trip partition', () => {
    createCommentActions(ctx).deleteComment(TRIP_ID, 'cm-1')

    expect(queued[0]!.type).toBe('trip')
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('cm-1')
  })

  it('addPrepTodo writes a comment row that is already a task (FR-7.3)', () => {
    createCommentActions(ctx).addPrepTodo(TRIP_ID, 'ti-1', AUTHOR, 'Akku laden')

    expect(queued[0]!.muts[0]!.mutation.table).toBe(TABLE.comments)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      body: 'Akku laden',
      is_task: 1,
      task_state: 'open',
    })
  })

  it('resolvePrepTodo keeps the row a task while it changes its state', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'td-1', {
      trip_id: TRIP_ID,
      trip_item_id: 'ti-1',
      author_id: AUTHOR,
      body: 'Akku laden',
      is_task: 1,
      task_state: 'open',
    })
    const todo = ctx.tripStore.getItemTodos(TRIP_ID, 'ti-1')[0] as ItemTodo

    createCommentActions(ctx).resolvePrepTodo(TRIP_ID, todo)

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ task_state: 'resolved' })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      is_task: 1,
      body: 'Akku laden',
    })
  })

  // --- FR-7.4: the same row with no anchor ---

  it('addTripTodo writes a task on the trip itself and files it as the trip’s', () => {
    const id = createCommentActions(ctx).addTripTodo(TRIP_ID, AUTHOR, 'Pflanzen giessen')

    expect(queued[0]!.type).toBe('trip')
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      trip_id: TRIP_ID,
      trip_item_id: null,
      is_task: 1,
      task_state: 'open',
    })
    expect(ctx.tripStore.getTripTodos(TRIP_ID).map((t) => t.id)).toEqual([id])
    expect(ctx.tripStore.getTodos(TRIP_ID)).toEqual([])
  })

  it('resolveTripTodo keeps the anchor null, so the row stays the trip’s', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pflanzen giessen',
      is_task: 1,
      task_state: 'open',
    })
    const todo = ctx.tripStore.getTripTodos(TRIP_ID)[0] as TripTodo

    createCommentActions(ctx).resolveTripTodo(todo)

    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      trip_item_id: null,
      is_task: 1,
      task_state: 'resolved',
    })
    expect(ctx.tripStore.getTripTodos(TRIP_ID).map((t) => t.task_state)).toEqual(['resolved'])

    createCommentActions(ctx).reopenTripTodo(ctx.tripStore.getTripTodos(TRIP_ID)[0]!)
    expect(ctx.tripStore.getTripTodos(TRIP_ID).map((t) => t.task_state)).toEqual(['open'])
  })

  it('deleteTripTodo queues a tombstone and the todo leaves the list', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pflanzen giessen',
      is_task: 1,
      task_state: 'open',
    })

    createCommentActions(ctx).deleteTripTodo(ctx.tripStore.getTripTodos(TRIP_ID)[0]!)

    expect(queued[0]!.muts[0]!.mutation).toMatchObject({ op: 'delete', id: 'tt-1' })
    expect(ctx.tripStore.getTripTodos(TRIP_ID)).toEqual([])
  })

  it('assignTripTodo writes the assignment alone, and the todo stays the trip’s (FR-7.5)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pflanzen giessen',
      is_task: 1,
      task_state: 'open',
    })

    createCommentActions(ctx).assignTripTodo(ctx.tripStore.getTripTodos(TRIP_ID)[0]!, 'user-b')

    // Only the one field travels: a body or a state riding along would
    // overwrite whatever another device wrote to them (ADR-022).
    const { mutation } = queued[0]!.muts[0]!
    expect(mutation).toMatchObject({ op: 'upsert', id: 'tt-1' })
    expect(mutation.fields).toEqual({ assignee_user_id: 'user-b' })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({ trip_item_id: null, is_task: 1 })
    expect(ctx.tripStore.getTripTodos(TRIP_ID).map((t) => t.assignee_user_id)).toEqual(['user-b'])

    createCommentActions(ctx).assignTripTodo(ctx.tripStore.getTripTodos(TRIP_ID)[0]!, null)
    expect(ctx.tripStore.getTripTodos(TRIP_ID).map((t) => t.assignee_user_id)).toEqual([null])
  })
})
