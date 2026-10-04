// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TrackLines from '../TrackLines.vue'
import type { MapLine } from '../trackColors'

/**
 * The lines drawn without a map under them (FR-29.17) — every map while the
 * device is offline or the instance draws no tiles. A connection's legs
 * (FR-29.18) are several chosen lines: one journey, whose ends are the
 * whole's, with its stops as dots.
 */

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

describe('TrackLines', () => {
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
