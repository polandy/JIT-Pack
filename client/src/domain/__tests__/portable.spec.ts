/**
 * M18 portable import (FR-18.4/18.5): YAML parsing with validation and
 * forward compatibility, plus name matching against the master
 * inventory with the FR-16.3-style new/matched/near states.
 */
import { describe, it, expect } from 'vitest'

import { matchPortableItems, parsePortable } from '@/domain/portable'
import type { MasterItem } from '@/types/domain'

function masterItem(id: string, name: string): MasterItem {
  return {
    id,
    name,
    category_id: null,
    weight_grams: null,
    value_cents: null,
    is_consumable: false,
    unit: 'pieces',
    per_day_rate: null,
  }
}

const templateYAML = `kind: template
schema_version: 1
name: Base Travel
items:
  - name: Unterhosen
    quantity: "trip_duration + 1"
    assignment: per_person
    unit: pieces
  - name: Sonnencreme
    quantity: "1"
    assignment: trip_global
    dedup: sum
`

const tripYAML = `kind: trip
schema_version: 1
name: Engadin 2026
start_date: "2026-08-01"
end_date: "2026-08-10"
travelers:
  - name: Andy
    profile: adult
containers:
  - name: Radtasche
    carrier: Andy
    max_weight_grams: 9000
items:
  - name: Zelt
    quantity: "1"
    mode: pack
    category: Outdoor
    traveler: Andy
    container: Radtasche
    packed_count: 1
`

describe('parsePortable (FR-18.5)', () => {
  it('parses a template document', () => {
    const result = parsePortable(templateYAML)
    expect(result.error).toBeNull()
    expect(result.doc).toMatchObject({
      kind: 'template',
      name: 'Base Travel',
      schema_version: 1,
    })
    expect(result.doc!.items).toHaveLength(2)
    expect(result.doc!.items[0]).toMatchObject({
      name: 'Unterhosen', quantity: 'trip_duration + 1', assignment: 'per_person',
    })
  })

  it('parses a trip document with travelers, containers, and progress', () => {
    const result = parsePortable(tripYAML)
    expect(result.error).toBeNull()
    expect(result.doc).toMatchObject({ kind: 'trip', end_date: '2026-08-10' })
    expect(result.doc!.travelers).toEqual([{ name: 'Andy', profile: 'adult' }])
    expect(result.doc!.containers[0]).toMatchObject({ name: 'Radtasche', carrier: 'Andy' })
    expect(result.doc!.items[0]).toMatchObject({
      name: 'Zelt', traveler: 'Andy', container: 'Radtasche', packed_count: 1,
    })
  })

  it.each([
    ['not YAML at all', '::: {{{'],
    ['unknown kind', 'kind: recipe\nschema_version: 1\nname: X\nitems: []'],
    ['missing name', 'kind: template\nschema_version: 1\nitems: []'],
    ['item without a name', 'kind: template\nschema_version: 1\nname: X\nitems:\n  - quantity: "1"'],
  ])('rejects %s with an error', (_name, text) => {
    const result = parsePortable(text)
    expect(result.doc).toBeNull()
    expect(result.error).not.toBeNull()
  })

  it('flags a newer schema_version but still parses (best effort, FR-18.5)', () => {
    const result = parsePortable(templateYAML.replace('schema_version: 1', 'schema_version: 9'))
    expect(result.error).toBeNull()
    expect(result.newerSchema).toBe(true)
    expect(result.doc?.items).toHaveLength(2)
  })

  it('ignores unrecognized fields (FR-18.5)', () => {
    const result = parsePortable(templateYAML + '\nfuture_field: whatever')
    expect(result.error).toBeNull()
    expect(result.doc?.name).toBe('Base Travel')
  })
})

describe('matchPortableItems (FR-18.4 / FR-16.3)', () => {
  const existing = [masterItem('i1', 'Unterhosen'), masterItem('i2', 'Sonnenkreme')]

  it('classifies items as matched, near-duplicate, or new', () => {
    const doc = parsePortable(templateYAML).doc!
    const matches = matchPortableItems(doc, existing)

    expect(matches).toEqual([
      { name: 'Unterhosen', state: 'matched', existingId: 'i1', existingName: 'Unterhosen' },
      { name: 'Sonnencreme', state: 'near', existingId: 'i2', existingName: 'Sonnenkreme' },
    ])
  })

  it('marks unknown names as new', () => {
    const doc = parsePortable(tripYAML).doc!
    expect(matchPortableItems(doc, existing)).toEqual([
      { name: 'Zelt', state: 'new', existingId: null, existingName: null },
    ])
  })
})
