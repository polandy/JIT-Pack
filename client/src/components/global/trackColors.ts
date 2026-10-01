/**
 * FR-29.17: the colour of each of an idea's tracks on a map, by its place
 * among them — the first in the brand's larch, then the palette's other
 * hues. Names of `--ct-*` tokens, never colours: the SVG lines and Leaflet's
 * paths both paint through a class that reads the token.
 */
export const TRACK_HUES = ['larch', 'glacier', 'heather', 'alpenrose', 'pine'] as const

/** The class a track's line carries: `jp-track-larch` and so on. */
export function trackHueClass(index: number): string {
  return `jp-track-${TRACK_HUES[index % TRACK_HUES.length]}`
}

/** One line on a map: whose it is, where it runs and whether it is the chosen one. */
export interface MapLine {
  id: string
  points: [number, number][]
  hueClass: string
  chosen: boolean
}
