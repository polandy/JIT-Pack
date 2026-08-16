/**
 * Template instantiation (FR-2.2/FR-2.3a/FR-1.4/FR-1.8/FR-15.2) — pure,
 * no I/O. Turns selected templates into concrete trip items:
 * conditions filter, quantities apply, per_person expands to one row
 * per traveler, overlaps across templates deduplicate.
 *
 * Living client-side keeps Local Mode (Addendum 3.19) at feature parity
 * for free — Server Mode pushes the generated rows through the normal
 * sync outbox, Local Mode persists them directly.
 */

import { includedTemplatesOf } from './templates'
import type {
  ItemMode,
  MasterItem,
  Template,
  TemplateDedup,
  TemplateInclude,
  TemplateItem,
  TemplateItemTask,
} from '@/types/domain'

export interface GenerationTraveler {
  name: string
}

export interface GenerationTrip {
  duration_days: number | null
  attributes: Record<string, unknown> | null
  travelers: GenerationTraveler[]
}

export interface GenerationInput {
  /**
   * Every template on the device, not only the picked ones — includes are
   * resolved against this catalogue (FR-27.1), so a group reaches the trip
   * without the caller having to know the composition up front.
   */
  templates: Template[]
  /** What the user picked: Ferien-Vorlagen and/or standalone Gruppen (FR-27.3). */
  selectedTemplateIds: string[]
  /** The (Vorlage, Gruppe) pairs of the master partition. */
  includes: TemplateInclude[]
  /** FR-27.7: the preparation tasks hanging off template positions. */
  templateItemTasks: TemplateItemTask[]
  templateItems: TemplateItem[]
  masterItems: MasterItem[]
  trip: GenerationTrip
}

/** One generated trip item; traveler_index refers into trip.travelers. */
export interface GeneratedItem {
  source_item_id: string
  source_template_id: string
  name: string
  category_name: string | null
  weight_grams: number | null
  value_cents: number | null
  quantity: number
  mode: ItemMode
  late_packer: boolean
  traveler_index: number | null
  /**
   * FR-27.7: the preparation tasks of the contributing position(s), which the
   * caller writes as ordinary FR-7.3 todos on the created row. Empty rather
   * than absent, so a caller never has to distinguish "none" from "unknown".
   */
  tasks: string[]
}

export interface ExcludedItem {
  item_name: string
  template_id: string
  reason: string
}

export interface MergedOverlap {
  item_name: string
  traveler_index: number | null
  strategy: TemplateDedup
  quantities: number[]
  quantity: number
  /**
   * FR-27.2: the merge is the user-visible point of composition, so the
   * contributing templates are named ("Kamera nur 1× — in Makro & Wildlife")
   * rather than counted. In resolution order: the Vorlage before its Gruppen.
   */
  sources: Template[]
}

export interface GenerationResult {
  items: GeneratedItem[]
  excluded: ExcludedItem[]
  merged: MergedOverlap[]
}

/** Inclusive day count matching the trips.duration_days DB definition (FR-2.1a: null without start date). */
export function durationDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null
  const ms = Date.parse(endDate) - Date.parse(startDate)
  if (Number.isNaN(ms)) return null
  return Math.round(ms / 86_400_000) + 1
}

export function generateTripItems(input: GenerationInput): GenerationResult {
  const sources = resolveSources(input)
  const itemsByID = new Map(input.masterItems.map((i) => [i.id, i]))
  const tasksByPosition = new Map<string, string[]>()
  for (const t of input.templateItemTasks) {
    const list = tasksByPosition.get(t.template_item_id)
    if (list) list.push(t.task)
    else tasksByPosition.set(t.template_item_id, [t.task])
  }

  const excluded: ExcludedItem[] = []
  const byKey = new Map<
    string,
    {
      item: GeneratedItem
      dedups: TemplateDedup[]
      quantities: number[]
      sources: Template[]
    }
  >()

  // Source-ordered rather than position-ordered: the first contributor carries
  // the non-quantity attributes and heads the merge report, and FR-27.2 wants
  // that to be the Vorlage before its Gruppen — never whatever the sync pulled
  // first. Same ordering rule as resolveTemplate (templates.ts).
  for (const source of sources) {
    for (const ti of input.templateItems) {
      if (ti.template_id !== source.id) continue
      const master = itemsByID.get(ti.item_id)
      if (!master) continue

      const failure = conditionFailure(ti.conditions, input.trip.attributes)
      if (failure !== null) {
        excluded.push({ item_name: master.name, template_id: ti.template_id, reason: failure })
        continue
      }

      const quantity = computeQuantity(ti)
      const tasks = tasksByPosition.get(ti.id) ?? []
      const targets: (number | null)[] =
        ti.assignment === 'per_person' ? input.trip.travelers.map((_, idx) => idx) : [null]

      for (const travelerIndex of targets) {
        const key = `${ti.item_id}|${travelerIndex ?? 'global'}`
        const existing = byKey.get(key)
        if (existing) {
          existing.dedups.push(ti.dedup)
          existing.quantities.push(quantity)
          existing.sources.push(source)
          // A merge keeps the union of the preparation tasks: dropping the
          // second group's task would lose exactly the knowledge FR-27.7 is
          // for. Identical text is one todo, not two — the same task learned
          // by two groups is still one thing to do.
          for (const t of tasks) {
            if (!existing.item.tasks.includes(t)) existing.item.tasks.push(t)
          }
          continue
        }
        byKey.set(key, {
          item: {
            source_item_id: ti.item_id,
            source_template_id: ti.template_id,
            name: master.name,
            category_name: master.category_name ?? null,
            weight_grams: master.weight_grams,
            value_cents: master.value_cents,
            quantity,
            mode: ti.default_mode,
            late_packer: ti.late_packer,
            traveler_index: travelerIndex,
            // A fresh array per traveler row: the fan-out below would
            // otherwise have every row share one list and one merge would
            // append a task to all of them.
            tasks: [...tasks],
          },
          dedups: [ti.dedup],
          quantities: [quantity],
          sources: [source],
        })
      }
    }
  }

  const items: GeneratedItem[] = []
  const merged: MergedOverlap[] = []
  for (const entry of byKey.values()) {
    if (entry.quantities.length > 1) {
      // FR-2.3a: max is the default; any participating template item
      // requesting sum (typically consumables) switches the overlap to sum.
      const strategy: TemplateDedup = entry.dedups.includes('sum') ? 'sum' : 'max'
      entry.item.quantity =
        strategy === 'sum'
          ? entry.quantities.reduce((a, b) => a + b, 0)
          : Math.max(...entry.quantities)
      merged.push({
        item_name: entry.item.name,
        traveler_index: entry.item.traveler_index,
        strategy,
        sources: entry.sources,
        quantities: entry.quantities,
        quantity: entry.item.quantity,
      })
    }
    items.push(entry.item)
  }
  return { items, excluded, merged }
}

/**
 * resolveSources turns the picked template ids into the ordered list of
 * templates that actually contribute positions: each pick, followed by the
 * Gruppen it includes (FR-27.1/27.2). Order matters twice over — the first
 * contributor of an item supplies its non-quantity attributes, and FR-27.2's
 * merge report reads Vorlage-before-Gruppen.
 *
 * Expansion is **one level**, matching resolveTemplate (templates.ts): FR-27.1
 * fixes the hierarchy at two levels, which is what makes include cycles
 * structurally impossible. Following an included group's own includes would
 * quietly reintroduce the depth the FR rejected, and with it the cycle it
 * cannot have. A template picked directly *and* reached through an include
 * contributes once — the dedup below would merge it with itself otherwise,
 * turning a `sum` position into double the amount.
 */
function resolveSources(input: GenerationInput): Template[] {
  const catalogue = new Map(input.templates.map((t) => [t.id, t]))
  const sources: Template[] = []
  const seen = new Set<string>()

  const add = (template: Template | undefined) => {
    if (!template || seen.has(template.id)) return
    seen.add(template.id)
    sources.push(template)
  }

  for (const id of input.selectedTemplateIds) {
    const picked = catalogue.get(id)
    if (!picked) continue
    add(picked)
    // Same ordering rule as the M7/M8 resolution, and for the same reason:
    // the include rows arrive in storage order, which decides provenance.
    // A group that has not synced to this device yet is dropped by the
    // helper rather than failing the whole generation.
    for (const group of includedTemplatesOf(picked.id, input.templates, input.includes)) {
      add(group)
    }
  }

  return sources
}

/**
 * conditionFailure returns null when all conditions match the trip
 * attributes, otherwise a human-readable reason for the M3 preview
 * ("skipped: season ≠ winter").
 */
function conditionFailure(
  conditions: Record<string, unknown> | null,
  attributes: Record<string, unknown> | null,
): string | null {
  if (!conditions) return null
  const attrs = attributes ?? {}
  for (const [key, raw] of Object.entries(conditions)) {
    const allowed = (Array.isArray(raw) ? raw : [raw]).map(String)
    const actual = attrs[key]
    if (key === 'tags') {
      const tags = Array.isArray(actual) ? actual.map(String) : []
      if (!allowed.some((tag) => tags.includes(tag))) {
        return `missing tag ${allowed.join(' / ')}`
      }
      continue
    }
    if (typeof actual !== 'string' || !allowed.includes(actual)) {
      return allowed.length === 1
        ? `${key} ≠ ${allowed[0]}`
        : `${key} not in (${allowed.join(', ')})`
    }
  }
  return null
}

/**
 * computeQuantity clamps the position's plain amount at 0. Formulas were
 * retired (FR-1.3/1.5, owner decision 2026-08-08) — trip-specific amounts
 * are set in the M3 quantity review instead.
 */
export function computeQuantity(ti: Pick<TemplateItem, 'quantity'>): number {
  return Math.max(0, Math.floor(ti.quantity ?? 1))
}
