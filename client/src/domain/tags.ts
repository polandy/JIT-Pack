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

import type { CategorisedMasterItem, ItemTag, MasterItem, Tag } from '@/types/domain'

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
 * Each item's primary tag name, indexed by item id — the answer
 * {@link primaryTagOf} gives one item, for every item at once.
 *
 * Indexed in one pass over the assignments rather than by asking each item
 * for its tags: the readable per-item helpers each scan the whole assignment
 * list, which turns a whole-inventory question into items x assignments — and
 * the grouping below runs on every keystroke in the M9 search (NFR-4.3).
 * Ties on position fall to the lower id, exactly as tagsOfItem orders them.
 */
function primaryTagNames(assignments: ItemTag[], tags: Tag[]): Map<string, string> {
  const byId = new Map(tags.map((t) => [t.id, t]))

  const primaryAssignment = new Map<string, ItemTag>()
  for (const a of assignments) {
    if (!byId.has(a.tag_id)) continue // its tag is gone; not a heading
    const current = primaryAssignment.get(a.item_id)
    if (!current || byPositionThenId(a, current) < 0) primaryAssignment.set(a.item_id, a)
  }

  const names = new Map<string, string>()
  for (const [itemID, a] of primaryAssignment) {
    const name = byId.get(a.tag_id)?.name
    if (name !== undefined) names.set(itemID, name)
  }
  return names
}

/**
 * Every item's tag names, primary first, indexed by item id — for a caller
 * that needs the whole inventory's tags at once (FR-24.7, the M9 search).
 *
 * One pass over the assignments, for the reason {@link primaryTagNames}
 * gives: `tagsOfItem` per row turns a whole-inventory question into
 * items × assignments, and this one is asked on every keystroke (NFR-4.3).
 * An assignment whose tag is gone is skipped, exactly as `tagsOfItem` skips
 * it — a pull can deliver two tombstones in either order.
 */
export function tagNamesByItem(assignments: ItemTag[], tags: Tag[]): Map<string, string[]> {
  const byId = new Map(tags.map((t) => [t.id, t]))

  const ofItem = new Map<string, ItemTag[]>()
  for (const a of assignments) {
    if (!byId.has(a.tag_id)) continue
    const rows = ofItem.get(a.item_id)
    if (rows) rows.push(a)
    else ofItem.set(a.item_id, [a])
  }

  const names = new Map<string, string[]>()
  for (const [itemID, rows] of ofItem) {
    names.set(
      itemID,
      rows.sort(byPositionThenId).map((a) => byId.get(a.tag_id)!.name),
    )
  }
  return names
}

/**
 * The items, each carrying the grouping key a trip row snapshots (FR-24.2).
 *
 * The category *is* the primary tag's name — there is no column behind it
 * (see {@link CategorisedMasterItem}), and a caller that generates trip rows
 * has to be handed the answer rather than left to find it. Null where the
 * item carries no tag: the leftover bucket is a rendering decision, made by
 * whoever renders it, not a name written onto the row.
 */
export function withCategories(
  items: MasterItem[],
  assignments: ItemTag[],
  tags: Tag[],
): CategorisedMasterItem[] {
  const names = primaryTagNames(assignments, tags)
  return items.map((item) => ({ ...item, category_name: names.get(item.id) ?? null }))
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
  const primaryName = primaryTagNames(assignments, tags)

  const buckets = new Map<string, MasterItem[]>()
  for (const item of items) {
    const key = primaryName.get(item.id) ?? UNTAGGED_KEY
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

// --- FR-24.8: choosing tags without a swipe axis ----------------------------

/**
 * How several chosen tags combine (FR-24.8).
 *
 * `any` is the default and the one the old single-select axis approximated;
 * `all` is the question that axis could not ask at all — „Wandern *und*
 * Elektronisches".
 */
export type TagFilterMode = 'any' | 'all'

/**
 * How many of these items each tag holds, by tag id (FR-24.8).
 *
 * Counted over the items the caller passes rather than the whole inventory,
 * because M9 counts what it shows: a retired row is not in the list and must
 * not be in the number beside a chip. One pass over the assignments, for the
 * reason {@link tagNamesByItem} gives — this is asked on every render of the
 * chip row (NFR-4.3).
 */
export function tagCounts(items: MasterItem[], assignments: ItemTag[]): Map<string, number> {
  const present = new Set(items.map((item) => item.id))
  const counts = new Map<string, number>()
  for (const a of assignments) {
    if (!present.has(a.item_id)) continue
    counts.set(a.tag_id, (counts.get(a.tag_id) ?? 0) + 1)
  }
  return counts
}

/**
 * The tags the tool bar offers without opening anything (FR-24.8).
 *
 * Biggest first, because the chips are a shortcut and a shortcut to a tag
 * holding one item saves nobody anything. Ties fall to the axis order and
 * then to the name, so two devices offer the same three — a chip row that
 * reorders itself between devices is a control nobody learns.
 *
 * A tag holding nothing is left out entirely rather than offered at zero: it
 * would filter the list to an empty screen, which is a state to reach by
 * choice and not by shortcut.
 */
export function topTagsByCount(tags: Tag[], counts: Map<string, number>, limit: number): Tag[] {
  return tags
    .filter((tag) => (counts.get(tag.id) ?? 0) > 0)
    .sort(
      (a, b) =>
        (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
        a.sort_order - b.sort_order ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

/**
 * The items a tag selection leaves (FR-24.8).
 *
 * An empty selection narrows nothing. {@link UNTAGGED_KEY} may be a member of
 * the selection and means *carries no tag at all*: under `any` it widens the
 * result by the leftover bucket, and under `all` it contradicts every real
 * tag beside it and therefore yields nothing. That is the faithful reading
 * rather than a special case, and it is why the sheet keeps the bucket
 * exclusive — the empty screen is honest but useless, so the control does not
 * offer the way into it.
 *
 * Matching is on the item's **whole set**, not on its primary tag: the filter
 * reaches wider than the grouping, which is FR-24.2's rule and the only
 * reason a second tag is worth carrying.
 */
export function filterByTags(
  items: MasterItem[],
  assignments: ItemTag[],
  selection: readonly string[],
  mode: TagFilterMode,
): MasterItem[] {
  if (selection.length === 0) return items

  const wanted = new Set(selection)
  const untaggedWanted = wanted.delete(UNTAGGED_KEY)

  const ofItem = new Map<string, Set<string>>()
  for (const a of assignments) {
    const tags = ofItem.get(a.item_id)
    if (tags) tags.add(a.tag_id)
    else ofItem.set(a.item_id, new Set([a.tag_id]))
  }

  return items.filter((item) => {
    const tags = ofItem.get(item.id) ?? new Set<string>()
    const untagged = tags.size === 0
    if (wanted.size === 0) return untaggedWanted && untagged

    const hits = [...wanted].filter((id) => tags.has(id)).length
    const tagsMatch = mode === 'all' ? hits === wanted.size : hits > 0
    return mode === 'all'
      ? tagsMatch && (!untaggedWanted || untagged)
      : tagsMatch || (untaggedWanted && untagged)
  })
}
