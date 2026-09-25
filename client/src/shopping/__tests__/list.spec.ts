/**
 * How one shopping list reads (FR-30.2): every source's lines first, combined
 * under one heading, then the own entries under their own, and no line
 * merged with another across the two.
 */
import { describe, expect, it } from 'vitest'

import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import { buildSections, dropTag, listInFocus, openCount } from '../list'

function line(
  name: string,
  tag: string | null = null,
  dueDate: string | null = null,
): ShoppingLine {
  return {
    key: name,
    name,
    quantity: 1,
    recipients: [],
    tag,
    dueDate,
    buy: () => {},
    unbuy: () => {},
  }
}

describe('buildSections', () => {
  it('combines every sourced line under one heading, ahead of the own entries', () => {
    const sections = buildSections(
      [line('Milch')],
      [line('Sonnencreme'), line('Hut'), line('Duschgel')],
    )
    expect(sections.map((s) => [s.packing, s.own, s.lines.map((l) => l.name)])).toEqual([
      [true, false, ['Sonnencreme', 'Hut', 'Duschgel']],
      [false, true, ['Milch']],
    ])
  })

  it('leaves the packing section out, not empty, when nothing is sourced', () => {
    expect(buildSections([line('Milch')], []).map((s) => s.packing)).toEqual([false])
  })

  it('leaves the own section out, not empty, when nothing was typed', () => {
    expect(buildSections([], [line('Hut')]).map((s) => s.own)).toEqual([false])
  })

  it('keeps a sourced line apart from an own entry of the same name', () => {
    const sections = buildSections([line('Brot')], [line('Brot')])
    expect(sections.map((s) => [s.packing, s.lines.length])).toEqual([
      [true, 1],
      [false, 1],
    ])
    expect(new Set(sections.map((s) => s.key)).size).toBe(2)
  })
})

describe('buildSections — tags (FR-30.9)', () => {
  it('puts the packing section first, then a section per tag A–Z, then the untagged', () => {
    const sections = buildSections(
      [
        line('Pasta', 'Supermarkt'),
        line('Batterien'),
        line('Spray', 'Apotheke'),
        line('Brot', 'Supermarkt'),
      ],
      [line('Hut')],
    )
    expect(
      sections.map((s) => [s.packing, s.tagged, s.own, s.name, s.lines.map((l) => l.name)]),
    ).toEqual([
      [true, false, false, null, ['Hut']],
      [false, true, false, 'Apotheke', ['Spray']],
      [false, true, false, 'Supermarkt', ['Pasta', 'Brot']],
      [false, false, true, null, ['Batterien']],
    ])
  })
})

/** FR-30.9's single-row drag: what dropping onto a section would set. */
describe('dropTag', () => {
  it('is the section’s own tag for a tagged section', () => {
    const sections = buildSections([line('Spray', 'Apotheke')], [])
    expect(dropTag(sections[0]!)).toBe('Apotheke')
  })

  it('is null for the untagged own section', () => {
    const sections = buildSections([line('Batterien')], [])
    expect(dropTag(sections[0]!)).toBeNull()
  })

  it('is undefined for the packing section — never a drop target', () => {
    const sections = buildSections([], [line('Hut')])
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

/*
 * FR-30.10, M25's rule for a task (FR-7.11): dated lines lead their section,
 * earliest first, and a section holding something pressing moves up.
 */
describe('buildSections — due days (FR-30.10)', () => {
  const TODAY = '2026-07-08'

  it('puts the dated lines first inside a section, earliest first, the rest in their order', () => {
    const [section] = buildSections(
      [
        line('Brot', 'Supermarkt'),
        line('Milch', 'Supermarkt', '2026-07-20'),
        line('Pasta', 'Supermarkt'),
        line('Eier', 'Supermarkt', '2026-07-05'),
      ],
      [],
      TODAY,
    )
    expect(section!.lines.map((l) => l.name)).toEqual(['Eier', 'Milch', 'Brot', 'Pasta'])
  })

  it('moves a section with something overdue, today or soon above the others', () => {
    const sections = buildSections(
      [
        line('Spray', 'Apotheke', '2026-07-08'),
        line('Brot', 'Supermarkt'),
        line('Wasser'),
        line('Kerzen', 'Baumarkt', '2026-07-30'),
      ],
      [line('Sonnencreme')],
      TODAY,
    )
    // Apotheke is due today; Baumarkt's day is far off and moves nothing.
    expect(sections.map((s) => s.key)).toEqual([
      'tag:Apotheke',
      'packing',
      'tag:Baumarkt',
      'tag:Supermarkt',
      'own',
    ])
  })

  it('moves nothing without a today to read against', () => {
    const sections = buildSections(
      [line('Spray', 'Apotheke', '2026-07-08'), line('Brot')],
      [line('Hut')],
    )
    expect(sections.map((s) => s.key)).toEqual(['packing', 'tag:Apotheke', 'own'])
  })
})
