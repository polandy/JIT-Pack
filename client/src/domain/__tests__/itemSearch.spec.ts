import { describe, it, expect } from 'vitest'
import {
  searchItems,
  hitsByReason,
  isSearchQuery,
  searchOffer,
  OFFER_CREATE,
  OFFER_RESTORE,
} from '@/domain/itemSearch'
import type { ItemSearchCandidate } from '@/domain/itemSearch'

/**
 * FR-24.7 — the inventory search. Every case here is a promise M9's previous
 * rule (`name.toLowerCase().includes`) broke, measured against the family
 * instance: 0 hits for „guertel", 0 for „gurtel", and no way to type a tag.
 */

function item(
  id: string,
  name: string,
  tagNames: string[] = [],
  markKeywords?: string[],
): ItemSearchCandidate {
  return { id, name, tagNames, markKeywords }
}

const inventory: ItemSearchCandidate[] = [
  item('i-guertel', 'Gürtel', ['Diverses']),
  item('i-socken', 'Normale Socken', ['Unterwäsche', 'Sport']),
  item('i-wander', 'Wandersocken', ['Unterwäsche', 'Wandern']),
  item('i-finken', 'Finken', ['Diverses'], ['schuh', 'slipper']),
  item('i-kabel', 'USB-C Hub', ['Elektronisches Zubehör']),
]

describe('isSearchQuery (FR-24.7)', () => {
  it('treats one character as a query — the inventory is short enough for it', () => {
    expect(isSearchQuery('s')).toBe(true)
  })

  it('treats whitespace as no query, so a stray space does not empty the list', () => {
    expect(isSearchQuery('   ')).toBe(false)
    expect(isSearchQuery('')).toBe(false)
  })
})

describe('searchItems — the fold (FR-24.7)', () => {
  it('reaches an umlaut name from both keyboard spellings of it', () => {
    // The measured defect: both spellings returned nothing against the real
    // 184 items, and „Gürtel" was sitting in the list the whole time.
    expect(searchItems(inventory, 'gurtel').map((h) => h.id)).toEqual(['i-guertel'])
    expect(searchItems(inventory, 'guertel').map((h) => h.id)).toEqual(['i-guertel'])
    expect(searchItems(inventory, 'GÜRTEL').map((h) => h.id)).toEqual(['i-guertel'])
  })

  it('reaches a written-out name from the umlaut spelling, the other direction', () => {
    const rows = [item('i', 'Fondueset')]
    expect(searchItems(rows, 'fondue').map((h) => h.id)).toEqual(['i'])
    expect(searchItems([item('i', 'Muesli')], 'müsli').map((h) => h.id)).toEqual(['i'])
  })

  it('folds the haystack as well as the query', () => {
    expect(searchItems([item('i', 'Zundhölzli')], 'holzli').map((h) => h.id)).toEqual(['i'])
    expect(searchItems([item('i', 'Ermässigungskarte')], 'ermassigung').map((h) => h.id)).toEqual([
      'i',
    ])
  })

  it('answers an empty query with nothing rather than with everything', () => {
    // The page decides to *show the grouped list* when there is no query; a
    // search that returned the whole inventory would make that decision here.
    expect(searchItems(inventory, '  ')).toEqual([])
  })
})

describe('searchItems — what can be typed (FR-24.7)', () => {
  it('finds an item through a tag it carries, and says which tag', () => {
    const hits = searchItems(inventory, 'wandern')
    expect(hits).toEqual([{ id: 'i-wander', reason: 'tag', via: 'Wandern' }])
  })

  it('finds an item through its mark’s keyword', () => {
    const hits = searchItems(inventory, 'slipper')
    expect(hits).toEqual([{ id: 'i-finken', reason: 'mark', via: 'slipper' }])
  })

  it('finds an item through who it is usually assigned to (FR-1.9), and names them', () => {
    const rows = [{ ...item('i-zelt', 'Zelt'), assigneeName: 'Andy Pollari' }]

    expect(searchItems(rows, 'pollari')).toEqual([
      { id: 'i-zelt', reason: 'assignee', via: 'Andy Pollari' },
    ])
  })

  it('leaves the assignee out where there is none — a row with no account is not a hit', () => {
    expect(searchItems([item('i-zelt', 'Zelt')], 'andy')).toEqual([])
  })

  it('reports an item once, under the strongest reason it has', () => {
    // „socken" is in two names and in no tag; „Unterwäsche" is in two tags.
    // Neither query may report a row twice — the FR-24.2 promise, kept while
    // searching.
    expect(searchItems(inventory, 'socken')).toHaveLength(2)
    const both = searchItems([item('i', 'Sportsocken', ['Sport'])], 'sport')
    expect(both).toEqual([{ id: 'i', reason: 'name', via: null }])
  })
})

describe('searchItems — the order two devices must agree on (FR-24.7)', () => {
  it('ranks name hits before tag hits before mark hits before assignee hits', () => {
    const rows = [
      { ...item('i-assignee', 'Nochwas'), assigneeName: 'Zelt-Zora' },
      item('i-mark', 'Etwas', [], ['zelt']),
      item('i-tag', 'Anderes', ['Zelt & Schlafen']),
      item('i-name', 'Zeltheringe'),
    ]
    expect(searchItems(rows, 'zelt').map((h) => h.reason)).toEqual([
      'name',
      'tag',
      'mark',
      'assignee',
    ])
  })

  it('puts a name that starts with the query before one that only contains it', () => {
    const rows = [item('i-contains', 'Wandersocken'), item('i-starts', 'Socken, normale')]
    expect(searchItems(rows, 'socken').map((h) => h.id)).toEqual(['i-starts', 'i-contains'])
  })

  it('breaks the remaining ties alphabetically, not by input order', () => {
    const rows = [item('i-b', 'Sonnenschirm'), item('i-a', 'Sonnenbrille')]
    expect(searchItems(rows, 'sonnen').map((h) => h.id)).toEqual(['i-a', 'i-b'])
  })
})

describe('hitsByReason (FR-24.7)', () => {
  it('groups in reason order', () => {
    const grouped = hitsByReason(searchItems(inventory, 'socken'))
    expect(grouped.map(([reason]) => reason)).toEqual(['name'])
  })

  it('skips a reason nothing matched rather than heading an empty group', () => {
    const grouped = hitsByReason(searchItems(inventory, 'wandern'))
    expect(grouped).toHaveLength(1)
    expect(grouped[0]![0]).toBe('tag')
    expect(grouped[0]![1].map((h) => h.id)).toEqual(['i-wander'])
  })

  it('returns nothing at all for a query nothing matched', () => {
    expect(hitsByReason(searchItems(inventory, 'zzz'))).toEqual([])
  })
})

describe('searchOffer (FR-24.11)', () => {
  const active = [
    { id: 'i-guertel', name: 'Gürtel' },
    { id: 'i-hering', name: 'Zeltheringe' },
    { id: 'i-unterlage', name: 'Zeltunterlage' },
  ]
  const retired = [{ id: 'i-poncho', name: 'Regenponcho' }]

  it('offers to create a name no item carries, trimmed as typed', () => {
    expect(searchOffer('  Stirnlampe ', active, retired)).toEqual({
      kind: OFFER_CREATE,
      name: 'Stirnlampe',
    })
  })

  it('offers it beside partial hits — „Zelt" finds two rows and still no tent', () => {
    expect(searchOffer('Zelt', active, retired)).toEqual({ kind: OFFER_CREATE, name: 'Zelt' })
  })

  it('offers nothing once an active item carries the name, in any case', () => {
    expect(searchOffer('zeltheringe', active, retired)).toBeNull()
  })

  it('offers nothing for either keyboard spelling of an existing umlaut name', () => {
    // A near-duplicate is the one row this must never invite: „gurtel" and
    // „guertel" are the belt the result list is already showing.
    expect(searchOffer('gurtel', active, retired)).toBeNull()
    expect(searchOffer('guertel', active, retired)).toBeNull()
  })

  it('offers the retired item back instead of a second one of its name', () => {
    expect(searchOffer('regenponcho', active, retired)).toEqual({
      kind: OFFER_RESTORE,
      id: 'i-poncho',
      name: 'Regenponcho',
    })
  })

  it('prefers the active row when a retired one shares its name', () => {
    expect(searchOffer('Gürtel', active, [{ id: 'i-old-guertel', name: 'Gürtel' }])).toBeNull()
  })

  it('offers nothing for a blank query', () => {
    expect(searchOffer('   ', active, retired)).toBeNull()
  })
})
