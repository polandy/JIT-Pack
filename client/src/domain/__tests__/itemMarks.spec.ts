/**
 * The item mark's index, search and suggestion (§3.28, FR-28.2/28.3).
 *
 * The three FR-28.3 cases are test names on purpose: the picker must survive
 * the hit, the skewed hit and the empty result, and the third is the one that
 * decides whether the column keeps its meaning.
 */
import { describe, expect, it } from 'vitest'

import {
  MARK_FACETS,
  MARK_INDEX,
  MARK_SUGGESTION_LIMIT,
  markFacetOf,
  searchMarks,
  suggestMarks,
} from '../itemMarks'

describe('the curated index (FR-28.2)', () => {
  it('carries around a hundred entries, not the Unicode table', () => {
    expect(MARK_INDEX.length).toBeGreaterThan(80)
    expect(MARK_INDEX.length).toBeLessThan(140)
  })

  it('never offers the same emoji twice — a duplicate is two rows meaning one thing', () => {
    const seen = MARK_INDEX.map((entry) => entry.emoji)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('gives every entry a known facet and lower-case keywords the fold can read', () => {
    for (const entry of MARK_INDEX) {
      expect(MARK_FACETS).toContain(entry.facet)
      expect(entry.keywords.length).toBeGreaterThanOrEqual(2)
      expect(entry.keywords.every((k) => k === k.toLowerCase())).toBe(true)
    }
  })

  it('is reachable in German, which is the half a Unicode catalogue would not have', () => {
    // One word per facet, all of them German, none of them an emoji name.
    for (const word of [
      'jacke',
      'koffer',
      'schlüssel',
      'seife',
      'pflaster',
      'taschenlampe',
      'zelt',
      'klettern',
      'brot',
      'geschenk',
    ]) {
      expect(searchMarks(word, null).length).toBeGreaterThan(0)
    }
  })

  it('fills every facet, so no chip in the picker leads to an empty grid', () => {
    for (const facet of MARK_FACETS) {
      expect(MARK_INDEX.filter((entry) => entry.facet === facet).length).toBeGreaterThan(0)
    }
  })

  it('answers what facet an emoji belongs to, and null for one it does not know', () => {
    expect(markFacetOf('⛺')).toBe('camping')
    expect(markFacetOf('🦖')).toBeNull()
  })
})

describe('searchMarks (FR-28.2)', () => {
  it('browses without typing: an empty query returns the facet in index order', () => {
    const clothing = searchMarks('', 'clothing')
    expect(clothing[0]!.emoji).toBe('👕')
    expect(clothing.every((entry) => entry.facet === 'clothing')).toBe(true)
  })

  it('searches keywords, not Unicode names — „regen" finds the jacket and the umbrella', () => {
    const hits = searchMarks('regen', null).map((entry) => entry.emoji)
    expect(hits).toContain('🧥')
    expect(hits).toContain('🌂')
  })

  it('ignores case and diacritics in both directions', () => {
    expect(searchMarks('MÜTZE', null).map((e) => e.emoji)).toContain('🧢')
    expect(searchMarks('mutze', null).map((e) => e.emoji)).toContain('🧢')
  })

  it('finds an entry by its English word too', () => {
    expect(searchMarks('tent', null).map((e) => e.emoji)).toContain('⛺')
  })

  it('a facet narrows the search rather than replacing it', () => {
    // „karte" reaches the map, the credit card and the ID card; the documents
    // facet drops the map and keeps the ranking among the rest.
    const inDocuments = searchMarks('karte', 'documents').map((e) => e.emoji)
    expect(inDocuments).not.toContain('🗺️')
    expect(inDocuments[0]).toBe('💳')
    expect(searchMarks('karte', null).map((e) => e.emoji)).toContain('🗺️')
  })

  it('ranks a word-start hit above a mid-word one', () => {
    // "lampe" starts 'lampe' (💡) and sits inside 'stirnlampe' (🔦).
    expect(searchMarks('lampe', null)[0]!.emoji).toBe('💡')
  })

  it('a single character is not a search — it would return half the index', () => {
    expect(searchMarks('a', null)).toEqual([])
  })

  it('no match returns nothing rather than a consolation entry', () => {
    expect(searchMarks('zwischenringe', null)).toEqual([])
  })
})

describe('suggestMarks (FR-28.3)', () => {
  it('the hit: „Zahnbürste" proposes the toothbrush first, with no typing', () => {
    expect(suggestMarks('Zahnbürste')[0]!.emoji).toBe('🪥')
  })

  it('the hit: a German compound reaches the index through its own vocabulary', () => {
    // „Tarnzelt" gets ⛺ because *zelt* is a known keyword …
    expect(suggestMarks('Tarnzelt')[0]!.emoji).toBe('⛺')
    // … while „Zahnbürste" never decays into *ürste*, which is not.
    expect(suggestMarks('Zahnbürste').map((e) => e.emoji)).not.toContain('🧹')
  })

  it('the skewed hit: „Stirnlampe" proposes the torch — close enough to scan by', () => {
    expect(suggestMarks('Stirnlampe')[0]!.emoji).toBe('🔦')
  })

  it('the empty result: „Zwischenringe" and „Trekkingstöcke" propose nothing at all', () => {
    expect(suggestMarks('Zwischenringe')).toEqual([])
    expect(suggestMarks('Trekkingstöcke')).toEqual([])
  })

  it('a short keyword needs a whole word, so „Reisetasche" is not made of ice', () => {
    // The letters *eis* sit inside „Reise", and 🧊 carries `eis` as a keyword.
    // Without the whole-word rule for short keywords, every trip item in the
    // app would be offered a block of ice.
    expect(suggestMarks('Reisetasche').map((e) => e.emoji)).not.toContain('🧊')
    expect(suggestMarks('Reisetasche')[0]!.emoji).toBe('👜')
    // The rule still lets the short keyword win when it *is* the word.
    expect(suggestMarks('Eis')[0]!.emoji).toBe('🧊')
  })

  it('offers a handful at most — a band, not a second grid', () => {
    expect(suggestMarks('Tasche').length).toBeLessThanOrEqual(MARK_SUGGESTION_LIMIT)
  })

  it('an empty or whitespace name proposes nothing rather than the index head', () => {
    expect(suggestMarks('')).toEqual([])
    expect(suggestMarks('   ')).toEqual([])
  })

  it('is deterministic: the same name proposes the same order twice', () => {
    expect(suggestMarks('Wanderschuhe')).toEqual(suggestMarks('Wanderschuhe'))
  })
})
