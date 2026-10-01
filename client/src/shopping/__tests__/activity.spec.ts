import { describe, expect, it } from 'vitest'

import type { ActivityEntry, ActivityOp } from '@/api/types'
import { classifyActivity } from '@/domain/activity'
import { TABLE } from '@/types/tables'
import { shoppingActivityReaders } from '../activity'

function entry(op: ActivityOp, changes: Record<string, [unknown, unknown]>): ActivityEntry {
  return {
    id: 1,
    entity_table: TABLE.shoppingEntries,
    entity_id: 'e-1',
    op,
    label: 'Brot',
    changes,
    actor_user_id: 'u-andy',
    created_at: '2026-10-01T10:00:00Z',
  }
}

describe('the shopping list reads its own entries in the activity log (FR-32.2)', () => {
  const cases: [string, ActivityEntry, string][] = [
    ['an entry bought', entry('update', { bought: [0, true] }), 'bought'],
    ['an entry un-bought', entry('update', { bought: [1, false] }), 'unbought'],
    ['an entry added', entry('insert', { name: [null, 'Brot'], bought: [null, 0] }), 'added'],
    ['an entry moved by hand', entry('update', { position: [1, 3] }), 'reordered'],
    ['an entry renamed', entry('update', { name: ['Brot', 'Zopf'] }), 'changed'],
  ]
  it.each(cases)('%s', (_name, e, want) => {
    expect(classifyActivity(e, shoppingActivityReaders)).toBe(want)
  })
})
