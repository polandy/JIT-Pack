import { describe, expect, it } from 'vitest'

import type { ActivityEntry, ActivityOp } from '@/api/types'
import { classifyActivity, readActivity } from '@/domain/activity'
import { TABLE } from '@/api/tables'
import { plannerActivityReaders } from '../activity'

function entry(
  table: string,
  op: ActivityOp,
  changes: Record<string, [unknown, unknown]> = {},
): ActivityEntry {
  return {
    id: 1,
    entity_table: table,
    entity_id: 'r-1',
    op,
    label: 'Seilpark',
    changes,
    actor_user_id: 'u-andy',
    created_at: '2026-10-01T10:00:00Z',
  }
}

describe('the planner reads its own rows in the activity log (FR-32.2)', () => {
  const cases: [string, ActivityEntry, string | null][] = [
    ['a vote cast', entry(TABLE.ideaVotes, 'insert', { vote: [null, 'up'] }), 'voted'],
    ['a vote changed', entry(TABLE.ideaVotes, 'update', { vote: ['up', 'down'] }), 'voted'],
    ['a vote taken back', entry(TABLE.ideaVotes, 'update', { vote: ['up', null] }), 'unvoted'],
    ['a vote row without a vote is no act', entry(TABLE.ideaVotes, 'insert'), null],
    ['a vote row removed', entry(TABLE.ideaVotes, 'delete', { vote: ['up', null] }), 'removed'],
    ['an idea added', entry(TABLE.ideas, 'insert', { title: [null, 'Seilpark'] }), 'added'],
    ['an idea renamed', entry(TABLE.ideas, 'update', { title: ['A', 'B'] }), 'changed'],
  ]
  it.each(cases)('%s', (_name, e, want) => {
    expect(classifyActivity(e, plannerActivityReaders)).toBe(want)
  })

  it('files every planner row under ideas', () => {
    const lines = readActivity(
      [TABLE.ideas, TABLE.ideaComments, TABLE.ideaImages, TABLE.ideaVotes].map((t) =>
        entry(t, 'insert', { vote: [null, 'up'] }),
      ),
      new Set(),
      { readers: plannerActivityReaders },
    )
    expect(lines.map((l) => l.area)).toEqual(['ideas', 'ideas', 'ideas', 'ideas'])
  })

  it('files an entry of the day plan, and whom it is for, under the day plan (FR-29.15)', () => {
    const lines = readActivity(
      [
        entry(TABLE.dayEntries, 'insert', { title: [null, 'Tisch reserviert'] }),
        entry(TABLE.dayEntryTravelers, 'insert', { traveler_id: [null, 'tr-sia'] }),
      ],
      new Set(),
      { readers: plannerActivityReaders },
    )
    expect(lines.map((l) => [l.area, l.kind])).toEqual([
      ['dayplan', 'added'],
      ['dayplan', 'added'],
    ])
  })
})
