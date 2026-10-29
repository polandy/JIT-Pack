/**
 * FR-29.21 — a day-plan entry's preparation steps, as the packing side answers
 * for them: trip tasks naming the entry and a lead.
 */
import { describe, expect, it, vi } from 'vitest'

import { createEntryPreparations } from '../entryPreparations'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations/context'
import type { OwnTask } from '@/types/domain'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'

function task(id: string, fields: Partial<OwnTask> = {}): OwnTask {
  return {
    id,
    trip_id: 't',
    author_id: 'u',
    body: `Schritt ${id}`,
    task_state: 'open',
    task_tag_id: null,
    phase: null,
    due_date: null,
    created_at: null,
    assignee_user_id: null,
    resolved_at: null,
    resolved_by_user_id: null,
    idea_id: null,
    day_entry_id: 'entry-1',
    anchor_kind: 'entry',
    anchor_lead_days: 1,
    ...fields,
  }
}

function harness(tasks: OwnTask[]) {
  const writes = {
    addOwnTask: vi.fn((..._args: unknown[]) => 'new'),
    setTaskBody: vi.fn(),
    setTaskLead: vi.fn(),
    setTaskDueDate: vi.fn(),
    setTaskEntryLead: vi.fn(),
    resolveOwnTask: vi.fn(),
    reopenOwnTask: vi.fn(),
    deleteOwnTask: vi.fn(),
  }
  const preparations = createEntryPreparations(
    { getOwnTasks: () => tasks, tripList: [{ id: 't', start_date: '2026-07-14' }] },
    writes,
  )
  return { preparations, writes }
}

describe('createEntryPreparations (FR-29.21)', () => {
  const tasks = [
    task('eve', { anchor_lead_days: 1 }),
    task('week', { anchor_lead_days: 7, task_state: 'resolved' }),
    task('plain', { day_entry_id: null, anchor_kind: null, anchor_lead_days: null }),
    task('fixed', { anchor_kind: null, anchor_lead_days: null, due_date: '2026-07-10' }),
    task('other', { day_entry_id: 'entry-2', anchor_lead_days: 3 }),
    task('ideas', { day_entry_id: null, idea_id: 'idea-1', anchor_kind: 'idea' }),
  ]

  it('lists the entry’s steps, longest lead first — nothing of another entry or an idea', () => {
    const { preparations } = harness(tasks)
    expect(preparations.steps('t', 'entry-1')).toEqual([
      { id: 'week', title: 'Schritt week', leadDays: 7, dueDate: null, done: true },
      { id: 'eve', title: 'Schritt eve', leadDays: 1, dueDate: null, done: false },
      { id: 'fixed', title: 'Schritt fixed', leadDays: null, dueDate: '2026-07-10', done: false },
    ])
  })

  it('writes a step naming the entry and the lead, in the phase its due day falls in', () => {
    const { preparations, writes } = harness(tasks)
    preparations.add('t', 'entry-1', 'Tisch reservieren', 7, '2026-07-11')
    expect(writes.addOwnTask).toHaveBeenCalledWith(
      't',
      CLIENT_ACTOR_PLACEHOLDER,
      'Tisch reservieren',
      TASK_PHASE_BEFORE,
      { dayEntryId: 'entry-1', anchor: { kind: 'entry', leadDays: 7 } },
    )
    preparations.add('t', 'entry-1', 'Anrufen', 1, '2026-07-17')
    expect(writes.addOwnTask.mock.calls[1]![3]).toBe(TASK_PHASE_DURING)
  })

  it('edits only what changed, and nothing for a step it does not hold', () => {
    const { preparations, writes } = harness(tasks)
    preparations.edit('t', 'eve', 'Schritt eve', 3, '2026-07-15')
    expect(writes.setTaskBody).not.toHaveBeenCalled()
    expect(writes.setTaskLead).toHaveBeenCalledTimes(1)
    preparations.edit('t', 'plain', 'x', 3, '2026-07-15')
    expect(writes.setTaskLead).toHaveBeenCalledTimes(1)
  })

  it('writes a step on a day of its own with that day and no anchor (FR-29.21)', () => {
    const { preparations, writes } = harness(tasks)
    preparations.add('t', 'entry-1', 'Anrufen', null, '2026-07-12')
    expect(writes.addOwnTask.mock.calls[0]![4]).toEqual({
      dayEntryId: 'entry-1',
      dueDate: '2026-07-12',
    })
  })

  it('moves a step between a lead and a day of its own, and edits a fixed day (FR-29.21)', () => {
    const { preparations, writes } = harness(tasks)
    preparations.edit('t', 'eve', 'Schritt eve', null, '2026-07-12')
    expect(writes.setTaskDueDate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'eve' }),
      '2026-07-12',
    )
    preparations.edit('t', 'fixed', 'Schritt fixed', 5, '2026-07-13')
    expect(writes.setTaskEntryLead).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fixed' }),
      5,
    )
    preparations.edit('t', 'fixed', 'Schritt fixed', null, '2026-07-10')
    expect(writes.setTaskDueDate).toHaveBeenCalledTimes(1)
  })

  it('ticks an open step off and a done one back on', () => {
    const { preparations, writes } = harness(tasks)
    preparations.toggle('t', 'eve')
    preparations.toggle('t', 'week')
    expect(writes.resolveOwnTask).toHaveBeenCalledTimes(1)
    expect(writes.reopenOwnTask).toHaveBeenCalledTimes(1)
  })

  it('removeAll deletes the entry’s steps and no other task', () => {
    const { preparations, writes } = harness(tasks)
    preparations.removeAll('t', 'entry-1')
    expect(writes.deleteOwnTask.mock.calls.map(([step]) => (step as OwnTask).id).sort()).toEqual([
      'eve',
      'fixed',
      'week',
    ])
  })
})
