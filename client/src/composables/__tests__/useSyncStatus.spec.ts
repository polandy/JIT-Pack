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
