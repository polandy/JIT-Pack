/**
 * How one shopping list reads (FR-30.2): own entries first under their own
 * heading, a source's lines after them under the headings the source chose,
 * and no line merged with another across the two.
 */
import { describe, expect, it } from 'vitest'

import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import { buildSections, listInFocus, openCount } from '../list'

function line(name: string, section: string | null = null): ShoppingLine {
  return {
    key: name,
    name,
    quantity: 1,
    recipients: [],
    section,
    buy: () => {},
    unbuy: () => {},
  }
}

describe('buildSections', () => {
  it('puts the own entries first, then the sourced lines by heading, in arrival order', () => {
    const sections = buildSections(
      [line('Milch')],
      [line('Sonnencreme', 'Pflege'), line('Hut', 'Kleidung'), line('Duschgel', 'Pflege')],
    )
    expect(sections.map((s) => [s.own, s.name, s.lines.map((l) => l.name)])).toEqual([
      [true, null, ['Milch']],
      [false, 'Pflege', ['Sonnencreme', 'Duschgel']],
      [false, 'Kleidung', ['Hut']],
    ])
  })

  it('leaves the own section out, not empty, when nothing was typed', () => {
    expect(buildSections([], [line('Hut', 'Kleidung')]).map((s) => s.own)).toEqual([false])
  })

  it('keeps a sourced line without a heading apart from the own entries', () => {
    const sections = buildSections([line('Brot')], [line('Brot')])
    expect(sections.map((s) => [s.own, s.lines.length])).toEqual([
      [true, 1],
      [false, 1],
    ])
    expect(new Set(sections.map((s) => s.key)).size).toBe(2)
  })
})

describe('openCount', () => {
  it('sums the open lines of both lists across every source', () => {
    const source = (open: Partial<Record<ShoppingMode, ShoppingLine[]>>): ShoppingSource => ({
      open: (_trip, list) => open[list] ?? [],
      bought: () => [line('bought')],
    })
    expect(
      openCount('t1', [
        source({ buy_before: [line('a')], buy_local: [line('b'), line('c')] }),
        source({ buy_local: [line('d')] }),
      ]),
    ).toBe(4)
  })
})

/**
 * FR-30.8 — which list M6 opens on.
 *
 * „Vor der Abreise" stops being the answer the moment that moment is past:
 * the trip has started, or the packing has been declared finished (FR-5.10).
 * The other list keeps its count in the tab label, so nothing is hidden —
 * it is one tap away and says how much is on it.
 */
describe('listInFocus', () => {
  it('opens a planned trip on the list before departure', () => {
    expect(listInFocus({ planned: true, packingClosed: false })).toBe('buy_before')
  })

  it('opens a running trip at the destination', () => {
    expect(listInFocus({ planned: false, packingClosed: false })).toBe('buy_local')
  })

  it('opens a planned trip at the destination once the packing is closed', () => {
    // The bag is shut the evening before, with the trip still „planning"
    // because nobody tapped *Reise starten*. Shopping before departure is
    // over all the same.
    expect(listInFocus({ planned: true, packingClosed: true })).toBe('buy_local')
  })
})
