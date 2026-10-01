// @vitest-environment jsdom
// The subject reads the catalogue, and switching language sets
// `document.documentElement.lang`.
/** FR-29.15: what a day plan line says, and a strip tile's two halves. */
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import type { DayPlanLine } from '@/lib/dayPlanSources'
import { connectionDetail, dayLineWords, stripDay } from '../dayLineText'
import { DAY_LINE, type DayLine } from '../domain/dayPlan'

function line(over: Partial<DayLine>): DayLine {
  return {
    key: 'k',
    kind: DAY_LINE.entry,
    time: null,
    title: 'Tisch reserviert',
    detail: '4 Personen',
    span: null,
    done: null,
    progress: null,
    ...over,
  }
}

const nameOf = (id: string | null) => (id === 'user-sia' ? 'Sia' : null)

describe('dayLineWords', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('names an entry by its kind, title and note', () => {
    setLocale('de')
    expect(dayLineWords(line({}), nameOf)).toEqual({
      kind: 'Eintrag',
      title: 'Tisch reserviert',
      detail: '4 Personen',
    })
  })

  it('titles arrival and departure from the catalogue, not the line', () => {
    setLocale('de')
    expect(dayLineWords(line({ kind: DAY_LINE.arrival, title: '' }), nameOf).title).toBe('Anreise')
    expect(dayLineWords(line({ kind: DAY_LINE.departure, title: '' }), nameOf).title).toBe(
      'Abreise',
    )
  })

  it('says where on a multi-day excursion the day stands', () => {
    setLocale('de')
    expect(dayLineWords(line({ kind: DAY_LINE.excursion, span: 'start' }), nameOf).kind).toBe(
      'Ausflug · Start',
    )
    expect(dayLineWords(line({ kind: DAY_LINE.excursion, span: 'return' }), nameOf).kind).toBe(
      'Ausflug · Rückkehr',
    )
  })

  it('gives a task’s second line to whoever does it, and none to nobody', () => {
    const source = { assignee: 'user-sia' } as DayPlanLine
    expect(dayLineWords(line({ kind: DAY_LINE.task, source }), nameOf).detail).toBe('Sia')
    expect(
      dayLineWords(line({ kind: DAY_LINE.task, source: { ...source, assignee: null } }), nameOf)
        .detail,
    ).toBeNull()
  })
})

describe('stripDay', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('reads the calendar day, never UTC midnight', () => {
    setLocale('de')
    expect(stripDay('2026-07-15')).toEqual({ weekday: 'Mi', date: '15' })
  })
})

describe('a connection in words (FR-29.18)', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  const legs = [
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
    {
      from: 'Zürich HB',
      to: 'Bern',
      dep: '2026-10-10T14:22',
      arr: '2026-10-10T15:28',
      line: 'IC 1',
    },
    {
      from: 'Bern',
      to: 'Bern, Bahnhof',
      dep: '2026-10-10T15:28',
      arr: '2026-10-10T15:34',
      line: '',
    },
    {
      from: 'Bern, Bahnhof',
      to: 'Bern, Cäcilienstrasse',
      dep: '2026-10-10T15:39',
      arr: '2026-10-10T15:46',
      line: 'T 6',
    },
  ]

  it('says its arrival, its lines and how often one changes', () => {
    setLocale('de')
    expect(connectionDetail(legs)).toBe('an 15:46 · RE 3, IC 3, IC 1, T 6 · 3× umsteigen')
    setLocale('en')
    expect(connectionDetail(legs)).toBe('arr. 15:46 · RE 3, IC 3, IC 1, T 6 · 3 changes')
  })

  it('says a direct one is direct, a night one arrives a day later and a walk names no line', () => {
    setLocale('de')
    expect(connectionDetail([{ ...legs[0]!, arr: '2026-10-11T06:10' }])).toBe(
      'an 06:10 (+1) · RE 3 · direkt',
    )
    expect(connectionDetail([legs[3]!])).toBe('an 15:34')
  })

  it('gives the connection line its summary as the second line', () => {
    setLocale('de')
    const words = dayLineWords(
      line({
        kind: DAY_LINE.connection,
        title: 'Samedan → Bern, Cäcilienstrasse',
        detail: null,
        entry: {
          id: 'c',
          trip_id: 't',
          author_id: 'u',
          kind: 'connection',
          on_date: '2026-10-10',
          at_time: '10:58',
          title: 'Samedan → Bern, Cäcilienstrasse',
          note: null,
          link: null,
          legs,
        },
      }),
      nameOf,
    )
    expect(words).toEqual({
      kind: 'Verbindung',
      title: 'Samedan → Bern, Cäcilienstrasse',
      detail: 'an 15:46 · RE 3, IC 3, IC 1, T 6 · 3× umsteigen',
    })
  })
})
