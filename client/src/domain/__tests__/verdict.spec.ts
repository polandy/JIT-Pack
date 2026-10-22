/**
 * FR-9.6: a trip is judged row by row in three verdicts — *hätte mit gemusst*
 * (missing), *unnötig dabei* (unused), *zu viel* (fewer, with the number
 * used) — one per row, offered by what happened to the row and when it is
 * asked (ADR-103).
 */
import { describe, it, expect } from 'vitest'

import {
  VERDICT_FEWER,
  VERDICT_MISSING,
  VERDICT_UNUSED,
  VERDICT_WINDOW_AFTER,
  VERDICT_WINDOW_DURING,
  neededRange,
  passSections,
  rowVerdict,
  verdictChoices,
  verdictFields,
  verdictPatch,
  verdictWindow,
  type VerdictRow,
} from '@/domain/verdict'

function row(over: Partial<VerdictRow> = {}): VerdictRow {
  return {
    state: 'packed',
    packed_count: 1,
    flag_missing: false,
    flag_unused: false,
    needed_quantity: null,
    ...over,
  }
}

describe('verdictWindow — when a verdict can be given (FR-9.6)', () => {
  it.each([
    ['a planning trip offers none', 'planning', false, null],
    ['an active trip is judged while it runs', 'active', false, VERDICT_WINDOW_DURING],
    ['the closing pass judges the trip afterwards', 'active', true, VERDICT_WINDOW_AFTER],
    ['an archived trip is judged afterwards', 'archived', false, VERDICT_WINDOW_AFTER],
  ] as const)('%s', (_name, status, closingPass, window) => {
    expect(verdictWindow(status, closingPass)).toBe(window)
  })
})

describe('rowVerdict — the verdict a row carries (FR-9.6)', () => {
  it.each([
    ['none', row(), null],
    ['missing', row({ state: 'skipped', packed_count: 0, flag_missing: true }), VERDICT_MISSING],
    ['unused', row({ flag_unused: true }), VERDICT_UNUSED],
    ['fewer', row({ packed_count: 4, needed_quantity: 2 }), VERDICT_FEWER],
  ])('reads %s', (_name, r, verdict) => {
    expect(rowVerdict(r)).toBe(verdict)
  })

  // Two devices judging offline can leave two: a set flag merges additively.
  // The sheet shows one, always the same one — M14 shows both proposals.
  it('picks missing over unused over fewer when a concurrent edit left several', () => {
    expect(rowVerdict(row({ flag_missing: true, flag_unused: true, needed_quantity: 1 }))).toBe(
      VERDICT_MISSING,
    )
    expect(rowVerdict(row({ packed_count: 3, flag_unused: true, needed_quantity: 1 }))).toBe(
      VERDICT_UNUSED,
    )
  })
})

describe('verdictChoices — what a row is offered (FR-9.6)', () => {
  it('offers unused, but not fewer, on a row with one packed', () => {
    expect(verdictChoices(row(), VERDICT_WINDOW_AFTER)).toEqual([VERDICT_UNUSED])
  })

  it('offers fewer once two or more were packed', () => {
    expect(verdictChoices(row({ packed_count: 2 }), VERDICT_WINDOW_AFTER)).toEqual([
      VERDICT_UNUSED,
      VERDICT_FEWER,
    ])
  })

  it('offers only missing on a row that stayed home', () => {
    expect(
      verdictChoices(row({ state: 'skipped', packed_count: 0 }), VERDICT_WINDOW_AFTER),
    ).toEqual([VERDICT_MISSING])
  })

  // Afterwards, a thing bought after the trip is not a thing that was missing
  // on it (FR-9.3) — only a row left at home can have been missing.
  it('offers no missing afterwards on a row that went along', () => {
    expect(verdictChoices(row({ packed_count: 3 }), VERDICT_WINDOW_AFTER)).not.toContain(
      VERDICT_MISSING,
    )
  })

  it('offers missing on any row while the trip runs', () => {
    expect(verdictChoices(row({ state: 'open', packed_count: 0 }), VERDICT_WINDOW_DURING)).toEqual([
      VERDICT_MISSING,
      VERDICT_UNUSED,
    ])
  })

  // A verdict that cannot be taken back is a stamp, not a judgement.
  it('keeps offering the verdict a row carries, so it can be cleared', () => {
    expect(
      verdictChoices(row({ packed_count: 2, flag_missing: true }), VERDICT_WINDOW_AFTER),
    ).toContain(VERDICT_MISSING)
    expect(
      verdictChoices(
        row({ state: 'skipped', packed_count: 0, flag_unused: true }),
        VERDICT_WINDOW_AFTER,
      ),
    ).toContain(VERDICT_UNUSED)
  })
})

describe('verdictPatch — one verdict per row (FR-9.6)', () => {
  it.each([
    [VERDICT_MISSING, undefined, { flag_missing: true, flag_unused: false, needed_quantity: null }],
    [VERDICT_UNUSED, undefined, { flag_missing: false, flag_unused: true, needed_quantity: null }],
    [VERDICT_FEWER, 2, { flag_missing: false, flag_unused: false, needed_quantity: 2 }],
    [null, undefined, { flag_missing: false, flag_unused: false, needed_quantity: null }],
  ] as const)('setting %s clears the other two', (verdict, needed, patch) => {
    const judged = row({
      packed_count: 4,
      flag_missing: true,
      flag_unused: true,
      needed_quantity: 3,
    })
    expect(verdictPatch(judged, verdict, needed)).toEqual(patch)
  })

  it.each([
    ['none used — that is unused', 0],
    ['all used — that is no verdict', 4],
    ['more than packed', 5],
    ['not a whole number', 1.5],
    ['not given at all', undefined],
  ])('refuses a needed quantity of %s', (_name, needed) => {
    expect(() => verdictPatch(row({ packed_count: 4 }), VERDICT_FEWER, needed)).toThrow(RangeError)
  })

  it('refuses fewer on a row with only one packed', () => {
    expect(() => verdictPatch(row({ packed_count: 1 }), VERDICT_FEWER, 1)).toThrow(RangeError)
  })

  it('names the stepper range, from 1 to one less than packed', () => {
    expect(neededRange(row({ packed_count: 4 }))).toEqual({ min: 1, max: 3 })
    expect(neededRange(row({ packed_count: 1 }))).toBeNull()
  })

  it('snapshots the fields a verdict writes, for an undo', () => {
    expect(verdictFields(row({ packed_count: 3, needed_quantity: 2, flag_unused: true }))).toEqual({
      flag_missing: false,
      flag_unused: true,
      needed_quantity: 2,
    })
    expect(verdictFields({ ...row(), needed_quantity: undefined }).needed_quantity).toBeNull()
  })
})

describe('passSections — the closing pass judges what went along and what stayed home (FR-9.3, FR-9.6)', () => {
  it('lists packed rows, partly packed included, and skipped rows apart; leaves the rest out', () => {
    const stativ = { ...row(), name: 'Stativ' }
    const zelt = { ...row({ state: 'partial', packed_count: 1 }), name: 'Zelt' }
    const drohne = { ...row({ state: 'skipped', packed_count: 0 }), name: 'Drohne' }
    const regenjacke = { ...row({ state: 'open', packed_count: 0 }), name: 'Regenjacke' }

    const sections = passSections([stativ, zelt, drohne, regenjacke])

    expect(sections.packed.map((r) => r.name)).toEqual(['Stativ', 'Zelt'])
    expect(sections.stayedHome.map((r) => r.name)).toEqual(['Drohne'])
  })
})
