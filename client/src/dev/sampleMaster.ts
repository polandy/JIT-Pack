import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import type { TemplateKind } from '@/types/domain'

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
  /** Group name → id, by name so a caller can pick a *particular* group. */
  groups: Record<string, string>
  /** Master item name → id, same reason. */
  items: Record<string, string>
  /** What the caller reports back to whoever pressed the button. */
  itemCount: number
}

interface ItemSeed {
  name: string
  tag: string
  weightGrams?: number
  /**
   * FR-28.1: the item mark. Given to roughly half the inventory on purpose —
   * a seed where every row carries one hides exactly what the FR-28.4 ladder
   * has to be looked at for: the mixed column, where a photo, a mark and
   * nothing stand beside each other.
   */
  icon?: string
}

/** The inventory, with the tag that groups it in M9 (ADR-014 primary tag). */
const INVENTORY: ItemSeed[] = [
  { name: 'Kamera', tag: 'Technik', weightGrams: 780, icon: '📷' },
  { name: 'Makro-Objektiv', tag: 'Technik', weightGrams: 420 },
  { name: 'Teleobjektiv', tag: 'Technik', weightGrams: 1350 },
  { name: 'Ringlicht', tag: 'Technik', weightGrams: 190 },
  { name: 'Stativ', tag: 'Technik', weightGrams: 1600 },
  { name: 'Ersatzakkus', tag: 'Technik', weightGrams: 160 },
  { name: 'Zelt', tag: 'Camping', weightGrams: 2400, icon: '⛺' },
  { name: 'Schlafsack', tag: 'Camping', weightGrams: 900, icon: '🛏️' },
  { name: 'Isomatte', tag: 'Camping', weightGrams: 480 },
  { name: 'Stirnlampe', tag: 'Camping', weightGrams: 95, icon: '🔦' },
  { name: 'Gaskocher', tag: 'Camping', weightGrams: 320, icon: '🔥' },
  { name: 'Regenjacke', tag: 'Kleidung', weightGrams: 340, icon: '🧥' },
  { name: 'Wandersocken', tag: 'Kleidung', weightGrams: 70, icon: '🧦' },
  { name: 'Reiseapotheke', tag: 'Bad', weightGrams: 280, icon: '🩹' },
  { name: 'Sonnencreme', tag: 'Bad', weightGrams: 150, icon: '🧴' },
  { name: 'Badetuch', tag: 'Bad', weightGrams: 400 },
  { name: 'Badehose', tag: 'Kleidung', weightGrams: 120, icon: '🩳' },
  { name: 'Wanderstöcke', tag: 'Camping', weightGrams: 480 },
  { name: 'Blasenpflaster', tag: 'Bad', weightGrams: 20 },
  { name: 'Powerbank', tag: 'Technik', weightGrams: 350, icon: '🔋' },
  { name: 'Ladegerät', tag: 'Technik', weightGrams: 180 },
  // Deliberately in no group and in no trip: FR-24.3's *physical* branch
  // needs an item nothing has ever referenced, and on a fresh device every
  // other item here is held by at least one group position.
  { name: 'Fernglas', tag: 'Technik', weightGrams: 620 },
]

/**
 * FR-20.1 companions, so a fresh device can exercise the FR-20.2 co-skip
 * cascade (and FR-5.5's snackbar naming it) without building a dependency
 * by hand first.
 */
const DEPENDENCIES: { item: string; dependsOn: string }[] = [
  { item: 'Ersatzakkus', dependsOn: 'Kamera' },
  { item: 'Ringlicht', dependsOn: 'Makro-Objektiv' },
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
  /** FR-28.8: the same field, on the group. Again not on all of them. */
  icon?: string
  positions: PositionSeed[]
}

const GROUPS: GroupSeed[] = [
  {
    name: 'Makro Fotografie',
    icon: '📷',
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
    icon: '⛺',
    positions: [
      { item: 'Zelt' },
      { item: 'Schlafsack', perPerson: true },
      { item: 'Isomatte', perPerson: true },
      { item: 'Stirnlampe', perPerson: true },
      { item: 'Gaskocher', task: 'Kartusche prüfen' },
    ],
  },
  // The four below push the total past six, which is what makes the
  // FR-27.13 picker search appear on a fresh device (its threshold is
  // PICKER_SEARCH_MIN_GROUPS); they share items with the groups above on
  // purpose, so an item search returns more than one row.
  {
    name: 'Strand',
    icon: '🏊',
    positions: [
      { item: 'Badetuch', perPerson: true },
      { item: 'Badehose', perPerson: true },
      { item: 'Sonnencreme' },
    ],
  },
  {
    name: 'Wandern',
    positions: [
      { item: 'Wandersocken', perPerson: true, quantity: 2 },
      { item: 'Wanderstöcke' },
      { item: 'Regenjacke', perPerson: true },
      { item: 'Blasenpflaster' },
    ],
  },
  {
    name: 'Erste Hilfe',
    positions: [{ item: 'Reiseapotheke' }, { item: 'Blasenpflaster' }],
  },
  {
    name: 'Strom & Laden',
    positions: [
      { item: 'Powerbank', task: 'Powerbank laden' },
      { item: 'Ladegerät' },
      { item: 'Ersatzakkus', quantity: 2 },
    ],
  },
]

/**
 * The composed Vorlage: two groups plus four positions of its own.
 *
 * Reiseapotheke and Blasenpflaster are loose here on purpose — together they
 * are exactly the *Erste Hilfe* group, so a freshly seeded device meets the
 * FR-27.15 suggestion row without anyone typing a Vorlage first.
 */
const VACATION = {
  name: 'Fotoreise (Beispiel)',
  icon: '📷',
  includes: ['Makro Fotografie', 'Wildlife Fotografie'],
  positions: [
    { item: 'Reiseapotheke' },
    { item: 'Blasenpflaster' },
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
 * FR-24.3's two retired rows, so M23 has something to show on a fresh device
 * and its hard case can be met without staging a delete by hand.
 *
 * Both are put into a group first, because that reference is what turns a
 * delete into a *retire* rather than a removal. The second one's name is then
 * taken by a freshly created item — the collision a restore has to survive,
 * which is otherwise reachable only by deleting something, re-creating it and
 * remembering why. Everything here goes through the orchestrator's own
 * actions, so every row is one a user could have produced.
 */
const RETIRE_DEMO = {
  group: 'Wellness',
  /** The tag its items carry — one the rest of the seed already uses. */
  tag: 'Bad',
  /** Stays visible, so the group is not left looking empty. */
  keep: 'Badetuch',
  /** Restores cleanly — its name is free. */
  plain: 'Reisewecker',
  /** Its name is taken by an active twin by the time M23 offers it back. */
  contested: 'Sonnenbrille',
} as const

function seedRetiredRows(
  orchestrator: Orchestrator,
  itemIds: Map<string, string>,
  tagIds: Map<string, string>,
): void {
  const groupId = orchestrator.createTemplate(RETIRE_DEMO.group, 'group', '🧼')
  if (groupId === null) return
  const keepId = itemIds.get(RETIRE_DEMO.keep)
  if (keepId) orchestrator.addTemplateItem(groupId, keepId, {})

  // Tagged like every other seeded item: M9 groups by primary tag, and an
  // untagged row would land in a bucket the rest of the seed never uses.
  const tagId = tagIds.get(RETIRE_DEMO.tag)
  const seedItem = (name: string, icon: string | null): string => {
    const itemId = orchestrator.createMasterItem(name, { weightGrams: null, icon })
    if (tagId) orchestrator.assignTag(itemId, tagId)
    return itemId
  }

  for (const name of [RETIRE_DEMO.plain, RETIRE_DEMO.contested]) {
    const itemId = seedItem(name, null)
    orchestrator.addTemplateItem(groupId, itemId, {})
    orchestrator.deleteMasterItem(itemId)
  }

  // The retired row's name, now held by a different item — which is exactly
  // what the partial unique index allows and what M23 has to answer.
  seedItem(RETIRE_DEMO.contested, '🕶️')
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
    const id = orchestrator.createMasterItem(item.name, {
      weightGrams: item.weightGrams ?? null,
      icon: item.icon ?? null,
    })
    itemIds.set(item.name, id)
    const tagId = tagIds.get(item.tag)
    if (tagId) orchestrator.assignTag(id, tagId)
  }

  for (const dep of DEPENDENCIES) {
    const itemId = itemIds.get(dep.item)
    const mainId = itemIds.get(dep.dependsOn)
    if (itemId && mainId) orchestrator.addItemDependency(itemId, mainId, { mode: 'required' })
  }

  // A second seed run on a device that already carries the sample data finds
  // every one of these names taken (FR-1.6) — createTemplate refuses it, and
  // the seed adopts what is already there rather than writing a duplicate the
  // server would have refused anyway. What it must not then do is fill that
  // adopted template a second time: `template_includes` and `template_items`
  // are UNIQUE on their pairs, so the contents are written only for a
  // template this run actually created.
  const created = new Set<string>()
  const seedTemplate = (name: string, kind: TemplateKind, icon: string | null): string => {
    const id = orchestrator.createTemplate(name, kind, icon)
    if (id === null) return orchestrator.templateNameCollision(name)!.id
    created.add(id)
    return id
  }

  const groupIds = new Map<string, string>()
  for (const group of GROUPS) {
    const id = seedTemplate(group.name, 'group', group.icon ?? null)
    groupIds.set(group.name, id)
    if (created.has(id)) addPositions(orchestrator, id, itemIds, group.positions)
  }

  const vacationTemplateId = seedTemplate(VACATION.name, 'template', VACATION.icon)
  if (created.has(vacationTemplateId)) {
    for (const name of VACATION.includes) {
      const groupId = groupIds.get(name)
      if (groupId) orchestrator.addTemplateInclude(vacationTemplateId, groupId)
    }
    addPositions(orchestrator, vacationTemplateId, itemIds, VACATION.positions)
  }

  // Only on a run that actually created templates: a second run finds every
  // name taken and would otherwise add a second pair of retired rows.
  if (created.size > 0) seedRetiredRows(orchestrator, itemIds, tagIds)

  return {
    vacationTemplateId,
    groups: Object.fromEntries(groupIds),
    items: Object.fromEntries(itemIds),
    itemCount: itemIds.size,
  }
}
