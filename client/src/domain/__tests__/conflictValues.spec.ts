/**
 * The conflict log renders the values a merge stored (NFR-4.2a). They arrive
 * as the JSON text of a mutation field, so the reader was being shown the
 * wire — `"Sardinien"` with its quotes, `1` for a flag — on a screen whose
 * whole job is to be read.
 */
import { describe, it, expect } from 'vitest'

import { describeConflictValue, type ConflictValue } from '../conflictValues'

describe('describeConflictValue', () => {
  const cases: Array<{ name: string; raw: string; expected: ConflictValue }> = [
    {
      name: 'a JSON string loses its quotes',
      raw: '"Sardinien"',
      expected: { kind: 'text', text: 'Sardinien' },
    },
    { name: 'a number reads as itself', raw: '9', expected: { kind: 'text', text: '9' } },
    {
      // `toLocaleString` would render this as "2,026" / "2'026": a year that
      // reads as a count is worse than an untranslated one (NFR-4.12).
      name: 'a year keeps its digits together, because it is not a quantity',
      raw: '2026',
      expected: { kind: 'text', text: '2026' },
    },
    { name: 'true is a flag, not a one', raw: 'true', expected: { kind: 'boolean', value: true } },
    { name: 'false is a flag too', raw: 'false', expected: { kind: 'boolean', value: false } },
    { name: 'JSON null is an absent value', raw: 'null', expected: { kind: 'empty' } },
    { name: 'an absent column is an absent value', raw: '', expected: { kind: 'empty' } },
    { name: 'an empty string is an absent value', raw: '""', expected: { kind: 'empty' } },
    {
      name: 'an object is shown as stored, rather than as [object Object]',
      raw: '{"climate":"warm"}',
      expected: { kind: 'text', text: '{"climate":"warm"}' },
    },
    {
      name: 'text that is not JSON at all is shown verbatim',
      raw: 'Sardinien',
      expected: { kind: 'text', text: 'Sardinien' },
    },
  ]

  for (const c of cases) {
    it(`${c.name}`, () => {
      expect(describeConflictValue(c.raw)).toEqual(c.expected)
    })
  }
})
