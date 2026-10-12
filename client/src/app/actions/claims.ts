/**
 * Claims (FR-5.2, FR-5.7, G-3) — taking a row to pack it, giving it back,
 * and taking it over from someone else. The lock state they write and read
 * is `app/locks.ts`; this group is what a tap does with it.
 */
import { API } from '@/api/routes'
import type { LockEvent, LockEventListResponse, TakeoverResponse } from '@/api/types'
import type { TripItem } from '@/types/domain'
import type { SyncContext } from '../context'
import type { LockState } from '../locks'
import type { RestClient } from '../restClient'

/** What the claims need beyond the context: the locks, the server, and a pull. */
export interface ClaimDeps {
  locks: LockState
  client: RestClient
  /** Pull the trip's partition, so a takeover's row arrives. */
  drainTrip(tripId: string): Promise<void>
}

/** createClaimActions binds the claim group to one sync context. */
export function createClaimActions(ctx: SyncContext, deps: ClaimDeps) {
  const { mutations, write, local } = ctx
  const { locks, client, drainTrip } = deps

  /** Claim an item for packing (FR-5.2); locks it for others (G-3). */
  function packingNow(item: TripItem) {
    const mut = mutations.startPackingNow(item.id)
    locks.claim(item.id)
    write(mut)
  }

  /**
   * takeOverClaim ends somebody else's claim and starts mine, in one step
   * (FR-5.7). It is the only part of G-3's lock that goes through the
   * server rather than the outbox: only the server can stamp who took
   * over (invariant 3) and notify the account it was taken from, and a
   * client cannot send itself a notification.
   *
   * Nothing is written optimistically. An outbox mutation would have to
   * be undone when the server refuses — the row may have been packed or
   * released in the meantime — and a taker shown a claim they do not hold
   * is the one outcome worse than waiting for the answer. The row arrives
   * by the drain below, like every other server-originated change.
   *
   * Returns who was holding it, which the confirmation named beforehand
   * and the snackbar names afterwards. Local Mode has no server and no
   * second person, so the surface never reaches here (G-8).
   */
  async function takeOverClaim(tripId: string, item: TripItem): Promise<string> {
    if (local) return ''
    const resp = await client.post<TakeoverResponse>(API.tripItemTakeover(tripId, item.id))
    // The claim is mine from here: without it the row I just took would
    // render as locked against me.
    locks.takeOver(tripId, item.id)
    await drainTrip(tripId)
    return resp.previous_holder ?? ''
  }

  /**
   * fetchLockEvents reads the trip's takeover record (FR-5.7) — who took
   * what from whom. Deliberately not part of the conflict log: that one
   * holds merge losers, and a list of two unrelated kinds of event stops
   * being readable (ADR-028).
   */
  async function fetchLockEvents(tripId: string): Promise<LockEvent[]> {
    if (local) return []
    const resp = await client.get<LockEventListResponse>(API.tripLockEvents(tripId), {})
    return resp.lock_events
  }

  /**
   * releaseClaim gives a row back without packing it (G-3), so a tap made
   * by mistake does not hold the row against everyone else until the §7
   * window ages it out.
   *
   * The state it returns to is derived rather than remembered: the claim
   * overwrote whatever was there, and `packed_count` against `quantity`
   * says the same thing the stepper says — a release that always wrote
   * `open` would throw away work already in the bag.
   */
  function releaseClaim(item: TripItem) {
    const mut = mutations.releasePackingNow(item.id, item.packed_count, item.quantity)
    locks.release(item.id)
    write(mut)
  }

  return {
    isLockedByOther: locks.isLockedByOther,
    holdsClaim: locks.holdsClaim,
    lockHolder: locks.lockHolder,
    packingNow,
    takeOverClaim,
    fetchLockEvents,
    releaseClaim,
  }
}
