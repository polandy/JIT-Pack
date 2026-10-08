/**
 * NFR-4.2a's two halves at the seam: the audited LWW losers can be read for
 * either partition, and one of them can be taken back (ADR-023). Local Mode
 * has one writer and therefore no conflicts at all (FR-19.6) — not an empty
 * log, no request.
 */
import { describe, it, expect, vi } from 'vitest'

import { API } from '@/api/routes'
import { createConflictActions } from '../conflicts'
import { stubClient } from './restClientStub'

function actions(localMode = false) {
  const client = stubClient()
  const drainTrip = vi.fn(() => Promise.resolve())
  const drainMaster = vi.fn(() => Promise.resolve())
  return {
    client,
    drainTrip,
    drainMaster,
    conflicts: createConflictActions({ client, localMode, drainTrip, drainMaster }),
  }
}

const TRIP_LOSER = {
  id: 'c1',
  entity_table: 'trip_items',
  entity_id: 'i1',
  field: 'quantity',
  losing_value: '9',
  winning_value: '5',
  resolved_at: '2026-07-09T10:00:00Z',
}

const MASTER_LOSER = {
  id: 'c2',
  entity_table: 'templates',
  entity_id: 'tpl-1',
  field: 'name',
  losing_value: '"Sommerferien"',
  winning_value: '"Ferien"',
  resolved_at: '2026-07-09T10:00:00Z',
}

describe('fetchConflicts', () => {
  it('reads the trip partition log from the trip endpoint', async () => {
    const { client, conflicts } = actions()
    client.answer({ conflicts: [TRIP_LOSER] })

    const found = await conflicts.fetchConflicts('t1')

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ field: 'quantity', losing_value: '9' })
    expect(client.paths()).toEqual([API.tripConflicts('t1')])
  })

  it('resolves empty in Local Mode without asking anything (FR-19.6)', async () => {
    const { client, conflicts } = actions(true)

    expect(await conflicts.fetchConflicts('t1')).toEqual([])
    expect(client.calls).toEqual([])
  })
})

describe('fetchMasterConflicts', () => {
  it('reads the master partition log, which belongs to no trip', async () => {
    const { client, conflicts } = actions()
    client.answer({ conflicts: [MASTER_LOSER] })

    const found = await conflicts.fetchMasterConflicts()

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ entity_table: 'templates', field: 'name' })
    // No trip in the path: this log exists whether or not one is open,
    // which is the whole reason it needs its own endpoint.
    expect(client.paths()).toEqual([API.masterConflicts])
  })

  it('resolves empty in Local Mode without asking anything (FR-19.6)', async () => {
    const { client, conflicts } = actions(true)

    expect(await conflicts.fetchMasterConflicts()).toEqual([])
    expect(client.calls).toEqual([])
  })
})

describe('revertConflict', () => {
  it('posts a trip conflict to the trip endpoint and pulls that partition', async () => {
    const { client, drainTrip, drainMaster, conflicts } = actions()
    client.answer({ ok: true })

    await conflicts.revertConflict('c1', 't1')

    expect(client.calls[0]).toMatchObject({
      verb: 'post',
      path: API.tripConflictRevert('t1', 'c1'),
    })
    // The restored value arrives the normal way (ADR-023), so the drain is
    // the half that makes the revert visible on this device.
    expect(drainTrip).toHaveBeenCalledWith('t1')
    expect(drainMaster).not.toHaveBeenCalled()
  })

  it('posts a master conflict to the master endpoint and pulls master', async () => {
    const { client, drainTrip, drainMaster, conflicts } = actions()
    client.answer({ ok: true })

    await conflicts.revertConflict('c2')

    expect(client.calls[0]).toMatchObject({ verb: 'post', path: API.masterConflictRevert('c2') })
    expect(drainMaster).toHaveBeenCalledTimes(1)
    expect(drainTrip).not.toHaveBeenCalled()
  })

  it('surfaces the server refusal rather than swallowing it', async () => {
    // §6 rule 2 outranks a revert, and the user has to be told which
    // refusal applied — a resolved promise would read as success. What a
    // 409 becomes is `api/client.ts`'s promise; not dropping it is this
    // group's.
    const { client, drainTrip, conflicts } = actions()
    client.fail(new Error('revert_refused'))

    await expect(conflicts.revertConflict('c3', 't1')).rejects.toThrow('revert_refused')
    expect(drainTrip).not.toHaveBeenCalled()
  })

  it('does nothing in Local Mode, which has no conflicts to revert', async () => {
    const { client, drainTrip, drainMaster, conflicts } = actions(true)

    await conflicts.revertConflict('c4', 't1')

    expect(client.calls).toEqual([])
    expect(drainTrip).not.toHaveBeenCalled()
    expect(drainMaster).not.toHaveBeenCalled()
  })
})
