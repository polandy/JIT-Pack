import { describe, it, expect } from 'vitest'
import { chipSuggestions, CHIP_ROW_MAX } from '../quickAddChips'
import type { MasterItem } from '@/types/domain'

// FR-25.13c: the empty composer offers a recent-items chip row instead of a
// keyboard. What is already chosen is never offered again (owner directive
// 2026-08-21).

function item(id: string, name: string): MasterItem {
  return { id, name, weight_grams: null, value_cents: null }
}

const inventory = [
  item('shampoo', 'Shampoo'),
  item('zahnbuerste', 'Zahnbürste'),
  item('sonnencreme', 'Sonnencreme'),
  item('badehose', 'Badehose'),
  item('flipflops', 'Flip-Flops'),
  item('ladekabel', 'Ladekabel'),
]

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
    maxPerRow: opts.maxPerRow,
  })
}

describe('chipSuggestions', () => {
  it('offers the recents trail in recency order', () => {
    const out = chips({ recentItemIds: ['shampoo', 'ladekabel'] })
    expect(out.recent.map((i) => i.id)).toEqual(['shampoo', 'ladekabel'])
  })

  it('never offers what is already chosen', () => {
    const out = chips({ chosenItemIds: ['shampoo'], recentItemIds: ['shampoo', 'ladekabel'] })
    expect(out.recent.map((i) => i.id)).toEqual(['ladekabel'])
  })

  it('drops ids the inventory no longer has', () => {
    const out = chips({ recentItemIds: ['ladekabel', 'deleted-item', 'badehose'] })
    expect(out.recent.map((i) => i.id)).toEqual(['ladekabel', 'badehose'])
  })

  it('caps the row at maxPerRow', () => {
    const many = Array.from({ length: CHIP_ROW_MAX + 3 }, (_, n) =>
      item(`extra-${n}`, `Extra ${n}`),
    )
    const out = chipSuggestions({
      items: many,
      chosenItemIds: [],
      recentItemIds: many.map((m) => m.id),
    })
    expect(out.recent).toHaveLength(CHIP_ROW_MAX)
  })
})
