/**
 * The activity log (FR-32.1): who changed what, read one page at a time from
 * the trip's endpoint or the inventory's.
 *
 * It is read, never synced: the log is the server's record of the writes it
 * applied, and a device holding a copy would only hold a stale one. Local
 * Mode has no server to have recorded anything, so it has no log at all —
 * the screen that shows one is not offered there (G-8).
 */
import { API } from '@/api/routes'

import type { ActivityListResponse } from '@/api/types'
import type { RestClient } from './restClient'

export interface ActivityDeps {
  client: RestClient
  localMode: boolean
}

export interface ActivityActions {
  /** One page of a trip's log, newest first, older than `before` when given. */
  fetchTripActivity(tripId: string, before?: number): Promise<ActivityListResponse>
  /** One page of the inventory's log, as this account may read it. */
  fetchInventoryActivity(before?: number): Promise<ActivityListResponse>
}

const NO_ACTIVITY: ActivityListResponse = { entries: [], before: 0 }

export function createActivityActions(deps: ActivityDeps): ActivityActions {
  const { client, localMode } = deps
  const page = (before?: number): Record<string, string> =>
    before ? { before: String(before) } : {}

  return {
    async fetchTripActivity(tripId, before) {
      if (localMode) return NO_ACTIVITY
      return client.get<ActivityListResponse>(API.tripActivity(tripId), page(before))
    },

    async fetchInventoryActivity(before) {
      if (localMode) return NO_ACTIVITY
      return client.get<ActivityListResponse>(API.masterActivity, page(before))
    },
  }
}
