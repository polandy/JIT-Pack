import { describe, it, expect } from 'vitest'
import {
  groupByPrimaryTag,
  tagsOfItem,
  tagNamesByItem,
  tagCounts,
  topTagsByCount,
  filterByTags,
  primaryPosition,
  planTagGrant,
  planTagRemoval,
  tagsOfItems,
  primaryTagOf,
  withCategories,
  UNTAGGED_KEY,
  tagDeletion,
  planTagMerge,
  planTagReorder,
  TAG_DELETE_ALLOWED,
  TAG_DELETE_REFUSED,
} from '@/domain/tags'
import type { ItemTag, MasterItem, Tag } from '@/types/domain'

/**
 * §3.24 tag rules (FR-24.1/24.2), pure — the M9 grouping and the M10 chip
 * order both read them, so they live here rather than in either screen.
 */

const tags: Tag[] = [
  { id: 't-kleidung', name: 'Kleidung', sort_order: 1 },
  { id: 't-sommer', name: 'Sommer', sort_order: 2 },
  { id: 't-technik', name: 'Technik', sort_order: 0 },
]

function item(id: string, name: string): MasterItem {
  return { id, name, weight_grams: null, value_cents: null }
}

function assign(item_id: string, tag_id: string, position: number): ItemTag {
  return { id: `${item_id}-${tag_id}`, item_id, tag_id, position }
}

describe('tagsOfItem (FR-24.1)', () => {
  it('returns the item’s tags ordered by position, primary first', () => {
    const assignments = [assign('i-badehose', 't-sommer', 1), assign('i-badehose', 't-kleidung', 0)]

    expect(tagsOfItem('i-badehose', assignments, tags).map((t) => t.name)).toEqual([
      'Kleidung',
      'Sommer',
    ])
  })

  it('orders by position, not by the tag’s own sort_order', () => {
    // Technik sorts first on the axis but is this item's *second* tag.
    const assignments = [assign('i-kabel', 't-technik', 1), assign('i-kabel', 't-kleidung', 0)]

    expect(tagsOfItem('i-kabel', assignments, tags).map((t) => t.name)).toEqual([
      'Kleidung',
      'Technik',
    ])
  })

  it('drops an assignment whose tag is gone rather than rendering a hole', () => {
    const assignments = [assign('i-x', 't-deleted', 0), assign('i-x', 't-sommer', 1)]

    expect(tagsOfItem('i-x', assignments, tags).map((t) => t.name)).toEqual(['Sommer'])
  })

  it('returns nothing for an item with no assignments', () => {
    expect(tagsOfItem('i-lose', [], tags)).toEqual([])
  })
})

describe('primaryTagOf (FR-24.2)', () => {
  it('is the lowest position, not the first row in the array', () => {
    const assignments = [assign('i-a', 't-sommer', 2), assign('i-a', 't-technik', 1)]

    expect(primaryTagOf('i-a', assignments, tags)?.name).toBe('Technik')
  })

  it('is undefined when the item carries no tag', () => {
    expect(primaryTagOf('i-lose', [], tags)).toBeUndefined()
  })
})

describe('groupByPrimaryTag (FR-24.2)', () => {
  const items = [
    item('i-shirt', 'Icebreaker'),
    item('i-kabel', 'Kabel'),
    item('i-lose', 'Sackmesser'),
  ]
  const assignments = [
    // Icebreaker is Kleidung *and* Sommer — it must appear once, under Kleidung.
    assign('i-shirt', 't-kleidung', 0),
    assign('i-shirt', 't-sommer', 1),
    assign('i-kabel', 't-technik', 0),
  ]

  it('files each item exactly once, under its primary tag', () => {
    const groups = groupByPrimaryTag(items, assignments, tags)

    const appearances = [...groups.values()].flat().filter((i) => i.id === 'i-shirt')
    expect(appearances).toHaveLength(1)
    expect(groups.get('Kleidung')?.map((i) => i.name)).toEqual(['Icebreaker'])
    expect(groups.get('Sommer')).toBeUndefined()
  })

  it('orders the groups by the tag’s sort_order, so the axis is stable', () => {
    const groups = groupByPrimaryTag(items, assignments, tags)

    // Technik has sort_order 0, Kleidung 1 — and the untagged bucket is last
    // regardless, because it is a leftover rather than a heading.
    expect([...groups.keys()]).toEqual(['Technik', 'Kleidung', UNTAGGED_KEY])
  })

  it('collects untagged items in their own bucket instead of dropping them', () => {
    const groups = groupByPrimaryTag(items, assignments, tags)

    expect(groups.get(UNTAGGED_KEY)?.map((i) => i.name)).toEqual(['Sackmesser'])
  })

  it('omits the untagged bucket entirely when every item carries a tag', () => {
    const groups = groupByPrimaryTag(items.slice(0, 2), assignments, tags)

    expect(groups.has(UNTAGGED_KEY)).toBe(false)
  })

  it('sorts items within a group by name', () => {
    const many = [item('i-b', 'Zelt'), item('i-a', 'Anorak')]
    const a = [assign('i-b', 't-kleidung', 0), assign('i-a', 't-kleidung', 0)]

    expect(
      groupByPrimaryTag(many, a, tags)
        .get('Kleidung')
        ?.map((i) => i.name),
    ).toEqual(['Anorak', 'Zelt'])
  })
})

describe('two tags at one position (FR-24.2)', () => {
  // Nothing in the schema stops it: a reorder is one mutation per row, so
  // the intermediate states are legal and a UNIQUE would refuse them.
  // What must not happen is the answer depending on the row order, which
  // is arrival order and therefore per device.
  const tied: ItemTag[] = [
    { id: 'a-zzz', item_id: 'i-tied', tag_id: 't-sommer', position: 0 },
    { id: 'a-aaa', item_id: 'i-tied', tag_id: 't-kleidung', position: 0 },
  ]

  it('breaks the tie on the assignment id, in either arrival order', () => {
    expect(primaryTagOf('i-tied', tied, tags)?.name).toBe('Kleidung')
    expect(primaryTagOf('i-tied', [...tied].reverse(), tags)?.name).toBe('Kleidung')
  })

  it('files the item under the same heading in either arrival order', () => {
    const one = groupByPrimaryTag([item('i-tied', 'Badehose')], tied, tags)
    const other = groupByPrimaryTag([item('i-tied', 'Badehose')], [...tied].reverse(), tags)

    expect([...one.keys()]).toEqual(['Kleidung'])
    expect([...other.keys()]).toEqual(['Kleidung'])
  })
})

/**
 * The grouping key a *trip* row snapshots (FR-24.2). It was a field on
 * `MasterItem` that nothing anywhere wrote — `items` has no such column —
 * so every row a Vorlage generated arrived with no category and landed in
 * M4's, M6's and M12's leftover bucket, while an item added by hand through
 * the quick-add got its tag. The rule is the item's *primary* tag, and it
 * lives here so the one place that knew it is no longer a view.
 */
describe('withCategories (FR-24.2)', () => {
  it('gives each item the name of its primary tag', () => {
    const items = [item('i-badehose', 'Badehose')]
    const assignments = [assign('i-badehose', 't-sommer', 1), assign('i-badehose', 't-kleidung', 0)]

    expect(withCategories(items, assignments, tags)[0]!.category_name).toBe('Kleidung')
  })

  it('says null for an untagged item rather than inventing a bucket name', () => {
    expect(withCategories([item('i-lose', 'Lose')], [], tags)[0]!.category_name).toBeNull()
  })

  it('skips an assignment whose tag is gone, as the grouping does', () => {
    const assignments = [assign('i-x', 't-deleted', 0), assign('i-x', 't-sommer', 1)]

    expect(withCategories([item('i-x', 'X')], assignments, tags)[0]!.category_name).toBe('Sommer')
  })

  it('breaks a tie on position by the assignment id, exactly as the grouping does', () => {
    const items = [item('i-tie', 'Tie')]
    const assignments = [assign('i-tie', 't-sommer', 0), assign('i-tie', 't-kleidung', 0)]
    const grouped = [...groupByPrimaryTag(items, assignments, tags).keys()]

    expect(withCategories(items, assignments, tags)[0]!.category_name).toBe(grouped[0])
  })

  it('keeps every other field of the item', () => {
    const one = { ...item('i-full', 'Full'), weight_grams: 120, icon: '🧦' }

    expect(withCategories([one], [], tags)[0]).toMatchObject({ ...one, category_name: null })
  })
})

describe('tagNamesByItem (FR-24.7)', () => {
  it('answers every item at once, each list primary first', () => {
    const assignments = [
      assign('i-badehose', 't-sommer', 1),
      assign('i-badehose', 't-kleidung', 0),
      assign('i-kabel', 't-technik', 0),
    ]

    const names = tagNamesByItem(assignments, tags)

    // The same order tagsOfItem gives one item — the M9 row's initial is read
    // from the first entry, so a different order here would refile the row.
    expect(names.get('i-badehose')).toEqual(['Kleidung', 'Sommer'])
    expect(names.get('i-kabel')).toEqual(['Technik'])
  })

  it('leaves an item with no assignment out rather than mapping it to an empty list', () => {
    const names = tagNamesByItem([assign('i-kabel', 't-technik', 0)], tags)

    expect(names.has('i-badehose')).toBe(false)
    expect(names.get('i-badehose')).toBeUndefined()
  })

  it('skips an assignment whose tag is gone, like tagsOfItem does', () => {
    // A pull can deliver the two tombstones in either order; half a row is
    // not a name.
    const assignments = [
      assign('i-badehose', 't-kleidung', 0),
      assign('i-badehose', 't-deleted', 1),
    ]

    expect(tagNamesByItem(assignments, tags).get('i-badehose')).toEqual(['Kleidung'])
  })

  it('breaks a shared position by the assignment id, as the grouping does', () => {
    const assignments = [assign('i-badehose', 't-sommer', 0), assign('i-badehose', 't-kleidung', 0)]

    // Two rows at one position is a legal intermediate state of a reorder
    // (FR-24.2); `i-badehose-t-kleidung` sorts before `i-badehose-t-sommer`.
    expect(tagNamesByItem(assignments, tags).get('i-badehose')).toEqual(['Kleidung', 'Sommer'])
  })
})

describe('tagCounts (FR-24.8)', () => {
  it('counts each tag over the items it was handed, not over the whole inventory', () => {
    const items = [item('i-badehose', 'Badehose'), item('i-kabel', 'Kabel')]
    const assignments = [
      assign('i-badehose', 't-kleidung', 0),
      assign('i-badehose', 't-sommer', 1),
      assign('i-kabel', 't-technik', 0),
      // A retired item M9 does not show: its assignment must not be counted.
      assign('i-retired', 't-technik', 0),
    ]

    const counts = tagCounts(items, assignments)

    expect(counts.get('t-kleidung')).toBe(1)
    expect(counts.get('t-sommer')).toBe(1)
    expect(counts.get('t-technik')).toBe(1)
  })

  it('leaves a tag nothing carries out of the map', () => {
    expect(tagCounts([item('i-kabel', 'Kabel')], []).size).toBe(0)
  })
})

describe('topTagsByCount (FR-24.8)', () => {
  const counts = new Map([
    ['t-kleidung', 4],
    ['t-sommer', 9],
    ['t-technik', 4],
  ])

  it('offers the biggest first — a shortcut to a tag holding one item saves nobody anything', () => {
    expect(topTagsByCount(tags, counts, 3).map((t) => t.name)).toEqual([
      'Sommer',
      'Technik',
      'Kleidung',
    ])
  })

  it('breaks a tie by the axis order, so two devices offer the same three', () => {
    // Kleidung and Technik both hold 4; Technik's sort_order is 0, Kleidung's 1.
    const top = topTagsByCount(tags, counts, 3)
    expect(top.map((t) => t.name).slice(1)).toEqual(['Technik', 'Kleidung'])
  })

  it('never offers a tag holding nothing', () => {
    const sparse = new Map([['t-sommer', 2]])
    expect(topTagsByCount(tags, sparse, 3).map((t) => t.name)).toEqual(['Sommer'])
  })

  it('honours the limit', () => {
    expect(topTagsByCount(tags, counts, 1).map((t) => t.name)).toEqual(['Sommer'])
  })
})

describe('filterByTags (FR-24.8)', () => {
  const items = [
    item('i-badehose', 'Badehose'),
    item('i-kabel', 'Kabel'),
    item('i-lose', 'Loses Teil'),
  ]
  const assignments = [
    assign('i-badehose', 't-kleidung', 0),
    assign('i-badehose', 't-sommer', 1),
    assign('i-kabel', 't-technik', 0),
  ]

  it('narrows nothing when nothing is selected', () => {
    expect(filterByTags(items, assignments, [], 'any')).toHaveLength(3)
  })

  it('matches the whole set, not the primary tag — the reach the grouping cannot give', () => {
    // Sommer is the swimsuit's *second* tag (FR-24.2).
    expect(filterByTags(items, assignments, ['t-sommer'], 'any').map((i) => i.id)).toEqual([
      'i-badehose',
    ])
  })

  it('widens under "any" and narrows under "all"', () => {
    const selection = ['t-sommer', 't-technik']

    expect(filterByTags(items, assignments, selection, 'any').map((i) => i.id)).toEqual([
      'i-badehose',
      'i-kabel',
    ])
    // Nothing carries both — which is the answer, not an empty result by accident.
    expect(filterByTags(items, assignments, selection, 'all')).toEqual([])
    expect(
      filterByTags(items, assignments, ['t-kleidung', 't-sommer'], 'all').map((i) => i.id),
    ).toEqual(['i-badehose'])
  })

  it('treats the untagged bucket as a member of the selection', () => {
    expect(filterByTags(items, assignments, [UNTAGGED_KEY], 'any').map((i) => i.id)).toEqual([
      'i-lose',
    ])
    expect(
      filterByTags(items, assignments, [UNTAGGED_KEY, 't-technik'], 'any').map((i) => i.id),
    ).toEqual(['i-kabel', 'i-lose'])
  })

  it('yields nothing when "all" asks for a tag and for no tag at once', () => {
    // Faithful rather than special-cased: an item cannot be both. The sheet
    // keeps the bucket exclusive so the control never offers this way in.
    expect(filterByTags(items, assignments, [UNTAGGED_KEY, 't-technik'], 'all')).toEqual([])
  })
})

describe('primaryPosition (FR-24.9)', () => {
  it('lands below every sibling rather than reindexing them', () => {
    const assignments = [assign('i-badehose', 't-kleidung', 0), assign('i-badehose', 't-sommer', 1)]

    // One write, not N: positions are never reindexed, and the ordering is
    // all anything reads them for.
    expect(primaryPosition('i-badehose', assignments)).toBe(-1)
  })

  it('goes negative without complaint, twice over', () => {
    const assignments = [
      assign('i-badehose', 't-kleidung', -1),
      assign('i-badehose', 't-sommer', 0),
    ]
    expect(primaryPosition('i-badehose', assignments)).toBe(-2)
  })

  it('starts at zero for an item carrying nothing yet', () => {
    expect(primaryPosition('i-lose', [])).toBe(0)
  })
})

describe('planTagGrant (FR-24.9)', () => {
  const items = [
    item('i-badehose', 'Badehose'),
    item('i-kabel', 'Kabel'),
    item('i-lose', 'Loses Teil'),
  ]
  const assignments = [
    assign('i-badehose', 't-kleidung', 0),
    assign('i-badehose', 't-sommer', 1),
    assign('i-kabel', 't-sommer', 0),
  ]

  it('separates the three cases a mixed selection has', () => {
    const plan = planTagGrant(items, assignments, 't-sommer', false)

    expect(plan.missing.map((i) => i.id)).toEqual(['i-lose'])
    // Already carried: not rewritten, so pressing twice writes nothing twice.
    expect(plan.settled.map((i) => i.id)).toEqual(['i-badehose', 'i-kabel'])
    expect(plan.demoted).toEqual([])
  })

  it('counts an item carrying the tag behind another as demoted, but only for primary', () => {
    const plain = planTagGrant(items, assignments, 't-sommer', false)
    expect(plain.demoted).toEqual([])

    const primary = planTagGrant(items, assignments, 't-sommer', true)
    // The swimsuit carries Sommer second; the cable carries it first.
    expect(primary.demoted.map((d) => d.item.id)).toEqual(['i-badehose'])
    expect(primary.demoted[0]!.assignment.tag_id).toBe('t-sommer')
    expect(primary.settled.map((i) => i.id)).toEqual(['i-kabel'])
  })

  it('reads the first assignment by the same rule the grouping does', () => {
    // Shared position: the lower id is primary, so asking for the *other* one
    // to be primary is a demotion rather than a no-op.
    const tied = [assign('i-badehose', 't-sommer', 0), assign('i-badehose', 't-kleidung', 0)]
    const plan = planTagGrant([items[0]!], tied, 't-sommer', true)

    expect(plan.demoted.map((d) => d.item.id)).toEqual(['i-badehose'])
  })
})

describe('planTagRemoval (FR-24.9)', () => {
  const items = [item('i-badehose', 'Badehose'), item('i-kabel', 'Kabel')]
  const assignments = [
    assign('i-badehose', 't-sommer', 0),
    assign('i-kabel', 't-technik', 0),
    assign('i-other', 't-sommer', 0),
  ]

  it('names only the assignments of the chosen items', () => {
    const rows = planTagRemoval(items, assignments, 't-sommer')

    expect(rows.map((a) => a.item_id)).toEqual(['i-badehose'])
  })

  it('answers a selection that does not carry the tag with an empty batch', () => {
    expect(planTagRemoval(items, assignments, 't-kleidung')).toEqual([])
  })
})

describe('tagsOfItems (FR-24.9)', () => {
  it('offers the tags the selection carries between them, in the caller’s order', () => {
    const items = [item('i-badehose', 'Badehose'), item('i-kabel', 'Kabel')]
    const assignments = [
      assign('i-badehose', 't-kleidung', 0),
      assign('i-kabel', 't-technik', 0),
      assign('i-other', 't-sommer', 0),
    ]

    // Sommer belongs to an item outside the selection: offering it would be
    // an action that does nothing.
    expect(tagsOfItems(items, assignments, tags).map((t) => t.name)).toEqual([
      'Kleidung',
      'Technik',
    ])

    // And the order is the one it was handed — M9 hands it the axis order.
    const axisOrder = [...tags].sort((a, b) => a.sort_order - b.sort_order)
    expect(tagsOfItems(items, assignments, axisOrder).map((t) => t.name)).toEqual([
      'Technik',
      'Kleidung',
    ])
  })
})

// --- FR-24.10: managing the tags themselves ---------------------------------

describe('tagDeletion (FR-24.10)', () => {
  it('refuses a tag something still carries, and counts what carries it', () => {
    const assignments = [assign('i-badehose', 't-sommer', 0), assign('i-kabel', 't-sommer', 1)]

    const decision = tagDeletion('t-sommer', assignments)

    expect(decision.kind).toBe(TAG_DELETE_REFUSED)
    expect(decision.references).toBe(2)
  })

  it('allows a tag nothing carries', () => {
    const decision = tagDeletion('t-sommer', [assign('i-kabel', 't-technik', 0)])

    expect(decision.kind).toBe(TAG_DELETE_ALLOWED)
    expect(decision.references).toBe(0)
  })
})

describe('planTagMerge (FR-24.10)', () => {
  it('re-points the source’s assignments on items that do not carry the target', () => {
    const assignments = [assign('i-badehose', 't-sommer', 3)]

    const plan = planTagMerge('t-sommer', 't-kleidung', assignments)

    expect(plan.repoint).toEqual([{ assignment: assignments[0], position: 3 }])
    expect(plan.drop).toEqual([])
  })

  it('drops the source where the item already carries the target', () => {
    const source = assign('i-badehose', 't-sommer', 2)
    const target = assign('i-badehose', 't-kleidung', 1)

    const plan = planTagMerge('t-sommer', 't-kleidung', [source, target])

    expect(plan.drop).toEqual([source])
    expect(plan.repoint).toEqual([])
  })

  it('lets the surviving assignment inherit the lower position, so the item keeps its heading', () => {
    // Sommer was primary (0) and Kleidung second (1). Dropping Sommer without
    // moving Kleidung up would file the item under whatever sorts first next —
    // FR-24.2 groups by the lowest position, so the merge has to carry it over.
    const source = assign('i-badehose', 't-sommer', 0)
    const target = assign('i-badehose', 't-kleidung', 1)

    const plan = planTagMerge('t-sommer', 't-kleidung', [source, target])

    expect(plan.drop).toEqual([source])
    expect(plan.promote).toEqual([{ assignment: target, position: 0 }])
  })

  it('leaves the target alone when it already sits above the source', () => {
    const source = assign('i-badehose', 't-sommer', 4)
    const target = assign('i-badehose', 't-kleidung', 1)

    expect(planTagMerge('t-sommer', 't-kleidung', [source, target]).promote).toEqual([])
  })

  it('touches nothing when the source and the target are the same tag', () => {
    const assignments = [assign('i-badehose', 't-sommer', 0)]

    expect(planTagMerge('t-sommer', 't-sommer', assignments)).toEqual({
      repoint: [],
      drop: [],
      promote: [],
    })
  })

  it('ignores assignments of other tags entirely', () => {
    const assignments = [assign('i-kabel', 't-technik', 0)]

    expect(planTagMerge('t-sommer', 't-kleidung', assignments).repoint).toEqual([])
  })
})

describe('planTagReorder (FR-24.10)', () => {
  const axis: Tag[] = [
    { id: 't-a', name: 'A', sort_order: 0 },
    { id: 't-b', name: 'B', sort_order: 1 },
    { id: 't-c', name: 'C', sort_order: 2 },
  ]

  it('writes only the tags whose number actually changes', () => {
    // C to the front: A and B each shift down one, C takes 0.
    expect(planTagReorder(axis, 2, 0)).toEqual([
      { tagId: 't-c', sortOrder: 0 },
      { tagId: 't-a', sortOrder: 1 },
      { tagId: 't-b', sortOrder: 2 },
    ])
  })

  it('writes nothing when the tag does not move', () => {
    expect(planTagReorder(axis, 1, 1)).toEqual([])
  })

  it('moves a tag on an axis whose numbers were never set', () => {
    // A restore and the dev seed both produce all-zero orders, and against a
    // flat axis a gap-insertion move would write a number that changes
    // nothing. Renumbering from the rendered order is what makes the first
    // drag stick — and the diff still keeps it to the one row that moved,
    // because B is already at 0 and staying there.
    const flat: Tag[] = [
      { id: 't-a', name: 'A', sort_order: 0 },
      { id: 't-b', name: 'B', sort_order: 0 },
    ]

    expect(planTagReorder(flat, 0, 1)).toEqual([{ tagId: 't-a', sortOrder: 1 }])
  })

  it('answers an index outside the axis with no writes at all', () => {
    expect(planTagReorder(axis, 5, 0)).toEqual([])
    expect(planTagReorder(axis, 0, 9)).toEqual([])
  })
})
