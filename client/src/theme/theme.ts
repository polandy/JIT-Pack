/**
 * Theme selection (Addendum 3.21): Catppuccin Mocha is the app-level
 * dark default in every mode — deliberately independent of the OS
 * color-scheme preference (FR-21.1). Latte is the opt-in light theme,
 * persisted as a device-local display preference (FR-21.3, same
 * localStorage pattern as the M19 mode choice) and applied
 * synchronously at boot so the resolved theme is set before first
 * paint (FR-21.4; index.html additionally pre-applies it before the
 * bundle loads).
 *
 * The palettes themselves live in catppuccin.css — this module only
 * flips the root class that selects between them.
 */

export type Theme = 'mocha' | 'latte'

export const THEME_STORAGE_KEY = 'jitpack_theme'

/** Root class selecting the Latte block in catppuccin.css; its absence means Mocha. */
export const LATTE_CLASS = 'jitpack-latte'

/** Maps a persisted value to a theme; anything but an explicit 'latte' is the dark default. */
export function resolveTheme(raw: string | null): Theme {
  return raw === 'latte' ? 'latte' : 'mocha'
}

/** Tags the root element for the given theme (display only, no persistence). */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(LATTE_CLASS, theme === 'latte')
}

/** Reads the persisted choice and applies it; called before mount (FR-21.4). */
export function initTheme(): Theme {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode) → dark default, nothing to read.
  }
  const theme = resolveTheme(raw)
  applyTheme(theme)
  return theme
}

/** Persists and applies a theme choice (the M17 Appearance toggle). */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Not persistable → still apply for this session.
  }
  applyTheme(theme)
}

/** The currently applied theme, derived from the root element. */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains(LATTE_CLASS) ? 'latte' : 'mocha'
}
