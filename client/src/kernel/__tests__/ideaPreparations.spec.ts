/**
 * FR-29.21 — an idea's preparation steps, as the packing side answers for
 * them: trip tasks naming the idea and a lead, written with the phase their
 * due day falls in.
 */
import { describe, expect, it, vi } from 'vitest'

import { createIdeaPreparations } from '../ideaPreparations'
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
    idea_id: 'idea-1',
    anchor_kind: 'idea',
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
  const preparations = createIdeaPreparations(
    {
      getOwnTasks: () => tasks,
      tripList: [{ id: 't', start_date: '2026-11-01' }],
    },
    writes,
  )
  return { preparations, writes }
}

describe('createIdeaPreparations (FR-29.21)', () => {
  const tasks = [
    task('eve', { anchor_lead_days: 1 }),
    task('week', { anchor_lead_days: 7, task_state: 'resolved' }),
    task('made', { anchor_lead_days: null }),
    task('other', { idea_id: 'idea-2', anchor_lead_days: 3 }),
  ]

  it("lists the idea's steps, longest lead first — never a task merely made from it", () => {
    const { preparations } = harness(tasks)
    expect(preparations.steps('t', 'idea-1')).toEqual([
      { id: 'week', title: 'Schritt week', leadDays: 7, done: true },
      { id: 'eve', title: 'Schritt eve', leadDays: 1, done: false },
    ])
  })

  it('writes a step due before the trip into the phase before it', () => {
    const { preparations, writes } = harness(tasks)
    preparations.add('t', 'idea-1', 'Bus reservieren', 7, '2026-10-28')
    expect(writes.addOwnTask).toHaveBeenCalledWith(
      't',
      CLIENT_ACTOR_PLACEHOLDER,
      'Bus reservieren',
      TASK_PHASE_BEFORE,
      { ideaId: 'idea-1', anchor: { kind: 'idea', leadDays: 7 } },
    )
  })

  it("writes a step due on one of the trip's days into the phase for the road", () => {
    const { preparations, writes } = harness(tasks)
    preparations.add('t', 'idea-1', 'Anrufen', 1, '2026-11-03')
    expect(writes.addOwnTask.mock.calls[0]![3]).toBe(TASK_PHASE_DURING)
  })

  it('writes a step that waits on an unplanned idea into the phase before the trip', () => {
    const { preparations, writes } = harness(tasks)
    preparations.add('t', 'idea-1', 'Anrufen', 3, null)
    expect(writes.addOwnTask.mock.calls[0]![3]).toBe(TASK_PHASE_BEFORE)
  })

  it('edits only the field that changed', () => {
    const { preparations, writes } = harness(tasks)
    preparations.edit('t', 'eve', 'Schritt eve', 3)
    expect(writes.setTaskBody).not.toHaveBeenCalled()
    expect(writes.setTaskLead).toHaveBeenCalledWith(tasks[0], 3)
    preparations.edit('t', 'eve', 'Neu', 1)
    expect(writes.setTaskBody).toHaveBeenCalledWith(tasks[0], 'Neu')
  })

  it('ticks an open step off and a done one back on', () => {
    const { preparations, writes } = harness(tasks)
    preparations.toggle('t', 'eve')
    preparations.toggle('t', 'week')
    expect(writes.resolveOwnTask).toHaveBeenCalledWith(tasks[0])
    expect(writes.reopenOwnTask).toHaveBeenCalledWith(tasks[1])
  })

  it('removes one step, and every step of the idea with the idea — nothing else', () => {
    const { preparations, writes } = harness(tasks)
    preparations.remove('t', 'eve')
    expect(writes.deleteOwnTask).toHaveBeenCalledWith(tasks[0])
    writes.deleteOwnTask.mockClear()
    preparations.removeAll('t', 'idea-1')
    expect(writes.deleteOwnTask.mock.calls.map(([t]) => t.id)).toEqual(['eve', 'week'])
  })

  it('does nothing for a step this device does not hold', () => {
    const { preparations, writes } = harness(tasks)
    preparations.edit('t', 'gone', 'x', 1)
    preparations.toggle('t', 'gone')
    preparations.remove('t', 'gone')
    expect(Object.values(writes).every((fn) => fn.mock.calls.length === 0)).toBe(true)
  })
})
