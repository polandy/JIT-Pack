// @vitest-environment jsdom
/**
 * FR-29.20 — the router's address as the instance hands it on, and the two
 * requests an edited leg makes (ADR-088).
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { installHarness, type Harness } from '@/__tests__/harness'

import {
  DEFAULT_ROUTER_URL,
  HEIGHTS_URL,
  ROUTING_STORAGE_KEY,
  RoutingError,
  fetchPath,
  fetchStraight,
  initRouting,
  setRouting,
  useRoutingUrl,
} from '../routing'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Kandersteg to the Oeschinensee: both in Switzerland. */
const KANDERSTEG = { lat: 46.4972, lon: 7.6746 }
const OESCHINEN = { lat: 46.4985, lon: 7.7225 }

let h: Harness

beforeEach(() => {
  h = installHarness()
  setRouting(DEFAULT_ROUTER_URL)
})

describe('the routing address (FR-29.20)', () => {
  it('asks_the_public_router_until_the_instance_names_another_or_none', () => {
    expect(useRoutingUrl().value).toBe(DEFAULT_ROUTER_URL)
    setRouting('https://router.example/brouter')
    expect(useRoutingUrl().value).toBe('https://router.example/brouter')
    setRouting('')
    expect(useRoutingUrl().value).toBe('')
  })

  it('keeps_the_instances_answer_for_an_offline_start_off_included', () => {
    setRouting('')
    expect(localStorage.getItem(ROUTING_STORAGE_KEY)).toBe('off')
    setRouting(DEFAULT_ROUTER_URL)
    initRouting()
    expect(useRoutingUrl().value).toBe(DEFAULT_ROUTER_URL)
    localStorage.setItem(ROUTING_STORAGE_KEY, 'off')
    initRouting()
    expect(useRoutingUrl().value).toBe('')
    localStorage.setItem(ROUTING_STORAGE_KEY, 'https://own.example/brouter')
    initRouting()
    expect(useRoutingUrl().value).toBe('https://own.example/brouter')
  })
})

describe('fetchPath (FR-29.20, ADR-088)', () => {
  it('asks_for_the_kinds_profile_and_reads_the_path_with_its_heights', async () => {
    h.fetch.mockResolvedValue(
      json({
        features: [
          {
            geometry: {
              coordinates: [
                [7.6746, 46.4972, 1176],
                [7.7, 46.498, 1400],
                [7.7225, 46.4985],
              ],
            },
          },
        ],
      }),
    )
    const path = await fetchPath('https://router.example/brouter', KANDERSTEG, OESCHINEN, 'bike')
    expect(path).toEqual([
      { lat: 46.4972, lon: 7.6746, ele: 1176 },
      { lat: 46.498, lon: 7.7, ele: 1400 },
      { lat: 46.4985, lon: 7.7225, ele: null },
    ])
    const asked = new URL(String(h.fetch.mock.calls[0]![0]))
    expect(asked.origin + asked.pathname).toBe('https://router.example/brouter')
    expect(asked.searchParams.get('lonlats')).toBe('7.6746,46.4972|7.7225,46.4985')
    expect(asked.searchParams.get('profile')).toBe('trekking')
    expect(asked.searchParams.get('format')).toBe('geojson')
  })

  it('says_so_when_the_router_refuses_or_finds_nothing', async () => {
    h.fetch.mockResolvedValueOnce(json({ message: 'no route' }, 500))
    await expect(
      fetchPath(DEFAULT_ROUTER_URL, KANDERSTEG, OESCHINEN, 'hike'),
    ).rejects.toBeInstanceOf(RoutingError)
    h.fetch.mockResolvedValueOnce(json({ features: [] }))
    await expect(
      fetchPath(DEFAULT_ROUTER_URL, KANDERSTEG, OESCHINEN, 'hike'),
    ).rejects.toBeInstanceOf(RoutingError)
  })
})

describe('fetchStraight (FR-29.20, ADR-088)', () => {
  it('asks_swisstopo_for_heights_along_a_line_in_switzerland_in_lv95', async () => {
    h.fetch.mockResolvedValue(
      json([
        { dist: 0, alts: { COMB: 1176 } },
        { dist: 1840, alts: { COMB: 1300 } },
        { dist: 3680, alts: { COMB: 1580 } },
      ]),
    )
    const line = await fetchStraight(KANDERSTEG, OESCHINEN)
    expect(line.map((p) => p.ele)).toEqual([1176, 1300, 1580])
    expect(line[0]).toMatchObject(KANDERSTEG)
    expect(line[2]).toMatchObject(OESCHINEN)
    expect(line[1]!.lon).toBeCloseTo((KANDERSTEG.lon + OESCHINEN.lon) / 2)
    const asked = new URL(String(h.fetch.mock.calls[0]![0]))
    expect(asked.origin + asked.pathname).toBe(HEIGHTS_URL)
    expect(asked.searchParams.get('sr')).toBe('2056')
    const geom = JSON.parse(asked.searchParams.get('geom')!) as { coordinates: number[][] }
    expect(geom.coordinates[0]![0]).toBeGreaterThan(2_600_000)
  })

  it('draws_a_line_outside_switzerland_without_asking_anyone', async () => {
    const line = await fetchStraight({ lat: 43.07, lon: 11.67 }, { lat: 43.06, lon: 11.7 })
    expect(line).toEqual([
      { lat: 43.07, lon: 11.67, ele: null },
      { lat: 43.06, lon: 11.7, ele: null },
    ])
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('keeps_the_line_without_heights_when_swisstopo_does_not_answer', async () => {
    h.fetch.mockResolvedValueOnce(json({}, 503))
    expect((await fetchStraight(KANDERSTEG, OESCHINEN)).map((p) => p.ele)).toEqual([null, null])
    h.fetch.mockRejectedValueOnce(new TypeError('offline'))
    expect(await fetchStraight(KANDERSTEG, OESCHINEN)).toHaveLength(2)
  })
})
