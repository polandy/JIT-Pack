import { describe, expect, it } from 'vitest'
import { entryStepDue, isEntryStep } from '../entryPreparation'

describe('entryPreparation (FR-29.21, ADR-108)', () => {
  it('a step is due its lead before the entry’s day', () => {
    expect(entryStepDue(7, { onDate: '2026-07-18' })).toBe('2026-07-11')
  })

  it('a lead reaching before the trip is due all the same', () => {
    expect(entryStepDue(14, { onDate: '2026-07-02' })).toBe('2026-06-18')
  })

  it('a step whose entry is not on the device has no day', () => {
    expect(entryStepDue(7, undefined)).toBeNull()
  })

  it('only a task with the entry link and an entry anchor with a lead is a step', () => {
    const step = { day_entry_id: 'e1', anchor_kind: 'entry', anchor_lead_days: 3 } as const
    expect(isEntryStep(step)).toBe(true)
    expect(isEntryStep({ ...step, day_entry_id: null })).toBe(false)
    expect(isEntryStep({ ...step, anchor_kind: 'idea' })).toBe(false)
    expect(isEntryStep({ ...step, anchor_lead_days: null })).toBe(false)
  })
})
