/**
 * The client's mirror of `cascadeChildren` (`internal/store/master.go`).
 *
 * Each case here is one case of the server's switch. The mirror is what a
 * delete hands to `enqueueAndDrain`, and in Local Mode that list is the only
 * thing that ever removes a key from the device.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { cascadeChanges, cascadeOf } from '../cascade'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import type { PullChange } from '@/api/types'

function row(table: string, id: string, fields: Record<string, unknown>): PullChange {
  return { seq: 1, table, id, deleted: false, row: fields }
}

let stores: {
  tripStore: ReturnType<typeof useTripStore>
  masterStore: ReturnType<typeof useMasterStore>
}

beforeEach(() => {
  setActivePinia(createPinia())
  stores = { tripStore: useTripStore(), masterStore: useMasterStore() }
})

const names = (table: string, id: string) =>
  cascadeOf(table as never, id, stores).map((c) => `${c.table}/${c.id}`)

describe('cascadeOf', () => {
  it("takes an item's tag assignments and its dependencies in both directions", () => {
    stores.masterStore.applyChanges([
      row(TABLE.items, 'i1', { name: 'Kamera' }),
      row(TABLE.items, 'i2', { name: 'Objektiv' }),
      row(TABLE.tags, 'g1', { name: 'Foto' }),
      row(TABLE.itemTags, 'a1', { item_id: 'i1', tag_id: 'g1', position: 0 }),
      row(TABLE.itemTags, 'a2', { item_id: 'i2', tag_id: 'g1', position: 0 }),
      row(TABLE.itemDependencies, 'd1', { item_id: 'i1', depends_on_item_id: 'i2', quantity: 1 }),
      row(TABLE.itemDependencies, 'd2', { item_id: 'i2', depends_on_item_id: 'i1', quantity: 1 }),
    ])

    expect(names(TABLE.items, 'i1').sort()).toEqual([
      'item_dependencies/d1',
      'item_dependencies/d2',
      'item_tags/a1',
    ])
  })

  it('unassigns a deleted tag everywhere (FR-24.1)', () => {
    stores.masterStore.applyChanges([
      row(TABLE.tags, 'g1', { name: 'Foto' }),
      row(TABLE.itemTags, 'a1', { item_id: 'i1', tag_id: 'g1', position: 0 }),
      row(TABLE.itemTags, 'a2', { item_id: 'i2', tag_id: 'g1', position: 0 }),
      row(TABLE.itemTags, 'a3', { item_id: 'i1', tag_id: 'g2', position: 1 }),
    ])

    expect(names(TABLE.tags, 'g1').sort()).toEqual(['item_tags/a1', 'item_tags/a2'])
  })

  it("takes a template's positions, their tasks, its includes on both sides and its trip sources", () => {
    stores.masterStore.applyChanges([
      row(TABLE.templates, 'tpl1', { name: 'Ferien', kind: 'holiday', owner_id: 'u1' }),
      row(TABLE.templates, 'grp1', { name: 'Makro', kind: 'group', owner_id: 'u1' }),
      row(TABLE.templateItems, 'pos1', {
        template_id: 'tpl1',
        item_id: 'i1',
        quantity: 1,
        assignment: 'trip_global',
        dedup: 'max',
        default_mode: 'pack',
        late_packer: 0,
      }),
      row(TABLE.templateItemTasks, 'task1', { template_item_id: 'pos1', task: 'Akku laden' }),
      row(TABLE.templateIncludes, 'inc1', { template_id: 'tpl1', included_template_id: 'grp1' }),
    ])
    stores.tripStore.applyChanges([
      row(TABLE.tripTemplateSources, 'src1', { trip_id: 't1', template_id: 'tpl1' }),
      row(TABLE.tripTemplateSources, 'src2', { trip_id: 't1', template_id: 'grp1' }),
    ])

    expect(names(TABLE.templates, 'tpl1')).toEqual([
      'template_item_tasks/task1',
      'template_items/pos1',
      'template_includes/inc1',
      'trip_template_sources/src1',
    ])
    // The include vanishes from the *other* side too.
    expect(names(TABLE.templates, 'grp1')).toEqual([
      'template_includes/inc1',
      'trip_template_sources/src2',
    ])
  })

  it("takes a position's preparation tasks (FR-27.7)", () => {
    stores.masterStore.applyChanges([
      row(TABLE.templateItemTasks, 'task1', { template_item_id: 'pos1', task: 'Akku laden' }),
      row(TABLE.templateItemTasks, 'task2', { template_item_id: 'pos2', task: 'Waschen' }),
    ])

    expect(names(TABLE.templateItems, 'pos1')).toEqual(['template_item_tasks/task1'])
  })

  it("takes a series' destination profile and its checklist", () => {
    stores.masterStore.applyChanges([
      row(TABLE.tripSeries, 's1', { name: 'Segeln' }),
      row(TABLE.destinationProfiles, 'p1', { series_id: 's1', name: 'Kroatien' }),
      row(TABLE.destinationChecklistItems, 'c1', { profile_id: 'p1', label: 'Pass' }),
    ])

    expect(names(TABLE.tripSeries, 's1')).toEqual([
      'destination_checklist_items/c1',
      'destination_profiles/p1',
    ])
    expect(names(TABLE.destinationProfiles, 'p1')).toEqual(['destination_checklist_items/c1'])
  })

  it("takes a trip item's comments and todos, and leaves the trip-level ones", () => {
    stores.tripStore.applyChanges([
      row(TABLE.comments, 'com1', { trip_id: 't1', trip_item_id: 'ti1', body: 'Kratzer' }),
      row(TABLE.comments, 'todo1', {
        trip_id: 't1',
        trip_item_id: 'ti1',
        body: 'Akku laden',
        is_task: true,
        task_state: 'open',
      }),
      row(TABLE.comments, 'com2', { trip_id: 't1', body: 'Karte mitnehmen' }),
    ])

    expect(names(TABLE.tripItems, 'ti1').sort()).toEqual(['comments/com1', 'comments/todo1'])
  })

  it('cascades nothing for a row nothing hangs off', () => {
    expect(names(TABLE.itemTags, 'a1')).toEqual([])
    expect(names(TABLE.containers, 'c1')).toEqual([])
    expect(names(TABLE.travelers, 'trav1')).toEqual([])
  })

  it('produces tombstones, never rows', () => {
    stores.masterStore.applyChanges([
      row(TABLE.tags, 'g1', { name: 'Foto' }),
      row(TABLE.itemTags, 'a1', { item_id: 'i1', tag_id: 'g1', position: 0 }),
    ])

    expect(cascadeChanges(TABLE.tags, 'g1', stores)).toEqual([
      { seq: 0, table: TABLE.itemTags, id: 'a1', deleted: true, row: null },
    ])
  })
})
