import { describe, it, expect } from 'vitest'
import { searchEquals } from '@/domain/search'

/**
 * FR-24.11 — `searchEquals` decides whether a query already *is* an item's
 * name, so the inventory does not offer to create a near-duplicate of a row it
 * is showing. It must agree with the search that found that row.
 */
describe('searchEquals (FR-24.11)', () => {
  const cases: [string, string, string, boolean][] = [
    ['case and outer spaces', 'Zelt', '  zelt ', true],
    ['the umlaut stripped', 'Gürtel', 'gurtel', true],
    ['the umlaut spelled out', 'Gürtel', 'guertel', true],
    ['ß spelled out', 'Fußball', 'fussball', true],
    ['a prefix is not the name', 'Zeltheringe', 'Zelt', false],
    ['a different word', 'Zelt', 'Zeit', false],
  ]
  for (const [label, name, query, expected] of cases) {
    it(`${expected ? 'equates' : 'separates'}: ${label}`, () => {
      expect(searchEquals(name, query)).toBe(expected)
    })
  }
})
