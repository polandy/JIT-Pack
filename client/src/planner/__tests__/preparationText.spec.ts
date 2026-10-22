// @vitest-environment jsdom
// The subject reads the catalogue, and switching language sets
// `document.documentElement.lang`.
/** FR-29.21: how a step's lead reads, and what the plan sheet says of the open steps. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, setLocale } from '@/i18n'
import type { IdeaPreparation } from '@/domain/shared/ideaBridge'
import { leadName, planNotes } from '../preparationText'

function step(over: Partial<IdeaPreparation>): IdeaPreparation {
  return { id: 's1', title: 'Bus reservieren', leadDays: 7, done: false, ...over }
}

describe('FR-29.21 preparation words', () => {
  beforeEach(() => setLocale('de'))
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it('names an offered lead in words and any other in days', () => {
    expect(leadName(1)).toBe('Am Vortag')
    expect(leadName(14)).toBe('2 Wochen vorher')
    expect(leadName(5)).toBe('5 Tage vorher')
  })

  it('says for each open step the day it falls due on the chosen day', () => {
    const notes = planNotes([step({})], '2026-08-12', '2026-07-01')
    expect(notes).toEqual([{ id: 's1', late: false, text: expect.stringContaining('fällig') }])
    expect(notes[0]?.text).toMatch(/^Bus reservieren · fällig /)
  })

  it('warns where the lead has already passed for the chosen day', () => {
    const [note] = planNotes([step({ leadDays: 14 })], '2026-07-10', '2026-07-01')
    expect(note?.late).toBe(true)
    expect(note?.text).toBe(
      '„Bus reservieren“ (2 Wochen vorher) ist für diesen Tag schon überfällig',
    )
  })

  it('leaves out the steps already done, and says nothing without a day', () => {
    expect(planNotes([step({ done: true })], '2026-08-12', '2026-07-01')).toEqual([])
    expect(planNotes([step({})], null, '2026-07-01')).toEqual([])
  })
})
