/**
 * U-1.5 (design review 2026-09-02). The row menu was a nested ternary
 * inside `actionSheetController.create`, and two of its five outcomes are
 * *no menu*, which a running screen renders as nothing happening — the
 * hardest kind of rule to check by holding a row down.
 */
import { describe, it, expect } from 'vitest'

import {
  avatarAssignable,
  rowMenuEntries,
  type AssignContext,
  type RowMenuAction,
  type RowMenuContext,
} from '@/domain/rowMenu'

const OPEN = { state: 'open', flag_unused: false, late_packer: false } as const
const SKIPPED = { state: 'skipped', flag_unused: false, late_packer: false } as const
const JUDGED = { state: 'open', flag_unused: true, late_packer: false } as const
const LATE = { state: 'open', flag_unused: false, late_packer: true } as const

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
  item: { state: 'open' | 'skipped'; flag_unused: boolean; late_packer: boolean }
  ctx: Partial<RowMenuContext>
  want: RowMenuAction[]
}

const cases: Case[] = [
  {
    name: 'an ordinary open row offers its amount, packing it now and skipping it (FR-5.5)',
    item: OPEN,
    ctx: {},
    want: ['quantity', 'packingNow', 'skip', 'latePackerOn'],
  },
  {
    name: 'a row already flagged offers the way back off the departure day (FR-5.1, FR-25.25)',
    item: LATE,
    ctx: {},
    want: ['quantity', 'packingNow', 'skip', 'latePackerOff'],
  },
  {
    name: 'a skipped row is offered no late-packer flag — nothing is being packed on it',
    item: { ...SKIPPED, late_packer: true },
    ctx: {},
    want: ['unskip'],
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
    want: ['quantity', 'packingNow', 'skip', 'latePackerOn', 'flagUnused'],
  },
  {
    name: 'a row already marked unused offers to take the mark off again',
    item: JUDGED,
    ctx: { judgeable: true },
    want: ['quantity', 'packingNow', 'skip', 'latePackerOn', 'unflagUnused'],
  },
  {
    name: 'a skipped row is offered no amount — 1 there is an unskip without its companions (FR-25.24)',
    item: SKIPPED,
    ctx: {},
    want: ['unskip'],
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

/**
 * FR-25.25. Every answer here renders as the presence or absence of one small
 * control, and three of the four are an *absence* — the state a screen shows
 * by looking exactly like the state before it.
 */
describe('avatarAssignable (FR-25.25, FR-25.19, G-3, G-8)', () => {
  const assignCtx = (over: Partial<AssignContext> = {}): AssignContext => ({
    hasAssignees: true,
    closingPass: false,
    locked: false,
    ...over,
  })
  const open = { packed_by_user_id: null }
  const packed = { packed_by_user_id: 'user-2' }

  it('an open row on a trip with other members offers the control', () => {
    expect(avatarAssignable(open, assignCtx())).toBe(true)
  })

  it('offers nothing where there is nobody to assign to (G-8)', () => {
    expect(avatarAssignable(open, assignCtx({ hasAssignees: false }))).toBe(false)
  })

  it('offers nothing while somebody else holds the row (G-3)', () => {
    expect(avatarAssignable(open, assignCtx({ locked: true }))).toBe(false)
  })

  it('offers nothing in the closing pass (FR-9.3)', () => {
    expect(avatarAssignable(open, assignCtx({ closingPass: true }))).toBe(false)
  })

  it('offers nothing once the avatar is the packing record — that is not a choice (FR-25.19)', () => {
    expect(avatarAssignable(packed, assignCtx())).toBe(false)
  })
})
