/**
 * FR-29.18 — a connection handed to the map: a line per leg that knows its
 * places, coloured by what it travels by, and the stops one gets on and off.
 */
import { describe, expect, it } from 'vitest'

import type { ConnectionLeg } from '@/types/domain'
import { connectionLines, connectionStops, legendHues } from '../connectionMap'

const WALK: ConnectionLeg = {
  from: 'Mein Standort',
  to: 'Luzern Bahnhofquai',
  dep: '2026-10-10T08:08',
  arr: '2026-10-10T08:12',
  line: '',
  fromAt: [47.0505, 8.3093],
  toAt: [47.051182, 8.310136],
}
const BOAT: ConnectionLeg = {
  from: 'Luzern Bahnhofquai',
  to: 'Vitznau',
  dep: '2026-10-10T08:12',
  arr: '2026-10-10T09:09',
  line: 'BAT 3600',
  mode: 'boat',
  fromAt: [47.051182, 8.310136],
  toAt: [47.009345, 8.482383],
  via: [[47.0511, 8.334865]],
}
const RACK: ConnectionLeg = {
  from: 'Vitznau',
  to: 'Rigi Kaltbad-First',
  dep: '2026-10-10T09:15',
  arr: '2026-10-10T09:44',
  line: 'R',
  fromAt: [47.009345, 8.482383],
  toAt: [47.0458, 8.4655],
}
const BY_HAND: ConnectionLeg = {
  from: 'Olbia',
  to: 'Nuoro',
  dep: '2026-07-14T09:00',
  arr: '2026-07-14T11:30',
  line: 'ARST',
}

describe('connectionLines (FR-29.18)', () => {
  it('draws a line per leg, through the stops it passes, coloured by what it travels by', () => {
    expect(connectionLines([WALK, BOAT, RACK])).toEqual([
      { id: 'leg-0', points: [WALK.fromAt, WALK.toAt], hueClass: 'jp-leg-walk', chosen: true },
      {
        id: 'leg-1',
        points: [BOAT.fromAt, [47.0511, 8.334865], BOAT.toAt],
        hueClass: 'jp-leg-boat',
        chosen: true,
      },
      // A ride without a known mode is drawn as a train.
      { id: 'leg-2', points: [RACK.fromAt, RACK.toAt], hueClass: 'jp-leg-train', chosen: true },
    ])
  })

  it('leaves out a leg that knows no places — entered by hand', () => {
    expect(connectionLines([BY_HAND])).toEqual([])
  })
})

describe('connectionStops (FR-29.18)', () => {
  it('marks each place one gets on or off once', () => {
    expect(connectionStops([WALK, BOAT, RACK])).toEqual([
      WALK.fromAt,
      WALK.toAt,
      BOAT.toAt,
      RACK.toAt,
    ])
  })
})

describe('legendHues (FR-29.18)', () => {
  it('names what the map shows, in a fixed order', () => {
    expect(legendHues([WALK, BOAT, RACK, BY_HAND])).toEqual(['train', 'boat', 'walk'])
  })
})
