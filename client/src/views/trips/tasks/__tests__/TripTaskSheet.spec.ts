// @vitest-environment jsdom
/**
 * The task's own sheet: FR-7.11's date, FR-7.12's closed phase, and
 * FR-7.14's order — the words edited in place, *Erledigt* first, the day as
 * chips.
 *
 * The sheet decides nothing — it reports. What is pinned is what it reports:
 * a picked day as the day, the picker's clear as „no date", and the same day
 * again as nothing at all; and that the move back into a *before* the finished
 * packing has closed is not offered.
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TripTask } from '@/domain/tripTasks'
import { shortDueDay } from '@/lib/taskDueText'
import TripTaskSheet from '../TripTaskSheet.vue'

/** When the server's daily reminder runs as the sheet reads it; null is Local Mode. */
const daily = vi.hoisted(() => ({ value: '06:00' as string | null }))
vi.mock('@/composables/shared/reminderTime', async () => {
  const { ref } = await import('vue')
  return { useDailyReminder: () => ref(daily.value) }
})
beforeEach(() => {
  daily.value = '06:00'
})

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
    due_time: null,
    ...over,
  }
}

const DateFieldStub = {
  name: 'DateField',
  props: ['label', 'value', 'testid'],
  emits: ['update'],
  template: '<div :data-testid="testid" :data-value="value" />',
}

const TimeFieldStub = {
  name: 'TimeField',
  props: ['modelValue'],
  emits: ['settle', 'update:modelValue'],
  template: '<input :value="modelValue" />',
}

const TODAY = '2026-07-08'

function mountSheet(props: Record<string, unknown>) {
  return mount(TripTaskSheet, {
    props: { task: task(), nameOf: () => null, today: TODAY, ...props },
    global: { stubs: { DateField: DateFieldStub, TimeField: TimeFieldStub } },
  })
}

describe('TripTaskSheet — an idea’s preparation step (FR-29.21)', () => {
  it('states the day its idea sets instead of offering one to pick', () => {
    const sheet = mountSheet({
      task: task({ idea_id: 'idea-1', lead_days: 7, due_date: '2026-07-12' }),
    })
    expect(sheet.findComponent(DateFieldStub).exists()).toBe(false)
    const lead = sheet.find('[data-testid="task-sheet-lead"]')
    expect(lead.text()).toBe(`${shortDueDay('2026-07-12')} · 7 days before the idea, moves with it`)
  })
})

describe('TripTaskSheet — the day a task is due (FR-7.11)', () => {
  it('shows the day it has, and reports a picked one as the day', async () => {
    const sheet = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    const field = sheet.findComponent(DateFieldStub)
    expect(field.props('value')).toBe('2026-07-09')
    expect(sheet.find('[data-testid="task-sheet-due-current"]').exists()).toBe(true)

    field.vm.$emit('update', '2026-07-12')
    expect(sheet.emitted('due')).toEqual([['2026-07-12']])
  })

  it('reports the calendar’s clear as no date, and the same day as nothing', () => {
    const sheet = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    const field = sheet.findComponent(DateFieldStub)
    field.vm.$emit('update', '2026-07-09')
    expect(sheet.emitted('due')).toBeUndefined()

    field.vm.$emit('update', '')
    expect(sheet.emitted('due')).toEqual([[null]])
  })

  it('sets a day with one tap on a quick chip, and takes it off with one on the day (FR-7.14)', async () => {
    const sheet = mountSheet({ task: task() })
    await sheet.find('[data-testid="due-chip-tomorrow"]').trigger('click')
    expect(sheet.emitted('due')).toEqual([['2026-07-09']])

    const dated = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    await dated.find('[data-testid="task-sheet-due-current"]').trigger('click')
    expect(dated.emitted('due')).toEqual([[null]])
  })

  it('offers the eve of departure for a task before the trip (FR-7.14)', () => {
    const sheet = mountSheet({ task: task(), tripStart: '2026-07-20' })
    expect(sheet.find('[data-testid="due-chip-beforeDeparture"]').exists()).toBe(true)
    const road = mountSheet({ task: task({ phase: 'during' }), tripStart: '2026-07-20' })
    expect(road.find('[data-testid="due-chip-beforeDeparture"]').exists()).toBe(false)
  })

  it('offers no date on a finished task', () => {
    const sheet = mountSheet({ task: task({ task_state: 'resolved', due_date: '2026-07-09' }) })
    expect(sheet.findComponent(DateFieldStub).exists()).toBe(false)
  })
})

describe('TripTaskSheet — the time its reminder arrives (FR-7.18)', () => {
  const TIME = '[data-testid="task-sheet-due-time"]'

  it('offers a time only once a day stands', () => {
    expect(mountSheet({ task: task() }).find(TIME).exists()).toBe(false)
    const dated = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    expect(dated.find(TIME).text()).toBe('Time…')
    expect(dated.findComponent(TimeFieldStub).exists()).toBe(false)
  })

  it('opens the clock in the row, and reports a settled time', async () => {
    const sheet = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    await sheet.find(TIME).trigger('click')
    const field = sheet.findComponent(TimeFieldStub)
    expect(field.exists()).toBe(true)

    field.vm.$emit('settle', '14:00')
    expect(sheet.emitted('dueTime')).toEqual([['14:00']])
  })

  it('reports nothing for a field left empty or past the clock, and closes it', async () => {
    const sheet = mountSheet({ task: task({ due_date: '2026-07-09' }) })
    await sheet.find(TIME).trigger('click')
    sheet.findComponent(TimeFieldStub).vm.$emit('settle', '')
    await sheet.vm.$nextTick()
    expect(sheet.findComponent(TimeFieldStub).exists()).toBe(false)

    await sheet.find(TIME).trigger('click')
    sheet.findComponent(TimeFieldStub).vm.$emit('settle', '27:90')
    expect(sheet.emitted('dueTime')).toBeUndefined()
  })

  it('shows the time it has as its chip, and takes it off with one tap', async () => {
    const sheet = mountSheet({ task: task({ due_date: '2026-07-09', due_time: '14:00' }) })
    expect(sheet.find(TIME).text()).toBe('14:00')
    await sheet.find(TIME).trigger('click')
    expect(sheet.emitted('dueTime')).toEqual([[null]])
  })

  it('says which reminders will come: the day before at the daily time, and on the day at its own', () => {
    const HINT = '[data-testid="task-sheet-reminder-hint"]'
    expect(mountSheet({ task: task() }).find(HINT).exists()).toBe(false)
    expect(
      mountSheet({ task: task({ due_date: '2026-07-09' }) })
        .find(HINT)
        .text(),
    ).toBe('Reminded the day before and on the day, at 06:00.')
    expect(
      mountSheet({ task: task({ due_date: '2026-07-09', due_time: '14:00' }) })
        .find(HINT)
        .text(),
    ).toBe('Reminded the day before at 06:00 and on the day at 14:00.')
  })

  it('says, without a server, that nothing will remind — the time stays on the task', () => {
    const HINT = '[data-testid="task-sheet-reminder-hint"]'
    daily.value = null
    const local = (over: Partial<TripTask>) =>
      mountSheet({ task: task({ due_date: '2026-07-09', ...over }) })
    expect(local({}).find(HINT).text()).toBe(
      'Without a server the app does not remind; the day stays on the task.',
    )
    expect(local({ due_time: '14:00' }).find(HINT).text()).toBe(
      'Without a server the app does not remind; the time stays on the task.',
    )
  })

  it('offers no time on a preparation step, whose day its idea sets', () => {
    const sheet = mountSheet({
      task: task({ idea_id: 'idea-1', lead_days: 7, due_date: '2026-07-12' }),
    })
    expect(sheet.find(TIME).exists()).toBe(false)
  })
})

describe('TripTaskSheet — ordered by how often each act is wanted (FR-7.14)', () => {
  it('leads with Erledigt on an open task, and Wieder öffnen on a finished one', async () => {
    const sheet = mountSheet({ task: task() })
    await sheet.find('[data-testid="task-sheet-done"]').trigger('click')
    expect(sheet.emitted('toggle')).toHaveLength(1)

    const done = mountSheet({ task: task({ task_state: 'resolved' }) })
    expect(done.find('[data-testid="task-sheet-done"]').exists()).toBe(false)
    await done.find('[data-testid="task-sheet-reopen"]').trigger('click')
    expect(done.emitted('toggle')).toHaveLength(1)
  })

  it('reports corrected words when the field is left, and nothing for the same or no words', async () => {
    const sheet = mountSheet({ task: task() })
    const field = sheet.findComponent({ name: 'IonTextarea' })
    const leave = async (words: string) => {
      field.vm.$emit('update:modelValue', words)
      await sheet.vm.$nextTick()
      field.vm.$emit('ionBlur', new CustomEvent('ionBlur'))
    }
    await leave('Pass holen')
    await leave('   ')
    expect(sheet.emitted('rename')).toBeUndefined()
    await leave('  Pass verlängern ')
    expect(sheet.emitted('rename')).toEqual([['Pass verlängern']])
  })

  it('reads a task left in a closed before as history: no tick, no edit, no day', () => {
    const sheet = mountSheet({ task: task({ phase: 'before' }), beforeLocked: true })
    expect(sheet.find('[data-testid="task-sheet-done"]').exists()).toBe(false)
    expect(sheet.find('[data-testid="task-sheet-title-input"]').exists()).toBe(false)
    expect(sheet.find('[data-testid="task-sheet-title"]').text()).toBe('Pass holen')
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

describe('TripTaskSheet — a trip under way (FR-7.14)', () => {
  it('offers no move into before, and the task stays workable', () => {
    const sheet = mountSheet({ task: task({ phase: 'during' }), beforeOver: true })
    expect(sheet.find('[data-testid="task-sheet-move"]').exists()).toBe(false)
    expect(sheet.find('[data-testid="task-sheet-done"]').exists()).toBe(true)
  })

  it('keeps a task already in before workable, and its move to the road', () => {
    const sheet = mountSheet({ task: task({ phase: 'before' }), beforeOver: true })
    expect(sheet.find('[data-testid="task-sheet-move"]').exists()).toBe(true)
    expect(sheet.find('[data-testid="task-sheet-done"]').exists()).toBe(true)
  })
})
