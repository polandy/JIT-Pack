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
import { describe, it, expect, beforeEach } from 'vitest'

import { PICKER_SEARCH_MIN_GROUPS, matchGroupsInPositions } from '@/domain/templates'
import { MARK_INDEX } from '@/domain/itemMarks'
import { DELETION_REMOVE } from '@/domain/masterDeletion'

import { seedSampleMaster } from '../sampleMaster'
import { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { IndexedDBPersistence } from '@/local/persistence'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { installHarness } from '@/__tests__/harness'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  installHarness()
})

/** Local Mode: the seed must work on a device with no server at all. */
function seed() {
  const orchestrator = useSyncOrchestrator({
    baseUrl: '',
    getToken: () => null,
    local: new IndexedDBPersistence(),
  })
  return { orchestrator, result: seedSampleMaster(orchestrator), master: useMasterStore() }
}

describe('seedSampleMaster (dev)', () => {
  it('creates both scopes, with the Vorlage composed of groups', () => {
    const { result, master } = seed()

    const vacation = master.getTemplate(result.vacationTemplateId)
    expect(vacation?.kind).toBe('template')
    expect(master.getIncludes(result.vacationTemplateId)).toHaveLength(2)
    // Seven from GROUPS plus the FR-24.3 'Wellness' group, whose two
    // retired items give M23 something to show on a fresh device.
    expect(master.templateList.filter((t) => t.kind === 'group')).toHaveLength(8)
  })

  it('adopts what it already wrote when it runs a second time (FR-1.6)', () => {
    // templates.name is UNIQUE instance-wide, so a re-seed on a device that
    // already carries the sample data cannot write these names again. It
    // takes the ids that exist rather than returning nulls into a broken
    // composition — every group the Vorlage names must still resolve.
    const { orchestrator, result, master } = seed()
    const before = master.templateList.length

    const again = seedSampleMaster(orchestrator)

    expect(master.templateList).toHaveLength(before)
    expect(again.vacationTemplateId).toBe(result.vacationTemplateId)
    expect(master.getIncludes(again.vacationTemplateId)).toHaveLength(2)
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
      'Wellness',
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

  it('wires a companion of each mode, so both FR-20 branches are reachable', () => {
    // The seed exists so a feature can be exercised without twenty minutes
    // of typing; the co-skip cascade needs a dependency, and building one by
    // hand is three screens away.
    //
    // The suggested one matters: with every relation required, FR-20.4's
    // "waits for a tap" branch — the M3 wizard's checkbox, M5's offer — is
    // unreachable on a fresh device.
    const { master } = seed()

    const named = master.dependencyList.map((dep) => ({
      item: master.getItem(dep.item_id)?.name,
      dependsOn: master.getItem(dep.depends_on_item_id)?.name,
      mode: dep.mode,
    }))
    expect(named).toEqual([
      { item: 'Ersatzakkus', dependsOn: 'Kamera', mode: 'required' },
      { item: 'Ringlicht', dependsOn: 'Makro-Objektiv', mode: 'required' },
      { item: 'Powerbank', dependsOn: 'Kamera', mode: 'suggested' },
      { item: 'Stirnlampe Petzl', dependsOn: 'Ersatzakkus', mode: 'required' },
    ])
  })

  it('leaves retired items behind, one name taken again and two used by nothing (FR-24.3)', () => {
    const { orchestrator, master } = seed()

    // M23 opens on something rather than on its empty state, and its hard
    // case — a restore whose name an active row holds — is one tap away.
    expect(master.retiredItemList.map((i) => i.name).sort()).toEqual([
      'Duschhaube',
      'Ohrstöpsel',
      'Reisewecker',
      'Sonnenbrille',
      'Wärmflasche',
    ])
    // The two released ones carry a permanent delete; the rest are still used.
    const removable = master.retiredItemList
      .filter((i) => orchestrator.masterItemDeletionOutlook(i.id).kind === DELETION_REMOVE)
      .map((i) => i.name)
      .sort()
    expect(removable).toEqual(['Ohrstöpsel', 'Wärmflasche'])
    expect(master.activeItemList.filter((i) => i.name === 'Sonnenbrille')).toHaveLength(1)
    expect(master.activeItemList.filter((i) => i.name === 'Reisewecker')).toHaveLength(0)
    // The group that kept them alive still holds its four positions: a
    // retire keeps its children (ADR-032), and the visible one is the
    // positive signal that the group itself was not emptied.
    const wellness = master.activeTemplateList.find((t) => t.name === 'Wellness')!
    expect(master.getTemplateItems(wellness.id)).toHaveLength(4)
  })

  it('tags every inventory item but the three left for M24, so M9 groups them', () => {
    const { master } = seed()

    // FR-24.12: three are untagged on purpose (asserted by name below); every
    // other item carries a tag, so the grouped list is not one long bucket.
    const leftForCleanup = new Set(['Zahnseide', 'Reiseadapter', 'Kartenspiel'])
    expect(master.itemList.length).toBeGreaterThan(10)
    for (const item of master.itemList.filter((i) => !leftForCleanup.has(i.name))) {
      expect(master.getItemTags(item.id).length).toBeGreaterThan(0)
    }
  })
})

/**
 * The seed's *report*. A button that seeds and says nothing is
 * indistinguishable from a dead one when anything throws — so the summary is
 * produced here, once, and a failure travels as a rejection rather than as
 * silence.
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
      'Beispieldaten: 30 Artikel, 7 Gruppen, 1 Vorlage, 2 Reisen (1 geplant, mit offener Gruppenfrage)',
    )
  })

  it('seeds a tag that is plainly a duplicate, so FR-24.10’s merge has a case', () => {
    const { master } = seed()

    // „Elektronik" is „Technik" typed a second time — the duplicate every
    // real inventory grows, and the standing rule is that a new master-data
    // feature extends this seed rather than leaving a fresh device twenty
    // minutes of typing away from its own feature.
    const elektronik = master.tagList.find((t) => t.name === 'Elektronik')
    const technik = master.tagList.find((t) => t.name === 'Technik')
    expect(elektronik).toBeDefined()
    expect(technik).toBeDefined()

    const carried = master.itemTagList.filter((a) => a.tag_id === elektronik!.id)
    expect(carried).toHaveLength(2)

    // One of the two carries *both*, behind the source — the merge's hard
    // case: dropping that assignment has to carry the source's position over,
    // or the item lands under a heading neither tag had.
    const both = carried.filter((a) =>
      master.itemTagList.some((o) => o.item_id === a.item_id && o.tag_id === technik!.id),
    )
    expect(both).toHaveLength(1)
    const second = master.itemTagList.find(
      (o) => o.item_id === both[0]!.item_id && o.tag_id === technik!.id,
    )!
    expect(both[0]!.position).toBeLessThan(second.position)
  })

  it('seeds two rows for one thing, so FR-24.15’s merge has a case as well', () => {
    const { master } = seed()

    // The duplicate tag above, one table further in: a head torch entered a
    // second time under its brand. What makes it a fixture rather than just a
    // second row is what each side brings — the merge has to re-point one tag,
    // drop another, take a companion over and move a Vorlage position, and
    // none of it needs anything typed first.
    const petzl = master.activeItemList.find((i) => i.name === 'Stirnlampe Petzl')
    const kept = master.activeItemList.find((i) => i.name === 'Stirnlampe')
    expect(petzl).toBeDefined()
    expect(kept).toBeDefined()

    const tagsOf = (itemId: string): string[] =>
      master.itemTagList
        .filter((a) => a.item_id === itemId)
        .sort((a, b) => a.position - b.position)
        .map((a) => master.tagList.find((t) => t.id === a.tag_id)!.name)
    // „Technik" is new to the survivor and is re-pointed; „Camping" it already
    // carries, so that assignment is dropped — the two halves of the tag rule,
    // on one pair.
    expect(tagsOf(petzl!.id)).toEqual(['Technik', 'Camping'])
    expect(tagsOf(kept!.id)).toEqual(['Camping'])

    expect(master.dependencyList.some((d) => d.item_id === petzl!.id)).toBe(true)

    // A Vorlage the survivor is *not* in, so the position moves rather than
    // collapsing — and, the reason it is seeded at all, that reference is what
    // makes FR-24.3 retire the losing row instead of removing it. Without it
    // M23 could never be asked whether it names the survivor.
    const positions = master.positionList.filter((p) => p.item_id === petzl!.id)
    expect(positions).toHaveLength(1)
    const wandern = master.templateList.find((t) => t.name === 'Wandern')!
    expect(positions[0]!.template_id).toBe(wandern.id)
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
    // Offered, not applied — otherwise the seed would skip the question it
    // exists to show.
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

describe('sample master data, FR-28.1/28.8', () => {
  it('marks some rows and leaves others bare, so the FR-28.4 ladder has a mixed column', () => {
    const { master } = seed()

    const marked = master.itemList.filter((item) => item.icon)
    expect(marked.length).toBeGreaterThan(0)
    // The point of the seed is the *mixture*: a column where every row carries
    // a mark hides the fallback the ladder exists for.
    expect(marked.length).toBeLessThan(master.itemList.length)

    const groups = master.templateList.filter((tpl) => tpl.kind === 'group')
    expect(groups.some((tpl) => tpl.icon)).toBe(true)
    expect(groups.some((tpl) => !tpl.icon)).toBe(true)
  })

  it('seeds only marks the curated index knows — the self-hosted face has no other glyphs (FR-28.6)', () => {
    const { master } = seed()
    const known = new Set(MARK_INDEX.map((entry) => entry.emoji))

    // FR-7.8's task tags are marked like anything else and are read from the
    // same face, so they belong in the same count. The inventory's tags are
    // deliberately *not* here: one of them carries a glyph outside the index
    // today, which is a defect of its own rather than something this case
    // should be widened around.
    const seeded = [...master.itemList, ...master.templateList, ...master.taskTagList]
      .map((row) => row.icon)
      .filter((icon): icon is string => Boolean(icon))

    expect(seeded.filter((icon) => !known.has(icon))).toEqual([])
  })
})

describe('seedSampleMaster — something for M24 to find (FR-24.12, FR-24.13)', () => {
  it('gives some tags a mark and leaves at least one without', () => {
    const { master } = seed()

    const marked = master.tagList.filter((tag) => tag.icon)
    expect(marked.length).toBeGreaterThan(0)
    expect(marked.length).toBeLessThan(master.tagList.length)
  })

  it('leaves items untagged — one with a name neighbour, one in a group, one with no reason', () => {
    const { master } = seed()

    const tagged = new Set(master.itemTagList.map((a) => a.item_id))
    const untagged = master.activeItemList.filter((i) => !tagged.has(i.id)).map((i) => i.name)
    expect(untagged.sort()).toEqual(['Kartenspiel', 'Reiseadapter', 'Zahnseide'])
  })

  it('carries a tag exactly one item holds, for the single-tag rule', () => {
    const { master } = seed()

    const foto = master.tagList.find((tag) => tag.name === 'Fotografie')!
    expect(master.itemTagList.filter((a) => a.tag_id === foto.id)).toHaveLength(1)
  })
})

describe('sample trip, FR-28.7', () => {
  // Through `seedSampleData`, not `seedSampleTrip`: the wiring that hands the
  // trip the inventory it may link against lives there, and that is the line
  // the seed button actually runs.
  it('links its rows to the inventory, so a seeded device can see a mark at all', async () => {
    const { seedSampleData } = await import('../sampleData')
    const orchestrator = useSyncOrchestrator({
      baseUrl: '',
      getToken: () => null,
      local: new IndexedDBPersistence(),
    })
    const master = useMasterStore()
    const tripStore = useTripStore()

    const { tripId } = await seedSampleData(orchestrator)

    const rows = tripStore.getItems(tripId)
    const linked = rows.filter((row) => row.source_item_id !== null)
    // Not "all of them": the sample trip carries rows the inventory has no
    // item for (a kitchen crate's contents), and those stay ad-hoc on
    // purpose — that mixture is what FR-28.7's empty slot is for.
    expect(linked.length).toBeGreaterThan(0)
    expect(linked.some((row) => master.getItem(row.source_item_id!)?.icon)).toBe(true)
  })
})
