/**
 * The comment/task group runs on a context, not on the orchestrator (R-4).
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
import {
  makeSeamContext,
  pullIn,
  type Recorded,
  paintedRow,
  type SeamContext,
  SEAM_TODAY,
} from './seamContext'
import { TABLE } from '@/api/tables'
import type { ItemComment, PrepTask, OwnTask } from '@/types/domain'

const TRIP_ID = 'trip-1'
const AUTHOR = 'user-a'

let queued: Recorded[]
let ctx: SeamContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

/** A plain comment on a packing row, pulled in, ready to be made a task (FR-7.2). */
function promotable(): ItemComment {
  pullIn(ctx.tripStore, TABLE.comments, 'cm-1', {
    trip_id: TRIP_ID,
    trip_item_id: 'ti-1',
    author_id: AUTHOR,
    body: 'Akku?',
    is_task: 0,
  })
  return ctx.tripStore.getItemComments(TRIP_ID, 'ti-1')[0] as ItemComment
}

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

  it('addPrepTask writes a comment row that is already a task (FR-7.3)', () => {
    createCommentActions(ctx).addPrepTask(TRIP_ID, 'ti-1', AUTHOR, 'Akku laden')

    expect(queued[0]!.muts[0]!.mutation.table).toBe(TABLE.comments)
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      body: 'Akku laden',
      is_task: 1,
      task_state: 'open',
    })
  })

  it('resolvePrepTask keeps the row a task while it changes its state', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'td-1', {
      trip_id: TRIP_ID,
      trip_item_id: 'ti-1',
      author_id: AUTHOR,
      body: 'Akku laden',
      is_task: 1,
      task_state: 'open',
    })
    const prepTask = ctx.tripStore.getRowPrepTasks(TRIP_ID, 'ti-1')[0] as PrepTask

    createCommentActions(ctx).resolvePrepTask(prepTask)

    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ task_state: 'resolved' })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      is_task: 1,
      body: 'Akku laden',
    })
  })

  // --- FR-7.4: the same row with no anchor ---

  it('addOwnTask writes a task on the trip itself and files it as the trip’s', () => {
    const id = createCommentActions(ctx).addOwnTask(TRIP_ID, AUTHOR, 'Pflanzen giessen')

    expect(queued[0]!.type).toBe('trip')
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      trip_id: TRIP_ID,
      trip_item_id: null,
      is_task: 1,
      task_state: 'open',
    })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID).map((t) => t.id)).toEqual([id])
    expect(ctx.tripStore.getPrepTasks(TRIP_ID)).toEqual([])
  })

  it('addOwnTask puts a task typed by hand past every task of the trip (FR-7.17)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pass',
      is_task: 1,
      task_state: 'open',
      position: 4,
    })
    createCommentActions(ctx).addOwnTask(TRIP_ID, AUTHOR, 'Visum')
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
    const ownTask = ctx.tripStore.getOwnTasks(TRIP_ID)[0]!
    createCommentActions(ctx).placeTask(ownTask, 2)
    expect(queued.at(-1)!.muts[0]!.mutation.fields).toEqual({ position: 2 })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!.position).toBe(2)
  })

  it('resolveOwnTask keeps the anchor null, so the row stays the trip’s', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pflanzen giessen',
      is_task: 1,
      task_state: 'open',
    })
    const ownTask = ctx.tripStore.getOwnTasks(TRIP_ID)[0] as OwnTask

    createCommentActions(ctx).resolveOwnTask(ownTask)

    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      trip_item_id: null,
      is_task: 1,
      task_state: 'resolved',
    })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID).map((t) => t.task_state)).toEqual(['resolved'])

    createCommentActions(ctx).reopenOwnTask(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!)
    expect(ctx.tripStore.getOwnTasks(TRIP_ID).map((t) => t.task_state)).toEqual(['open'])
  })

  it('deleteOwnTask queues a tombstone and the task leaves the list', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pflanzen giessen',
      is_task: 1,
      task_state: 'open',
    })

    createCommentActions(ctx).deleteOwnTask(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!)

    expect(queued[0]!.muts[0]!.mutation).toMatchObject({ op: 'delete', id: 'tt-1' })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID)).toEqual([])
  })

  it('assignOwnTask writes the assignment alone, and the task stays the trip’s (FR-7.5)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Pflanzen giessen',
      is_task: 1,
      task_state: 'open',
    })

    createCommentActions(ctx).assignOwnTask(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, 'user-b')

    // Only the one field travels: a body or a state riding along would
    // overwrite whatever another device wrote to them (ADR-022).
    const { mutation } = queued[0]!.muts[0]!
    expect(mutation).toMatchObject({ op: 'upsert', id: 'tt-1' })
    expect(mutation.fields).toEqual({ assignee_user_id: 'user-b' })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({ trip_item_id: null, is_task: 1 })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID).map((t) => t.assignee_user_id)).toEqual(['user-b'])

    createCommentActions(ctx).assignOwnTask(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, null)
    expect(ctx.tripStore.getOwnTasks(TRIP_ID).map((t) => t.assignee_user_id)).toEqual([null])
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

    createCommentActions(ctx).setTaskTag(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, 'tt-apo')

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
    expect(ctx.tripStore.getOwnTasks(TRIP_ID).map((t) => t.task_tag_id)).toEqual(['tt-apo'])

    createCommentActions(ctx).setTaskTag(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, null)
    expect(ctx.tripStore.getOwnTasks(TRIP_ID).map((t) => t.task_tag_id)).toEqual([null])
  })

  it('setTaskDueDate writes the day and clears any lead, and takes it off again (FR-7.11)', () => {
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
    actions.setTaskDueDate(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, '2026-07-09')

    const { mutation } = queued[0]!.muts[0]!
    expect(mutation).toMatchObject({ op: 'upsert', id: 'tt-1' })
    // A date set here and a tag set on another device both stand; the lead
    // clears alongside it (FR-13.4, ADR-106).
    expect(mutation.fields).toEqual({
      due_date: '2026-07-09',
      anchor_kind: null,
      anchor_lead_days: null,
    })
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      body: 'Pass holen',
      phase: 'before',
      task_tag_id: 'tt-amt',
      due_date: '2026-07-09',
    })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!.due_date).toBe('2026-07-09')

    actions.setTaskDueDate(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, null)
    expect(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!.due_date).toBeNull()
  })

  it('setTaskDueTime writes the time alone; taking the day off takes the time and lead with it (FR-7.18)', () => {
    pullIn(ctx.tripStore, TABLE.comments, 'tt-1', {
      trip_id: TRIP_ID,
      trip_item_id: null,
      author_id: AUTHOR,
      body: 'Tierarzt',
      is_task: 1,
      task_state: 'open',
      due_date: '2026-07-09',
    })

    const actions = createCommentActions(ctx)
    actions.setTaskDueTime(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, '14:00')
    // One field: a time set here and a day moved on another device both stand.
    expect(queued[0]!.muts[0]!.mutation.fields).toEqual({ due_time: '14:00' })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!.due_time).toBe('14:00')

    actions.setTaskDueDate(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, '2026-07-10')
    expect(queued[1]!.muts[0]!.mutation.fields).toEqual({
      due_date: '2026-07-10',
      anchor_kind: null,
      anchor_lead_days: null,
    })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!.due_time).toBe('14:00')

    actions.setTaskDueDate(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!, null)
    expect(queued[2]!.muts[0]!.mutation.fields).toEqual({
      due_date: null,
      due_time: null,
      anchor_kind: null,
      anchor_lead_days: null,
    })
    expect(ctx.tripStore.getOwnTasks(TRIP_ID)[0]!.due_time).toBeNull()
  })

  /*
   * FR-7.12, FR-7.14: once the trip is under way *before the trip* takes
   * nothing new. Every writer of a new task — M5's preparation, a composer, a
   * comment promoted to a task — lands in *during* instead, whatever it asked
   * for, on each of the three facts alone. SEAM_TODAY is 2026-06-01.
   */
  const ahead = { status: 'planning', start_date: '2026-06-10', packing_closed_at: null }
  describe.each([
    [
      'once the packing is finished (FR-7.12)',
      { ...ahead, packing_closed_at: '2026-05-30T06:00:00Z' },
    ],
    ['once the trip is started ahead of its date (FR-7.14)', { ...ahead, status: 'active' }],
    [
      'once its first day has come, the packing open (FR-7.14)',
      { ...ahead, start_date: SEAM_TODAY },
    ],
  ])('%s', (_name, standing) => {
    beforeEach(() => {
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026, ...standing })
    })

    it('writes a new trip task for the road', () => {
      createCommentActions(ctx).addOwnTask(TRIP_ID, AUTHOR, 'Post holen', 'before')
      expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ phase: 'during' })
    })

    it('writes a new preparation for the road', () => {
      createCommentActions(ctx).addPrepTask(TRIP_ID, 'ti-1', AUTHOR, 'Akku laden')
      expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ phase: 'during' })
    })

    it('files a comment promoted to a task for the road', () => {
      createCommentActions(ctx).flagCommentAsTask(TRIP_ID, promotable())
      expect(queued[0]!.muts[0]!.mutation.fields).toEqual({
        is_task: 1,
        task_state: 'open',
        phase: 'during',
      })
    })

    it('leaves a task already asked for the road alone', () => {
      createCommentActions(ctx).addOwnTask(TRIP_ID, AUTHOR, 'Karte kaufen', 'during')
      expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ phase: 'during' })
    })
  })

  describe('while the trip is still ahead (FR-7.14)', () => {
    beforeEach(() => {
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, { name: 'Samedan', year: 2026, ...ahead })
    })

    it('writes a new trip task and a preparation for before, as asked', () => {
      const actions = createCommentActions(ctx)
      actions.addOwnTask(TRIP_ID, AUTHOR, 'Post holen', 'before')
      actions.addPrepTask(TRIP_ID, 'ti-1', AUTHOR, 'Akku laden')
      expect(queued.map((q) => q.muts[0]!.mutation.fields!.phase)).toEqual(['before', 'before'])
    })

    it('files a comment promoted to a task without a phase, so it reads as before', () => {
      createCommentActions(ctx).flagCommentAsTask(TRIP_ID, promotable())
      expect(queued[0]!.muts[0]!.mutation.fields).toEqual({ is_task: 1, task_state: 'open' })
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

    createCommentActions(ctx).setTaskTag(ctx.tripStore.getPrepTasks(TRIP_ID)[0]!, 'tt-apo')

    // The anchor survives: a preparation that lost its trip_item_id would
    // leave the packing row it belongs to and become the trip's own chore.
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      trip_item_id: 'ti-1',
      is_task: 1,
      task_tag_id: 'tt-apo',
    })
    expect(ctx.tripStore.getPrepTasks(TRIP_ID).map((t) => t.task_tag_id)).toEqual(['tt-apo'])
  })
})
