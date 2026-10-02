// @vitest-environment jsdom
/** FR-29.7: where a trip opens — decided by date, the last visited view before it. */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  isUnderWay,
  openingView,
  readLastView,
  rememberedView,
  writeLastView,
  type OpeningFacts,
  type OpeningTrip,
} from '../tripOpening'

const TODAY = '2026-07-14'

function trip(over: Partial<OpeningTrip> = {}): OpeningTrip {
  return { status: 'planning', start_date: '2026-07-20', end_date: '2026-07-27', ...over }
}

function facts(over: Partial<OpeningFacts> = {}): OpeningFacts {
  return {
    today: TODAY,
    lastView: null,
    packingEmpty: false,
    todayEmpty: false,
    shoppingOpen: 0,
    tasksOpen: 0,
    ...over,
  }
}

describe('openingView', () => {
  it('opens a trip before departure on the view last visited', () => {
    expect(openingView(trip(), facts({ lastView: 'shopping' }))).toBe('shopping')
  })

  it('opens a first visit on the ideas while the packing list is empty', () => {
    expect(openingView(trip(), facts({ packingEmpty: true }))).toBe('ideas')
  })

  it('opens a first visit on the packing list once it has rows', () => {
    expect(openingView(trip(), facts({ packingEmpty: false }))).toBe('packing')
  })

  it('opens a first visit on the packing list while its rows are not on the device', () => {
    expect(openingView(trip(), facts({ packingEmpty: null }))).toBe('packing')
  })

  it('opens on the day plan from the first day to the last', () => {
    for (const today of ['2026-07-20', '2026-07-23', '2026-07-27']) {
      expect(openingView(trip(), facts({ today, lastView: 'shopping' }))).toBe('dayplan')
    }
  })

  it('opens on the day plan once the trip was started early', () => {
    expect(openingView(trip({ status: 'active' }), facts({ lastView: 'ideas' }))).toBe('dayplan')
  })

  it('opens on the shopping list while today has nothing on the plan', () => {
    const quiet = { today: '2026-07-22', todayEmpty: true }
    expect(openingView(trip(), facts({ ...quiet, shoppingOpen: 2, tasksOpen: 3 }))).toBe('shopping')
    expect(openingView(trip(), facts(quiet))).toBe('shopping')
  })

  it('opens on the tasks while today has nothing on the plan and nothing is to buy', () => {
    const quiet = { today: '2026-07-22', todayEmpty: true, shoppingOpen: 0 }
    expect(openingView(trip(), facts({ ...quiet, tasksOpen: 1 }))).toBe('tasks')
  })

  it('opens on the day plan while its rows are not on the device', () => {
    expect(openingView(trip(), facts({ today: '2026-07-22', todayEmpty: null }))).toBe('dayplan')
  })

  it('opens on the packing list after the last day, and once the trip is closed', () => {
    expect(openingView(trip(), facts({ today: '2026-07-28', lastView: 'dayplan' }))).toBe('packing')
    expect(
      openingView(trip({ status: 'archived' }), facts({ today: '2026-07-22', lastView: 'ideas' })),
    ).toBe('packing')
  })

  it('does not open on a day plan the trip does not have', () => {
    const undated = trip({ status: 'active', start_date: null, end_date: null })
    expect(openingView(undated, facts({ lastView: 'tasks' }))).toBe('tasks')
    expect(openingView(trip({ end_date: null }), facts({ lastView: 'dayplan' }))).toBe('packing')
  })
})

describe('isUnderWay', () => {
  it('does not count a finished packing — only the dates and the start do', () => {
    expect(isUnderWay(trip(), TODAY)).toBe(false)
    expect(isUnderWay(trip(), '2026-07-20')).toBe(true)
    expect(isUnderWay(trip({ status: 'active' }), TODAY)).toBe(true)
    expect(isUnderWay(trip({ status: 'active' }), '2026-07-28')).toBe(false)
  })
})

describe('the last visited view', () => {
  beforeEach(() => localStorage.clear())

  it('is remembered per trip on this device', () => {
    writeLastView('t1', 'notes')
    writeLastView('t2', 'ideas')
    expect(readLastView('t1')).toBe('notes')
    expect(readLastView('t2')).toBe('ideas')
    expect(readLastView('t3')).toBeNull()
  })

  it('remembers the packing list for the two views read off it', () => {
    expect(rememberedView('luggage')).toBe('packing')
    expect(rememberedView('analytics')).toBe('packing')
    writeLastView('t1', 'analytics')
    expect(readLastView('t1')).toBe('packing')
  })

  it('reads a stored value that names no view as none', () => {
    localStorage.setItem('jp_trip_view_t1', 'gone')
    expect(readLastView('t1')).toBeNull()
  })
})
