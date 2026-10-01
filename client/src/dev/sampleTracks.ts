/**
 * GPX files for the dev seed (FR-29.17, FR-31.15): two routes in the Upper
 * Engadin for an idea, and a round to the Segantini hut for the hut tour's
 * excursion, drawn through a handful of waypoints and filled in between with a
 * little deterministic wobble, the way a recording looks. Dev only, like the
 * rest of `src/dev/`.
 */

/** A waypoint: latitude, longitude, height in metres. */
type Waypoint = readonly [number, number, number]

interface SampleRoute {
  fileName: string
  name: string
  type: string
  waypoints: readonly Waypoint[]
}

export const SAMPLE_ROUTES: readonly SampleRoute[] = [
  {
    fileName: 'muottas-muragl-alp-languard.gpx',
    name: 'Höhenweg Muottas Muragl – Alp Languard',
    type: 'hiking',
    waypoints: [
      [46.5236, 9.9047, 2456],
      [46.518, 9.912, 2520],
      [46.511, 9.917, 2480],
      [46.504, 9.92, 2420],
      [46.497, 9.9195, 2360],
      [46.4934, 9.9192, 2330],
    ],
  },
  {
    fileName: 'innradweg-st-moritz-maloja.gpx',
    name: 'Seenradweg St. Moritz – Maloja',
    type: 'cycling',
    waypoints: [
      [46.498, 9.838, 1775],
      [46.48, 9.81, 1800],
      [46.46, 9.78, 1797],
      [46.44, 9.74, 1803],
      [46.405, 9.695, 1810],
    ],
  },
]

/** FR-31.15: the hut tour's round from Muottas Muragl up to the Segantini hut and back. */
export const SAMPLE_EXCURSION_ROUTE: SampleRoute = {
  fileName: 'muottas-muragl-segantinihuette.gpx',
  name: 'Muottas Muragl – Segantinihütte',
  type: 'hiking',
  waypoints: [
    [46.5236, 9.9047, 2456],
    [46.5275, 9.9095, 2600],
    [46.5306, 9.9136, 2731],
    [46.529, 9.917, 2650],
    [46.525, 9.91, 2520],
    [46.5236, 9.9047, 2456],
  ],
}

/** Points between each pair of waypoints. */
const STEPS = 24

/** A route as the GPX file a phone would have recorded. */
export function sampleGpx(route: SampleRoute): string {
  const points: string[] = []
  route.waypoints.forEach((from, i) => {
    const to = route.waypoints[i + 1]
    if (!to) {
      points.push(trkpt(from))
      return
    }
    for (let k = 0; k < STEPS; k++) {
      const f = k / STEPS
      const n = i * STEPS + k
      const wobble = Math.sin(n * 0.7) * 0.00012
      points.push(
        trkpt([
          from[0] + (to[0] - from[0]) * f + wobble,
          from[1] + (to[1] - from[1]) * f - wobble,
          from[2] + (to[2] - from[2]) * f + Math.sin(n * 1.3) * 3,
        ]),
      )
    }
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="JIT-Pack dev seed" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${route.name}</name><type>${route.type}</type><trkseg>
${points.join('\n')}
</trkseg></trk>
</gpx>
`
}

function trkpt([lat, lon, ele]: Waypoint): string {
  return `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${ele.toFixed(1)}</ele></trkpt>`
}
