/**
 * FR-27.10 — adding a whole group to a running trip: the same resolution M3
 * performs, deduped against what the trip already carries, and reported.
 */
import { describe, expect, it } from 'vitest'

import { planGroupAddition, type GroupAdditionInput } from '../groupAdd'
import type {
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  Traveler,
  TripItem,
} from '@/types/domain'

function group(id: string, name: string): Template {
  return { id, owner_id: 'user-a', name, kind: 'group' }
}

function masterItem(id: string, name: string): MasterItem {
  return { id, name, weight_grams: 100, value_cents: null }
}

function templateItem(
  id: string,
  templateId: string,
  itemId: string,
  extra: Partial<TemplateItem> = {},
): TemplateItem {
  return {
    id,
    template_id: templateId,
    item_id: itemId,
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
    ...extra,
  }
}

function traveler(id: string, name: string): Traveler {
  return { id, trip_id: 'trip-1', name, linked_user_id: null }
}

function tripItem(id: string, name: string, extra: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: 'trip-1',
    source_item_id: null,
    source_template_id: null,
    name,
    weight_grams: null,
    value_cents: null,
    category_name: null,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
    ...extra,
  }
}

function input(overrides: Partial<GroupAdditionInput> = {}): GroupAdditionInput {
  return {
    templateId: 'grp-macro',
    templates: [group('grp-macro', 'Makro Fotografie')],
    includes: [],
    templateItems: [
      templateItem('ti-1', 'grp-macro', 'item-ring'),
      templateItem('ti-2', 'grp-macro', 'item-tripod'),
    ],
    templateItemTasks: [],
    masterItems: [masterItem('item-ring', 'Ringblitz'), masterItem('item-tripod', 'Stativ')],
    attributes: null,
    duration_days: 7,
    travelers: [traveler('trv-1', 'Andy')],
    items: [],
    ...overrides,
  }
}

describe('planGroupAddition (FR-27.10)', () => {
  it('expands the group onto an empty trip and carries its provenance', () => {
    const plan = planGroupAddition(input())

    expect(plan.add.map((a) => a.generated.name)).toEqual(['Ringblitz', 'Stativ'])
    expect(plan.add.every((a) => a.generated.source_template_id === 'grp-macro')).toBe(true)
    expect(plan.alreadyPresent).toEqual([])
  })

  it('reports a row the trip already carries by master item instead of duplicating it', () => {
    const plan = planGroupAddition(
      input({ items: [tripItem('row-1', 'Stativ', { source_item_id: 'item-tripod' })] }),
    )

    expect(plan.add.map((a) => a.generated.name)).toEqual(['Ringblitz'])
    expect(plan.alreadyPresent).toEqual(['Stativ'])
  })

  it('recognises an ad-hoc row typed by hand, which carries no source item', () => {
    const plan = planGroupAddition(input({ items: [tripItem('row-1', '  stativ ')] }))

    expect(plan.add.map((a) => a.generated.name)).toEqual(['Ringblitz'])
    expect(plan.alreadyPresent).toEqual(['Stativ'])
  })

  it('reports a fully present group as present rather than adding nothing silently', () => {
    const plan = planGroupAddition(
      input({
        items: [
          tripItem('row-1', 'Stativ', { source_item_id: 'item-tripod' }),
          tripItem('row-2', 'Ringblitz', { source_item_id: 'item-ring' }),
        ],
      }),
    )

    expect(plan.add).toEqual([])
    expect(plan.alreadyPresent).toEqual(['Ringblitz', 'Stativ'])
  })

  it('fans a per-person position out over the trip travelers (FR-25.8)', () => {
    const plan = planGroupAddition(
      input({
        templateItems: [
          templateItem('ti-1', 'grp-macro', 'item-ring', { assignment: 'per_person' }),
        ],
        travelers: [traveler('trv-1', 'Andy'), traveler('trv-2', 'Bea')],
      }),
    )

    expect(plan.add.map((a) => a.traveler_id)).toEqual(['trv-1', 'trv-2'])
  })

  it('counts a per-person fan-out as present, so no trip-global third row appears', () => {
    const plan = planGroupAddition(
      input({
        templateItems: [
          templateItem('ti-1', 'grp-macro', 'item-ring', { assignment: 'per_person' }),
        ],
        travelers: [traveler('trv-1', 'Andy'), traveler('trv-2', 'Bea')],
        items: [
          tripItem('row-1', 'Ringblitz', {
            source_item_id: 'item-ring',
            assigned_traveler_id: 'trv-1',
          }),
          tripItem('row-2', 'Ringblitz', {
            source_item_id: 'item-ring',
            assigned_traveler_id: 'trv-2',
          }),
        ],
      }),
    )

    expect(plan.add).toEqual([])
    // Named once, however many rows the group would have placed.
    expect(plan.alreadyPresent).toEqual(['Ringblitz'])
  })

  it('carries the FR-27.7 preparation tasks of the positions it adds', () => {
    const tasks: TemplateItemTask[] = [
      { id: 'task-1', template_item_id: 'ti-1', task: 'Akkus laden' },
    ]
    const plan = planGroupAddition(input({ templateItemTasks: tasks }))

    expect(plan.add[0].generated.tasks).toEqual(['Akkus laden'])
  })

  it('resolves an included group one level down, like generation does (FR-27.1)', () => {
    const includes: TemplateInclude[] = [
      { id: 'inc-1', template_id: 'grp-macro', included_template_id: 'grp-lenses' },
    ]
    const plan = planGroupAddition(
      input({
        templates: [group('grp-macro', 'Makro Fotografie'), group('grp-lenses', 'Objektive')],
        includes,
        templateItems: [
          templateItem('ti-1', 'grp-macro', 'item-ring'),
          templateItem('ti-3', 'grp-lenses', 'item-lens'),
        ],
        masterItems: [
          masterItem('item-ring', 'Ringblitz'),
          masterItem('item-lens', 'Makroobjektiv'),
        ],
      }),
    )

    expect(plan.add.map((a) => a.generated.name)).toEqual(['Ringblitz', 'Makroobjektiv'])
  })

  it('leaves out a position the trip attributes exclude (FR-15.2)', () => {
    const plan = planGroupAddition(
      input({
        templateItems: [
          templateItem('ti-1', 'grp-macro', 'item-ring'),
          templateItem('ti-2', 'grp-macro', 'item-tripod', { conditions: { season: 'winter' } }),
        ],
        attributes: { season: 'summer' },
      }),
    )

    expect(plan.add.map((a) => a.generated.name)).toEqual(['Ringblitz'])
    expect(plan.alreadyPresent).toEqual([])
  })
})
