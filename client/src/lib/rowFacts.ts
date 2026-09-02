/**
 * The sentences a packing row says about itself — packed by whom, held by
 * whom, left behind why — worded once for both screens that show them.
 *
 * M4's list and M5's sheet had each written all five: the same fields, the
 * same catalogue keys, and already two different answers. M5 appended the
 * responsible person to the packed line with a `·`, M4 rendered it as its
 * own span; M5 said "packed by somebody" for a row with an unreadable
 * timestamp where M4 said nothing at all. Neither difference was a
 * decision — they are two transcriptions of one rule.
 *
 * The composition stays with the screens (the `·` is M5's), the wording
 * comes from here. It lives in `lib/` rather than `domain/` because it
 * reads the catalogue, and `domain/` must not import the i18n layer.
 */
import { relativeStamp, type RelativeStamp } from '@/domain/stamp'
import { skippedVia } from '@/domain/dependencies'
import { currentLocale, t } from '@/i18n'
import type { ItemDependency, TripItem } from '@/types/domain'

/** Anything that can name a user — the directory, the roster, or both. */
export interface NamedUser {
  user_id: string
  display_name: string
}

/**
 * The display name behind an id, or `null` where nobody can be named — a
 * line then says less rather than something untrue (G-8). Four screens had
 * their own copy of this lookup, two of them falling back to the raw uuid.
 */
export function nameFrom(directory: readonly NamedUser[], userId: string | null): string | null {
  if (!userId) return null
  return directory.find((user) => user.user_id === userId)?.display_name ?? null
}

/** How a name is found for one row; the screens differ in where they look. */
export type NameOf = (userId: string | null) => string | null

/**
 * "heute 14:32" — the relative day and the absolute time, worded. An empty
 * string where there is no readable timestamp, so a caller can still name
 * the person without saying when.
 */
export function stampText(stamp: RelativeStamp | null): string {
  if (!stamp) return ''
  const day = stamp.dayKey
    ? t(stamp.dayKey === 'today' ? 'stamp.today' : 'stamp.yesterday')
    : stamp.date
  return `${day} ${stamp.time}`
}

/** The packing fields both screens read; a `TripItem` satisfies it. */
export type PackedFacts = Pick<TripItem, 'packed_at' | 'packed_by_user_id' | 'packer_user_id'>

/**
 * FR-25.17: "gepackt von Andy · heute 14:32". `null` when the row says
 * neither who nor when — the state badge has already said it is packed.
 */
export function packedStampText(
  item: PackedFacts,
  nameOf: NameOf,
  now: Date = new Date(),
): string | null {
  if (!item.packed_at && !item.packed_by_user_id) return null
  const when = stampText(
    item.packed_at ? relativeStamp(item.packed_at, now, currentLocale()) : null,
  )
  const who = nameOf(item.packed_by_user_id)
  if (who) return t('packing.packedBy', { who, when })
  return when ? t('packing.packedByUnknown', { when }) : null
}

/**
 * FR-25.19: who the row was handed to, named only where that is somebody
 * other than whoever packed it — otherwise it repeats the line above.
 */
export function responsibleNote(item: PackedFacts, nameOf: NameOf): string | null {
  if (!item.packer_user_id || item.packer_user_id === item.packed_by_user_id) return null
  const who = nameOf(item.packer_user_id)
  return who ? t('packing.responsibleWas', { who }) : null
}

/**
 * G-3: the row names who is holding it, not only that it is held — a
 * padlock alone says a row is unavailable without saying who to ask.
 * `null` where nobody holds it.
 */
export function lockNoteText(holderId: string | null, nameOf: NameOf): string | null {
  if (holderId === null) return null
  const who = nameOf(holderId)
  return who ? t('packing.lockedBy', { who }) : t('packing.lockedByUnknown')
}

/**
 * FR-5.5: what a revealed *skipped* row says of itself — and, where the
 * FR-20.2 cascade put it there, which decision took it along.
 */
export function skippedNote(
  item: TripItem,
  rows: readonly TripItem[],
  dependencies: ItemDependency[],
): string | null {
  if (item.state !== 'skipped') return null
  const via = skippedVia(item, rows, dependencies)
  return via ? t('packing.skippedVia', { name: via.name }) : t('packing.skipped')
}
