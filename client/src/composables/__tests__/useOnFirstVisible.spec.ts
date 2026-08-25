// @vitest-environment jsdom
/**
 * "When this row is on screen" (ADR-033) — the trigger M2's progress ring
 * hangs on. jsdom has no IntersectionObserver, which is also the reason the
 * fallback below exists rather than being hypothetical.
 */
import { describe, it, expect, vi } from 'vitest'

import { useOnFirstVisible } from '../useOnFirstVisible'

/** A hand-driven IntersectionObserver: the test decides what is on screen. */
class FakeObserver {
  static last: FakeObserver | null = null
  observed = new Set<Element>()
  unobserved: Element[] = []
  disconnected = false
  constructor(private cb: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
    FakeObserver.last = this
  }
  observe(el: Element) {
    this.observed.add(el)
  }
  unobserve(el: Element) {
    this.unobserved.push(el)
    this.observed.delete(el)
  }
  disconnect() {
    this.disconnected = true
  }
  show(el: Element, isIntersecting = true) {
    this.cb([{ target: el, isIntersecting }])
  }
}

const el = () => document.createElement('div')

describe('useOnFirstVisible', () => {
  it('calls back when the element comes into view, and only then', () => {
    const onVisible = vi.fn()
    const watch = useOnFirstVisible(onVisible, (cb) => new FakeObserver(cb))
    const row = el()

    watch.observe(row, 'trip-1')
    expect(onVisible).not.toHaveBeenCalled()

    FakeObserver.last!.show(row)

    expect(onVisible).toHaveBeenCalledWith('trip-1')
  })

  it('ignores an element that leaves the viewport again', () => {
    const onVisible = vi.fn()
    const watch = useOnFirstVisible(onVisible, (cb) => new FakeObserver(cb))
    const row = el()
    watch.observe(row, 'trip-1')

    FakeObserver.last!.show(row, false)

    expect(onVisible).not.toHaveBeenCalled()
  })

  it('reports a key once and stops watching it, however far it is scrolled', () => {
    const onVisible = vi.fn()
    const watch = useOnFirstVisible(onVisible, (cb) => new FakeObserver(cb))
    const row = el()
    watch.observe(row, 'trip-1')

    FakeObserver.last!.show(row)
    FakeObserver.last!.show(row)

    expect(onVisible).toHaveBeenCalledTimes(1)
    expect(FakeObserver.last!.unobserved).toContain(row)
  })

  it('lets go of everything when the screen does', () => {
    const watch = useOnFirstVisible(vi.fn(), (cb) => new FakeObserver(cb))
    watch.observe(el(), 'trip-1')

    watch.stop()

    expect(FakeObserver.last!.disconnected).toBe(true)
  })

  /*
   * A browser without IntersectionObserver must not silently show nothing:
   * the fallback is to treat every observed row as visible, which costs the
   * requests the observer exists to save and keeps the screen correct. The
   * wrong trade would be the other way round.
   */
  it('falls back to reporting every element where the browser has no observer', () => {
    const onVisible = vi.fn()
    const watch = useOnFirstVisible(onVisible, () => null)

    watch.observe(el(), 'trip-1')
    watch.observe(el(), 'trip-2')

    expect(onVisible.mock.calls.flat()).toEqual(['trip-1', 'trip-2'])
  })
})
