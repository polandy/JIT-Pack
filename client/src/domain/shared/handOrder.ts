/**
 * A hand-set order inside one group — where a person put a shopping line
 * (FR-30.13) or a task (FR-7.17). Both features read it, so the shopping
 * module may name this file (`scripts/module-boundary-gate.mjs`).
 *
 * A position is an integer compared only inside one group, and `null` is
 * „never placed". The rules (ADR-083):
 *
 *  - **Never placed reads first, in the order the group already had**, and
 *    everything placed follows by its number. A list nobody has touched keeps
 *    the order it always had, and a new thing given the next number lands at
 *    the end.
 *  - **A move renumbers the whole group `0…n-1`** from the order on screen,
 *    and writes only what changed — the tag manager's rule (FR-24.10): an
 *    integer has no room between neighbours, and the first move into a group
 *    of never-placed rows has to place all of them anyway.
 *
 * Pure, no Vue: the screens hand in the group and read back the writes.
 */

/** A thing's place in its group; null or absent for never placed. */
export type HandPosition = number | null | undefined

/**
 * byHand reads a group in its hand order: the never-placed things first, in
 * the order they came in, then the placed ones by their number. Stable, so
 * two things at one number — two devices that each placed a row there —
 * keep the order they came in too.
 */
export function byHand<T>(items: readonly T[], positionOf: (item: T) => HandPosition): T[] {
  const rank = (item: T) => positionOf(item) ?? Number.NEGATIVE_INFINITY
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * The number a new thing takes so that it stands after everything already
 * placed — at the end of whichever group it is filed in, since a group never
 * holds a number higher than the highest of all of them.
 */
export function nextPosition(positions: Iterable<HandPosition>): number {
  let highest = -1
  for (const position of positions) {
    if (position !== null && position !== undefined && position > highest) highest = position
  }
  return highest + 1
}

/**
 * The order a group reads in once `moved` is let go in gap `gap` of what the
 * screen shows of it — or null where the drop moves nothing.
 *
 * `group` is the whole group in reading order; `shown` is what the screen
 * draws of it, in the same order, and may be fewer — a filter, or the rows
 * the *Fällig* block holds above. The gap counts rows of `shown` (0 before the
 * first, `shown.length` after the last), so the drop lands next to the row
 * the finger was next to, and a row the screen did not draw keeps its place
 * relative to its neighbours. `moved` may come from another group, and then
 * is not in `group` at all.
 */
export function dropInto<T>(
  group: readonly T[],
  shown: readonly T[],
  moved: T,
  gap: number,
  same: (a: T, b: T) => boolean,
): T[] | null {
  const rest = group.filter((item) => !same(item, moved))
  const shownIndex = shown.findIndex((item) => same(item, moved))
  const shownRest = shown.filter((item) => !same(item, moved))
  const at = shownIndex !== -1 && shownIndex < gap ? gap - 1 : gap

  let insertAt: number
  if (at < shownRest.length) {
    const before = shownRest[Math.max(0, at)]!
    insertAt = rest.findIndex((item) => same(item, before))
  } else {
    const after = shownRest[shownRest.length - 1]
    insertAt = after === undefined ? rest.length : rest.findIndex((item) => same(item, after)) + 1
  }
  if (insertAt === -1) insertAt = rest.length

  const ordered = [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)]
  const unchanged =
    ordered.length === group.length && ordered.every((item, index) => same(item, group[index]!))
  return unchanged ? null : ordered
}

/** One write of a renumbering: the thing, and the number it is to stand at. */
export interface Placement<T> {
  item: T
  position: number
}

/**
 * The writes that make `ordered` read `0…n-1` — only the things whose number
 * actually changes, so a move near the end of a placed group costs a write
 * or two, not the whole group.
 */
export function renumber<T>(
  ordered: readonly T[],
  positionOf: (item: T) => HandPosition,
): Placement<T>[] {
  const writes: Placement<T>[] = []
  ordered.forEach((item, position) => {
    if (positionOf(item) !== position) writes.push({ item, position })
  })
  return writes
}
