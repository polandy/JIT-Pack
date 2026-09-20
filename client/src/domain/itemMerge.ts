/**
 * Merging duplicate master items (FR-24.15) — pure, no I/O.
 *
 * Two rows that are the same thing become one: the user names the survivor,
 * and everything that pointed at the others points at it instead. Four tables
 * name an `items.id`, and three of them can refuse a re-point — `UNIQUE
 * (item_id, tag_id)`, `UNIQUE (template_id, item_id)`, `UNIQUE (item_id,
 * depends_on_item_id)` and the `CHECK (item_id <> depends_on_item_id)`. So the
 * whole merge is decided **here, once**, over the rows the device already
 * holds, rather than one write at a time against a store that is mid-change:
 * the same property FR-24.14's tag merge is built on, with four tables instead
 * of one.
 *
 * What this plan deliberately does **not** touch is the trip partition.
 * `trip_items.source_item_id` and `trip_generated_positions.source_item_id`
 * stay where they are: a finished trip is a snapshot, a client can only
 * rewrite the trips it is a member of and holds, and
 * `UNIQUE (trip_id, source_item_id, traveler_id)` would refuse the re-point on
 * exactly the trips that carried both duplicates. The rear view reads the two
 * pasts as one through {@link ItemMergePlan.aliases} instead — see ADR-068.
 */
import { dependencyCycleError } from './dependencies'
import type { ItemDependency, ItemTag, MasterItem, TemplateItem } from '@/types/domain'
import type { TemplateItemTask } from '@/types/domain'

/** Everything the plan reads, passed in so this module owns no store. */
export interface ItemMergeSources {
  /** Every master item the device holds, retired ones included (the alias chain). */
  items: readonly MasterItem[]
  /** `item_tags` across the inventory. */
  assignments: readonly ItemTag[]
  /** `item_dependencies` across the inventory. */
  dependencies: readonly ItemDependency[]
  /** `template_items` across every Vorlage and group. */
  positions: readonly TemplateItem[]
  /** FR-27.7 preparation tasks, so a collapsed position does not lose its words. */
  tasks: readonly TemplateItemTask[]
}

/** An edge after the merge: the same row, pointing at the survivor. */
export interface RepointedEdge {
  edge: ItemDependency
  item_id: string
  depends_on_item_id: string
}

/** Two positions of one Vorlage becoming one. */
export interface CollapsedPosition {
  /** The position that stays — the survivor's, or the first one re-pointed at it. */
  keep: TemplateItem
  /** The position that goes. */
  drop: TemplateItem
  /** What `keep` ends up at: the running maximum (FR-2.3's `dedup: max`). */
  quantity: number
  /** The dropped position's FR-27.7 tasks, to be written onto `keep`. */
  tasks: string[]
}

/** The fields a survivor may take over — only the ones it left empty. */
export type FilledFields = Partial<
  Pick<MasterItem, 'weight_grams' | 'value_cents' | 'icon' | 'default_assignee_id'>
>

export interface ItemMergePlan {
  tags: {
    repoint: ItemTag[]
    drop: ItemTag[]
    /** Where a re-pointed assignment is written — after the survivor's own. */
    positionOf: (assignmentId: string) => number
  }
  dependencies: {
    repoint: RepointedEdge[]
    drop: ItemDependency[]
    /** Edges between two merged rows: they would become `item_id = depends_on_item_id`. */
    selfEdges: number
    /** Edges dropped because re-pointing them would close a cycle (§3.20). */
    cycles: number
  }
  positions: {
    repoint: TemplateItem[]
    collapse: CollapsedPosition[]
    /** What a kept position's amount ends at once every collapse is written. */
    quantityOf: (positionId: string) => number
  }
  /** Values the survivor takes over because it had none. */
  fields: FilledFields
  /** The item whose photo moves to the survivor, or null. */
  photoFrom: string | null
  /**
   * Every row whose `merged_into_id` must name the survivor: the losers, and
   * anything already aliased at one of them. Flattening here is what keeps
   * the readers' contract at **one hop** however often a row is merged.
   */
  aliases: string[]
}

/**
 * planItemMerge decides a whole merge (FR-24.15).
 *
 * `loserIds` is in the order the user picked them, and that order is what
 * decides which value a survivor takes over when two losers both have one.
 * The survivor may not be among them — that would be a merge asked to delete
 * the row it was told to keep.
 */
export function planItemMerge(
  survivorId: string,
  loserIds: readonly string[],
  sources: ItemMergeSources,
): ItemMergePlan {
  if (loserIds.includes(survivorId)) {
    throw new Error('planItemMerge: the survivor cannot also be merged away')
  }
  const losers = new Set(loserIds)
  const byId = new Map(sources.items.map((row) => [row.id, row]))

  return {
    tags: planTags(survivorId, loserIds, losers, sources.assignments),
    dependencies: planDependencies(survivorId, losers, sources.dependencies),
    positions: planPositions(survivorId, loserIds, sources),
    fields: planFields(survivorId, loserIds, byId),
    photoFrom: planPhoto(survivorId, loserIds, byId),
    aliases: planAliases(loserIds, losers, sources.items),
  }
}

/**
 * The survivor keeps its own primary tag (FR-24.2's heading is where the user
 * chose to keep it), so a re-pointed assignment is appended rather than
 * promoted — the opposite of FR-24.14, where the *item* is what is preserved.
 */
function planTags(
  survivorId: string,
  loserIds: readonly string[],
  losers: Set<string>,
  assignments: readonly ItemTag[],
): ItemMergePlan['tags'] {
  const repoint: ItemTag[] = []
  const drop: ItemTag[] = []
  const positions = new Map<string, number>()

  const own = assignments.filter((a) => a.item_id === survivorId)
  const taken = new Set(own.map((a) => a.tag_id))
  let next = own.reduce((max, a) => Math.max(max, a.position + 1), 0)

  for (const loserId of loserIds) {
    if (!losers.has(loserId)) continue
    for (const assignment of assignments.filter((a) => a.item_id === loserId)) {
      if (taken.has(assignment.tag_id)) {
        drop.push(assignment)
        continue
      }
      taken.add(assignment.tag_id)
      positions.set(assignment.id, next)
      next += 1
      repoint.push(assignment)
    }
  }
  return { repoint, drop, positionOf: (id) => positions.get(id) ?? 0 }
}

/**
 * Both ends move, and three shapes cannot: an edge *between* two merged rows
 * (a self-edge), one the survivor already has (`UNIQUE`), and one that would
 * close a cycle two rows kept open while they were apart. Each is dropped and
 * counted, because a merge may not be refused by an edge the user cannot see
 * from the inventory — but it owes them a sentence.
 */
function planDependencies(
  survivorId: string,
  losers: Set<string>,
  dependencies: readonly ItemDependency[],
): ItemMergePlan['dependencies'] {
  const resolve = (id: string) => (losers.has(id) ? survivorId : id)
  const touches = (edge: ItemDependency) =>
    losers.has(edge.item_id) || losers.has(edge.depends_on_item_id)

  const kept: ItemDependency[] = dependencies.filter((edge) => !touches(edge))
  const repoint: RepointedEdge[] = []
  const drop: ItemDependency[] = []
  let selfEdges = 0
  let cycles = 0

  for (const edge of dependencies.filter(touches)) {
    const item_id = resolve(edge.item_id)
    const depends_on_item_id = resolve(edge.depends_on_item_id)

    if (item_id === depends_on_item_id) {
      drop.push(edge)
      selfEdges += 1
      continue
    }
    const exists = kept.some(
      (other) => other.item_id === item_id && other.depends_on_item_id === depends_on_item_id,
    )
    if (exists) {
      drop.push(edge)
      continue
    }
    if (dependencyCycleError(kept, { item_id, depends_on_item_id }, (id) => id)) {
      drop.push(edge)
      cycles += 1
      continue
    }
    kept.push({ ...edge, item_id, depends_on_item_id })
    repoint.push({ edge, item_id, depends_on_item_id })
  }
  return { repoint, drop, selfEdges, cycles }
}

/**
 * `UNIQUE (template_id, item_id)` means a Vorlage holding both duplicates
 * ends with one position. It keeps the survivor's settings — or, where the
 * survivor is not in that Vorlage at all, the first loser's position becomes
 * the survivor's and the rest fold into it — takes the **higher** amount
 * (FR-2.3's `dedup: max`, the product's existing answer to the same item
 * twice) and carries the dropped position's FR-27.7 tasks over, because
 * user-typed prose is the one thing a merge may never drop.
 */
function planPositions(
  survivorId: string,
  loserIds: readonly string[],
  sources: ItemMergeSources,
): ItemMergePlan['positions'] {
  const repoint: TemplateItem[] = []
  const collapse: CollapsedPosition[] = []
  const quantities = new Map<string, number>()
  const losers = new Set(loserIds)

  const templates = new Set(
    sources.positions.filter((p) => losers.has(p.item_id)).map((p) => p.template_id),
  )

  for (const templateId of templates) {
    const inTemplate = sources.positions.filter((p) => p.template_id === templateId)
    let keep = inTemplate.find((p) => p.item_id === survivorId) ?? null

    const mine = loserIds.flatMap((loserId) => inTemplate.filter((p) => p.item_id === loserId))
    for (const position of mine) {
      if (!keep) {
        keep = position
        quantities.set(keep.id, keep.quantity)
        repoint.push(position)
        continue
      }
      const quantity = Math.max(quantities.get(keep.id) ?? keep.quantity, position.quantity)
      quantities.set(keep.id, quantity)
      collapse.push({ keep, drop: position, quantity, tasks: tasksOf(position.id, sources.tasks) })
    }
  }
  return {
    repoint,
    collapse,
    quantityOf: (id) => quantities.get(id) ?? 0,
  }
}

function tasksOf(positionId: string, tasks: readonly TemplateItemTask[]): string[] {
  return tasks.filter((task) => task.template_item_id === positionId).map((task) => task.task)
}

/**
 * The survivor was chosen because it is the better row, so its own values
 * stand and the losers only fill what it left empty — in the order they were
 * picked. A field-by-field dialogue would buy precision nobody asked for on an
 * act performed twice a year; what the merge owes instead is a confirm naming
 * what it took over.
 */
function planFields(
  survivorId: string,
  loserIds: readonly string[],
  byId: Map<string, MasterItem>,
): FilledFields {
  const survivor = byId.get(survivorId)
  const fields: FilledFields = {}
  if (!survivor) return fields

  const fillable = ['weight_grams', 'value_cents', 'icon', 'default_assignee_id'] as const
  for (const field of fillable) {
    if (survivor[field] !== null && survivor[field] !== undefined) continue
    for (const loserId of loserIds) {
      const value = byId.get(loserId)?.[field]
      if (value === null || value === undefined) continue
      Object.assign(fields, { [field]: value })
      break
    }
  }
  return fields
}

/** The photo is the same rule, and it is the only one whose bytes have to move (ADR-002). */
function planPhoto(
  survivorId: string,
  loserIds: readonly string[],
  byId: Map<string, MasterItem>,
): string | null {
  if (byId.get(survivorId)?.image_hash) return null
  return loserIds.find((id) => byId.get(id)?.image_hash) ?? null
}

function planAliases(
  loserIds: readonly string[],
  losers: Set<string>,
  items: readonly MasterItem[],
): string[] {
  const chained = items
    .filter((row) => row.merged_into_id && losers.has(row.merged_into_id))
    .map((row) => row.id)
    .filter((id) => !losers.has(id))
  return [...loserIds, ...chained]
}

/**
 * The item and everything merged into it — what a rear view reads over
 * (FR-24.15).
 *
 * A trip row keeps naming the item it was generated from, so the survivor's
 * own id finds only its own history. One hop out, over the rows this device
 * holds, is what makes „was on trips X and Y" true again after a merge —
 * and it is the same hop {@link resolveMergedItem} makes in the other
 * direction, for a reader that starts from the trip row instead.
 */
export function mergedIdsOf(itemId: string, items: readonly MasterItem[]): string[] {
  return [itemId, ...items.filter((row) => row.merged_into_id === itemId).map((row) => row.id)]
}

/**
 * Where a trip's `source_item_id` reads back to today (FR-24.15).
 *
 * **One hop, never a chain.** {@link planItemMerge} flattens the alias at
 * merge time, so a reader never has to walk; following a second hop would
 * also be the one way two devices that merged the same pair in opposite
 * directions could loop, since field-level LWW can leave a pair of rows
 * naming each other (ADR-068). An alias whose target is itself aliased is
 * therefore treated as no alias at all: the rear view reports the two pasts
 * separately, which is the state the product was in before the merge existed.
 */
export function resolveMergedItem(itemId: string, items: readonly MasterItem[]): string {
  const byId = new Map(items.map((row) => [row.id, row]))
  const target = byId.get(itemId)?.merged_into_id
  if (!target || target === itemId) return itemId
  return byId.get(target)?.merged_into_id ? itemId : target
}
