/**
 * The two delete paths agree.
 *
 * A row leaves the client's stores two ways, and until C-3b each carried its
 * own list of what goes with it:
 *
 * - the **optimistic** path — `cascadeOf`, which is also what the outbox and
 *   IndexedDB are handed, so in Local Mode it is the only thing that ever
 *   removes a key from the device (C-3a, PR #332);
 * - the **applied** path — a tombstone arriving in a pull, which each store
 *   handled with its own inline arms inside `applyChange`.
 *
 * The second list was shorter than the first in three places: a deleted
 * master item kept its dependency rows, a deleted template kept its
 * positions' FR-27.7 tasks, and a deleted trip item kept its comments and
 * FR-7.3 todos. The window is real but bounded — the children's own
 * tombstones follow, on the *next* pull page whenever the parent's lands on
 * a page boundary — and no test compared the two paths, which is the point
 * of this file rather than of any one of the three.
 *
 * Each case seeds a parent with children, applies the parent's tombstone,
 * and asserts that nothing `cascadeOf` names is still readable.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { cascadeOf } from '../cascade'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE, type SyncTable } from '@/types/tables'
import type { PullChange } from '@/api/types'

function row(table: string, id: string, fields: Record<string, unknown>): PullChange {
  return { seq: 1, table, id, deleted: false, row: fields }
}
function tombstone(table: string, id: string): PullChange {
  return { seq: 2, table, id, deleted: true, row: null }
}

let stores: {
  tripStore: ReturnType<typeof useTripStore>
  masterStore: ReturnType<typeof useMasterStore>
}

beforeEach(() => {
  setActivePinia(createPinia())
  stores = { tripStore: useTripStore(), masterStore: useMasterStore() }
})

/**
 * Every row of `table` still readable, by id. Reading through the public
 * getters on purpose: a child left in a bucket the screens no longer look
 * at is not the failure — a child a screen still renders is.
 */
function stillThere(table: SyncTable, tripId: string): string[] {
  const { masterStore, tripStore } = stores
  switch (table) {
    case TABLE.itemTags:
      return masterStore.itemTagList.map((a) => a.id)
    case TABLE.itemDependencies:
      return masterStore.dependencyList.map((d) => d.id)
    case TABLE.templateItems:
      return masterStore.templateList.flatMap((t) =>
        masterStore.getTemplateItems(t.id).map((p) => p.id),
      )
    case TABLE.templateItemTasks:
      return masterStore.templateItemTaskList.map((t) => t.id)
    case TABLE.templateIncludes:
      return masterStore.includeList.map((i) => i.id)
    case TABLE.comments:
      return [
        ...tripStore.getComments(tripId).map((c) => c.id),
        ...tripStore.getTodos(tripId).map((t) => t.id),
      ]
    case TABLE.tripItems:
      return tripStore.getItems(tripId).map((i) => i.id)
    default:
      return []
  }
}

const TRIP = 'trip-1'

describe('an applied tombstone removes exactly what the optimistic cascade names', () => {
  it('a deleted master item takes its tag assignments and its dependencies', () => {
    stores.masterStore.applyChanges([
      row(TABLE.items, 'i1', { name: 'Kamera' }),
      row(TABLE.items, 'i2', { name: 'Objektiv' }),
      row(TABLE.itemTags, 'a1', { item_id: 'i1', tag_id: 'g1', position: 0 }),
      row(TABLE.itemDependencies, 'd1', { item_id: 'i1', depends_on_item_id: 'i2', quantity: 1 }),
    ])
    const owed = cascadeOf(TABLE.items, 'i1', stores)
    expect(owed.map((c) => `${c.table}/${c.id}`).sort()).toEqual([
      'item_dependencies/d1',
      'item_tags/a1',
    ])

    stores.masterStore.applyChange(tombstone(TABLE.items, 'i1'))

    for (const child of owed) {
      expect(
        stillThere(child.table, TRIP),
        `${child.table}/${child.id} outlived its item`,
      ).not.toContain(child.id)
    }
    expect(masterIds()).not.toContain('i1')
    // The positive counter-signal: the *other* item's rows are untouched, so
    // the assertions above are about the cascade and not about an empty store.
    expect(stores.masterStore.itemList.map((i) => i.id)).toEqual(['i2'])
  })

  it('a deleted template takes its positions, their tasks and its includes', () => {
    stores.masterStore.applyChanges([
      row(TABLE.templates, 'tpl1', { name: 'Ferien', kind: 'template', owner_id: 'u1' }),
      row(TABLE.templates, 'grp1', { name: 'Makro', kind: 'group', owner_id: 'u1' }),
      row(TABLE.templateItems, 'pos1', { template_id: 'tpl1', item_id: 'i1', quantity: 1 }),
      row(TABLE.templateItems, 'pos2', { template_id: 'grp1', item_id: 'i2', quantity: 1 }),
      row(TABLE.templateItemTasks, 'task1', { template_item_id: 'pos1', task: 'Akku laden' }),
      row(TABLE.templateItemTasks, 'task2', { template_item_id: 'pos2', task: 'Putzen' }),
      row(TABLE.templateIncludes, 'inc1', { template_id: 'tpl1', included_template_id: 'grp1' }),
    ])
    const owed = cascadeOf(TABLE.templates, 'tpl1', stores).filter(
      (c) => c.table !== TABLE.tripTemplateSources,
    )

    stores.masterStore.applyChange(tombstone(TABLE.templates, 'tpl1'))

    for (const child of owed) {
      expect(
        stillThere(child.table, TRIP),
        `${child.table}/${child.id} outlived its template`,
      ).not.toContain(child.id)
    }
    // The other template's position and task are the counter-signal.
    expect(stillThere(TABLE.templateItems, TRIP)).toEqual(['pos2'])
    expect(stillThere(TABLE.templateItemTasks, TRIP)).toEqual(['task2'])
  })

  it('a deleted trip item takes its comments and its FR-7.3 todos', () => {
    stores.tripStore.applyChanges([
      row(TABLE.trips, TRIP, { name: 'Engadin', year: 2026, status: 'active' }),
      row(TABLE.tripItems, 'ti1', { trip_id: TRIP, name: 'Zelt', quantity: 1 }),
      row(TABLE.tripItems, 'ti2', { trip_id: TRIP, name: 'Seil', quantity: 1 }),
      row(TABLE.comments, 'c1', { trip_id: TRIP, trip_item_id: 'ti1', author_id: 'u1', body: 'x' }),
      row(TABLE.comments, 't1', {
        trip_id: TRIP,
        trip_item_id: 'ti1',
        author_id: 'u1',
        body: 'y',
        is_task: 1,
      }),
      row(TABLE.comments, 'c2', { trip_id: TRIP, trip_item_id: 'ti2', author_id: 'u1', body: 'z' }),
    ])
    const owed = cascadeOf(TABLE.tripItems, 'ti1', stores)
    expect(owed.map((c) => c.id).sort()).toEqual(['c1', 't1'])

    stores.tripStore.applyChange(tombstone(TABLE.tripItems, 'ti1'))

    expect(stillThere(TABLE.comments, TRIP).sort()).toEqual(['c2'])
    expect(stillThere(TABLE.tripItems, TRIP)).toEqual(['ti2'])
  })
})

function masterIds(): string[] {
  return stores.masterStore.itemList.map((i) => i.id)
}
