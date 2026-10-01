// @vitest-environment jsdom
/**
 * FR-29.19 without map tiles: the people on the map are dots on the lines
 * alone — the own one and the others' each in their kind — and a map with
 * nobody on it draws no dot.
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
