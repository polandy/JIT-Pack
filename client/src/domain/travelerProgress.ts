/**
 * FR-25.29 — how far each traveler's things are packed.
 *
 * The axis is *for whom* (`assigned_traveler_id`), not *who packs*: it is the
 * one every mode has, Local Mode included, and the one the person facet
 * already filters on, so a tap on a traveler can reuse that filter instead of
 * adding a second one.
 *
 * Counted in the units of FR-25.22, so the travelers' shares and the shared
 * share add up to the trip line exactly. A row whose traveler is not on the
 * roster counts as shared rather than nowhere, which is what keeps that sum
 * true on a device that has not yet repointed it.
 */
import { unitsOf, type PackUnits } from './packState'
import type { Traveler } from '@/types/domain'

/** One traveler's share of the trip. */
export interface TravelerShare extends PackUnits {
  traveler: Traveler
}

/** Every traveler's share in roster order, and the rows that are for nobody. */
export interface TravelerProgress {
  travelers: TravelerShare[]
  shared: PackUnits
}

/** The fields of a trip row this reads. */
type ProgressRow = {
  assigned_traveler_id: string | null
  quantity: number
  packed_count: number
}

/**
 * How many travelers the strip lays out before folding the rest (FR-25.29):
 * two rows of three, the shape it is drawn for. Beyond it the last slot
 * becomes „+N weitere", so a large party never pushes the list down further.
 */
export const TRAVELER_FOLD_CAP = 6

/** Below this the split repeats the trip line, which already is the one traveler's. */
export const TRAVELER_PROGRESS_MIN = 2

/** Whether the trip has a split to show at all (FR-25.29). */
export function showsTravelerProgress(travelers: readonly Traveler[]): boolean {
  return travelers.length >= TRAVELER_PROGRESS_MIN
}

/** progressByTraveler splits the trip line into one share per traveler plus the shared rows. */
export function progressByTraveler(
  items: readonly ProgressRow[],
  travelers: readonly Traveler[],
): TravelerProgress {
  const byId = new Map<string, TravelerShare>(
    travelers.map((traveler) => [traveler.id, { traveler, done: 0, total: 0 }]),
  )
  const shared: PackUnits = { done: 0, total: 0 }

  for (const item of items) {
    const units = unitsOf(item)
    const share = (item.assigned_traveler_id && byId.get(item.assigned_traveler_id)) || shared
    share.done += units.done
    share.total += units.total
  }

  return { travelers: [...byId.values()], shared }
}

/** Something to pack, and all of it packed — nought of nought is not done. */
export function travelerDone(units: PackUnits): boolean {
  return units.total > 0 && units.done >= units.total
}

/** The share as a whole percentage, 0 when there is nothing to pack. */
export function travelerPercent(units: PackUnits): number {
  if (units.total <= 0) return 0
  return Math.round((units.done / units.total) * 100)
}

/** The strip's layout: who is drawn, and who sits behind „+N weitere". */
export interface FoldedTravelers {
  shown: TravelerShare[]
  hidden: TravelerShare[]
  /** Folded travelers who still have something open — the reason to unfold. */
  hiddenOpen: number
}

/**
 * foldTravelers keeps the strip to {@link TRAVELER_FOLD_CAP} slots. The order
 * is the roster's and never the progress's: a strip that re-sorted on every
 * tick would move a face out from under the thumb reaching for it.
 *
 * A traveler the list is filtered to is never folded away — the strip would
 * then hide the one face that explains why the list is short.
 */
export function foldTravelers(
  shares: readonly TravelerShare[],
  { expanded, selected }: { expanded: boolean; selected: readonly string[] },
): FoldedTravelers {
  const everyone = { shown: [...shares], hidden: [], hiddenOpen: 0 }
  if (expanded || shares.length <= TRAVELER_FOLD_CAP) return everyone

  const shown = shares.slice(0, TRAVELER_FOLD_CAP - 1)
  const hidden = shares.slice(TRAVELER_FOLD_CAP - 1)
  if (hidden.some((share) => selected.includes(share.traveler.id))) return everyone

  return {
    shown,
    hidden,
    hiddenOpen: hidden.filter((share) => share.total > 0 && !travelerDone(share)).length,
  }
}
