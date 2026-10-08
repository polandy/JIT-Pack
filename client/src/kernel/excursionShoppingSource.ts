/**
 * An excursion's vor-Ort lines as a source of M6's Vor-Ort list (FR-31.8).
 *
 * The packing side of the contract in `kernel/shoppingSources.ts`, beside
 * `packingShoppingSource.ts` and for its reason: a projection of the line,
 * never a copy on the shopping list. Buying one stamps the line's
 * `bought_at` — it stays on the excursion's list, still to be put in the
 * rucksack — and putting it back clears the stamp. Only the Vor-Ort list:
 * an excursion is on the road, never before departure.
 */
import type { ShoppingLine, ShoppingSource } from '@/kernel/shoppingSources'
import { isOpenPurchase } from '@/domain/excursionLines'
import type { Excursion, ExcursionItem, ShoppingMode, Traveler } from '@/types/domain'
import { ITEM_MODE_BUY_LOCAL, STATE_SKIPPED } from '@/types/domain'
import { t } from '@/i18n'

/** What the source reads off the trip store — and nothing else. */
export interface ExcursionShoppingReads {
  getExcursions(tripId: string): Excursion[]
  getExcursionItems(tripId: string): ExcursionItem[]
  getTravelers(tripId: string): Traveler[]
}

/** The one write a check-off means (FR-31.8). */
export interface ExcursionShoppingWrites {
  markBought(line: ExcursionItem, bought: boolean): void
  /** FR-30.13: the line's place on M6's Vor-Ort list. */
  placeLineOnShopping(line: ExcursionItem, position: number): void
}

/** The key prefix that keeps an excursion line apart from every other source's. */
const LINE_KEY_PREFIX = 'excursion:'

export function createExcursionShoppingSource(
  reads: ExcursionShoppingReads,
  writes: ExcursionShoppingWrites,
): ShoppingSource {
  function linesOf(tripId: string, lines: ExcursionItem[], bought: boolean): ShoppingLine[] {
    const excursions = new Map(reads.getExcursions(tripId).map((e) => [e.id, e]))
    const travelers = new Map(reads.getTravelers(tripId).map((tr) => [tr.id, tr]))
    return lines.map((line) => {
      const who = line.assigned_traveler_id ? travelers.get(line.assigned_traveler_id) : undefined
      return {
        key: LINE_KEY_PREFIX + line.id,
        name: line.name,
        quantity: line.quantity,
        recipients: who ? [{ id: who.id, name: who.name }] : [],
        // M6 files it under the outing it is bought for, which is how it is
        // looked for at the kiosk — not under the packing list's heading.
        section: excursions.get(line.excursion_id)?.name ?? null,
        boughtNote: bought ? t('excursions.bought') : undefined,
        boughtAt: bought ? line.bought_at : undefined,
        boughtBy: bought ? null : undefined,
        buy: () => writes.markBought(line, true),
        unbuy: () => writes.markBought(line, false),
        position: line.shopping_position,
        place: (position) => writes.placeLineOnShopping(line, position),
      }
    })
  }

  return {
    open(tripId, list: ShoppingMode) {
      if (list !== ITEM_MODE_BUY_LOCAL) return []
      return linesOf(tripId, reads.getExcursionItems(tripId).filter(isOpenPurchase), false)
    },
    bought(tripId, list: ShoppingMode) {
      if (list !== ITEM_MODE_BUY_LOCAL) return []
      return linesOf(
        tripId,
        reads
          .getExcursionItems(tripId)
          .filter(
            (l) =>
              l.mode === ITEM_MODE_BUY_LOCAL && l.bought_at !== null && l.state !== STATE_SKIPPED,
          ),
        true,
      )
    },
  }
}
