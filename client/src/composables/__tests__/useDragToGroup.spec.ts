// @vitest-environment jsdom
/**
 * The drag gesture two screens share (FR-7.8): what was lifted, where it was
 * let go, and what the attribute says while that happens.
 *
 * The cases below are the four the tag-reorder session named as the things
 * *its* screen needs and this one does not — they are here because a
 * composable that only serves the screen that wrote it is not shared code, it
 * is a private helper with an audience.
 *
 * jsdom, because the whole subject is the DOM: an element under a pointer, a
 * ghost that must not be under it, an attribute on a host.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  useDragToGroup,
  DRAG_STATE_ATTRIBUTE,
  DROP_GAP_ATTRIBUTE,
  DROP_OVER_ATTRIBUTE,
  DROP_REFUSED_ATTRIBUTE,
  CARRY_GRIP_PX,
  CARRY_LIFT_PX,
  type DragCarry,
  type DropPlace,
} from '../useDragToGroup'
import { LONG_PRESS_MS } from '../useLongPress'

/** A pointer event with only the parts the composable reads. */
const at = (x: number, y: number) =>
  ({ clientX: x, clientY: y, preventDefault: vi.fn() }) as unknown as PointerEvent

/** What the chip says, the same for every case: the payload is its own name, a place its target's. */
const carry: DragCarry<string> = {
  title: (payload) => payload,
  tag: () => 'tag',
  target: (_payload, place) => place.target,
  stays: (payload) => `${payload} stays`,
}

let host: HTMLElement
let groupA: HTMLElement
let groupB: HTMLElement
let rows: HTMLElement[]

/**
 * Two groups, three rows, with boxes we control: jsdom lays nothing out, so
 * `getBoundingClientRect` and `elementFromPoint` are the fixture's to answer —
 * and answering them is what makes the geometry rules testable at all.
 */
function box(el: HTMLElement, top: number, height = 20) {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: top,
    }) as DOMRect
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="host">
      <div id="a" data-drop-target="a">
        <div class="row" data-drop-index="0">one</div>
        <div class="row" data-drop-index="1">two</div>
      </div>
      <div id="b" data-drop-target="b" data-drop-label="Group B"></div>
    </div>`
  host = document.getElementById('host')!
  groupA = document.getElementById('a')!
  groupB = document.getElementById('b')!
  rows = [...document.querySelectorAll<HTMLElement>('.row')]
  box(groupA, 0, 40)
  box(rows[0]!, 0)
  box(rows[1]!, 20)
  box(groupB, 40, 40)
  // Whatever is at that y, by the fixture's own geometry.
  document.elementFromPoint = (_x: number, y: number) =>
    (y < 40 ? (y < 20 ? rows[0]! : rows[1]!) : groupB) as Element
})

afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('[data-drag-ghost]').forEach((g) => g.remove())
})

describe('useDragToGroup — the state the suite waits on', () => {
  it('always carries a value, starting at idle', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)
    // Not „absent" — an absence with four possible states says nothing, which
    // is why this differs from `data-scroll-gesture`'s on/off attribute.
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
  })

  it('goes lifting → dragging → settling → idle across one drag', async () => {
    vi.useFakeTimers()
    const seen: string[] = []
    const drag = useDragToGroup<string>({
      carry,
      onDrop: () => {
        seen.push(host.getAttribute(DRAG_STATE_ATTRIBUTE)!)
      },
    })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!)
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('lifting')
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('dragging')

    drag.move(at(10, 50))
    drag.up(at(10, 50))
    // The write sees `settling`, which is the whole point of having it.
    expect(seen).toEqual(['settling'])
    await vi.runAllTimersAsync()
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
  })

  /*
   * The case the tag-reorder session asked for, and the one a run of the
   * happy path never reaches: a drop that changes nothing still has to end
   * the gesture. `idle` means „nothing is in the air", not „something was
   * written" — built the other way round, this one drop hangs for ever and
   * every case waiting on the attribute times out.
   */
  it('reaches idle even when the drop writes nothing', async () => {
    vi.useFakeTimers()
    const onDrop = vi.fn()
    const drag = useDragToGroup<string>({ carry, onDrop })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    // Still in the top half of its own row: the gap before it, which is
    // exactly where it already is.
    drag.move(at(10, 6))
    drag.up(at(10, 6))

    await vi.runAllTimersAsync()
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
    // Positive beside the absence: the drop was reported, at its own place,
    // so „nothing changed" is the screen's answer rather than a lost gesture.
    expect(onDrop).toHaveBeenCalledWith('one', { target: 'a', index: 0 }, 0)
  })

  it('reaches idle when it is let go over nothing at all', async () => {
    vi.useFakeTimers()
    const onDrop = vi.fn()
    const drag = useDragToGroup<string>({ carry, onDrop })
    drag.bindHost(host)
    document.elementFromPoint = () => document.body

    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(500, 500))
    drag.up(at(500, 500))

    await vi.runAllTimersAsync()
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
    expect(onDrop).not.toHaveBeenCalled()
  })

  /*
   * The write's failing path, which no run of the happy path reaches. An
   * `onDrop` that throws *synchronously* — a mutation raising before its
   * first await — leaves nothing for a `.finally` to attach to: unguarded,
   * the exception escapes, and the attribute stands at `settling` for ever.
   */
  it('reaches idle when the write throws before it ever returns a promise', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const drag = useDragToGroup<string>({
      carry,
      onDrop: () => {
        throw new Error('the mutation refused')
      },
      onError,
    })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 50))
    drag.up(at(10, 50))

    await vi.runAllTimersAsync()
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
    // And the failure is handed over rather than swallowed: a write that went
    // wrong silently is worse than one that hangs, because nobody looks.
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'the mutation refused' }),
    )
  })

  it('reaches idle when the write rejects, and hands the reason over', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const drag = useDragToGroup<string>({
      carry,
      onDrop: () => Promise.reject(new Error('the push was refused')),
      onError,
    })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 50))
    drag.up(at(10, 50))

    await vi.runAllTimersAsync()
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'the push was refused' }),
    )
  })

  it('puts the attribute back when the finger turns out to be scrolling', () => {
    vi.useFakeTimers()
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!)
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('lifting')
    drag.move(at(10, 40)) // past the 8 px slop
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
    // And the hold is disarmed: the time passing does not lift it after all.
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
  })
})

describe('useDragToGroup — where it says the thing will land', () => {
  /*
   * The gap past the last row has no element under the pointer, so a target
   * reported as „the element I am over" cannot express it — and a tag could
   * never be dragged to the end of its list. The index is what expresses it.
   */
  it('reports the gap past the last row, which no element can', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)
    const hovered: (DropPlace | null)[] = []
    const d2 = useDragToGroup<string>({ carry, onDrop: vi.fn(), onHover: (p) => hovered.push(p) })
    d2.bindHost(host)

    d2.down(at(10, 5), 'one', rows[0]!, true)
    d2.move(at(10, 35)) // below the midpoint of the last row of group a
    expect(hovered.at(-1)).toEqual({ target: 'a', index: 2 })
  })

  it('reports the gap continuously, not only at the drop', () => {
    const hovered: (DropPlace | null)[] = []
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn(), onHover: (p) => hovered.push(p) })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 25)) // past the midpoint of row 0 → gap 1
    drag.move(at(10, 35)) // past the midpoint of row 1 → gap 2
    drag.move(at(10, 50)) // into the other group, which numbers nothing

    expect(hovered.map((p) => p && `${p.target}:${p.index}`)).toEqual([
      'a:0',
      'a:1',
      'a:2',
      'b:null',
    ])
  })

  /*
   * A list that makes way while the finger moves would renumber the rows
   * under it, so the position the gesture *started* at has to be captured at
   * the lift and carried, not read again at the drop.
   */
  it('hands the drop the position the drag started from', () => {
    const onDrop = vi.fn()
    const drag = useDragToGroup<string>({ carry, onDrop })
    drag.bindHost(host)

    drag.down(at(10, 25), 'two', rows[1]!, true)
    // The consumer renumbers while the drag is in flight, as a reorder does.
    rows[1]!.setAttribute('data-drop-index', '0')
    drag.move(at(10, 50))
    drag.up(at(10, 50))

    expect(onDrop).toHaveBeenCalledWith('two', { target: 'b', index: null }, 1)
  })
})

/*
 * FR-30.13/FR-7.17: a list whose rows go anywhere shows the finger where the
 * row will land — on a row already there, so nothing moves under it.
 */
describe('useDragToGroup — the gap it marks (markGap)', () => {
  const gaps = () =>
    [...document.querySelectorAll(`[${DROP_GAP_ATTRIBUTE}]`)].map(
      (el) => `${el.textContent}:${el.getAttribute(DROP_GAP_ATTRIBUTE)}`,
    )

  it('marks the row a drop would land before, and the last row for the gap past it', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn(), markGap: true })
    drag.bindHost(host)
    // Lifted from outside the group, as from the Fällig block: every gap moves it.
    const outside = document.createElement('div')
    host.appendChild(outside)
    box(outside, 100)

    drag.down(at(10, 100), 'x', outside, true)
    drag.move(at(10, 5))
    expect(gaps()).toEqual(['one:before'])
    drag.move(at(10, 35))
    expect(gaps()).toEqual(['two:after'])
    drag.move(at(10, 50)) // the other group numbers nothing
    expect(gaps()).toEqual([])
  })

  it('marks nothing beside the row itself, where the drop would move nothing', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn(), markGap: true })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 5)) // gap 0, above itself
    expect(gaps()).toEqual([])
    drag.move(at(10, 25)) // gap 1, below itself
    expect(gaps()).toEqual([])
    drag.move(at(10, 35)) // gap 2, past two
    expect(gaps()).toEqual(['two:after'])
  })

  it('takes the mark off when the drag ends', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn(), markGap: true })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 35))
    drag.up(at(10, 35))
    expect(gaps()).toEqual([])
  })

  it('frames a place the row goes to, never the one it is moved inside', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn(), markGap: true })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 35))
    expect(groupA.hasAttribute(DROP_OVER_ATTRIBUTE)).toBe(false)
    drag.move(at(10, 50))
    expect(groupB.hasAttribute(DROP_OVER_ATTRIBUTE)).toBe(true)
  })

  it('marks nothing unless asked', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 35))
    expect(gaps()).toEqual([])
  })
})

describe('useDragToGroup — a place that cannot hold it', () => {
  it('neither highlights nor accepts what it may not have', async () => {
    vi.useFakeTimers()
    const onDrop = vi.fn()
    const drag = useDragToGroup<string>({
      carry,
      onDrop,
      accepts: (_payload, place) => place.target !== 'b',
    })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 50))
    expect(groupB.hasAttribute(DROP_OVER_ATTRIBUTE)).toBe(false)
    drag.up(at(10, 50))

    await vi.runAllTimersAsync()
    expect(onDrop).not.toHaveBeenCalled()
    // Still ends the gesture: a refused drop is not a hung one.
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
  })

  it('marks every place that would refuse it while it is in the air, and only those', () => {
    const drag = useDragToGroup<string>({
      carry,
      onDrop: vi.fn(),
      accepts: (_payload, place) => place.target === 'a',
    })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    expect(groupB.hasAttribute(DROP_REFUSED_ATTRIBUTE)).toBe(true)
    expect(groupA.hasAttribute(DROP_REFUSED_ATTRIBUTE)).toBe(false)
    drag.up(at(10, 5))
    expect(groupB.hasAttribute(DROP_REFUSED_ATTRIBUTE)).toBe(false)
  })

  it('marks the place under the pointer, and unmarks the one it left', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 10))
    expect(groupA.hasAttribute(DROP_OVER_ATTRIBUTE)).toBe(true)
    drag.move(at(10, 50))
    expect(groupA.hasAttribute(DROP_OVER_ATTRIBUTE)).toBe(false)
    expect(groupB.hasAttribute(DROP_OVER_ATTRIBUTE)).toBe(true)
  })

  /*
   * The row stays in the list while its clone travels. A list that closed up
   * around the lifted row would move every row below it under the finger that
   * had just pressed one — ADR-060, which this app has paid for once.
   */
  it('leaves the row where it was and travels a chip', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)

    drag.down(at(10, 5), 'one', rows[0]!, true)
    expect(rows[0]!.hasAttribute('data-drag-source')).toBe(true)
    expect(rows[0]!.parentElement).toBe(groupA)
    const ghost = document.querySelector('[data-drag-ghost]') as HTMLElement
    expect(ghost).not.toBeNull()
    expect(ghost.style.position).toBe('fixed')
    expect(ghost.style.pointerEvents).toBe('none')

    drag.cancel()
    expect(document.querySelector('[data-drag-ghost]')).toBeNull()
    expect(rows[0]!.hasAttribute('data-drag-source')).toBe(false)
  })
})

/*
 * ADR-094: what travels is a chip above the fingertip, not a clone of the row
 * under it. The finger aims; the place under it stays in sight, and the chip
 * says in words where the drop lands — so a place the hand covers is still
 * one the reader can name.
 */
describe('useDragToGroup — the chip it carries (ADR-094)', () => {
  const ghost = () => document.querySelector<HTMLElement>('[data-drag-ghost]')!
  const where = () => ghost().querySelector<HTMLElement>('[data-carry-where]')!

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
  })

  it('names what is carried, with its quiet tag', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    expect(ghost().querySelector('[data-carry-title]')!.textContent).toBe('one')
    expect(ghost().querySelector('[data-carry-tag]')!.textContent).toBe('tag')
  })

  it('leaves the tag out where the payload has none', () => {
    const drag = useDragToGroup<string>({ carry: { ...carry, tag: () => null }, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    expect(ghost().querySelector('[data-carry-tag]')).toBeNull()
  })

  it('rides above the fingertip, its grip over the finger, never over the place it aims at', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(100, 5), 'one', rows[0]!, true)
    drag.move(at(120, 250))
    // jsdom lays nothing out: the chip is 0 tall, so its bottom is its top.
    expect(ghost().style.top).toBe(`${250 - CARRY_LIFT_PX}px`)
    expect(ghost().style.left).toBe(`${120 - CARRY_GRIP_PX}px`)
  })

  it('stays inside the screen at either edge', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(5, 5), 'one', rows[0]!, true)
    expect(Number.parseFloat(ghost().style.left)).toBeGreaterThanOrEqual(0)
    drag.move(at(399, 50))
    expect(Number.parseFloat(ghost().style.left)).toBeLessThanOrEqual(400)
  })

  it('says where the drop lands over a place that takes it', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 50))
    expect(where().textContent).toBe('→ b')
    expect(where().hasAttribute('data-lands')).toBe(true)
  })

  it('says it stays over nothing, and over a place the screen names no move into', () => {
    // A day a meal already stands on: the screen knows a drop there changes nothing.
    const home: DragCarry<string> = {
      ...carry,
      target: (_p, place) => (place.target === 'a' ? null : place.target),
    }
    const drag = useDragToGroup<string>({ carry: home, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    expect(where().textContent).toBe('one stays')
    expect(where().hasAttribute('data-lands')).toBe(false)
    drag.move(at(10, 50))
    drag.move(at(10, 15))
    expect(where().textContent).toBe('one stays')
    expect(where().hasAttribute('data-lands')).toBe(false)
  })

  it('hands the screen the name the place carries', () => {
    const named: DragCarry<string> = { ...carry, target: (_p, _place, label) => label }
    const drag = useDragToGroup<string>({ carry: named, onDrop: vi.fn() })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 50))
    expect(where().textContent).toBe('→ Group B')
  })

  it('says it stays over a place that would refuse it', () => {
    const drag = useDragToGroup<string>({
      carry,
      onDrop: vi.fn(),
      accepts: (_payload, place) => place.target !== 'b',
    })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 50))
    expect(where().textContent).toBe('one stays')
  })

  it('says it stays in the gaps beside the row itself, where markGap marks nothing', () => {
    const drag = useDragToGroup<string>({ carry, onDrop: vi.fn(), markGap: true })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 15))
    expect(where().textContent).toBe('one stays')
    drag.move(at(10, 35))
    expect(where().textContent).toBe('→ a')
  })

  it('frames and drops nowhere a place the screen names no move into', async () => {
    const onDrop = vi.fn()
    const home: DragCarry<string> = {
      ...carry,
      target: (_p, place) => (place.target === 'a' ? null : place.target),
    }
    const drag = useDragToGroup<string>({ carry: home, onDrop })
    drag.bindHost(host)
    drag.down(at(10, 5), 'one', rows[0]!, true)
    drag.move(at(10, 15))
    expect(groupA.hasAttribute(DROP_OVER_ATTRIBUTE)).toBe(false)
    drag.up(at(10, 15))
    await Promise.resolve()
    expect(onDrop).not.toHaveBeenCalled()
    expect(host.getAttribute(DRAG_STATE_ATTRIBUTE)).toBe('idle')
  })
})
