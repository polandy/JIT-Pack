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

// --- FR-24.9: acting on several items at once -------------------------------

/**
 * The position that makes an assignment the item's primary tag (FR-24.2).
 *
 * One less than the lowest it currently holds, rather than `0` with the
 * others shifted: positions are not reindexed anywhere, N tags are N separate
 * mutations, and ties fall to the lower assignment id — so the cheapest
 * correct move is a single write that lands below every sibling. Negative
 * positions are legal for the same reason: nothing reads a position except
 * this ordering.
 */
export function primaryPosition(itemId: string, assignments: ItemTag[]): number {
  const positions = assignments.filter((a) => a.item_id === itemId).map((a) => a.position)
  return positions.length === 0 ? 0 : Math.min(...positions) - 1
}

/** One item's assignment of one tag, or `undefined` when it carries none. */
export function assignmentOf(
  itemId: string,
  tagId: string,
  assignments: ItemTag[],
): ItemTag | undefined {
  return assignments.find((a) => a.item_id === itemId && a.tag_id === tagId)
}

/**
 * What giving `tagId` to these items actually writes (FR-24.9).
 *
 * Three groups, because a bulk action over a mixed selection has three cases
 * and reporting them as one number is how a batch lies: the items that do not
 * carry the tag (an insert each), the ones that carry it but not first (a
 * position each, only when the caller asked for primary), and the ones
 * already as the caller wants them — which are *not* rewritten, so a second
 * press of the same button is a no-op rather than a second row.
 */
export interface TagGrant {
  /** Items with no assignment of this tag yet. */
  missing: MasterItem[]
  /** Items carrying it behind another tag — only interesting for `primary`. */
  demoted: { item: MasterItem; assignment: ItemTag }[]
  /** Items already carrying it, and already first where that was asked. */
  settled: MasterItem[]
}

export function planTagGrant(
  items: MasterItem[],
  assignments: ItemTag[],
  tagId: string,
  primary: boolean,
): TagGrant {
  const grant: TagGrant = { missing: [], demoted: [], settled: [] }
  for (const item of items) {
    const own = assignments.filter((a) => a.item_id === item.id).sort(byPositionThenId)
    const mine = own.find((a) => a.tag_id === tagId)
    if (!mine) grant.missing.push(item)
    else if (primary && own[0]!.id !== mine.id) grant.demoted.push({ item, assignment: mine })
    else grant.settled.push(item)
  }
  return grant
}

/**
 * The assignments taking `tagId` away from these items writes off (FR-24.9).
 *
 * An item that does not carry the tag contributes nothing, so „take Sommer
 * away" over a mixed selection is not an error — it is a smaller batch.
 */
export function planTagRemoval(
  items: MasterItem[],
  assignments: ItemTag[],
  tagId: string,
): ItemTag[] {
  const wanted = new Set(items.map((item) => item.id))
  return assignments.filter((a) => a.tag_id === tagId && wanted.has(a.item_id))
}

/**
 * The tags these items carry between them — what „take a tag away" may offer.
 *
 * The caller's order is kept rather than re-derived: M9 passes the store's
 * `tagList`, which is the axis order, and sorting again here would be a
 * second opinion about an order that already has one.
 */
export function tagsOfItems(items: MasterItem[], assignments: ItemTag[], tags: Tag[]): Tag[] {
  const wanted = new Set(items.map((item) => item.id))
  const carried = new Set(assignments.filter((a) => wanted.has(a.item_id)).map((a) => a.tag_id))
  return tags.filter((tag) => carried.has(tag.id))
}

// --- FR-24.10: managing the tags themselves ---------------------------------
//
// Until now a tag could only be created (M10, ADR-014) and given away
// (FR-24.9). The four acts below are the other half: rename, merge, reorder
// and delete. A **rename** is not here because it already has a rule —
// `tags.name` is the third `UNIQUE (name)` space beside Vorlagen and series,
// so `nameCollision.findNameCollision` is what answers it, and writing a
// second fold for it is the drift that file exists to prevent.

/** The tag is removed outright — nothing carries it. */
export const TAG_DELETE_ALLOWED = 'allowed'
/** The tag stays — items carry it, and merging is the way out (ADR-063). */
export const TAG_DELETE_REFUSED = 'refused'

/** Which answer a tag delete gets (FR-24.10). */
export type TagDeletionKind = typeof TAG_DELETE_ALLOWED | typeof TAG_DELETE_REFUSED

/** The answer, and the count the confirm needs to explain it. */
export interface TagDeletion {
  kind: TagDeletionKind
  /** How many items carry the tag — 0 exactly when the delete is allowed. */
  references: number
}

/**
 * Whether this tag can be deleted, and what carries it (FR-24.10, ADR-063).
 *
 * Deliberately **not** FR-24.3's retire/remove pair. A retired *item* has to
 * keep resolving for archived trips, so the row survives; a tag resolves for
 * nothing — no trip row, no template position and no analytic reads `tags`,
 * because FR-24.2 snapshots the primary tag's *name* onto the trip row at
 * generation. So there is nothing for a tombstone to break and nothing for a
 * retired row to keep alive. What a cascade *would* break is the living
 * inventory: `item_tags.tag_id` is `ON DELETE CASCADE`, so deleting a used
 * tag silently strips it from every item, and each item whose primary tag it
 * was falls into the leftover bucket. Refusing while it is in use is what
 * makes {@link planTagMerge} the way out, and a merge is what „49 items in
 * Diverses" actually needs.
 */
export function tagDeletion(tagId: string, assignments: ItemTag[]): TagDeletion {
  const references = assignments.filter((a) => a.tag_id === tagId).length
  return { kind: references > 0 ? TAG_DELETE_REFUSED : TAG_DELETE_ALLOWED, references }
}

/** An assignment and the position it is to be written at. */
export interface PositionedAssignment {
  assignment: ItemTag
  position: number
}

/**
 * What merging one tag into another writes (FR-24.10).
 *
 * Three groups, like {@link planTagGrant}, because the same item can be in
 * any of them and one number would hide it:
 *
 * - `repoint` — the item carries the source and not the target, so the
 *   existing assignment simply changes which tag it names. One write, not a
 *   delete and an insert: the pairing is all the row is, so tearing it down
 *   would put a tombstone in the feed for something that was never removed
 *   (ADR-052), and re-inserting would lose the position the item was filed at.
 * - `drop` — the item carries **both**, and `UNIQUE (item_id, tag_id)` means
 *   the source cannot be re-pointed onto a row that already exists.
 * - `promote` — the half of `drop` that would otherwise change what the item
 *   is filed under. FR-24.2 groups by the *lowest* position, so an item whose
 *   primary tag was the source must have the surviving target inherit that
 *   position; without it the merge would move items into a different heading
 *   than either tag, which is the exact failure the feature exists to fix.
 */
export interface TagMerge {
  repoint: PositionedAssignment[]
  drop: ItemTag[]
  promote: PositionedAssignment[]
}

export function planTagMerge(sourceId: string, targetId: string, assignments: ItemTag[]): TagMerge {
  const plan: TagMerge = { repoint: [], drop: [], promote: [] }
  if (sourceId === targetId) return plan

  const targetOf = new Map<string, ItemTag>()
  for (const a of assignments) if (a.tag_id === targetId) targetOf.set(a.item_id, a)

  for (const source of assignments) {
    if (source.tag_id !== sourceId) continue
    const target = targetOf.get(source.item_id)
    if (!target) {
      plan.repoint.push({ assignment: source, position: source.position })
      continue
    }
    plan.drop.push(source)
    if (source.position < target.position) {
      plan.promote.push({ assignment: target, position: source.position })
    }
  }
  return plan
}

/** A tag and the axis number it is to be written at (FR-24.10). */
export interface TagOrdering {
  tagId: string
  sortOrder: number
}

/**
 * The writes that move the tag at `from` to `to` on the axis (FR-24.10).
 *
 * The whole axis is renumbered `0…N-1` from the order the user is *looking
 * at*, and only the tags whose number actually changes are returned. Two
 * reasons for renumbering rather than slotting the moved tag between its new
 * neighbours: `sort_order` is an integer with no room between adjacent
 * values, and the axis routinely arrives flat — `createTag` has always taken
 * `tagList.length`, but a restore and the dev seed both produce all-zero
 * orders, and against those a gap-insertion move is a write that changes
 * nothing visible. Diffing afterwards is what keeps the cost at the few rows
 * that moved instead of all N.
 *
 * An index outside the axis writes nothing: a drag that ended nowhere is not
 * an ordering, and clamping it would silently move a tag the user did not
 * point at.
 */
export function planTagReorder(tags: Tag[], from: number, to: number): TagOrdering[] {
  if (from < 0 || to < 0 || from >= tags.length || to >= tags.length) return []

  const ordered = [...tags]
  const [moved] = ordered.splice(from, 1)
  ordered.splice(to, 0, moved!)

  const writes: TagOrdering[] = []
  ordered.forEach((tag, index) => {
    if (tag.sort_order !== index) writes.push({ tagId: tag.id, sortOrder: index })
  })
  return writes
}
