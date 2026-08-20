/**
 * M14 Post-Trip Review Assistant (FR-9.2, group-aware per FR-27.11):
 * proposal generation from FR-9.1 flags. Pure domain — proposals are
 * recomputed from current state, so already-applied ones vanish
 * (natural resumability).
 *
 * FR-27.11 (concept round 2026-08-08): proposals target the *group* an
 * item came from, never a Ferien-Vorlage — writing to the composed
 * template would teach exactly one trip shape (the FR-27.5 stance).
 */
import { describe, it, expect } from 'vitest'

import { buildReviewProposals, dismissalKey, retargetGroups } from '@/domain/review'
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
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '',
    ...over,
  }
}

function group(id: string, over: Partial<Template> = {}): Template {
  return { id, owner_id: 'me', name: `Gruppe ${id}`, kind: 'group', ...over }
}

function vacation(id: string, over: Partial<Template> = {}): Template {
  return { id, owner_id: 'me', name: `Vorlage ${id}`, kind: 'template', ...over }
}

function templateItem(over: Partial<TemplateItem> = {}): TemplateItem {
  return {
    id: 'g1-item-1',
    template_id: 'g1',
    item_id: 'item1',
    quantity: 1,
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
    weight_grams: null,
    value_cents: null,
  }
}

const noDeps = {
  templates: [] as Template[],
  templateItems: () => [] as TemplateItem[],
  masterItems: [] as MasterItem[],
}

describe('buildReviewProposals — unused flags target the source group (FR-27.11)', () => {
  const base = {
    templates: [group('g1')],
    templateItems: (id: string) =>
      id === 'g1' ? [templateItem({ id: 'g1-item-1', item_id: 'item1' })] : [],
    masterItems: [masterItem('item1', 'Lonely Planet')],
  }

  it('proposes zeroing the position in the group the row came from', () => {
    const proposals = buildReviewProposals({
      ...base,
      items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' })],
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({
      kind: 'unused',
      itemName: 'Lonely Planet',
      itemId: 'item1',
      groupId: 'g1',
      groupName: 'Gruppe g1',
    })
  })

  // A row whose provenance is a Ferien-Vorlage's *own* position has no
  // group to teach — that structure feedback is M21's job (FR-27.5), so
  // the assistant stays silent rather than guessing a group.
  it('yields nothing when the provenance is a Ferien-Vorlage, not a group', () => {
    const proposals = buildReviewProposals({
      templates: [vacation('v1')],
      templateItems: (id: string) =>
        id === 'v1' ? [templateItem({ template_id: 'v1', item_id: 'item1' })] : [],
      masterItems: [masterItem('item1', 'Lonely Planet')],
      items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'v1' })],
    })

    expect(proposals).toHaveLength(0)
  })

  it.each([
    [
      'group position already zeroed',
      {
        ...base,
        templateItems: (id: string) => (id === 'g1' ? [templateItem({ quantity: 0 })] : []),
        items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' })],
      },
    ],
    [
      'ad-hoc item without a source template',
      { ...base, items: [tripItem({ flag_unused: true, source_item_id: 'item1' })] },
    ],
    [
      'group position no longer exists',
      {
        ...base,
        templateItems: () => [] as TemplateItem[],
        items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' })],
      },
    ],
    [
      'no flags at all',
      { ...base, items: [tripItem({ source_item_id: 'item1', source_template_id: 'g1' })] },
    ],
  ])('yields nothing when %s', (_name, args) => {
    expect(buildReviewProposals(args)).toHaveLength(0)
  })
})

describe('buildReviewProposals — missing flags default to the dominant group (FR-27.11)', () => {
  const templates = [group('g1'), group('g2'), vacation('v1')]
  // g1 dominates the trip: two of its rows vs. one from g2. The vacation
  // template's own rows must not count — it can never be a target.
  const tripItems = [
    tripItem({ id: 'a', source_template_id: 'g1', source_item_id: 'item1', name: 'Zelt' }),
    tripItem({ id: 'b', source_template_id: 'g1', source_item_id: 'item2', name: 'Kocher' }),
    tripItem({ id: 'c', source_template_id: 'g2', source_item_id: 'item3', name: 'Buch' }),
  ]

  it('targets the group that contributed most of the trip', () => {
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
      kind: 'missing',
      itemName: 'Sonnencreme',
      itemId: 'item9',
      groupId: 'g1',
    })
  })

  it('never defaults to a Ferien-Vorlage, even a dominant one', () => {
    const proposals = buildReviewProposals({
      templates,
      templateItems: () => [],
      masterItems: [],
      items: [
        tripItem({ id: 'a', source_template_id: 'v1', source_item_id: 'item1', name: 'Zelt' }),
        tripItem({ id: 'b', source_template_id: 'v1', source_item_id: 'item2', name: 'Kocher' }),
        tripItem({ id: 'c', source_template_id: 'g2', source_item_id: 'item3', name: 'Buch' }),
        tripItem({ id: 'd', flag_missing: true, name: 'Sonnencreme' }),
      ],
    })

    expect(proposals[0]?.groupId).toBe('g2')
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
    expect(proposals[0]).toMatchObject({ kind: 'missing', itemId: null, itemName: 'Moskitonetz' })
  })

  it('skips items the default group already contains', () => {
    const proposals = buildReviewProposals({
      templates,
      templateItems: (id: string) => (id === 'g1' ? [templateItem({ item_id: 'item9' })] : []),
      masterItems: [masterItem('item9', 'Sonnencreme')],
      items: [
        ...tripItems,
        tripItem({ id: 'd', flag_missing: true, source_item_id: 'item9', name: 'Sonnencreme' }),
      ],
    })

    expect(proposals).toHaveLength(0)
  })

  it('yields nothing when no group contributed to the trip', () => {
    const proposals = buildReviewProposals({
      ...noDeps,
      items: [tripItem({ flag_missing: true, name: 'Sonnencreme' })],
    })

    expect(proposals).toHaveLength(0)
  })
})

describe('buildReviewProposals — dismissals, ownership, history', () => {
  const base = {
    templates: [group('g1')],
    templateItems: (id: string) =>
      id === 'g1' ? [templateItem({ id: 'g1-item-1', item_id: 'item1' })] : [],
    masterItems: [masterItem('item1', 'Lonely Planet')],
    items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' })],
  }

  it('filters proposals dismissed via "Never ask again" (item–group pair)', () => {
    const [proposal] = buildReviewProposals(base)
    const filtered = buildReviewProposals({
      ...base,
      isDismissed: (key) => key === dismissalKey(proposal!.itemRef, proposal!.groupId),
    })
    expect(filtered).toHaveLength(0)
  })

  // The decided scope (UI-Spec M14): the pair, not the item globally —
  // the same item still surfaces when its default group differs.
  it('still surfaces the same item for a different group', () => {
    const proposals = buildReviewProposals({
      ...base,
      isDismissed: (key) => key === dismissalKey('item1', 'g2'),
    })
    expect(proposals).toHaveLength(1)
  })

  it('collapses per-person fan-out rows into one proposal', () => {
    const proposals = buildReviewProposals({
      ...base,
      items: [
        tripItem({ id: 'a', flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' }),
        tripItem({ id: 'b', flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' }),
      ],
    })
    expect(proposals).toHaveLength(1)
  })

  // FR-1.6 MVP simplification: templates are shared instance-wide, so a
  // proposal targets its source group whoever created it — no fork step.
  it('proposes against a foreign group like any other', () => {
    const foreign = group('g1', { owner_id: 'someone-else' })
    const proposals = buildReviewProposals({ ...base, templates: [foreign] })
    expect(proposals[0]?.groupId).toBe('g1')
  })

  it('carries the historical flag count for the row wording', () => {
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

describe('retargetGroups — what the per-row picker may offer (FR-27.11)', () => {
  const groups = [group('g1'), group('g2'), group('g3')]
  const templateItems = (id: string) =>
    id === 'g1' || id === 'g2' ? [templateItem({ template_id: id, item_id: 'item1' })] : []

  it('offers every group for a missing proposal', () => {
    const [p] = buildReviewProposals({
      templates: groups,
      templateItems: () => [],
      masterItems: [],
      items: [
        tripItem({ id: 'a', source_template_id: 'g1', source_item_id: 'item2', name: 'Zelt' }),
        tripItem({ id: 'd', flag_missing: true, name: 'Moskitonetz' }),
      ],
    })

    expect(retargetGroups(p!, groups, templateItems).map((g) => g.id)).toEqual(['g1', 'g2', 'g3'])
  })

  // Zeroing a position only means something where the position exists, so
  // an unused proposal can only move between groups that carry the item.
  it('offers only groups containing the item for an unused proposal', () => {
    const [p] = buildReviewProposals({
      templates: groups,
      templateItems,
      masterItems: [masterItem('item1', 'Lonely Planet')],
      items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' })],
    })

    expect(retargetGroups(p!, groups, templateItems).map((g) => g.id)).toEqual(['g1', 'g2'])
  })

  // The rows arrive in storage order, which is no order at all to a
  // reader — the same lesson FR-27.2's include expansion learned.
  it('offers the groups by name, not in the order storage returned them', () => {
    const unsorted = [group('g3', { name: 'Zelten' }), group('g1', { name: 'Alpin' })]
    const [p] = buildReviewProposals({
      templates: unsorted,
      templateItems: () => [],
      masterItems: [],
      items: [
        tripItem({ id: 'a', source_template_id: 'g3', source_item_id: 'item2', name: 'Zelt' }),
        tripItem({ id: 'd', flag_missing: true, name: 'Moskitonetz' }),
      ],
    })

    expect(retargetGroups(p!, unsorted, () => []).map((g) => g.name)).toEqual(['Alpin', 'Zelten'])
  })

  it('never offers a Ferien-Vorlage', () => {
    const all = [...groups, vacation('v1')]
    const [p] = buildReviewProposals({
      templates: all,
      templateItems,
      masterItems: [],
      items: [tripItem({ flag_unused: true, source_item_id: 'item1', source_template_id: 'g1' })],
    })

    expect(retargetGroups(p!, all, templateItems).some((g) => g.id === 'v1')).toBe(false)
  })
})
