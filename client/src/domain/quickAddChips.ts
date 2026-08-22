/**
 * Chip suggestions for the empty quick-add composer (FR-25.13c).
 *
 * The composer's autocomplete answers "I know what I want to type"; these
 * chips answer the more common authoring posture on a phone — "offer me
 * something to tap". Two rows: items *related* to what the scope already
 * carries (same primary tag, FR-24.2), and *recently used* items from the
 * device-local trail (`local/quickAddRecents`).
 *
 * One rule shapes both rows: **what is already chosen is never offered**
 * (owner directive 2026-08-21) — a chip that could only earn a duplicate
 * report is noise, not an offer.
 *
 * Pure and client-side like every other suggestion rule (CLAUDE.md
 * invariant 4): the caller passes the inventory and lookups in.
 */

import type { MasterItem, Tag } from '@/types/domain'

/**
 * Chips per row. Wider than the autocomplete's five rows because chips wrap
 * in two dimensions and no soft keyboard sits under them — but still a cap:
 * the rows are an offer, not the inventory browser (that is the planned
 * Ausbaustufe, the FR-25.13d picker sheet).
 */
export const CHIP_ROW_MAX = 6

export interface ChipSuggestions {
  /** The tags that contributed at least one related chip, in tag order. */
  relatedTags: Tag[]
  /** Items sharing a chosen item's primary tag, alphabetical. */
  related: MasterItem[]
  /** The recents trail, newest first, minus chosen and related ones. */
  recent: MasterItem[]
}

/** chipSuggestions builds the two chip rows for one composer scope. */
export function chipSuggestions(opts: {
  items: MasterItem[]
  /** Item ids the scope already carries — context for `related`, hidden everywhere. */
  chosenItemIds: Iterable<string>
  /** Device-local recents, newest first; unknown ids are dropped. */
  recentItemIds: string[]
  /** The FR-24.2 primary tag of an item, or undefined when it has none. */
  primaryTagOf: (itemId: string) => Tag | undefined
  maxPerRow?: number
}): ChipSuggestions {
  const max = opts.maxPerRow ?? CHIP_ROW_MAX
  const chosen = new Set(opts.chosenItemIds)

  const contextTagIds = new Set<string>()
  for (const id of chosen) {
    const tag = opts.primaryTagOf(id)
    if (tag) contextTagIds.add(tag.id)
  }

  const related = opts.items
    .filter((item) => {
      if (chosen.has(item.id)) return false
      const tag = opts.primaryTagOf(item.id)
      return tag !== undefined && contextTagIds.has(tag.id)
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, max)

  // Named from the chips actually shown, not from the context: a tag whose
  // every item is already chosen would otherwise head a row it is absent from.
  const contributed = new Map<string, Tag>()
  for (const item of related) {
    const tag = opts.primaryTagOf(item.id)
    if (tag) contributed.set(tag.id, tag)
  }
  const relatedTags = [...contributed.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )

  const byId = new Map(opts.items.map((item) => [item.id, item]))
  const shown = new Set(related.map((item) => item.id))
  const recent: MasterItem[] = []
  for (const id of opts.recentItemIds) {
    if (recent.length >= max) break
    if (chosen.has(id) || shown.has(id)) continue
    const item = byId.get(id)
    if (item) recent.push(item)
  }

  return { relatedTags, related, recent }
}
