// @vitest-environment jsdom
/**
 * The signal a `<Transition>` gives when what it moves stands (`data-settled`),
 * which an e2e case waits on before pressing what the movement shifts
 * (E2E-M27-18, FR-29.18).
 *
 * Frames are stepped by hand: Vue starts each enter and leave a double
 * animation frame after it begins, and the point of the signal is the frames
 * in between, where nothing has moved yet.
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Transition, defineComponent, h, nextTick, ref } from 'vue'

import { useTransitionSettled } from '../transitionSettled'

let frames: FrameRequestCallback[] = []

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** One animation frame: what was waiting for it runs, and Vue renders what that changed. */
async function frame() {
  const due = frames.splice(0)
  for (const callback of due) callback(0)
  await nextTick()
}

/** The signal after every frame, until nothing waits for one. */
async function settledFrameByFrame(
  read: () => string | undefined,
): Promise<(string | undefined)[]> {
  const seen: (string | undefined)[] = []
  while (frames.length > 0) {
    await frame()
    seen.push(read())
  }
  return seen
}

/** A row swapped for a card, as the day entry's form swaps them (FR-29.18). */
function mountSwap(mode?: 'out-in') {
  const first = ref(true)
  const shown = ref(true)
  const Swap = defineComponent({
    setup() {
      const { settled, hooks } = useTransitionSettled()
      return () =>
        h('section', { 'data-settled': String(settled.value) }, [
          h(Transition, { name: 't', mode, ...hooks }, () =>
            !shown.value
              ? null
              : first.value
                ? h('p', { key: 'first' }, 'add a connection')
                : h('p', { key: 'second' }, 'the connection'),
          ),
        ])
    },
  })
  const wrapper = mount(Swap, { global: { stubs: { transition: false } } })
  return {
    wrapper,
    first,
    shown,
    settled: () => wrapper.get('section').attributes('data-settled'),
  }
}

describe('useTransitionSettled', () => {
  it('is settled while nothing moves', () => {
    expect(mountSwap('out-in').settled()).toBe('true')
  })

  it('stays unsettled through an out-in swap until the entering element has opened', async () => {
    const { wrapper, first, settled } = mountSwap('out-in')

    first.value = false
    await nextTick()
    expect(settled()).toBe('false')

    // Out-in starts the entering element before it reports the leaving one
    // gone; a flag cleared on that report reads "settled" for the frames the
    // entering one has not yet moved in.
    const seen = await settledFrameByFrame(settled)
    expect(seen.slice(0, -1)).not.toContain('true')
    expect(seen.at(-1)).toBe('true')
    expect(wrapper.text()).toBe('the connection')
  })

  it('stays unsettled while an element still leaves', async () => {
    const { shown, settled } = mountSwap()

    shown.value = false
    await nextTick()
    expect(settled()).toBe('false')
    const seen = await settledFrameByFrame(settled)
    expect(seen.slice(0, -1)).not.toContain('true')
    expect(seen.at(-1)).toBe('true')
  })

  it('is settled again once reset, whatever was still moving', async () => {
    const shown = ref(true)
    let reset = () => {}
    const Reset = defineComponent({
      setup() {
        const settle = useTransitionSettled()
        reset = settle.reset
        return () => [
          h(Transition, { name: 't', ...settle.hooks }, () => (shown.value ? h('p', 'x') : null)),
          h('i', { 'data-settled': String(settle.settled.value) }),
        ]
      },
    })
    const wrapper = mount(Reset, { global: { stubs: { transition: false } } })

    shown.value = false
    await nextTick()
    expect(wrapper.get('i').attributes('data-settled')).toBe('false')
    reset()
    await nextTick()
    expect(wrapper.get('i').attributes('data-settled')).toBe('true')
  })
})
