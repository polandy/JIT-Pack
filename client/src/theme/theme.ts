/**
 * Theme selection (Addendum 3.21): Nacht is the app-level dark default in
 * every mode — deliberately independent of the OS color-scheme preference
 * (FR-21.1). Tag is the opt-in light theme, persisted as a device-local
 * display preference (FR-21.3, same localStorage pattern as the M19 mode
 * choice) and applied synchronously at boot so the resolved theme is set
 * before first paint (FR-21.4; index.html additionally pre-applies it
 * before the bundle loads).
 *
 * The palettes themselves live in palette.css — this module only flips
 * the root class that selects between them.
 */

export type Theme = 'night' | 'day'

export const THEME_STORAGE_KEY = 'jitpack_theme'

/** Root class selecting the Tag block in palette.css; its absence means Nacht. */
export const DAY_CLASS = 'jitpack-day'

/**
 * The value the light choice was persisted under before ADR-048, when the
 * flavours were Catppuccin's Latte and Mocha. A device that chose light
 * before the palette changed keeps its choice; nothing writes this value
 * any more, so it can go once no installed device predates the change.
 */
export const LEGACY_LIGHT_VALUE = 'latte'

/** Maps a persisted value to a theme; anything but an explicit light choice is the dark default. */
export function resolveTheme(raw: string | null): Theme {
  return raw === 'day' || raw === LEGACY_LIGHT_VALUE ? 'day' : 'night'
}

/** Tags the root element for the given theme (display only, no persistence). */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DAY_CLASS, theme === 'day')
  syncThemeColorMeta()
}

/**
 * Repaints the `theme-color` meta from the flavour's own `--ct-base`
 * (NFR-4.13): installed-PWA chrome follows the theme, and the value is read
 * from the computed token so palette.css stays the only colour source
 * (invariant 9). index.html carries the static dark default for first paint.
 */
function syncThemeColorMeta(): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  const base = getComputedStyle(document.documentElement).getPropertyValue('--ct-base').trim()
  if (base) meta.setAttribute('content', base)
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
  return document.documentElement.classList.contains(DAY_CLASS) ? 'day' : 'night'
}
