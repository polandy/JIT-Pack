/**
 * How one shopping list reads (FR-30.2): every source's lines first, combined
 * under one heading, then the own entries under their own, and no line
 * merged with another across the two.
 */
import { describe, expect, it } from 'vitest'

import type { ShoppingLine, ShoppingSource } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import {
  buildSections,
  canDrop,
  dropTag,
  listInFocus,
  openCount,
  planDrop,
  shoppingBoard,
} from '../list'

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
    place: () => {},
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

describe('buildSections — a source’s own heading (FR-31.8)', () => {
  it('files a line that names its heading under it, after the combined one, never as a drop target', () => {
    const forHut = { ...line('Proviant'), section: 'Hüttentour' }
    const forBoat = { ...line('Sonnenhut'), section: 'Bootsausflug' }
    const sections = buildSections([line('Milch')], [line('Sonnencreme'), forHut, forBoat])
    expect(sections.map((s) => [s.packing, s.own, s.name, s.lines.map((l) => l.name)])).toEqual([
      [true, false, null, ['Sonnencreme']],
      [false, false, 'Bootsausflug', ['Sonnenhut']],
      [false, false, 'Hüttentour', ['Proviant']],
      [false, true, null, ['Milch']],
    ])
    expect(dropTag(sections[1]!)).toBeUndefined()
  })
})

describe('buildSections — carried from before departure (FR-7.16)', () => {
  const carried = (l: ShoppingLine): ShoppingLine => ({ ...l, carriedOver: true })

  it('files carried packing lines and untagged entries under one heading of their own, first', () => {
    const sections = buildSections(
      [line('Milch'), carried(line('Kaffee')), carried(line('Spray', 'Apotheke'))],
      [
        line('Hut'),
        carried(line('Sonnencreme')),
        carried({ ...line('Proviant'), section: 'Hüttentour' }),
      ],
    )
    expect(sections.map((s) => [s.key, s.carried, s.lines.map((l) => l.name)])).toEqual([
      ['carried', true, ['Sonnencreme', 'Kaffee']],
      ['packing', false, ['Hut']],
      ['source:Hüttentour', false, ['Proviant']],
      ['tag:Apotheke', false, ['Spray']],
      ['own', false, ['Milch']],
    ])
  })

  it('takes no drop — a carried line leaves it by being given a tag', () => {
    const [section] = buildSections([carried(line('Kaffee'))], [])
    expect(section!.carried).toBe(true)
    expect(dropTag(section!)).toBeUndefined()
  })

  it('is absent, not empty, when nothing was carried', () => {
    expect(buildSections([line('Milch')], [line('Hut')]).some((s) => s.carried)).toBe(false)
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

/*
 * FR-30.8 — which list M6 opens on: *Vor der Reise* until the trip is under
 * way (the kernel's beforeIsOver, pinned in lib), the destination after. The
 * other list keeps its count in the tab label, so nothing is hidden.
 */
describe('listInFocus', () => {
  const today = '2026-10-10'
  const ahead = { planned: true, packingClosed: false, startDate: '2026-10-12' }

  it('opens a planned trip ahead of its start on the list before departure', () => {
    expect(listInFocus(ahead, today)).toBe('buy_before')
  })

  it('opens a running trip at the destination', () => {
    expect(listInFocus({ ...ahead, planned: false }, today)).toBe('buy_local')
  })

  it('opens a planned trip at the destination once its first day has come', () => {
    // Nobody tapped *Reise starten*; the calendar says the trip is under way.
    expect(listInFocus({ ...ahead, startDate: today }, today)).toBe('buy_local')
  })

  it('opens a planned trip at the destination once the packing is closed', () => {
    expect(listInFocus({ ...ahead, packingClosed: true }, today)).toBe('buy_local')
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

/*
 * M25's reading, on the shopping list: what is due now
 * leads in one block across both lists, and leaves its group while it is
 * there; each list is a section of its own below.
 */
describe('shoppingBoard', () => {
  const TODAY = '2026-07-08'
  const empty = { own: [], sourced: [] }

  it('lifts what is overdue, due today or in two days out of both lists, earliest first', () => {
    const board = shoppingBoard(
      {
        buy_before: {
          own: [line('Milch', 'Laden', '2026-07-09'), line('Brot', 'Laden')],
          sourced: [line('Sonnencreme')],
        },
        buy_local: {
          own: [line('Spray', null, '2026-07-07'), line('Karte', null, '2026-07-20')],
          sourced: [],
        },
      },
      TODAY,
    )
    expect(board.due.map((l) => l.name)).toEqual(['Spray', 'Milch'])
    expect(board.lists.buy_before.sections.map((s) => s.lines.map((l) => l.name))).toEqual([
      ['Sonnencreme'],
      ['Brot'],
    ])
    expect(board.lists.buy_local.sections.map((s) => s.lines.map((l) => l.name))).toEqual([
      ['Karte'],
    ])
  })

  it('counts what stands under a list, not what the block above holds', () => {
    const board = shoppingBoard(
      {
        buy_before: { own: [line('Milch', null, TODAY), line('Brot')], sourced: [] },
        buy_local: empty,
      },
      TODAY,
    )
    expect(board.lists.buy_before.open).toBe(1)
    expect(board.lists.buy_local.open).toBe(0)
  })

  it('says which list a line stands on, the block above included', () => {
    const board = shoppingBoard(
      {
        buy_before: { own: [line('Milch', null, TODAY)], sourced: [] },
        buy_local: { own: [line('Brot')], sourced: [] },
      },
      TODAY,
    )
    expect(board.listOf('Milch')).toBe('buy_before')
    expect(board.listOf('Brot')).toBe('buy_local')
    expect(board.listOf('nothing')).toBeUndefined()
  })
})

/** The day the hand-order cases are read on. */
const HAND_TODAY = '2026-07-08'

/** A line placed by hand; an own entry where it can be edited (FR-30.13). */
function placed(name: string, position: number | null, over: Partial<ShoppingLine> = {}) {
  return { ...line(name), position, ...over }
}
const editable = { edit: () => {} }

describe('buildSections — by hand (FR-30.13)', () => {
  it('reads a section nobody arranged as before, and the placed lines after it by number', () => {
    const [own] = buildSections(
      [placed('Milch', 1), placed('Brot', null), placed('Eier', 0), placed('Apfel', null)],
      [],
    )
    expect(own!.lines.map((l) => l.name)).toEqual(['Brot', 'Apfel', 'Eier', 'Milch'])
  })

  it('puts the hand order over the dated-first order inside a section', () => {
    const [own] = buildSections(
      [placed('Brot', 0), placed('Milch', 1, { dueDate: '2026-07-30' })],
      [],
      HAND_TODAY,
    )
    expect(own!.lines.map((l) => l.name)).toEqual(['Brot', 'Milch'])
  })
})

describe('planDrop (FR-30.13)', () => {
  const empty = { own: [], sourced: [] }
  function boardOf(own: ShoppingLine[], sourced: ShoppingLine[] = []) {
    return shoppingBoard({ buy_before: { own, sourced }, buy_local: empty }, HAND_TODAY)
  }
  const sectionOf = (board: ReturnType<typeof boardOf>, key: string) =>
    board.lists.buy_before.sections.find((s) => s.key === key)!
  const writes = (plan: ReturnType<typeof planDrop>) =>
    plan?.placements.map((p) => [p.item.name, p.position])

  it('numbers a section nobody arranged, the moved line where it was let go', () => {
    const own = [
      placed('Apfel', null, editable),
      placed('Brot', null, editable),
      placed('Eier', null, editable),
    ]
    const board = boardOf(own)
    const plan = planDrop(board, own[0]!, 'buy_before', sectionOf(board, 'own'), 2)
    expect(plan?.retag).toBeUndefined()
    expect(writes(plan)).toEqual([
      ['Brot', 0],
      ['Apfel', 1],
      ['Eier', 2],
    ])
  })

  it('writes nothing for a line let go beside itself', () => {
    const own = [placed('Apfel', 0, editable), placed('Brot', 1, editable)]
    const board = boardOf(own)
    expect(planDrop(board, own[0]!, 'buy_before', sectionOf(board, 'own'), 1)).toBeNull()
  })

  it('moves a packing line inside its own heading', () => {
    const sourced = [placed('Hut', 0), placed('Sonnencreme', 1)]
    const board = boardOf([], sourced)
    const plan = planDrop(board, sourced[1]!, 'buy_before', sectionOf(board, 'packing'), 0)
    expect(writes(plan)).toEqual([
      ['Sonnencreme', 0],
      ['Hut', 1],
    ])
  })

  it('never lets a packing line leave its heading', () => {
    const sourced = [placed('Hut', null)]
    const board = boardOf([placed('Brot', null, editable)], sourced)
    const own = sectionOf(board, 'own')
    expect(canDrop(board, sourced[0]!, 'buy_before', own)).toBe(false)
    expect(planDrop(board, sourced[0]!, 'buy_before', own, 0)).toBeNull()
  })

  it('retags an own entry dropped on another tag, and places it at the gap', () => {
    const milch = placed('Milch', null, { ...editable, tag: null })
    const board = boardOf([
      milch,
      placed('Brot', 0, { ...editable, tag: 'Bäcker' }),
      placed('Zopf', 1, { ...editable, tag: 'Bäcker' }),
    ])
    const plan = planDrop(board, milch, 'buy_before', sectionOf(board, 'tag:Bäcker'), 1)
    expect(plan?.retag).toBe('Bäcker')
    expect(writes(plan)).toEqual([
      ['Milch', 1],
      ['Zopf', 2],
    ])
  })

  it('renumbers around a line the Fällig block holds, so it keeps its place for later', () => {
    const due = placed('Milch', 1, { ...editable, dueDate: HAND_TODAY })
    const own = [placed('Apfel', 0, editable), due, placed('Brot', 2, editable)]
    const board = boardOf(own)
    const section = sectionOf(board, 'own')
    expect(section.lines.map((l) => l.name)).toEqual(['Apfel', 'Brot'])
    // Brot to the top: Milch stays between Apfel and where Brot was.
    const plan = planDrop(board, own[2]!, 'buy_before', section, 0)
    expect(writes(plan)).toEqual([
      ['Brot', 0],
      ['Apfel', 1],
      ['Milch', 2],
    ])
  })

  it('refuses a line of the other list', () => {
    const board = shoppingBoard(
      {
        buy_before: { own: [placed('Brot', null, editable)], sourced: [] },
        buy_local: { own: [placed('Wasser', null, editable)], sourced: [] },
      },
      HAND_TODAY,
    )
    const wasser = board.lists.buy_local.sections[0]!.lines[0]!
    expect(canDrop(board, wasser, 'buy_before', sectionOf(board, 'own'))).toBe(false)
  })
})

describe('a meal’s ingredients on the list (FR-33.3)', () => {
  const TODAY = '2026-10-12'
  const ingredient = (name: string, dueDate: string): ShoppingLine => ({
    ...line(name, null, dueDate),
    section: 'Meal plan',
    sectionRank: 1,
    pressingDays: 0,
  })

  it('files the meal plan’s heading after every source heading, whatever its name', () => {
    const sections = buildSections(
      [],
      [
        ingredient('Kartoffeln', '2026-10-15'),
        { ...line('Gletscherbrille'), section: 'Zermatt' },
        { ...line('Seil'), section: 'Bergtour' },
      ],
    )
    expect(sections.map((s) => s.name)).toEqual(['Bergtour', 'Zermatt', 'Meal plan'])
  })

  it('lifts an ingredient into the block on its own day only, not two days ahead', () => {
    const board = shoppingBoard(
      {
        buy_before: { own: [], sourced: [] },
        buy_local: {
          own: [line('Milch', null, '2026-10-13')],
          sourced: [
            ingredient('Raclettekäse', '2026-10-12'),
            ingredient('Spaghetti', '2026-10-13'),
          ],
        },
      },
      TODAY,
    )
    expect(board.due.map((l) => l.name)).toEqual(['Raclettekäse', 'Milch'])
    expect(board.lists.buy_local.sections.flatMap((s) => s.lines.map((l) => l.name))).toEqual([
      'Spaghetti',
    ])
  })

  it('does not move the meal plan’s heading up for an ingredient that is not yet pressing', () => {
    const sections = buildSections(
      [line('Brot', null, null)],
      [ingredient('Spaghetti', '2026-10-13')],
      TODAY,
    )
    expect(sections.map((s) => s.key)).toEqual(['source:Meal plan', 'own'])
    const pressingFirst = buildSections(
      [line('Brot', null, '2026-10-13')],
      [ingredient('Spaghetti', '2026-10-13')],
      TODAY,
    )
    expect(pressingFirst.map((s) => s.key)).toEqual(['own', 'source:Meal plan'])
  })
})
