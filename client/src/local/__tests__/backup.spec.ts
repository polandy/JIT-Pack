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
import type { MasterItem, Template, TemplateItem, Trip, TripItem } from '@/types/domain'

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

function source(over: Partial<BackupSource> = {}): BackupSource {
  return {
    templates: [],
    trips: [],
    masterItem: () => undefined,
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
        trips: [{ trip: trip('r1', 'Samedan'), items: [packed], travelers: [], containers: [] }],
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
