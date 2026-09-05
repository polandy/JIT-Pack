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
    const store = useTripStore()
    store.applyChange(commentChange('c1', { is_task: 0 }))
    store.applyChange(commentChange('c2', { is_task: 1, task_state: 'open' }))

    expect(store.getItemComments('t1', 'ti1').map((c) => c.id)).toEqual(['c1'])
    expect(store.getItemTodos('t1', 'ti1').map((t) => t.id)).toEqual(['c2'])
  })

  it('keeps trip-level comments (null trip_item_id) retrievable', () => {
    const store = useTripStore()
    store.applyChange(commentChange('c1', { trip_item_id: null, is_task: 0 }))

    expect(store.getTripComments('t1')).toHaveLength(1)
    expect(store.getItemComments('t1', 'ti1')).toHaveLength(0)
  })

  it('flagging as task moves the row between collections (FR-7.2)', () => {
    const store = useTripStore()
    store.applyChange(commentChange('c1', { is_task: 0 }))

    store.applyChange(commentChange('c1', { is_task: 1, task_state: 'open' }))
    expect(store.getItemComments('t1', 'ti1')).toHaveLength(0)
    expect(store.getItemTodos('t1', 'ti1')).toHaveLength(1)

    store.applyChange(commentChange('c1', { is_task: 0 }))
    expect(store.getItemComments('t1', 'ti1')).toHaveLength(1)
    expect(store.getItemTodos('t1', 'ti1')).toHaveLength(0)
  })

  it('deletion removes the comment wherever it lives', () => {
    const store = useTripStore()
    store.applyChange(commentChange('c1', { is_task: 0 }))
    store.applyChange({ seq: 0, table: 'comments', id: 'c1', deleted: true, row: null })

    expect(store.getItemComments('t1', 'ti1')).toHaveLength(0)
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
})

describe('orchestrator comment actions', () => {
  beforeEach(() => {
    installHarness().mockDrain()
  })

  it('addComment applies optimistically; flag as task moves it to todos', () => {
    const orch = useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
    const store = useTripStore()

    const id = orch.addComment('t1', 'ti1', 'u1', 'Ventil prüfen')
    expect(store.getItemComments('t1', 'ti1')).toHaveLength(1)

    orch.flagCommentAsTask('t1', store.getItemComments('t1', 'ti1')[0]!)
    expect(store.getItemComments('t1', 'ti1')).toHaveLength(0)
    const todos = store.getItemTodos('t1', 'ti1')
    expect(todos).toHaveLength(1)
    expect(todos[0]).toMatchObject({ id, body: 'Ventil prüfen', task_state: 'open' })
  })
})
