/**
 * The item's rear-view: where it is used, and what people said about it.
 *
 * Two pure aggregations behind M10's FR-27.8 and FR-27.9 sections. Both are
 * computed over rows the device already holds — invariant 4, so Local Mode
 * keeps them, and the M12 honesty rule: what a device has not synced it
 * cannot report, and the surface says so rather than pretending completeness.
 */

/** A template position, reduced to what containment needs. */
export interface PositionRef {
  template_id: string
  item_id: string
}

/** A template, reduced to what the row renders. */
export interface TemplateRef {
  id: string
  name: string
  kind: string
  /** FR-24.3: an RFC3339 stamp once a delete retired it, absent while active. */
  retired_at?: string | null
}

/** One row of M10's „Enthalten in" section (FR-27.8). */
export interface Containment {
  templateId: string
  templateName: string
  /** The scope chip — a Ferien-Vorlage reads differently from a group. */
  kind: string
  /** How many positions of this template name the item. */
  positions: number
  /** FR-24.3: the row is hidden from pickers but still holds the item. */
  retired: boolean
}

/**
 * Every template holding the item as one of its own positions (FR-27.8).
 *
 * **Own positions only, deliberately.** This is the navigable counterpart to
 * the FR-2.4 usage count, whose template half counts exactly these rows — a
 * list that also walked includes would answer a different question than the
 * number it sits under. A Vorlage that reaches the item through a group is
 * one tap further on, from that group's own row.
 *
 * Sorted by name, so the list does not reorder when a template is renamed
 * somewhere else.
 *
 * **A retired template is on the list, and says so.** This is the *reference*
 * question, and FR-24.3 retires an item precisely because a retired Vorlage
 * still holds it — the delete card's count reads the complete list for that
 * reason (ADR-032), so a list that dropped retired rows would be shorter than
 * the number it sits directly above.
 */
export function containingTemplates(
  itemId: string,
  templates: readonly TemplateRef[],
  positions: readonly PositionRef[],
): Containment[] {
  const counts = new Map<string, number>()
  for (const position of positions) {
    if (position.item_id !== itemId) continue
    counts.set(position.template_id, (counts.get(position.template_id) ?? 0) + 1)
  }
  return templates
    .filter((template) => counts.has(template.id))
    .map((template) => ({
      templateId: template.id,
      templateName: template.name,
      kind: template.kind,
      positions: counts.get(template.id)!,
      retired: template.retired_at != null,
    }))
    .sort((a, b) => a.templateName.localeCompare(b.templateName))
}

/** A trip row, reduced to the link between a comment and a master item. */
export interface TripItemRef {
  id: string
  source_item_id: string | null
}

/** A comment, reduced to what the aggregated view renders. */
export interface CommentRef {
  id: string
  trip_item_id: string | null
  author_id: string
  body: string
  created_at: string | null
}

/** One trip's contribution: its name and the rows and comments it holds. */
export interface TripComments {
  tripId: string
  tripName: string
  items: readonly TripItemRef[]
  comments: readonly CommentRef[]
}

/** One line of M10's „Kommentare aus Reisen" section (FR-27.9). */
export interface ItemComment {
  commentId: string
  tripId: string
  tripName: string
  authorId: string
  body: string
  createdAt: string | null
}

/**
 * Every comment written on a packing row generated from this item, across the
 * trips the device holds, newest first (FR-27.9).
 *
 * The join is `comments.trip_item_id → trip_items.id → source_item_id`, which
 * is why an **ad-hoc** row's comments never appear: a row typed into the
 * quick-add has no source item until it exists in the inventory, and inventing
 * a match by name would put somebody else's remark on this item.
 *
 * A comment with no timestamp sorts last rather than first. `created_at` is
 * nullable in the schema, and treating an absent stamp as the epoch would put
 * the one row nobody can date at the bottom of a list that is read from the
 * top; treating it as *now* would put it on top. Last, and the row says the
 * date is unknown.
 */
export function commentsOnItem(itemId: string, trips: readonly TripComments[]): ItemComment[] {
  const out: ItemComment[] = []
  for (const trip of trips) {
    const rows = new Set(
      trip.items.filter((item) => item.source_item_id === itemId).map((item) => item.id),
    )
    if (rows.size === 0) continue
    for (const comment of trip.comments) {
      if (comment.trip_item_id === null || !rows.has(comment.trip_item_id)) continue
      out.push({
        commentId: comment.id,
        tripId: trip.tripId,
        tripName: trip.tripName,
        authorId: comment.author_id,
        body: comment.body,
        createdAt: comment.created_at,
      })
    }
  }
  return out.sort((a, b) => {
    if (a.createdAt === b.createdAt) return 0
    if (a.createdAt === null) return 1
    if (b.createdAt === null) return -1
    return b.createdAt.localeCompare(a.createdAt)
  })
}
