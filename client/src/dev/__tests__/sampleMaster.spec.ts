/**
 * The dev seed is dev-only code, but it is the thing every manual test of
 * §3.27 starts from — and a seed that silently stops producing a resolvable
 * composition wastes the session that discovers it. These cases pin the
 * properties the data exists for, not its contents: the merge, the own
 * positions beside the groups, the preparation task, and the group that is
 * deliberately left on offer.
 */
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { seedSampleMaster } from '../sampleMaster'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'

beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.indexedDB = new IDBFactory()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('WebSocket', vi.fn())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
})

/** Local Mode: the seed must work on a device with no server at all. */
function seed() {
  const orchestrator = useSyncOrchestrator({
    baseUrl: '',
    getToken: () => null,
    local: new IndexedDBPersistence(),
  })
  return { result: seedSampleMaster(orchestrator), master: useMasterStore() }
}

describe('seedSampleMaster (dev)', () => {
  it('creates both scopes, with the Vorlage composed of groups', () => {
    const { result, master } = seed()

    const vacation = master.getTemplate(result.vacationTemplateId)
    expect(vacation?.kind).toBe('template')
    expect(master.getIncludes(result.vacationTemplateId)).toHaveLength(2)
    expect(master.templateList.filter((t) => t.kind === 'group')).toHaveLength(3)
  })

  it('leaves one group unincluded, so M8s picker and M3s section have an offer', () => {
    const { result, master } = seed()

    const included = new Set(
      master.getIncludes(result.vacationTemplateId).map((i) => i.included_template_id),
    )
    const free = master.templateList.filter((t) => t.kind === 'group' && !included.has(t.id))
    expect(free.map((t) => t.name)).toEqual(['Camping Basis'])
  })

  it('gives the composition a real FR-27.2 merge to report', () => {
    const { result, master } = seed()

    const resolution = master.resolve(result.vacationTemplateId)
    expect(resolution.merges).toHaveLength(1)
    // The camera is in both photo groups and must arrive once.
    const merged = resolution.merges[0]!
    expect(master.getItem(merged.item_id)?.name).toBe('Kamera')
    expect(merged.sources.map((s) => s.name)).toEqual(['Makro Fotografie', 'Wildlife Fotografie'])
  })

  it('resolves to more than either half — own positions beside the groups', () => {
    const { result, master } = seed()

    const resolution = master.resolve(result.vacationTemplateId)
    const own = master.getTemplateItems(result.vacationTemplateId).length
    // 6 deduped from two groups (camera shared) + 3 of its own.
    expect(own).toBe(3)
    expect(resolution.positions).toHaveLength(9)
  })

  it('hangs an FR-27.7 preparation task off a position', () => {
    const { master } = seed()

    expect(master.templateItemTaskList.map((t) => t.task)).toContain('Akkus laden')
  })

  it('tags every inventory item, so M9 groups them', () => {
    const { master } = seed()

    expect(master.itemList.length).toBeGreaterThan(10)
    for (const item of master.itemList) {
      expect(master.getItemTags(item.id).length).toBeGreaterThan(0)
    }
  })
})
