import { describe, expect, it, vi } from 'vitest'

import type { ConnectionLeg } from '@/types/domain'
import {
  connectionDay,
  connectionSummary,
  connectionTitle,
  handFieldsOf,
  handLeg,
  isSbbShortLink,
  legsFromContext,
  legsFromSbbTripId,
  lineName,
  readConnectionLink,
  sbbTripId,
} from '../connections'
import { SBB_SHORT_LINK, SBB_TRIP_LINK } from './sbbFixture'

const SAMEDAN_TO_BERN: ConnectionLeg[] = [
  {
    from: 'Samedan',
    to: 'Landquart',
    dep: '2026-10-10T10:58',
    arr: '2026-10-10T12:39',
    line: 'RE 3',
  },
  {
    from: 'Landquart',
    to: 'Zürich HB',
    dep: '2026-10-10T12:48',
    arr: '2026-10-10T13:56',
    line: 'IC 3',
  },
  { from: 'Zürich HB', to: 'Bern', dep: '2026-10-10T14:22', arr: '2026-10-10T15:28', line: 'IC 1' },
  { from: 'Bern', to: 'Bern, Bahnhof', dep: '2026-10-10T15:28', arr: '2026-10-10T15:34', line: '' },
  {
    from: 'Bern, Bahnhof',
    to: 'Bern, Cäcilienstrasse',
    dep: '2026-10-10T15:39',
    arr: '2026-10-10T15:46',
    line: 'T 6',
  },
]

describe('FR-29.18 reading the SBB app’s shared link (ADR-086)', () => {
  it('reads every leg out of a real connection’s trip id', async () => {
    const id = sbbTripId(SBB_TRIP_LINK)
    expect(id).toMatch(/^3HA\./)
    expect(await legsFromSbbTripId(id!)).toEqual(SAMEDAN_TO_BERN)
  })

  it('reads a full sbb.ch link without asking anybody', async () => {
    const pageLinks = vi.fn()
    expect(await readConnectionLink(SBB_TRIP_LINK, pageLinks)).toEqual(SAMEDAN_TO_BERN)
    expect(pageLinks).not.toHaveBeenCalled()
  })

  it('follows a short link through its page’s links', async () => {
    const pageLinks = vi.fn(async () => [
      'https://itunes.apple.com/app/sbb-mobile/id294855237',
      SBB_TRIP_LINK,
    ])
    expect(await readConnectionLink(SBB_SHORT_LINK, pageLinks)).toEqual(SAMEDAN_TO_BERN)
    expect(pageLinks).toHaveBeenCalledWith(SBB_SHORT_LINK)
  })

  it.each([
    ['a short link where nobody can read its page (Local Mode)', SBB_SHORT_LINK, null],
    ['a short link whose page could not be read', SBB_SHORT_LINK, async () => null],
    ['a short link whose page links no trip', SBB_SHORT_LINK, async () => ['https://www.sbb.ch/']],
    ['a link no reader knows', 'https://www.trenitalia.com/it.html', async () => [SBB_TRIP_LINK]],
    ['an sbb.ch link without a trip', 'https://www.sbb.ch/en/', null],
    [
      'a trip id from a format that changed',
      'https://www.sbb.ch/en/trip?tripId=3HA.bm90LXpsaWI',
      null,
    ],
    ['a trip id with no context', 'https://www.sbb.ch/en/trip?tripId=3HA', null],
    ['not a link at all', 'Samedan nach Bern', null],
  ])('reads no legs from %s', async (_name, link, pageLinks) => {
    expect(await readConnectionLink(link, pageLinks)).toBeNull()
  })

  it('knows the SBB’s hosts and nobody else’s', () => {
    expect(isSbbShortLink(SBB_SHORT_LINK)).toBe(true)
    expect(isSbbShortLink('https://sbbmobile.ch.example.org/s/x')).toBe(false)
    expect(sbbTripId('https://www.sbb.ch.example.org/trip?tripId=3HA.x')).toBeNull()
    expect(sbbTripId('javascript:alert(1)//sbb.ch?tripId=x')).toBeNull()
  })

  it.each([
    ['a train with its run number', 'RE 3 1334', 'RE 3'],
    ['an intercity', 'IC 1 10722', 'IC 1'],
    ['a tram without one', 'T 6', 'T 6'],
    ['spaces around', '  B 604  4711 ', 'B 604'],
  ])('names %s as a traveller does', (_name, vehicle, want) => {
    expect(lineName(vehicle)).toBe(want)
  })

  it('reads no partial journey: a leg it cannot read voids the list', () => {
    const good = 'T$A=1@O=A@$A=1@O=B@$202607140900$202607141000$IR 13 2$$1'
    const broken = 'T$A=1@O=B@$A=1@X=1@$202607141010$202607141100$S 1 9$$1'
    expect(legsFromContext(`¶HKI¶${good}¶KC¶`)).toHaveLength(1)
    expect(legsFromContext(`¶HKI¶${good}§${broken}¶KC¶`)).toEqual([])
    expect(legsFromContext('no legs here')).toEqual([])
  })
})

describe('FR-29.18 a connection by hand', () => {
  const fields = { from: ' Olbia ', to: 'Nuoro', dep: '09:15', arr: '11:05', line: ' ARST 9 ' }

  it('is one leg on the chosen day', () => {
    expect(handLeg('2026-07-14', fields)).toEqual({
      from: 'Olbia',
      to: 'Nuoro',
      dep: '2026-07-14T09:15',
      arr: '2026-07-14T11:05',
      line: 'ARST 9',
    })
  })

  it('arrives the next morning when the arrival is before the departure', () => {
    const night = handLeg('2026-07-31', { ...fields, dep: '22:40', arr: '06:10' })
    expect(night?.arr).toBe('2026-08-01T06:10')
    expect(connectionSummary([night!]).arrivalDays).toBe(1)
  })

  it.each([
    ['without a start', { from: ' ' }],
    ['without an end', { to: '' }],
    ['without a departure', { dep: '' }],
    ['without an arrival', { arr: '25:00' }],
  ])('is no leg %s', (_name, patch) => {
    expect(handLeg('2026-07-14', { ...fields, ...patch })).toBeNull()
  })

  it('gives its fields back for a change', () => {
    const leg = handLeg('2026-07-14', fields)!
    expect(handFieldsOf(leg)).toEqual({
      from: 'Olbia',
      to: 'Nuoro',
      dep: '09:15',
      arr: '11:05',
      line: 'ARST 9',
    })
  })
})

describe('FR-29.18 what the timeline says about a connection', () => {
  it('names its ends, its day, its arrival, its lines and its changes', () => {
    expect(connectionTitle(SAMEDAN_TO_BERN)).toBe('Samedan → Bern, Cäcilienstrasse')
    expect(connectionDay(SAMEDAN_TO_BERN)).toBe('2026-10-10')
    expect(connectionSummary(SAMEDAN_TO_BERN)).toEqual({
      arrival: '15:46',
      arrivalDays: 0,
      lines: ['RE 3', 'IC 3', 'IC 1', 'T 6'],
      transfers: 3,
    })
  })

  it('names a line ridden twice once, and a direct one with no change', () => {
    const twice = [SAMEDAN_TO_BERN[0]!, { ...SAMEDAN_TO_BERN[1]!, line: 'RE 3' }]
    expect(connectionSummary(twice).lines).toEqual(['RE 3'])
    expect(connectionSummary([SAMEDAN_TO_BERN[0]!]).transfers).toBe(0)
  })
})
