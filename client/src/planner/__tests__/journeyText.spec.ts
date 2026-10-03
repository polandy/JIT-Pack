// @vitest-environment jsdom
// The subject reads the catalogue, and switching language sets
// `document.documentElement.lang`.
/** FR-29.18: an excursion's way there and back, as its card and M27's list say it. */
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import {
  DAY_ENTRY_CONNECTION,
  EXCURSION_ROLE_BACK,
  EXCURSION_ROLE_OUT,
  type ConnectionLeg,
  type DayEntry,
} from '@/types/domain'
import { budgetWords, journeyDetail, journeyDuration, journeyLine } from '../journeyText'

function entry(id: string, legs: ConnectionLeg[]): DayEntry {
  return {
    id,
    trip_id: 't1',
    author_id: 'u1',
    kind: DAY_ENTRY_CONNECTION,
    on_date: '2026-10-10',
    at_time: legs[0]!.dep.slice(11, 16),
    title: `${legs[0]!.from} → ${legs[legs.length - 1]!.to}`,
    note: null,
    link: null,
    legs,
    excursion_id: 'x1',
    excursion_role: id === 'out' ? EXCURSION_ROLE_OUT : EXCURSION_ROLE_BACK,
  }
}

const OUT = entry('out', [
  { from: 'Spiez', to: 'Frutigen', dep: '2026-10-10T08:06', arr: '2026-10-10T08:20', line: 'RE' },
  {
    from: 'Frutigen',
    to: 'Kandersteg',
    dep: '2026-10-10T08:27',
    arr: '2026-10-10T08:44',
    line: 'B 230',
  },
])
const BACK = entry('back', [
  { from: 'Kandersteg', to: 'Spiez', dep: '2026-10-10T16:23', arr: '2026-10-10T16:52', line: 'RE' },
])

describe('journey words (FR-29.18)', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('says a way as its stops, its lines and its changes', () => {
    setLocale('de')
    expect(journeyDetail(OUT)).toBe('Spiez → Kandersteg · RE, B 230 · 1× umsteigen')
    expect(journeyDetail(BACK)).toBe('Kandersteg → Spiez · RE · direkt')
  })

  it('says a duration in minutes under an hour and in hours above, unrounded', () => {
    setLocale('de')
    expect(journeyDuration(25)).toBe('25 min')
    expect(journeyDuration(469)).toBe('7 h 49')
  })

  it('says the time on the spot, and with a route what is left, toned by how much', () => {
    setLocale('de')
    const bar = { total: 0, arrive: 0, routeEnd: 0, leave: 0 }
    const onSite = { kind: 'onSite' as const, onSiteMinutes: 469, bar }
    expect(budgetWords({ ...onSite, routeMinutes: 205, slackMinutes: 264 })).toEqual({
      text: 'Vor Ort 7 h 49 · Route 3 h 25 → 4 h 24 Luft',
      tone: 'ok',
    })
    expect(budgetWords({ ...onSite, routeMinutes: 440, slackMinutes: 29 }).tone).toBe('tight')
    expect(budgetWords({ ...onSite, routeMinutes: 500, slackMinutes: -31 })).toEqual({
      text: 'Vor Ort 7 h 49 · Route 8 h 20 → 31 min zu wenig',
      tone: 'short',
    })
    expect(budgetWords({ ...onSite, routeMinutes: null, slackMinutes: null })).toEqual({
      text: 'Vor Ort 7 h 49',
      tone: null,
    })
  })

  it('says from when one can leave at the earliest', () => {
    setLocale('de')
    expect(
      budgetWords({
        kind: 'earliestBack',
        arrival: '08:34',
        routeMinutes: 205,
        earliestBack: '11:59',
      }).text,
    ).toBe('An 08:34 · Route 3 h 25 → frühestens zurück ab 11:59')
  })

  it('names on M27 the departures of the ways there are, and nothing without one', () => {
    setLocale('de')
    expect(journeyLine({ out: OUT, back: BACK, others: [] })).toBe('08:06 hin · 16:23 zurück')
    expect(journeyLine({ out: null, back: BACK, others: [] })).toBe('16:23 zurück')
    expect(journeyLine({ out: null, back: null, others: [OUT] })).toBeNull()
  })
})
