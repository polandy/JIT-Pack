/**
 * Template instantiation (FR-2.2/FR-2.3a/FR-1.4/FR-1.8/FR-15.2) — pure,
 * no I/O. Turns selected templates into concrete trip items:
 * conditions filter, formulas evaluate, per_person expands to one row
 * per traveler, overlaps across templates deduplicate.
 *
 * Living client-side keeps Local Mode (Addendum 3.19) at feature parity
 * for free — Server Mode pushes the generated rows through the normal
 * sync outbox, Local Mode persists them directly.
 */

import { evaluateFormula, type FormulaVariables } from './formula'
import type { ItemMode, MasterItem, Template, TemplateDedup, TemplateItem } from '@/types/domain'

export interface GenerationTraveler {
  name: string
  profile: 'adult' | 'child'
}

export interface GenerationTrip {
  duration_days: number | null
  attributes: Record<string, unknown> | null
  travelers: GenerationTraveler[]
}

export interface GenerationInput {
  templates: Template[]
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
}

export interface GenerationResult {
  items: GeneratedItem[]
  excluded: ExcludedItem[]
  merged: MergedOverlap[]
}

/** Inclusive day count matching the trips.duration_days DB definition (FR-2.1a: null without start date). */
export function durationDays(startDate: string | null, endDate: string): number | null {
  if (!startDate || !endDate) return null
  const ms = Date.parse(endDate) - Date.parse(startDate)
  if (Number.isNaN(ms)) return null
  return Math.round(ms / 86_400_000) + 1
}

export function generateTripItems(input: GenerationInput): GenerationResult {
  const selected = new Set(input.templates.map((t) => t.id))
  const itemsByID = new Map(input.masterItems.map((i) => [i.id, i]))
  const vars = buildVariables(input.trip)

  const excluded: ExcludedItem[] = []
  const byKey = new Map<string, { item: GeneratedItem; dedups: TemplateDedup[]; quantities: number[] }>()

  for (const ti of input.templateItems) {
    if (!selected.has(ti.template_id)) continue
    const master = itemsByID.get(ti.item_id)
    if (!master) continue

    const failure = conditionFailure(ti.conditions, input.trip.attributes)
    if (failure !== null) {
      excluded.push({ item_name: master.name, template_id: ti.template_id, reason: failure })
      continue
    }

    const quantity = computeQuantity(ti, master, vars)
    const targets: (number | null)[] =
      ti.assignment === 'per_person' ? input.trip.travelers.map((_, idx) => idx) : [null]

    for (const travelerIndex of targets) {
      const key = `${ti.item_id}|${travelerIndex ?? 'global'}`
      const existing = byKey.get(key)
      if (existing) {
        existing.dedups.push(ti.dedup)
        existing.quantities.push(quantity)
      } else {
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
          },
          dedups: [ti.dedup],
          quantities: [quantity],
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
        quantities: entry.quantities,
        quantity: entry.item.quantity,
      })
    }
    items.push(entry.item)
  }
  return { items, excluded, merged }
}

function buildVariables(trip: GenerationTrip): FormulaVariables {
  const attrs = trip.attributes ?? {}
  const str = (key: string) => (typeof attrs[key] === 'string' ? (attrs[key] as string) : null)
  return {
    trip_duration: trip.duration_days,
    num_travelers: trip.travelers.length,
    num_adults: trip.travelers.filter((t) => t.profile === 'adult').length,
    num_children: trip.travelers.filter((t) => t.profile === 'child').length,
    season: str('season'),
    transport_mode: str('transport_mode'),
    accommodation: str('accommodation'),
  }
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
 * computeQuantity evaluates the formula (null → 1 per FR-2.1a), applies
 * the per-day consumable rate (FR-1.8: rate × duration, duration-less
 * trips fall back to a single day), clamps at 0, and rounds up — a
 * fractional result must never under-pack.
 */
function computeQuantity(ti: TemplateItem, master: MasterItem, vars: FormulaVariables): number {
  const base = evaluateFormula(ti.quantity_formula, vars) ?? 1
  let quantity = base
  if (master.unit === 'per_day' && master.per_day_rate !== null) {
    quantity = base * master.per_day_rate * (vars.trip_duration ?? 1)
  }
  return Math.max(0, Math.ceil(quantity))
}
