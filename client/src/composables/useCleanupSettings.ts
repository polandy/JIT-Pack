import { ref } from 'vue'

import {
  DEFAULT_UNUSED_MONTHS,
  HYGIENE_RULES,
  UNUSED_MONTH_CHOICES,
  type HygieneRule,
  type HygieneSettings,
} from '@/domain/inventoryHygiene'

/**
 * What this device decided about M24's cleanup rules (FR-24.12): which rules
 * run, the „lange nicht gebraucht" window, and the findings „Behalten" was
 * pressed on.
 *
 * **Device-local**, FR-24.4's persistence class, the cheaper option by
 * choice. The honest cost is in the multi-user case: a
 * „Behalten" pressed on one phone is not seen on the other, so a household
 * member is asked about the same camping stove again. Syncing it would need a
 * column on `items` and `tags` and a reseed; the revisit trigger is that
 * complaint, written in FR-24.12.
 */

const STORAGE_KEY = 'jitpack_inventory_cleanup'

function defaults(): HygieneSettings {
  return {
    enabled: Object.fromEntries(HYGIENE_RULES.map((rule) => [rule, true])) as Record<
      HygieneRule,
      boolean
    >,
    unusedMonths: DEFAULT_UNUSED_MONTHS,
    keptItems: [],
    keptTags: [],
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function read(): HygieneSettings {
  const base = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Record<keyof HygieneSettings, unknown>>
    const enabled = { ...base.enabled }
    const stored = parsed.enabled as Record<string, unknown> | undefined
    // Only the rules this version knows, and only booleans — a rule a later
    // version added and this one lacks is simply not read.
    for (const rule of HYGIENE_RULES) {
      if (typeof stored?.[rule] === 'boolean') enabled[rule] = stored[rule] as boolean
    }
    const months = UNUSED_MONTH_CHOICES.includes(parsed.unusedMonths as never)
      ? (parsed.unusedMonths as number)
      : base.unusedMonths
    return {
      enabled,
      unusedMonths: months,
      keptItems: strings(parsed.keptItems),
      keptTags: strings(parsed.keptTags),
    }
  } catch {
    // Unreadable or refused storage: every rule on is a working state.
    return base
  }
}

/** Shared across callers, so M9's count and M24's list cannot disagree. */
const settings = ref<HygieneSettings>(read())

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
  } catch {
    // Not persistable — still applies for this session.
  }
}

function update(patch: Partial<HygieneSettings>): void {
  settings.value = { ...settings.value, ...patch }
  persist()
}

export function cleanupSettings() {
  function setRule(rule: HygieneRule, on: boolean): void {
    update({ enabled: { ...settings.value.enabled, [rule]: on } })
  }

  function setUnusedMonths(months: number): void {
    update({ unusedMonths: months })
  }

  function keepItem(itemId: string): void {
    update({ keptItems: [...settings.value.keptItems, itemId] })
  }

  function unkeepItem(itemId: string): void {
    update({ keptItems: settings.value.keptItems.filter((id) => id !== itemId) })
  }

  function keepTag(tagId: string): void {
    update({ keptTags: [...settings.value.keptTags, tagId] })
  }

  function unkeepTag(tagId: string): void {
    update({ keptTags: settings.value.keptTags.filter((id) => id !== tagId) })
  }

  /** Re-read the stored settings — what a reload sees. */
  function reload(): void {
    settings.value = read()
  }

  /** Back to every rule on and nothing kept. For tests. */
  function reset(): void {
    settings.value = defaults()
    persist()
  }

  return {
    settings,
    setRule,
    setUnusedMonths,
    keepItem,
    unkeepItem,
    keepTag,
    unkeepTag,
    reload,
    reset,
  }
}
