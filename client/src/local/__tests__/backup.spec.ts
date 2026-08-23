/**
 * NFR-4.11 — the one-tap backup behind the G-2 detail (FR-19.6).
 *
 * In Local Mode this file is the only copy of everything the user owns, so
 * what matters here is that it is *complete* and that it comes back: every
 * test asserts against the parser that has to read it again, never against
 * the YAML text.
 */
import { describe, it, expect } from 'vitest'

import { backupFilename, buildBackup, type BackupSource } from '@/local/backup'
import { parsePortableAll } from '@/domain/portable'
import type {
  AppliedChange,
  GeneratedPosition,
  MasterItem,
  Template,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
} from '@/types/domain'

const item = (id: string, name: string): MasterItem => ({
  id,
  name,
  weight_grams: null,
  value_cents: null,
})

const template = (id: string, name: string): Template =>
  ({ id, name, kind: 'template', owner_id: 'me' }) as Template

const templateItem = (id: string, templateId: string, itemId: string): TemplateItem =>
  ({
    id,
    template_id: templateId,
    item_id: itemId,
    quantity: 2,
    assignment: 'trip_global',
    dedup: 'max',
    default_mode: 'pack',
    late_packer: false,
    conditions: null,
  }) as TemplateItem

const trip = (id: string, name: string): Trip =>
  ({ id, name, year: 2026, start_date: null, end_date: null, status: 'planning' }) as Trip

const tripItem = (id: string, tripId: string, name: string): TripItem =>
  ({
    id,
    trip_id: tripId,
    name,
    quantity: 1,
    packed_count: 0,
    mode: 'pack',
    state: 'open',
    late_packer: false,
  }) as TripItem

/** A trip that follows nothing — the FR-27.4 sections stay empty. */
const noRefresh = { sources: [], generated: [], appliedChanges: [] }

function source(over: Partial<BackupSource> = {}): BackupSource {
  return {
    templates: [],
    trips: [],
    masterItem: () => undefined,
    tagsOf: () => [],
    template: () => undefined,
    composition: { includes: [], templates: [], itemsOf: () => [], tasksOf: () => [] },
    ...over,
  }
}

describe('buildBackup (NFR-4.11)', () => {
  it('carries every trip and every template in one readable file', () => {
    const file = buildBackup(
      source({
        templates: [
          { template: template('t1', 'Sommerferien'), items: [templateItem('p1', 't1', 'i1')] },
        ],
        trips: [
          {
            trip: trip('r1', 'Samedan 2026'),
            items: [tripItem('ti1', 'r1', 'Zelt')],
            travelers: [],
            containers: [],
            ...noRefresh,
          },
        ],
        masterItem: (id) => (id === 'i1' ? item('i1', 'Kamera') : undefined),
      }),
    )

    const docs = parsePortableAll(file)
    expect(docs.map((d) => [d.doc?.kind, d.doc?.name])).toEqual([
      ['template', 'Sommerferien'],
      ['trip', 'Samedan 2026'],
    ])
    expect(docs[0]!.doc?.items.map((i) => i.name)).toEqual(['Kamera'])
    expect(docs[1]!.doc?.items.map((i) => i.name)).toEqual(['Zelt'])
  })

  it('keeps the pack progress — a restored backup must not claim nothing was packed', () => {
    const packed = { ...tripItem('ti1', 'r1', 'Zelt'), packed_count: 1 }
    const file = buildBackup(
      source({
        trips: [
          {
            trip: trip('r1', 'Samedan'),
            items: [packed],
            travelers: [],
            containers: [],
            ...noRefresh,
          },
        ],
      }),
    )

    expect(parsePortableAll(file)[0]!.doc?.items[0]?.packed_count).toBe(1)
  })

  it('is empty for an empty device rather than a file with nothing in it', () => {
    expect(buildBackup(source())).toBe('')
    expect(parsePortableAll(buildBackup(source()))).toEqual([])
  })
})

describe('backupFilename', () => {
  it('dates the file from the injected clock, so two backups never collide silently', () => {
    expect(backupFilename(Date.UTC(2026, 7, 16, 12))).toBe('jitpack-backup-2026-08-16.yaml')
  })
})

describe('a backup carries the composition, not a shell (FR-27.1/27.7)', () => {
  const macro: Template = { id: 'g1', owner_id: 'me', name: 'Makro Fotografie', kind: 'group' }
  const vorlage: Template = { id: 'v1', owner_id: 'me', name: 'Fototage', kind: 'template' }
  const camera: TemplateItem = {
    id: 'p-cam',
    template_id: 'g1',
    item_id: 'i-cam',
    quantity: 1,
    assignment: 'trip_global',
    dedup: 'max',
    conditions: null,
    default_mode: 'pack',
    late_packer: false,
  }

  it('restores a Ferien-Vorlage with its groups and their preparation tasks', () => {
    // In Local Mode this file is the only copy. A Vorlage whose groups did
    // not travel would come back as a name with nothing in it — the failure
    // is invisible until the next trip is generated from it.
    const file = buildBackup(
      source({
        templates: [
          { template: macro, items: [camera] },
          { template: vorlage, items: [] },
        ],
        masterItem: (id) =>
          id === 'i-cam'
            ? { id: 'i-cam', name: 'Kamera', weight_grams: null, value_cents: null }
            : undefined,
        composition: {
          includes: [{ id: 'inc1', template_id: 'v1', included_template_id: 'g1' }],
          templates: [macro, vorlage],
          itemsOf: (id) => (id === 'g1' ? [camera] : []),
          tasksOf: (id) => (id === 'p-cam' ? ['Akkus laden'] : []),
        },
      }),
    )

    const docs = parsePortableAll(file)
    const composed = docs.find((d) => d.doc?.name === 'Fototage')?.doc
    expect(composed?.includes.map((g) => g.name)).toEqual(['Makro Fotografie'])
    expect(composed?.includes[0]!.items[0]!.tasks).toEqual(['Akkus laden'])

    // The group keeps its own document too: it is a template in its own right
    // and other Vorlagen may include it.
    const group = docs.find((d) => d.doc?.name === 'Makro Fotografie')?.doc
    expect(group?.scope).toBe('group')
    expect(group?.items[0]!.tasks).toEqual(['Akkus laden'])
  })
})

describe('a backup carries how a trip follows its groups (FR-27.4)', () => {
  const makro: Template = { id: 'g1', owner_id: 'me', name: 'Makro', kind: 'group' }
  const kamera: MasterItem = { id: 'i-cam', name: 'Kamera', weight_grams: 900, value_cents: null }

  const ledger = (over: Partial<GeneratedPosition> = {}): GeneratedPosition => ({
    id: 'led1',
    trip_id: 'r1',
    trip_item_id: 'ti1',
    source_template_id: 'g1',
    source_item_id: 'i-cam',
    traveler_id: '',
    name: 'Kamera',
    quantity: 2,
    mode: 'pack',
    late_packer: true,
    weight_grams: 900,
    value_cents: null,
    category_name: 'Foto',
    tasks: ['Akkus laden'],
    ...over,
  })

  const logEntry: AppliedChange = {
    id: 'ac1',
    trip_id: 'r1',
    source_template_id: 'g1',
    source_template_name: 'Makro',
    kind: 'changed',
    item_name: 'Kamera',
    detail: { field: 'quantity', from: 1, to: 2 },
    created_at: '2026-08-19T10:00:00.000Z',
  }

  function backupOf(over: Partial<BackupSource['trips'][number]> = {}) {
    return buildBackup(
      source({
        trips: [
          {
            trip: trip('r1', 'Fototour'),
            items: [tripItem('ti1', 'r1', 'Kamera')],
            travelers: [],
            containers: [],
            sources: [{ id: 's1', trip_id: 'r1', template_id: 'g1' }],
            generated: [ledger()],
            appliedChanges: [logEntry],
            ...over,
          },
        ],
        masterItem: (id) => (id === 'i-cam' ? kamera : undefined),
        template: (id) => (id === 'g1' ? makro : undefined),
      }),
    )
  }

  it('names the templates the trip follows, so a restore keeps following them', () => {
    // Without this the restored trip follows nothing at all: no proposal ever
    // reaches it again, and the group edit that arrives tomorrow is silent.
    expect(parsePortableAll(backupOf())[0]!.doc?.follows).toEqual(['Makro'])
  })

  it('carries the ledger snapshot, which is what tells a group change from a manual edit', () => {
    const entry = parsePortableAll(backupOf())[0]!.doc?.generated[0]
    expect(entry).toMatchObject({
      item: 'Kamera',
      source: 'Makro',
      name: 'Kamera',
      quantity: 2,
      mode: 'pack',
      late_packer: true,
      weight_grams: 900,
      value_cents: null,
      category: 'Foto',
      tasks: ['Akkus laden'],
    })
    // Trip-global (FR-25.8): no traveler, rather than a traveler named ''.
    expect(entry?.traveler).toBeNull()
  })

  it('names the traveler of a per-person entry rather than its id', () => {
    const andy = { id: 'tr1', trip_id: 'r1', name: 'Andy' } as Traveler
    const file = backupOf({ travelers: [andy], generated: [ledger({ traveler_id: 'tr1' })] })
    expect(parsePortableAll(file)[0]!.doc?.generated[0]?.traveler).toBe('Andy')
  })

  it('carries the applied-changes log with its own timestamp, not the restore’s', () => {
    expect(parsePortableAll(backupOf())[0]!.doc?.applied_changes).toEqual([
      {
        source: 'Makro',
        kind: 'changed',
        item: 'Kamera',
        detail: { field: 'quantity', from: 1, to: 2 },
        at: '2026-08-19T10:00:00.000Z',
      },
    ])
  })

  it('drops a ledger entry whose identity can no longer be named', () => {
    // Half a reference restores against the wrong position and detaches one
    // nobody asked to detach — worse than the entry being missing, which the
    // refresh simply re-derives.
    const file = backupOf({ generated: [ledger({ source_item_id: 'gone' })] })
    expect(parsePortableAll(file)[0]!.doc?.generated).toEqual([])
    // The log survives it: its group name is denormalised on purpose, so the
    // record of what a group did outlives the group.
    expect(parsePortableAll(file)[0]!.doc?.applied_changes).toHaveLength(1)
  })

  it('omits the sections entirely for a trip that follows nothing', () => {
    const file = backupOf({ sources: [], generated: [], appliedChanges: [] })
    expect(file).not.toContain('follows:')
    expect(file).not.toContain('generated:')
    expect(file).not.toContain('applied_changes:')
    expect(parsePortableAll(file)[0]!.doc?.follows).toEqual([])
  })
})
