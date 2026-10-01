/**
 * How a track's figures read (FR-29.17) — on the board's card, the track
 * card and an excursion's row alike. Presentation, so here and not in `domain/track.ts`.
 */
import { roundToFive } from '@/domain/track'
import { formatNumber, t } from '@/i18n'
import type { TrackFields } from '@/types/domain'

/** „7,4 km" — one decimal below ten kilometres, none from there. */
export function formatDistance(metres: number): string {
  const km = metres / 1000
  return `${formatNumber(km, { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}

/** „1'752 m". */
export function formatMetres(metres: number): string {
  return `${formatNumber(Math.round(metres))} m`
}

/** „3 h 25" — every time on a track card is rounded to five minutes. */
export function formatDuration(minutes: number): string {
  const rounded = roundToFive(minutes)
  return t('track.duration', {
    h: Math.floor(rounded / 60),
    m: String(rounded % 60).padStart(2, '0'),
  })
}

/**
 * „7,4 km · ↑ 520 m · +1" — a set of tracks in a line: the first one's
 * distance and climb, and how many more there are. Null for none.
 */
export function tracksSummary(
  tracks: readonly Pick<TrackFields, 'kind' | 'distance_m' | 'ascent_m'>[],
): { kind: TrackFields['kind']; text: string } | null {
  const first = tracks[0]
  if (!first) return null
  const parts = [formatDistance(first.distance_m)]
  if (first.ascent_m !== null) parts.push(`↑ ${formatMetres(first.ascent_m)}`)
  if (tracks.length > 1) parts.push(`+${tracks.length - 1}`)
  return { kind: first.kind, text: parts.join(' · ') }
}
