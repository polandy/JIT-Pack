import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

/**
 * A ready-made master partition to test against — inventory, tags, groups and
 * a composed Ferien-Vorlage. Development only, beside `sampleTrip.ts`.
 *
 * **Not Demo Mode**, for the same reason stated there: this lives behind
 * `import.meta.env.DEV` **at the import**, not only on the button, so the
 * module is pruned from a production build entirely — `scripts/dev-code-gate.mjs`
 * holds that. What remains there is the trigger's inert render branch, a few
 * bytes of dead string; nobody running an instance can reach any of it. Demo Mode was
 * a product surface and stays removed (Addendum v2.10).
 *
 * Why it exists: a fresh install has *no* inventory and *no* templates, so
 * every §3.27 surface — M7's scopes, M8's composition, M3 step 3's two
 * sections, the FR-27.12 peek — opens empty, and testing any of them starts
 * with twenty minutes of typing. `sampleTrip.ts` seeded a trip and left that
 * gap: a trip carries its own rows and teaches the master partition nothing.
 *
 * It writes through the orchestrator's **own actions**, not through a
 * seeding path of its own — the same reasoning that puts the sample trip on
 * the M18 import path. Every row it creates is one a user could have created.
 *
 * The data is chosen to exercise what is otherwise tedious to reach:
 * - two groups that **share an item** (the camera), so M3's footer has a real
 *   FR-27.2 merge to name and the M8 resolution footer has one to show;
 * - a Ferien-Vorlage that **owns one position beside its two groups**, so the
 *   resolved count differs from both the group count and the own count;
 * - an FR-27.7 preparation task on a shared position, so a generated trip
 *   starts with a real prep todo;
 * - a third, unincluded group, so M8's picker and M3's *Zusätzliche Gruppen*
 *   both have something to offer;
 * - per-person and buy-before positions, so a generated trip fans out and the
 *   shopping list is not empty.
 */
type Orchestrator = ReturnType<typeof useSyncOrchestrator>

/** What the seed produced, for a caller that wants to navigate to it. */
export interface SampleMaster {
  vacationTemplateId: string
  groupIds: string[]
  /** What the caller reports back to whoever pressed the button. */
  itemCount: number
}

interface ItemSeed {
  name: string
  tag: string
  weightGrams?: number
}

/** The inventory, with the tag that groups it in M9 (ADR-014 primary tag). */
const INVENTORY: ItemSeed[] = [
  { name: 'Kamera', tag: 'Technik', weightGrams: 780 },
  { name: 'Makro-Objektiv', tag: 'Technik', weightGrams: 420 },
  { name: 'Teleobjektiv', tag: 'Technik', weightGrams: 1350 },
  { name: 'Ringlicht', tag: 'Technik', weightGrams: 190 },
  { name: 'Stativ', tag: 'Technik', weightGrams: 1600 },
  { name: 'Ersatzakkus', tag: 'Technik', weightGrams: 160 },
  { name: 'Zelt', tag: 'Camping', weightGrams: 2400 },
  { name: 'Schlafsack', tag: 'Camping', weightGrams: 900 },
  { name: 'Isomatte', tag: 'Camping', weightGrams: 480 },
  { name: 'Stirnlampe', tag: 'Camping', weightGrams: 95 },
  { name: 'Gaskocher', tag: 'Camping', weightGrams: 320 },
  { name: 'Regenjacke', tag: 'Kleidung', weightGrams: 340 },
  { name: 'Wandersocken', tag: 'Kleidung', weightGrams: 70 },
  { name: 'Reiseapotheke', tag: 'Bad', weightGrams: 280 },
  { name: 'Sonnencreme', tag: 'Bad', weightGrams: 150 },
]

interface PositionSeed {
  item: string
  quantity?: number
  perPerson?: boolean
  buyBefore?: boolean
  /** FR-27.7: becomes a prep todo on every row generated from this position. */
  task?: string
}

interface GroupSeed {
  name: string
  positions: PositionSeed[]
}

const GROUPS: GroupSeed[] = [
  {
    name: 'Makro Fotografie',
    positions: [
      { item: 'Kamera', task: 'Akkus laden' },
      { item: 'Makro-Objektiv' },
      { item: 'Ringlicht' },
      { item: 'Ersatzakkus', quantity: 2 },
    ],
  },
  {
    // Shares the camera with Makro — the merge M3 and M8 report by name.
    name: 'Wildlife Fotografie',
    positions: [{ item: 'Kamera' }, { item: 'Teleobjektiv' }, { item: 'Stativ' }],
  },
  {
    // Deliberately not included anywhere: M8's picker and M3's *Zusätzliche
    // Gruppen* need a group that is still on offer.
    name: 'Camping Basis',
    positions: [
      { item: 'Zelt' },
      { item: 'Schlafsack', perPerson: true },
      { item: 'Isomatte', perPerson: true },
      { item: 'Stirnlampe', perPerson: true },
      { item: 'Gaskocher', task: 'Kartusche prüfen' },
    ],
  },
]

/** The composed Vorlage: two groups plus one position of its own. */
const VACATION = {
  name: 'Fotoreise (Beispiel)',
  includes: ['Makro Fotografie', 'Wildlife Fotografie'],
  positions: [
    { item: 'Reiseapotheke' },
    { item: 'Regenjacke', perPerson: true },
    { item: 'Sonnencreme', buyBefore: true },
  ] satisfies PositionSeed[],
}

function addPositions(
  orchestrator: Orchestrator,
  templateId: string,
  itemIds: Map<string, string>,
  positions: PositionSeed[],
): void {
  for (const pos of positions) {
    const itemId = itemIds.get(pos.item)
    if (!itemId) continue
    const positionId = orchestrator.addTemplateItem(templateId, itemId, {
      quantity: pos.quantity ?? 1,
      assignment: pos.perPerson ? 'per_person' : 'trip_global',
      defaultMode: pos.buyBefore ? 'buy_before' : 'pack',
    })
    if (pos.task) orchestrator.addTemplateItemTask(positionId, pos.task)
  }
}

/**
 * Seeds inventory, tags, groups and the composed Vorlage, and returns what it
 * created. Safe to call once per fresh device; it does not check for existing
 * rows, because a dev seed run twice is a dev's problem and a duplicate check
 * here would be logic nobody tests.
 */
export function seedSampleMaster(orchestrator: Orchestrator): SampleMaster {
  const tagIds = new Map<string, string>()
  for (const tag of new Set(INVENTORY.map((i) => i.tag))) {
    tagIds.set(tag, orchestrator.createTag(tag))
  }

  const itemIds = new Map<string, string>()
  for (const item of INVENTORY) {
    const id = orchestrator.createMasterItem(item.name, { weightGrams: item.weightGrams ?? null })
    itemIds.set(item.name, id)
    const tagId = tagIds.get(item.tag)
    if (tagId) orchestrator.assignTag(id, tagId)
  }

  const groupIds = new Map<string, string>()
  for (const group of GROUPS) {
    const id = orchestrator.createTemplate(group.name, 'group')
    groupIds.set(group.name, id)
    addPositions(orchestrator, id, itemIds, group.positions)
  }

  const vacationTemplateId = orchestrator.createTemplate(VACATION.name, 'template')
  for (const name of VACATION.includes) {
    const groupId = groupIds.get(name)
    if (groupId) orchestrator.addTemplateInclude(vacationTemplateId, groupId)
  }
  addPositions(orchestrator, vacationTemplateId, itemIds, VACATION.positions)

  return { vacationTemplateId, groupIds: [...groupIds.values()], itemCount: itemIds.size }
}
