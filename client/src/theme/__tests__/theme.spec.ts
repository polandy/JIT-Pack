/**
 * Theming (Addendum 3.21): dark default independent of OS preference
 * (FR-21.1), device-local persistence (FR-21.3), synchronous apply at
 * boot so the resolved theme is set before first paint (FR-21.4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  LATTE_CLASS,
  THEME_STORAGE_KEY,
  currentTheme,
  initTheme,
  resolveTheme,
  setTheme,
} from '../theme'

let storage: Map<string, string>

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
  document.documentElement.classList.remove(LATTE_CLASS)
})

describe('resolveTheme', () => {
  const cases: { name: string; raw: string | null; want: 'mocha' | 'latte' }[] = [
    { name: 'no stored choice → dark default (FR-21.1)', raw: null, want: 'mocha' },
    { name: 'stored latte → latte', raw: 'latte', want: 'latte' },
    { name: 'stored mocha → mocha', raw: 'mocha', want: 'mocha' },
    { name: 'garbage → dark default', raw: 'solarized', want: 'mocha' },
    { name: 'empty string → dark default', raw: '', want: 'mocha' },
  ]
  it.each(cases)('$name', ({ raw, want }) => {
    expect(resolveTheme(raw)).toBe(want)
  })
})

describe('initTheme', () => {
  it('applies mocha (no root class) when nothing is persisted', () => {
    expect(initTheme()).toBe('mocha')
    expect(document.documentElement.classList.contains(LATTE_CLASS)).toBe(false)
  })

  it('applies the persisted latte choice before mount', () => {
    storage.set(THEME_STORAGE_KEY, 'latte')
    expect(initTheme()).toBe('latte')
    expect(document.documentElement.classList.contains(LATTE_CLASS)).toBe(true)
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
    expect(initTheme()).toBe('mocha')
  })
})

describe('setTheme / currentTheme', () => {
  it('latte persists the choice and tags the root element', () => {
    setTheme('latte')
    expect(storage.get(THEME_STORAGE_KEY)).toBe('latte')
    expect(document.documentElement.classList.contains(LATTE_CLASS)).toBe(true)
    expect(currentTheme()).toBe('latte')
  })

  it('switching back to mocha removes the root tag and persists', () => {
    setTheme('latte')
    setTheme('mocha')
    expect(storage.get(THEME_STORAGE_KEY)).toBe('mocha')
    expect(document.documentElement.classList.contains(LATTE_CLASS)).toBe(false)
    expect(currentTheme()).toBe('mocha')
  })
})
