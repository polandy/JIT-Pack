/**
 * The trip-attribute vocabulary (FR-2.1a): what M3 offers when a trip is
 * configured and what FR-15.2 position conditions test against. Hoisted here
 * because two screens read it — the M3 wizard summarising its fold, and the
 * M8 condition chips — and a value drifting between them would make a
 * condition unmatchable.
 */

import { t, type MessageKey } from '@/i18n'

/** `attributes.season` values. */
export const SEASONS = ['summer', 'winter', 'transitional'] as const

/** `attributes.transport_mode` values. */
export const TRANSPORT_MODES = ['car', 'bike', 'plane', 'train'] as const

/** `attributes.accommodation` values. */
export const ACCOMMODATIONS = ['hotel', 'holiday_flat', 'camping'] as const

/**
 * The catalogue key for each attribute value. One flat table because the
 * values are unique across the three groups, and an unknown one — a series
 * default written by an older version — falls back to itself rather than
 * to a blank.
 */
export const ATTRIBUTE_KEYS = {
  summer: 'season.summer',
  winter: 'season.winter',
  transitional: 'season.transitional',
  car: 'transport.car',
  bike: 'transport.bike',
  plane: 'transport.plane',
  train: 'transport.train',
  hotel: 'accommodation.hotel',
  holiday_flat: 'accommodation.holiday_flat',
  camping: 'accommodation.camping',
} as const satisfies Record<string, MessageKey>

/** The localised label for an attribute value, the value itself when unknown. */
export function attributeLabel(value: string): string {
  const key: MessageKey | undefined = (ATTRIBUTE_KEYS as Record<string, MessageKey>)[value]
  return key ? t(key) : value
}
