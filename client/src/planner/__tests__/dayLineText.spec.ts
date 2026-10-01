// @vitest-environment jsdom
// The subject reads the catalogue, and switching language sets
// `document.documentElement.lang`.
/** FR-29.15: what a day plan line says, and a strip tile's two halves. */
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import type { DayPlanLine } from '@/lib/dayPlanSources'
import { dayLineWords, stripDay } from '../dayLineText'
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
