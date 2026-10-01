import { describe, expect, it } from 'vitest'
import {
  CLIMB_HYSTERESIS_M,
  MAX_GPX_BYTES,
  MAX_LINE_POINTS,
  PAUSE_MAX_MIN,
  decodeLine,
  defaultSource,
  encodeLine,
  figures,
  guessKind,
  haversine,
  movingMinutes,
  nextTrackPosition,
  orderTracks,
  parseGpx,
  readTrack,
  simplify,
  stepPause,
  trackSettingsPatch,
  type TrackPoint,
} from '../track'

/** A GPX document around the given body. */
const gpx = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`

const pt = (
  lat: number,
  lon: number,
  ele: number | null = null,
  segment = 0,
  time: number | null = null,
): TrackPoint => ({
  lat,
  lon,
  ele,
  time,
  segment,
})

describe('parseGpx (FR-29.17)', () => {
  it('reads track points with their heights and times, and the track name and type', () => {
    const parsed = parseGpx(
      gpx(`<metadata><name>Datei</name></metadata>
      <trk><name>Rundweg &amp; See</name><type>hiking</type><trkseg>
        <trkpt lat="46.4972" lon="7.6746"><ele>1176.4</ele><time>2026-07-01T08:00:00Z</time></trkpt>
        <trkpt lon='7.6860' lat='46.4985'><ele>1205</ele></trkpt>
        <trkpt lat="46.4992" lon="7.6975"/>
      </trkseg></trk>`),
    )
    expect(parsed.name).toBe('Rundweg & See')
    expect(parsed.type).toBe('hiking')
    expect(parsed.points).toEqual([
      pt(46.4972, 7.6746, 1176.4, 0, Date.parse('2026-07-01T08:00:00Z')),
      pt(46.4985, 7.686, 1205),
      pt(46.4992, 7.6975),
    ])
  })

  it('numbers the segments, so a gap between two is known', () => {
    const parsed = parseGpx(
      gpx(`<trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="1" lon="2"/></trkseg>
           <trkseg><trkpt lat="2" lon="2"/></trkseg></trk>`),
    )
    expect(parsed.points.map((p) => p.segment)).toEqual([0, 0, 1])
  })

  it('falls back to route points, then to the metadata name, and skips waypoints', () => {
    const parsed = parseGpx(
      gpx(`<metadata><name><![CDATA[Velo <Route>]]></name></metadata>
      <wpt lat="9" lon="9"><name>Beizli</name></wpt>
      <rte><rtept lat="46.68" lon="7.68"/><rtept lat="46.67" lon="7.70"/></rte>`),
    )
    expect(parsed.points).toHaveLength(2)
    expect(parsed.name).toBe('Velo <Route>')
  })

  it('drops a point whose coordinates cannot be read', () => {
    const parsed = parseGpx(
      gpx(
        `<trk><trkseg><trkpt lat="x" lon="1"/><trkpt lat="95" lon="1"/><trkpt lat="1" lon="1"/></trkseg></trk>`,
      ),
    )
    expect(parsed.points).toEqual([pt(1, 1)])
  })

  it('finds nothing in a file that is no GPX', () => {
    expect(parseGpx('<html><body>nope</body></html>').points).toEqual([])
  })
})

describe('figures (FR-29.17)', () => {
  it('sums the distance within segments only', () => {
    const oneDegree = haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })
    expect(figures([pt(0, 0), pt(0, 1), pt(0, 5, null, 1), pt(0, 6, null, 1)]).distanceM).toBe(
      Math.round(2 * oneDegree),
    )
  })

  it(`counts a climb only once it reaches ${CLIMB_HYSTERESIS_M} m, so a wobbling GPS is not climbing`, () => {
    const wobble = [1000, 1003, 999, 1004, 1000, 1010, 1007, 1020, 1000].map((ele) => pt(0, 0, ele))
    expect(figures(wobble)).toMatchObject({ ascentM: 20, descentM: 20, maxEleM: 1020 })
  })

  it('has no height figures for a file without heights', () => {
    expect(figures([pt(0, 0), pt(0, 1)])).toMatchObject({
      ascentM: null,
      descentM: null,
      maxEleM: null,
    })
  })
})

describe('guessKind (FR-29.17)', () => {
  const ride = [pt(0, 0, null, 0, 0), pt(0, 0, null, 0, 3_600_000)]
  it.each([
    ['cycling', 'bike'],
    ['Velotour', 'bike'],
    ['mountain_biking', 'bike'],
    ['hiking', 'hike'],
    ['Wanderung', 'hike'],
  ] as const)('reads the declared type %s as %s', (type, kind) => {
    expect(guessKind(type, [], 0)).toBe(kind)
  })

  it('reads the pace of the timestamps where no type is declared', () => {
    expect(guessKind(null, ride, 20_000)).toBe('bike')
    expect(guessKind(null, ride, 5_000)).toBe('hike')
  })

  it('is a hike where nothing tells', () => {
    expect(guessKind(null, [pt(0, 0), pt(0, 1)], 100_000)).toBe('hike')
  })
})

describe('simplify (FR-29.17)', () => {
  it('keeps a short line as it is', () => {
    const line = [pt(0, 0), pt(0, 1), pt(1, 1)]
    expect(simplify(line, 5)).toEqual(line)
  })

  it('keeps the ends and the corners, and exactly as many points as asked', () => {
    const line: TrackPoint[] = []
    for (let i = 0; i <= 100; i++) line.push(pt(0, i / 100))
    for (let i = 1; i <= 100; i++) line.push(pt(i / 100, 1))
    const kept = simplify(line, 3)
    expect(kept).toEqual([pt(0, 0), pt(0, 1), pt(1, 1)])
    expect(simplify(line, 50)).toHaveLength(50)
  })
})

describe('the drawn line (FR-29.17)', () => {
  it('encodes as Google’s polyline format and reads back to five decimals', () => {
    const points = [pt(38.5, -120.2), pt(40.7, -120.95), pt(43.252, -126.453)]
    expect(encodeLine(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(decodeLine(encodeLine(points))).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ])
  })

  it('reads a truncated string as far as it goes', () => {
    expect(decodeLine('_p~iF~ps|U_ulL')).toEqual([[38.5, -120.2]])
  })
})

describe('readTrack (FR-29.17)', () => {
  const file = gpx(`<trk><type>cycling</type><trkseg>
    <trkpt lat="46.688" lon="7.68"><ele>560</ele></trkpt>
    <trkpt lat="46.676" lon="7.70"><ele>600</ele></trkpt>
    <trkpt lat="46.664" lon="7.718"><ele>690</ele></trkpt>
  </trkseg></trk>`)

  it('names the track after the file where the file names none, and suggests its kind', () => {
    const read = readTrack(file, 'thunersee.GPX', file.length)
    expect(read.ok && read.upload).toMatchObject({
      name: 'thunersee',
      file_name: 'thunersee.GPX',
      kind: 'bike',
      ascent_m: 130,
      descent_m: 0,
      max_ele_m: 690,
      point_count: 3,
      gpx: file,
    })
  })

  it(`thins a long track to ${MAX_LINE_POINTS} points`, () => {
    const many = Array.from(
      { length: 5000 },
      (_, i) => `<trkpt lat="${46 + Math.sin(i / 50) / 100}" lon="${7 + i / 10000}"/>`,
    )
    const read = readTrack(gpx(`<trk><trkseg>${many.join('')}</trkseg></trk>`), 'lang.gpx', 1)
    expect(read.ok && decodeLine(read.upload.line)).toHaveLength(MAX_LINE_POINTS)
    expect(read.ok && read.upload.point_count).toBe(5000)
  })

  it('refuses a file over 5 MB and a file with fewer than two points', () => {
    expect(readTrack(file, 'gross.gpx', MAX_GPX_BYTES + 1)).toEqual({
      ok: false,
      reason: 'too_large',
    })
    expect(
      readTrack(gpx('<trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>'), 'x.gpx', 10),
    ).toEqual({
      ok: false,
      reason: 'no_track',
    })
  })
})

describe('movingMinutes (FR-29.17)', () => {
  const oeschinen = { distance_m: 7400, ascent_m: 520, descent_m: 510 }
  it.each([
    // flat 1.76 h, vertical 2.75 h: 2.75 + 1.76 / 2 = 3.63 h
    [
      'a hike, the Swiss hiking trails’ formula',
      { ...oeschinen, kind: 'hike', with_kid: false },
      220,
    ],
    // flat 2.47 h, vertical 4.06 h: 4.06 + 2.47 / 2 = 5.29 h
    ['a hike with a child', { ...oeschinen, kind: 'hike', with_kid: true }, 315],
    // 30 km / 18 + 400 m / 600 = 2.33 h
    [
      'a bike tour',
      { distance_m: 30_000, ascent_m: 400, descent_m: 400, kind: 'bike', with_kid: false },
      140,
    ],
    // 30 km / 12 + 400 m / 350 = 3.64 h
    [
      'a bike tour with a child',
      { distance_m: 30_000, ascent_m: 400, descent_m: 400, kind: 'bike', with_kid: true },
      220,
    ],
    // no heights: the flat time alone, 8.4 km / 4.2 = 2 h
    [
      'a hike without heights',
      { distance_m: 8400, ascent_m: null, descent_m: null, kind: 'hike', with_kid: false },
      120,
    ],
  ] as const)('times %s', (_, track, minutes) => {
    expect(movingMinutes(track)).toBe(minutes)
  })
})

describe('the pauses (FR-29.17)', () => {
  it('step by a quarter hour within 0 and 8 hours', () => {
    expect(stepPause(0, 1)).toBe(15)
    expect(stepPause(0, -1)).toBe(0)
    expect(stepPause(PAUSE_MAX_MIN, 1)).toBe(PAUSE_MAX_MIN)
  })
})

describe('the map source (FR-29.17)', () => {
  it('is the Landeskarte where every track lies in Switzerland, OpenStreetMap otherwise', () => {
    const bern: [number, number][] = [[46.95, 7.45]]
    const pienza: [number, number][] = [[43.07, 11.68]]
    expect(defaultSource([bern])).toBe('swisstopo')
    expect(defaultSource([bern, pienza])).toBe('osm')
    expect(defaultSource([])).toBe('osm')
  })
})

describe('track order (FR-29.17)', () => {
  it('orders by place with the id deciding a tie, and puts a new track behind the last', () => {
    const tracks = [
      { id: 'b', position: 1 },
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
    ]
    expect(orderTracks(tracks).map((t) => t.id)).toEqual(['c', 'a', 'b'])
    expect(nextTrackPosition(tracks)).toBe(2)
    expect(nextTrackPosition([])).toBe(0)
  })
})

describe('what a person sets on a track (FR-29.17, FR-31.15)', () => {
  const track = {
    id: 't',
    name: 'Alpweg',
    file_name: 'alp.gpx',
    kind: 'hike' as const,
    with_kid: false,
    pause_min: 15,
    position: 0,
    gpx_hash: 'h',
    distance_m: 1,
    ascent_m: null,
    descent_m: null,
    max_ele_m: null,
    point_count: 2,
    line: 'l',
  }

  it('writes only what changed, the name trimmed and the flag as the column holds it', () => {
    expect(
      trackSettingsPatch(track, { name: ' Seeweg ', kind: 'hike', with_kid: true, pause_min: 15 }),
    ).toEqual({ name: 'Seeweg', with_kid: 1 })
    expect(trackSettingsPatch(track, { kind: 'bike', pause_min: 0 })).toEqual({
      kind: 'bike',
      pause_min: 0,
    })
  })

  it('takes a blank name, or the same values, for no change', () => {
    expect(trackSettingsPatch(track, { name: '  ', with_kid: false, pause_min: 15 })).toEqual({})
  })
})
