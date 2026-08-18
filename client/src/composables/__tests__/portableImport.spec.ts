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
import { joinDocuments, parsePortable, parsePortableAll } from '@/domain/portable'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [],
        pull_hint: { next_cursor: 1 },
        changes: [],
        next_cursor: 1,
        has_more: false,
      }),
      { status: 200 },
    ),
  )
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
      seq: 0,
      table: 'items',
      id: 'i1',
      deleted: false,
      row: { name: 'Unterhosen' },
    })

    const result = orch.commitPortableImport(doc, new Map([['Unterhosen', 'i1']]))

    expect(result.kind).toBe('template')
    const template = master.getTemplate(result.id)!
    expect(template.name).toBe('Base Travel')

    const items = master.getTemplateItems(result.id)
    expect(items).toHaveLength(2)
    const unterhosen = items.find((ti) => ti.item_id === 'i1')!
    expect(unterhosen).toMatchObject({
      quantity: 1, // legacy formula in the fixture YAML folds to 1 (FR-18.4 tolerance)
      assignment: 'per_person',
    })

    const skibrille = items.find((ti) => ti.item_id !== 'i1')!
    expect(skibrille).toMatchObject({
      quantity: 1,
      assignment: 'trip_global',
      dedup: 'sum',
      late_packer: true,
      conditions: { season: 'winter' },
    })
    expect(master.itemList.find((i) => i.name === 'Skibrille')).toBeDefined()
  })

  it('avoids own-template name collisions with a suffix', () => {
    const orch = newOrch()
    const master = useMasterStore()
    master.applyChange({
      seq: 0,
      table: 'templates',
      id: 'tpl-1',
      deleted: false,
      row: { owner_id: 'me', name: 'Base Travel' },
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
    expect(containers[0]!.carrier_traveler_id).toBe(travelers[0]!.id)

    const item = trips.getItems(result.id)[0]!
    expect(item).toMatchObject({
      name: 'Zelt',
      quantity: 2,
      packed_count: 1,
      state: 'partial',
      category_name: 'Outdoor',
      mode: 'pack',
    })
    expect(item.assigned_traveler_id).toBe(travelers[0]!.id)
    expect(item.container_id).toBe(containers[0]!.id)
  })
})

describe('commitPortableRestore — a whole backup file (NFR-4.11)', () => {
  const backup = joinDocuments([
    `kind: template
schema_version: 1
name: Sommerferien
items:
  - name: Kamera
    quantity: 1
    assignment: trip_global
`,
    `kind: trip
schema_version: 1
name: Samedan 2026
year: 2026
items:
  - name: Kamera
    quantity: 1
    mode: pack
    packed_count: 1
`,
  ])

  it('restores every document of the file', () => {
    const orch = newOrch()
    const master = useMasterStore()
    const trips = useTripStore()

    const results = orch.commitPortableRestore(parsePortableAll(backup).map((r) => r.doc!))

    expect(results).toHaveLength(2)
    expect(master.templateList.map((t) => t.name)).toEqual(['Sommerferien'])
    expect(trips.tripList.map((t) => t.name)).toEqual(['Samedan 2026'])
  })

  it('matches a later document against the items an earlier one created', () => {
    const orch = newOrch()
    const master = useMasterStore()

    orch.commitPortableRestore(parsePortableAll(backup).map((r) => r.doc!))

    // Both documents name the same camera. Re-matching between documents is
    // the whole point: matching once, up front, would create it twice and
    // turn a restore into a duplicate inventory.
    expect(master.itemList.filter((i) => i.name === 'Kamera')).toHaveLength(1)
  })

  it('carries on when one document is unusable', () => {
    const orch = newOrch()
    const trips = useTripStore()

    const results = orch.commitPortableRestore([
      ...parsePortableAll(backup).map((r) => r.doc!),
      { ...parsePortableAll(backup)[1]!.doc!, name: '' },
    ])

    expect(results).toHaveLength(2)
    expect(trips.tripList).toHaveLength(1)
  })
})

describe('commitPortableImport — the composition comes back (FR-27.1/27.7, ADR-017)', () => {
  const file = `kind: template
schema_version: 1
name: Fototage
scope: template
includes:
  - name: Makro Fotografie
    items:
      - name: Kamera
        quantity: 1
        assignment: trip_global
        tasks: ["Akkus laden"]
items:
  - name: Reiseapotheke
    quantity: 1
    assignment: trip_global
`

  it('creates the group the file brought and includes it, with its tasks', () => {
    // In Local Mode this *is* the restore path: a Vorlage that came back
    // without its groups would generate an empty trip, and nothing would say
    // so until the next trip was generated.
    const orch = newOrch()
    const master = useMasterStore()

    const result = orch.commitPortableImport(parsePortable(file).doc!, new Map())

    const group = master.templateList.find((t) => t.name === 'Makro Fotografie')
    expect(group?.kind).toBe('group')
    expect(master.includeList.map((i) => [i.template_id, i.included_template_id])).toEqual([
      [result.id, group!.id],
    ])

    const position = master.getTemplateItems(group!.id)[0]!
    expect(master.getItem(position.item_id)?.name).toBe('Kamera')
    expect(master.getTemplateItemTasks(position.id).map((t) => t.task)).toEqual(['Akkus laden'])
  })

  it('links a group that already exists instead of duplicating or rewriting it', () => {
    // The file may be older than the group, and since FR-27.4 a group edit
    // reaches every trip that follows it — an import must not be an editor.
    const orch = newOrch()
    const master = useMasterStore()
    const existingId = orch.createTemplate('Makro Fotografie', 'group')
    const itemId = orch.createMasterItem('Stativ', {})
    orch.addTemplateItem(existingId, itemId, {
      quantity: 1,
      assignment: 'trip_global',
      defaultMode: 'pack',
    })

    const result = orch.commitPortableImport(parsePortable(file).doc!, new Map())

    expect(master.templateList.filter((t) => t.name === 'Makro Fotografie')).toHaveLength(1)
    expect(master.includeList.map((i) => i.included_template_id)).toEqual([existingId])
    // Untouched: the file's Kamera did not join the existing group.
    const names = master
      .getTemplateItems(existingId)
      .map((p) => master.getItem(p.item_id)?.name)
      .sort()
    expect(names).toEqual(['Stativ'])
    expect(result.kind).toBe('template')
  })

  const groupDoc = `kind: template
schema_version: 1
name: Makro Fotografie
scope: group
items:
  - name: Kamera
    quantity: 1
    assignment: trip_global
    tasks: ["Akkus laden"]
`

  // The group arrives twice in a backup — nested in the Vorlage and as its
  // own document (ADR-017 calls that redundancy deliberate). Which of the two
  // lands first is not stable: the file is written in `templateList` order,
  // which in Local Mode comes from IndexedDB keyed by a random id and is
  // re-rolled on every reload. Both orders must end at one group.
  it.each([
    ['the group document first', () => [groupDoc, file]],
    ['the Vorlage document first', () => [file, groupDoc]],
  ])('restores one group, not two, with %s (FR-27.1, ADR-017)', (_label, order) => {
    const orch = newOrch()
    const master = useMasterStore()

    orch.commitPortableRestore(order().map((text) => parsePortable(text).doc!))

    const groups = master.templateList.filter((t) => t.kind === 'group')
    expect(groups.map((g) => g.name)).toEqual(['Makro Fotografie'])
    // The one group is the one the Vorlage points at — a second copy would
    // leave the Vorlage composed of an orphan.
    const vorlage = master.templateList.find((t) => t.kind === 'template')!
    expect(master.includeList.map((i) => [i.template_id, i.included_template_id])).toEqual([
      [vorlage.id, groups[0]!.id],
    ])
  })

  it('links a group document to the group of that name instead of copying it', () => {
    // ADR-017's identity rule is about the group, not about where in the file
    // it appears: importing a group that already exists must not leave a
    // second one behind, and must not rewrite the positions of the first.
    const orch = newOrch()
    const master = useMasterStore()
    const existingId = orch.createTemplate('Makro Fotografie', 'group')
    const itemId = orch.createMasterItem('Stativ', {})
    orch.addTemplateItem(existingId, itemId, {
      quantity: 1,
      assignment: 'trip_global',
      defaultMode: 'pack',
    })

    const result = orch.commitPortableImport(parsePortable(groupDoc).doc!, new Map())

    expect(result.id).toBe(existingId)
    expect(master.templateList.filter((t) => t.kind === 'group')).toHaveLength(1)
    const names = master
      .getTemplateItems(existingId)
      .map((p) => master.getItem(p.item_id)?.name)
      .sort()
    expect(names).toEqual(['Stativ'])
  })

  it('still suffixes a Ferien-Vorlage whose name is taken — only groups link', () => {
    // The identity rule is a group rule (ADR-017): two Ferien-Vorlagen of the
    // same name are two different plans, and silently merging them would lose
    // one of them.
    const orch = newOrch()
    const master = useMasterStore()
    orch.createTemplate('Fototage', 'template')

    orch.commitPortableImport(parsePortable(file).doc!, new Map())

    expect(
      master.templateList.filter((t) => t.kind === 'template').map((t) => t.name).sort(),
    ).toEqual(['Fototage', 'Fototage (import)'])
  })

})
