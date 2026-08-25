/**
 * A taken template or series name never becomes a mutation (FR-1.6/FR-13.1).
 *
 * `templates.name` and `trip_series.name` are UNIQUE instance-wide, so a
 * create against a taken name is a push the server refuses; since the
 * rejection repair removes the phantom row, the user would watch what they
 * just made disappear. The orchestrator is the floor under every surface —
 * including Local Mode, which has no constraint at all and would otherwise
 * keep two rows nothing can tell apart.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useSyncOrchestrator } from '../useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import type { PushResponse } from '@/api/types'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.indexedDB = new IDBFactory()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'WebSocket',
    vi.fn(() => ({ send: vi.fn(), close: vi.fn(), readyState: 1 })),
  )
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

function mockDrain() {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ results: [], pull_hint: { next_cursor: 1 } } satisfies PushResponse),
      { status: 200 },
    ),
  )
}

function newOrch() {
  return useSyncOrchestrator({ baseUrl: 'http://localhost', getToken: () => null })
}

function seedTemplate(id: string, name: string, kind = 'template') {
  useMasterStore().applyChange({
    seq: 0,
    table: 'templates',
    id,
    deleted: false,
    row: { name, kind },
  })
}

describe('template names are instance-wide (FR-1.6)', () => {
  it('refuses a create whose name is taken, and enqueues nothing', async () => {
    const orch = newOrch()
    mockDrain()
    seedTemplate('t1', 'Ferien')

    expect(orch.createTemplate('Ferien', 'template')).toBeNull()
    expect(useMasterStore().templateList).toHaveLength(1)
    // Positive signal beside the refusal: a free name does reach the wire.
    expect(orch.createTemplate('Winter', 'template')).not.toBeNull()
    expect(useMasterStore().templateList).toHaveLength(2)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const bodies = fetchMock.mock.calls.map((c) => String((c[1] as RequestInit).body))
    expect(bodies.join()).toContain('Winter')
    expect(bodies.join()).not.toContain('Ferien')
  })

  it('refuses a create that differs only in case', () => {
    const orch = newOrch()
    mockDrain()
    seedTemplate('t1', 'Ferien')
    expect(orch.createTemplate('ferien', 'template')).toBeNull()
  })

  it('reports the collision across scopes, so a Gruppe blocks a Vorlage', () => {
    const orch = newOrch()
    seedTemplate('g1', 'Kamera', 'group')
    const hit = orch.templateNameCollision('Kamera')
    expect(hit?.id).toBe('g1')
    expect(hit?.kind).toBe('group')
    expect(orch.createTemplate('Kamera', 'template')).toBeNull()
  })

  it('refuses a rename onto a taken name but allows the row its own name', () => {
    const orch = newOrch()
    mockDrain()
    seedTemplate('t1', 'Ferien')
    seedTemplate('t2', 'Kamera', 'group')
    const master = useMasterStore()

    expect(orch.updateTemplate(master.getTemplate('t2')!, { name: 'Ferien' })).toBe(false)
    expect(master.getTemplate('t2')!.name).toBe('Kamera')
    // Positive signal: the same call with a free name does land.
    expect(orch.updateTemplate(master.getTemplate('t2')!, { name: 'Kameras' })).toBe(true)
    expect(master.getTemplate('t2')!.name).toBe('Kameras')
    // And a no-op rename to its own spelling is not a collision with itself.
    expect(orch.updateTemplate(master.getTemplate('t2')!, { name: 'Kameras' })).toBe(true)
  })

  it('leaves an edit that is not a rename alone (FR-28.8 mark)', () => {
    const orch = newOrch()
    mockDrain()
    seedTemplate('t1', 'Ferien')
    const master = useMasterStore()
    expect(orch.updateTemplate(master.getTemplate('t1')!, { icon: '⛺' })).toBe(true)
    expect(master.getTemplate('t1')!.icon).toBe('⛺')
  })
})

describe('series names are instance-wide (FR-13.1)', () => {
  function seedSeries(id: string, name: string) {
    useMasterStore().applyChange({
      seq: 0,
      table: 'trip_series',
      id,
      deleted: false,
      row: { name, owner_id: '' },
    })
  }

  it('refuses a create whose name is taken, and keeps the free one', () => {
    const orch = newOrch()
    mockDrain()
    seedSeries('s1', 'Engadin')
    expect(orch.createSeries('engadin')).toBeNull()
    expect(useMasterStore().seriesList).toHaveLength(1)
    expect(orch.createSeries('Ferien')).not.toBeNull()
    expect(useMasterStore().seriesList).toHaveLength(2)
  })

  it('refuses a rename onto a taken name', () => {
    const orch = newOrch()
    mockDrain()
    seedSeries('s1', 'Engadin')
    seedSeries('s2', 'Elba')
    const master = useMasterStore()
    expect(orch.updateSeries(master.getSeries('s2')!, { name: 'Engadin' })).toBe(false)
    expect(master.getSeries('s2')!.name).toBe('Elba')
    expect(orch.updateSeries(master.getSeries('s2')!, { name: 'Elba 2' })).toBe(true)
  })
})

describe('Local Mode has no constraint, so the client is the only guard', () => {
  it('never writes a second template of the same name', async () => {
    const persistence = new IndexedDBPersistence()
    const orch = useSyncOrchestrator({ baseUrl: '', getToken: () => null, local: persistence })
    const first = orch.createTemplate('Ferien', 'template')
    expect(first).not.toBeNull()
    expect(orch.createTemplate('Ferien', 'group')).toBeNull()

    await vi.waitFor(async () => {
      const rows = await persistence.load()
      expect(rows.filter((r) => r.table === 'templates')).toHaveLength(1)
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
