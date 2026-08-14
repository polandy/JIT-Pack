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
    expect(status.label.value).toBe('Syncing...')
  })

  it('transitions to synced after syncing', () => {
    const status = useSyncStatus()
    status.setSyncing()
    status.setSynced()
    expect(status.state.value).toBe('synced')
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
})
