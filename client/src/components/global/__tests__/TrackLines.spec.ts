// @vitest-environment jsdom
/**
 * The lines drawn without a map under them (FR-29.17) — every map while the
 * device is offline or the instance draws no tiles. FR-29.19: the people on
 * the map are dots on the lines alone — the own one and the others' each in
 * their kind — and a map with nobody on it draws no dot. FR-29.18: a
 * connection's legs are several chosen lines, one journey whose ends are the
 * whole's, with its stops as dots.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TrackLines from '../TrackLines.vue'
import type { MapLine, MapMark } from '../trackColors'

const LINE: MapLine = {
  id: 'l1',
  points: [
    [46.53, 9.87],
    [46.55, 9.89],
  ],
  hueClass: 'jp-track-larch',
  chosen: true,
}

function mark(kind: MapMark['kind'], lat: number): MapMark {
  return { id: kind, kind, lat, lon: 9.88, accuracyM: 10, initials: 'SI', title: 'Sia' }
}

describe('TrackLines marks (FR-29.19)', () => {
  it('draws the own position and another traveller as dots of their kind', () => {
    const wrapper = mount(TrackLines, {
      props: { lines: [LINE], marks: [mark('me', 46.54), mark('person', 46.545)] },
    })
    expect(wrapper.find('[data-testid="map-mark-me"]').classes()).toContain('me')
    expect(wrapper.find('[data-testid="map-mark-person"]').classes()).toContain('person')
    expect(wrapper.find('[data-testid="map-mark-me"]').attributes('d')).toMatch(/^M9\.88000 /)
  })

  it('draws no dot where nobody is on the map', () => {
    const wrapper = mount(TrackLines, { props: { lines: [LINE] } })
    expect(wrapper.find('path.line').exists()).toBe(true)
    expect(wrapper.findAll('path.mark')).toHaveLength(0)
  })
})

const BOAT: MapLine = {
  id: 'leg-0',
  points: [
    [47.05, 8.31],
    [47.01, 8.48],
  ],
  hueClass: 'jp-leg-boat',
  chosen: true,
}
const RACK: MapLine = {
  id: 'leg-1',
  points: [
    [47.01, 8.48],
    [47.05, 8.47],
  ],
  hueClass: 'jp-leg-train',
  chosen: true,
}

/** The `M<lon> <y>h0` a dot or an end is drawn as, keyed by its longitude. */
function lonOf(path: string | undefined): number {
  return Number(/^M(-?[\d.]+) /.exec(path ?? '')?.[1])
}

describe('TrackLines legs (FR-29.18)', () => {
  it('draws a line per leg, each in its own colour', () => {
    const wrapper = mount(TrackLines, { props: { lines: [BOAT, RACK] } })
    const lines = wrapper.findAll('[data-testid="map-line"] path.line')
    expect(lines.map((line) => line.classes())).toEqual([
      ['line', 'jp-leg-boat'],
      ['line', 'jp-leg-train'],
    ])
  })

  it('puts the ends of several chosen lines at the first one’s start and the last one’s end', () => {
    const wrapper = mount(TrackLines, { props: { lines: [BOAT, RACK] } })
    expect(lonOf(wrapper.find('path.start').attributes('d'))).toBe(8.31)
    expect(lonOf(wrapper.find('path.finish').attributes('d'))).toBe(8.47)
  })

  it('keeps one chosen track’s own ends among others', () => {
    const other: MapLine = { ...RACK, id: 't2', chosen: false }
    const wrapper = mount(TrackLines, { props: { lines: [BOAT, other] } })
    expect(lonOf(wrapper.find('path.finish').attributes('d'))).toBe(8.48)
  })

  it('draws each stop given as a dot', () => {
    const wrapper = mount(TrackLines, {
      props: {
        lines: [BOAT, RACK],
        dots: [
          [47.05, 8.31],
          [47.01, 8.48],
          [47.05, 8.47],
        ],
      },
    })
    expect(wrapper.findAll('path.dot').map((dot) => lonOf(dot.attributes('d')))).toEqual([
      8.31, 8.48, 8.47,
    ])
  })
})
