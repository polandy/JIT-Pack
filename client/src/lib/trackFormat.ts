/**
 * How a track's figures read (FR-29.17) — on the board's card and on the
 * track card alike. Presentation, so here and not in `domain/track.ts`.
 */
import { roundToFive } from '@/domain/track'
import { formatNumber, t } from '@/i18n'

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
