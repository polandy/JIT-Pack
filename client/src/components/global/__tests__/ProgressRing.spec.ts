// @vitest-environment jsdom
/**
 * A share as a ring (G-14, FR-21.13).
 *
 * The two things worth pinning are the ones a caller cannot see going
 * wrong: the clamp, because a rounding upstream turns 100.4 into an arc
 * that has wrapped past its own start, and the accessible name, because
 * the number inside is `aria-hidden` — the ring is one object to a screen
 * reader, not a decoration with a stray digit in it.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProgressRing from '../ProgressRing.vue'

/** The share the ring hands its own gradient, as a number. */
function share(wrapper: ReturnType<typeof mount>): number {
  return Number(
    wrapper
      .get('.ring')
      .attributes('style')!
      .match(/--ring-share:\s*([\d.]+)/)![1],
  )
}

describe('ProgressRing — a share, read at a glance (G-14)', () => {
  it('paints the arc at the share it was given', () => {
    const wrapper = mount(ProgressRing, { props: { percent: 62 } })

    expect(share(wrapper)).toBe(62)
    expect(wrapper.get('.share').text()).toBe('62')
  })

  it('rounds the number it prints without moving the arc it draws', () => {
    const wrapper = mount(ProgressRing, { props: { percent: 61.6 } })

    expect(wrapper.get('.share').text()).toBe('62')
    expect(share(wrapper)).toBe(61.6)
  })

  it('clamps a share that came in out of range', () => {
    // A caller's rounding is not this component's problem, but an arc past
    // 100 wraps back over its own start and reads as *less* than full.
    expect(share(mount(ProgressRing, { props: { percent: 140 } }))).toBe(100)
    expect(share(mount(ProgressRing, { props: { percent: -8 } }))).toBe(0)
  })

  it('names itself for a reader, and hides the digit inside it', () => {
    const wrapper = mount(ProgressRing, { props: { percent: 62 } })

    expect(wrapper.get('.ring').attributes('aria-label')).toBe('62%')
    expect(wrapper.get('.share').attributes('aria-hidden')).toBe('true')
  })

  it('takes its diameter from the caller, defaulting to the hero size', () => {
    expect(
      mount(ProgressRing, { props: { percent: 0 } })
        .get('.ring')
        .attributes('style'),
    ).toContain('--ring-size: 58px')
    expect(
      mount(ProgressRing, { props: { percent: 0, size: 34 } })
        .get('.ring')
        .attributes('style'),
    ).toContain('--ring-size: 34px')
  })
})
