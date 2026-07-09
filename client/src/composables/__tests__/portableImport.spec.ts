/**
 * M18 commitPortableImport (FR-18.4): template imports become a new
 * private owned template (FR-1.6) with master items merged or created;
 * trip imports become a planning trip with travelers/containers
 * remapped by name and pack progress preserved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { parsePortable } from '@/domain/portable'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ results: [], pull_hint: { next_cursor: 1 }, changes: [], next_cursor: 1, has_more: false }),
    { status: 200 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

describe('commitPortableImport — template (FR-18.4/FR-1.6)', () => {
  const doc = parsePortable(`kind: template
schema_version: 1
name: Base Travel
items:
  - name: Unterhosen
    quantity: "trip_duration + 1"
    assignment: per_person
    unit: pieces
  - name: Skibrille
    quantity: "1"
    assignment: trip_global
    dedup: sum
    conditions: {season: winter}
    late_packer: true
`).doc!

  it('creates a private template, merging decided items and creating the rest', () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0, table: 'items', id: 'i1', deleted: false,
      row: { name: 'Unterhosen', unit: 'pieces', is_consumable: 0 },
    })

    const result = orch.commitPortableImport(doc, new Map([['Unterhosen', 'i1']]))

    expect(result.kind).toBe('template')
    const template = master.getTemplate(result.id)!
    expect(template.name).toBe('Base Travel')
    expect(template.is_published).toBe(false)

    const items = master.getTemplateItems(result.id)
    expect(items).toHaveLength(2)
    const unterhosen = items.find((ti) => ti.item_id === 'i1')!
    expect(unterhosen).toMatchObject({ quantity_formula: 'trip_duration + 1', assignment: 'per_person' })

    const skibrille = items.find((ti) => ti.item_id !== 'i1')!
    expect(skibrille).toMatchObject({
      quantity_formula: '1', assignment: 'trip_global', dedup: 'sum', late_packer: true,
      conditions: { season: 'winter' },
    })
    expect(master.itemList.find((i) => i.name === 'Skibrille')).toBeDefined()
  })

  it('avoids own-template name collisions with a suffix', () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0, table: 'templates', id: 'tpl-1', deleted: false,
      row: { owner_id: 'me', name: 'Base Travel', is_published: 0 },
    })

    const result = orch.commitPortableImport(doc, new Map())

    expect(master.getTemplate(result.id)?.name).toBe('Base Travel (import)')
  })
})

describe('commitPortableImport — trip (FR-18.4)', () => {
  const doc = parsePortable(`kind: trip
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
    quantity: "2"
    mode: pack
    category: Outdoor
    traveler: Andy
    container: Radtasche
    packed_count: 1
`).doc!

  it('creates a planning trip with remapped names and preserved progress', () => {
    const orch = newOrch()
    const trips = useTripStore()

    const result = orch.commitPortableImport(doc, new Map())

    expect(result.kind).toBe('trip')
    const trip = trips.getTrip(result.id)!
    expect(trip).toMatchObject({ name: 'Engadin 2026', status: 'planning', end_date: '2026-08-10' })

    const travelers = trips.getTravelers(result.id)
    expect(travelers.map((t) => t.name)).toEqual(['Andy'])

    const containers = trips.getContainers(result.id)
    expect(containers[0]).toMatchObject({ name: 'Radtasche', max_weight_grams: 9000 })
    expect(containers[0].carrier_traveler_id).toBe(travelers[0].id)

    const item = trips.getItems(result.id)[0]
    expect(item).toMatchObject({
      name: 'Zelt', quantity: 2, packed_count: 1, state: 'partial',
      category_name: 'Outdoor', mode: 'pack',
    })
    expect(item.assigned_traveler_id).toBe(travelers[0].id)
    expect(item.container_id).toBe(containers[0].id)
  })
})
