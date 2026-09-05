/**
 * The series/destination group runs on a context, not on the orchestrator
 * (R-4) — and it is the first group whose context is more than a queue: it
 * reads the master store and asks the shared name guards before it writes.
 * That is what these cases are here for; the refusal paths in particular are
 * the reason `names` is on the context rather than inside one group.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createSeriesActions } from '../actions/series'
import { makeSeamContext, pullIn, type Recorded, paintedRow, type SeamContext } from './seamContext'
import { TABLE } from '@/types/tables'
import type { DestinationChecklistItem, TripSeries } from '@/types/domain'

const TRIP_ID = 'trip-1'

let queued: Recorded[]
let ctx: SeamContext

beforeEach(() => {
  setActivePinia(createPinia())
  ;({ ctx, queued } = makeSeamContext())
})

describe('createSeriesActions without an orchestrator', () => {
  it('createSeries queues one insert on the master partition, with no trip', () => {
    const id = createSeriesActions(ctx).createSeries('Sommerferien')

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.id).toBeNull()
    expect(queued[0]!.muts[0]!.mutation.op).toBe('insert')
    expect(queued[0]!.muts[0]!.mutation.id).toBe(id)
  })

  it('createSeries refuses a name another series already holds (FR-13.1)', () => {
    pullIn(ctx.masterStore, TABLE.tripSeries, 'ser-1', { name: 'Sommerferien' })

    expect(createSeriesActions(ctx).createSeries('Sommerferien')).toBeNull()
    expect(queued).toEqual([])
  })

  it('updateSeries refuses a rename onto a taken name and writes nothing', () => {
    pullIn(ctx.masterStore, TABLE.tripSeries, 'ser-1', { name: 'Sommerferien' })
    pullIn(ctx.masterStore, TABLE.tripSeries, 'ser-2', { name: 'Skiferien' })
    const skiing = ctx.masterStore.seriesList.find((s) => s.id === 'ser-2') as TripSeries

    expect(createSeriesActions(ctx).updateSeries(skiing, { name: 'Sommerferien' })).toBe(false)
    expect(queued).toEqual([])
  })

  it('updateSeries paints the whole row, not only the changed field', () => {
    pullIn(ctx.masterStore, TABLE.tripSeries, 'ser-1', {
      name: 'Sommerferien',
      // The wire carries the attributes as JSON text, and `seriesRow` writes
      // them back as text — the fixture is the wire's shape, not the domain's.
      default_attributes: JSON.stringify({ destination: 'Italien' }),
    })
    const series = ctx.masterStore.seriesList[0] as TripSeries

    expect(createSeriesActions(ctx).updateSeries(series, { name: 'Sommer' })).toBe(true)
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      name: 'Sommer',
      default_attributes: JSON.stringify({ destination: 'Italien' }),
    })
  })

  it('setTripSeries writes on the master partition and needs the trip to be known', () => {
    createSeriesActions(ctx).setTripSeries(TRIP_ID, 'ser-1')
    expect(queued).toEqual([])

    pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, { name: 'Elba', year: 2026, status: 'planning' })
    createSeriesActions(ctx).setTripSeries(TRIP_ID, 'ser-1')

    expect(queued).toHaveLength(1)
    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({ series_id: 'ser-1' })
    // The whole trip row, not just the column the action names (PR #158).
    expect(paintedRow(queued[0]!.muts[0]!)).toMatchObject({
      name: 'Elba',
      status: 'planning',
    })
  })

  it('ensureDestinationProfile creates once and then returns the existing id (FR-13.2)', () => {
    const actions = createSeriesActions(ctx)
    const first = actions.ensureDestinationProfile('ser-1')

    expect(queued).toHaveLength(1)
    pullIn(ctx.masterStore, TABLE.destinationProfiles, first, { series_id: 'ser-1' })

    expect(actions.ensureDestinationProfile('ser-1')).toBe(first)
    expect(queued).toHaveLength(1)
  })

  it('addChecklistItem inserts, updateChecklistItem repaints the whole row', () => {
    const actions = createSeriesActions(ctx)
    const id = actions.addChecklistItem('prof-1', 'Sonnencreme', 'buy_local')
    expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
      profile_id: 'prof-1',
      label: 'Sonnencreme',
      mode: 'buy_local',
    })

    pullIn(ctx.masterStore, TABLE.destinationChecklistItems, id, {
      profile_id: 'prof-1',
      label: 'Sonnencreme',
      // Not `buy_local`: that is `rowToChecklistItem`'s fallback.
      mode: 'pack',
    })
    const item = ctx.masterStore.getChecklistItems('prof-1')[0] as DestinationChecklistItem

    actions.updateChecklistItem(item, { label: 'Sonnenschutz' })
    expect(paintedRow(queued[1]!.muts[0]!)).toMatchObject({
      profile_id: 'prof-1',
      label: 'Sonnenschutz',
      mode: 'pack',
    })
  })

  it('deleteChecklistItem queues a tombstone on the master partition', () => {
    createSeriesActions(ctx).deleteChecklistItem('cl-1')

    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('cl-1')
  })
})
