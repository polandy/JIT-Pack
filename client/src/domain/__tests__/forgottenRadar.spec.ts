/**
 * FR-9.5 — the forgotten radar: which earlier trip a planning trip is
 * compared with, and what that trip recorded as missing.
 */
import { describe, it, expect } from 'vitest'

import {
  RADAR_ENTRY_NOT_ON_LIST,
  RADAR_ENTRY_STAYED_HOME,
  RADAR_REASON_SERIES,
  RADAR_REASON_TEMPLATE,
  radarEntries,
  radarReference,
  type RadarTemplateRef,
} from '@/domain/forgottenRadar'
import type { TripComments } from '@/domain/itemHistory'
import type { Trip, TripItem, TripTemplateSource } from '@/types/domain'

function trip(id: string, over: Partial<Trip> = {}): Trip {
  return {
    id,
    name: id,
    status: 'archived',
    year: 2025,
    start_date: null,
    end_date: null,
    duration_days: null,
    series_id: null,
    attributes: null,
    packing_closed_at: null,
    imported: false,
    ...over,
  }
}

function source(tripId: string, templateId: string): TripTemplateSource {
  return { id: `${tripId}-${templateId}`, trip_id: tripId, template_id: templateId }
}

const TEMPLATES: RadarTemplateRef[] = [
  { id: 'sommer', kind: 'template' },
  { id: 'winter', kind: 'template' },
  { id: 'kamera', kind: 'group' },
]

function row(id: string, over: Partial<TripItem> = {}): TripItem {
  return {
    id,
    trip_id: 'ref',
    source_item_id: null,
    source_template_id: null,
    name: id,
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
    bought_at: null,
    bought_by_user_id: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '',
    ...over,
  }
}

function reference(
  items: TripItem[],
  comments: TripComments['comments'] = [],
): TripComments & { items: TripItem[] } {
  return { tripId: 'ref', tripName: 'Samedan 2025', items, comments }
}

describe('radarReference (FR-9.5)', () => {
  const planning = trip('new', { status: 'planning', year: 2026, series_id: 'samedan' })

  it('takes the newest archived trip of the same series, naming the series as the reason', () => {
    const trips = [
      planning,
      trip('s2023', { year: 2023, series_id: 'samedan' }),
      trip('s2025', { year: 2025, series_id: 'samedan' }),
      trip('other', { year: 2025, series_id: 'engadin' }),
    ]
    expect(radarReference(planning, trips, [], TEMPLATES)).toEqual({
      trip: trips[2],
      reason: { kind: RADAR_REASON_SERIES, seriesId: 'samedan' },
    })
  })

  it('orders by year, then start date, an undated trip after a dated one of the same year', () => {
    const trips = [
      planning,
      trip('undated', { series_id: 'samedan' }),
      trip('july', { series_id: 'samedan', start_date: '2025-07-01' }),
      trip('march', { series_id: 'samedan', start_date: '2025-03-01' }),
    ]
    expect(radarReference(planning, trips, [], TEMPLATES)?.trip.id).toBe('july')
  })

  it('ignores a trip that is not archived — only a finished trip has a record', () => {
    const trips = [
      planning,
      trip('running', { status: 'active', series_id: 'samedan', year: 2026 }),
    ]
    expect(radarReference(planning, trips, [], TEMPLATES)).toBeNull()
  })

  it('never takes the trip itself, even once it is archived', () => {
    const archived = { ...planning, status: 'archived' as const }
    expect(radarReference(archived, [archived], [], TEMPLATES)).toBeNull()
  })

  it('falls back to a shared Ferien-Vorlage when the series has no archived trip', () => {
    const trips = [planning, trip('bretagne', { series_id: null })]
    const sources = [source('new', 'sommer'), source('bretagne', 'sommer')]
    expect(radarReference(planning, trips, sources, TEMPLATES)).toEqual({
      trip: trips[1],
      reason: { kind: RADAR_REASON_TEMPLATE, templateId: 'sommer' },
    })
  })

  it('does not count a shared group as similar — a camera group goes everywhere', () => {
    const trips = [planning, trip('bretagne')]
    const sources = [source('new', 'kamera'), source('bretagne', 'kamera')]
    expect(radarReference(planning, trips, sources, TEMPLATES)).toBeNull()
  })

  it('prefers the series over a newer trip that only shares a template', () => {
    const trips = [
      planning,
      trip('s2022', { year: 2022, series_id: 'samedan' }),
      trip('bretagne', { year: 2025 }),
    ]
    const sources = [source('new', 'sommer'), source('bretagne', 'sommer')]
    expect(radarReference(planning, trips, sources, TEMPLATES)?.trip.id).toBe('s2022')
  })

  it('finds nothing for a trip with neither a series nor a template', () => {
    const lone = trip('lone', { status: 'planning' })
    expect(radarReference(lone, [lone, trip('old')], [], TEMPLATES)).toBeNull()
  })
})

describe('radarEntries (FR-9.5)', () => {
  it('lists every missing row, telling a row that stayed home from one bought on the way', () => {
    const entries = radarEntries(
      reference([
        row('akku', { name: 'Ersatzakku', source_item_id: 'i-akku', flag_missing: true }),
        row('regen', {
          name: 'Regenhose',
          source_item_id: 'i-regen',
          flag_missing: true,
          state: 'skipped',
        }),
        row('schuhe', { name: 'Wanderschuhe', source_item_id: 'i-schuhe' }),
      ]),
      [],
    )
    expect(entries.map((e) => [e.name, e.kind, e.sourceItemId])).toEqual([
      ['Ersatzakku', RADAR_ENTRY_NOT_ON_LIST, 'i-akku'],
      ['Regenhose', RADAR_ENTRY_STAYED_HOME, 'i-regen'],
    ])
  })

  it('folds one item missing for several travellers into one entry', () => {
    const entries = radarEntries(
      reference([
        row('a1', { name: 'Sonnencreme', source_item_id: 'i-sonne', flag_missing: true }),
        row('a2', { name: 'Sonnencreme', source_item_id: 'i-sonne', flag_missing: true }),
      ]),
      [],
    )
    expect(entries).toHaveLength(1)
  })

  it('carries the comments written on the row, newest first, even without an inventory item', () => {
    const entries = radarEntries(
      reference(
        [row('adhoc', { name: 'Adapter', flag_missing: true })],
        [
          {
            id: 'c1',
            trip_item_id: 'adhoc',
            author_id: 'u1',
            body: 'älter',
            created_at: '2025-08-01T08:00:00Z',
          },
          {
            id: 'c2',
            trip_item_id: 'adhoc',
            author_id: 'u1',
            body: 'neuer',
            created_at: '2025-08-03T08:00:00Z',
          },
          {
            id: 'c3',
            trip_item_id: 'other',
            author_id: 'u1',
            body: 'fremd',
            created_at: '2025-08-04T08:00:00Z',
          },
        ],
      ),
      [],
    )
    expect(entries[0]?.comments.map((c) => c.body)).toEqual(['neuer', 'älter'])
  })

  it('drops an entry whose item is already on the planning trip', () => {
    const entries = radarEntries(
      reference([
        row('akku', { name: 'Ersatzakku', source_item_id: 'i-akku', flag_missing: true }),
      ]),
      [{ source_item_id: 'i-akku', name: 'Kamera-Akku' }],
    )
    expect(entries).toEqual([])
  })

  it('drops an entry by name where either side has no inventory item', () => {
    const entries = radarEntries(
      reference([row('adhoc', { name: 'Reiseadapter', flag_missing: true })]),
      [{ source_item_id: 'i-adapter', name: ' reiseADAPTER ' }],
    )
    expect(entries).toEqual([])
  })

  it('sorts the entries by name, so the card reads the same on every device', () => {
    const entries = radarEntries(
      reference([
        row('z', { name: 'Zeckenzange', flag_missing: true }),
        row('a', { name: 'Ärmelschoner', flag_missing: true }),
        row('b', { name: 'Badetuch', flag_missing: true }),
      ]),
      [],
    )
    expect(entries.map((e) => e.name)).toEqual(['Ärmelschoner', 'Badetuch', 'Zeckenzange'])
  })
})
