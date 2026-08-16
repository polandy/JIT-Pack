import { describe, it, expect } from 'vitest'
import { groupByPrimaryTag, tagsOfItem, primaryTagOf, UNTAGGED_KEY } from '@/domain/tags'
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
