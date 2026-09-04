/**
 * How an item is obtained (FR-25.4a's `mode`) as a word and a glyph.
 *
 * The mapping was spelled out in seven views — three of them with their own
 * `Record<ItemMode, …>`, four with an `if`-chain — so a fourth mode, or a
 * changed glyph, meant finding all seven. It sits beside `roleLabels.ts` and
 * follows its shape: the catalogue keys are exported, so a caller that needs
 * the key rather than the rendered string (a facet list, a checklist) reads
 * the same table.
 */

import { bagHandleOutline, cartOutline, locationOutline } from 'ionicons/icons'

import { t, type MessageKey } from '@/i18n'
import type { ItemMode } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL } from '@/types/domain'

/** The catalogue key for each `mode` value. */
export const MODE_KEYS = {
  pack: 'mode.pack',
  buy_before: 'mode.buyBefore',
  buy_local: 'mode.buyLocal',
} as const satisfies Record<ItemMode, MessageKey>

/** The localised word for a mode; the raw value when it is not one we know. */
export function modeLabel(mode: string): string {
  const key: MessageKey | undefined = (MODE_KEYS as Record<string, MessageKey>)[mode]
  return key ? t(key) : mode
}

/**
 * The glyph for a mode. `silentPack` is FR-25.4a's rule for a dense list:
 * 🧳 is the dominant case, so a row that only packs shows nothing rather
 * than repeating the obvious on every line. A sheet or a detail view, where
 * one row is the whole subject, asks for the bag instead.
 */
/**
 * The options a dense row list asks with: one line per item, so the dominant
 * 🧳 is left unsaid. Named here rather than spelled at each call site —
 * M4 lost the rule in exactly that way, by omitting the argument.
 */
export const DENSE_LIST = { silentPack: true } as const

export function modeIcon(mode: string, options: { silentPack?: boolean } = {}): string | null {
  if (mode === ITEM_MODE_BUY_BEFORE) return cartOutline
  if (mode === ITEM_MODE_BUY_LOCAL) return locationOutline
  return options.silentPack ? null : bagHandleOutline
}
