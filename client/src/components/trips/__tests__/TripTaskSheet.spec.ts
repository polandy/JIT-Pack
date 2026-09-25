// @vitest-environment jsdom
/**
 * The task's own sheet: FR-7.11's date and FR-7.12's closed phase.
 *
 * The sheet decides nothing — it reports. What is pinned is what it reports:
 * a picked day as the day, the picker's clear as „no date", and the same day
 * again as nothing at all; and that the move back into a *before* the finished
 * packing has closed is not offered.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { TripTask } from '@/domain/tripTodos'
import TripTaskSheet from '../TripTaskSheet.vue'

function task(over: Partial<TripTask> = {}): TripTask {
  return {
    id: 't1',
    body: 'Pass holen',
    task_state: 'open',
    item: null,
    assignee_user_id: null,
    phase: 'before',
    author_id: 'u-andy',
    created_at: null,
    resolved_at: null,
    resolved_by_user_id: null,
    task_tag_id: null,
    due_date: null,
    ...over,
  }
}

const DateFieldStub = {
  name: 'DateField',
  props: ['label', 'value', 'testid'],
  emits: ['update'],
  template: '<div :data-testid="testid" :data-value="value" />',
}

function mountSheet(props: Record<string, unknown>) {
  return mount(TripTaskSheet, {
    props: { task: task(), nameOf: () => null, ...props },
    global: { stubs: { DateField: DateFieldStub } },
  })
}

describe('TripTaskSheet — the day a task is due (FR-7.11)', () => {
  it('shows the day it has, and reports a new one as the day', async () => {
    const sheet = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    const field = sheet.findComponent(DateFieldStub)
    expect(field.props('value')).toBe('2026-07-09')

    field.vm.$emit('update', '2026-07-12')
    expect(sheet.emitted('due')).toEqual([['2026-07-12']])
  })

  it('reports the picker’s clear as no date, and the same day as nothing', () => {
    const sheet = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    const field = sheet.findComponent(DateFieldStub)
    field.vm.$emit('update', '2026-07-09')
    expect(sheet.emitted('due')).toBeUndefined()

    field.vm.$emit('update', '')
    expect(sheet.emitted('due')).toEqual([[null]])
  })

  it('offers no date on a finished task', () => {
    const sheet = mountSheet({ task: task({ task_state: 'resolved', due_date: '2026-07-09' }) })
    expect(sheet.findComponent(DateFieldStub).exists()).toBe(false)
  })
})

describe('TripTaskSheet — a closed *before* (FR-7.12)', () => {
  it('offers no move back into it', () => {
    const sheet = mountSheet({ task: task({ phase: 'during' }), beforeLocked: true })
    expect(sheet.find('[data-testid="task-sheet-move"]').exists()).toBe(false)
  })

  it('still offers the move out of it', () => {
    const sheet = mountSheet({ task: task({ phase: 'before' }), beforeLocked: true })
    expect(sheet.find('[data-testid="task-sheet-move"]').exists()).toBe(true)
  })

  it('offers both directions while the packing is open', () => {
    const sheet = mountSheet({ task: task({ phase: 'during' }) })
    expect(sheet.find('[data-testid="task-sheet-move"]').exists()).toBe(true)
  })
})
