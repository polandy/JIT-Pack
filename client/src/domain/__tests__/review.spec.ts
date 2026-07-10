/**
 * M14 Post-Trip Review Assistant (FR-9.2): proposal generation from
 * FR-9.1 flags. Pure domain — proposals are recomputed from current
 * state, so already-applied ones vanish (natural resumability).
 */
import { describe, it, expect } from 'vitest'

import { buildReviewProposals } from '@/domain/review'
import type { MasterItem, Template, TemplateItem, TripItem } from '@/types/domain'

function tripItem(over: Partial<TripItem> = {}): TripItem {
  return {
    id: 'ti1',
    trip_id: 'trip1',
    source_item_id: null,
    source_template_id: null,
    name: 'Lonely Planet',
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
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '',
    ...over,
  }
}

function template(id: string, over: Partial<Template> = {}): Template {
  return { id, owner_id: 'me', name: `Template ${id}`, is_published: false, ...over }
}

function templateItem(over: Partial<TemplateItem> = {}): TemplateItem {
  return {
    id: 'tpl-item-1',
    template_id: 'tpl1',
    item_id: 'item1',
    quantity_formula: '1',
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
    ...over,
  }
}

function masterItem(id: string, name: string): MasterItem {
  return {
    id,
    name,
    category_id: null,
    weight_grams: null,
    value_cents: null,
    is_consumable: false,
    unit: 'pieces',
    per_day_rate: null,
  }
}

const noDeps = {
  templates: [] as Template[],
  templateItems: () => [] as TemplateItem[],
  masterItems: [] as MasterItem[],
}

describe('buildReviewProposals — unused flags (reduce quantity)', () => {
  const base = {
    templates: [template('tpl1')],
    templateItems: (id: string) =>
      id === 'tpl1' ? [templateItem({ id: 'tpl-item-1', item_id: 'item1' })] : [],
    masterItems: [masterItem('item1', 'Lonely Planet')],
  }

  it('proposes setting the template quantity to 0 for an unused templated item', () => {
    const proposals = buildReviewProposals({
      ...base,
      items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'tpl1' })],
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({
      kind: 'reduce_quantity',
      itemName: 'Lonely Planet',
      itemId: 'item1',
      templateId: 'tpl1',
      templateItemId: 'tpl-item-1',
      requiresFork: false,
    })
  })

  it.each([
    [
      'template item already zeroed',
      {
        ...base,
        templateItems: (id: string) =>
          id === 'tpl1' ? [templateItem({ quantity_formula: '0' })] : [],
        items: [
          tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'tpl1' }),
        ],
      },
    ],
    [
      'ad-hoc item without a source template',
      { ...base, items: [tripItem({ flag_unused: true, source_item_id: 'item1' })] },
    ],
    [
      'template item no longer exists',
      {
        ...base,
        templateItems: () => [] as TemplateItem[],
        items: [
          tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'tpl1' }),
        ],
      },
    ],
    [
      'no flags at all',
      { ...base, items: [tripItem({ source_item_id: 'item1', source_template_id: 'tpl1' })] },
    ],
  ])('yields nothing when %s', (_name, args) => {
    expect(buildReviewProposals(args)).toHaveLength(0)
  })
})

describe('buildReviewProposals — missing flags (add to template)', () => {
  const templates = [template('tpl1'), template('tpl2')]
  // tpl1 dominates the trip: two of its items instantiated vs. one from tpl2.
  const tripItems = [
    tripItem({ id: 'a', source_template_id: 'tpl1', source_item_id: 'item1', name: 'Zelt' }),
    tripItem({ id: 'b', source_template_id: 'tpl1', source_item_id: 'item2', name: 'Kocher' }),
    tripItem({ id: 'c', source_template_id: 'tpl2', source_item_id: 'item3', name: 'Buch' }),
  ]

  it('targets the dominant template of the trip', () => {
    const proposals = buildReviewProposals({
      templates,
      templateItems: () => [],
      masterItems: [masterItem('item9', 'Sonnencreme')],
      items: [
        ...tripItems,
        tripItem({ id: 'd', flag_missing: true, source_item_id: 'item9', name: 'Sonnencreme' }),
      ],
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({
      kind: 'add_item',
      itemName: 'Sonnencreme',
      itemId: 'item9',
      templateId: 'tpl1',
      templateItemId: null,
    })
  })

  it('matches an ad-hoc missing item to a master item by name (case-insensitive)', () => {
    const proposals = buildReviewProposals({
      templates,
      templateItems: () => [],
      masterItems: [masterItem('item9', 'Sonnencreme')],
      items: [...tripItems, tripItem({ id: 'd', flag_missing: true, name: 'sonnencreme' })],
    })

    expect(proposals[0]?.itemId).toBe('item9')
  })

  it('keeps itemId null for a truly new ad-hoc item (apply must create it)', () => {
    const proposals = buildReviewProposals({
      templates,
      templateItems: () => [],
      masterItems: [],
      items: [...tripItems, tripItem({ id: 'd', flag_missing: true, name: 'Moskitonetz' })],
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ kind: 'add_item', itemId: null, itemName: 'Moskitonetz' })
  })

  it('skips items the target template already contains', () => {
    const proposals = buildReviewProposals({
      templates,
      templateItems: (id: string) => (id === 'tpl1' ? [templateItem({ item_id: 'item9' })] : []),
      masterItems: [masterItem('item9', 'Sonnencreme')],
      items: [
        ...tripItems,
        tripItem({ id: 'd', flag_missing: true, source_item_id: 'item9', name: 'Sonnencreme' }),
      ],
    })

    expect(proposals).toHaveLength(0)
  })

  it('yields nothing when the trip used no templates', () => {
    const proposals = buildReviewProposals({
      ...noDeps,
      items: [tripItem({ flag_missing: true, name: 'Sonnencreme' })],
    })

    expect(proposals).toHaveLength(0)
  })
})

describe('buildReviewProposals — dismissals, fork, history', () => {
  const base = {
    templates: [template('tpl1')],
    templateItems: (id: string) =>
      id === 'tpl1' ? [templateItem({ id: 'tpl-item-1', item_id: 'item1' })] : [],
    masterItems: [masterItem('item1', 'Lonely Planet')],
    items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'tpl1' })],
  }

  it('filters proposals dismissed via "Never ask again" (item–template pair)', () => {
    const [proposal] = buildReviewProposals(base)
    const filtered = buildReviewProposals({ ...base, isDismissed: (key) => key === proposal!.key })
    expect(filtered).toHaveLength(0)
  })

  it.each([
    [
      'published foreign template',
      template('tpl1', { is_published: true, owner_id: 'someone' }),
      'me',
      true,
    ],
    ['published template, identity unknown', template('tpl1', { is_published: true }), null, true],
    [
      'own published template',
      template('tpl1', { is_published: true, owner_id: 'me' }),
      'me',
      false,
    ],
    ['private template', template('tpl1'), null, false],
  ])('requiresFork: %s → %s', (_name, tpl, ownUserId, want) => {
    const proposals = buildReviewProposals({ ...base, templates: [tpl], ownUserId })
    expect(proposals[0]?.requiresFork).toBe(want)
  })

  it('carries the historical flag count for the card wording', () => {
    const proposals = buildReviewProposals({
      ...base,
      flaggedTripCount: (name, flag) => (name === 'Lonely Planet' && flag === 'unused' ? 3 : 0),
    })
    expect(proposals[0]?.flagCount).toBe(3)
  })

  it('defaults the flag count to 1 without history', () => {
    expect(buildReviewProposals(base)[0]?.flagCount).toBe(1)
  })
})
