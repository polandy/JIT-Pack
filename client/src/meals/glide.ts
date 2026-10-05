/**
 * FR-33.15: the plan closes up and opens out smoothly around a meal in the
 * air — the free days opening into rows when it is lifted, closing again
 * when it is let go, the meal sliding from the drop point into its new day.
 * A FLIP: where every keyed block stood is read before the change, where it
 * stands after, and each slides the difference back to nothing.
 *
 * Its own small helper rather than M6's or M25's, because only this plan
 * re-lays itself while something is in the air: their groups exist the whole
 * time, these free days only during the drag.
 */

/** The attribute a block is keyed by: `day:<date>` or `meal:<id>`. */
export const GLIDE_ATTRIBUTE = 'data-glide'

/** How long a block takes to slide into place. */
export const GLIDE_MS = 260

/** A slide's easing: fast out, settling softly. */
const GLIDE_EASING = 'cubic-bezier(.2, .8, .2, 1)'

/** Below this many pixels a block counts as standing still. */
const STILL_PX = 0.5

/**
 * Where each block slides from, relative to where it now stands: a number of
 * pixels, `'enter'` for a top-level block that was not there before (it fades
 * in), nothing for one that stays. A block inside another (`parents`) slides
 * only its own way — its parent already carries it the rest — and one new to
 * the screen inside its parent simply stands, since the parent shows it.
 */
export function glideOffsets(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  parents: ReadonlyMap<string, string>,
): Map<string, number | 'enter'> {
  const offsets = new Map<string, number | 'enter'>()
  const own = (key: string): number => {
    const was = before.get(key)
    const now = after.get(key)
    return was === undefined || now === undefined ? 0 : was - now
  }
  for (const key of after.keys()) {
    const parent = parents.get(key)
    if (!before.has(key)) {
      if (parent === undefined) offsets.set(key, 'enter')
      continue
    }
    const offset = own(key) - (parent === undefined ? 0 : own(parent))
    if (Math.abs(offset) > STILL_PX) offsets.set(key, offset)
  }
  return offsets
}

/** Where every keyed block under `root` stands now, by its key. */
export function snapshot(root: ParentNode): Map<string, number> {
  const tops = new Map<string, number>()
  for (const el of root.querySelectorAll<HTMLElement>(`[${GLIDE_ATTRIBUTE}]`)) {
    tops.set(el.getAttribute(GLIDE_ATTRIBUTE)!, el.getBoundingClientRect().top)
  }
  return tops
}

/**
 * Slides every keyed block under `root` from where `before` saw it. Every box
 * is read before any slide starts: a running slide would skew the boxes of
 * the blocks inside it.
 */
export function glide(root: ParentNode, before: ReadonlyMap<string, number>): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const blocks = [...root.querySelectorAll<HTMLElement>(`[${GLIDE_ATTRIBUTE}]`)]
  const keyOf = (el: HTMLElement) => el.getAttribute(GLIDE_ATTRIBUTE)!
  const parents = new Map<string, string>()
  for (const el of blocks) {
    const parent = el.parentElement?.closest<HTMLElement>(`[${GLIDE_ATTRIBUTE}]`)
    if (parent) parents.set(keyOf(el), keyOf(parent))
  }
  const offsets = glideOffsets(before, snapshot(root), parents)
  for (const el of blocks) {
    const offset = offsets.get(keyOf(el))
    if (offset === undefined || typeof el.animate !== 'function') continue
    const frames =
      offset === 'enter'
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: `translateY(${offset}px)` }, { transform: 'none' }]
    el.animate(frames, { duration: GLIDE_MS, easing: GLIDE_EASING })
  }
}
