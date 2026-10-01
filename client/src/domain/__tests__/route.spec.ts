import { describe, expect, it } from 'vitest'
import {
  ARROW_SPACING_PX,
  MAX_HANDLES_FROM_FILE,
  append,
  arrowMarks,
  closeLoop,
  draftFromPoints,
  emptyDraft,
  endAt,
  gpxFileName,
  handleDistance,
  handlePlace,
  insertAt,
  isChanged,
  isLoop,
  isSettled,
  moveHandle,
  passesAt,
  pendingLegs,
  removeHandle,
  resolveLeg,
  reverse,
  routeFigures,
  routeLine,
  startAt,
  stretchFrom,
  toLv95,
  writeGpx,
  type LatLon,
  type RouteDraft,
  type RoutePoint,
} from '../route'
import { parseGpx, readTrack, type TrackPoint } from '../track'

const tp = (lat: number, lon: number, ele: number | null = null): TrackPoint => ({
  lat,
  lon,
  ele,
  time: null,
  segment: 0,
})
const rp = (lat: number, lon: number, ele: number | null = null): RoutePoint => ({ lat, lon, ele })

/** A straight line north, `n` points, 0.001° (≈111 m) apart, climbing a metre a point... by ten. */
const north = (n: number, lon = 7.6): TrackPoint[] =>
  Array.from({ length: n }, (_, i) => tp(46.5 + i * 0.001, lon, 1000 + i * 10))

/** A route's handles joined by path legs the router has answered, straight. */
function routed(places: LatLon[]): RouteDraft {
  let draft = emptyDraft()
  for (const place of places) draft = append(draft, place, 'path')
  for (const leg of pendingLegs(draft)) {
    draft = resolveLeg(draft, leg.id, [
      rp(leg.from.lat, leg.from.lon, 500),
      rp(leg.to.lat, leg.to.lon, 600),
    ])
  }
  return draft
}

/** A projection that puts a degree at 10 000 pixels, north up. */
const project = (p: LatLon) => ({ x: (p.lon - 7) * 10000, y: (47 - p.lat) * 10000 })

describe('draftFromPoints (FR-29.20)', () => {
  it('turns_a_long_file_into_at_most_the_handle_cap_with_its_ends_kept', () => {
    const zigzag = Array.from({ length: 300 }, (_, i) =>
      tp(46.5 + i * 0.0005, 7.6 + (i % 7) * 0.0004),
    )
    const draft = draftFromPoints(zigzag)
    expect(draft.handles.length).toBeLessThanOrEqual(MAX_HANDLES_FROM_FILE)
    expect(draft.handles[0]).toEqual({ lat: zigzag[0]!.lat, lon: zigzag[0]!.lon })
    expect(draft.handles.at(-1)).toEqual({ lat: zigzag.at(-1)!.lat, lon: zigzag.at(-1)!.lon })
    expect(draft.legs).toHaveLength(draft.handles.length - 1)
  })

  it('keeps_the_files_own_points_between_handles_so_nothing_is_lost', () => {
    const points = north(50)
    const draft = draftFromPoints(points)
    const line = routeLine(draft)
    expect(line).toHaveLength(points.length)
    expect(line.map((p) => p.ele)).toEqual(points.map((p) => p.ele))
    expect(draft.legs.every((leg) => leg.mode === 'kept' && leg.original)).toBe(true)
  })

  it('counts_the_same_figures_as_the_file_when_nothing_is_edited', () => {
    const points = north(30)
    const draft = draftFromPoints(points)
    expect(routeFigures(draft).ascentM).toBe(290)
    expect(routeFigures(draft).distanceM).toBeGreaterThan(3200)
    expect(draft.legs.some((_, i) => isChanged(draft, i))).toBe(false)
  })
})

describe('editing a draft (FR-29.20)', () => {
  it('starts_with_one_handle_then_joins_each_next_tap_by_a_pending_leg', () => {
    let draft = append(emptyDraft(), { lat: 46.5, lon: 7.6 }, 'path')
    expect(draft.handles).toHaveLength(1)
    expect(draft.legs).toHaveLength(0)
    draft = append(draft, { lat: 46.51, lon: 7.6 }, 'path')
    expect(pendingLegs(draft)).toEqual([
      { id: 1, mode: 'path', from: { lat: 46.5, lon: 7.6 }, to: { lat: 46.51, lon: 7.6 } },
    ])
    expect(isSettled(draft)).toBe(false)
  })

  it('applies_an_answer_only_to_the_leg_still_waiting_for_it', () => {
    let draft = append(
      append(emptyDraft(), { lat: 46.5, lon: 7.6 }, 'path'),
      { lat: 46.51, lon: 7.6 },
      'path',
    )
    const answered = resolveLeg(draft, 1, [rp(46.5, 7.6, 1), rp(46.51, 7.6, 2)])
    expect(isSettled(answered)).toBe(true)
    // The handle moved meanwhile: the old answer finds no leg and changes nothing.
    draft = moveHandle(draft, 1, { lat: 46.52, lon: 7.6 }, 'path')
    expect(resolveLeg(draft, 1, [rp(0, 0), rp(1, 1)])).toBe(draft)
  })

  it('remakes_both_legs_beside_a_moved_handle_and_marks_them_changed', () => {
    const draft = draftFromPoints(north(40))
    const moved = moveHandle(draft, 1, { lat: 46.51, lon: 7.61 }, 'path')
    expect(moved.legs[0]!.points).toBeNull()
    expect(moved.legs[1]!.points).toBeNull()
    expect(isChanged(moved, 0)).toBe(true)
    expect(isChanged(moved, 1)).toBe(true)
    expect(moved.legs.slice(2).every((leg) => leg.original)).toBe(true)
  })

  it('never_marks_a_route_drawn_from_nothing_as_changed', () => {
    const draft = routed([
      { lat: 46.5, lon: 7.6 },
      { lat: 46.51, lon: 7.6 },
    ])
    expect(isChanged(draft, 0)).toBe(false)
    expect(routeLine(draft).every((p) => !p.changed)).toBe(true)
  })

  it('joins_the_neighbours_of_a_removed_middle_handle_and_shortens_at_an_end', () => {
    const draft = routed([
      { lat: 46.5, lon: 7.6 },
      { lat: 46.51, lon: 7.6 },
      { lat: 46.52, lon: 7.6 },
      { lat: 46.53, lon: 7.6 },
    ])
    const middle = removeHandle(draft, 1, 'line')
    expect(middle.handles).toHaveLength(3)
    expect(middle.legs[0]).toMatchObject({ mode: 'line', points: null })
    expect(middle.legs[1]).toBe(draft.legs[2])
    expect(removeHandle(draft, 0, 'line').legs).toEqual(draft.legs.slice(1))
    expect(removeHandle(draft, 3, 'line').legs).toEqual(draft.legs.slice(0, 2))
    expect(removeHandle(draft, 9, 'line')).toBe(draft)
  })

  it('starts_and_ends_the_route_at_a_handle_for_a_shorter_variant', () => {
    const draft = routed([
      { lat: 46.5, lon: 7.6 },
      { lat: 46.51, lon: 7.6 },
      { lat: 46.52, lon: 7.6 },
    ])
    expect(startAt(draft, 1).handles).toEqual(draft.handles.slice(1))
    expect(startAt(draft, 1).legs).toEqual(draft.legs.slice(1))
    expect(endAt(draft, 1).handles).toEqual(draft.handles.slice(0, 2))
    expect(endAt(draft, 1).legs).toEqual(draft.legs.slice(0, 1))
  })

  it('closes_a_loop_back_to_the_start_once', () => {
    const draft = routed([
      { lat: 46.5, lon: 7.6 },
      { lat: 46.51, lon: 7.6 },
      { lat: 46.51, lon: 7.61 },
    ])
    expect(isLoop(draft)).toBe(false)
    const closed = closeLoop(draft, 'path')
    expect(closed.handles.at(-1)).toEqual(draft.handles[0])
    expect(isLoop(closed)).toBe(true)
    expect(closeLoop(closed, 'path')).toBe(closed)
    expect(
      closeLoop(append(emptyDraft(), { lat: 46.5, lon: 7.6 }, 'path'), 'path').handles,
    ).toHaveLength(1)
  })

  it('reverses_handles_and_every_line_and_asks_a_waiting_leg_again', () => {
    let draft = routed([
      { lat: 46.5, lon: 7.6 },
      { lat: 46.51, lon: 7.6 },
    ])
    draft = append(draft, { lat: 46.52, lon: 7.6 }, 'path')
    const back = reverse(draft)
    expect(back.handles).toEqual([...draft.handles].reverse())
    expect(back.legs[1]!.points).toEqual([...draft.legs[0]!.points!].reverse())
    expect(back.legs[0]!.points).toBeNull()
    expect(back.legs[0]!.id).not.toBe(draft.legs[1]!.id)
    expect(pendingLegs(back)[0]).toMatchObject({ from: draft.handles[2], to: draft.handles[1] })
  })
})

describe('handlePlace (FR-29.20)', () => {
  it('draws_a_handle_where_the_routers_path_ends_not_where_the_finger_let_go', () => {
    let draft = append(
      append(emptyDraft(), { lat: 46.5, lon: 7.6 }, 'path'),
      { lat: 46.51, lon: 7.61 },
      'path',
    )
    expect(handlePlace(draft, 1)).toEqual({ lat: 46.51, lon: 7.61 })
    draft = resolveLeg(draft, 1, [rp(46.5001, 7.6), rp(46.5099, 7.6088)])
    expect(handlePlace(draft, 1)).toEqual({ lat: 46.5099, lon: 7.6088 })
    expect(handlePlace(draft, 0)).toEqual({ lat: 46.5001, lon: 7.6 })
  })

  it('leaves_a_handle_on_a_straight_or_kept_leg_where_it_is', () => {
    const draft = draftFromPoints(north(10))
    expect(handlePlace(draft, 0)).toEqual(draft.handles[0])
  })
})

describe('passesAt and insertAt (FR-29.20)', () => {
  /** Out along a line and back on the same one: two passes at every point between. */
  const outAndBack = (): RouteDraft =>
    routed([
      { lat: 46.5, lon: 7.6 },
      { lat: 46.51, lon: 7.6 },
      { lat: 46.5, lon: 7.6 },
    ])

  it('finds_both_passes_of_a_path_walked_out_and_back_in_route_order', () => {
    const draft = outAndBack()
    const tap = project({ lat: 46.505, lon: 7.6 })
    const passes = passesAt(draft, { x: tap.x + 3, y: tap.y }, project)
    expect(passes).toHaveLength(2)
    expect(passes[0]!.leg).toBe(0)
    expect(passes[1]!.leg).toBe(1)
    expect(passes[0]!.distanceM).toBeLessThan(passes[1]!.distanceM)
    // North is up the screen, so out is -90° and back is +90°.
    expect(passes[0]!.degrees).toBeCloseTo(-90)
    expect(passes[1]!.degrees).toBeCloseTo(90)
  })

  it('finds_nothing_beyond_the_tolerance', () => {
    const tap = project({ lat: 46.505, lon: 7.6 })
    expect(passesAt(outAndBack(), { x: tap.x + 40, y: tap.y }, project)).toEqual([])
  })

  it('finds_one_pass_where_a_line_runs_once', () => {
    const draft = routed([
      { lat: 46.5, lon: 7.6 },
      { lat: 46.51, lon: 7.6 },
    ])
    expect(passesAt(draft, project({ lat: 46.505, lon: 7.6 }), project)).toHaveLength(1)
  })

  it('splits_the_chosen_pass_keeping_its_line_and_changing_nothing', () => {
    const file = draftFromPoints(north(5))
    const tap = project({ lat: 46.5015, lon: 7.6 })
    const [pass] = passesAt(file, tap, project)
    const split = insertAt(file, pass!)
    expect(split.handles).toHaveLength(file.handles.length + 1)
    expect(split.handles[pass!.leg + 1]!.lat).toBeCloseTo(46.5015)
    expect(routeFigures(split)).toEqual(routeFigures(file))
    expect(split.legs.every((leg) => leg.original && leg.mode === 'kept')).toBe(true)
  })

  it('splits_the_return_pass_when_that_is_chosen', () => {
    const draft = outAndBack()
    const passes = passesAt(draft, project({ lat: 46.505, lon: 7.6 }), project)
    const split = insertAt(draft, passes[1]!)
    expect(split.handles).toHaveLength(4)
    expect(split.handles[2]!.lat).toBeCloseTo(46.505)
    expect(handleDistance(split, 2)).toBeGreaterThan(handleDistance(split, 1))
  })

  it('splits_a_leg_still_waiting_into_two_waiting_legs', () => {
    const draft = append(
      append(emptyDraft(), { lat: 46.5, lon: 7.6 }, 'line'),
      { lat: 46.51, lon: 7.6 },
      'line',
    )
    const [pass] = passesAt(draft, project({ lat: 46.505, lon: 7.6 }), project)
    const split = insertAt(draft, pass!)
    expect(pendingLegs(split).map((leg) => leg.mode)).toEqual(['line', 'line'])
  })

  it('shows_a_short_stretch_ahead_of_a_pass_in_its_direction', () => {
    const draft = outAndBack()
    const passes = passesAt(draft, project({ lat: 46.505, lon: 7.6 }), project)
    const out = stretchFrom(draft, passes[0]!, 300)
    const back = stretchFrom(draft, passes[1]!, 300)
    expect(out.at(-1)!.lat).toBeGreaterThan(46.505)
    expect(back.at(-1)!.lat).toBeLessThan(46.505)
  })
})

describe('arrowMarks (FR-29.20)', () => {
  it('sets_the_first_arrow_half_a_spacing_in_and_the_rest_a_spacing_apart', () => {
    const marks = arrowMarks([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ])
    expect(marks.map((m) => m.x)).toEqual([
      ARROW_SPACING_PX / 2,
      ARROW_SPACING_PX * 1.5,
      ARROW_SPACING_PX * 2.5,
    ])
    expect(marks.every((m) => m.degrees === 0)).toBe(true)
  })

  it('carries_the_spacing_across_a_bend_and_turns_with_the_line', () => {
    const marks = arrowMarks(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
      70,
    )
    expect(marks).toHaveLength(2)
    expect(marks[0]).toEqual({ x: 35, y: 0, degrees: 0 })
    expect(marks[1]!.x).toBe(50)
    expect(marks[1]!.y).toBeCloseTo(55)
    expect(marks[1]!.degrees).toBe(90)
  })

  it('skips_a_step_of_no_length', () => {
    expect(
      arrowMarks([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([])
  })
})

describe('toLv95 (FR-29.20)', () => {
  it('puts_bern_on_swisstopos_own_reference_point_to_a_metre', () => {
    // swisstopo's worked example: 46°02'38.87" N, 8°43'49.79" E → 2 699 999.76 / 1 099 999.97.
    const [e, n] = toLv95({ lat: 46 + 2 / 60 + 38.87 / 3600, lon: 8 + 43 / 60 + 49.79 / 3600 })
    expect(e).toBeCloseTo(2699999.76, 0)
    expect(n).toBeCloseTo(1099999.97, 0)
  })
})

describe('writeGpx (FR-29.20, ADR-088)', () => {
  it('writes_a_file_the_track_reader_reads_back_with_its_kind_and_heights', () => {
    const points = [rp(46.5, 7.6, 1000), rp(46.51, 7.6, 1100), rp(46.52, 7.61, null)]
    const xml = writeGpx('Oeschinen & See <kurz>', 'bike', points)
    const parsed = parseGpx(xml)
    expect(parsed.name).toBe('Oeschinen & See <kurz>')
    expect(parsed.type).toBe('cycling')
    expect(parsed.points.map((p) => [p.lat, p.lon, p.ele])).toEqual([
      [46.5, 7.6, 1000],
      [46.51, 7.6, 1100],
      [46.52, 7.61, null],
    ])
    const read = readTrack(xml, gpxFileName('x'), xml.length)
    expect(read.ok && read.upload.kind).toBe('bike')
  })

  it('names_a_file_after_the_route_in_plain_lower_case', () => {
    expect(gpxFileName('Rundweg ab Kandersteg (Variante)')).toBe(
      'rundweg-ab-kandersteg-variante.gpx',
    )
    expect(gpxFileName('Zürich – Üetliberg')).toBe('zurich-uetliberg.gpx')
    expect(gpxFileName('!!!')).toBe('route.gpx')
  })
})
