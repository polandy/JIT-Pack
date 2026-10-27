// @vitest-environment node
// The subject reads only the planner store; nothing of the DOM.
/**
 * FR-29.7: the planner's answer to the kernel's opening rule — whether the
 * day a trip under way opens on holds nothing. The rule itself is
 * `openingDayHoldsNothing`'s spec; this is the adapter that feeds it the
 * trip's ideas and entries from the store and the packing side's lines.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { TABLE } from '@/api/tables'
import type { DayPlanLine, DayPlanSource } from '@/domain/shared/dayPlanLine'
import { DAY_PLAN_EXCURSION, DAY_PLAN_TASK } from '@/domain/shared/dayPlanLine'
import { dayPlanEmpty } from '@/planner'
import { usePlannerStore } from '../store'
import { DAY_ENTRY_NOTE, IDEA_STATE_SHORTLISTED } from '../types'

const TRIP = { start_date: '2026-07-12', end_date: '2026-07-15' }
const TODAY = '2026-07-13'
const TOMORROW = '2026-07-14'

beforeEach(() => setActivePinia(createPinia()))

let seq = 0

function pulled(table: string, id: string, row: Record<string, unknown>) {
  return { seq: ++seq, table, id, deleted: false, row }
}

function plannedIdea(id: string, tripId: string, plannedOn: string) {
  return pulled(TABLE.ideas, id, {
    trip_id: tripId,
    author_id: 'u1',
    title: `Idee ${id}`,
    state: IDEA_STATE_SHORTLISTED,
    rain_proof: 0,
    planned_on: plannedOn,
  })
}

function dayEntry(id: string, tripId: string, onDate: string) {
  return pulled(TABLE.dayEntries, id, {
    trip_id: tripId,
    author_id: 'u1',
    kind: DAY_ENTRY_NOTE,
    on_date: onDate,
    title: `Eintrag ${id}`,
  })
}

function line(key: string, kind: DayPlanLine['kind'], on: string): DayPlanLine {
  return {
    key,
    kind,
    title: key,
    from: on,
    to: on,
    detail: null,
    progress: null,
    done: null,
    path: '/x',
  }
}

/** A packing-side source holding these lines for `tripId` and none for any other trip. */
function source(tripId: string, ...lines: DayPlanLine[]): DayPlanSource {
  return { lines: (asked) => (asked === tripId ? lines : []) }
}

function emptyFor(...sources: DayPlanSource[]) {
  return (tripId: string) => dayPlanEmpty(() => sources)(tripId, TRIP, TODAY)
}

describe('dayPlanEmpty (FR-29.7)', () => {
  it('FR-29.7: a trip under way whose opening day holds nothing is empty', () => {
    usePlannerStore().applyChanges([
      plannedIdea('later', 't1', TOMORROW),
      dayEntry('later', 't1', TOMORROW),
    ])
    expect(emptyFor(source('t1', line('x', DAY_PLAN_EXCURSION, TOMORROW)))('t1')).toBe(true)
  })

  it('FR-29.7: an idea planned on the opening day fills it', () => {
    usePlannerStore().applyChanges([plannedIdea('i1', 't1', TODAY)])
    expect(emptyFor()('t1')).toBe(false)
  })

  it('FR-29.7: an entry on the opening day fills it', () => {
    usePlannerStore().applyChanges([dayEntry('e1', 't1', TODAY)])
    expect(emptyFor()('t1')).toBe(false)
  })

  it('FR-29.7: an excursion the packing side puts on the opening day fills it', () => {
    expect(emptyFor(source('t1', line('x', DAY_PLAN_EXCURSION, TODAY)))('t1')).toBe(false)
  })

  it('FR-29.7: every source is read, not only the first', () => {
    const quiet = source('t1')
    const tasks = source('t1', line('t', DAY_PLAN_TASK, TODAY))
    expect(emptyFor(quiet, tasks)('t1')).toBe(false)
  })

  it('FR-29.7: another trip’s plan on the same day leaves the asked trip empty', () => {
    usePlannerStore().applyChanges([plannedIdea('i2', 't2', TODAY), dayEntry('e2', 't2', TODAY)])
    expect(emptyFor(source('t2', line('x', DAY_PLAN_EXCURSION, TODAY)))('t1')).toBe(true)
    expect(emptyFor(source('t2', line('x', DAY_PLAN_EXCURSION, TODAY)))('t2')).toBe(false)
  })

  it('FR-29.7: an entry for one traveller still fills the day — whom it is for decides nothing', () => {
    usePlannerStore().applyChanges([
      dayEntry('e1', 't1', TODAY),
      pulled(TABLE.dayEntryTravelers, 'et1', {
        trip_id: 't1',
        day_entry_id: 'e1',
        traveler_id: 'tr-sia',
      }),
    ])
    expect(emptyFor()('t1')).toBe(false)
  })
})
