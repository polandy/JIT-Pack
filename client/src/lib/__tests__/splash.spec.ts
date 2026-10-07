// @vitest-environment jsdom
/**
 * FR-21.29 — the greeting's device-local switch and the flight's geometry.
 *
 * The switch defaults to on, so the one value that matters is the one that
 * turns it off; and the flight must land the 152 px mark exactly on the
 * app bar's 22 px one, or the hand-over shows as a jump.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  SPLASH_GREETED_KEY,
  SPLASH_OFF,
  SPLASH_ON,
  SPLASH_STORAGE_KEY,
  claimGreeting,
  flightTransform,
  setSplashEnabled,
  splashEnabled,
} from '../splash'

describe('FR-21.29 splash preference', () => {
  beforeEach(() => localStorage.clear())

  it('greets on a device that never chose', () => {
    expect(splashEnabled()).toBe(true)
  })

  it('stays quiet once switched off, and greets again once switched back on', () => {
    setSplashEnabled(false)
    expect(localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(SPLASH_OFF)
    expect(splashEnabled()).toBe(false)

    setSplashEnabled(true)
    expect(localStorage.getItem(SPLASH_STORAGE_KEY)).toBe(SPLASH_ON)
    expect(splashEnabled()).toBe(true)
  })

  it('reads any value but the off value as on', () => {
    localStorage.setItem(SPLASH_STORAGE_KEY, 'garbage')
    expect(splashEnabled()).toBe(true)
  })
})

describe('FR-21.29 once per app start', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('greets the first load of a start and not the reloads the app makes of itself', () => {
    expect(claimGreeting()).toBe(true)
    expect(sessionStorage.getItem(SPLASH_GREETED_KEY)).not.toBeNull()
    expect(claimGreeting()).toBe(false)
  })

  it('switched off, greets no load and claims nothing', () => {
    setSplashEnabled(false)
    expect(claimGreeting()).toBe(false)
    expect(sessionStorage.getItem(SPLASH_GREETED_KEY)).toBeNull()
  })
})

describe('FR-21.29 flight', () => {
  it('moves the top-left corner onto the landing mark and scales to its width', () => {
    const from = { left: 130, top: 380, width: 152 }
    const to = { left: 16, top: 17, width: 22 }

    expect(flightTransform(from, to)).toBe(`translate(-114px, -363px) scale(${22 / 152})`)
  })
})
