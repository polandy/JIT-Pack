// @vitest-environment jsdom
/**
 * G-6's one control at its two sizes (FR-21.25).
 *
 * The size is a class rather than a second component, and the class is the
 * seam: the stylesheet behind it is what makes the sheet's main action look
 * like one, and M5 has no visual baseline to catch it going missing. Both
 * shapes are asserted, because `large` reaches the checkbox and the stepper
 * through two different elements and one of them is easy to forget.
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX } from '@/composables/useLongPress'
import QuantityStepper from '../QuantityStepper.vue'

describe('QuantityStepper — one control, two sizes (G-6, FR-21.25)', () => {
  it('is a row-sized checkbox at quantity 1 unless a screen asks for more', () => {
    const wrapper = mount(QuantityStepper, { props: { quantity: 1, packed: 0 } })

    expect(wrapper.get('[data-testid="row-check"]').classes()).not.toContain('large')
  })

  it('takes the main-action size on the checkbox shape', () => {
    const wrapper = mount(QuantityStepper, { props: { quantity: 1, packed: 0, large: true } })

    expect(wrapper.get('[data-testid="row-check"]').classes()).toContain('large')
  })

  it('takes it on the stepper shape too, which is the half easily forgotten', () => {
    const wrapper = mount(QuantityStepper, { props: { quantity: 3, packed: 1, large: true } })

    expect(wrapper.get('.stepper').classes()).toContain('large')
    expect(
      mount(QuantityStepper, { props: { quantity: 3, packed: 1 } })
        .get('.stepper')
        .classes(),
    ).not.toContain('large')
  })
})

/**
 * The holds themselves (G-6, E2E-G6-01).
 *
 * Driven here rather than in Playwright for the reason `useLongPress`'
 * own docblock gives: the 500 ms need a deterministic seam, and a real
 * browser hold would be a timing dependency. `pointercancel` is the second
 * reason — it is the browser taking the pointer away to scroll with it, and
 * nothing in a Playwright case can ask for that.
 */
describe('QuantityStepper — a gesture the browser took away is not a hold (G-6)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function stepper() {
    return mount(QuantityStepper, { props: { quantity: 3, packed: 1 } })
  }

  /**
   * A real event, dispatched — `trigger` builds a `MouseEvent` and then
   * assigns `clientX` onto it, which jsdom refuses because the property is a
   * getter. The coordinates are the whole input to the travel slop, so they
   * cannot be dropped.
   */
  function pointer(w: ReturnType<typeof stepper>, testid: string, type: string, x = 10, y = 10) {
    w.get(`[data-testid="${testid}"]`).element.dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }),
    )
    return w.vm.$nextTick()
  }

  it('completes the row on a hold of +', async () => {
    const w = stepper()
    await pointer(w, 'row-plus', 'pointerdown')
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(w.emitted('complete')).toHaveLength(1)
    expect(w.emitted('increment')).toBeUndefined()
  })

  it('steps by one on a release of +', async () => {
    const w = stepper()
    await pointer(w, 'row-plus', 'pointerdown')
    await pointer(w, 'row-plus', 'pointerup')

    expect(w.emitted('increment')).toHaveLength(1)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(w.emitted('complete')).toBeUndefined()
  })

  it('zeroes the row on a hold of −, and steps down on a release', async () => {
    const w = stepper()
    await pointer(w, 'row-minus', 'pointerdown')
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(w.emitted('zero')).toHaveLength(1)

    const second = stepper()
    await pointer(second, 'row-minus', 'pointerdown')
    await pointer(second, 'row-minus', 'pointerup')
    expect(second.emitted('decrement')).toHaveLength(1)
  })

  it('packs nothing when the browser cancels the pointer to scroll with it', async () => {
    const w = stepper()
    await pointer(w, 'row-plus', 'pointerdown')
    await pointer(w, 'row-plus', 'pointercancel')

    // The whole point: nothing arrives now, and nothing arrives later. The
    // unfixed build had no `pointercancel` at all, so the timer outlived the
    // gesture and packed the row 500 ms into a scroll.
    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(w.emitted('complete')).toBeUndefined()
    expect(w.emitted('increment')).toBeUndefined()
  })

  it('packs nothing when the finger travels off into a scroll', async () => {
    const w = stepper()
    await pointer(w, 'row-plus', 'pointerdown')
    await pointer(w, 'row-plus', 'pointermove', 10, 10 + LONG_PRESS_SLOP_PX + 1)
    await pointer(w, 'row-plus', 'pointerup')

    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(w.emitted('complete')).toBeUndefined()
    expect(w.emitted('increment')).toBeUndefined()
  })

  it('packs nothing when the pointer leaves the button before it is released', async () => {
    const w = stepper()
    await pointer(w, 'row-plus', 'pointerdown')
    await pointer(w, 'row-plus', 'pointerleave')

    vi.advanceTimersByTime(LONG_PRESS_MS * 2)
    expect(w.emitted('complete')).toBeUndefined()
    expect(w.emitted('increment')).toBeUndefined()
  })

  it('packs nothing after the row it sat on is gone', async () => {
    const w = stepper()
    await pointer(w, 'row-plus', 'pointerdown')
    w.unmount()

    // There is no `emitted()` on an unmounted wrapper to read afterwards, so
    // the positive signal is the timer: a pending one is what would have
    // emitted, and clearing it is the whole fix.
    expect(vi.getTimerCount()).toBe(0)
  })
})
