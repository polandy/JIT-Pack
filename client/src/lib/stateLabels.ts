/**
 * What an item's `state` is called (FR-25.4/FR-7.3), beside `modeLabels.ts`
 * and following its shape.
 *
 * The sheet built the table inline on every read and reached `t` through
 * `as Parameters<typeof t>[0]`, which is a cast that stops the catalogue
 * from being checked at all: a renamed key compiles. Typed against
 * `MessageKey` instead, and against `ItemState` on the other side, so a
 * sixth state fails the build rather than rendering an empty string.
 */

import { t, type MessageKey } from '@/i18n'
import type { ItemState } from '@/types/domain'

/** The catalogue key for each `state` value. */
export const STATE_KEYS = {
  open: 'item.stateOpen',
  partial: 'item.statePartial',
  packed: 'item.statePacked',
  skipped: 'item.stateSkipped',
  packing_now: 'item.statePackingNow',
} as const satisfies Record<ItemState, MessageKey>

/**
 * The localised word for a state.
 *
 * `prepOpen` is FR-7.3's exception: a row can be packed and still owe a
 * task, and "gepackt" alone would be a lie about the one thing the sheet is
 * open to say. It outranks the state because it is the more surprising half.
 */
export function stateLabel(state: ItemState, options: { prepOpen?: boolean } = {}): string {
  if (options.prepOpen) return t('item.statePackedOpenPrep')
  return t(STATE_KEYS[state])
}
