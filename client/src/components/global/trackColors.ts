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

/**
 * FR-29.18: a connection's legs on a map, by what each travels by — the
 * colours the timetable's own line chips use — and a walk dotted.
 */
export const LEG_HUE_CLASS = {
  train: 'jp-leg-train',
  bus: 'jp-leg-bus',
  boat: 'jp-leg-boat',
  walk: 'jp-leg-walk',
} as const

/** One line on a map: whose it is, where it runs and whether it is the chosen one. */
export interface MapLine {
  id: string
  points: [number, number][]
  hueClass: string
  chosen: boolean
}

/**
 * FR-29.19: a person on a map — this device's own position, or another
 * traveller's — drawn over the lines, never framed by them.
 */
export interface MapMark {
  id: string
  kind: 'me' | 'person'
  lat: number
  lon: number
  /** The device's uncertainty in metres, drawn as a circle around the own mark. */
  accuracyM: number
  /** One or two letters on a person's mark. */
  initials: string
  /** What the mark says when asked: „Sia · vor 2 min". */
  title: string
}
