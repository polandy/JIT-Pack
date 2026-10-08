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

  it('addComment opens a thread about an excursion, and a reply names none (FR-7.15)', () => {
    const acts = createCommentActions(ctx)
    acts.addComment(TRIP_ID, null, AUTHOR, 'Treffpunkt 7 Uhr', { excursionId: 'ex-hut' })
    acts.addComment(TRIP_ID, null, AUTHOR, 'Danke', { parentId: 'n-1', excursionId: 'ex-hut' })

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ excursion_id: 'ex-hut' })
    expect(queued[1]!.muts[0]!.mutation.fields).not.toHaveProperty('excursion_id')
  })

  it('setNoteExcursion writes the link alone — no edit stamp, the words did not change (FR-7.15)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'n-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Treffpunkt 7 Uhr',
      is_task: 0,
      title: 'Hütte',
    })
    const acts = createCommentActions(ctx)

    acts.setNoteExcursion(ctx.tripStore.getTripComments(TRIP_ID)[0]!, 'ex-hut')

    const { mutation } = queued[0]!.muts[0]!
    expect(mutation).toMatchObject({ op: 'upsert', id: 'n-1' })
    expect(mutation.fields).toEqual({ excursion_id: 'ex-hut' })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      body: 'Treffpunkt 7 Uhr',
      title: 'Hütte',
    })
    expect(ctx.tripStore.getTripComments(TRIP_ID)[0]!.excursion_id).toBe('ex-hut')

    acts.setNoteExcursion(ctx.tripStore.getTripComments(TRIP_ID)[0]!, null)
    expect(queued[1]!.muts[0]!.mutation.fields).toEqual({ excursion_id: null })
    expect(ctx.tripStore.getTripComments(TRIP_ID)[0]!.excursion_id).toBeNull()
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
    pullIn(ctx.tripStore, TABLE.comments, 'cm-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Ladekabel fehlt',
    })

    createCommentActions(ctx).deleteComment('cm-1')

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

    createCommentActions(ctx).resolvePrepTodo(todo)

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

  it('addTripTodo puts a task typed by hand past every task of the trip (FR-7.17)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pass',
      is_task: 1,
      task_state: 'open',
      position: 4,
    })
    createCommentActions(ctx).addTripTodo(TRIP_ID, AUTHOR, 'Visum')
    expect(queued.at(-1)!.muts[0]!.mutation.fields).toMatchObject({ body: 'Visum', position: 5 })
  })

  it('placeTask writes the place alone (FR-7.17)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pass',
      is_task: 1,
      task_state: 'open',
    })
    const todo = ctx.tripStore.getTripTodos(TRIP_ID)[0]!
    createCommentActions(ctx).placeTask(todo, 2)
    expect(queued.at(-1)!.muts[0]!.mutation.fields).toEqual({ position: 2 })
    expect(ctx.tripStore.getTripTodos(TRIP_ID)[0]!.position).toBe(2)
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

  it('setTaskTag writes the tag alone, and takes it off again (FR-7.8)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Salbe holen',
      is_task: 1,
      task_state: 'open',
      phase: 'before',
    })

    createCommentActions(ctx).setTaskTag(ctx.tripStore.getTripTodos(TRIP_ID)[0]!, 'tt-apo')

    const { mutation } = queued[0]!.muts[0]!
    expect(mutation).toMatchObject({ op: 'upsert', id: 'tt-1' })
    // The one field, for the same reason as the assignment above: the phase
    // beside it is written by its own act, and a tag riding along with it
    // would overwrite whatever another device meanwhile decided (ADR-022).
    expect(mutation.fields).toEqual({ task_tag_id: 'tt-apo' })
    // The row the screen shows while the push is in flight is the whole row,
    // not the one field — a task that lost its words on the way to a group
    // would be a task nobody recognises when it lands there.
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      trip_item_id: null,
      is_task: 1,
      body: 'Salbe holen',
      phase: 'before',
      task_tag_id: 'tt-apo',
    })
    expect(ctx.tripStore.getTripTodos(TRIP_ID).map((t) => t.task_tag_id)).toEqual(['tt-apo'])

    createCommentActions(ctx).setTaskTag(ctx.tripStore.getTripTodos(TRIP_ID)[0]!, null)
    expect(ctx.tripStore.getTripTodos(TRIP_ID).map((t) => t.task_tag_id)).toEqual([null])
  })

  it('setTaskDueDate writes the day alone, and takes it off again (FR-7.11)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pass holen',
      is_task: 1,
      task_state: 'open',
      phase: 'before',
      task_tag_id: 'tt-amt',
    })

    const actions = createCommentActions(ctx)
    actions.setTaskDueDate(ctx.tripStore.getTripTodos(TRIP_ID)[0]!, '2026-07-09')

    const { mutation } = queued[0]!.muts[0]!
    expect(mutation).toMatchObject({ op: 'upsert', id: 'tt-1' })
    // One field: a date set here and a tag set on another device both stand.
    expect(mutation.fields).toEqual({ due_date: '2026-07-09' })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      body: 'Pass holen',
      phase: 'before',
      task_tag_id: 'tt-amt',
      due_date: '2026-07-09',
    })
    expect(ctx.tripStore.getTripTodos(TRIP_ID)[0]!.due_date).toBe('2026-07-09')

    actions.setTaskDueDate(ctx.tripStore.getTripTodos(TRIP_ID)[0]!, null)
    expect(ctx.tripStore.getTripTodos(TRIP_ID)[0]!.due_date).toBeNull()
  })

  /*
   * FR-7.12: once the packing is finished *before the trip* takes nothing
   * new. Every writer of a new task — M5's preparation, a composer, a comment
   * promoted to a task — lands in *during* instead, whatever it asked for.
   */
  describe('once the packing is finished (FR-7.12)', () => {
    beforeEach(() => {
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
        name: 'Samedan',
        year: 2026,
        packing_closed_at: '2026-07-08T06:00:00Z',
      })
    })

    it('writes a new trip task for the road', () => {
      createCommentActions(ctx).addTripTodo(TRIP_ID, AUTHOR, 'Post holen', 'before')
      expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ phase: 'during' })
    })

    it('writes a new preparation for the road', () => {
      createCommentActions(ctx).addPrepTodo(TRIP_ID, 'ti-1', AUTHOR, 'Akku laden')
      expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ phase: 'during' })
    })

    it('files a comment promoted to a task for the road', () => {
      pullIn(ctx.tripStore, TABLE.comments, 'cm-1', {
        trip_id: TRIP_ID,
        trip_item_id: 'ti-1',
        author_id: AUTHOR,
        body: 'Akku?',
        is_task: 0,
      })
      const comment = ctx.tripStore.getItemComments(TRIP_ID, 'ti-1')[0] as ItemComment
      createCommentActions(ctx).flagCommentAsTask(TRIP_ID, comment)
      expect(queued[0]!.muts[0]!.mutation.fields).toEqual({
        is_task: 1,
        task_state: 'open',
        phase: 'during',
      })
    })

    it('leaves a task already asked for the road alone', () => {
      createCommentActions(ctx).addTripTodo(TRIP_ID, AUTHOR, 'Karte kaufen', 'during')
      expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ phase: 'during' })
    })
  })

  it('setTaskTag reaches a preparation through its own row shape (FR-7.8)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'td-1', {
      trip_id: TRIP_ID,
      trip_item_id: 'ti-1',
      author_id: AUTHOR,
      body: 'Akku laden',
      is_task: 1,
      task_state: 'open',
    })

    createCommentActions(ctx).setTaskTag(ctx.tripStore.getTodos(TRIP_ID)[0]!, 'tt-apo')

    // The anchor survives: a preparation that lost its trip_item_id would
    // leave the packing row it belongs to and become the trip's own chore.
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      trip_item_id: 'ti-1',
      is_task: 1,
      task_tag_id: 'tt-apo',
    })
    expect(ctx.tripStore.getTodos(TRIP_ID).map((t) => t.task_tag_id)).toEqual(['tt-apo'])
  })
})
