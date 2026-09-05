/**
 * A sync partition as a value, and the two requests that can be made against
 * one (Sync-API §4, §5).
 *
 * Which partition a request addresses used to be carried by the *name of the
 * function*: `pullTrip` and `pullMaster` differed in one path expression,
 * `pullTripAll` and `pullMasterAll` were byte-identical apart from which of
 * those they called, and the app's drain held a third copy of all four
 * requests. A rule learned in one copy therefore had to be carried by hand to
 * the others, which is how the paging guard came to exist in the drain alone
 * until 2026-09-01 (see `pullProtocol.ts`).
 *
 * So the partition is a parameter here, the way it became one on the server
 * for the same reason: one pull, one push, and `syncPath` as the single place
 * that knows a trip's feed answers somewhere else than the master feed.
 */

import { API } from '@/api/routes'
import type { APIClient } from '@/api/client'
import type { Mutation, PullChange, PullResponse, PushResponse } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import { hasFurtherPage, observePulledClocks } from '@/sync/pullProtocol'

/** The two feeds a device syncs (Sync-API P-3). */
export type PartitionType = 'trip' | 'master'

/**
 * A partition named the way every caller here wants it. Read-only because
 * `MASTER_PARTITION` below is one shared object: a caller that reassigned a
 * field would be repointing every other caller's partition with it.
 */
export interface PartitionRef {
  readonly type: PartitionType
  /** The trip's id, and `null` for the master feed, which has none. */
  readonly id: string | null
}

/** The master feed, which is the same partition for every caller. */
export const MASTER_PARTITION: PartitionRef = { type: 'master', id: null }

/** One trip's own feed. */
export function tripPartition(id: string): PartitionRef {
  return { type: 'trip', id }
}

/** Server-side push limit per batch (Sync-API §9). */
export const MAX_PUSH_BATCH = 200

/** How many changes one pull asks for (Sync-API §4). */
export const PULL_PAGE_SIZE = 500

/**
 * Where a partition's feed answers.
 *
 * The id is nullable because the master partition has none. A *trip*
 * partition without one is a programming error, and it used to interpolate as
 * the string "null" — a request the server answers 404 and the outbox retries
 * for ever, naming nothing.
 */
export function syncPath(partition: PartitionRef): string {
  if (partition.type === 'master') return API.masterSync
  if (partition.id === null) throw new Error('a trip partition needs a trip id')
  return API.tripSync(partition.id)
}

/**
 * One page of a partition's feed, with every clock in it already observed.
 *
 * The response is handed back as the server sent it: the drain records
 * `next_cursor` and asks `hasFurtherPage` about the same object, and a shape
 * of our own between them would be one more place for the two to disagree.
 */
export async function pullPartition(
  client: APIClient,
  hlc: HLCGenerator,
  partition: PartitionRef,
  cursor: number,
  limit = PULL_PAGE_SIZE,
): Promise<PullResponse> {
  const resp = await client.get<PullResponse>(syncPath(partition), {
    cursor: String(cursor),
    limit: String(limit),
  })
  observePulledClocks(hlc, resp.changes)
  return resp
}

/** Every change from `cursor` onwards, and the cursor that follows them. */
export interface PulledFeed {
  changes: PullChange[]
  nextCursor: number
}

/**
 * A partition's feed to its end, page by page.
 *
 * For a caller that has no screen to paint as it goes — the command line, and
 * only the command line. The app's drain applies each page and records its
 * cursor before asking for the next, so an interrupted feed keeps what it
 * already has; accumulating the lot in memory first would throw that away.
 */
export async function pullPartitionAll(
  client: APIClient,
  hlc: HLCGenerator,
  partition: PartitionRef,
  cursor: number,
): Promise<PulledFeed> {
  const changes: PullChange[] = []
  let cur = cursor
  for (;;) {
    const askedFrom = cur
    const page = await pullPartition(client, hlc, partition, cur)
    changes.push(...page.changes)
    cur = page.next_cursor
    if (!hasFurtherPage(page, askedFrom)) break
  }
  return { changes, nextCursor: cur }
}

/**
 * Sends one batch to a partition, stamped with this device's clock.
 *
 * The batch is the caller's to size: the server caps it at `MAX_PUSH_BATCH`
 * and refuses the whole envelope past that, so both callers chunk before
 * they get here.
 */
export async function pushPartition(
  client: APIClient,
  hlc: HLCGenerator,
  partition: PartitionRef,
  mutations: Mutation[],
): Promise<PushResponse> {
  return client.post<PushResponse>(syncPath(partition), {
    client_hlc: hlc.next(),
    mutations,
  })
}
