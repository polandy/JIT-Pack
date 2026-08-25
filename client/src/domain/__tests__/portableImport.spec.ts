import { describe, it, expect } from 'vitest'

import { importPortableBackup, importPortableDocument } from '@/domain/portableImport'
import type { PortableImportEnv } from '@/domain/portableImport'
import { parsePortable } from '@/domain/portable'
import type { PortableDocument } from '@/domain/portable'
import { useMutations } from '@/composables/useMutations'
import { HLCGenerator } from '@/sync/hlc'
import { TABLE } from '@/types/tables'
import type { Mutation } from '@/api/types'
import type { MasterItem, Tag, Template, Trip } from '@/types/domain'

/**
 * These cases exist for one property the app's own suite cannot show: the
 * import rules run with **no Pinia and no Vue** — no store, no composable,
 * no DOM. That is what lets the command line import a file through exactly
 * the code M18 uses (ADR-008), so this spec deliberately declares no jsdom
 * environment and builds its world by hand.
 */

interface Recorded {
  partition: 'master' | 'trip'
  tripId: string | null
  table: string
  id: string
  mutation: Mutation
}

/**
 * A world made of three arrays. `emit` applies the write into them before it
 * returns, which is the contract the rules rely on when they read their own
 * output back.
 */
function fakeEnv(
  seed: Partial<{ items: MasterItem[]; tags: Tag[]; templates: Template[]; trips: Trip[] }> = {},
) {
  const items = [...(seed.items ?? [])]
  const tags = [...(seed.tags ?? [])]
  const templates = [...(seed.templates ?? [])]
  const trips = [...(seed.trips ?? [])]
  const recorded: Recorded[] = []

  const env: PortableImportEnv = {
    master: { itemList: items, tagList: tags, templateList: templates, tripList: trips },
    mutations: useMutations(new HLCGenerator(() => 1_700_000_000_000, 'aabbccdd')),
    emit(partition, tripId, table, id, mutation) {
      recorded.push({ partition, tripId, table, id, mutation })
      const row = (mutation.fields ?? {}) as Record<string, unknown>
      if (table === TABLE.items) {
        items.push({ id, name: row['name'] as string } as MasterItem)
      } else if (table === TABLE.tags) {
        tags.push({ id, name: row['name'] as string, sort_order: 0 })
      } else if (table === TABLE.templates) {
        templates.push({ id, name: row['name'] as string, kind: row['kind'] } as Template)
      } else if (table === TABLE.trips) {
        trips.push({ id, name: row['name'] as string, year: row['year'] as number } as Trip)
      }
    },
  }
  return { env, recorded, items, tags, templates, trips }
}

function parse(text: string): PortableDocument {
  const result = parsePortable(text)
  if (!result.doc) throw new Error(result.error ?? 'unparsable fixture')
  return result.doc
}

const rowsFor = (recorded: Recorded[], table: string) =>
  recorded
    .filter((r) => r.table === table)
    .map((r) => (r.mutation.fields ?? {}) as Record<string, unknown>)

describe('the portable import rules, with no Vue and no Pinia', () => {
  it('runs without a DOM at all', () => {
    expect(typeof globalThis.window).toBe('undefined')
    expect(typeof globalThis.document).toBe('undefined')
  })

  it('creates a Ferien-Vorlage with its positions and the items they need', () => {
    const { env, recorded } = fakeEnv()
    const doc = parse(`kind: template
name: Ferien
items:
  - name: Socken
    quantity: 3
`)

    const result = importPortableDocument(doc, new Map(), env)

    expect(result.kind).toBe('template')
    expect(rowsFor(recorded, TABLE.templates)).toEqual([
      expect.objectContaining({ name: 'Ferien', kind: 'template' }),
    ])
    expect(rowsFor(recorded, TABLE.items)).toEqual([expect.objectContaining({ name: 'Socken' })])
    expect(rowsFor(recorded, TABLE.templateItems)).toEqual([
      expect.objectContaining({ quantity: 3 }),
    ])
    // Everything a template brings belongs to the master partition.
    expect(new Set(recorded.map((r) => r.partition))).toEqual(new Set(['master']))
  })

  it('links a group of that name instead of leaving a second copy (ADR-017)', () => {
    const { env, recorded } = fakeEnv({
      templates: [{ id: 'grp-existing', name: 'Schuhe', kind: 'group' } as Template],
    })
    const doc = parse(`kind: template
scope: group
name: Schuhe
items:
  - name: Wanderschuhe
    quantity: 1
`)

    const result = importPortableDocument(doc, new Map(), env)

    expect(result.id).toBe('grp-existing')
    // Linked, not rewritten: no template row and no position was written.
    expect(rowsFor(recorded, TABLE.templates)).toEqual([])
    expect(rowsFor(recorded, TABLE.templateItems)).toEqual([])
  })

  it('creates a trip, and files an inventory-backed row under its tags in order', () => {
    const { env, recorded } = fakeEnv()
    const doc = parse(`kind: trip
name: Cannobio
year: 2024
status: archived
travelers:
  - name: Andy
items:
  - name: Zelt
    quantity: 1
    from_inventory: true
    tags: ["Camping", "Diverses"]
`)

    const result = importPortableDocument(doc, new Map(), env)

    expect(result.kind).toBe('trip')
    expect(rowsFor(recorded, TABLE.trips)).toEqual([
      expect.objectContaining({ name: 'Cannobio', year: 2024, status: 'archived' }),
    ])
    // FR-24.1/24.2: the list's order is item_tags.position, primary first.
    expect(rowsFor(recorded, TABLE.itemTags).map((r) => r['position'])).toEqual([0, 1])
    expect(rowsFor(recorded, TABLE.tags).map((r) => r['name'])).toEqual(['Camping', 'Diverses'])
    // The trip's own rows go to the trip partition, named by trip id.
    const tripRows = recorded.filter((r) => r.partition === 'trip')
    expect(tripRows.length).toBeGreaterThan(0)
    expect(new Set(tripRows.map((r) => r.tripId))).toEqual(new Set([result.id]))
  })

  it('matches a later document against the items an earlier one just created', () => {
    const { env, recorded } = fakeEnv()
    const template = parse(`kind: template
name: Ferien
items:
  - name: Zelt
    quantity: 1
`)
    const trip = parse(`kind: trip
name: Cannobio
year: 2024
items:
  - name: Zelt
    quantity: 1
    from_inventory: true
`)

    const results = importPortableBackup([template, trip], env)

    expect(results.map((r) => r.kind)).toEqual(['template', 'trip'])
    // One master item for both mentions — the reason matching runs per
    // document rather than once up front (NFR-4.11).
    expect(rowsFor(recorded, TABLE.items)).toHaveLength(1)
    const itemId = recorded.find((r) => r.table === TABLE.items)!.id
    expect(rowsFor(recorded, TABLE.tripItems)).toEqual([
      expect.objectContaining({ source_item_id: itemId }),
    ])
  })
})

/**
 * ADR-030: a trip's identity across files and devices is its year and its
 * name, and an import that finds one already there adds nothing.
 */
describe('a Ferien-Vorlage that is already on this instance (FR-18.4, ADR-030)', () => {
  const ferien = (name = 'Ferien') =>
    parse(`kind: template
name: ${JSON.stringify(name)}
items:
  - name: Zelt
    quantity: 1
`)

  it('is left alone rather than landing beside itself under a suffix', () => {
    const { env, recorded } = fakeEnv({
      templates: [{ id: 'tpl-existing', name: 'Ferien', kind: 'template' } as Template],
    })

    const result = importPortableDocument(ferien(), new Map(), env)

    expect(result).toEqual({ kind: 'template', id: 'tpl-existing', outcome: 'duplicate' })
    // The suffix this replaces wrote a whole second Vorlage: template row,
    // positions, and a master item for every one of them.
    expect(recorded).toEqual([])
  })

  it('is not confused with a group of the same name', () => {
    const { env, recorded } = fakeEnv({
      templates: [{ id: 'grp-existing', name: 'Ferien', kind: 'group' } as Template],
    })

    const result = importPortableDocument(ferien(), new Map(), env)

    expect(result.outcome).toBe('created')
    expect(rowsFor(recorded, TABLE.templates)).toEqual([
      expect.objectContaining({ name: 'Ferien', kind: 'template' }),
    ])
  })

  it('links a group that is already here instead of copying its positions', () => {
    const { env, recorded } = fakeEnv({
      templates: [{ id: 'grp-existing', name: 'Küche', kind: 'group' } as Template],
    })
    const group = parse(`kind: template
scope: group
name: küche
items:
  - name: Pfanne
    quantity: 1
`)

    const result = importPortableDocument(group, new Map(), env)

    // Spelled differently in the two files, and still one group.
    expect(result).toEqual({ kind: 'template', id: 'grp-existing', outcome: 'duplicate' })
    expect(recorded).toEqual([])
  })
})

describe('a trip that is already on this instance (FR-18.4, ADR-030)', () => {
  const cannobio = (year: number, name = 'Cannobio') =>
    parse(`kind: trip
name: ${JSON.stringify(name)}
year: ${year}
items:
  - name: Zelt
    quantity: 1
    from_inventory: true
`)

  it('is left alone, and says so, when year and name both match', () => {
    const { env, recorded } = fakeEnv({
      trips: [{ id: 'trip-existing', name: 'Cannobio', year: 2024 } as Trip],
    })

    const result = importPortableDocument(cannobio(2024), new Map(), env)

    expect(result).toEqual({ kind: 'trip', id: 'trip-existing', outcome: 'duplicate' })
    // Nothing at all was written — not the trip, not its rows, not the
    // master item the rows would have needed.
    expect(recorded).toEqual([])
  })

  it('is a different trip in a different year', () => {
    const { env, recorded } = fakeEnv({
      trips: [{ id: 'trip-existing', name: 'Cannobio', year: 2024 } as Trip],
    })

    const result = importPortableDocument(cannobio(2025), new Map(), env)

    expect(result.outcome).toBe('created')
    expect(rowsFor(recorded, TABLE.trips)).toEqual([
      expect.objectContaining({ name: 'Cannobio', year: 2025 }),
    ])
  })

  it('is the same trip however the two files spell its name', () => {
    const { env, recorded } = fakeEnv({
      trips: [{ id: 'trip-existing', name: 'Cannobio', year: 2024 } as Trip],
    })

    const result = importPortableDocument(cannobio(2024, '  cannobio '), new Map(), env)

    expect(result.outcome).toBe('duplicate')
    expect(rowsFor(recorded, TABLE.trips)).toEqual([])
  })

  it('leaves a same-named trip of another year untouched', () => {
    const { env } = fakeEnv({
      trips: [{ id: 'trip-2024', name: 'Cannobio', year: 2024 } as Trip],
    })

    const result = importPortableDocument(cannobio(2025), new Map(), env)

    expect(result.id).not.toBe('trip-2024')
  })

  it('catches the second of two identical trips inside one file', () => {
    const { env, recorded } = fakeEnv()

    const results = importPortableBackup([cannobio(2024), cannobio(2024)], env)

    expect(results.map((r) => r.outcome)).toEqual(['created', 'duplicate'])
    expect(rowsFor(recorded, TABLE.trips)).toHaveLength(1)
    // Both results name the one trip, so a caller can still open it.
    expect(results[0]!.id).toBe(results[1]!.id)
  })

  it('reports a created document as created', () => {
    const { env } = fakeEnv()

    const results = importPortableBackup([parse('kind: template\nname: Ferien\nitems: []\n')], env)

    expect(results.map((r) => r.outcome)).toEqual(['created'])
  })
})
