import { describe, expect, it } from 'vitest'

import type { ActivityEntry, ActivityOp } from '@/api/types'
import type { ActivityReaders } from '@/domain/shared/activityReader'
import { TABLE } from '@/api/tables'
import {
  activityArea,
  classifyActivity,
  groupActivity,
  readActivity,
  type ActivityKind,
} from '../activity'

let nextId = 100

function entry(
  table: string,
  op: ActivityOp,
  changes: Record<string, [unknown, unknown]> = {},
  over: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    id: nextId--,
    entity_table: table,
    entity_id: 'row-1',
    op,
    label: 'Zahnbürste',
    changes,
    actor_user_id: 'u-andy',
    created_at: '2026-09-30T10:00:00Z',
    ...over,
  }
}

const update = (table: string, changes: Record<string, [unknown, unknown]>) =>
  entry(table, 'update', changes)

describe('classifyActivity (FR-32.2)', () => {
  const cases: [string, ActivityEntry, ActivityKind | null][] = [
    ['an insert adds', entry(TABLE.tripItems, 'insert', { name: [null, 'X'] }), 'added'],
    ['a delete removes', entry(TABLE.tripItems, 'delete'), 'removed'],
    [
      'a packed state packs',
      update(TABLE.tripItems, { state: ['open', 'packed'], packed_count: [0, 1] }),
      'packed',
    ],
    ['a partial pack packs', update(TABLE.tripItems, { state: ['open', 'partial'] }), 'packed'],
    ['back to open unpacks', update(TABLE.tripItems, { state: ['packed', 'open'] }), 'unpacked'],
    ['skipped is skipped', update(TABLE.tripItems, { state: ['open', 'skipped'] }), 'skipped'],
    [
      'a claim alone is no act (G-3)',
      update(TABLE.tripItems, { state: ['open', 'packing_now'], packing_now_by: [null, 'u'] }),
      null,
    ],
    [
      'releasing a claim is no act',
      update(TABLE.tripItems, { state: ['packing_now', 'open'] }),
      null,
    ],
    [
      'packing a claimed row packs',
      update(TABLE.tripItems, { state: ['packing_now', 'packed'] }),
      'packed',
    ],
    [
      'a row bought from a list',
      update(TABLE.tripItems, { bought_from: [null, 'buy_before'] }),
      'bought',
    ],
    [
      'a purchase taken back',
      update(TABLE.tripItems, { bought_from: ['buy_before', null] }),
      'unbought',
    ],
    [
      'an excursion line bought',
      update(TABLE.excursionItems, { bought_at: [null, '2026-09-30'] }),
      'bought',
    ],
    ['a task resolved', update(TABLE.comments, { task_state: ['open', 'resolved'] }), 'done'],
    ['a task reopened', update(TABLE.comments, { task_state: ['resolved', 'open'] }), 'reopened'],
    ['a note ticked', entry(TABLE.noteAcks, 'insert', { acked: [null, 1] }), 'read'],
    ['a note un-ticked', update(TABLE.noteAcks, { acked: [1, 0] }), 'unread'],
    ['a row moved by hand', update(TABLE.shoppingEntries, { position: [1, 3] }), 'reordered'],
    [
      'an item hidden (FR-24.3)',
      update(TABLE.items, { retired_at: [null, '2026-09-30'] }),
      'retired',
    ],
    ['an item shown again', update(TABLE.items, { retired_at: ['2026-09-30', null] }), 'restored'],
    ['a rename changes', update(TABLE.tripItems, { name: ['A', 'B'] }), 'changed'],
    ['generation bookkeeping is no act', entry(TABLE.tripGeneratedPositions, 'insert'), null],
  ]
  it.each(cases)('%s', (_name, e, want) => {
    expect(classifyActivity(e)).toBe(want)
  })
})

describe("a feature module's reader (FR-32.2)", () => {
  const readers: ActivityReaders = {
    [TABLE.shoppingEntries]: {
      area: 'shopping',
      classify: (e) => (e.changes?.['bought'] ? 'bought' : undefined),
    },
  }

  it('is asked first, for its own table only', () => {
    const bought = update(TABLE.shoppingEntries, { bought: [0, 1] })
    expect(classifyActivity(bought, readers)).toBe('bought')
    expect(classifyActivity(update(TABLE.tripItems, { bought: [0, 1] }), readers)).toBe('changed')
  })

  it('leaves what it does not decide to the shared reading', () => {
    const moved = update(TABLE.shoppingEntries, { position: [1, 3] })
    expect(classifyActivity(moved, readers)).toBe('reordered')
  })

  it('names the area its table belongs to', () => {
    const [line] = readActivity([entry(TABLE.shoppingEntries, 'insert')], new Set(), { readers })
    expect(line!.area).toBe('shopping')
  })
})

describe('activityArea', () => {
  it('files a purchase off the packing list under shopping', () => {
    expect(activityArea(update(TABLE.tripItems, {}), 'bought')).toBe('shopping')
  })

  it('tells a task from a note by what the entry says, then by what the trip holds', () => {
    const created = entry(TABLE.comments, 'insert', { is_task: [null, 1] })
    expect(activityArea(created, 'added')).toBe('tasks')
    const deleted = entry(TABLE.comments, 'delete', { is_task: [1, null] })
    expect(activityArea(deleted, 'removed')).toBe('tasks')
    const edited = update(TABLE.comments, { body: ['a', 'b'] })
    expect(activityArea(edited, 'changed')).toBe('notes')
    expect(activityArea(edited, 'changed', { isTask: () => true })).toBe('tasks')
  })
})

describe('readActivity', () => {
  it('names only the fields a reader can read, never the stamped records', () => {
    const shown = new Set(['quantity', 'name'])
    const [line] = readActivity(
      [update(TABLE.tripItems, { quantity: [1, 2], container_id: ['c1', 'c2'] })],
      shown,
    )
    expect(line!.details).toEqual([{ field: 'quantity', before: 1, after: 2 }])
  })

  it('leaves the bookkeeping out', () => {
    const lines = readActivity(
      [
        entry(TABLE.tripGeneratedPositions, 'insert'),
        entry(TABLE.tripItems, 'insert', { name: [null, 'X'] }),
      ],
      new Set(),
    )
    expect(lines.map((l) => l.kind)).toEqual(['added'])
  })
})

describe('groupActivity (FR-32.2)', () => {
  const dayOf = (iso: string) => iso.slice(0, 10)
  const packed = (over: Partial<ActivityEntry> = {}) =>
    entry(TABLE.tripItems, 'update', { state: ['open', 'packed'] }, over)

  it('folds one person packing several things into one group', () => {
    const days = groupActivity(readActivity([packed(), packed(), packed()], new Set()), dayOf)
    expect(days).toHaveLength(1)
    expect(days[0]!.groups).toHaveLength(1)
    expect(days[0]!.groups[0]!.lines).toHaveLength(3)
  })

  it('keeps a run somebody else interrupted apart', () => {
    const days = groupActivity(
      readActivity([packed(), packed({ actor_user_id: 'u-stella' }), packed()], new Set()),
      dayOf,
    )
    expect(days[0]!.groups.map((g) => g.actor)).toEqual(['u-andy', 'u-stella', 'u-andy'])
  })

  it('starts a new day, and a new group in it', () => {
    const days = groupActivity(
      readActivity([packed(), packed({ created_at: '2026-09-29T18:00:00Z' })], new Set()),
      dayOf,
    )
    expect(days.map((d) => d.day)).toEqual(['2026-09-30', '2026-09-29'])
  })

  it('does not fold two changes that each say what they changed', () => {
    const shown = new Set(['quantity'])
    const days = groupActivity(
      readActivity(
        [
          update(TABLE.tripItems, { quantity: [1, 2] }),
          update(TABLE.tripItems, { quantity: [3, 4] }),
        ],
        shown,
      ),
      dayOf,
    )
    expect(days[0]!.groups).toHaveLength(2)
  })
})
