/**
 * U-1.5 (design review 2026-09-02). The row menu was a nested ternary
 * inside `actionSheetController.create`, and two of its five outcomes are
 * *no menu*, which a running screen renders as nothing happening — the
 * hardest kind of rule to check by holding a row down.
 */
import { describe, it, expect } from 'vitest'

import { rowMenuEntries, type RowMenuAction, type RowMenuContext } from '@/domain/rowMenu'

const OPEN = { state: 'open', flag_unused: false } as const
const SKIPPED = { state: 'skipped', flag_unused: false } as const
const JUDGED = { state: 'open', flag_unused: true } as const

function ctx(overrides: Partial<RowMenuContext> = {}): RowMenuContext {
  return {
    closingPass: false,
    locked: false,
    canTakeOver: false,
    mine: false,
    judgeable: false,
    ...overrides,
  }
}

interface Case {
  name: string
  item: { state: 'open' | 'skipped'; flag_unused: boolean }
  ctx: Partial<RowMenuContext>
  want: RowMenuAction[]
}

const cases: Case[] = [
  {
    name: 'an ordinary open row offers packing it now and skipping it (FR-5.5)',
    item: OPEN,
    ctx: {},
    want: ['packingNow', 'skip'],
  },
  {
    name: 'a skipped row offers only the way back (FR-5.5)',
    item: SKIPPED,
    ctx: {},
    want: ['unskip'],
  },
  {
    name: 'a row I hold offers only the release — packing it is the checkbox’s job',
    item: OPEN,
    ctx: { mine: true },
    want: ['release'],
  },
  {
    name: 'my own claim outranks the row being skipped',
    item: SKIPPED,
    ctx: { mine: true },
    want: ['release'],
  },
  {
    name: 'somebody else’s row offers the takeover and nothing else (FR-5.7, G-3)',
    item: OPEN,
    ctx: { locked: true, canTakeOver: true },
    want: ['takeover'],
  },
  {
    name: 'a locked row offers no menu where there is nobody to take it from (G-8)',
    item: OPEN,
    ctx: { locked: true, canTakeOver: false },
    want: [],
  },
  {
    name: 'a locked row is not judgeable either — the whole row belongs to its holder',
    item: OPEN,
    ctx: { locked: true, canTakeOver: false, judgeable: true },
    want: [],
  },
  {
    name: 'the closing pass takes the menu away entirely (FR-9.3)',
    item: OPEN,
    ctx: { closingPass: true, judgeable: true },
    want: [],
  },
  {
    name: 'the closing pass outranks a takeover that would otherwise be offered',
    item: OPEN,
    ctx: { closingPass: true, locked: true, canTakeOver: true },
    want: [],
  },
  {
    name: 'a judgeable trip appends the unused mark after the row’s own actions (FR-9.3)',
    item: OPEN,
    ctx: { judgeable: true },
    want: ['packingNow', 'skip', 'flagUnused'],
  },
  {
    name: 'a row already marked unused offers to take the mark off again',
    item: JUDGED,
    ctx: { judgeable: true },
    want: ['packingNow', 'skip', 'unflagUnused'],
  },
  {
    name: 'the judgement is offered on a skipped row too',
    item: SKIPPED,
    ctx: { judgeable: true },
    want: ['unskip', 'flagUnused'],
  },
  {
    name: 'and on a row I am holding',
    item: OPEN,
    ctx: { mine: true, judgeable: true },
    want: ['release', 'flagUnused'],
  },
]

describe('rowMenuEntries (FR-5.5, FR-5.7, FR-9.3, G-3)', () => {
  it.each(cases)('$name', ({ item, ctx: overrides, want }) => {
    expect(rowMenuEntries(item, ctx(overrides))).toEqual(want)
  })

  it('never offers the judgement on a trip that cannot be judged', () => {
    const everything = [OPEN, SKIPPED, JUDGED].flatMap((item) =>
      [{}, { mine: true }, { locked: true, canTakeOver: true }].map((over) =>
        rowMenuEntries(item, ctx(over)),
      ),
    )
    expect(everything.flat()).not.toContain('flagUnused')
    expect(everything.flat()).not.toContain('unflagUnused')
  })
})
