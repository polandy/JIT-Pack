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

import {
  buildPackingView,
  isDone,
  NO_VALUE,
  noFacets,
  rowEdgeAvatar,
  isReshaped,
} from '../packingView'
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
    bought_from: null,
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
    showLate: true,
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
    // Three rows, five units (FR-25.22): the header counts what is packed,
    // not how many lines reached the end.
    const result = view([item(), packed(), packed()])
    expect(result.groups[0]?.doneCount).toBe(4)
    expect(result.groups[0]?.totalCount).toBe(5)
  })

  it('counts a part-packed row as the units it has, not as nothing (FR-25.22)', () => {
    const result = view([item({ quantity: 4, packed_count: 3 })])
    expect(result.groups[0]?.doneCount).toBe(3)
    expect(result.groups[0]?.totalCount).toBe(4)
    // The rule it replaces: as a row it is not done, and would have read 0/1.
    expect(result.groups[0]?.entries).toHaveLength(1)
  })

  it('counts open rows as rows, whatever their quantity (FR-25.11e via FR-25.22)', () => {
    // The sentence this feeds says how many *Sachen* are behind the filter,
    // and it is a subtraction against the rows on screen — so a row of six
    // must weigh one, or a list hiding nothing reports five hidden things.
    const result = view([item({ quantity: 6 }), packed(), item({ quantity: 1 })])
    expect(result.openRowCount).toBe(2)
  })

  it('counts open rows over the whole trip, not over the filtered set', () => {
    const result = view([item({ name: 'Zelt' }), item({ name: 'Kocher' })], { search: 'Zelt' })
    expect(result.groups[0]?.entries).toHaveLength(1)
    expect(result.openRowCount).toBe(2)
  })

  it('counts a skipped row as no units — neither packed nor owed (amends FR-25.22)', () => {
    const result = view([item({ quantity: 0, packed_count: 0, state: 'skipped' })], {
      showDone: true,
    })
    expect(result.groups[0]?.doneCount).toBe(0)
    expect(result.groups[0]?.totalCount).toBe(0)
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

  it('carries the master item the instances came from, so the head can render its mark (FR-28.4)', () => {
    const result = view([shorts(andy), shorts(leo)])
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(entry.sourceItemId).toBe('src-shorts')

    // An ad-hoc name clusters by name and has no master item behind it.
    const adHoc = view([
      item({ name: 'Velohelm', source_item_id: null, assigned_traveler_id: andy.id }),
      item({ name: 'Velohelm', source_item_id: null, assigned_traveler_id: leo.id }),
    ])
    const [bare] = adHoc.groups[0]?.entries ?? []
    if (bare?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(bare.sourceItemId).toBeNull()
  })

  it('names the item once and counts the units of its instances (FR-25.22)', () => {
    const result = view(
      [shorts(andy), shorts(leo, { quantity: 2, packed_count: 2, state: 'packed' })],
      {
        showDone: true,
      },
    )
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    // Two travelers, three units — the head is the sum of its children and
    // not a count of people, which is what FR-25.21(a) had it be.
    expect(entry.doneCount).toBe(2)
    expect(entry.totalCount).toBe(3)
  })

  it('hides a done child but keeps the cluster count over the full set (FR-25.2)', () => {
    const result = view([
      shorts(andy),
      shorts(leo, { quantity: 2, packed_count: 2, state: 'packed' }),
    ])
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(entry.children).toHaveLength(1)
    expect(entry.doneCount).toBe(2)
    expect(entry.totalCount).toBe(3)
  })

  it('names every instance it counts, so the head can act on all of them (FR-25.26)', () => {
    const result = view(
      [
        shorts(andy, { id: 'a' }),
        // Hidden as done, but still one of the four the head answers for —
        // a „für alle" that skipped it would act on a narrower set than the
        // head's own count describes.
        shorts(leo, { id: 'b', quantity: 1, packed_count: 1, state: 'packed' }),
        shorts(mia, { id: 'c' }),
      ],
      { showDone: false },
    )
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(entry.children).toHaveLength(2)
    expect(entry.instanceIds).toEqual(['a', 'b', 'c'])
  })

  it('leaves a filtered-out instance out of the set the head acts on (FR-25.26)', () => {
    // The head counts what the filter lets through, so that is also what it
    // may write: a facet the reader can see is narrowing the list must not be
    // contradicted by an action that reaches past it.
    const result = view([shorts(andy, { id: 'a' }), shorts(leo, { id: 'b', mode: 'buy_before' })], {
      facets: { ...noFacets(), mode: ['pack'] },
    })
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(entry.instanceIds).toEqual(['a'])
  })

  it('drops the whole cluster once every instance is done', () => {
    const done = { quantity: 2, packed_count: 2, state: 'packed' as const }
    const result = view([shorts(andy, done), shorts(leo, done)])
    expect(result.groups).toHaveLength(0)
  })

  describe('the cluster folds, and is shut by default (FR-25.23)', () => {
    it('is collapsed unless the caller names it expanded, unlike a group', () => {
      const result = view([shorts(andy), shorts(leo)])
      const [entry] = result.groups[0]?.entries ?? []
      if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
      // The defect FR-25.23 answers: the head is an *extra* line over rows
      // that are always open, so a cluster costs more lines than it saves.
      expect(entry.collapsed).toBe(true)
    })

    it('expands exactly the cluster whose key was named', () => {
      const items = [
        shorts(andy),
        shorts(leo),
        item({ name: 'Jacket', source_item_id: 'src-jacket', assigned_traveler_id: andy.id }),
        item({ name: 'Jacket', source_item_id: 'src-jacket', assigned_traveler_id: leo.id }),
      ]
      const shut = view(items)
      const shortsEntry = shut.groups[0]?.entries.find(
        (e) => e.kind === 'cluster' && e.name === 'Shorts',
      )
      if (shortsEntry?.kind !== 'cluster') throw new Error('expected a cluster')
      const shortsKey = shortsEntry.key

      const result = view(items, { expandedClusters: [shortsKey] })
      const byName = new Map(
        result.groups[0]?.entries
          .filter((e) => e.kind === 'cluster')
          .map((e) => [e.name, e.collapsed]),
      )
      expect(byName.get('Shorts')).toBe(false)
      expect(byName.get('Jacket')).toBe(true)
    })

    it('builds the children even while shut, so unfolding costs no rebuild', () => {
      const result = view([shorts(andy), shorts(leo)])
      const [entry] = result.groups[0]?.entries ?? []
      if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
      expect(entry.collapsed).toBe(true)
      expect(entry.children).toHaveLength(2)
    })

    it('answers with the open units a shut head hides, like FR-25.16 does for a group', () => {
      const result = view([
        shorts(andy, { quantity: 2 }),
        shorts(leo, { quantity: 3, packed_count: 1 }),
      ])
      const [entry] = result.groups[0]?.entries ?? []
      if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
      // Units, not people (FR-25.22): five wanted, one packed, four still open.
      expect(entry.totalCount).toBe(5)
      expect(entry.doneCount).toBe(1)
      expect(entry.openCount).toBe(4)
    })

    it('carries one face per instance over the full set, so a shut head still says who', () => {
      const result = view([
        shorts(andy),
        shorts(leo, { quantity: 2, packed_count: 2, state: 'packed' }),
        shorts(mia),
      ])
      const [entry] = result.groups[0]?.entries ?? []
      if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
      // Leo's row is hidden (FR-25.2) but his face is not: the shut head
      // stands in for every instance, including the ones already packed —
      // the same set its done/total counts.
      expect(entry.children).toHaveLength(2)
      expect(entry.faces.map((f) => f.traveler?.name)).toEqual(['Andy', 'Leo', 'Mia'])
      expect(entry.faces.map((f) => f.done)).toEqual([false, true, false])
    })

    it('orders the faces by the trip roster, not by when the rows were made', () => {
      const result = view([shorts(mia), shorts(andy), shorts(leo)])
      const [entry] = result.groups[0]?.entries ?? []
      if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
      expect(entry.faces.map((f) => f.traveler?.name)).toEqual(['Andy', 'Leo', 'Mia'])
    })
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

  it('keeps cluster-vs-flat decided over the full set when a facet other than Person hides an instance', () => {
    // Leo's shorts are in a bag, Andy's are not: narrowing to the bag must not
    // turn the item into a flat row, since the bag is not whose things these are.
    const result = view([shorts(andy), shorts(leo, { container_id: 'bag' })], {
      facets: facets({ container: [NO_VALUE] }),
    })
    expect(result.groups[0]?.entries[0]?.kind).toBe('cluster')
  })

  describe('the Person facet shapes the cluster (FR-25.30)', () => {
    it('renders the one person left as a plain row, checkable without opening anything', () => {
      const result = view([shorts(andy), shorts(leo), shorts(mia)], {
        facets: facets({ person: [andy.id] }),
      })
      const [entry] = result.groups[0]?.entries ?? []
      expect(entry?.kind).toBe('item')
      if (entry?.kind !== 'item') return
      expect(entry.traveler?.id).toBe(andy.id)
      // The chip row already names Andy; saying it again on every row is noise.
      expect(entry.label).toBe('Shorts')
    })

    it('keeps a cluster when two of the chosen people have one', () => {
      const result = view([shorts(andy), shorts(leo), shorts(mia)], {
        facets: facets({ person: [andy.id, leo.id] }),
      })
      const [entry] = result.groups[0]?.entries ?? []
      expect(entry?.kind).toBe('cluster')
      if (entry?.kind !== 'cluster') return
      expect(entry.faces.map((f) => f.traveler?.name)).toEqual(['Andy', 'Leo'])
    })

    it('names the person on a lone row when several people are chosen, since no one chip says who', () => {
      const result = view([shorts(andy), shorts(mia)], {
        facets: facets({ person: [andy.id, leo.id] }),
      })
      const [entry] = result.groups[0]?.entries ?? []
      expect(entry?.kind).toBe('item')
      if (entry?.kind !== 'item') return
      expect(entry.label).toBe('Shorts · Andy')
    })

    it('does not flip back into a cluster when the one row left is packed and revealed', () => {
      // The shape is the facet's, not the done rule's (FR-25.1): packing is
      // not a choice about the list, so it must not restructure it.
      const result = view([shorts(andy, { packed_count: 1, state: 'packed' }), shorts(leo)], {
        facets: facets({ person: [andy.id] }),
        showDone: true,
      })
      const [entry] = result.groups[0]?.entries ?? []
      expect(entry?.kind).toBe('item')
    })

    it('counts the plain row with the same units the cluster would have', () => {
      const result = view([shorts(andy, { quantity: 5, packed_count: 2 }), shorts(leo)], {
        facets: facets({ person: [andy.id] }),
      })
      expect(result.groups[0]?.doneCount).toBe(2)
      expect(result.groups[0]?.totalCount).toBe(5)
    })
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
    // Sorted: this case is about which rows the OR lets through, and the
    // flagged one sinks past the others since FR-25.27.
    expect(
      visibleNames(items, {
        itemsWithOpenPrep: [prepped.id],
        facets: facets({ flag: ['late', 'prep'] }),
      }).sort(),
    ).toEqual(['Camera', 'Late'])
  })

  it('counts an active filter for the badge and reports it as a narrowing (FR-25.11a/e)', () => {
    const result = view(rows(), { facets: facets({ mode: ['pack'], category: ['Clothing'] }) })
    expect(result.activeFacetCount).toBe(2)
    expect(result.narrowed).toBe(true)
    expect(result.matchCount).toBe(1)
  })
})

describe('status facet (FR-25.11l)', () => {
  it('buckets packing_now and partial together with open, under "not_packed"', () => {
    const openRow = item({ name: 'Open', state: 'open' })
    const packingNow = item({ name: 'PackingNow', state: 'packing_now' })
    const partial = item({ name: 'Partial', quantity: 3, packed_count: 1, state: 'partial' })
    const skipped = item({ name: 'Skipped', state: 'skipped' })
    const done = packed({ name: 'Packed' })

    // showDone: true so a selection's own done-ness never hides it here — this
    // test is only about which bucket a row lands in.
    const selecting = (value: string) =>
      visibleNames([openRow, packingNow, partial, skipped, done], {
        showDone: true,
        facets: facets({ status: [value] }),
      })

    expect(selecting('not_packed')).toEqual(['Open', 'PackingNow', 'Partial'])
    expect(selecting('packed')).toEqual(['Packed'])
    expect(selecting('skipped')).toEqual(['Skipped'])
  })

  it('reveals exactly the selected done bucket even while Erledigte is off', () => {
    const openRow = item({ name: 'Open' })
    const skipped = item({ name: 'Skipped', state: 'skipped' })
    const done = packed({ name: 'Packed' })
    const items = [openRow, skipped, done]

    // Selecting "gepackt" with the reveal switch off would otherwise match the
    // row in passesFacets and then hide it again as done — a filter reporting
    // a count of 1 that renders nothing.
    expect(
      visibleNames(items, { showDone: false, facets: facets({ status: ['packed'] }) }),
    ).toEqual(['Packed'])
    expect(
      visibleNames(items, { showDone: false, facets: facets({ status: ['skipped'] }) }),
    ).toEqual(['Skipped'])
    expect(
      visibleNames(items, { showDone: false, facets: facets({ status: ['not_packed'] }) }),
    ).toEqual(['Open'])
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

  it('counts Status over every row, not just open ones — the opposite of every other facet', () => {
    // Every other facet's count is deliberately blind to done rows (see the
    // "counts over open rows only" case above); Status is the one axis whose
    // whole purpose is naming a done-state, so it must count all of them.
    const result = view([
      item({ category_name: 'Clothing' }),
      packed({ category_name: 'Clothing' }),
      item({ category_name: 'Clothing', state: 'skipped' }),
    ])
    expect(countOf(result, 'status', 'not_packed')).toBe(1)
    expect(countOf(result, 'status', 'packed')).toBe(1)
    expect(countOf(result, 'status', 'skipped')).toBe(1)
  })

  it('offers Status in packed/skipped/not_packed order', () => {
    const result = view([item({ state: 'skipped' }), packed(), item()])
    expect(result.facetValues.status.map((v) => v.value)).toEqual([
      'packed',
      'skipped',
      'not_packed',
    ])
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
    expect(clothing?.doneCount).toBe(2)
    expect(clothing?.totalCount).toBe(3)
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

describe('the closing pass lists what was packed (FR-9.3)', () => {
  it('keeps packed rows and drops what was never packed', () => {
    const names = visibleNames(
      [
        packed({ name: 'Stativ' }),
        item({ name: 'Zelt', packed_count: 1, quantity: 3 }),
        item({ name: 'Regenjacke' }),
      ],
      { packedOnly: true, showDone: true },
    )

    // A partly packed row was taken along, so it can have gone unused; a
    // row nobody packed was forgotten, and that is not the same judgement.
    expect(names).toEqual(['Stativ', 'Zelt'])
  })

  it('does not sink its done rows: everything here was packed (2026-09-06)', () => {
    // The list order is the trip's, and in the closing pass "done" only
    // separates fully packed from partly packed — sorting a review by that
    // moves rows for a reason the reviewer never asked about. This case is
    // how the sink was found reaching in here at all.
    const names = visibleNames(
      [packed({ name: 'Stativ' }), item({ name: 'Zelt', packed_count: 1, quantity: 3 })],
      { packedOnly: true, showDone: true },
    )
    expect(names).toEqual(['Stativ', 'Zelt'])
  })

  it('drops a consciously skipped row — that judgement is already made, and it is the opposite one', () => {
    const names = visibleNames(
      [packed({ name: 'Stativ' }), item({ name: 'Drohne', state: 'skipped' })],
      { packedOnly: true, showDone: true },
    )

    expect(names).toEqual(['Stativ'])
  })

  it('keeps a per-person cluster, with only the travelers who packed theirs', () => {
    const shorts = (travelerId: string, over: Partial<TripItem> = {}) =>
      item({
        name: 'Shorts',
        source_item_id: 'src-shorts',
        assigned_traveler_id: travelerId,
        ...over,
      })

    const result = view([shorts(andy.id, { packed_count: 1, state: 'packed' }), shorts(leo.id)], {
      packedOnly: true,
      showDone: true,
    })

    const [entry] = result.groups[0]?.entries ?? []
    // The pass asks one question per row, and a cluster's rows are its
    // children — so the cluster survives with the child that can answer.
    expect(entry?.kind).toBe('cluster')
    if (entry?.kind !== 'cluster') return
    expect(entry.children.map((c) => c.traveler?.name)).toEqual(['Andy'])
  })

  it('leaves the ordinary list alone — packed rows only is the pass, not the screen', () => {
    const names = visibleNames([packed({ name: 'Stativ' }), item({ name: 'Regenjacke' })], {
      showDone: true,
    })

    expect(names).toContain('Regenjacke')
  })
})

describe("the row's edge avatar (FR-25.19)", () => {
  it('names the responsible person while the row is open', () => {
    expect(rowEdgeAvatar(item({ packer_user_id: 'u-sia' }))).toEqual({
      variant: 'assignee',
      id: 'u-sia',
    })
  })

  it('names the packer once the row is packed', () => {
    expect(rowEdgeAvatar(packed({ packed_by_user_id: 'u-andy' }))).toEqual({
      variant: 'packer',
      id: 'u-andy',
    })
  })

  it('shows the packer and not the assignee when a row was packed by somebody else', () => {
    // The rule the FR spells out as "never both": Sia was responsible, Andy
    // packed it, and the row has one right edge. Showing the assignee too
    // would leave the row claiming an open job it no longer has.
    const both = packed({ packer_user_id: 'u-sia', packed_by_user_id: 'u-andy' })
    expect(rowEdgeAvatar(both)).toEqual({ variant: 'packer', id: 'u-andy' })
  })

  it('shows nothing where nobody is named — an avatar is a fact, not a placeholder', () => {
    expect(rowEdgeAvatar(item())).toBeNull()
  })

  it('is decided by the columns, not by doneness', () => {
    // A row can carry the packing record while it is open again (FR-25.2's
    // undo restores `packed_count` and `state`, never the record), and the
    // stamp is what says so. Deriving the edge from `done` instead would
    // silently swap the avatar back to the assignee at that moment.
    const undone = item({ packer_user_id: 'u-sia', packed_by_user_id: 'u-andy' })
    expect(rowEdgeAvatar(undone)).toEqual({ variant: 'packer', id: 'u-andy' })
  })
})

describe('done entries sink to the end of their group (FR-25.2, 2026-09-06)', () => {
  const shorts = (traveler: Traveler, over: Partial<TripItem> = {}) =>
    item({
      name: 'Shorts',
      source_item_id: 'src-shorts',
      assigned_traveler_id: traveler.id,
      ...over,
    })

  it('drops done rows behind the open ones without reordering either side', () => {
    const rows = [
      item({ name: 'Zelt' }),
      packed({ name: 'Schlafsack' }),
      item({ name: 'Isomatte' }),
      packed({ name: 'Gaskocher' }),
      item({ name: 'Stirnlampe' }),
    ]

    // Revealed, because hidden rows cannot be out of order (FR-25.2's
    // default is what the reveal toggle turns off).
    expect(visibleNames(rows, { showDone: true })).toEqual([
      'Zelt',
      'Isomatte',
      'Stirnlampe',
      'Schlafsack',
      'Gaskocher',
    ])
  })

  it('is inert while the done rows are hidden, which is the default', () => {
    // The positive signal that the partition is not reordering open rows:
    // the same list with nothing to sink comes back exactly as it went in.
    const rows = [
      item({ name: 'Zelt' }),
      packed({ name: 'Schlafsack' }),
      item({ name: 'Isomatte' }),
    ]
    expect(visibleNames(rows)).toEqual(['Zelt', 'Isomatte'])
  })

  it('keeps a cluster up while any visible instance is open, and sinks it once none is', () => {
    const halfDone = [
      item({ name: 'Zelt' }),
      shorts(andy, { quantity: 2, packed_count: 2, state: 'packed' }),
      shorts(leo),
      packed({ name: 'Gaskocher' }),
    ]
    // One open instance holds the whole cluster with the open rows: the head
    // names one item and cannot be in two places.
    expect(visibleNames(halfDone, { showDone: true })).toEqual([
      'Zelt',
      'Shorts',
      'Shorts',
      'Gaskocher',
    ])

    const allDone = [
      item({ name: 'Zelt' }),
      shorts(andy, { quantity: 2, packed_count: 2, state: 'packed' }),
      shorts(leo, { quantity: 2, packed_count: 2, state: 'packed' }),
      item({ name: 'Isomatte' }),
    ]
    expect(visibleNames(allDone, { showDone: true })).toEqual([
      'Zelt',
      'Isomatte',
      'Shorts',
      'Shorts',
    ])
  })

  it('leaves the people inside a cluster in traveler order, done or not', () => {
    // Inside a cluster the axis is who, not progress — sorting by progress
    // would move a person's row out from under their own hand.
    const result = view(
      [shorts(andy, { quantity: 2, packed_count: 2, state: 'packed' }), shorts(leo)],
      {
        showDone: true,
      },
    )
    const [entry] = result.groups[0]?.entries ?? []
    if (entry?.kind !== 'cluster') throw new Error('expected a cluster')
    expect(entry.children.map((c) => c.traveler?.name)).toEqual(['Andy', 'Leo'])
    expect(entry.children.map((c) => c.done)).toEqual([true, false])
  })
})

describe('late-packer rows sink, and can be hidden (FR-25.27)', () => {
  const late = (over: Partial<TripItem> = {}) => item({ late_packer: true, ...over })

  const keys = (over: Partial<TripItem> = {}) => late({ name: 'Schlüssel', ...over })

  const toothbrush = (traveler: Traveler, over: Partial<TripItem> = {}) =>
    item({
      name: 'Zahnbürste',
      source_item_id: 'src-brush',
      assigned_traveler_id: traveler.id,
      ...over,
    })

  it('sinks a late-packer row below the open rows but above the done ones', () => {
    const rows = [
      keys(),
      item({ name: 'Zelt' }),
      packed({ name: 'Schlafsack' }),
      item({ name: 'Isomatte' }),
    ]

    // Three tiers in one order: what is still to do, what is done last,
    // what needs nothing at all.
    expect(visibleNames(rows, { showDone: true })).toEqual([
      'Zelt',
      'Isomatte',
      'Schlüssel',
      'Schlafsack',
    ])
  })

  it('leaves a list with nothing flagged exactly as it arrived', () => {
    // The positive signal that the second partition is not reordering on its
    // own: the same rows without the flag come back in input order.
    const rows = [item({ name: 'Zelt' }), item({ name: 'Isomatte' }), item({ name: 'Stirnlampe' })]
    expect(visibleNames(rows)).toEqual(['Zelt', 'Isomatte', 'Stirnlampe'])
  })

  it('sinks a cluster as soon as one visible instance is flagged', () => {
    // Same rule the ⏰ on the head follows: a warning that only holds for
    // some children is one the reader misses.
    const rows = [toothbrush(andy, { late_packer: true }), toothbrush(leo), item({ name: 'Zelt' })]
    expect(visibleNames(rows)).toEqual(['Zelt', 'Zahnbürste', 'Zahnbürste'])
  })

  it('hides the flagged rows when the switch is off, and says how many', () => {
    const rows = [keys(), item({ name: 'Zelt' }), late({ name: 'Zahnbürste' })]

    expect(visibleNames(rows, { showLate: false })).toEqual(['Zelt'])
    expect(view(rows, { showLate: false }).lateCount).toBe(2)

    // The count labels the same set in both directions, like the Erledigte
    // bar and its switch (FR-25.22): it says what the switch is about, not
    // which way the switch currently stands.
    expect(view(rows, { showLate: true }).lateCount).toBe(2)
    expect(visibleNames(rows, { showLate: true })).toEqual(['Zelt', 'Schlüssel', 'Zahnbürste'])
  })

  it('does not promise rows another rule is already hiding', () => {
    // Both hiding rules bite the same row: whichever bar is tapped, the row
    // stays away, so neither may count it (FR-25.20's rule, mirrored).
    const both = item({ name: 'Sias Schlüssel', late_packer: true, packer_user_id: 'u-sia' })
    const result = view([both, item({ name: 'Zelt' })], { showLate: false })
    expect(result.lateCount).toBe(0)
    expect(result.hiddenOtherCount).toBe(0)
  })

  it('a done late-packer row is not offered for revealing either', () => {
    const rows = [packed({ name: 'Schlüssel', late_packer: true }), item({ name: 'Zelt' })]
    expect(view(rows, { showLate: false }).lateCount).toBe(0)
  })

  it('picking ⏰ in the Merkmale facet overrides the switch', () => {
    // Asking to see exactly those rows and being shown none of them is the
    // FR-25.11l trap on a second axis.
    const rows = [keys(), item({ name: 'Zelt' })]
    const result = view(rows, { showLate: false, facets: facets({ flag: ['late'] }) })
    expect(
      result.groups
        .flatMap((g) => g.entries)
        .map((e) => (e.kind === 'item' ? e.item.name : e.name)),
    ).toEqual(['Schlüssel'])
    expect(result.lateCount).toBe(0)
  })

  it('reports the list as narrowed while flagged rows are hidden', () => {
    // Otherwise a list whose remainder is all late-packers renders
    // "everything is packed" over rows nobody has touched.
    expect(view([keys()], { showLate: false }).narrowed).toBe(true)
    expect(view([keys()], { showLate: true }).narrowed).toBe(false)
  })
})

describe('FR-25.28: isReshaped — an item changing shape leaves at once', () => {
  const KEY = 'name:kurze hosen'
  const shown = (keys: string[], rowIds: string[]) => ({
    keys: new Set(keys),
    rowIds: new Set(rowIds),
  })

  it('a row whose item is now a cluster is reshaped: the row lives on as a child', () => {
    // Re-pointed (ADR-036): the same row id, now drawn under the cluster.
    expect(
      isReshaped({ key: KEY, rowId: 'r1' }, shown([KEY], ['r1', 'r2']), new Set(['r1', 'r2'])),
    ).toBe(true)
  })

  it('a row deleted by a membership change is reshaped while a sibling still shows the item', () => {
    // M5's strip unlit this traveler: the row is gone, the item is not.
    expect(
      isReshaped({ key: KEY, rowId: 'r-leo' }, shown([KEY], ['r-andy']), new Set(['r-andy'])),
    ).toBe(true)
  })

  it('a cluster or a strip is reshaped exactly when its item is still shown', () => {
    expect(isReshaped({ key: KEY, rowId: null }, shown([KEY], ['r1']), new Set(['r1']))).toBe(true)
    expect(isReshaped({ key: KEY, rowId: null }, shown([], []), new Set(['r1']))).toBe(false)
  })

  it('a packed row keeps its collapse, even with a sibling instance still on screen', () => {
    // Grouped by traveler: Andy packed his, Leonardo's is still open. The row
    // exists and is simply no longer shown — hidden, not reshaped.
    expect(
      isReshaped(
        { key: KEY, rowId: 'r-andy' },
        shown([KEY], ['r-leo']),
        new Set(['r-andy', 'r-leo']),
      ),
    ).toBe(false)
  })

  it('a row taken off the list altogether keeps its collapse (FR-5.8)', () => {
    expect(isReshaped({ key: KEY, rowId: 'r1' }, shown([], []), new Set())).toBe(false)
  })
})
