// @vitest-environment jsdom
/**
 * FR-21.29 / G-22 — the startup greeting.
 *
 * What a DOM without layout can state exactly: the greeting hands over on
 * time (to the logo it lands on, or by fading when the first screen shows
 * none), a tap or a key ends it at once, reduced motion skips the flight,
 * and the landing logo is hidden only while the flying one is on its way.
 * The intro itself is CSS and is eyeballed, not asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import SplashScreen from '../SplashScreen.vue'
import {
  SPLASH_FLIGHT_AT_MS,
  SPLASH_LEAVE_MS,
  SPLASH_REDUCED_AT_MS,
  SPLASH_REDUCED_LEAVE_MS,
  SPLASH_TARGET_ATTR,
} from '@/lib/splash'

const LANDING_HIDDEN = 'jp-splash-landing'

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }))
}

/** A landing mark with a layout box, which jsdom does not give on its own. */
function addLandingMark(): HTMLElement {
  const target = document.createElement('span')
  target.setAttribute(SPLASH_TARGET_ATTR, '')
  target.getBoundingClientRect = () => ({ left: 16, top: 17, width: 22, height: 22 }) as DOMRect
  document.body.appendChild(target)
  return target
}

/** The splash's own mark, laid out at its centred 152 px. */
function layOutSplashMark(): void {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 130,
    top: 380,
    width: 152,
    height: 152,
  } as DOMRect)
}

function phase(wrapper: ReturnType<typeof mount>): string | undefined {
  return wrapper.get('[data-testid="splash"]').attributes('data-phase')
}

describe('SplashScreen (FR-21.29, G-22)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubReducedMotion(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.documentElement.className = ''
  })

  it('plays the intro, flies to the landing logo, then hands over', async () => {
    addLandingMark()
    layOutSplashMark()
    const wrapper = mount(SplashScreen, { attachTo: document.body })

    expect(phase(wrapper)).toBe('intro')
    expect(document.documentElement.classList.contains(LANDING_HIDDEN)).toBe(true)

    await vi.advanceTimersByTimeAsync(SPLASH_FLIGHT_AT_MS)
    expect(phase(wrapper)).toBe('flight')
    expect(wrapper.get('svg').attributes('style')).toContain(
      `translate(-114px, -363px) scale(${22 / 152})`,
    )
    expect(wrapper.emitted('done')).toBeUndefined()

    await vi.advanceTimersByTimeAsync(SPLASH_LEAVE_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(document.documentElement.classList.contains(LANDING_HIDDEN)).toBe(false)
  })

  it('fades instead of flying when the first screen shows no logo', async () => {
    const wrapper = mount(SplashScreen, { attachTo: document.body })

    await vi.advanceTimersByTimeAsync(SPLASH_FLIGHT_AT_MS)
    expect(phase(wrapper)).toBe('fade')
    expect(document.documentElement.classList.contains(LANDING_HIDDEN)).toBe(false)

    await vi.advanceTimersByTimeAsync(SPLASH_LEAVE_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('ends at once on a tap, and only once', async () => {
    addLandingMark()
    const wrapper = mount(SplashScreen, { attachTo: document.body })

    await wrapper.get('[data-testid="splash"]').trigger('click')
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(document.documentElement.classList.contains(LANDING_HIDDEN)).toBe(false)

    await vi.advanceTimersByTimeAsync(SPLASH_FLIGHT_AT_MS + SPLASH_LEAVE_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('ends at once on a key', async () => {
    const wrapper = mount(SplashScreen, { attachTo: document.body })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('under reduced motion stands still and fades, never flies', async () => {
    stubReducedMotion(true)
    addLandingMark()
    const wrapper = mount(SplashScreen, { attachTo: document.body })

    expect(document.documentElement.classList.contains(LANDING_HIDDEN)).toBe(false)
    await vi.advanceTimersByTimeAsync(SPLASH_REDUCED_AT_MS)
    expect(phase(wrapper)).toBe('fade')

    await vi.advanceTimersByTimeAsync(SPLASH_REDUCED_LEAVE_MS)
    expect(wrapper.emitted('done')).toHaveLength(1)
  })
})
