/**
 * Chip suggestions for the empty quick-add composer (FR-25.13c).
 *
 * The composer's autocomplete answers "I know what I want to type"; this
 * chip row answers the more common authoring posture on a phone — "offer me
 * something to tap": recently used items from the device-local trail
 * (`local/quickAddRecents`).
 *
 * **What is already chosen is never offered** (owner directive 2026-08-21)
 * — a chip that could only earn a duplicate report is noise, not an offer.
 *
 * Pure and client-side like every other suggestion rule (CLAUDE.md
 * invariant 4): the caller passes the inventory and the recents trail in.
 */

import type { MasterItem } from '@/types/domain'

/**
 * Chips per row. Wider than the autocomplete's five rows because chips wrap
 * in two dimensions and no soft keyboard sits under them — but still a cap:
 * the row is an offer, not the inventory browser (that is the FR-25.13d
 * picker sheet).
 */
export const CHIP_ROW_MAX = 6

export interface ChipSuggestions {
  /** The recents trail, newest first, minus chosen ones. */
  recent: MasterItem[]
}

/** chipSuggestions builds the recent-items chip row for one composer scope. */
export function chipSuggestions(opts: {
  items: MasterItem[]
  /** Item ids the scope already carries — hidden from the row. */
  chosenItemIds: Iterable<string>
  /** Device-local recents, newest first; unknown ids are dropped. */
  recentItemIds: string[]
  maxPerRow?: number
}): ChipSuggestions {
  const max = opts.maxPerRow ?? CHIP_ROW_MAX
  const chosen = new Set(opts.chosenItemIds)
  const byId = new Map(opts.items.map((item) => [item.id, item]))

  const recent: MasterItem[] = []
  for (const id of opts.recentItemIds) {
    if (recent.length >= max) break
    if (chosen.has(id)) continue
    const item = byId.get(id)
    if (item) recent.push(item)
  }

  return { recent }
}
