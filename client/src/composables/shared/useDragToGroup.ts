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
 * **What travels is a chip, not the row** (ADR-094): it names what is carried
 * and, in words, where a drop would put it, and it rides above the fingertip
 * rather than under it. The finger aims, so the place it aims at is never
 * hidden under what it carries — and a place the hand itself covers can still
 * be read off the chip. The words are the screen's (`DragCarry`); the frame
 * is `./dragToGroup.css`'s, the same on every screen.
 *
 * **The list scrolls under a finger held at its edge** (G-21): near the top or
 * bottom of the scroller, frame after frame, faster the nearer — so a place
 * below the fold is reached without letting go. The scroller is the host's
 * own Ionic content, or its nearest scrolling ancestor.
 *
 * The drop target is the nearest ancestor of the pointer carrying
 * `data-drop-target`; its value is handed back untouched, and nothing here
 * knows what it names. Where the target's children carry `data-drop-index`,
 * the **gap** the pointer is in is reported with it — continuously, so a
 * consumer that has to show rows making way can, and including the gap past
 * the last child, which no hit test against an element can express.
 */
import { reorderThreeOutline } from 'ionicons/icons'

import { t } from '@/i18n'
import { useLongPress, LONG_PRESS_SLOP_PX } from './useLongPress'

/** How far the chip's bottom edge floats above the fingertip — clear of a finger's pad (ADR-094). */
export const CARRY_LIFT_PX = 22
/** How far the chip starts left of the fingertip: its grip glyph sits over the finger. */
export const CARRY_GRIP_PX = 24
/** The least room the chip keeps to either edge of the screen. */
export const CARRY_EDGE_PX = 8
/**
 * The share of the row's width, from its leading edge, over which the finger
 * keeps what the payload has: the grip is there, so a finger dragged straight
 * down changes the place and nothing else.
 */
export const CHOICE_KEEP_SHARE = 0.34

/**
 * Which option a finger at `x` picks across a row starting at `left`, `width`
 * wide: null over the first share, which keeps; else the option's index, the
 * rest split evenly, the last one held past the far edge.
 */
export function choiceAt(x: number, left: number, width: number, count: number): number | null {
  const keep = width * CHOICE_KEEP_SHARE
  if (x < left + keep) return null
  return Math.min(count - 1, Math.floor((x - left - keep) / ((width - keep) / count)))
}

/** How near the scroller's top or bottom edge a held finger starts the list scrolling. */
export const EDGE_SCROLL_ZONE_PX = 64
/**
 * The fastest the list scrolls under a finger at the very edge, in pixels a
 * second — per second rather than per frame, so a 120 Hz phone scrolls no
 * faster than a 60 Hz one. Slow enough to read the days going by.
 */
export const EDGE_SCROLL_MAX_PX_PER_S = 360
/**
 * The time a frame is taken to last where there is no frame before it to
 * measure from — the first one, and the first after the tab was hidden, so a
 * paused tab does not jump the list on its return.
 */
const FIRST_FRAME_MS = 1000 / 60
/**
 * The longest step counted between two frames: a page that hung for seconds
 * moves the list on by a short step rather than by the whole stall, while a
 * device painting as few as four frames a second still keeps the full pace.
 */
const LONGEST_FRAME_MS = 250

/**
 * How fast the list scrolls under a finger at `y` (G-21), in pixels a second:
 * nothing away from the edges; within `EDGE_SCROLL_ZONE_PX` of the bottom,
 * down, easing in by the square of how deep the finger is — a quarter of the
 * top speed half-way in — and the same upward at the top. Past an edge it is
 * no faster than at it.
 */
export function edgeSpeed(y: number, top: number, bottom: number): number {
  const eased = (into: number) => {
    const depth = Math.min(into, EDGE_SCROLL_ZONE_PX) / EDGE_SCROLL_ZONE_PX
    return EDGE_SCROLL_MAX_PX_PER_S * depth * depth
  }
  if (y > bottom - EDGE_SCROLL_ZONE_PX) return eased(y - (bottom - EDGE_SCROLL_ZONE_PX))
  if (y < top + EDGE_SCROLL_ZONE_PX) return -eased(top + EDGE_SCROLL_ZONE_PX - y)
  return 0
}

const EDGE_STILL = 'still'
const EDGE_UP = 'up'
const EDGE_DOWN = 'down'

/** An Ionic content, whose scroller lives in its shadow root and is handed out on request. */
type IonicContent = HTMLElement & { getScrollElement?: () => Promise<HTMLElement> }

/**
 * The element that scrolls under `el`: the nearest Ionic content's scroller,
 * or the nearest ancestor that scrolls by its own style; null for none.
 */
async function scrollerOf(el: HTMLElement): Promise<HTMLElement | null> {
  for (let at: HTMLElement | null = el; at; at = at.parentElement) {
    const content = at as IonicContent
    if (typeof content.getScrollElement === 'function') return content.getScrollElement()
    const overflow = getComputedStyle(at).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return at
  }
  return null
}

/** Where the gesture is, as the attribute spells it. */
export type DragState = 'idle' | 'lifting' | 'dragging' | 'settling'

/** The attribute the state is mirrored onto — the suite's only way in. */
export const DRAG_STATE_ATTRIBUTE = 'data-drag'
/**
 * Whether the list is scrolling under a finger held at its edge: `up`,
 * `down` or `still`, always set on the host like `data-drag` — the suite's
 * way to know the list has stopped before it aims at a place.
 */
export const DRAG_SCROLL_ATTRIBUTE = 'data-drag-scroll'
/** What marks an element as something a drag can be dropped on. */
export const DROP_TARGET_ATTRIBUTE = 'data-drop-target'
/** What marks a child of a target as occupying a position in it. */
export const DROP_INDEX_ATTRIBUTE = 'data-drop-index'
/**
 * The words a place is named by on the chip (ADR-094) — a heading's title, a
 * day's date. Handed to `DragCarry.target`, so a screen that already prints
 * the name need not look it up a second time.
 */
export const DROP_LABEL_ATTRIBUTE = 'data-drop-label'
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
  /**
   * The option picked in the chip's row of fields (`DragCarry.choices`), null
   * where the finger is over the first one, which keeps; absent on a screen
   * that offers no choice.
   */
  choice?: string | null
}

/** One option a drop can choose besides its place: M31's slot. */
export interface DragOption {
  /** What the drop reports in `DropPlace.choice`. */
  key: string
  /** The field's word. */
  label: string
  /** The option the payload has now, marked so the eye finds its way back. */
  current?: boolean
}

/** The fields a carried payload offers, left to right after the one that keeps. */
export interface DragChoices {
  /** The first field's words: what stays as it is (*„bleibt Abend"*). */
  keep: string
  options: DragOption[]
}

/**
 * What the travelling chip says (ADR-094) — the screen's words, since only
 * the screen knows what its payload and its places are called.
 */
export interface DragCarry<T> {
  /** What is in the hand: a meal's dish, a task's words, an entry's name. */
  title: (payload: T) => string
  /** A quiet word beside it — a slot, an amount; null or absent for none. */
  tag?: (payload: T) => string | null
  /**
   * The name of the place a drop would put it in, said as „→ name"; `label`
   * is the place's own `data-drop-label`, null without one. Null where a drop
   * there would change nothing: such a place is no place — not framed, and a
   * drop on it writes nothing.
   */
  target: (
    payload: T,
    place: DropPlace,
    label: string | null,
    choice: string | null,
  ) => string | null
  /** The chip's line while a drop would change nothing: „bleibt am Mo., 12.10.". */
  stays: (payload: T) => string
  /**
   * A second thing a drop can change besides the place — chosen by how far
   * right the finger is, and shown above it as a row of fields in a chip as
   * wide as the row, each field over its own column of the list (G-21). Absent
   * or null: the compact chip, and no choice.
   */
  choices?: (payload: T) => DragChoices | null
}

export interface DragToGroupOptions<T> {
  /** The chip's words (ADR-094). */
  carry: DragCarry<T>
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
  /** The chip's second line, rewritten as the place under the finger changes. */
  where: HTMLElement
  /** The chip's row of fields and the option each stands for (null: keeps); null for no choice. */
  choices: { row: HTMLElement; fields: { el: HTMLElement; key: string | null }[] } | null
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
  let scroller: HTMLElement | null = null
  /** Where the finger last was, for the frames that scroll under it. */
  let pointer: { clientX: number; clientY: number } | null = null
  let edgeFrame: number | null = null
  /** When the last scrolling frame ran, and the part of a pixel it left over. */
  let lastFrameAt: number | null = null
  let carried = 0
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
    scroller = null
    host?.setAttribute(DRAG_STATE_ATTRIBUTE, state)
    host?.setAttribute(DRAG_SCROLL_ATTRIBUTE, EDGE_STILL)
    if (el)
      void scrollerOf(el).then((found) => {
        if (host === el) scroller = found
      })
  }

  /**
   * One frame of scrolling under a finger held at the edge, and the next one
   * asked for while it stays there. The place under the finger is read again
   * after each step, since the list moved under it; a list that cannot move
   * further ends the frames until the finger moves again.
   *
   * `edgeFrame` keeps this frame's id while it runs, so the `track` below
   * sees a loop running and does not start a second one beside it.
   */
  function edgeScroll(now: number): void {
    if (!lifted || !scroller || !pointer) return stopEdgeScroll()
    const box = scroller.getBoundingClientRect()
    const speed = edgeSpeed(pointer.clientY, box.top, box.bottom)
    if (speed === 0) return stopEdgeScroll()
    // Already at its end that way: still now, not once the fractions of a
    // slow speed add up to a pixel it then cannot take.
    const room =
      speed > 0
        ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
        : scroller.scrollTop
    if (room <= 0) return stopEdgeScroll()
    const elapsed =
      lastFrameAt === null ? FIRST_FRAME_MS : Math.min(now - lastFrameAt, LONGEST_FRAME_MS)
    lastFrameAt = now
    // Whole pixels only, the rest carried on: a slow speed is a fraction of a
    // pixel a frame, which a scroller rounding to pixels would lose for ever.
    carried += (speed * elapsed) / 1000
    const step = Math.trunc(carried)
    carried -= step
    if (step !== 0) {
      const before = scroller.scrollTop
      scroller.scrollTop = before + step
      if (scroller.scrollTop === before) return stopEdgeScroll()
      track(pointer as PointerEvent)
    }
    host?.setAttribute(DRAG_SCROLL_ATTRIBUTE, speed > 0 ? EDGE_DOWN : EDGE_UP)
    edgeFrame = requestAnimationFrame(edgeScroll)
  }

  function stopEdgeScroll(): void {
    if (edgeFrame !== null) cancelAnimationFrame(edgeFrame)
    edgeFrame = null
    lastFrameAt = null
    carried = 0
    host?.setAttribute(DRAG_SCROLL_ATTRIBUTE, EDGE_STILL)
  }

  /** A hidden tab paints nothing: its first frame back is measured afresh. */
  function forgetLastFrame(): void {
    lastFrameAt = null
  }

  /**
   * The row stays in the list, marked, so the list does not close up under
   * the finger and reopen on the drop (ADR-060 — nothing moves that the hand
   * did not move); what travels is a chip built here (ADR-094). Both
   * `data-drag-ghost` and the marked row's `data-drag-source` carry one
   * shared look from `./dragToGroup.css`, imported once in `main.ts` — a
   * screen never redraws them (`data-drop-over` is the one exception: what a
   * *target* looks like while something hangs over it is still the screen's
   * own call, see `DROP_OVER_ATTRIBUTE`).
   */
  function lift(ev: PointerEvent, payload: T, row: HTMLElement): void {
    // Every move reaches the gesture from here on, even over a toast laid
    // across the bottom edge, where the list is scrolled from (G-21).
    try {
      ;(ev.target as Element | null)?.setPointerCapture?.(ev.pointerId)
    } catch {
      // A pointer already gone has nothing to hold on to.
    }
    const { ghost, where, choices } = chip(payload)
    if (choices) {
      // As wide as the row, so each field stands over its own column.
      const box = row.getBoundingClientRect()
      ghost.style.left = `${box.left}px`
      ghost.style.width = `${box.width}px`
    }
    document.body.appendChild(ghost)
    row.setAttribute('data-drag-source', '')
    markRefused(payload)
    lifted = {
      payload,
      row,
      ghost,
      where,
      choices,
      from: indexOf(row),
      home: row.closest(`[${DROP_TARGET_ATTRIBUTE}]`)?.getAttribute(DROP_TARGET_ATTRIBUTE) ?? null,
    }
    document.addEventListener('visibilitychange', forgetLastFrame)
    setState('dragging')
    track(ev)
  }

  /** The chip: a grip, what is carried with its tag, and the line saying where it lands. */
  function chip(payload: T): {
    ghost: HTMLElement
    where: HTMLElement
    choices: Lifted<T>['choices']
  } {
    const ghost = document.createElement('div')
    ghost.setAttribute('data-drag-ghost', '')
    ghost.style.position = 'fixed'
    ghost.style.pointerEvents = 'none'
    const grip = document.createElement('ion-icon') as HTMLElement & { icon?: string }
    grip.icon = reorderThreeOutline
    grip.setAttribute('aria-hidden', 'true')
    const words = document.createElement('span')
    words.setAttribute('data-carry-words', '')
    const title = document.createElement('b')
    title.setAttribute('data-carry-title', '')
    title.textContent = opts.carry.title(payload)
    words.append(title)
    const tag = opts.carry.tag?.(payload) ?? null
    if (tag !== null) {
      const quiet = document.createElement('span')
      quiet.setAttribute('data-carry-tag', '')
      quiet.className = 'jp-eyebrow'
      quiet.textContent = tag
      words.append(quiet)
    }
    const where = document.createElement('span')
    where.setAttribute('data-carry-where', '')
    words.append(where)
    const offered = opts.carry.choices?.(payload) ?? null
    if (!offered) {
      ghost.append(grip, words)
      return { ghost, where, choices: null }
    }
    ghost.setAttribute('data-carry-wide', '')
    const head = document.createElement('span')
    head.setAttribute('data-carry-head', '')
    head.append(grip, words)
    const row = document.createElement('span')
    row.setAttribute('data-carry-choices', '')
    const fields = [
      { key: null, label: offered.keep, current: false },
      ...offered.options.map((option) => ({ ...option, current: option.current ?? false })),
    ].map(({ key, label, current }) => {
      const el = document.createElement('span')
      el.setAttribute('data-carry-choice', key ?? '')
      if (current) el.setAttribute('data-current', '')
      el.textContent = label
      row.append(el)
      return { el, key }
    })
    ghost.append(head, row)
    return { ghost, where, choices: { row, fields } }
  }

  /** The option under the finger — lit in the chip — or null where it keeps. */
  function choose(x: number): string | null {
    const choices = lifted?.choices
    if (!choices) return null
    const box = choices.row.getBoundingClientRect()
    const index = choiceAt(x, box.left, box.width, choices.fields.length - 1)
    const key = index === null ? null : (choices.fields[index + 1]?.key ?? null)
    for (const field of choices.fields) {
      if (field.key === key) field.el.setAttribute('data-on', '')
      else field.el.removeAttribute('data-on')
    }
    return key
  }

  /**
   * Above the fingertip, its grip over the finger, inside the screen. Read
   * from the chip's own height, so a long title wrapping to two lines still
   * clears the finger.
   */
  function float(ghost: HTMLElement, x: number, y: number): void {
    if (lifted?.choices) {
      ghost.style.top = `${y - ghost.offsetHeight - CARRY_LIFT_PX}px`
      return
    }
    const room = window.innerWidth - ghost.offsetWidth - CARRY_EDGE_PX
    ghost.style.left = `${Math.max(CARRY_EDGE_PX, Math.min(room, x - CARRY_GRIP_PX))}px`
    ghost.style.top = `${y - ghost.offsetHeight - CARRY_LIFT_PX}px`
  }

  /** The chip's line: where it lands, or that it stays. */
  function say(lands: string | null): void {
    if (!lifted) return
    if (lands === null) {
      lifted.where.textContent = opts.carry.stays(lifted.payload)
      lifted.where.removeAttribute('data-lands')
    } else {
      lifted.where.textContent = t('list.dropTo', { place: lands })
      lifted.where.setAttribute('data-lands', '')
    }
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
    pointer = { clientX: ev.clientX, clientY: ev.clientY }
    if (edgeFrame === null) edgeFrame = requestAnimationFrame(edgeScroll)
    float(lifted.ghost, ev.clientX, ev.clientY)

    const found = placeUnder(ev.clientX, ev.clientY)
    const name = found?.getAttribute(DROP_TARGET_ATTRIBUTE) ?? null
    const choice = choose(ev.clientX)
    const next: DropPlace | null =
      found && name !== null
        ? {
            target: name,
            index: gapAt(found, ev.clientY),
            ...(lifted.choices ? { choice } : {}),
          }
        : null
    const allowed = next !== null && (opts.accepts?.(lifted.payload, next) ?? true)
    const lands = allowed
      ? opts.carry.target(lifted.payload, next, found!.getAttribute(DROP_LABEL_ATTRIBUTE), choice)
      : null

    if (!allowed || lands === null) {
      say(null)
      markGapAt(null, null)
      if (over) over.removeAttribute(DROP_OVER_ATTRIBUTE)
      if (over !== null || place !== null) opts.onHover?.(null)
      over = null
      place = null
      return
    }
    say(stays(next) ? null : lands)
    const changed = over !== found || place?.index !== next.index || place?.choice !== next.choice
    if (over !== found) {
      over?.removeAttribute(DROP_OVER_ATTRIBUTE)
      over = found
      // A row moved inside its own place needs no frame round the place: the
      // gap mark says everything, and the frame is for a place it goes *to*.
      if (!(opts.markGap && lifted.home === name)) over?.setAttribute(DROP_OVER_ATTRIBUTE, '')
    }
    place = next
    if (opts.markGap) markGapAt(found, next)
    // Reported on every change of gap, not only of group: a consumer that
    // shows rows making way needs the running value.
    if (changed) opts.onHover?.(next)
  }

  /** Whether a drop in this gap would leave the row where it is: either gap beside it, in its own place. */
  function stays(at: DropPlace): boolean {
    if (!lifted || !opts.markGap || at.index === null) return false
    const from = lifted.from
    return (
      lifted.home === at.target && from !== null && (at.index === from || at.index === from + 1)
    )
  }

  /**
   * Moves the gap mark to the child the drop would land next to. A plain
   * attribute on an element already there, like `data-drop-over`: nothing
   * re-renders under the finger (ADR-060).
   */
  function markGapAt(target: HTMLElement | null, at: DropPlace | null): void {
    gapMark?.removeAttribute(DROP_GAP_ATTRIBUTE)
    gapMark = null
    if (!lifted || !target || at === null || at.index === null || stays(at)) return
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
      // While a task is in the air the page must not scroll under it but by
      // the edge (`edgeScroll`), which only a held finger starts.
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
    stopEdgeScroll()
    document.removeEventListener('visibilitychange', forgetLastFrame)
    pointer = null
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
