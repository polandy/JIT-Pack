/**
 * The client's mirror of the server's delete cascade.
 *
 * The edges are declared once, as each table's spec's `cascadeParents`, and held
 * here to `schema.sql`'s `ON DELETE CASCADE` references; everything else is
 * derived. The mirror is what a delete hands to `write` as its paint, and in
 * Local Mode that list is the only thing that ever removes a key from the
 * device.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { cascadeChanges, cascadeOf } from '../cascade'
import { ALL_ROW_SPECS } from '@/__tests__/rowSpecs'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { plannerFeatureStore, usePlannerStore } from '@/planner/store'
import { TABLE, type SyncTable } from '@/api/tables'
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

const names = (table: SyncTable, id: string) =>
  cascadeOf(table, id, stores.tripStore, stores.masterStore).map((c) => `${c.table}/${c.id}`)

/** `child.column → parent` for every `ON DELETE CASCADE` reference in `schema.sql`. */
function schemaCascades(): string[] {
  const schema = readFileSync(resolve(__dirname, '../../../../internal/store/schema.sql'), 'utf8')
  const edges: string[] = []
  let table = ''
  for (const line of schema.split('\n')) {
    const create = /^CREATE TABLE (?:IF NOT EXISTS )?(\w+)/.exec(line)
    if (create) table = create[1]!
    const ref = /^\s*(\w+)\s.*REFERENCES (\w+)\(id\)\s+ON DELETE CASCADE/.exec(line)
    if (ref) edges.push(`${table}.${ref[1]} → ${ref[2]}`)
  }
  return edges
}

describe('the cascade edges', () => {
  it('are exactly schema.sql’s ON DELETE CASCADE references between synced tables', () => {
    const synced = new Set<string>(Object.keys(ALL_ROW_SPECS))
    const fromSchema = schemaCascades().filter((edge) => {
      const [child, parent] = edge.split(' → ') as [string, string]
      return synced.has(child.split('.')[0]!) && synced.has(parent)
    })
    const declared = Object.entries(ALL_ROW_SPECS).flatMap(([table, spec]) =>
      (spec.cascadeParents ?? []).map((parent) => `${table}.${parent.column} → ${parent.table}`),
    )

    // A positive signal that the parse read the schema at all.
    expect(fromSchema).toContain('comments.trip_item_id → trip_items')
    expect(declared.sort()).toEqual(fromSchema.sort())
  })

  it('name a column the parsed row keeps under the same name — what the walk reads', () => {
    for (const [table, spec] of Object.entries(ALL_ROW_SPECS)) {
      for (const parent of spec.cascadeParents ?? []) {
        const parsed = spec.parse('row-1', { [parent.column]: 'parent-1' }) as unknown as Record<
          string,
          unknown
        >
        expect(parsed[parent.column], `${table}.${parent.column}`).toBe('parent-1')
      }
    }
  })
})

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

  it("takes a template's positions, their tasks, its trip tasks, its includes on both sides and its trip sources", () => {
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
      row(TABLE.templateTasks, 'trip-task1', { template_id: 'tpl1', task: 'Pflanzen giessen' }),
      row(TABLE.templateTasks, 'trip-task2', { template_id: 'grp1', task: 'Gas prüfen' }),
      row(TABLE.templateIncludes, 'inc1', { template_id: 'tpl1', included_template_id: 'grp1' }),
    ])
    stores.tripStore.applyChanges([
      row(TABLE.tripTemplateSources, 'src1', { trip_id: 't1', template_id: 'tpl1' }),
      row(TABLE.tripTemplateSources, 'src2', { trip_id: 't1', template_id: 'grp1' }),
    ])

    expect(names(TABLE.templates, 'tpl1').sort()).toEqual([
      'template_includes/inc1',
      'template_item_tasks/task1',
      'template_items/pos1',
      'template_tasks/trip-task1', // FR-7.4
      'trip_template_sources/src1',
    ])
    // The include vanishes from the *other* side too.
    expect(names(TABLE.templates, 'grp1').sort()).toEqual([
      'template_includes/inc1',
      'template_tasks/trip-task2',
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

  it("takes a series' destination profile and its checklist, the checklist first", () => {
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

  // SQLite follows a cascade as far as it reaches; the mirror has to as well,
  // or the replies and ticks of a removed row's notes stay on a Local device.
  it("follows a trip item's notes on to their replies and every tick, leaf-first (FR-7.9, FR-7.13)", () => {
    stores.tripStore.applyChanges([
      row(TABLE.comments, 'note', { trip_id: 't1', trip_item_id: 'ti1', body: 'Kratzer' }),
      row(TABLE.comments, 'reply', { trip_id: 't1', parent_id: 'note', body: 'Gesehen' }),
      row(TABLE.noteAcks, 'ack-note', { trip_id: 't1', comment_id: 'note', user_id: 'u1' }),
      row(TABLE.noteAcks, 'ack-reply', { trip_id: 't1', comment_id: 'reply', user_id: 'u2' }),
    ])

    const taken = names(TABLE.tripItems, 'ti1')

    expect([...taken].sort()).toEqual([
      'comments/note',
      'comments/reply',
      'note_acks/ack-note',
      'note_acks/ack-reply',
    ])
    const at = (name: string) => taken.indexOf(name)
    expect(at('note_acks/ack-reply')).toBeLessThan(at('comments/reply'))
    expect(at('comments/reply')).toBeLessThan(at('comments/note'))
    expect(at('note_acks/ack-note')).toBeLessThan(at('comments/note'))
  })

  it('names a row reached along two edges once, before both its parents', () => {
    stores.tripStore.applyChanges([
      row(TABLE.excursions, 'ex1', { trip_id: 't1', title: 'Gipfel' }),
      row(TABLE.travelers, 'trav1', { trip_id: 't1', name: 'Ada' }),
      row(TABLE.excursionTravelers, 'et1', {
        trip_id: 't1',
        excursion_id: 'ex1',
        traveler_id: 'trav1',
      }),
    ])

    const taken = names(TABLE.trips, 't1')

    expect(taken.filter((name) => name === 'excursion_travelers/et1')).toHaveLength(1)
    expect(taken.indexOf('excursion_travelers/et1')).toBeLessThan(taken.indexOf('excursions/ex1'))
    expect(taken.indexOf('excursion_travelers/et1')).toBeLessThan(taken.indexOf('travelers/trav1'))
  })

  it('cascades nothing for a row nothing hangs off', () => {
    expect(names(TABLE.itemTags, 'a1')).toEqual([])
    expect(names(TABLE.containers, 'c1')).toEqual([])
    expect(names(TABLE.travelers, 'trav1')).toEqual([])
  })

  it("takes a traveller's place on a feature module's rows with them (FR-29.15)", () => {
    const planner = usePlannerStore()
    planner.applyChanges([
      row(TABLE.dayEntryTravelers, 'det1', {
        trip_id: 't1',
        day_entry_id: 'de1',
        traveler_id: 'trav1',
      }),
      row(TABLE.dayEntryTravelers, 'det2', {
        trip_id: 't1',
        day_entry_id: 'de1',
        traveler_id: 'trav2',
      }),
    ])

    const taken = cascadeOf(
      TABLE.travelers,
      'trav1',
      stores.tripStore,
      stores.masterStore,
      plannerFeatureStore(planner),
    )

    expect(taken).toEqual([{ table: TABLE.dayEntryTravelers, id: 'det1' }])
  })

  it("follows a module's edges as its store declares them, the kernel naming none (ADR-066 amendment 2)", () => {
    const planner = usePlannerStore()
    planner.applyChanges([
      row(TABLE.ideas, 'idea1', { trip_id: 't1', title: 'Klettersteig' }),
      row(TABLE.ideaVotes, 'v1', { trip_id: 't1', idea_id: 'idea1', user_id: 'u1', vote: 'up' }),
    ])
    const sinks = plannerFeatureStore(planner).sinks
    const edgeless = {
      sinks: Object.fromEntries(
        Object.entries(sinks).map(([table, sink]) => [
          table,
          { ...sink!, spec: { parse: () => ({}) } },
        ]),
      ),
    }

    expect(cascadeOf(TABLE.ideas, 'idea1', plannerFeatureStore(planner))).toEqual([
      { table: TABLE.ideaVotes, id: 'v1' },
    ])
    // The same rows under specs without edges: nothing outside the store says the vote goes along.
    expect(cascadeOf(TABLE.ideas, 'idea1', edgeless)).toEqual([])
  })

  it('produces tombstones, never rows', () => {
    stores.masterStore.applyChanges([
      row(TABLE.tags, 'g1', { name: 'Foto' }),
      row(TABLE.itemTags, 'a1', { item_id: 'i1', tag_id: 'g1', position: 0 }),
    ])

    expect(cascadeChanges(TABLE.tags, 'g1', stores.masterStore)).toEqual([
      { seq: 0, table: TABLE.itemTags, id: 'a1', deleted: true, row: null },
    ])
  })
})
