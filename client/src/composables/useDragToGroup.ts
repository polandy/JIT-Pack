/**
 * Dragging one thing out of one place and onto another — the gesture, with no
 * knowledge of what is being dragged or what the places mean.
 *
 * Two screens need it and they need different halves of it: a task moves
 * *between* groups (FR-7.8), and the tag manager reorders *within* one.
 * Ionic's `ion-reorder-group` does only the second, appears nowhere in this
 * client, and reports the end of its animation rather than the landing of a
 * write — so this is a composable that reports **what was lifted and where it
 * was dropped**, and the screen decides what that means.
 *
 * Four things here are decisions rather than mechanics:
 *
 *  - **The lift is `useLongPress`'s**, so the 500 ms and the 8 px slop are the
 *    ones the app already presses with, and a finger that wandered was
 *    scrolling. A grip lifts at once, because a control that exists only to be
 *    dragged has nothing to disambiguate.
 *  - **The state is an attribute, always set**: `data-drag` is `idle`,
 *    `lifting`, `dragging` or `settling` on the host. A test waits for `idle`
 *    rather than for the absence of something, which is what CLAUDE.md asks of
 *    every absence. **`idle` means „nothing is in the air" and not „something
 *    was written"** — a drop that changes nothing must still reach it, or
 *    every case that waits on it hangs. That distinction was the tag-reorder
 *    session's, from a case it already has for the drop that lands where it
 *    started.
 *  - **`settling` waits for the write.** Where a drop *does* write, `idle`
 *    returns only once `onDrop` has resolved — not when the animation ends.
 *    E2E-M4-135 was the lesson: the list stands still before the write lands,
 *    and a case that waits for the first loses to the second.
 *  - **It is mirrored from a plain `let`, never a `ref`.** A pointer move
 *    fires dozens of times a second, and a reactive state would re-render the
 *    list under the finger holding it — the same reason `data-scroll-gesture`
 *    is written this way, and the reason ADR-060 exists at all.
 *
 * The drop target is the nearest ancestor of the pointer carrying
 * `data-drop-target`; its value is handed back untouched, and nothing here
 * knows what it names. Where the target's children carry `data-drop-index`,
 * the **gap** the pointer is in is reported with it — continuously, so a
 * consumer that has to show rows making way can, and including the gap past
 * the last child, which no hit test against an element can express.
 */
import { useLongPress, LONG_PRESS_SLOP_PX } from './useLongPress'

/** Where the gesture is, as the attribute spells it. */
export type DragState = 'idle' | 'lifting' | 'dragging' | 'settling'

/** The attribute the state is mirrored onto — the suite's only way in. */
export const DRAG_STATE_ATTRIBUTE = 'data-drag'
/** What marks an element as something a drag can be dropped on. */
export const DROP_TARGET_ATTRIBUTE = 'data-drop-target'
/** What marks a child of a target as occupying a position in it. */
export const DROP_INDEX_ATTRIBUTE = 'data-drop-index'
/** Put on the target under the pointer, for the screen to style. */
export const DROP_OVER_ATTRIBUTE = 'data-drop-over'
/**
 * Put on the numbered child a drop would land next to — `before` it, or
 * `after` it where the gap is past the last one — when `markGap` asks for it.
 * `./dragToGroup.css` draws it, once for every screen.
 */
export const DROP_GAP_ATTRIBUTE = 'data-drop-gap'
/**
 * Put, for as long as a thing is in the air, on every place under the host
 * that `accepts` refuses it — so a heading that cannot take *this* row dims
 * while one that takes only some rows stays lit for the rest.
 */
export const DROP_REFUSED_ATTRIBUTE = 'data-drop-refused'

/** Where a drag is over, or was let go. */
export interface DropPlace {
  /** The `data-drop-target` value of the place. */
  target: string
  /**
   * Which gap of that place, counted in `data-drop-index` children: 0 is
   * before the first, `n` is after the last. `null` where the place marks no
   * positions — a group that only answers „in here" says nothing about order.
   */
  index: number | null
}

export interface DragToGroupOptions<T> {
  /**
   * Whether this payload may land here. A place that cannot hold it is never
   * highlighted and never receives it — a heading that would not be true of
   * the thing under it is worse than no target at all.
   */
  accepts?: (payload: T, place: DropPlace) => boolean
  /**
   * Write it. `from` is the payload's own position when it was lifted, read
   * once at the lift: a list that makes way while the finger moves would
   * otherwise report a position the gesture never started at.
   *
   * The gesture stays in `settling` until this resolves.
   */
  onDrop: (payload: T, place: DropPlace, from: number | null) => void | Promise<void>
  /**
   * The place under the pointer changed, with its gap. Called on every change
   * while dragging — a consumer that shows rows making way needs the running
   * value, not the final one. `null` is „nowhere".
   */
  onHover?: (place: DropPlace | null) => void
  /**
   * A write that failed. Given one, the gesture hands the error over and
   * carries on; without one it is re-thrown from a microtask, so it reaches
   * the page's error handling as an uncaught error rather than vanishing
   * into a promise nobody awaited.
   *
   * Either way the gesture ends: `idle` is reached on the failing path too,
   * because a signal that only arrives when the write succeeds is a signal
   * every test hangs on the day a write does not.
   */
  onError?: (error: unknown) => void
  /**
   * Mark the gap under the pointer (`DROP_GAP_ATTRIBUTE`) — for a list whose
   * rows can be put anywhere (FR-30.13, FR-7.17), where the finger needs to
   * see where the row will land. Never where the drop would move nothing:
   * either gap beside the row itself, in its own place.
   */
  markGap?: boolean
}

export interface DragToGroup<T> {
  /** The host whose attribute carries the state. Null detaches it. */
  bindHost(el: HTMLElement | null): void
  /**
   * A pointer went down on something draggable. `immediate` lifts without the
   * hold — that is the grip, which exists for nothing else.
   */
  down(ev: PointerEvent, payload: T, row: HTMLElement, immediate?: boolean): void
  move(ev: PointerEvent): void
  up(ev: PointerEvent): void
  cancel(): void
  /** What the attribute currently says — for unit tests, not for rendering. */
  state(): DragState
}

interface Lifted<T> {
  payload: T
  row: HTMLElement
  ghost: HTMLElement
  dx: number
  dy: number
  from: number | null
  /** The place the row was lifted out of, or null where it stood in none. */
  home: string | null
}

/** The index a row occupies, where its place counts positions at all. */
function indexOf(row: HTMLElement): number | null {
  const raw = row.getAttribute(DROP_INDEX_ATTRIBUTE)
  return raw === null ? null : Number(raw)
}

/**
 * Which gap of `place` the pointer is in: compared against each child's
 * midpoint, so the answer flips when the pointer passes the middle of a row
 * rather than its edge. `null` where the place numbers nothing.
 */
function gapAt(place: HTMLElement, y: number): number | null {
  const kids = [...place.querySelectorAll<HTMLElement>(`[${DROP_INDEX_ATTRIBUTE}]`)]
  if (kids.length === 0) return null
  for (const kid of kids) {
    const box = kid.getBoundingClientRect()
    if (y < box.top + box.height / 2) return indexOf(kid) ?? 0
  }
  return (indexOf(kids[kids.length - 1]!) ?? kids.length - 1) + 1
}

export function useDragToGroup<T>(opts: DragToGroupOptions<T>): DragToGroup<T> {
  let host: HTMLElement | null = null
  let state: DragState = 'idle'
  let lifted: Lifted<T> | null = null
  let over: HTMLElement | null = null
  let place: DropPlace | null = null
  let gapMark: HTMLElement | null = null
  let refused: HTMLElement[] = []
  let pending: { ev: PointerEvent; payload: T; row: HTMLElement; x: number; y: number } | null =
    null

  const hold = useLongPress<{ ev: PointerEvent; payload: T; row: HTMLElement }>((p) => {
    pending = null
    lift(p.ev, p.payload, p.row)
  })

  function setState(next: DragState): void {
    state = next
    host?.setAttribute(DRAG_STATE_ATTRIBUTE, next)
  }

  function bindHost(el: HTMLElement | null): void {
    host = el
    host?.setAttribute(DRAG_STATE_ATTRIBUTE, state)
  }

  /**
   * The ghost is a clone rather than the row itself: the row stays in the
   * list, marked, so the list does not close up under the finger and reopen
   * on the drop (ADR-060 — nothing moves that the hand did not move). Both
   * `data-drag-ghost` and the marked row's `data-drag-source` carry one
   * shared look from `./dragToGroup.css`, imported once in `main.ts` — a
   * screen never redraws them (`data-drop-over` is the one exception: what a
   * *target* looks like while something hangs over it is still the screen's
   * own call, see `DROP_OVER_ATTRIBUTE`).
   */
  function lift(ev: PointerEvent, payload: T, row: HTMLElement): void {
    const box = row.getBoundingClientRect()
    const ghost = row.cloneNode(true) as HTMLElement
    ghost.setAttribute('data-drag-ghost', '')
    ghost.style.position = 'fixed'
    ghost.style.pointerEvents = 'none'
    ghost.style.width = `${box.width}px`
    ghost.style.left = `${box.left}px`
    ghost.style.top = `${box.top}px`
    document.body.appendChild(ghost)
    row.setAttribute('data-drag-source', '')
    markRefused(payload)
    lifted = {
      payload,
      row,
      ghost,
      dx: ev.clientX - box.left,
      dy: ev.clientY - box.top,
      from: indexOf(row),
      home: row.closest(`[${DROP_TARGET_ATTRIBUTE}]`)?.getAttribute(DROP_TARGET_ATTRIBUTE) ?? null,
    }
    setState('dragging')
    track(ev)
  }

  /** Marks the places under the host that would refuse `payload` wherever it landed. */
  function markRefused(payload: T): void {
    if (!host || !opts.accepts) return
    for (const el of host.querySelectorAll<HTMLElement>(`[${DROP_TARGET_ATTRIBUTE}]`)) {
      const target = el.getAttribute(DROP_TARGET_ATTRIBUTE) ?? ''
      if (opts.accepts(payload, { target, index: null })) continue
      el.setAttribute(DROP_REFUSED_ATTRIBUTE, '')
      refused.push(el)
    }
  }

  /** The place under the pointer, with the ghost taken out of the way. */
  function placeUnder(x: number, y: number): HTMLElement | null {
    if (!lifted) return null
    lifted.ghost.style.visibility = 'hidden'
    let el = document.elementFromPoint(x, y) as HTMLElement | null
    lifted.ghost.style.visibility = ''
    while (el && el !== document.body) {
      if (el.hasAttribute?.(DROP_TARGET_ATTRIBUTE)) return el
      el = el.parentElement
    }
    return null
  }

  function track(ev: PointerEvent): void {
    if (!lifted) return
    lifted.ghost.style.left = `${ev.clientX - lifted.dx}px`
    lifted.ghost.style.top = `${ev.clientY - lifted.dy}px`

    const found = placeUnder(ev.clientX, ev.clientY)
    const name = found?.getAttribute(DROP_TARGET_ATTRIBUTE) ?? null
    const next: DropPlace | null =
      found && name !== null ? { target: name, index: gapAt(found, ev.clientY) } : null
    const allowed = next !== null && (opts.accepts?.(lifted.payload, next) ?? true)

    if (!allowed) {
      markGapAt(null, null)
      if (over) over.removeAttribute(DROP_OVER_ATTRIBUTE)
      if (over !== null || place !== null) opts.onHover?.(null)
      over = null
      place = null
      return
    }
    const changed = over !== found || place?.index !== next.index
    if (over !== found) {
      over?.removeAttribute(DROP_OVER_ATTRIBUTE)
      over = found
      over?.setAttribute(DROP_OVER_ATTRIBUTE, '')
    }
    place = next
    if (opts.markGap) markGapAt(found, next)
    // Reported on every change of gap, not only of group: a consumer that
    // shows rows making way needs the running value.
    if (changed) opts.onHover?.(next)
  }

  /**
   * Moves the gap mark to the child the drop would land next to. A plain
   * attribute on an element already there, like `data-drop-over`: nothing
   * re-renders under the finger (ADR-060).
   */
  function markGapAt(target: HTMLElement | null, at: DropPlace | null): void {
    gapMark?.removeAttribute(DROP_GAP_ATTRIBUTE)
    gapMark = null
    if (!lifted || !target || at === null || at.index === null) return
    const from = lifted.from
    const stays =
      lifted.home === at.target && from !== null && (at.index === from || at.index === from + 1)
    if (stays) return
    const kids = [...target.querySelectorAll<HTMLElement>(`[${DROP_INDEX_ATTRIBUTE}]`)]
    const before = kids.find((kid) => indexOf(kid) === at.index)
    const last = kids[kids.length - 1]
    if (before) {
      gapMark = before
      gapMark.setAttribute(DROP_GAP_ATTRIBUTE, 'before')
    } else if (last) {
      gapMark = last
      gapMark.setAttribute(DROP_GAP_ATTRIBUTE, 'after')
    }
  }

  function down(ev: PointerEvent, payload: T, row: HTMLElement, immediate = false): void {
    if (immediate) {
      ev.preventDefault()
      lift(ev, payload, row)
      return
    }
    pending = { ev, payload, row, x: ev.clientX, y: ev.clientY }
    setState('lifting')
    hold.down({ ev, payload, row }, ev.clientX, ev.clientY)
  }

  function move(ev: PointerEvent): void {
    if (lifted) {
      // While a task is in the air the page must not scroll under it. A
      // consumer that wants edge-scrolling reads the same events and does it
      // itself; nothing here swallows them.
      ev.preventDefault()
      track(ev)
      return
    }
    if (!pending) return
    hold.move(ev.clientX, ev.clientY)
    // The same slop the hold uses, read here only to put the attribute back:
    // past it the finger is scrolling, and the gesture was never lifted.
    if (Math.hypot(ev.clientX - pending.x, ev.clientY - pending.y) > LONG_PRESS_SLOP_PX) {
      pending = null
      setState('idle')
    }
  }

  function clear(): void {
    lifted?.ghost.remove()
    lifted?.row.removeAttribute('data-drag-source')
    lifted = null
    over?.removeAttribute(DROP_OVER_ATTRIBUTE)
    over = null
    place = null
    markGapAt(null, null)
    for (const el of refused) el.removeAttribute(DROP_REFUSED_ATTRIBUTE)
    refused = []
    opts.onHover?.(null)
  }

  function up(ev: PointerEvent): void {
    hold.cancel()
    pending = null
    if (!lifted) {
      setState('idle')
      return
    }
    track(ev)
    const landed = place
    const payload = lifted.payload
    const from = lifted.from
    clear()
    if (landed === null) {
      // Let go over nothing: there is no write to wait for, and the attribute
      // says so at once.
      setState('idle')
      return
    }
    setState('settling')
    void settle(payload, landed, from)
  }

  /**
   * Run the write and end the gesture, whatever the write does.
   *
   * The call is inside the `try`, not handed to `Promise.resolve` outside it:
   * `onDrop` is evaluated *before* a promise exists, so an `onDrop` that
   * throws synchronously — a mutation that raises before its first await —
   * would leave nothing for a `.finally` to attach to, the exception would
   * escape `up()`, and the state would stand at `settling` for ever. Only
   * that path, only on a failure, which is why no run of the happy path
   * finds it.
   */
  async function settle(payload: T, landed: DropPlace, from: number | null): Promise<void> {
    try {
      await opts.onDrop(payload, landed, from)
    } catch (error) {
      if (opts.onError) opts.onError(error)
      else
        queueMicrotask(() => {
          throw error
        })
    } finally {
      setState('idle')
    }
  }

  function cancel(): void {
    hold.cancel()
    pending = null
    clear()
    setState('idle')
  }

  return { bindHost, down, move, up, cancel, state: () => state }
}
