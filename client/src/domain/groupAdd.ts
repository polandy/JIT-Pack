/**
 * Adding a whole group to an existing trip (FR-27.10) — pure, no I/O.
 *
 * Not every scope decision is made in the M3 wizard: you decide on site that
 * you will shoot macro this time, and the alternative today is hand-copying a
 * dozen positions. So the group is expanded again, on a trip that already has
 * rows — which is the whole difference to generation, and the reason this is
 * its own module rather than a flag on `generateTripItems`.
 *
 * Two rules follow from "the trip already has rows":
 *
 * 1. **The expansion is the same resolution M3 performs**, minus the wizard —
 *    includes expanded, per-person positions fanned out over the trip's
 *    *current* travelers (FR-25.8), FR-27.7 tasks carried along.
 * 2. **What the trip already carries is reported, never duplicated**, in the
 *    FR-2.3 / FR-27.3 spirit: the report is the feature, because a group that
 *    is already fully present must say so instead of adding nothing silently.
 */

import { generateTripItems, type GeneratedItem } from './instantiate'
import type {
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
  Traveler,
  TripItem,
} from '@/types/domain'

export interface GroupAdditionInput {
  /** The group (or Vorlage) to expand — its includes are resolved as in M3. */
  templateId: string
  /** Every template on the device: includes resolve against this catalogue. */
  templates: Template[]
  includes: TemplateInclude[]
  templateItems: TemplateItem[]
  templateItemTasks: TemplateItemTask[]
  masterItems: MasterItem[]
  /** The trip's attributes, for the FR-15.2 conditions. */
  attributes: Record<string, unknown> | null
  duration_days: number | null
  /** The trip's current roster — per-person positions fan out over it. */
  travelers: Traveler[]
  /** What the trip carries today, generated and hand-added alike. */
  items: TripItem[]
}

/** One row the addition will create, with its traveler already resolved. */
export interface PlannedGroupAdd {
  generated: GeneratedItem
  /** null = trip-global. */
  traveler_id: string | null
}

export interface GroupAdditionPlan {
  add: PlannedGroupAdd[]
  /**
   * Names the trip already carried, each named once however often the group
   * would have placed it — the user thinks in items, not in rows.
   */
  alreadyPresent: string[]
}

/**
 * planGroupAddition resolves the group against the trip and answers with the
 * rows to create and the names it left alone.
 *
 * Presence is decided by **master item first, name second**: a generated row
 * carries its `source_item_id`, but an ad-hoc row typed on the trip carries
 * none, and "Powerbank" typed by hand is the same thing the group is about to
 * bring. Matching is trip-global rather than per traveler, the stance FR-27.3
 * settled for single items: a per-person fan-out means the item is on the trip
 * already, and one more row reads as one more thing to pack.
 */
export function planGroupAddition(input: GroupAdditionInput): GroupAdditionPlan {
  const resolved = generateTripItems({
    templates: input.templates,
    selectedTemplateIds: [input.templateId],
    includes: input.includes,
    templateItems: input.templateItems,
    templateItemTasks: input.templateItemTasks,
    masterItems: input.masterItems,
    trip: {
      duration_days: input.duration_days,
      attributes: input.attributes,
      travelers: input.travelers.map((t) => ({ name: t.name })),
    },
  })

  const presentItemIds = new Set(
    input.items.map((i) => i.source_item_id).filter((id): id is string => id !== null),
  )
  const presentNames = new Set(input.items.map((i) => normalizeName(i.name)))

  const add: PlannedGroupAdd[] = []
  const alreadyPresent: string[] = []
  const reported = new Set<string>()

  for (const generated of resolved.items) {
    const present =
      presentItemIds.has(generated.source_item_id) ||
      presentNames.has(normalizeName(generated.name))
    if (present) {
      if (!reported.has(generated.source_item_id)) {
        reported.add(generated.source_item_id)
        alreadyPresent.push(generated.name)
      }
      continue
    }
    add.push({
      generated,
      traveler_id:
        generated.traveler_index === null
          ? null
          : (input.travelers[generated.traveler_index]?.id ?? null),
    })
  }

  return { add, alreadyPresent }
}

/** Tolerant enough for "Powerbank" vs "powerbank ", deliberately no further. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
