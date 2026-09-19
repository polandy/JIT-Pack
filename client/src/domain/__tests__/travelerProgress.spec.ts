import { describe, expect, it } from 'vitest'

import {
  TRAVELER_FOLD_CAP,
  foldTravelers,
  progressByTraveler,
  showsTravelerProgress,
  travelerDone,
  travelerPercent,
} from '../travelerProgress'
import type { Traveler } from '@/types/domain'

const traveler = (id: string, name = id): Traveler => ({
  id,
  trip_id: 't1',
  name,
  linked_user_id: null,
})

const row = (assigned: string | null, quantity: number, packed: number) => ({
  assigned_traveler_id: assigned,
  quantity,
  packed_count: packed,
})

const ROSTER = [traveler('anna', 'Anna'), traveler('ben', 'Ben'), traveler('mia', 'Mia')]

describe('progressByTraveler (FR-25.29)', () => {
  it('counts each traveler in units, in roster order', () => {
    const result = progressByTraveler(
      [row('ben', 2, 1), row('anna', 1, 1), row('ben', 1, 0), row('mia', 3, 3)],
      ROSTER,
    )

    expect(result.travelers.map((p) => [p.traveler.id, p.done, p.total])).toEqual([
      ['anna', 1, 1],
      ['ben', 1, 3],
      ['mia', 3, 3],
    ])
  })

  it('puts a row for nobody into the shared share', () => {
    const result = progressByTraveler([row(null, 4, 1), row('anna', 1, 0)], ROSTER)
    expect(result.shared).toEqual({ done: 1, total: 4 })
  })

  it('puts a row for a traveler who is no longer on the roster into the shared share', () => {
    // The row outlived its traveler on this device (FR-27.4 repoints it on the
    // next refresh); counting it nowhere would make the shares sum to less than the trip.
    const result = progressByTraveler([row('gone', 2, 2)], ROSTER)
    expect(result.shared).toEqual({ done: 2, total: 2 })
  })

  it('counts a consciously skipped row nowhere, like the trip line does (FR-25.22)', () => {
    const result = progressByTraveler([row('anna', 0, 0), row('anna', 2, 1)], ROSTER)
    expect(result.travelers[0]).toMatchObject({ done: 1, total: 2 })
  })

  it('keeps a traveler with nothing assigned, at nought of nought', () => {
    const result = progressByTraveler([row('anna', 1, 0)], ROSTER)
    expect(result.travelers.find((p) => p.traveler.id === 'mia')).toMatchObject({
      done: 0,
      total: 0,
    })
  })

  it('sums, with the shared share, to the trip line (FR-25.22)', () => {
    const items = [row('anna', 2, 1), row('ben', 1, 1), row(null, 3, 2), row('gone', 1, 0)]
    const result = progressByTraveler(items, ROSTER)
    const parts = [...result.travelers, result.shared]

    expect(parts.reduce((sum, p) => sum + p.done, 0)).toBe(4)
    expect(parts.reduce((sum, p) => sum + p.total, 0)).toBe(7)
  })
})

describe('showsTravelerProgress (FR-25.29)', () => {
  it.each([
    { n: 0, want: false },
    { n: 1, want: false },
    { n: 2, want: true },
    { n: 3, want: true },
  ])('is $want with $n traveler(s) — one would only repeat the trip line', ({ n, want }) => {
    expect(showsTravelerProgress(ROSTER.slice(0, n))).toBe(want)
  })
})

describe('travelerDone / travelerPercent (FR-25.29)', () => {
  it('is done only with something to pack and all of it packed', () => {
    expect(travelerDone({ done: 3, total: 3 })).toBe(true)
    expect(travelerDone({ done: 2, total: 3 })).toBe(false)
    expect(travelerDone({ done: 0, total: 0 })).toBe(false)
  })

  it('reads nought of nought as 0 %, not as a division by zero', () => {
    expect(travelerPercent({ done: 0, total: 0 })).toBe(0)
    expect(travelerPercent({ done: 1, total: 3 })).toBe(33)
  })
})

describe('foldTravelers (FR-25.29)', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ traveler: traveler(`p${i}`), done: 0, total: 1 }))

  it(`shows everyone up to ${TRAVELER_FOLD_CAP}`, () => {
    const folded = foldTravelers(many(TRAVELER_FOLD_CAP), { expanded: false, selected: [] })
    expect(folded.shown).toHaveLength(TRAVELER_FOLD_CAP)
    expect(folded.hidden).toHaveLength(0)
  })

  it('folds the rest behind one slot beyond the cap, keeping the slot count', () => {
    const folded = foldTravelers(many(TRAVELER_FOLD_CAP + 2), { expanded: false, selected: [] })
    // One slot goes to „+N weitere", so the strip never grows a third row.
    expect(folded.shown).toHaveLength(TRAVELER_FOLD_CAP - 1)
    expect(folded.hidden).toHaveLength(3)
  })

  it('shows everyone once expanded', () => {
    const folded = foldTravelers(many(TRAVELER_FOLD_CAP + 2), { expanded: true, selected: [] })
    expect(folded.shown).toHaveLength(TRAVELER_FOLD_CAP + 2)
    expect(folded.hidden).toHaveLength(0)
  })

  it('never folds away the traveler the list is filtered to', () => {
    const list = many(TRAVELER_FOLD_CAP + 2)
    const last = list[list.length - 1]!.traveler.id
    const folded = foldTravelers(list, { expanded: false, selected: [last] })
    expect(folded.hidden).toHaveLength(0)
  })

  it('counts how many of the folded travelers still have something open', () => {
    const list = many(TRAVELER_FOLD_CAP + 2)
    list[TRAVELER_FOLD_CAP]!.done = 1
    const folded = foldTravelers(list, { expanded: false, selected: [] })
    expect(folded.hiddenOpen).toBe(2)
  })
})
