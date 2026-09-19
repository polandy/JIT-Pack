import { describe, it, expect } from 'vitest'
import { useSyncStatus } from '../useSyncStatus'

describe('useSyncStatus', () => {
  it('starts in synced state with zero pending', () => {
    const status = useSyncStatus()
    expect(status.state.value).toBe('synced')
    expect(status.pendingCount.value).toBe(0)
    expect(status.label.value).toBe('Synced')
  })

  it('transitions to syncing', () => {
    const status = useSyncStatus()
    status.setSyncing()
    expect(status.state.value).toBe('syncing')
    expect(status.label.value).toBe('Syncing…')
  })

  it('transitions to synced after syncing', () => {
    const status = useSyncStatus()
    status.setSyncing()
    status.setSynced()
    expect(status.state.value).toBe('synced')
  })

  it('records when a sync cycle completed, from the injected clock (FR-19.6)', () => {
    let clock = 1_000
    const status = useSyncStatus(() => clock)
    expect(status.lastSyncedAt.value).toBeNull()

    status.setSynced()
    expect(status.lastSyncedAt.value).toBe(1_000)

    clock = 5_000
    status.setOffline()
    expect(status.lastSyncedAt.value).toBe(1_000)
  })

  it('transitions to offline', () => {
    const status = useSyncStatus()
    status.setOffline()
    expect(status.state.value).toBe('offline')
    expect(status.label.value).toBe('Offline')
  })

  it('shows pending count in offline label', () => {
    const status = useSyncStatus()
    status.setOffline()
    status.setPendingCount(3)
    expect(status.label.value).toBe('Offline (3 queued)')
  })

  it('offline takes priority over syncing', () => {
    const status = useSyncStatus()
    status.setSyncing()
    status.setOffline()
    expect(status.state.value).toBe('offline')
  })

  it('setSynced clears offline state', () => {
    const status = useSyncStatus()
    status.setOffline()
    status.setSynced()
    expect(status.state.value).toBe('synced')
  })
})

/**
 * FR-19.2 — the glyph may not promise durability before the write lands.
 * Local Mode used to report "on this device" from the tap onwards, so a
 * reload inside that window came back without the row while the app had
 * already said it was safe.
 */
describe('Local Mode writes (FR-19.2)', () => {
  it('reports syncing while a local write is open, not "local"', () => {
    const status = useSyncStatus()
    status.setLocal()
    expect(status.state.value).toBe('local')

    status.setSyncing()

    expect(status.state.value).toBe('syncing')
  })

  it('returns to "local" once the write has landed', () => {
    const status = useSyncStatus()
    status.setLocal()
    status.setSyncing()

    status.setLocal()

    expect(status.state.value).toBe('local')
  })

  it('a failed local write shows offline rather than a false all-clear', () => {
    const status = useSyncStatus()
    status.setLocal()
    status.setSyncing()

    status.setOffline()

    expect(status.state.value).toBe('offline')
  })

  it('clears that offline state once a later write lands', () => {
    const status = useSyncStatus()
    status.setLocal()
    status.setSyncing()
    status.setOffline()

    status.setSyncing()
    status.setLocal()

    expect(status.state.value).toBe('local')
  })
})

/**
 * The durable outbox's two extra facts (B2, NFR-4.1): how many mutations the
 * server refused for good, and whether the queue is being kept on the device
 * at all. Both are G-2's business — the sheet must not promise durability the
 * browser has withdrawn.
 */
describe('useSyncStatus — durable queue facts', () => {
  it('starts out claiming a durable queue and nothing parked', () => {
    const status = useSyncStatus()

    expect(status.parkedCount.value).toBe(0)
    expect(status.queueDurable.value).toBe(true)
  })

  it('carries the parked count, its reason, and the withdrawn durability', () => {
    const status = useSyncStatus()

    status.setParked(2, 'still_referenced')
    status.setQueueDurable(false)

    expect(status.parkedCount.value).toBe(2)
    expect(status.parkedReason.value).toBe('still_referenced')
    expect(status.queueDurable.value).toBe(false)
  })
})

/**
 * FR-19.6 — the last failed request. The rule that needs a test of its own is
 * the one that looks like a bug: it is *not* cleared by a later success.
 */
describe('useSyncStatus — the last failed request', () => {
  const failure = { method: 'GET', path: '/api/v1/master/sync', status: 503, at: 1_757_000_000_000 }

  it('has nothing to say before anything has failed', () => {
    expect(useSyncStatus().lastFailure.value).toBeNull()
  })

  it('keeps the failure after the device is synced again — nobody was watching when it failed', () => {
    const status = useSyncStatus()

    status.setLastFailure(failure)
    status.setSynced()

    // The positive signal that the success really registered.
    expect(status.state.value).toBe('synced')
    expect(status.lastFailure.value).toEqual(failure)
  })

  it('carries the most recent one, not the first', () => {
    const status = useSyncStatus()

    status.setLastFailure(failure)
    status.setLastFailure({ ...failure, status: null, at: failure.at + 1_000 })

    expect(status.lastFailure.value?.status).toBeNull()
  })
})
