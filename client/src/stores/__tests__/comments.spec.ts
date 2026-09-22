/**
 * Comments & tickets (FR-7.1/7.2): plain comments are their own layer,
 * flagging one as task promotes it into the existing task/todo
 * machinery (FR-7.3 supersedes hard completion-blocking with the
 * "packed with open prep" state).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { createMutations } from '@/sync/mutations'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { HLCGenerator } from '@/sync/hlc'
import { useTripStore } from '@/stores/tripStore'
import type { PullChange } from '@/api/types'
import { installHarness } from '@/__tests__/harness'

function commentChange(id: string, row: Record<string, unknown>): PullChange {
  return {
    seq: 0,
    table: 'comments',
    id,
    deleted: false,
    row: { trip_id: 't1', trip_item_id: 'ti1', author_id: 'u1', body: 'Ventil prüfen', ...row },
  }
}

describe('tripStore comments (FR-7.1)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('routes plain comments and tasks to separate collections', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(commentChange('c1', { is_task: 0 }))
    tripStore.applyChange(commentChange('c2', { is_task: 1, task_state: 'open' }))

    expect(tripStore.getItemComments('t1', 'ti1').map((c) => c.id)).toEqual(['c1'])
    expect(tripStore.getItemTodos('t1', 'ti1').map((t) => t.id)).toEqual(['c2'])
  })

  it('keeps trip-level comments (null trip_item_id) retrievable', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(commentChange('c1', { trip_item_id: null, is_task: 0 }))

    expect(tripStore.getTripComments('t1')).toHaveLength(1)
    expect(tripStore.getItemComments('t1', 'ti1')).toHaveLength(0)
  })

  it('flagging as task moves the row between collections (FR-7.2)', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(commentChange('c1', { is_task: 0 }))

    tripStore.applyChange(commentChange('c1', { is_task: 1, task_state: 'open' }))
    expect(tripStore.getItemComments('t1', 'ti1')).toHaveLength(0)
    expect(tripStore.getItemTodos('t1', 'ti1')).toHaveLength(1)

    tripStore.applyChange(commentChange('c1', { is_task: 0 }))
    expect(tripStore.getItemComments('t1', 'ti1')).toHaveLength(1)
    expect(tripStore.getItemTodos('t1', 'ti1')).toHaveLength(0)
  })

  it('deletion removes the comment wherever it lives', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(commentChange('c1', { is_task: 0 }))
    tripStore.applyChange({ seq: 0, table: 'comments', id: 'c1', deleted: true, row: null })

    expect(tripStore.getItemComments('t1', 'ti1')).toHaveLength(0)
  })

  /**
   * FR-7.9: a deleted note takes its own ticks with it, mirroring the
   * server's `note_acks.comment_id ON DELETE CASCADE` — a client that
   * missed this would keep a tick for a note the list no longer shows.
   */
  it('deleting a note removes its note_acks rows too', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(
      commentChange('note-1', { trip_item_id: null, is_task: 0, author_id: 'u2' }),
    )
    tripStore.applyChange({
      seq: 0,
      table: 'note_acks',
      id: 'ack-1',
      deleted: false,
      row: { trip_id: 't1', comment_id: 'note-1', user_id: 'u1', acked: 1 },
    })
    expect(tripStore.getNoteAcks('t1')).toHaveLength(1)

    tripStore.applyChange({ seq: 0, table: 'comments', id: 'note-1', deleted: true, row: null })

    expect(tripStore.getNoteAcks('t1')).toHaveLength(0)
  })

  /** A tick on a comment that is not the deleted one survives it. */
  it('leaves another note’s ticks alone', () => {
    const tripStore = useTripStore()
    tripStore.applyChange(
      commentChange('note-1', { trip_item_id: null, is_task: 0, author_id: 'u2' }),
    )
    tripStore.applyChange(
      commentChange('note-2', { trip_item_id: null, is_task: 0, author_id: 'u2' }),
    )
    tripStore.applyChange({
      seq: 0,
      table: 'note_acks',
      id: 'ack-2',
      deleted: false,
      row: { trip_id: 't1', comment_id: 'note-2', user_id: 'u1', acked: 1 },
    })

    tripStore.applyChange({ seq: 0, table: 'comments', id: 'note-1', deleted: true, row: null })

    expect(tripStore.getNoteAcks('t1').map((a) => a.id)).toEqual(['ack-2'])
  })
})

describe('comment mutations', () => {
  const mutations = createMutations(new HLCGenerator(() => Date.now(), 'aabbccdd'))

  it('addComment builds a plain comment insert', () => {
    const { mutation } = mutations.addComment('t1', 'ti1', 'u1', 'Ventil prüfen')

    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('comments')
    expect(mutation.fields).toMatchObject({
      trip_id: 't1',
      trip_item_id: 'ti1',
      author_id: 'u1',
      body: 'Ventil prüfen',
      is_task: 0,
    })
  })

  it('flagCommentAsTask promotes with an open task state', () => {
    const mutation = mutations.flagCommentAsTask('c1')

    expect(mutation.op).toBe('upsert')
    expect(mutation.fields).toMatchObject({ is_task: 1, task_state: 'open' })
  })

  /** FR-7.9: the first tick is an insert — its own row, ADR-073. */
  it('tickNote builds a note_acks insert', () => {
    const { mutation, id } = mutations.tickNote('t1', 'note-1', 'u1')

    expect(mutation.op).toBe('insert')
    expect(mutation.table).toBe('note_acks')
    expect(mutation.id).toBe(id)
    expect(mutation.fields).toMatchObject({
      trip_id: 't1',
      comment_id: 'note-1',
      user_id: 'u1',
      acked: 1,
    })
  })

  /** Un-ticking flips the field back rather than deleting the row (NFR-4.2a). */
  it('setNoteAcked builds an upsert of the one field', () => {
    const mutation = mutations.setNoteAcked('ack-1', false)

    expect(mutation.op).toBe('upsert')
    expect(mutation.table).toBe('note_acks')
    expect(mutation.id).toBe('ack-1')
    expect(mutation.fields).toEqual({ acked: 0 })
  })
})

describe('orchestrator comment actions', () => {
  beforeEach(() => {
    installHarness().mockDrain()
  })

  it('addComment applies optimistically; flag as task moves it to todos', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    const id = orch.addComment('t1', 'ti1', 'u1', 'Ventil prüfen')
    expect(tripStore.getItemComments('t1', 'ti1')).toHaveLength(1)

    orch.flagCommentAsTask('t1', tripStore.getItemComments('t1', 'ti1')[0]!)
    expect(tripStore.getItemComments('t1', 'ti1')).toHaveLength(0)
    const todos = tripStore.getItemTodos('t1', 'ti1')
    expect(todos).toHaveLength(1)
    expect(todos[0]).toMatchObject({ id, body: 'Ventil prüfen', task_state: 'open' })
  })

  /**
   * FR-7.9: `toggleNoteTick` picks insert vs. upsert from what the caller
   * hands it — the first tap has no existing row (`null`), the second one
   * does, and flips it. This is the seam both M25 and M1 call through.
   */
  it('toggleNoteTick inserts the first tick and flips the existing row after', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const tripStore = useTripStore()

    orch.toggleNoteTick('t1', 'note-1', 'u1', null)
    const acks = tripStore.getNoteAcks('t1')
    expect(acks).toHaveLength(1)
    expect(acks[0]).toMatchObject({ comment_id: 'note-1', user_id: 'u1', acked: true })

    orch.toggleNoteTick('t1', 'note-1', 'u1', acks[0]!)
    const flipped = tripStore.getNoteAcks('t1')
    expect(flipped).toHaveLength(1)
    expect(flipped[0]).toMatchObject({ id: acks[0]!.id, acked: false })
  })
})
