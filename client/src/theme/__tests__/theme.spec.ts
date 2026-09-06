// @vitest-environment jsdom
/**
 * Theming (Addendum 3.21): dark default independent of OS preference
 * (FR-21.1), device-local persistence (FR-21.3), synchronous apply at
 * boot so the resolved theme is set before first paint (FR-21.4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  DAY_CLASS,
  LEGACY_LIGHT_VALUE,
  THEME_STORAGE_KEY,
  currentTheme,
  initTheme,
  resolveTheme,
  setTheme,
} from '../theme'
import type { Theme } from '../theme'

beforeEach(() => {
  // jsdom supplies the real Storage; stubbing it here would mean asserting
  // against the stub instead of against the API the code actually writes to.
  localStorage.clear()
  document.documentElement.classList.remove(DAY_CLASS)
})

describe('resolveTheme', () => {
  const cases: { name: string; raw: string | null; want: Theme }[] = [
    { name: 'no stored choice → dark default (FR-21.1)', raw: null, want: 'night' },
    { name: 'stored day → day', raw: 'day', want: 'day' },
    { name: 'stored night → night', raw: 'night', want: 'night' },
    // ADR-048: a device that chose light before the palette changed keeps it.
    { name: 'legacy latte → day', raw: LEGACY_LIGHT_VALUE, want: 'day' },
    { name: 'legacy mocha → dark default', raw: 'night', want: 'night' },
    { name: 'garbage → dark default', raw: 'solarized', want: 'night' },
    { name: 'empty string → dark default', raw: '', want: 'night' },
  ]
  it.each(cases)('$name', ({ raw, want }) => {
    expect(resolveTheme(raw)).toBe(want)
  })
})

describe('initTheme', () => {
  it('applies night (no root class) when nothing is persisted', () => {
    expect(initTheme()).toBe('night')
    expect(document.documentElement.classList.contains(DAY_CLASS)).toBe(false)
  })

  it('applies the persisted day choice before mount', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'day')
    expect(initTheme()).toBe('day')
    expect(document.documentElement.classList.contains(DAY_CLASS)).toBe(true)
  })

  it('survives an unavailable localStorage (private mode) with the dark default', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(initTheme()).toBe('night')
  })
})

describe('theme-color meta (NFR-4.13)', () => {
  // The browser chrome around an installed PWA is painted from this meta,
  // so it has to follow the flavour. The value is read from the computed
  // --ct-base token — palette.css stays the only place a colour lives.
  beforeEach(() => {
    document.querySelector('meta[name="theme-color"]')?.remove()
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => {
        if (name !== '--ct-base') return ''
        return document.documentElement.classList.contains(DAY_CLASS) ? '#ffffff' : '#1b2327'
      },
    }))
  })

  it('retargets the meta to the flavour base on every apply', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#1b2327')
    document.head.appendChild(meta)

    setTheme('day')
    expect(meta.getAttribute('content')).toBe('#ffffff')
    setTheme('night')
    expect(meta.getAttribute('content')).toBe('#1b2327')
  })

  it('survives a document without the meta tag', () => {
    expect(() => setTheme('day')).not.toThrow()
  })

  it('leaves the meta alone when the token does not resolve (test harness, detached doc)', () => {
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#1b2327')
    document.head.appendChild(meta)

    setTheme('day')
    expect(meta.getAttribute('content')).toBe('#1b2327')
  })
})

describe('setTheme / currentTheme', () => {
  it('day persists the choice and tags the root element', () => {
    setTheme('day')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('day')
    expect(document.documentElement.classList.contains(DAY_CLASS)).toBe(true)
    expect(currentTheme()).toBe('day')
  })

  it('switching back to night removes the root tag and persists', () => {
    setTheme('day')
    setTheme('night')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('night')
    expect(document.documentElement.classList.contains(DAY_CLASS)).toBe(false)
    expect(currentTheme()).toBe('night')
  })
})
