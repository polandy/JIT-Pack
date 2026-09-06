/**
 * What M10's two pickers offer, and where each stops offering (UX-14).
 *
 * Both are the same shape — a pool, minus what is already chosen, minus what
 * the query rules out, cut off at a cap — and both lived inline in
 * `ItemEditorPage.vue`, which is one of the three largest views and has no
 * component test. The caps in particular were a bare `8` and a bare `10`
 * decided in different months for the same reason (§4a).
 */

/** A row either picker can offer: an id and the name it is matched on. */
export interface Offerable {
  id: string
  name: string
}

/**
 * With no query the tag row is a shelf, not the whole vocabulary: a grown
 * instance carries dozens of tags, and rendering them all made every item
 * form scroll. Two chip rows at phone width; the tail names the rest.
 */
export const TAG_OFFER_CAP = 8

/** The dependency picker's pool is a search box's result list, not a shelf. */
export const DEPENDENCY_OFFER_CAP = 10

/** The tag shelf's whole state, from the pool and what the user has typed. */
export interface TagOffer<T extends Offerable> {
  /** What the shelf renders — capped only while nothing is being searched. */
  matches: T[]
  /** What the cap holds back; zero while a query is filtering. */
  hiddenCount: number
  /** Whether the typed name is new, and the ＋ offer is worth showing. */
  canCreate: boolean
}

/**
 * The unassigned tags to offer for a query.
 *
 * The cap applies to the browsing case only: once the user has typed, the
 * shelf is no longer a shelf and hiding a match behind a cap would look like
 * the tag does not exist. `canCreate` is false for a name that already exists
 * whether or not this item carries it — offering to create a duplicate is the
 * one answer that cannot be right.
 */
export function tagOffer<T extends Offerable>(
  tags: T[],
  assignedIds: ReadonlySet<string>,
  query: string,
): TagOffer<T> {
  const q = query.trim().toLowerCase()
  const unassigned = tags.filter(
    (tag) => !assignedIds.has(tag.id) && (!q || tag.name.toLowerCase().includes(q)),
  )
  const matches = q ? unassigned : unassigned.slice(0, TAG_OFFER_CAP)
  return {
    matches,
    hiddenCount: unassigned.length - matches.length,
    canCreate: q !== '' && !tags.some((tag) => tag.name.toLowerCase() === q),
  }
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
