import { describe, it, expect } from 'vitest'
import { chipSuggestions, CHIP_ROW_MAX } from '../quickAddChips'
import type { MasterItem, Tag } from '@/types/domain'

// FR-25.13c: the empty composer offers chips instead of a keyboard — items
// related to what the scope already carries, and recently used ones. What
// is already chosen is never offered again (owner directive 2026-08-21).

function item(id: string, name: string): MasterItem {
  return { id, name, weight_grams: null, value_cents: null }
}

function tag(id: string, name: string, sortOrder: number): Tag {
  return { id, name, sort_order: sortOrder }
}

const hygiene = tag('t-hyg', 'Hygiene', 1)
const kleidung = tag('t-kld', 'Kleidung', 2)
const technik = tag('t-tec', 'Technik', 3)

const inventory = [
  item('shampoo', 'Shampoo'),
  item('zahnbuerste', 'Zahnbürste'),
  item('sonnencreme', 'Sonnencreme'),
  item('badehose', 'Badehose'),
  item('flipflops', 'Flip-Flops'),
  item('ladekabel', 'Ladekabel'),
  item('gutschein', 'Gutschein'), // no primary tag
]

const primaryTags = new Map<string, Tag>([
  ['shampoo', hygiene],
  ['zahnbuerste', hygiene],
  ['sonnencreme', hygiene],
  ['badehose', kleidung],
  ['flipflops', kleidung],
  ['ladekabel', technik],
])

function chips(opts: {
  chosenItemIds?: string[]
  recentItemIds?: string[]
  maxPerRow?: number
  items?: MasterItem[]
}) {
  return chipSuggestions({
    items: opts.items ?? inventory,
    chosenItemIds: opts.chosenItemIds ?? [],
    recentItemIds: opts.recentItemIds ?? [],
    primaryTagOf: (id) => primaryTags.get(id),
    maxPerRow: opts.maxPerRow,
  })
}

describe('chipSuggestions', () => {
  it('offers items sharing a chosen item’s primary tag, alphabetically', () => {
    const out = chips({ chosenItemIds: ['zahnbuerste'] })
    expect(out.related.map((i) => i.name)).toEqual(['Shampoo', 'Sonnencreme'])
  })

  it('never offers what is already chosen — in either row', () => {
    const out = chips({
      chosenItemIds: ['zahnbuerste', 'shampoo'],
      recentItemIds: ['shampoo', 'ladekabel'],
    })
    expect(out.related.map((i) => i.id)).toEqual(['sonnencreme'])
    expect(out.recent.map((i) => i.id)).toEqual(['ladekabel'])
  })

  it('offers nothing related when nothing is chosen yet', () => {
    const out = chips({ recentItemIds: ['ladekabel'] })
    expect(out.related).toEqual([])
    expect(out.recent.map((i) => i.id)).toEqual(['ladekabel'])
  })

  it('keeps the recent row in recency order and drops ids the inventory no longer has', () => {
    const out = chips({ recentItemIds: ['ladekabel', 'deleted-item', 'badehose'] })
    expect(out.recent.map((i) => i.id)).toEqual(['ladekabel', 'badehose'])
  })

  it('does not repeat a related chip in the recent row', () => {
    const out = chips({ chosenItemIds: ['zahnbuerste'], recentItemIds: ['shampoo', 'ladekabel'] })
    expect(out.related.map((i) => i.id)).toContain('shampoo')
    expect(out.recent.map((i) => i.id)).toEqual(['ladekabel'])
  })

  it('caps each row at maxPerRow', () => {
    const many = Array.from({ length: CHIP_ROW_MAX + 3 }, (_, n) => item(`extra-${n}`, `Extra ${n}`))
    // A distinct untagged pool for the recent row, so the related-row dedup
    // (covered by its own case above) cannot eat into this one.
    const used = Array.from({ length: CHIP_ROW_MAX + 3 }, (_, n) => item(`used-${n}`, `Used ${n}`))
    const tagged = new Map(primaryTags)
    for (const m of many) tagged.set(m.id, hygiene)
    const out = chipSuggestions({
      items: [...inventory, ...many, ...used],
      chosenItemIds: ['zahnbuerste'],
      recentItemIds: used.map((m) => m.id),
      primaryTagOf: (id) => tagged.get(id),
    })
    expect(out.related).toHaveLength(CHIP_ROW_MAX)
    expect(out.recent).toHaveLength(CHIP_ROW_MAX)
  })

  it('names only the tags that actually contributed a chip, in tag order', () => {
    // Every Kleidung item is already chosen, so Kleidung must not be named
    // even though it is a chosen item’s primary tag.
    const out = chips({ chosenItemIds: ['zahnbuerste', 'badehose', 'flipflops'] })
    expect(out.related.map((i) => i.id)).toEqual(['shampoo', 'sonnencreme'])
    expect(out.relatedTags.map((t) => t.name)).toEqual(['Hygiene'])
  })

  it('orders contributing tags by sort_order regardless of chosen order', () => {
    const out = chips({ chosenItemIds: ['ladekabel', 'badehose', 'zahnbuerste'] })
    expect(out.relatedTags.map((t) => t.name)).toEqual(['Hygiene', 'Kleidung'])
  })

  it('a chosen item without a primary tag contributes no related chips', () => {
    const out = chips({ chosenItemIds: ['gutschein'] })
    expect(out.related).toEqual([])
    expect(out.relatedTags).toEqual([])
  })
})
