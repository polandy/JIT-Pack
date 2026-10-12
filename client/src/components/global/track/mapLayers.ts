/**
 * What every Leaflet map of tracks shares (FR-29.17, FR-29.20): the two tile
 * sources with the attribution their licence asks for, Leaflet itself
 * loaded with the first map that needs it, and the arrows that show which
 * way a line is walked.
 */
import type * as Leaflet from 'leaflet'

import { arrowMarks } from '@/domain/shared/route'
import type { MapSource } from '@/domain/shared/track'

/** Where each source's tiles come from, and what its licence asks to be said. */
export const TILES: Record<MapSource, { url: string; attribution: string; maxZoom: number }> = {
  swisstopo: {
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    attribution:
      '© <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a>',
    maxZoom: 18,
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19,
  },
}

let loaded: typeof Leaflet | null = null

/** Leaflet and its stylesheet, fetched once by the first map. */
export async function loadLeaflet(): Promise<typeof Leaflet> {
  loaded ??= await import('leaflet')
  await import('leaflet/dist/leaflet.css')
  return loaded
}

/** A source's tiles as a layer, drawn sharp on a phone's dense screen. */
export function tileLayer(L: typeof Leaflet, source: MapSource): Leaflet.TileLayer {
  const spec = TILES[source]
  // A phone's screen has two or three pixels to a point: a tile from one
  // zoom further, drawn half the size, keeps a map's lettering sharp.
  return L.tileLayer(spec.url, {
    maxZoom: spec.maxZoom,
    attribution: spec.attribution,
    detectRetina: true,
  })
}

const ARROW_SIZE = 14

/** One arrow glyph, turned to the way the line runs. */
function arrowIcon(L: typeof Leaflet, degrees: number): Leaflet.DivIcon {
  return L.divIcon({
    className: 'jp-route-arrow',
    iconSize: [ARROW_SIZE, ARROW_SIZE],
    iconAnchor: [ARROW_SIZE / 2, ARROW_SIZE / 2],
    html:
      `<svg viewBox="0 0 10 10" style="transform:rotate(${degrees.toFixed(1)}deg)" aria-hidden="true">` +
      '<path class="edge" d="M3 1.5L7 5l-4 3.5"/><path d="M3 1.5L7 5l-4 3.5"/></svg>',
  })
}

/**
 * Arrows along a line, laid out on the screen so they keep their spacing
 * at every zoom — and laid out again after each zoom. Returns the layer;
 * removing it stops the relayout.
 */
export function directionArrows(
  L: typeof Leaflet,
  map: Leaflet.Map,
  points: () => [number, number][],
): Leaflet.LayerGroup {
  const group = L.layerGroup()
  const lay = () => {
    group.clearLayers()
    const screen = points().map((p) => map.latLngToLayerPoint(p))
    for (const mark of arrowMarks(screen)) {
      L.marker(map.layerPointToLatLng(L.point(mark.x, mark.y)), {
        icon: arrowIcon(L, mark.degrees),
        interactive: false,
        keyboard: false,
      }).addTo(group)
    }
  }
  group.on('add', () => {
    map.on('zoomend', lay)
    // A map not yet framed has no zoom to lay out at; it lays out once it has.
    map.whenReady(lay)
  })
  group.on('remove', () => map.off('zoomend', lay))
  return group
}
