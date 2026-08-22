/**
 * G-2 / FR-19.6 — the sync detail behind the status glyph.
 *
 * The glyph is one symbol standing for four different situations, and until
 * now tapping it did nothing outside a trip. What the sheet must get right is
 * therefore *which* story it tells: the network states explain the queue and
 * lead to the conflict log, Local Mode explains that there is no server and
 * leads to a backup — conflicts cannot occur there, so offering the log would
 * be a lie about how the mode works.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import SyncDetailSheet from '../SyncDetailSheet.vue'
import type { StorageStatus } from '@/local/storageStatus'

const DAY = 86_400_000
const NOW = 1_760_000_000_000

function storage(over: Partial<StorageStatus> = {}): StorageStatus {
  return {
    available: true,
    usedBytes: 12 * 1024 * 1024,
    quotaBytes: 980 * 1024 * 1024,
    persistent: true,
    ...over,
  }
}

function mountSheet(props: Partial<InstanceType<typeof SyncDetailSheet>['$props']> = {}) {
  return mount(SyncDetailSheet, {
    props: {
      state: 'synced',
      pendingCount: 0,
      mode: 'server',
      canOpenConflicts: false,
      storage: null,
      lastExportAt: null,
      hasBackupContent: false,
      updateReady: false,
      now: NOW,
      ...props,
    },
  })
}

const text = (wrapper: ReturnType<typeof mountSheet>, testid: string) =>
  wrapper.get(`[data-testid="${testid}"]`).text()

const has = (wrapper: ReturnType<typeof mountSheet>, testid: string) =>
  wrapper.find(`[data-testid="${testid}"]`).exists()

describe('SyncDetailSheet — network states (G-2)', () => {
  it('names the state and explains what it means for the user', () => {
    const wrapper = mountSheet({ state: 'synced' })

    expect(text(wrapper, 'sync-detail-title')).toBe('Synced')
    expect(text(wrapper, 'sync-detail-explain')).toContain('reached the server')
  })

  it('counts the queued changes while offline — the queue is the whole worry', () => {
    const wrapper = mountSheet({ state: 'offline', pendingCount: 3 })

    expect(text(wrapper, 'sync-detail-pending')).toBe('3 changes waiting to be sent')
  })

  it('says nothing about a queue when there is none', () => {
    expect(has(mountSheet({ state: 'synced', pendingCount: 0 }), 'sync-detail-pending')).toBe(false)
  })

  it('offers the conflict log inside a trip (NFR-4.2a)', async () => {
    const wrapper = mountSheet({ state: 'synced', canOpenConflicts: true })

    await wrapper.get('[data-testid="sync-detail-conflicts"]').trigger('click')

    expect(wrapper.emitted('conflicts')).toHaveLength(1)
  })

  it('offers the master log with no trip open, and only then hides the trip one', async () => {
    const wrapper = mountSheet({ state: 'synced', canOpenConflicts: false })

    // The trip-scoped log genuinely has no subject here. The master
    // partition's has one either way — inventory, groups and a trip's own
    // fields merge there — and it used to be reachable through nothing.
    expect(has(wrapper, 'sync-detail-conflicts')).toBe(false)
    await wrapper.get('[data-testid="sync-detail-master-conflicts"]').trigger('click')

    expect(wrapper.emitted('masterConflicts')).toHaveLength(1)
  })

  it('offers both logs while a trip is open, because they are two logs', () => {
    const wrapper = mountSheet({ state: 'synced', canOpenConflicts: true })

    expect(has(wrapper, 'sync-detail-conflicts')).toBe(true)
    expect(has(wrapper, 'sync-detail-master-conflicts')).toBe(true)
  })

  it('offers neither in Local Mode, where one writer produces no conflicts', () => {
    const wrapper = mountSheet({ state: 'local', mode: 'local', canOpenConflicts: false })

    expect(has(wrapper, 'sync-detail-conflicts')).toBe(false)
    expect(has(wrapper, 'sync-detail-master-conflicts')).toBe(false)
  })

  it('shows no storage section in Server Mode — the server holds the copy', () => {
    expect(has(mountSheet({ storage: storage() }), 'sync-detail-storage')).toBe(false)
  })
})

describe('SyncDetailSheet — Local Mode (FR-19.6, NFR-4.11)', () => {
  const local = { state: 'local' as const, mode: 'local' as const }

  it('explains that no server is involved', () => {
    const wrapper = mountSheet({ ...local, storage: storage() })

    expect(text(wrapper, 'sync-detail-title')).toBe('On this device')
    expect(text(wrapper, 'sync-detail-explain')).toContain('no server')
  })

  it('never offers either conflict log — one writer cannot conflict', () => {
    const wrapper = mountSheet({ ...local, canOpenConflicts: true, storage: storage() })

    expect(has(wrapper, 'sync-detail-conflicts')).toBe(false)
    expect(has(wrapper, 'sync-detail-master-conflicts')).toBe(false)
    // The positive signal that the sheet rendered its Local Mode half at
    // all, so the two absences above are a choice rather than a blank.
    expect(has(wrapper, 'sync-detail-storage')).toBe(true)
  })

  it('reports how much of the device quota the data uses', () => {
    const wrapper = mountSheet({ ...local, storage: storage() })

    expect(text(wrapper, 'sync-detail-storage-usage')).toBe('12.0 MB of 980.0 MB used')
  })

  it('warns while the browser may evict the only copy (NFR-4.11)', () => {
    const wrapper = mountSheet({ ...local, storage: storage({ persistent: false }) })

    expect(text(wrapper, 'sync-detail-eviction')).toContain('may clear')
  })

  it('stays quiet once the browser promised to keep it', () => {
    const wrapper = mountSheet({ ...local, storage: storage({ persistent: true }) })

    expect(has(wrapper, 'sync-detail-eviction')).toBe(false)
    expect(text(wrapper, 'sync-detail-persistent')).toContain('not clear it')
  })

  it('admits an unreported quota instead of showing zeroes', () => {
    const wrapper = mountSheet({ ...local, storage: storage({ available: false }) })

    expect(has(wrapper, 'sync-detail-storage-usage')).toBe(false)
    expect(has(wrapper, 'sync-detail-eviction')).toBe(false)
    expect(text(wrapper, 'sync-detail-storage-unknown')).toContain('does not report')
  })

  it('says a backup never happened rather than leaving the line empty', () => {
    const wrapper = mountSheet({ ...local, storage: storage(), lastExportAt: null })

    expect(text(wrapper, 'sync-detail-backup-age')).toBe('Never backed up')
  })

  it('ages the last backup against the injected clock, not the wall clock', () => {
    const wrapper = mountSheet({ ...local, storage: storage(), lastExportAt: NOW - 34 * DAY })

    expect(text(wrapper, 'sync-detail-backup-age')).toBe('Last backup 34 days ago')
  })

  it('reads a backup from today as today', () => {
    const wrapper = mountSheet({ ...local, storage: storage(), lastExportAt: NOW - 60_000 })

    expect(text(wrapper, 'sync-detail-backup-age')).toBe('Last backup today')
  })

  it('offers the one-tap backup (NFR-4.11)', async () => {
    const wrapper = mountSheet({ ...local, storage: storage(), hasBackupContent: true })

    await wrapper.get('[data-testid="sync-detail-backup"]').trigger('click')

    expect(wrapper.emitted('backup')).toHaveLength(1)
  })

  it('does not offer to back up an empty device', () => {
    const wrapper = mountSheet({ ...local, storage: storage(), hasBackupContent: false })

    expect(has(wrapper, 'sync-detail-backup')).toBe(false)
    expect(text(wrapper, 'sync-detail-backup-empty')).toContain('Nothing to back up')
  })
})

describe('SyncDetailSheet — a new version waiting (NFR-4.13, ADR-019)', () => {
  it('announces the waiting version and when it takes over — never a forced reload', () => {
    const wrapper = mountSheet({ updateReady: true })

    expect(text(wrapper, 'sync-detail-update')).toContain('new version')
    expect(text(wrapper, 'sync-detail-update')).toContain('next time you open')
  })

  it('shows it in Local Mode too — the bundle updates in every mode', () => {
    const wrapper = mountSheet({ mode: 'local', updateReady: true })

    expect(has(wrapper, 'sync-detail-update')).toBe(true)
  })

  it('says nothing while no update is waiting', () => {
    const wrapper = mountSheet({ updateReady: false })

    // The positive signal the absence leans on: the same sheet rendered.
    expect(text(wrapper, 'sync-detail-title')).toBe('Synced')
    expect(has(wrapper, 'sync-detail-update')).toBe(false)
  })
})

describe('SyncDetailSheet — chrome', () => {
  it('closes on the close button', async () => {
    const wrapper = mountSheet()

    await wrapper.get('[data-testid="sync-detail-close"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

/**
 * The durable queue (B2, NFR-4.1). Two facts the sheet is the only place for:
 * whether closing the app would lose the queue, and what became of a change
 * the server refused outright.
 */
describe('SyncDetailSheet — the durable queue', () => {
  it('says the queue is kept on the device, so a reload is safe', () => {
    const wrapper = mountSheet({ state: 'offline', pendingCount: 2, queueDurable: true })

    expect(text(wrapper, 'sync-detail-pending')).toBe('2 changes waiting to be sent')
    expect(text(wrapper, 'sync-detail-pending-durable')).toContain('saved on this device')
    expect(has(wrapper, 'sync-detail-pending-fragile')).toBe(false)
  })

  it('warns instead when the browser refused to keep the queue', () => {
    const wrapper = mountSheet({ state: 'offline', pendingCount: 2, queueDurable: false })

    expect(text(wrapper, 'sync-detail-pending-fragile')).toContain('could not save')
    expect(has(wrapper, 'sync-detail-pending-durable')).toBe(false)
  })

  it('makes no promise about a queue that does not exist', () => {
    const wrapper = mountSheet({ state: 'synced', pendingCount: 0, queueDurable: true })

    expect(has(wrapper, 'sync-detail-pending-durable')).toBe(false)
    expect(has(wrapper, 'sync-detail-pending-fragile')).toBe(false)
  })

  it('names the changes the server refused, and says they left the queue', () => {
    const wrapper = mountSheet({ state: 'synced', parkedCount: 1, canOpenConflicts: true })

    expect(text(wrapper, 'sync-detail-parked')).toBe('The server rejected 1 change')
    expect(text(wrapper, 'sync-detail-parked-hint')).toContain('will not be tried again')
  })

  it('stays quiet when the server has refused nothing', () => {
    expect(has(mountSheet({ state: 'synced', parkedCount: 0 }), 'sync-detail-parked')).toBe(false)
  })

  it('never tells the Local Mode half about a queue it cannot have', () => {
    const wrapper = mountSheet({ mode: 'local', state: 'local', pendingCount: 4, parkedCount: 2 })

    expect(has(wrapper, 'sync-detail-pending')).toBe(false)
    expect(has(wrapper, 'sync-detail-pending-durable')).toBe(false)
    expect(has(wrapper, 'sync-detail-parked')).toBe(false)
    // The positive companion: this really is the Local Mode half.
    expect(has(wrapper, 'sync-detail-storage')).toBe(true)
  })
})
