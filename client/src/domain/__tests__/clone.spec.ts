/**
 * Trip cloning (FR-12.1/12.2): the plan copies the curated list with
 * fresh pack state, remaps traveler/container links behind the three
 * carry-over options, and re-evaluates quantity formulas against the
 * new trip duration.
 */
import { describe, it, expect } from 'vitest'

import { planClone, type CloneOptions } from '@/domain/clone'
import type { Container, MasterItem, TemplateItem, Traveler, Trip, TripItem } from '@/types/domain'

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 'src',
    name: 'Engadin 2025',
    status: 'archived',
    start_date: '2025-08-01',
    end_date: '2025-08-07',
    duration_days: 7,
    series_id: 'ser-1',
    series_name: null,
    attributes: { season: 'summer' },
    imported: false,
    ...over,
  }
}

function tripItem(over: Partial<TripItem> = {}): TripItem {
  return {
    id: 'ti1',
    trip_id: 'src',
    source_item_id: null,
    source_template_id: null,
    name: 'Zelt',
    weight_grams: 2000,
    value_cents: null,
    category_name: 'Outdoor',
    quantity: 1,
    packed_count: 1,
    state: 'packed',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: true,
    flag_missing: false,
    updated_hlc: '',
    ...over,
  }
}

function traveler(id: string, name: string, profile: 'adult' | 'child' = 'adult'): Traveler {
  return { id, trip_id: 'src', name, profile, linked_user_id: null }
}

function container(id: string, over: Partial<Container> = {}): Container {
  return {
    id,
    trip_id: 'src',
    name: `Container ${id}`,
    carrier_traveler_id: null,
    max_weight_grams: null,
    paired_container_id: null,
    ...over,
  }
}

const allOn: CloneOptions = {
  travelerAssignments: true,
  packerDelegations: true,
  containerAssignments: true,
}

const noLookup = {
  templateItem: () => undefined,
  masterItem: () => undefined,
}

describe('planClone — carry-over options (FR-12.2)', () => {
  const source = {
    trip: trip(),
    travelers: [traveler('tr1', 'Andy'), traveler('tr2', 'Kind', 'child')],
    containers: [
      container('c1', { carrier_traveler_id: 'tr2', max_weight_grams: 9000 }),
      container('c2', { paired_container_id: 'c1' }),
    ],
    items: [
      tripItem({ id: 'a', assigned_traveler_id: 'tr1', container_id: 'c2', packer_user_id: 'user-9' }),
    ],
  }

  it('remaps traveler and container links by index with everything on', () => {
    const plan = planClone(source, allOn, noLookup, 4)

    expect(plan.travelers).toEqual([
      { name: 'Andy', profile: 'adult' },
      { name: 'Kind', profile: 'child' },
    ])
    expect(plan.containers).toHaveLength(2)
    expect(plan.containers[0]).toMatchObject({
      name: 'Container c1', carrier_traveler_index: 1, max_weight_grams: 9000, paired_container_index: null,
    })
    expect(plan.containers[1]!.paired_container_index).toBe(0)

    expect(plan.items[0]).toMatchObject({
      traveler_index: 0,
      container_index: 1,
      packer_user_id: 'user-9',
    })
  })

  it.each([
    ['travelerAssignments', { ...allOn, travelerAssignments: false }, { traveler_index: null }, 2],
    ['packerDelegations', { ...allOn, packerDelegations: false }, { packer_user_id: null }, 2],
    ['containerAssignments', { ...allOn, containerAssignments: false }, { container_index: null }, 0],
  ])('dropping %s clears the corresponding links', (_name, options, cleared, containerCount) => {
    const plan = planClone(source, options as CloneOptions, noLookup, 4)
    expect(plan.items[0]).toMatchObject(cleared)
    expect(plan.containers).toHaveLength(containerCount)
  })
})

describe('planClone — fresh pack state (FR-12.1)', () => {
  it('resets packed items to open and clears flags, but keeps skips', () => {
    const plan = planClone(
      {
        trip: trip(),
        travelers: [],
        containers: [],
        items: [
          tripItem({ id: 'a', state: 'packed', packed_count: 2, quantity: 2, flag_unused: true }),
          tripItem({ id: 'b', state: 'skipped', quantity: 0 }),
          tripItem({ id: 'c', state: 'partial', packed_count: 1, quantity: 3, flag_missing: true }),
        ],
      },
      allOn,
      noLookup,
      4,
    )

    expect(plan.items.map((i) => i.state)).toEqual(['open', 'skipped', 'open'])
    expect(plan.items.every((i) => !i.flag_unused && !i.flag_missing)).toBe(true)
    expect(plan.items[0]!.quantity).toBe(2)
  })
})

describe('planClone — formula re-evaluation (FR-12.2)', () => {
  const templateItem: TemplateItem = {
    id: 'tpl-item-1',
    template_id: 'tpl1',
    item_id: 'item1',
    quantity_formula: 'trip_duration + 1',
    assignment: 'per_person',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
  }
  const masterItem: MasterItem = {
    id: 'item1',
    name: 'Socken',
    category_id: null,
    weight_grams: null,
    value_cents: null,
    is_consumable: false,
    unit: 'pieces',
    per_day_rate: null,
  }
  const lookup = {
    templateItem: (tplId: string, itemId: string) =>
      tplId === 'tpl1' && itemId === 'item1' ? templateItem : undefined,
    masterItem: (id: string) => (id === 'item1' ? masterItem : undefined),
  }

  it('re-evaluates templated items against the new duration', () => {
    const plan = planClone(
      {
        trip: trip(),
        travelers: [],
        containers: [],
        items: [
          tripItem({ id: 'a', source_template_id: 'tpl1', source_item_id: 'item1', quantity: 8 }),
        ],
      },
      allOn,
      lookup,
      3,
    )

    expect(plan.items[0]!.quantity).toBe(4) // 3 + 1, not the old 8
    expect(plan.reevaluated).toBe(1)
  })

  it.each([
    ['manual ad-hoc item', tripItem({ id: 'a', quantity: 5 })],
    [
      'templated item whose template row is gone',
      tripItem({ id: 'a', source_template_id: 'tpl-gone', source_item_id: 'item1', quantity: 5 }),
    ],
  ])('%s keeps its manual quantity', (_name, item) => {
    const plan = planClone(
      { trip: trip(), travelers: [], containers: [], items: [item] },
      allOn,
      lookup,
      3,
    )
    expect(plan.items[0]!.quantity).toBe(5)
    expect(plan.reevaluated).toBe(0)
  })
})
