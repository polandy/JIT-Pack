/**
 * Trip cloning (FR-12.1/12.2) — pure, no I/O.
 *
 * The plan copies the source trip's curated list (all manual edits,
 * FR-2.4 decoupling) with fresh pack state; the three FR-12.2 carry-over
 * options gate traveler assignments, packer delegations, and container
 * assignments. Quantity formulas of template-sourced items re-evaluate
 * against the new duration; manual quantities survive as-is.
 *
 * Runs client-side like generation/review (Addendum 3.19), so
 * Local Mode clones without a server.
 */

import { buildVariables, computeQuantity } from './instantiate'
import type {
  Container,
  ItemMode,
  ItemState,
  MasterItem,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
} from '@/types/domain'

export interface CloneOptions {
  /** (a) carry item → traveler assignments. */
  travelerAssignments: boolean
  /** (b) carry packer delegations (FR-4.2 "Packed by"). */
  packerDelegations: boolean
  /** (c) carry containers and item → container assignments. */
  containerAssignments: boolean
}

export interface CloneSource {
  trip: Trip
  items: TripItem[]
  travelers: Traveler[]
  containers: Container[]
}

/** Template lookups for the FR-12.2 formula re-evaluation. */
export interface CloneLookup {
  templateItem: (templateId: string, itemId: string) => TemplateItem | undefined
  masterItem: (id: string) => MasterItem | undefined
}

export interface ClonedTraveler {
  name: string
  profile: 'adult' | 'child'
}

export interface ClonedContainer {
  name: string
  max_weight_grams: number | null
  /** Index into plan.travelers, resolved after the clone creates them. */
  carrier_traveler_index: number | null
  /** Index into plan.containers — pairs resolve within the clone. */
  paired_container_index: number | null
}

export interface ClonedItem {
  name: string
  source_item_id: string | null
  source_template_id: string | null
  category_name: string | null
  weight_grams: number | null
  value_cents: number | null
  quantity: number
  state: Extract<ItemState, 'open' | 'skipped'>
  mode: ItemMode
  late_packer: boolean
  traveler_index: number | null
  container_index: number | null
  packer_user_id: string | null
  /** Always false — FR-9.1 flags belong to the source trip. */
  flag_unused: boolean
  flag_missing: boolean
}

export interface ClonePlan {
  travelers: ClonedTraveler[]
  containers: ClonedContainer[]
  items: ClonedItem[]
  /** How many quantities were re-evaluated from their formula. */
  reevaluated: number
}

export function planClone(
  source: CloneSource,
  options: CloneOptions,
  lookup: CloneLookup,
  newDurationDays: number | null,
): ClonePlan {
  const travelerIndex = new Map(source.travelers.map((t, i) => [t.id, i]))
  const travelers: ClonedTraveler[] = source.travelers.map((t) => ({
    name: t.name,
    profile: t.profile,
  }))

  const sourceContainers = options.containerAssignments ? source.containers : []
  const containerIndex = new Map(sourceContainers.map((c, i) => [c.id, i]))
  const containers: ClonedContainer[] = sourceContainers.map((c) => ({
    name: c.name,
    max_weight_grams: c.max_weight_grams,
    carrier_traveler_index: c.carrier_traveler_id
      ? (travelerIndex.get(c.carrier_traveler_id) ?? null)
      : null,
    paired_container_index: c.paired_container_id
      ? (containerIndex.get(c.paired_container_id) ?? null)
      : null,
  }))

  const vars = buildVariables({
    duration_days: newDurationDays,
    attributes: source.trip.attributes,
    travelers,
  })

  let reevaluated = 0
  const items: ClonedItem[] = source.items.map((item) => {
    let quantity = item.quantity
    if (item.source_template_id && item.source_item_id) {
      const ti = lookup.templateItem(item.source_template_id, item.source_item_id)
      const master = lookup.masterItem(item.source_item_id)
      if (ti && master) {
        quantity = computeQuantity(ti, master, vars)
        reevaluated++
      }
    }
    return {
      name: item.name,
      source_item_id: item.source_item_id,
      source_template_id: item.source_template_id,
      category_name: item.category_name,
      weight_grams: item.weight_grams,
      value_cents: item.value_cents,
      quantity,
      // A skip is list curation and travels with the clone (FR-5.5);
      // pack progress and flags belong to the old trip.
      state: item.state === 'skipped' ? 'skipped' : 'open',
      mode: item.mode,
      late_packer: item.late_packer,
      traveler_index:
        options.travelerAssignments && item.assigned_traveler_id
          ? (travelerIndex.get(item.assigned_traveler_id) ?? null)
          : null,
      container_index:
        options.containerAssignments && item.container_id
          ? (containerIndex.get(item.container_id) ?? null)
          : null,
      packer_user_id: options.packerDelegations ? item.packer_user_id : null,
      flag_unused: false,
      flag_missing: false,
    }
  })

  return { travelers, containers, items, reevaluated }
}
