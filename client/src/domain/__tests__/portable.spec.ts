/**
 * M18 portable import (FR-18.4/18.5): YAML parsing with validation and
 * forward compatibility, plus name matching against the master
 * inventory with the FR-16.3-style new/matched/near states.
 */
import { describe, it, expect } from 'vitest'

import {
  joinDocuments,
  PORTABLE_FILE_ACCEPT,
  PORTABLE_MEDIA_TYPE,
  matchPortableItems,
  parsePortable,
  parsePortableAll,
  serializeTemplate,
  serializeTrip,
} from '@/domain/portable'
import type {
  Container,
  MasterItem,
  Template,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
} from '@/types/domain'

function masterItem(id: string, name: string): MasterItem {
  return {
    id,
    name,
    weight_grams: null,
    value_cents: null,
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

/** Explicitly no marks and no tags, for the cases that assert other things. */
const noTags = () => []
const noResolvers = { masterItem: () => undefined, tagsOf: noTags }

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
      name: 'Unterhosen',
      quantity: 1, // legacy formula string in the YAML folds to 1 (FR-18.4 tolerance)
      assignment: 'per_person',
    })
  })

  it('parses a trip document with travelers, containers, and progress', () => {
    const result = parsePortable(tripYAML)
    expect(result.error).toBeNull()
    expect(result.doc).toMatchObject({ kind: 'trip', end_date: '2026-08-10' })
    // The fixture above still carries the retired `profile:` key —
    // a pre-FR-25.9 export must parse, with the key simply dropped.
    expect(result.doc!.travelers).toEqual([{ name: 'Andy' }])
    expect(result.doc!.containers[0]).toMatchObject({ name: 'Radtasche', carrier: 'Andy' })
    expect(result.doc!.items[0]).toMatchObject({
      name: 'Zelt',
      traveler: 'Andy',
      container: 'Radtasche',
      packed_count: 1,
    })
  })

  it.each([
    ['not YAML at all', '::: {{{'],
    ['unknown kind', 'kind: recipe\nschema_version: 1\nname: X\nitems: []'],
    ['missing name', 'kind: template\nschema_version: 1\nitems: []'],
    [
      'item without a name',
      'kind: template\nschema_version: 1\nname: X\nitems:\n  - quantity: "1"',
    ],
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

describe('serialize → parse round-trip (FR-18.2/18.3, Local Mode backup)', () => {
  it('round-trips a group as a group (FR-27.1) — an import must not promote it', () => {
    const group: Template = {
      id: 'grp',
      owner_id: 'me',
      name: 'Makro',
      kind: 'group',
    }
    const yaml = serializeTemplate(group, [], () => undefined, {}, noTags)
    expect(yaml).toContain('scope: group')
    expect(parsePortable(yaml).doc?.scope).toBe('group')
  })

  it('reads a template file written before scopes existed as a Ferien-Vorlage', () => {
    const { doc } = parsePortable('kind: template\nschema_version: 1\nname: Sommer\nitems: []\n')
    expect(doc?.scope).toBe('template')
  })

  it('rejects an unknown scope rather than defaulting it', () => {
    const { doc, error } = parsePortable(
      'kind: template\nschema_version: 1\nname: Sommer\nscope: folder\nitems: []\n',
    )
    expect(doc).toBeNull()
    expect(error).toContain('unknown scope')
  })

  it('round-trips a template with formulas, conditions, and flags', () => {
    const template: Template = {
      id: 'tpl1',
      owner_id: 'me',
      name: 'Base Travel',
      kind: 'template',
    }
    const items: TemplateItem[] = [
      {
        id: 'ti1',
        template_id: 'tpl1',
        item_id: 'i1',
        quantity: 2,
        assignment: 'per_person',
        dedup: 'max',
        conditions: null,
        default_mode: 'pack',
        late_packer: false,
      },
      {
        id: 'ti2',
        template_id: 'tpl1',
        item_id: 'i2',
        quantity: 1,
        assignment: 'trip_global',
        dedup: 'sum',
        conditions: { season: 'winter' },
        default_mode: 'buy_before',
        late_packer: true,
      },
    ]
    const master = new Map<string, MasterItem>([
      ['i1', masterItem('i1', 'Unterhosen')],
      ['i2', masterItem('i2', 'Skibrille')],
    ])

    const yaml = serializeTemplate(template, items, (id) => master.get(id), {}, noTags)
    const result = parsePortable(yaml)

    expect(result.error).toBeNull()
    expect(result.doc).toMatchObject({ kind: 'template', schema_version: 1, name: 'Base Travel' })
    // Items sorted by name, matching the server export (ORDER BY name).
    expect(result.doc!.items.map((i) => i.name)).toEqual(['Skibrille', 'Unterhosen'])
    expect(result.doc!.items[0]).toMatchObject({
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'sum',
      conditions: { season: 'winter' },
      default_mode: 'buy_before',
      late_packer: true,
    })
    // Environment-agnostic: no internal ids anywhere (FR-18.2).
    expect(yaml).not.toContain('tpl1')
    expect(yaml).not.toContain('i2')
  })

  it('round-trips a trip, with progress only when requested (FR-18.3)', () => {
    const trip: Trip = {
      id: 't1',
      name: 'Engadin 2026',
      status: 'active',
      year: 2026,
      start_date: '2026-08-01',
      end_date: '2026-08-10',
      duration_days: 10,
      series_id: 'ser-1',
      series_name: null,
      attributes: null,
      imported: false,
    }
    const travelers: Traveler[] = [{ id: 'tr1', trip_id: 't1', name: 'Andy', linked_user_id: null }]
    const containers: Container[] = [
      {
        id: 'c1',
        trip_id: 't1',
        name: 'Radtasche',
        carrier_traveler_id: 'tr1',
        max_weight_grams: 9000,
        paired_container_id: null,
      },
    ]
    const items: TripItem[] = [
      {
        id: 'a',
        trip_id: 't1',
        source_item_id: null,
        source_template_id: null,
        name: 'Zelt',
        weight_grams: null,
        value_cents: null,
        category_name: 'Outdoor',
        quantity: 2,
        packed_count: 1,
        state: 'partial',
        mode: 'pack',
        late_packer: false,
        assigned_traveler_id: 'tr1',
        packer_user_id: null,
        packed_by_user_id: null,
        packed_at: null,
        container_id: 'c1',
        packing_now_by: null,
        packing_now_at: null,
        bought_from: null,
        flag_unused: false,
        flag_missing: false,
        updated_hlc: '',
      },
    ]

    const withProgress = parsePortable(
      serializeTrip({ trip, items, travelers, containers, includeProgress: true, ...noResolvers }),
    ).doc!
    expect(withProgress).toMatchObject({
      kind: 'trip',
      name: 'Engadin 2026',
      year: 2026,
      start_date: '2026-08-01',
      end_date: '2026-08-10',
    })
    expect(withProgress.travelers).toEqual([{ name: 'Andy' }])
    expect(withProgress.containers[0]).toMatchObject({
      name: 'Radtasche',
      carrier: 'Andy',
      max_weight_grams: 9000,
    })
    expect(withProgress.items[0]).toMatchObject({
      name: 'Zelt',
      quantity: 2,
      category: 'Outdoor',
      traveler: 'Andy',
      container: 'Radtasche',
      packed_count: 1,
    })

    const clean = parsePortable(
      serializeTrip({ trip, items, travelers, containers, includeProgress: false, ...noResolvers }),
    ).doc!
    expect(clean.items[0]!.packed_count).toBeNull()
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

describe('backup documents (NFR-4.11 one-tap backup)', () => {
  it('joins several documents into one file the parser reads back in order', () => {
    const file = joinDocuments([templateYAML, tripYAML])

    const results = parsePortableAll(file)
    expect(results.map((r) => r.doc?.kind)).toEqual(['template', 'trip'])
    expect(results.map((r) => r.doc?.name)).toEqual(['Base Travel', 'Engadin 2026'])
    expect(results.every((r) => r.error === null)).toBe(true)
  })

  it('reads a single-document file too — a backup and an exported trip are one shape', () => {
    const results = parsePortableAll(tripYAML)

    expect(results).toHaveLength(1)
    expect(results[0]!.doc?.name).toBe('Engadin 2026')
  })

  it('reports the broken document without discarding the intact ones', () => {
    const broken = 'kind: nonsense\nname: Kaputt\n'

    const results = parsePortableAll(joinDocuments([templateYAML, broken, tripYAML]))

    expect(results).toHaveLength(3)
    expect(results[0]!.doc?.name).toBe('Base Travel')
    expect(results[1]!.doc).toBeNull()
    expect(results[1]!.error).toMatch(/unknown kind/)
    expect(results[2]!.doc?.name).toBe('Engadin 2026')
  })

  it('has no documents for an empty backup rather than one broken document', () => {
    expect(parsePortableAll(joinDocuments([]))).toEqual([])
    expect(parsePortableAll('   \n')).toEqual([])
  })
})

describe('the portable file contract (FR-18.4, NFR-4.11)', () => {
  it('writes the registered YAML media type, not the historical one', () => {
    // RFC 9512 registered application/yaml in 2024; text/yaml predates it and
    // is what a file written by an older build carries.
    expect(PORTABLE_MEDIA_TYPE).toBe('application/yaml')
  })

  it('offers back the type it writes — the picker cannot drift from the saver', () => {
    expect(PORTABLE_FILE_ACCEPT.split(',')).toContain(PORTABLE_MEDIA_TYPE)
  })

  it('also offers what a phone hands a YAML file back as', () => {
    // A backup saved on iOS returns through the Files picker typed as plain
    // text or not typed at all; a filter that only knows YAML greys it out,
    // which makes the one file the screen exists to read unselectable.
    const accepted = PORTABLE_FILE_ACCEPT.split(',')
    expect(accepted).toEqual(expect.arrayContaining(['.yaml', '.yml', 'text/plain', 'text/yaml']))
  })
})

describe('the composition travels with the file (FR-27.1/27.7, ADR-017)', () => {
  const vorlage: Template = { id: 'v1', owner_id: 'me', name: 'Fototage', kind: 'template' }
  const macro: Template = { id: 'g1', owner_id: 'me', name: 'Makro Fotografie', kind: 'group' }

  function position(id: string, templateId: string, itemId: string): TemplateItem {
    return {
      id,
      template_id: templateId,
      item_id: itemId,
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'max',
      conditions: null,
      default_mode: 'pack',
      late_packer: false,
    }
  }

  const items: MasterItem[] = [
    { id: 'i-cam', name: 'Kamera', weight_grams: null, value_cents: null },
    { id: 'i-med', name: 'Reiseapotheke', weight_grams: null, value_cents: null },
  ]
  const byId = (id: string) => items.find((i) => i.id === id)

  it('writes a Ferien-Vorlage with its groups whole, not by reference', () => {
    // A bare name means nothing on the instance the file lands on, and
    // FR-18.2's promise is that it lands anywhere.
    const yaml = serializeTemplate(
      vorlage,
      [position('p-med', 'v1', 'i-med')],
      byId,
      {
        includes: [{ template: macro, items: [position('p-cam', 'g1', 'i-cam')], tasks: () => [] }],
      },
      noTags,
    )

    const doc = parsePortable(yaml).doc
    expect(doc?.includes.map((g) => g.name)).toEqual(['Makro Fotografie'])
    expect(doc?.includes[0]!.items.map((i) => i.name)).toEqual(['Kamera'])
    // The Vorlage's own positions stay its own — the two lists are not merged.
    expect(doc?.items.map((i) => i.name)).toEqual(['Reiseapotheke'])
  })

  it('carries a position’s preparation tasks (FR-27.7)', () => {
    const yaml = serializeTemplate(
      macro,
      [position('p-cam', 'g1', 'i-cam')],
      byId,
      {
        tasks: (positionId) => (positionId === 'p-cam' ? ['Akkus laden'] : []),
      },
      noTags,
    )

    expect(parsePortable(yaml).doc?.items[0]!.tasks).toEqual(['Akkus laden'])
  })

  // FR-28.10: without this the round trip §3.27's fold-back depends on would
  // quietly strip the marks off a whole Vorlage — on all three levels, since
  // a Vorlage, its groups and their items each carry one.
  it('carries the marks of the Vorlage, its groups and its items (FR-28.10)', () => {
    const yaml = serializeTemplate(
      { ...vorlage, icon: '\u{1F4F7}' },
      [position('p-med', 'v1', 'i-med')],
      (id) => (id === 'i-med' ? { ...items[1]!, icon: '\u{1FA79}' } : byId(id)),
      {
        includes: [
          {
            template: { ...macro, icon: '\u{26FA}' },
            items: [position('p-cam', 'g1', 'i-cam')],
            tasks: () => [],
          },
        ],
      },
      noTags,
    )

    const doc = parsePortable(yaml).doc
    expect(doc?.icon).toBe('\u{1F4F7}')
    expect(doc?.includes[0]!.icon).toBe('\u{26FA}')
    expect(doc?.items[0]!.icon).toBe('\u{1FA79}')
  })

  it('reads a file with no marks at all — absence is the common case (FR-28.10, FR-18.4)', () => {
    const { doc } = parsePortable('kind: template\nschema_version: 1\nname: Sommer\nitems: []\n')
    expect(doc?.icon).toBeNull()
  })

  it('reads a file that predates the composition as a template with no groups', () => {
    const { doc } = parsePortable('kind: template\nschema_version: 1\nname: Sommer\nitems: []\n')

    // Empty rather than absent, so no caller has to tell "none" from "unknown".
    expect(doc?.includes).toEqual([])
  })

  it('rejects a group that includes groups — FR-27.1 is two levels', () => {
    const { doc, error } = parsePortable(
      'kind: template\nscope: group\nname: Makro\nincludes:\n  - name: Wildlife\nitems: []\n',
    )

    expect(doc).toBeNull()
    expect(error).toContain('includes')
  })

  it('rejects an included group with no name — the name is its whole identity', () => {
    const { doc, error } = parsePortable(
      'kind: template\nname: Fototage\nincludes:\n  - items: []\nitems: []\n',
    )

    expect(doc).toBeNull()
    expect(error).toContain('name')
  })
})

describe('serializeTrip — status, marks and tags (FR-18.4 amendment)', () => {
  const trip: Trip = {
    id: 't9',
    name: 'Samedan 2025',
    year: 2025,
    start_date: null,
    end_date: null,
    status: 'archived',
    series_id: null,
    series_name: null,
    attributes: null,
    imported: false,
    duration_days: null,
  }
  const travelers: Traveler[] = []
  const containers: Container[] = []

  /** A trip row backed by a master item, and one the user typed themselves. */
  const items: TripItem[] = [
    {
      id: 'r1',
      trip_id: 't9',
      source_item_id: 'i1',
      source_template_id: null,
      name: 'Wanderschuhe',
      weight_grams: null,
      value_cents: null,
      category_name: null,
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      late_packer: false,
      assigned_traveler_id: null,
      packer_user_id: null,
      packed_by_user_id: null,
      packed_at: null,
      container_id: null,
      packing_now_by: null,
      packing_now_at: null,
      bought_from: null,
      flag_unused: false,
      flag_missing: false,
      updated_hlc: '',
    },
    {
      id: 'r2',
      trip_id: 't9',
      source_item_id: null,
      source_template_id: null,
      name: 'Zettel vom Kiosk',
      weight_grams: null,
      value_cents: null,
      category_name: null,
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      late_packer: false,
      assigned_traveler_id: null,
      packer_user_id: null,
      packed_by_user_id: null,
      packed_at: null,
      container_id: null,
      packing_now_by: null,
      packing_now_at: null,
      bought_from: null,
      flag_unused: false,
      flag_missing: false,
      updated_hlc: '',
    },
  ]

  const args = {
    trip,
    items,
    travelers,
    containers,
    includeProgress: true,
    masterItem: (id: string) =>
      id === 'i1' ? { ...masterItem('i1', 'Wanderschuhe'), icon: '🥾' } : undefined,
    tagsOf: (id: string) => (id === 'i1' ? ['Schuhe', 'Sommer'] : []),
  }

  it('carries the trip status, so a restore gives back what it saved', () => {
    expect(parsePortable(serializeTrip(args)).doc!.status).toBe('archived')
  })

  it('carries the mark and the ordered tags of an inventory-backed row', () => {
    const doc = parsePortable(serializeTrip(args)).doc!
    const row = doc.items.find((i) => i.name === 'Wanderschuhe')!
    expect(row.from_inventory).toBe(true)
    expect(row.icon).toBe('🥾')
    // Ordered, not a set: position 0 is the primary tag (FR-24.2).
    expect(row.tags).toEqual(['Schuhe', 'Sommer'])
  })

  it('leaves an ad-hoc row ad-hoc, so a restore does not invent inventory', () => {
    const doc = parsePortable(serializeTrip(args)).doc!
    const row = doc.items.find((i) => i.name === 'Zettel vom Kiosk')!
    expect(row.from_inventory).toBe(false)
    expect(row.icon).toBeNull()
    expect(row.tags).toEqual([])
  })
})

describe('serializeTemplate — tags (FR-24.1/24.2)', () => {
  it('carries a position’s tags in position order', () => {
    const template: Template = { id: 'tp1', owner_id: 'u1', name: 'Ferien', kind: 'template' }
    const items: TemplateItem[] = [
      {
        id: 'ti1',
        template_id: 'tp1',
        item_id: 'i1',
        quantity: 1,
        assignment: 'trip_global',
        dedup: 'max',
        default_mode: 'pack',
        late_packer: false,
        conditions: null,
      },
    ]
    const yaml = serializeTemplate(
      template,
      items,
      () => masterItem('i1', 'Wanderschuhe'),
      {},
      () => ['Schuhe', 'Sommer'],
    )
    expect(parsePortable(yaml).doc!.items[0]!.tags).toEqual(['Schuhe', 'Sommer'])
  })
})
