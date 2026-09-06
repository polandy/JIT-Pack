/**
 * G-3 / FR-5.3 / FR-5.7 lock state, driven directly: a `Map`, a `Set` and
 * one question about who the session is. No orchestrator, no store, no
 * socket — the four questions a row asks while rendering are decided from
 * this state alone.
 */
import { describe, it, expect } from 'vitest'

import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import { createLockState } from '../locks'
import type { TripItem } from '@/types/domain'

const TRIP = 't1'

function row(over: Partial<TripItem> = {}): TripItem {
  return {
    id: 'ti1',
    trip_id: TRIP,
    name: 'Zelt',
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    ...over,
  } as TripItem
}

/** What a drain writes for a row somebody else is packing. */
function heldBy(user: string): TripItem {
  return row({ state: 'packing_now', packing_now_by: user, packing_now_at: '2026-07-09T10:00:00Z' })
}

describe('a row the synced state says is being packed', () => {
  it('is locked, and names its holder', () => {
    const locks = createLockState(() => 'alice')

    expect(locks.isLockedByOther(TRIP, heldBy('sarah'))).toBe(true)
    expect(locks.lockHolder(TRIP, heldBy('sarah'))).toBe('sarah')
  })

  // FR-5.7 / ADR-028: this asserted the opposite until 2026-08-24 — a claim
  // older than the §7 window stopped locking the row. There is no window
  // now, so age says nothing and the row stays held.
  it('is still locked however old the claim is (FR-5.7)', () => {
    const locks = createLockState(() => 'alice')
    const old = row({
      state: 'packing_now',
      packing_now_by: 'sarah',
      packing_now_at: '2020-01-01T00:00:00Z',
    })

    expect(locks.isLockedByOther(TRIP, old)).toBe(true)
    expect(locks.lockHolder(TRIP, old)).toBe('sarah')
  })

  it('is not one this device holds a claim on', () => {
    const locks = createLockState(() => 'alice')

    expect(locks.holdsClaim(TRIP, heldBy('sarah'))).toBe(false)
  })
})

describe('a claim this device made', () => {
  it('never locks the row for me, and is reported as mine', () => {
    const locks = createLockState(() => 'alice')
    locks.claim('ti1')
    const mine = heldBy('alice')

    // Both halves: the row is not locked *for me* — that is what makes it
    // usable — and it is nonetheless being held by me against the others.
    expect(locks.lockHolder(TRIP, mine)).toBeNull()
    expect(locks.holdsClaim(TRIP, mine)).toBe(true)
  })

  it('survives the window between the tap and the server stamping it', () => {
    // The optimistic claim writes a placeholder until the server stamps the
    // real actor (invariant 3). It means "me, unconfirmed", so reading it as
    // a foreign account would revoke every claim the moment it is made.
    const locks = createLockState(() => 'alice')
    locks.claim('ti1')
    const unconfirmed = heldBy(CLIENT_ACTOR_PLACEHOLDER)

    expect(locks.holdsClaim(TRIP, unconfirmed)).toBe(true)
    expect(locks.isLockedByOther(TRIP, unconfirmed)).toBe(false)
  })

  it('stops being reported once the row is given back', () => {
    const locks = createLockState(() => 'alice')
    locks.claim('ti1')
    expect(locks.holdsClaim(TRIP, heldBy('alice'))).toBe(true)

    locks.release('ti1')

    expect(locks.holdsClaim(TRIP, heldBy('alice'))).toBe(false)
  })
})

describe('an item.locked frame (Sync-API §7)', () => {
  it('locks the row before any pull has landed', () => {
    const locks = createLockState(() => 'alice')
    expect(locks.isLockedByOther(TRIP, row())).toBe(false)

    locks.onLocked(TRIP, 'ti1', 'sarah')

    // The row itself still says `open`: the ephemeral lock is what the
    // padlock renders from until the drain catches up.
    expect(locks.isLockedByOther(TRIP, row())).toBe(true)
    expect(locks.lockHolder(TRIP, row())).toBe('sarah')
  })

  it('naming another account ends my claim — that is what a takeover is', () => {
    const locks = createLockState(() => 'alice')
    locks.claim('ti1')

    locks.onLocked(TRIP, 'ti1', 'bob')

    expect(locks.holdsClaim(TRIP, heldBy('bob'))).toBe(false)
    expect(locks.lockHolder(TRIP, heldBy('bob'))).toBe('bob')
  })

  it('naming my own account leaves my claim alone', () => {
    // The hub broadcasts a claim to every subscriber including the claimer,
    // and my own second device is still me.
    const locks = createLockState(() => 'alice')
    locks.claim('ti1')

    locks.onLocked(TRIP, 'ti1', 'alice')

    expect(locks.holdsClaim(TRIP, heldBy('alice'))).toBe(true)
    expect(locks.lockHolder(TRIP, heldBy('alice'))).toBeNull()
  })

  it('keeps the device rule where there is no identity to compare', () => {
    // One account, two devices (Local and Single-User Mode): the claim
    // belongs to the device that made it, and there is no second person who
    // could have taken it.
    const locks = createLockState(() => null)
    locks.claim('ti1')

    locks.onLocked(TRIP, 'ti1', 'e2e-local')

    expect(locks.holdsClaim(TRIP, heldBy('e2e-local'))).toBe(true)
  })

  it('is not recorded over a claim of mine, so the pull decides alone', () => {
    // Without this the frame's `by_user` would outrank the row the server
    // stamped, and a claim confirmed as mine would render as somebody's.
    const locks = createLockState(() => 'alice')
    locks.claim('ti1')

    locks.onLocked(TRIP, 'ti1', 'alice')

    expect(locks.lockHolder(TRIP, row())).toBeNull()
  })
})

describe('an item.unlocked frame (Sync-API §7)', () => {
  it('frees the row', () => {
    const locks = createLockState(() => 'alice')
    locks.onLocked(TRIP, 'ti1', 'sarah')

    locks.onUnlocked(TRIP, 'ti1')

    expect(locks.isLockedByOther(TRIP, row())).toBe(false)
  })

  it('forgets that the claim was mine', () => {
    const locks = createLockState(() => 'alice')
    locks.claim('ti1')

    locks.onUnlocked(TRIP, 'ti1')

    expect(locks.holdsClaim(TRIP, heldBy('alice'))).toBe(false)
  })

  it('leaves the same item id in another trip locked', () => {
    const locks = createLockState(() => 'alice')
    locks.onLocked('t1', 'ti1', 'sarah')
    locks.onLocked('t2', 'ti1', 'sarah')

    locks.onUnlocked('t1', 'ti1')

    expect(locks.isLockedByOther('t2', row())).toBe(true)
  })
})

describe('taking a claim over (FR-5.7)', () => {
  it('makes the row mine and drops the frame that named the loser', () => {
    const locks = createLockState(() => 'alice')
    locks.onLocked(TRIP, 'ti1', 'sarah')
    expect(locks.isLockedByOther(TRIP, row())).toBe(true)

    locks.takeOver(TRIP, 'ti1')

    // The ephemeral lock named the previous holder; leaving it would make
    // the row I just took render as still hers.
    expect(locks.isLockedByOther(TRIP, row())).toBe(false)
    expect(locks.holdsClaim(TRIP, heldBy('alice'))).toBe(true)
  })
})
