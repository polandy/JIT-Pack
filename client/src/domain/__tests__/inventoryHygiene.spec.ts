/**
 * FR-24.12 — the inventory's cleanup rules. Each rule is a finding, never a
 * refusal, and each finding carries what its one repair needs.
 */
import { describe, it, expect } from 'vitest'

import {
  HYGIENE_RULE_SINGLE_TAG,
  HYGIENE_RULE_UNTAGGED,
  HYGIENE_RULE_UNUSED,
  hygieneReport,
  monthsBefore,
  singleItemTags,
  suggestTag,
  tripUseDay,
  unseenTrips,
  untaggedItems,
  unusedItems,
  type HygieneAssignment,
  type HygieneItem,
  type HygienePosition,
  type HygieneSettings,
  type HygieneTag,
  type HygieneTemplate,
  type HygieneTrip,
  type HygieneTripRow,
} from '../inventoryHygiene'

const TODAY = '2026-09-19'

const tags: HygieneTag[] = [
  { id: 't-bad', name: 'Bad', sort_order: 0 },
  { id: 't-kleidung', name: 'Kleidung', sort_order: 1 },
  { id: 't-technik', name: 'Technik', sort_order: 2 },
  { id: 't-foto', name: 'Fotografie', sort_order: 3 },
]

function item(id: string, name: string): HygieneItem {
  return { id, name }
}

function tagged(itemId: string, tagId: string, position = 0): HygieneAssignment {
  return { item_id: itemId, tag_id: tagId, position }
}

function empty() {
  return {
    items: [] as HygieneItem[],
    tags,
    assignments: [] as HygieneAssignment[],
    templates: [] as HygieneTemplate[],
    positions: [] as HygienePosition[],
  }
}

describe('suggestTag — an offer only with a reason (FR-24.12)', () => {
  it('lends the primary tag of the item sharing the longest name prefix', () => {
    const ctx = {
      ...empty(),
      items: [item('i1', 'Zahnbürste'), item('i2', 'Zahnseide'), item('i3', 'Zelt')],
      assignments: [tagged('i1', 't-bad'), tagged('i3', 't-technik')],
    }
    expect(suggestTag(item('i2', 'Zahnseide'), ctx)).toEqual({
      tagId: 't-bad',
      reason: { kind: 'name', via: 'Zahnbürste' },
    })
  })

  it('folds case before comparing, so „ZAHNseide" is still Zahnbürste’s neighbour', () => {
    const ctx = {
      ...empty(),
      items: [item('i1', 'Zahnbürste'), item('i2', 'ZAHNseide')],
      assignments: [tagged('i1', 't-bad')],
    }
    expect(suggestTag(item('i2', 'ZAHNseide'), ctx)?.tagId).toBe('t-bad')
  })

  it('does not treat three shared letters as a reason', () => {
    const ctx = {
      ...empty(),
      items: [item('i1', 'Sonde'), item('i2', 'Sonnenhut')],
      assignments: [tagged('i1', 't-technik')],
    }
    // „Son" is three letters: Sonnenhut is not a probe.
    expect(suggestTag(item('i2', 'Sonnenhut'), ctx)).toBeNull()
  })

  it('reads the *primary* tag of the neighbour, not whichever was assigned first', () => {
    const ctx = {
      ...empty(),
      items: [item('i1', 'Kopfhörer'), item('i2', 'Kopfkissen')],
      assignments: [tagged('i1', 't-kleidung', 1), tagged('i1', 't-technik', 0)],
    }
    expect(suggestTag(item('i2', 'Kopfkissen'), ctx)?.tagId).toBe('t-technik')
  })

  it('lets a Vorlage outrank a name neighbour — a shared word is a weaker reason', () => {
    // As in the seed: „Reiseadapter" shares „Reise" with Reiseapotheke and
    // would be offered „Bad", while its own group is all Technik.
    const ctx = {
      ...empty(),
      items: [item('apo', 'Reiseapotheke'), item('lade', 'Ladegerät'), item('ad', 'Reiseadapter')],
      assignments: [tagged('apo', 't-bad'), tagged('lade', 't-technik')],
      templates: [{ id: 'tpl', name: 'Strom & Laden' }],
      positions: [
        { template_id: 'tpl', item_id: 'lade' },
        { template_id: 'tpl', item_id: 'ad' },
      ],
    }
    expect(suggestTag(item('ad', 'Reiseadapter'), ctx)).toEqual({
      tagId: 't-technik',
      reason: { kind: 'template', via: 'Strom & Laden' },
    })
  })

  it('takes the tag most fellow positions of its Vorlagen carry', () => {
    const ctx = {
      ...empty(),
      items: [
        item('i1', 'Badehose'),
        item('i2', 'Sonnenbrille'),
        item('i3', 'Hut'),
        item('x', 'Handtuch'),
      ],
      assignments: [tagged('i1', 't-kleidung'), tagged('i2', 't-kleidung'), tagged('x', 't-bad')],
      templates: [{ id: 'tpl', name: 'Strand' }],
      positions: [
        { template_id: 'tpl', item_id: 'i1' },
        { template_id: 'tpl', item_id: 'i2' },
        { template_id: 'tpl', item_id: 'x' },
        { template_id: 'tpl', item_id: 'i3' },
      ],
    }
    expect(suggestTag(item('i3', 'Hut'), ctx)).toEqual({
      tagId: 't-kleidung',
      reason: { kind: 'template', via: 'Strand' },
    })
  })

  it('breaks a tie between Vorlage votes by the axis order, not by arrival', () => {
    const ctx = {
      ...empty(),
      items: [item('a', 'Aa'), item('b', 'Bb'), item('n', 'Neu')],
      assignments: [tagged('a', 't-technik'), tagged('b', 't-bad')],
      templates: [{ id: 'tpl', name: 'Mix' }],
      positions: [
        { template_id: 'tpl', item_id: 'a' },
        { template_id: 'tpl', item_id: 'b' },
        { template_id: 'tpl', item_id: 'n' },
      ],
    }
    expect(suggestTag(item('n', 'Neu'), ctx)?.tagId).toBe('t-bad')
  })

  it('suggests nothing when neither reason holds', () => {
    const ctx = { ...empty(), items: [item('i1', 'Kartenspiel')] }
    expect(suggestTag(item('i1', 'Kartenspiel'), ctx)).toBeNull()
  })
})

describe('untaggedItems', () => {
  it('lists every item without a tag, by name, with its suggestion', () => {
    const ctx = {
      ...empty(),
      items: [item('i1', 'Zahnbürste'), item('i3', 'Zahnseide'), item('i2', 'Kartenspiel')],
      assignments: [tagged('i1', 't-bad')],
    }
    const found = untaggedItems(ctx)
    expect(found.map((f) => f.item.name)).toEqual(['Kartenspiel', 'Zahnseide'])
    expect(found[0]!.suggestion).toBeNull()
    expect(found[1]!.suggestion?.tagId).toBe('t-bad')
  })
})

describe('the use day and the window', () => {
  it('takes the end date, else the start, else the end of the year', () => {
    expect(
      tripUseDay({ id: 't', year: 2025, start_date: '2025-07-01', end_date: '2025-07-14' }),
    ).toBe('2025-07-14')
    expect(tripUseDay({ id: 't', year: 2025, start_date: '2025-07-01', end_date: null })).toBe(
      '2025-07-01',
    )
    expect(tripUseDay({ id: 't', year: 2025, start_date: null, end_date: null })).toBe('2025-12-31')
  })

  it('moves back whole months and clamps to the shorter month', () => {
    expect(monthsBefore('2026-09-19', 12)).toBe('2025-09-19')
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28')
    expect(monthsBefore('2026-01-15', 6)).toBe('2025-07-15')
  })
})

describe('unusedItems — packed once, not since (FR-24.12)', () => {
  const trips: HygieneTrip[] = [
    { id: 'old', year: 2024, start_date: '2024-08-01', end_date: '2024-08-10' },
    { id: 'recent', year: 2026, start_date: '2026-07-01', end_date: '2026-07-10' },
  ]

  function ctx(over: Partial<Parameters<typeof unusedItems>[0]> = {}) {
    return {
      items: [item('gas', 'Gaskocher'), item('zelt', 'Zelt'), item('neu', 'Neu')],
      assignments: [
        tagged('gas', 't-technik'),
        tagged('zelt', 't-technik'),
        tagged('neu', 't-technik'),
      ],
      positions: [] as HygienePosition[],
      trips,
      tripRows: [
        { trip_id: 'old', source_item_id: 'gas' },
        { trip_id: 'old', source_item_id: 'zelt' },
        { trip_id: 'recent', source_item_id: 'zelt' },
      ] as HygieneTripRow[],
      today: TODAY,
      months: 12,
      ...over,
    }
  }

  it('flags an item whose last known trip ended before the window', () => {
    expect(unusedItems(ctx())).toEqual([{ item: item('gas', 'Gaskocher'), lastUsed: '2024-08-10' }])
  })

  it('never flags an item that was never on a trip — it may have been created yesterday', () => {
    expect(unusedItems(ctx()).map((f) => f.item.id)).not.toContain('neu')
  })

  it('treats a Vorlage holding the item as a use', () => {
    const found = unusedItems(ctx({ positions: [{ template_id: 'tpl', item_id: 'gas' }] }))
    expect(found).toEqual([])
  })

  it('leaves an untagged item to the untagged rule', () => {
    const found = unusedItems(ctx({ assignments: [tagged('zelt', 't-technik')] }))
    expect(found).toEqual([])
  })

  it('follows the window it is given', () => {
    expect(unusedItems(ctx({ months: 36 }))).toEqual([])
    expect(unusedItems(ctx({ months: 6 })).map((f) => f.item.id)).toEqual(['gas'])
  })

  it('counts the trips in the window this device holds no rows for', () => {
    const loaded = (id: string) => id === 'old'
    expect(unseenTrips(trips, loaded, TODAY, 12)).toBe(1)
    expect(unseenTrips(trips, () => true, TODAY, 12)).toBe(0)
  })
})

describe('singleItemTags', () => {
  it('lists, in axis order, the tags exactly one active item carries', () => {
    const found = singleItemTags({
      items: [item('i1', 'Graufilter'), item('i2', 'Kamera'), item('i3', 'Stativ')],
      tags,
      assignments: [
        tagged('i1', 't-foto'),
        tagged('i2', 't-technik'),
        tagged('i3', 't-technik'),
        tagged('i2', 't-bad', 1),
      ],
    })
    expect(found.map((f) => [f.tag.name, f.item.name])).toEqual([
      ['Bad', 'Kamera'],
      ['Fotografie', 'Graufilter'],
    ])
  })

  it('counts only active items — a tag on one active and one retired item is still single', () => {
    const found = singleItemTags({
      items: [item('i1', 'Graufilter')],
      tags,
      assignments: [tagged('i1', 't-foto'), tagged('retired', 't-foto')],
    })
    expect(found.map((f) => f.tag.id)).toEqual(['t-foto'])
  })
})

describe('hygieneReport', () => {
  const base = {
    items: [item('i1', 'Kartenspiel'), item('i2', 'Graufilter')],
    tags,
    assignments: [tagged('i2', 't-foto')],
    templates: [],
    positions: [],
    trips: [],
    tripRows: [],
    today: TODAY,
  }
  const all: HygieneSettings = {
    enabled: {
      [HYGIENE_RULE_UNTAGGED]: true,
      [HYGIENE_RULE_UNUSED]: true,
      [HYGIENE_RULE_SINGLE_TAG]: true,
    },
    unusedMonths: 12,
    keptItems: [],
    keptTags: [],
  }

  it('totals the findings of every enabled rule', () => {
    const report = hygieneReport(base, all)
    expect(report.untagged).toHaveLength(1)
    expect(report.singleTag).toHaveLength(1)
    expect(report.total).toBe(2)
  })

  it('reports nothing for a disabled rule, and does not count it', () => {
    const report = hygieneReport(base, {
      ...all,
      enabled: { ...all.enabled, [HYGIENE_RULE_UNTAGGED]: false },
    })
    expect(report.untagged).toEqual([])
    expect(report.total).toBe(1)
  })

  it('leaves out what the device chose to keep', () => {
    const report = hygieneReport(base, { ...all, keptTags: ['t-foto'] })
    expect(report.singleTag).toEqual([])
    expect(report.total).toBe(1)
  })
})
