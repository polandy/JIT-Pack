/**
 * M4 packing-list view model (Addendum §3.25).
 *
 * The screen's three new behaviours are pure list arithmetic and live here
 * rather than in the component:
 *   FR-25.1 per-person items render as a named cluster with one child row
 *           per traveler, degrading to a flat row when only one instance
 *           lands in the group.
 *   FR-25.2 done rows (fully packed with no open prep, or skipped) drop out
 *           by default; headers keep their counts over the *full* set, and a
 *           group whose rows are all done disappears entirely.
 *   FR-25.4 the procurement-mode filter is multi-select and combines.
 */
import { describe, it, expect } from 'vitest'

import { buildPackingView, isDone } from '../packingView'
import type { Container, ItemMode, TripItem, Traveler } from '@/types/domain'

let seq = 0

function item(over: Partial<TripItem> = {}): TripItem {
  seq += 1
  return {
    id: `i${seq}`,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: `Item ${seq}`,
    weight_grams: null,
    value_cents: null,
    category_name: 'Clothing',
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
    updated_hlc: '1',
    ...over,
  }
}

/** A fully packed row: quantity reached, state settled. */
function packed(over: Partial<TripItem> = {}): TripItem {
  return item({ quantity: 2, packed_count: 2, state: 'packed', ...over })
}

const andy: Traveler = {
  id: 'tr1',
  trip_id: 't1',
  name: 'Andy',
  profile: 'adult',
  linked_user_id: null,
}
const leo: Traveler = {
  id: 'tr2',
  trip_id: 't1',
  name: 'Leo',
  profile: 'child',
  linked_user_id: null,
}
const mia: Traveler = {
  id: 'tr3',
  trip_id: 't1',
  name: 'Mia',
  profile: 'child',
  linked_user_id: null,
}
const travelers = [andy, leo, mia]
const containers: Container[] = []

type ViewOptions = Partial<Parameters<typeof buildPackingView>[0]>

function view(items: TripItem[], over: ViewOptions = {}) {
  return buildPackingView({
    items,
    travelers,
    containers,
    groupBy: 'category',
    showDone: false,
    modeFilter: [],
    itemsWithOpenPrep: [],
    ...over,
  })
}

describe('isDone (FR-25.2)', () => {
  const cases: { name: string; item: TripItem; openPrep: boolean; want: boolean }[] = [
    { name: 'untouched row is not done', item: item(), openPrep: false, want: false },
    {
      name: 'partially packed row is not done',
      item: item({ quantity: 3, packed_count: 1, state: 'partial' }),
      openPrep: false,
      want: false,
    },
    { name: 'fully packed row is done', item: packed(), openPrep: false, want: true },
    {
      name: 'consciously skipped row is done (FR-5.5)',
      item: item({ state: 'skipped', quantity: 0 }),
      openPrep: false,
      want: true,
    },
    {
      name: 'packed with open preparation is NOT done — work remains (FR-7.3)',
      item: packed(),
      openPrep: true,
      want: false,
    },
  ]

  it.each(cases)('$name', ({ item: subject, openPrep, want }) => {
    expect(isDone(subject, openPrep)).toBe(want)
  })
})

describe('hiding done rows (FR-25.2)', () => {
  it('drops fully packed rows from the default list', () => {
    const open = item({ name: 'Socks' })
    const result = view([open, packed({ name: 'Towel' })])
    const names = result.groups.flatMap((g) =>
      g.entries.map((e) => (e.kind === 'item' ? e.item.name : e.name)),
    )
    expect(names).toEqual(['Socks'])
  })

  it('reports how many were hidden, to label the reveal toggle', () => {
    const result = view([item(), packed(), packed()])
    expect(result.hiddenDoneCount).toBe(2)
  })

  it('reveals them when asked, without changing any state', () => {
    const result = view([item(), packed()], { showDone: true })
    expect(result.groups[0]?.entries).toHaveLength(2)
    expect(result.hiddenDoneCount).toBe(0)
  })

  it('keeps the group header counting over the full set while rows are hidden', () => {
    const result = view([item(), packed(), packed()])
    expect(result.groups[0]?.doneCount).toBe(2)
    expect(result.groups[0]?.totalCount).toBe(3)
  })

  it('drops a group entirely once every row in it is done', () => {
    const result = view([
      item({ category_name: 'Clothing' }),
      packed({ category_name: 'Toiletries' }),
    ])
    expect(result.groups.map((g) => g.name)).toEqual(['Clothing'])
  })

  it('keeps a packed row with open prep visible, because work remains', () => {
    const withPrep = packed({ name: 'Camera' })
    const result = view([withPrep], { itemsWithOpenPrep: [withPrep.id] })
    expect(result.groups[0]?.entries).toHaveLength(1)
    expect(result.hiddenDoneCount).toBe(0)
  })
})

describe('per-person clusters (FR-25.1)', () => {
  const shorts = (traveler: Traveler, over: Partial<TripItem> = {}) =>
    item({
      name: 'Shorts',
      source_item_id: 'src-shorts',
      assigned_traveler_id: traveler.id,
      ...over,
    })

  it('groups several instances of one item into a named cluster', () => {
    const result = view([shorts(andy), shorts(leo), shorts(mia)])
    const [entry] = result.groups[0]?.entries ?? []
    expect(entry?.kind).toBe('cluster')
    if (entry?.kind !== 'cluster') return
    expect(entry.name).toBe('Shorts')
    expect(entry.children).toHaveLength(3)
    expect(entry.children.map((c) => c.traveler?.name)).toEqual(['Andy', 'Leo', 'Mia'])
  })

  it('names the item once and counts done/total over its instances', () => {
    const result = view(
      [shorts(andy), shorts(leo, { quantity: 2, packed_count: 2, state: 'packed' })],
      {
        showDone: true,
      },
    )
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(entry.doneCount).toBe(1)
    expect(entry.totalCount).toBe(2)
  })

  it('hides a done child but keeps the cluster count over the full set (FR-25.2)', () => {
    const result = view([
      shorts(andy),
      shorts(leo, { quantity: 2, packed_count: 2, state: 'packed' }),
    ])
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(entry.children).toHaveLength(1)
    expect(entry.doneCount).toBe(1)
    expect(entry.totalCount).toBe(2)
  })

  it('drops the whole cluster once every instance is done', () => {
    const done = { quantity: 2, packed_count: 2, state: 'packed' as const }
    const result = view([shorts(andy, done), shorts(leo, done)])
    expect(result.groups).toHaveLength(0)
  })

  it('renders a lone instance flat, labelled "Item · Person" — a one-child cluster is noise', () => {
    const result = view([shorts(andy)])
    const [entry] = result.groups[0]?.entries ?? []
    expect(entry?.kind).toBe('item')
    if (entry?.kind !== 'item') return
    expect(entry.label).toBe('Shorts · Andy')
  })

  it('renders flat when the list is grouped by traveler, where the person is already the header', () => {
    const result = view([shorts(andy), shorts(leo)], { groupBy: 'person' })
    const entries = result.groups.flatMap((g) => g.entries)
    expect(entries.every((e) => e.kind === 'item')).toBe(true)
  })

  it('does not cluster distinct items that merely share a traveler', () => {
    const result = view([
      item({ name: 'Shorts', source_item_id: 'a', assigned_traveler_id: andy.id }),
      item({ name: 'Cap', source_item_id: 'b', assigned_traveler_id: andy.id }),
    ])
    expect(result.groups[0]?.entries.every((e) => e.kind === 'item')).toBe(true)
  })

  it('clusters ad-hoc rows without a master item by name, so quick-added per-person rows behave', () => {
    const result = view([
      item({ name: 'Flip-flops', assigned_traveler_id: andy.id }),
      item({ name: 'Flip-flops', assigned_traveler_id: leo.id }),
    ])
    expect(result.groups[0]?.entries[0]?.kind).toBe('cluster')
  })
})

describe('procurement-mode filter (FR-25.4)', () => {
  const rows = () => [
    item({ name: 'Socks', mode: 'pack' }),
    item({ name: 'Sunscreen', mode: 'buy_before' }),
    item({ name: 'Bread', mode: 'buy_local' }),
  ]

  function visibleNames(modeFilter: ItemMode[]) {
    return view(rows(), { modeFilter })
      .groups.flatMap((g) => g.entries)
      .map((e) => (e.kind === 'item' ? e.item.name : e.name))
  }

  it('shows everything when no mode is selected', () => {
    expect(visibleNames([])).toEqual(['Socks', 'Sunscreen', 'Bread'])
  })

  it('filters to a single selected mode', () => {
    expect(visibleNames(['buy_before'])).toEqual(['Sunscreen'])
  })

  it('combines selected modes rather than replacing the selection', () => {
    expect(visibleNames(['buy_before', 'buy_local'])).toEqual(['Sunscreen', 'Bread'])
  })

  it('counts each mode over the unfiltered list, so the pills stay stable while filtering', () => {
    const result = view(rows(), { modeFilter: ['buy_local'] })
    expect(result.modeCounts).toEqual({ pack: 1, buy_before: 1, buy_local: 1 })
  })

  it('counts modes over open rows only — a filter pill offering done work would mislead', () => {
    const result = view([item({ mode: 'pack' }), packed({ mode: 'pack' })])
    expect(result.modeCounts.pack).toBe(1)
  })
})

describe('grouping', () => {
  it('groups by category and sorts groups by name, unassigned last', () => {
    const result = view([
      item({ name: 'A', category_name: 'Toiletries' }),
      item({ name: 'B', category_name: 'Clothing' }),
      item({ name: 'C', category_name: null }),
    ])
    expect(result.groups.map((g) => g.name)).toEqual(['Clothing', 'Toiletries', null])
  })

  it('groups by traveler, naming groups after the people', () => {
    const result = view(
      [
        item({ assigned_traveler_id: andy.id }),
        item({ assigned_traveler_id: leo.id }),
        item({ assigned_traveler_id: null }),
      ],
      { groupBy: 'person' },
    )
    expect(result.groups.map((g) => g.name)).toEqual(['Andy', 'Leo', null])
  })
})
