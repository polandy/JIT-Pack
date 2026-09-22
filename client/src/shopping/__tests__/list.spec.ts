/**
 * How one shopping list reads (FR-30.2): own entries first under their own
 * heading, a source's lines after them under the headings the source chose,
 * and no line merged with another across the two.
 */
import { describe, expect, it } from 'vitest'

import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import { buildSections, dropTag, listInFocus, openCount } from '../list'

function line(
  name: string,
  section: string | null = null,
  tag: string | null = null,
): ShoppingLine {
  return {
    key: name,
    name,
    quantity: 1,
    recipients: [],
    section,
    tag,
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

describe('buildSections — tags (FR-30.9)', () => {
  it('files the own entries under a section per tag, A–Z, then the untagged, then the sources', () => {
    const sections = buildSections(
      [
        line('Pasta', null, 'Supermarkt'),
        line('Batterien'),
        line('Spray', null, 'Apotheke'),
        line('Brot', null, 'Supermarkt'),
      ],
      [line('Hut', 'Kleidung')],
    )
    expect(sections.map((s) => [s.tagged, s.own, s.name, s.lines.map((l) => l.name)])).toEqual([
      [true, false, 'Apotheke', ['Spray']],
      [true, false, 'Supermarkt', ['Pasta', 'Brot']],
      [false, true, null, ['Batterien']],
      [false, false, 'Kleidung', ['Hut']],
    ])
  })

  it('never lets a source heading collide with a tag of the same name', () => {
    const sections = buildSections([line('Brot', null, 'Kleidung')], [line('Hut', 'Kleidung')])
    expect(new Set(sections.map((s) => s.key)).size).toBe(2)
  })
})

/** FR-30.9's single-row drag: what dropping onto a section would set. */
describe('dropTag', () => {
  it('is the section’s own tag for a tagged section', () => {
    const sections = buildSections([line('Spray', null, 'Apotheke')], [])
    expect(dropTag(sections[0]!)).toBe('Apotheke')
  })

  it('is null for the untagged own section', () => {
    const sections = buildSections([line('Batterien')], [])
    expect(dropTag(sections[0]!)).toBeNull()
  })

  it('is undefined for a source’s own heading — never a drop target', () => {
    const sections = buildSections([], [line('Hut', 'Kleidung')])
    expect(dropTag(sections[0]!)).toBeUndefined()
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
