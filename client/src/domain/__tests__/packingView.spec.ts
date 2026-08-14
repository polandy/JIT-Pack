/**
 * M4 packing-list view model (Addendum §3.25/§3.27).
 *
 * The screen's list arithmetic lives here rather than in the component:
 *   FR-25.1  per-person items render as a named cluster with one child row
 *            per traveler, degrading to a flat row when only one instance
 *            lands in the group.
 *   FR-25.2  done rows (fully packed with no open prep, or skipped) drop out
 *            by default; headers keep their counts over the *full* set, and a
 *            group whose rows are all done disappears entirely.
 *   FR-25.11 the faceted filter: OR within a facet, AND across facets, with
 *            per-value counts taken against the *other* facets.
 *   FR-25.16 groups fold, and a folded header carries its open count.
 *   FR-25.20 rows somebody else is responsible for are hidden by default, and
 *            never silently — the reveal bar names count and people.
 */
import { describe, it, expect } from 'vitest'

import { buildPackingView, isDone, noFacets } from '../packingView'
import type { Container, Facets, TripItem, TripParticipant, Traveler } from '@/types/domain'

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
    packed_by_user_id: null,
    packed_at: null,
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
  linked_user_id: null,
}
const leo: Traveler = {
  id: 'tr2',
  trip_id: 't1',
  name: 'Leo',
  linked_user_id: null,
}
const mia: Traveler = {
  id: 'tr3',
  trip_id: 't1',
  name: 'Mia',
  linked_user_id: null,
}
const travelers = [andy, leo, mia]
const containers: Container[] = []

const ME = 'u-me'
function participant(user_id: string, display_name: string): TripParticipant {
  return { user_id, display_name, avatar_url: null, role: 'editor' }
}
const participants = [
  participant(ME, 'Me'),
  participant('u-sia', 'Sia'),
  participant('u-tom', 'Tom'),
]

type ViewOptions = Partial<Parameters<typeof buildPackingView>[0]>

function view(items: TripItem[], over: ViewOptions = {}) {
  return buildPackingView({
    items,
    travelers,
    containers,
    participants,
    groupBy: 'category',
    showDone: false,
    facets: noFacets(),
    search: '',
    currentUserId: ME,
    showOthers: false,
    collapsedGroups: [],
    itemsWithOpenPrep: [],
    ...over,
  })
}

/** Every visible row label, in render order — what the screen actually lists. */
function visibleNames(items: TripItem[], over: ViewOptions = {}) {
  return view(items, over)
    .groups.flatMap((g) => g.entries)
    .flatMap((e) => (e.kind === 'item' ? [e.item.name] : e.children.map((c) => c.item.name)))
}

function facets(over: Partial<Facets> = {}): Facets {
  return { ...noFacets(), ...over }
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
    expect(visibleNames([item({ name: 'Socks' }), packed({ name: 'Towel' })])).toEqual(['Socks'])
  })

  it('reports how many are done, to label the reveal toggle', () => {
    expect(view([item(), packed(), packed()]).doneCount).toBe(2)
  })

  /**
   * The bar read "Show 3 packed" and then "Hide 5 packed" for the same
   * rows: one direction counted rows, the other counted pieces. One
   * number, one unit — the bar toggles rows, so it counts rows.
   */
  it('counts the same rows in both directions, so revealing them cannot change the number', () => {
    const items = [item(), packed(), packed()]

    expect(view(items).doneCount).toBe(2)
    expect(view(items, { showDone: true }).doneCount).toBe(2)
  })

  it('reveals them when asked, without changing any state', () => {
    const result = view([item(), packed()], { showDone: true })
    expect(result.groups[0]?.entries).toHaveLength(2)
    expect(result.doneCount).toBe(1)
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
    expect(result.doneCount).toBe(0)
  })

  it('hiding done rows is not a narrowing — it is what "everything is packed" means (FR-25.11e)', () => {
    expect(view([packed()]).narrowed).toBe(false)
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

  it('keeps cluster-vs-flat decided over the full set, even when a facet hides an instance', () => {
    // Filtering to Andy leaves one visible instance; restructuring the list into
    // a flat "Shorts · Andy" row on filtering would move the row under the user.
    const result = view([shorts(andy), shorts(leo)], { facets: facets({ person: [andy.id] }) })
    expect(result.groups[0]?.entries[0]?.kind).toBe('cluster')
  })
})

describe('facet filtering (FR-25.11c)', () => {
  const rows = () => [
    item({ name: 'Socks', mode: 'pack', category_name: 'Clothing' }),
    item({ name: 'Sunscreen', mode: 'buy_before', category_name: 'Toiletries' }),
    item({ name: 'Bread', mode: 'buy_local', category_name: 'Food' }),
  ]

  // Rows come back in group order (Clothing · Food · Toiletries), not input order.
  it('shows everything when no facet has a value — empty means no restriction, never "nothing"', () => {
    expect(visibleNames(rows())).toEqual(['Socks', 'Bread', 'Sunscreen'])
  })

  it('ORs the values within one facet', () => {
    expect(visibleNames(rows(), { facets: facets({ mode: ['buy_before', 'buy_local'] }) })).toEqual(
      ['Bread', 'Sunscreen'],
    )
  })

  it('ANDs across facets — a row must satisfy every facet in force', () => {
    expect(
      visibleNames(rows(), {
        facets: facets({ mode: ['buy_before', 'buy_local'], category: ['Food'] }),
      }),
    ).toEqual(['Bread'])
  })

  it('filters by traveler, with the shared bucket addressed as the empty value (FR-25.11f)', () => {
    const items = [
      item({ name: 'Shared' }),
      item({ name: 'Andys', assigned_traveler_id: andy.id }),
      item({ name: 'Leos', assigned_traveler_id: leo.id }),
    ]
    expect(visibleNames(items, { facets: facets({ person: [''] }) })).toEqual(['Shared'])
    expect(visibleNames(items, { facets: facets({ person: ['', leo.id] }) })).toEqual([
      'Shared',
      'Leos',
    ])
  })

  it('filters by luggage, addressing "no container" as the empty value', () => {
    const bag: Container = {
      id: 'c1',
      trip_id: 't1',
      name: 'Suitcase',
      carrier_traveler_id: null,
      max_weight_grams: null,
      paired_container_id: null,
    }
    const items = [item({ name: 'Loose' }), item({ name: 'Stowed', container_id: bag.id })]
    expect(
      visibleNames(items, { containers: [bag], facets: facets({ container: [bag.id] }) }),
    ).toEqual(['Stowed'])
    expect(visibleNames(items, { containers: [bag], facets: facets({ container: [''] }) })).toEqual(
      ['Loose'],
    )
  })

  it('ORs the Merkmale facet across late packer, missing and open preparation', () => {
    const prepped = item({ name: 'Camera' })
    const items = [
      item({ name: 'Plain' }),
      item({ name: 'Late', late_packer: true }),
      item({ name: 'Missing', flag_missing: true }),
      prepped,
    ]
    expect(
      visibleNames(items, {
        itemsWithOpenPrep: [prepped.id],
        facets: facets({ flag: ['late', 'prep'] }),
      }),
    ).toEqual(['Late', 'Camera'])
  })

  it('counts an active filter for the badge and reports it as a narrowing (FR-25.11a/e)', () => {
    const result = view(rows(), { facets: facets({ mode: ['pack'], category: ['Clothing'] }) })
    expect(result.activeFacetCount).toBe(2)
    expect(result.narrowed).toBe(true)
    expect(result.matchCount).toBe(1)
  })
})

describe('facet values and their counts (FR-25.11d)', () => {
  const rows = () => [
    item({ name: 'Socks', mode: 'pack', category_name: 'Clothing' }),
    item({ name: 'Shirt', mode: 'pack', category_name: 'Clothing' }),
    item({ name: 'Sunscreen', mode: 'buy_before', category_name: 'Toiletries' }),
    item({ name: 'Bread', mode: 'buy_local', category_name: 'Food' }),
  ]

  function countOf(result: ReturnType<typeof view>, facet: keyof Facets, value: string) {
    return result.facetValues[facet].find((v) => v.value === value)?.count
  }

  it('counts a value against the other active facets but not its own', () => {
    // Category=Clothing is in force: the mode counts describe what picking a
    // mode would yield *within* that category, while the category counts stay
    // free of their own facet so the other categories remain reachable.
    const result = view(rows(), { facets: facets({ category: ['Clothing'] }) })
    expect(countOf(result, 'mode', 'pack')).toBe(2)
    expect(countOf(result, 'category', 'Toiletries')).toBe(1)
  })

  it('does not offer a dead end — an unselected value that would yield nothing is left out', () => {
    const result = view(rows(), { facets: facets({ category: ['Clothing'] }) })
    expect(result.facetValues.mode.map((v) => v.value)).toEqual(['pack'])
  })

  it('counts over open rows only — offering to filter for finished work misleads', () => {
    const result = view([
      item({ category_name: 'Clothing' }),
      packed({ category_name: 'Clothing' }),
    ])
    expect(countOf(result, 'category', 'Clothing')).toBe(1)
  })

  it('keeps a selected value listed at count 0, so a filter can always be undone from the sheet', () => {
    const result = view(rows(), { facets: facets({ category: ['Clothing'], mode: ['buy_local'] }) })
    const buyLocal = result.facetValues.mode.find((v) => v.value === 'buy_local')
    expect(buyLocal).toMatchObject({ count: 0, selected: true })
  })

  it('leads the person facet with the shared bucket rather than sorting it in (FR-25.11f)', () => {
    const result = view([
      item({ assigned_traveler_id: andy.id }),
      item({ assigned_traveler_id: leo.id }),
      item({ name: 'Shared' }),
    ])
    expect(result.facetValues.person.map((v) => v.value)).toEqual(['', andy.id, leo.id])
    expect(result.facetValues.person[0]?.label).toBeNull()
  })

  it('labels the values it can and leaves the wording to the caller where it is UI copy', () => {
    const result = view([item({ assigned_traveler_id: andy.id, category_name: 'Clothing' })])
    expect(result.facetValues.person.find((v) => v.value === andy.id)?.label).toBe('Andy')
    expect(result.facetValues.category[0]?.label).toBe('Clothing')
    expect(result.facetValues.mode.every((v) => v.label === null)).toBe(true)
    expect(result.facetValues.flag.every((v) => v.label === null)).toBe(true)
  })

  it('offers the modes in packing order rather than alphabetically', () => {
    const result = view(rows())
    expect(result.facetValues.mode.map((v) => v.value)).toEqual(['pack', 'buy_before', 'buy_local'])
  })
})

describe('search (FR-25.11k)', () => {
  const rows = () => [item({ name: 'Wool socks' }), item({ name: 'Sunscreen' })]

  it('matches the item name case-insensitively', () => {
    expect(visibleNames(rows(), { search: 'SOCK' })).toEqual(['Wool socks'])
  })

  it('ignores surrounding whitespace, and an all-whitespace term narrows nothing', () => {
    expect(visibleNames(rows(), { search: '  sun ' })).toEqual(['Sunscreen'])
    expect(view(rows(), { search: '   ' }).narrowed).toBe(false)
  })

  it('is a narrowing, so an empty result can never read as "everything is packed" (FR-25.11e)', () => {
    const result = view(rows(), { search: 'kayak' })
    expect(result.groups).toHaveLength(0)
    expect(result.narrowed).toBe(true)
  })
})

describe("other people's rows are hidden by default (FR-25.20)", () => {
  const mine = (over: Partial<TripItem> = {}) => item({ name: 'Mine', packer_user_id: ME, ...over })
  const sias = (over: Partial<TripItem> = {}) =>
    item({ name: 'Sias', packer_user_id: 'u-sia', ...over })
  const toms = () => item({ name: 'Toms', packer_user_id: 'u-tom' })
  const nobodys = () => item({ name: 'Nobodys' })

  it('hides rows somebody else is responsible for', () => {
    expect(visibleNames([mine(), sias(), nobodys()])).toEqual(['Mine', 'Nobodys'])
  })

  it('keeps unassigned rows — nobody has claimed them, so they are everybody’s', () => {
    expect(visibleNames([sias(), nobodys()])).toEqual(['Nobodys'])
  })

  it('never hides silently: the reveal bar gets the count and the people, by name', () => {
    const result = view([mine(), sias(), sias(), toms()])
    expect(result.hiddenOtherCount).toBe(3)
    expect(result.hiddenOtherNames).toEqual(['Sia', 'Tom'])
  })

  it('reveals them on request, and then reports nothing left to reveal', () => {
    const result = view([mine(), sias()], { showOthers: true })
    expect(result.hiddenOtherCount).toBe(0)
    expect(result.groups.flatMap((g) => g.entries)).toHaveLength(2)
  })

  it('counts only what revealing would actually show — a facet already excludes the rest', () => {
    const result = view([sias({ category_name: 'Clothing' }), sias({ category_name: 'Food' })], {
      facets: facets({ category: ['Food'] }),
    })
    expect(result.hiddenOtherCount).toBe(1)
  })

  it('hides nothing when there is no current user — nothing is assignable in Single-User or Local Mode', () => {
    expect(visibleNames([mine(), sias()], { currentUserId: null })).toEqual(['Mine', 'Sias'])
  })

  it('is a narrowing while it hides something, so completion cannot be announced over it', () => {
    expect(view([mine(), sias()]).narrowed).toBe(true)
    expect(view([mine()]).narrowed).toBe(false)
  })

  it('does not hide the record of who packed a row — only the assignment decides', () => {
    // packed_by_user_id is the record (FR-25.19); reading it here would hide
    // rows nobody is responsible for just because someone else packed them.
    const packedBySia = item({ name: 'Free', packed_by_user_id: 'u-sia' })
    expect(visibleNames([packedBySia])).toEqual(['Free'])
  })
})

describe('folding groups (FR-25.16)', () => {
  const rows = () => [
    item({ name: 'Socks', category_name: 'Clothing' }),
    packed({ name: 'Towel', category_name: 'Clothing' }),
    item({ name: 'Bread', category_name: 'Food' }),
  ]

  it('marks a group as folded and keeps the rest expanded', () => {
    const result = view(rows(), { collapsedGroups: ['Clothing'] })
    expect(result.groups.map((g) => [g.name, g.collapsed])).toEqual([
      ['Clothing', true],
      ['Food', false],
    ])
  })

  it('carries the open count on the folded header — collapsed, it is all that is left', () => {
    const result = view(rows(), { collapsedGroups: ['Clothing'] })
    const clothing = result.groups[0]
    expect(clothing?.openCount).toBe(1)
    expect(clothing?.doneCount).toBe(1)
    expect(clothing?.totalCount).toBe(2)
  })

  it('does not resurrect a group whose rows are all done — folding is view, doneness is content', () => {
    const result = view([packed({ category_name: 'Clothing' }), item({ category_name: 'Food' })], {
      collapsedGroups: ['Clothing'],
    })
    expect(result.groups.map((g) => g.name)).toEqual(['Food'])
  })

  it('folds by group key, so the same fold survives a re-render after packing a row', () => {
    const result = view(rows(), { collapsedGroups: ['Clothing'], showDone: true })
    expect(result.groups.find((g) => g.name === 'Clothing')?.collapsed).toBe(true)
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
