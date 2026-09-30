/**
 * FR-32.3 at the seam: a log is read from the trip's endpoint or the
 * inventory's, a page older than a cursor on request — and Local Mode, which
 * has no server to have recorded anything, asks nothing (G-8).
 */
import { describe, it, expect } from 'vitest'

import { API } from '@/api/routes'
import { createActivityActions } from '../activity'
import { stubClient } from './restClientStub'

function actions(localMode = false) {
  const client = stubClient()
  return { client, activity: createActivityActions({ client, localMode }) }
}

describe('the activity log at the seam (FR-32.3)', () => {
  it("reads a trip's newest page from the trip's endpoint, with no cursor", async () => {
    const { client, activity } = actions()
    client.answer({ entries: [], before: 9 })

    expect(await activity.fetchTripActivity('t1')).toEqual({ entries: [], before: 9 })
    expect(client.calls).toEqual([{ verb: 'get', path: API.tripActivity('t1'), payload: {} }])
  })

  it('reads the older page below a cursor, for the inventory too', async () => {
    const { client, activity } = actions()
    client.answer({ entries: [], before: 0 })

    await activity.fetchInventoryActivity(9)
    expect(client.calls).toEqual([
      { verb: 'get', path: API.masterActivity, payload: { before: '9' } },
    ])
  })

  it('resolves an empty log in Local Mode without asking anything', async () => {
    const { client, activity } = actions(true)

    expect(await activity.fetchTripActivity('t1')).toEqual({ entries: [], before: 0 })
    expect(await activity.fetchInventoryActivity()).toEqual({ entries: [], before: 0 })
    expect(client.calls).toEqual([])
  })
})
