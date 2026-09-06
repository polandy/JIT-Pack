/**
 * G-3 collision locking (FR-5.3/5.7): who is holding which row, and whether
 * that somebody is me.
 *
 * A `Map` of a `Map` and a `Set`, with no client, no store and no outbox
 * behind them — which is why they are here rather than in the orchestrator
 * that used to hold them: the four questions a row asks while rendering are
 * decided from this state alone, and deciding them needed the whole facade
 * built first.
 *
 * The two writers stay together with the readers on purpose. `item.locked`
 * arriving for a row this device holds is a *takeover*, and that rule is the
 * lock's own — an orchestrator routing the event decides only that it is a
 * lock event, never what it means.
 */
import { ref } from 'vue'

import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { TripItem } from '@/types/domain'

/** The lock state one session holds, and the only way anything reads it. */
export interface LockState {
  /** Whether the row is held against me — the padlock G-3 renders. */
  isLockedByOther(tripId: string, item: TripItem): boolean
  /**
   * Who is holding this row, or null where it is not locked for me (G-3
   * wants the name, not only the padlock). The user id is what the client
   * has; resolving it to a display name is the view's job, since only it
   * knows the trip's participants.
   */
  lockHolder(tripId: string, item: TripItem): string | null
  /**
   * Whether *this device* is the one holding the row. `lockHolder` is
   * deliberately blind to it — my own claim never locks the row for me —
   * which leaves the one screen that could say "you are holding this
   * against the others" unable to know it.
   */
  holdsClaim(tripId: string, item: TripItem): boolean
  /** This device claims the row (FR-5.2). */
  claim(itemId: string): void
  /** This device gives the row back without packing it (G-3). */
  release(itemId: string): void
  /**
   * The row was taken from whoever held it and is mine from here (FR-5.7).
   * The ephemeral lock goes with it: it named the previous holder, and a
   * claim I hold must not render as somebody else's.
   */
  takeOver(tripId: string, itemId: string): void
  /** An `item.locked` frame arrived (Sync-API §7). */
  onLocked(tripId: string, itemId: string, byUser: string): void
  /** An `item.unlocked` frame arrived (Sync-API §7). */
  onUnlocked(tripId: string, itemId: string): void
}

/**
 * createLockState builds the state for one session.
 *
 * `currentUserId` is the account this session belongs to, or null where
 * there is none (Local and Single-User Mode) — the only outside thing a lock
 * decision consults. There is no staleness window (FR-5.7, ADR-028): a claim
 * is claimed until a person ends it, so a lock is never judged by its age.
 */
export function createLockState(currentUserId: () => string | null): LockState {
  // Ephemeral locks from item.locked events, beside the synced packing_now
  // state. myLocks marks claims made on this device, because the device is
  // the only distinction Local and Single-User Mode have — there is one
  // account in both.
  const itemLocks = ref<Map<string, Map<string, { by_user: string }>>>(new Map())
  const myLocks = new Set<string>()

  /**
   * Whether `holder` is somebody else — the question a device claim cannot
   * answer for itself.
   *
   * Where the session names an account (Server Mode with OIDC), a holder
   * that is a *different* account revokes this device's claim: that is what
   * a takeover is (FR-5.7), and without this the device that lost the row
   * kept rendering it as its own while the server had handed it on — the
   * notification arrived and the row contradicted it. Where there is no
   * account to compare against, the device rule stands unchanged.
   */
  function heldByAnotherAccount(holder: string | null): boolean {
    // The optimistic claim writes a placeholder until the server stamps the
    // real actor (invariant 3). It means "me, unconfirmed", so reading it
    // as a foreign account would revoke every claim the moment it is made.
    if (!holder || holder === CLIENT_ACTOR_PLACEHOLDER) return false
    const me = currentUserId()
    return me !== null && holder !== me
  }

  /** The holder the server knows of, ephemeral event first, then the pull. */
  function syncedHolder(tripId: string, item: TripItem): string | null {
    const ephemeral = itemLocks.value.get(tripId)?.get(item.id)
    if (ephemeral) return ephemeral.by_user
    if (item.state !== 'packing_now') return null
    return item.packing_now_by ?? ''
  }

  /** Whether this device's claim on the row still stands (FR-5.7). */
  function claimIsMine(tripId: string, item: TripItem): boolean {
    if (!myLocks.has(item.id)) return false
    return !heldByAnotherAccount(syncedHolder(tripId, item))
  }

  function lockHolder(tripId: string, item: TripItem): string | null {
    if (claimIsMine(tripId, item)) return null
    return syncedHolder(tripId, item)
  }

  function setItemLock(tripId: string, itemId: string, byUser: string) {
    const next = new Map(itemLocks.value)
    const tripLocks = new Map(next.get(tripId) ?? [])
    tripLocks.set(itemId, { by_user: byUser })
    next.set(tripId, tripLocks)
    itemLocks.value = next
  }

  /**
   * Drops the WS-delivered lock without touching `myLocks`, which
   * `onUnlocked` also clears: after a takeover the row *is* mine, so
   * forgetting that would make my own claim render as somebody else's.
   */
  function clearEphemeralLock(tripId: string, itemId: string) {
    const tripLocks = itemLocks.value.get(tripId)
    if (!tripLocks?.has(itemId)) return
    const next = new Map(itemLocks.value)
    const cleared = new Map(tripLocks)
    cleared.delete(itemId)
    next.set(tripId, cleared)
    itemLocks.value = next
  }

  return {
    isLockedByOther: (tripId, item) => lockHolder(tripId, item) !== null,
    lockHolder,
    holdsClaim: (tripId, item) => claimIsMine(tripId, item) && item.state === 'packing_now',
    claim: (itemId) => void myLocks.add(itemId),
    release: (itemId) => void myLocks.delete(itemId),
    takeOver(tripId, itemId) {
      myLocks.add(itemId)
      clearEphemeralLock(tripId, itemId)
    },
    onLocked(tripId, itemId, byUser) {
      // A lock naming another account on a row this device holds is a
      // takeover (FR-5.7): the claim is gone, so the device flag goes with
      // it rather than outliving the row it describes. The hub broadcasts a
      // claim to every subscriber including the claimer, so "an event
      // arrived" alone would misread my own claim.
      if (heldByAnotherAccount(byUser)) myLocks.delete(itemId)
      if (!myLocks.has(itemId)) setItemLock(tripId, itemId, byUser)
    },
    onUnlocked(tripId, itemId) {
      clearEphemeralLock(tripId, itemId)
      myLocks.delete(itemId)
    },
  }
}
