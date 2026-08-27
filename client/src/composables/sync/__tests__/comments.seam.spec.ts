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
import { makeSeamContext, pullIn, type Recorded } from './seamContext'
import type { SyncContext } from '../context'
import { TABLE } from '@/types/tables'
import type { ItemComment, ItemTodo } from '@/types/domain'

const TRIP_ID = 'trip-1'
const AUTHOR = 'user-a'

let queued: Recorded[]
let ctx: SyncContext

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

    expect(queued[0]!.muts[0]!.optimistic!.row).toMatchObject({
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
    expect(queued[0]!.muts[0]!.optimistic!.row).toMatchObject({
      is_task: 1,
      body: 'Akku laden',
    })
  })
})
