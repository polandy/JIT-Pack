/**
 * Repack planning (FR-11.1/11.2) — pure, no I/O. Return Packing Mode
 * resets packed PACK items to Open; consumables (FR-1.7, looked up on
 * the master item) and locally bought items stay packed by default,
 * each overridable per item in the M13 entry dialog.
 */

import type { TripItem } from '@/types/domain'

export interface RepackExclusion {
  item: TripItem
  reason: 'consumable' | 'buy_local'
}

export interface RepackPlan {
  /** Reset to Open for the return leg. */
  reset: TripItem[]
  /** Would be reset but excluded by FR-11.2 (override possible). */
  excluded: RepackExclusion[]
  /** Nothing to do (not packed, skipped). */
  untouched: TripItem[]
}

export function planRepack(
  items: TripItem[],
  isConsumable: (sourceItemId: string | null) => boolean,
): RepackPlan {
  const plan: RepackPlan = { reset: [], excluded: [], untouched: [] }
  for (const item of items) {
    if (item.packed_count === 0 || item.state === 'skipped') {
      plan.untouched.push(item)
    } else if (item.mode === 'buy_local') {
      plan.excluded.push({ item, reason: 'buy_local' })
    } else if (isConsumable(item.source_item_id)) {
      plan.excluded.push({ item, reason: 'consumable' })
    } else {
      plan.reset.push(item)
    }
  }
  return plan
}
