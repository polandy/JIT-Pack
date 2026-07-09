/**
 * Template instantiation (FR-2.2/FR-2.3a/FR-1.4/FR-15.2): aggregate
 * selected templates into trip items with evaluated quantities,
 * conditional inclusion, per-person expansion, and deduplication.
 */
import { describe, expect, it } from 'vitest'

import { generateTripItems, type GenerationInput } from '../instantiate'
import type { MasterItem, Template, TemplateItem } from '@/types/domain'

function template(id: string, name: string): Template {
  return { id, owner_id: 'user-a', name, is_published: false }
}

function masterItem(id: string, name: string, extra: Partial<MasterItem> = {}): MasterItem {
  return {
    id,
    name,
    category_id: null,
    weight_grams: 100,
    value_cents: null,
    is_consumable: false,
    unit: 'pieces',
    per_day_rate: null,
    ...extra,
  }
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
    quantity_formula: '1',
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
    ...extra,
  }
}

const twoAdults = [
  { name: 'Andy', profile: 'adult' as const },
  { name: 'Sarah', profile: 'adult' as const },
]

function input(overrides: Partial<GenerationInput>): GenerationInput {
  return {
    templates: [],
    templateItems: [],
    masterItems: [],
    trip: { duration_days: 10, attributes: null, travelers: twoAdults },
    ...overrides,
  }
}

describe('generateTripItems', () => {
  it('evaluates formulas and copies master metadata', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Sonnencreme', { weight_grams: 250, value_cents: 1200, category_name: 'Pflege' })],
        templateItems: [templateItem('ti1', 't1', 'i1', { quantity_formula: 'ceil(trip_duration / 7)' })],
      }),
    )

    expect(res.items).toHaveLength(1)
    const item = res.items[0]
    expect(item).toMatchObject({
      source_item_id: 'i1',
      source_template_id: 't1',
      name: 'Sonnencreme',
      category_name: 'Pflege',
      weight_grams: 250,
      value_cents: 1200,
      quantity: 2,
      mode: 'pack',
      traveler_index: null,
    })
  })

  it('expands per_person items to one row per traveler (FR-1.4)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Unterhosen')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { assignment: 'per_person', quantity_formula: 'trip_duration / 2' }),
        ],
      }),
    )

    expect(res.items).toHaveLength(2)
    expect(res.items.map((i) => i.traveler_index)).toEqual([0, 1])
    expect(res.items.every((i) => i.quantity === 5)).toBe(true)
  })

  it('falls back to quantity 1 when trip_duration is null (FR-2.1a)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Sonnencreme')],
        templateItems: [templateItem('ti1', 't1', 'i1', { quantity_formula: 'ceil(trip_duration / 7)' })],
        trip: { duration_days: null, attributes: null, travelers: twoAdults },
      }),
    )

    expect(res.items[0].quantity).toBe(1)
  })

  it('excludes items whose conditions do not match, with reason (FR-15.2)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Winter')],
        masterItems: [masterItem('i1', 'Lange Unterwäsche'), masterItem('i2', 'Sonnenhut')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { conditions: { season: ['winter'] } }),
          templateItem('ti2', 't1', 'i2', { conditions: { season: ['summer'] } }),
        ],
        trip: { duration_days: 5, attributes: { season: 'winter' }, travelers: twoAdults },
      }),
    )

    expect(res.items.map((i) => i.name)).toEqual(['Lange Unterwäsche'])
    expect(res.excluded).toHaveLength(1)
    expect(res.excluded[0]).toMatchObject({ item_name: 'Sonnenhut' })
    expect(res.excluded[0].reason).toContain('season')
  })

  it('matches tag conditions against the trip tag list', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Velo')],
        masterItems: [masterItem('i1', 'Flickzeug')],
        templateItems: [templateItem('ti1', 't1', 'i1', { conditions: { tags: ['bike'] } })],
        trip: { duration_days: 5, attributes: { tags: ['bike', 'lake'] }, travelers: twoAdults },
      }),
    )

    expect(res.items).toHaveLength(1)
  })

  it('deduplicates overlaps across templates with max by default (FR-2.3a)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis'), template('t2', 'Strand')],
        masterItems: [masterItem('i1', 'Handtuch')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { quantity_formula: '2' }),
          templateItem('ti2', 't2', 'i1', { quantity_formula: '3' }),
        ],
      }),
    )

    expect(res.items).toHaveLength(1)
    expect(res.items[0].quantity).toBe(3)
    expect(res.merged).toHaveLength(1)
    expect(res.merged[0]).toMatchObject({ item_name: 'Handtuch', strategy: 'max', quantities: [2, 3], quantity: 3 })
  })

  it('sums overlaps when any side requests sum (consumables, FR-2.3a)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis'), template('t2', 'Strand')],
        masterItems: [masterItem('i1', 'Sonnencreme', { is_consumable: true })],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { quantity_formula: '1' }),
          templateItem('ti2', 't2', 'i1', { quantity_formula: '2', dedup: 'sum' }),
        ],
      }),
    )

    expect(res.items[0].quantity).toBe(3)
    expect(res.merged[0].strategy).toBe('sum')
  })

  it('dedupes per traveler, not across travelers', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'A'), template('t2', 'B')],
        masterItems: [masterItem('i1', 'Socken')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { assignment: 'per_person', quantity_formula: '2' }),
          templateItem('ti2', 't2', 'i1', { assignment: 'per_person', quantity_formula: '4' }),
        ],
      }),
    )

    expect(res.items).toHaveLength(2)
    expect(res.items.every((i) => i.quantity === 4)).toBe(true)
  })

  it('computes per-day consumables from rate × duration (FR-1.8)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [
          masterItem('i1', 'Kontaktlinsen', { unit: 'per_day', per_day_rate: 2, is_consumable: true }),
        ],
        templateItems: [templateItem('ti1', 't1', 'i1', { assignment: 'per_person' })],
        trip: { duration_days: 10, attributes: null, travelers: twoAdults },
      }),
    )

    expect(res.items.every((i) => i.quantity === 20)).toBe(true)
  })

  it('carries default_mode and late_packer into generated items', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Zahnbürste')],
        templateItems: [
          templateItem('ti1', 't1', 'i1', { default_mode: 'buy_before', late_packer: true }),
        ],
      }),
    )

    expect(res.items[0]).toMatchObject({ mode: 'buy_before', late_packer: true })
  })

  it('drops quantity-zero results as considered-and-skipped input (FR-5.5)', () => {
    const res = generateTripItems(
      input({
        templates: [template('t1', 'Basis')],
        masterItems: [masterItem('i1', 'Kindersitz')],
        templateItems: [templateItem('ti1', 't1', 'i1', { quantity_formula: 'num_children' })],
      }),
    )

    // Two adults, no children → quantity 0 → generated as skipped item.
    expect(res.items).toHaveLength(1)
    expect(res.items[0].quantity).toBe(0)
  })
})
