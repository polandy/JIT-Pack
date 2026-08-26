/**
 * Internationalization (NFR-4.12): English primary/default, German fully
 * supported. Deliberately dependency-free — two locales need key lookup,
 * `{placeholder}` interpolation and a one/other plural rule, and date/number
 * formatting is `Intl`, which every target browser ships. The justification
 * and the revisit trigger (a locale with richer plural forms, or a need for
 * message-format features) are recorded in the addendum under NFR-4.12.
 *
 * The call shape mirrors vue-i18n (`t('key', { n })`) so adopting the library
 * later stays a swap of this module rather than a rewrite of every call site.
 *
 * `locale` is a ref, so `t()` used in a template or computed re-evaluates when
 * the language changes — no reload, no event bus.
 */
import { ref } from 'vue'

import { de } from './messages/de'
import { en } from './messages/en'

export type Locale = 'en' | 'de'

/** Message keys are those of the English catalogue, which is the source of truth. */
export type MessageKey = keyof typeof en

/** Values substituted into `{placeholder}` slots; `n` additionally drives pluralization. */
export type MessageParams = Record<string, string | number>

export const LOCALE_STORAGE_KEY = 'jitpack_locale'

/** English is the default, so it is also the fallback for any untranslated key. */
export const DEFAULT_LOCALE: Locale = 'en'

const catalogues: Record<Locale, Record<string, string>> = { en, de }

const locale = ref<Locale>(DEFAULT_LOCALE)

function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'de'
}

/**
 * Picks the locale from an explicit persisted choice, falling back to the
 * browser's languages and finally to English. A stored value that is no longer
 * supported is treated as absent rather than as an error.
 */
export function resolveLocale(raw: string | null): Locale {
  if (isLocale(raw)) return raw
  const languages = globalThis.navigator?.languages ?? []
  return languages.some((tag) => tag.toLowerCase().startsWith('de')) ? 'de' : DEFAULT_LOCALE
}

/** Applies a locale for this session (display only, no persistence). */
function applyLocale(next: Locale): void {
  locale.value = next
  // Lets the browser hyphenate, spell-check and read the UI in the right language.
  document.documentElement.lang = next
}

/** Reads the persisted choice and applies it; called before mount, like initTheme. */
export function initLocale(): Locale {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode) → fall back to the browser hint.
  }
  const next = resolveLocale(raw)
  applyLocale(next)
  return next
}

/** Persists and applies a language choice (the M17 Language setting). */
export function setLocale(next: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // Not persistable → still apply for this session.
  }
  applyLocale(next)
}

/** The active locale. Reactive: reading it in a template tracks language changes. */
export function currentLocale(): Locale {
  return locale.value
}

/**
 * Chooses between the `singular | plural` forms of a message.
 * English and German share the same rule — exactly one is singular, and zero
 * takes the plural form ("0 items left").
 */
function selectPlural(message: string, params?: MessageParams): string {
  const [singular, plural] = message.split(' | ')
  if (plural === undefined || singular === undefined) return message
  return params?.n === 1 ? singular : plural
}

/**
 * Substitutes `{name}` slots. An unmatched placeholder is left verbatim: a
 * visible `{n}` in the UI is a bug report, whereas "undefined" reads as data loss.
 */
function interpolate(message: string, params?: MessageParams): string {
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in params ? String(params[name]) : slot,
  )
}

/**
 * Translates a key in the active locale, falling back to English and finally to
 * the key itself — a missing string shows as `packing.title`, never as blank
 * space, so the gap is obvious in review instead of silently swallowed.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const message = catalogues[locale.value][key] ?? catalogues[DEFAULT_LOCALE][key] ?? key
  return interpolate(selectPlural(message, params), params)
}

/**
 * The concrete BCP-47 tag handed to Intl: the browser's own regional variant
 * of the active language when it offers one (`de` → `de-CH` on a Swiss
 * device), else the bare language code. The language is the app's choice,
 * the regional conventions (decimal separators, date punctuation) are the
 * device's — a de-CH household writes 12.50 where de-DE writes 12,50.
 */
export function intlLocale(): string {
  const languages = globalThis.navigator?.languages ?? []
  return languages.find((tag) => tag.toLowerCase().startsWith(locale.value)) ?? locale.value
}

/** Locale-aware number formatting (NFR-4.12 scope note). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(), options).format(value)
}

/** Locale-aware date formatting; defaults to a compact, unambiguous day/month/year. */
export function formatDate(value: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(
    intlLocale(),
    options ?? { year: 'numeric', month: 'short', day: 'numeric' },
  ).format(value)
}

/**
 * Calendar-day presentation per locale (UX-5): numeric two-digit for German
 * (22.08.2026), short month for English (Aug 22, 2026) — the numeric form
 * would read as month-first there.
 */
const dayOptions: Record<Locale, Intl.DateTimeFormatOptions> = {
  de: { day: '2-digit', month: '2-digit', year: 'numeric' },
  en: { day: 'numeric', month: 'short', year: 'numeric' },
}

/**
 * An ISO `YYYY-MM-DD` as a *local* calendar day. `new Date(iso)` would parse
 * UTC midnight, which is the previous day west of Greenwich.
 */
function parseISODay(iso: string): Date {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Formats one ISO calendar day in the active locale (UX-5). */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), dayOptions[locale.value]).format(parseISODay(iso))
}

/**
 * Formats an ISO day range, letting Intl collapse the shared parts:
 * `22.08. – 05.09.2026` inside one year, both years across a boundary.
 */
export function formatDayRange(startIso: string, endIso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), dayOptions[locale.value]).formatRange(
    parseISODay(startIso),
    parseISODay(endIso),
  )
}
