/**
 * A connection on a map (FR-29.18): each leg a line through the stops it
 * passes, coloured by what it travels by, and a dot where one gets on or
 * off. The rule of which legs can be drawn is `domain/connections.ts`'s;
 * this file only hands them to the kernel's map in its terms.
 */
import { LEG_HUE_CLASS, type MapLine } from '@/lib/trackColors'
import type { ConnectionLeg, LatLon, LegMode } from '@/types/domain'
import { legPath } from './domain/connections'

/** What a leg is drawn as: its mode, or a walk. */
export type LegHue = LegMode | 'walk'

export function legHue(leg: ConnectionLeg): LegHue {
  return leg.line === '' ? 'walk' : (leg.mode ?? 'train')
}

/** The legs that can be drawn, one line each, all of them chosen — one journey. */
export function connectionLines(legs: readonly ConnectionLeg[], key = 'leg'): MapLine[] {
  return legs.flatMap((leg, index) => {
    const points = legPath(leg)
    return points.length > 1
      ? [{ id: `${key}-${index}`, points, hueClass: LEG_HUE_CLASS[legHue(leg)], chosen: true }]
      : []
  })
}

/** Where one gets on or off: each drawn leg's ends, each once. */
export function connectionStops(legs: readonly ConnectionLeg[]): LatLon[] {
  const seen = new Set<string>()
  const stops: LatLon[] = []
  for (const leg of legs) {
    for (const at of [leg.fromAt, leg.toAt]) {
      if (!at || !leg.fromAt || !leg.toAt) continue
      const id = at.join(',')
      if (seen.has(id)) continue
      seen.add(id)
      stops.push(at)
    }
  }
  return stops
}

/** The kinds a connection's map shows, in the legend's order. */
export function legendHues(legs: readonly ConnectionLeg[]): LegHue[] {
  const order: LegHue[] = ['train', 'bus', 'boat', 'walk']
  const drawn = new Set(legs.filter((leg) => legPath(leg).length > 1).map(legHue))
  return order.filter((hue) => drawn.has(hue))
}
