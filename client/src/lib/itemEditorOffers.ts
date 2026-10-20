/**
 * What M10's two pickers offer, and where each stops offering (FR-24.1, FR-20.1).
 *
 * Both start from the same shape — a pool, minus what is already chosen, minus
 * what the query rules out. The tag shelf offers all of it and lets the form
 * fold it to a few lines; the dependency picker is a result list cut off at a
 * cap. Each limit is a named constant for its own reason (§4a).
 */

/** A row either picker can offer: an id and the name it is matched on. */
export interface Offerable {
  id: string
  name: string
}

/**
 * The lines of tag chips a folded shelf shows. A grown instance carries dozens
 * of tags, and all of them open would push the rest of every item form down
 * the page; two lines at phone width keep the fields below in view, and one
 * tap opens the rest without typing.
 */
export const TAG_SHELF_ROWS = 2

/** Within this many pixels two chips' top edges are the same line. */
const SAME_LINE_PX = 1

/** The dependency picker's pool is a search box's result list, not a shelf. */
export const DEPENDENCY_OFFER_CAP = 10

/** The tag shelf's whole state, from the pool and what the user has typed. */
export interface TagOffer<T extends Offerable> {
  /** Every unassigned tag the query lets through, in the pool's order. */
  matches: T[]
  /** Whether the typed name is new, and the ＋ offer is worth showing. */
  canCreate: boolean
}

/**
 * The unassigned tags to offer for a query.
 *
 * Never cut off: a tag the shelf did not offer could only be found by typing
 * its name, and picking from the whole vocabulary is the point of the shelf.
 * `canCreate` is false for a name that already exists
 * whether or not this item carries it — offering to create a duplicate is the
 * one answer that cannot be right.
 */
export function tagOffer<T extends Offerable>(
  tags: T[],
  assignedIds: ReadonlySet<string>,
  query: string,
): TagOffer<T> {
  const q = query.trim().toLowerCase()
  const matches = tags.filter(
    (tag) => !assignedIds.has(tag.id) && (!q || tag.name.toLowerCase().includes(q)),
  )
  return {
    matches,
    canCreate: q !== '' && !tags.some((tag) => tag.name.toLowerCase() === q),
  }
}

/**
 * How many leading chips of a wrapped row sit on its first `rows` lines, given
 * each chip's top edge in document order. Measured rather than counted,
 * because how many tags fit on a line depends on their names and the width.
 */
export function chipsWithinRows(tops: readonly number[], rows: number): number {
  let lines = 0
  let lineTop = Number.NEGATIVE_INFINITY
  for (const [index, top] of tops.entries()) {
    if (top > lineTop + SAME_LINE_PX) {
      lines += 1
      lineTop = top
      if (lines > rows) return index
    }
  }
  return tops.length
}

/**
 * FR-20.1's pickable mains: the pool minus this item itself — depending on
 * yourself is the cycle the domain rejects, so it is never offered — and
 * minus the ones already depended on.
 */
export function dependencyOffer<T extends Offerable>(
  pool: T[],
  options: { excludeId?: string; takenIds: ReadonlySet<string> },
): T[] {
  return pool
    .filter((row) => row.id !== options.excludeId && !options.takenIds.has(row.id))
    .slice(0, DEPENDENCY_OFFER_CAP)
}
