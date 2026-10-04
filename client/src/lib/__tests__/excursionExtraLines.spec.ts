/** FR-33.6: another module's lines on an excursion's list, counted in its share. */
import { describe, expect, it } from 'vitest'

import { extraLinesOf, withExtraUnits, type ExcursionExtraLine } from '../excursionExtraLines'

function extra(key: string, packed: boolean): ExcursionExtraLine {
  return { key, group: 'Essen', title: key, detail: null, packed, toggle() {}, open() {} }
}

describe('excursion extra lines (FR-33.6)', () => {
  it('reads every source’s lines for the one excursion asked about', () => {
    const sources = [
      { lines: (_trip: string, ex: string) => (ex === 'e1' ? [extra('meal:a', false)] : []) },
      { lines: () => [extra('meal:b', true)] },
    ]
    expect(extraLinesOf(sources, 't1', 'e1').map((l) => l.key)).toEqual(['meal:a', 'meal:b'])
    expect(extraLinesOf(sources, 't1', 'e2').map((l) => l.key)).toEqual(['meal:b'])
  })

  it('counts each extra line as one unit of the packed share', () => {
    expect(withExtraUnits({ done: 8, total: 10 }, [extra('a', true), extra('b', false)])).toEqual({
      done: 9,
      total: 12,
    })
    expect(withExtraUnits({ done: 0, total: 0 }, [])).toEqual({ done: 0, total: 0 })
  })
})
