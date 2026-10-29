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
import { TABLE } from '@/api/tables'
import type { DestinationChecklistItem, DestinationTask, TripSeries } from '@/types/domain'

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
    pullIn(ctx.masterStore, TABLE.destinationChecklistItems, 'cl-1', {
      profile_id: 'prof-1',
      label: 'Sonnencreme',
      mode: 'pack',
    })

    createSeriesActions(ctx).deleteChecklistItem('cl-1')

    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('cl-1')
  })

  it("addDestinationTask inserts on the series' profile, updateDestinationTask repaints the whole row (FR-13.4)", () => {
    const actions = createSeriesActions(ctx)
    const id = actions.addDestinationTask('ser-1', 'Schneeketten prüfen', 28, 'u2')

    expect(queued).toHaveLength(2) // ensureDestinationProfile, then the task.
    expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({
      task: 'Schneeketten prüfen',
      lead_days: 28,
      assignee_user_id: 'u2',
    })

    pullIn(ctx.masterStore, TABLE.destinationProfiles, 'prof-1', { series_id: 'ser-1' })
    pullIn(ctx.masterStore, TABLE.destinationTasks, id, {
      profile_id: 'prof-1',
      task: 'Schneeketten prüfen',
      lead_days: 28,
      assignee_user_id: 'u2',
    })
    const task = ctx.masterStore.getDestinationTasks('prof-1')[0] as DestinationTask

    actions.updateDestinationTask(task, { lead_days: 14 })
    expect(paintedRow(queued[2]!.muts[0]!)).toMatchObject({
      task: 'Schneeketten prüfen',
      lead_days: 14,
      assignee_user_id: 'u2',
    })
  })

  it('deleteDestinationTask queues a tombstone on the master partition', () => {
    pullIn(ctx.masterStore, TABLE.destinationTasks, 'dt-1', {
      profile_id: 'prof-1',
      task: 'Schneeketten prüfen',
      lead_days: 28,
      assignee_user_id: null,
    })

    createSeriesActions(ctx).deleteDestinationTask('dt-1')

    expect(queued[0]!.type).toBe('master')
    expect(queued[0]!.muts[0]!.mutation.op).toBe('delete')
    expect(queued[0]!.muts[0]!.mutation.id).toBe('dt-1')
  })

  describe('offerSeriesTasks / applySeriesTaskOffer (FR-13.4, a later-joining trip)', () => {
    function seedSeriesTask(): void {
      pullIn(ctx.masterStore, TABLE.destinationProfiles, 'prof-1', { series_id: 'ser-1' })
      pullIn(ctx.masterStore, TABLE.destinationTasks, 'dt-1', {
        profile_id: 'prof-1',
        task: 'Schneeketten prüfen',
        lead_days: 28,
        assignee_user_id: 'u2',
      })
    }

    it('offers nothing for a trip with no series', () => {
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, { name: 'Elba', year: 2026, status: 'planning' })
      expect(createSeriesActions(ctx).offerSeriesTasks(TRIP_ID)).toBeNull()
    })

    it('offers nothing for an archived trip', () => {
      seedSeriesTask()
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
        name: 'Elba',
        year: 2026,
        status: 'archived',
        series_id: 'ser-1',
      })
      expect(createSeriesActions(ctx).offerSeriesTasks(TRIP_ID)).toBeNull()
    })

    it('offers the series task the trip does not yet carry, by exact trimmed text', () => {
      seedSeriesTask()
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
        name: 'Elba',
        year: 2026,
        status: 'planning',
        series_id: 'ser-1',
      })
      pullIn(ctx.tripStore, TABLE.tripMembers, 'tm-1', { trip_id: TRIP_ID, user_id: 'u2' })

      const offer = createSeriesActions(ctx).offerSeriesTasks(TRIP_ID)

      expect(offer?.toCreate).toEqual([
        {
          destination_task_id: 'dt-1',
          body: 'Schneeketten prüfen',
          start_lead_days: 28,
          assignee_user_id: 'u2',
        },
      ])
    })

    it('offers nothing once the trip already holds every series task', () => {
      seedSeriesTask()
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, {
        name: 'Elba',
        year: 2026,
        status: 'planning',
        series_id: 'ser-1',
      })
      pullIn(ctx.tripStore, TABLE.comments, 'c-1', {
        trip_id: TRIP_ID,
        trip_item_id: null,
        is_task: 1,
        task_state: 'open',
        body: 'Schneeketten prüfen',
      })

      expect(createSeriesActions(ctx).offerSeriesTasks(TRIP_ID)).toBeNull()
    })

    it("applySeriesTaskOffer writes the ticked drafts' tasks, assigning only where named", () => {
      pullIn(ctx.tripStore, TABLE.trips, TRIP_ID, { name: 'Elba', year: 2026, status: 'planning' })

      createSeriesActions(ctx).applySeriesTaskOffer(TRIP_ID, [
        {
          destination_task_id: 'dt-1',
          body: 'Schneeketten prüfen',
          start_lead_days: 28,
          assignee_user_id: 'u2',
        },
      ])

      expect(queued[0]!.muts[0]!.mutation.fields).toMatchObject({
        body: 'Schneeketten prüfen',
        destination_task_id: 'dt-1',
        anchor_kind: 'trip_start',
        anchor_lead_days: 28,
      })
      expect(queued[1]!.muts[0]!.mutation.fields).toMatchObject({ assignee_user_id: 'u2' })
    })
  })
})
