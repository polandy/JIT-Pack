/**
 * Item tags (§3.24, FR-24.1/24.2) — pure, no I/O.
 *
 * An item carries a *set* of tags; the one at the lowest position is its
 * primary tag, the single key the grouped inventory files it under so a
 * row appears exactly once (FR-24.2). Living here rather than in M9 keeps
 * one ordering rule for the list grouping, the M10 chip row and anything
 * that later needs "which tag is this item filed under" — and keeps Local
 * Mode at feature parity (invariant 4).
 *
 * See ADR-014 for why the assignment is a row rather than a set on the item.
 */

import type { ItemTag, MasterItem, Tag } from '@/types/domain'

/**
 * Group key for items carrying no tag. Not a real tag: it is a leftover
 * bucket, which is why it sorts last regardless of the axis order.
 */
export const UNTAGGED_KEY = 'untagged'

/**
 * Order of two assignments of one item, primary first (FR-24.2).
 *
 * The position decides, and the assignment's own id breaks a tie. There is
 * a tie to break because nothing stops two rows sharing a position:
 * reordering N tags is N separate mutations, so the intermediate states are
 * legal on purpose (a UNIQUE would refuse the first half of every reorder
 * and, offline, lose it). Without the tie-break the answer came out of the
 * arrival order of the rows, so two devices could file the same item under
 * two different headings and neither was wrong.
 */
function byPositionThenId(a: ItemTag, b: ItemTag): number {
  return a.position - b.position || a.id.localeCompare(b.id)
}

/** This item's assignments, primary first. */
function assignmentsOf(itemId: string, assignments: ItemTag[]): ItemTag[] {
  return assignments.filter((a) => a.item_id === itemId).sort(byPositionThenId)
}

/**
 * The item's tags in position order, primary first. An assignment whose tag
 * has been deleted is skipped — a pull can deliver the two tombstones in
 * either order, and half a row is not something to render.
 */
export function tagsOfItem(itemId: string, assignments: ItemTag[], tags: Tag[]): Tag[] {
  const byId = new Map(tags.map((t) => [t.id, t]))
  return assignmentsOf(itemId, assignments)
    .map((a) => byId.get(a.tag_id))
    .filter((t): t is Tag => t !== undefined)
}

/** The item's primary tag (FR-24.2), or undefined when it carries none. */
export function primaryTagOf(itemId: string, assignments: ItemTag[], tags: Tag[]): Tag | undefined {
  return tagsOfItem(itemId, assignments, tags)[0]
}

/**
 * Items filed under their primary tag's name, groups ordered by the tag's
 * `sort_order` and items by name within each. Untagged items land in the
 * `UNTAGGED_KEY` bucket, which is present only when something is in it.
 */
export function groupByPrimaryTag(
  items: MasterItem[],
  assignments: ItemTag[],
  tags: Tag[],
): Map<string, MasterItem[]> {
  const byId = new Map(tags.map((t) => [t.id, t]))

  // Indexed in one pass over the assignments rather than by asking each item
  // for its tags: the readable per-item helpers each scan the whole
  // assignment list, which turns the grouping into items x assignments — and
  // this runs on every keystroke in the M9 search (NFR-4.3).
  // Ties on position fall to the lower id, exactly as tagsOfItem orders them.
  const primaryAssignment = new Map<string, ItemTag>()
  for (const a of assignments) {
    if (!byId.has(a.tag_id)) continue // its tag is gone; not a heading
    const current = primaryAssignment.get(a.item_id)
    if (!current || byPositionThenId(a, current) < 0) primaryAssignment.set(a.item_id, a)
  }

  const buckets = new Map<string, MasterItem[]>()
  for (const item of items) {
    const primary = primaryAssignment.get(item.id)
    const key = (primary && byId.get(primary.tag_id)?.name) ?? UNTAGGED_KEY
    const bucket = buckets.get(key) ?? []
    bucket.push(item)
    buckets.set(key, bucket)
  }

  const rank = new Map<string, number>()
  for (const tag of byId.values()) rank.set(tag.name, tag.sort_order)

  const ordered = new Map<string, MasterItem[]>()
  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === UNTAGGED_KEY) return 1
    if (b === UNTAGGED_KEY) return -1
    const byRank = (rank.get(a) ?? 0) - (rank.get(b) ?? 0)
    return byRank !== 0 ? byRank : a.localeCompare(b)
  })
  for (const key of keys) {
    ordered.set(
      key,
      buckets.get(key)!.sort((a, b) => a.name.localeCompare(b.name)),
    )
  }
  return ordered
}
