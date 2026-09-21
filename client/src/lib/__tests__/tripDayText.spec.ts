import { describe, expect, it } from 'vitest'

import type { TripDay } from '@/domain/tripDay'
import { t } from '@/i18n'
import { dayText, phaseWord } from '../tripDayText'

describe('dayText (FR-7.9): the counter’s words', () => {
  it.each<[string, TripDay, string | null, string | null]>([
    [
      'three days ahead',
      { kind: 'before', daysUntil: 3 },
      t('dashboard.dayBefore', { n: 3 }),
      null,
    ],
    ['one day ahead', { kind: 'before', daysUntil: 1 }, t('dashboard.dayBefore', { n: 1 }), null],
    ['the day of departure', { kind: 'first' }, t('dashboard.dayFirst'), null],
    [
      'on the road',
      { kind: 'during', day: 2, total: 7, remaining: 5 },
      t('dashboard.dayOf', { day: 2, total: 7 }),
      t('dashboard.dayRemaining', { n: 5 }),
    ],
    [
      'the day before the last',
      { kind: 'during', day: 6, total: 7, remaining: 1 },
      t('dashboard.dayOf', { day: 6, total: 7 }),
      t('dashboard.dayRemaining', { n: 1 }),
    ],
    [
      'no end date',
      { kind: 'during', day: 3, total: null, remaining: null },
      t('dashboard.dayOpenEnded', { day: 3 }),
      null,
    ],
    ['the last day', { kind: 'last' }, t('dashboard.dayLast'), null],
  ])('%s', (_name, day, headline, sub) => {
    expect(dayText(day)).toEqual({ headline, sub })
  })

  it('reads one day in the singular and several in the plural', () => {
    // The two would be equal if the plural form were never selected.
    expect(t('dashboard.dayBefore', { n: 1 })).not.toBe(t('dashboard.dayBefore', { n: 3 }))
    expect(t('dashboard.dayBefore', { n: 3 })).toContain('3')
  })

  it('says nothing after the trip or without a start date', () => {
    expect(dayText({ kind: 'after' })).toBeNull()
    expect(dayText({ kind: 'none' })).toBeNull()
  })
})

describe('phaseWord (FR-7.9)', () => {
  it('is the packing stamp, not the trip’s status', () => {
    expect(phaseWord(false)).toBe(t('dashboard.phasePacking'))
    expect(phaseWord(true)).toBe(t('dashboard.phaseOnSite'))
    expect(phaseWord(true)).not.toBe(phaseWord(false))
  })
})
