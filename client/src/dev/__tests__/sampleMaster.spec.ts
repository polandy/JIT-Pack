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

import { PICKER_SEARCH_MIN_GROUPS, matchGroupsInPositions } from '@/domain/templates'

import { seedSampleMaster } from '../sampleMaster'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

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
    expect(master.templateList.filter((t) => t.kind === 'group')).toHaveLength(7)
  })

  it('leaves groups unincluded, so M8s picker and M3s section have offers — enough of them that the FR-27.13 search appears', () => {
    const { result, master } = seed()

    const included = new Set(
      master.getIncludes(result.vacationTemplateId).map((i) => i.included_template_id),
    )
    const free = master.templateList.filter((t) => t.kind === 'group' && !included.has(t.id))
    expect(free.map((t) => t.name)).toEqual([
      'Camping Basis',
      'Strand',
      'Wandern',
      'Erste Hilfe',
      'Strom & Laden',
    ])
    // The picker's search field is gated on more than PICKER_SEARCH_MIN_GROUPS
    // searchable groups; the seed must clear that bar on a fresh device.
    const searchable = master.templateList.filter((t) => t.kind === 'group')
    expect(searchable.length).toBeGreaterThan(PICKER_SEARCH_MIN_GROUPS)
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
    // 6 deduped from two groups (camera shared) + 4 of its own.
    expect(own).toBe(4)
    expect(resolution.positions).toHaveLength(10)
  })

  it('hangs an FR-27.7 preparation task off a position', () => {
    const { master } = seed()

    expect(master.templateItemTaskList.map((t) => t.task)).toContain('Akkus laden')
  })

  it('wires two required companions, so the FR-20.2 cascade is reachable on a fresh device', () => {
    // The seed exists so a feature can be exercised without twenty minutes
    // of typing; the co-skip cascade needs a dependency, and building one by
    // hand is three screens away.
    const { master } = seed()

    const named = master.dependencyList.map((dep) => ({
      item: master.getItem(dep.item_id)?.name,
      dependsOn: master.getItem(dep.depends_on_item_id)?.name,
      mode: dep.mode,
    }))
    expect(named).toEqual([
      { item: 'Ersatzakkus', dependsOn: 'Kamera', mode: 'required' },
      { item: 'Ringlicht', dependsOn: 'Makro-Objektiv', mode: 'required' },
    ])
  })

  it('tags every inventory item, so M9 groups them', () => {
    const { master } = seed()

    expect(master.itemList.length).toBeGreaterThan(10)
    for (const item of master.itemList) {
      expect(master.getItemTags(item.id).length).toBeGreaterThan(0)
    }
  })
})

/**
 * The seed's *report*. A button that seeds and says nothing is
 * indistinguishable from a dead one when anything throws, which cost the owner
 * a session on 2026-08-16 — so the summary is produced here, once, and a
 * failure travels as a rejection rather than as silence.
 */
describe('seedSampleData (dev)', () => {
  it('summarises what it created, so the caller can report it', async () => {
    const { seedSampleData } = await import('../sampleData')
    const orchestrator = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })

    const outcome = await seedSampleData(orchestrator)

    expect(outcome.tripId).toBeTruthy()
    // Two trips since FR-27.4: the sample trip is imported and therefore
    // follows nothing, so a generated one is what makes the refresh visible.
    expect(outcome.summary).toBe(
      'Beispieldaten: 21 Artikel, 7 Gruppen, 1 Vorlage, 2 Reisen (1 geplant, mit offener Gruppenfrage)',
    )
  })

  it('seeds a *planned* trip that follows the sample Vorlage (FR-27.4)', async () => {
    const { seedSampleData } = await import('../sampleData')
    const orchestrator = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })

    // Connected first, because the FR-27.4 refresh refuses to run before the
    // device has hydrated — in the app the seed button is pressed long after
    // startup, and here that has to be stated rather than assumed.
    await orchestrator.connect()
    await seedSampleData(orchestrator)

    // The sample trip is imported, so it follows no group at all; without a
    // second, generated one the refresh cannot be looked at — which is what
    // the standing seed rule is for.
    const trips = useTripStore()
    const planned = trips.tripList.filter((t) => t.status === 'planning')
    expect(planned).toHaveLength(1)
    // Registered, not just created: a planned trip that follows nothing never
    // moves, and the seed would demonstrate an empty mechanism.
    expect(trips.getTemplateSources(planned[0]!.id)).toHaveLength(1)
    // And it actually filled itself on the first refresh.
    expect(trips.getItems(planned[0]!.id).length).toBeGreaterThan(0)

    // It also arrives with an *open* question on it: a group gained a position
    // after the trip took its content over, so M4's proposal card is reachable
    // from a fresh install without editing a group by hand first.
    const proposal = orchestrator.refreshProposals.value[planned[0]!.id]
    expect(proposal?.add.map((a) => a.generated.name)).toEqual(['Stirnlampe'])
    // Offered, not applied — otherwise the seed would demonstrate the old model.
    expect(trips.getItems(planned[0]!.id).some((i) => i.name === 'Stirnlampe')).toBe(false)
  })

  it('rejects rather than resolving quietly when a seed step fails', async () => {
    const { seedSampleData } = await import('../sampleData')
    const broken = {
      createTag: () => {
        throw new Error('boom')
      },
    } as unknown as Parameters<typeof seedSampleData>[0]

    await expect(seedSampleData(broken)).rejects.toThrow('boom')
  })
})

describe('sample master data, FR-27.15', () => {
  it('leaves a whole group loose in the Vorlage, so the fold hint has something to find', () => {
    const { result, master } = seed()

    const own = master.getTemplateItems(result.vacationTemplateId)
    const firstAid = master.templateList.find((tpl) => tpl.name === 'Erste Hilfe')!
    const candidates = master.templateList
      .filter((tpl) => tpl.kind === 'group')
      .map((tpl) => ({
        id: tpl.id,
        name: tpl.name,
        positions: master.resolve(tpl.id).positions,
        included: false,
      }))

    expect(matchGroupsInPositions(own, candidates).map((m) => m.templateId)).toEqual([firstAid.id])
  })
})
