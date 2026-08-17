/**
 * NFR-4.11 — what the G-2 storage detail (FR-19.6) is allowed to claim.
 *
 * The honest-absence cases are the point: a browser without the Storage API
 * must produce "unknown", never a reassuring zero, because the whole reason
 * this screen exists is that Local Mode has no second copy anywhere.
 */
import { describe, it, expect } from 'vitest'

import { evictionRisk, readStorageStatus, usedShare } from '@/local/storageStatus'

function storageApi(estimate: StorageEstimate, persisted: boolean): StorageManager {
  return {
    estimate: () => Promise.resolve(estimate),
    persisted: () => Promise.resolve(persisted),
    persist: () => Promise.resolve(persisted),
  } as StorageManager
}

describe('readStorageStatus (NFR-4.11)', () => {
  it('reports usage, quota and the eviction promise', async () => {
    const status = await readStorageStatus(
      storageApi({ usage: 12 * 1024 * 1024, quota: 980 * 1024 * 1024 }, true),
    )

    expect(status).toEqual({
      available: true,
      usedBytes: 12 * 1024 * 1024,
      quotaBytes: 980 * 1024 * 1024,
      persistent: true,
    })
  })

  it('says nothing rather than zero when the browser has no Storage API', async () => {
    const status = await readStorageStatus(undefined)

    expect(status.available).toBe(false)
    // A missing API must not read as "persistent storage granted".
    expect(status.persistent).toBe(false)
  })

  it('treats a failing estimate as unavailable, not as an empty device', async () => {
    const broken = {
      estimate: () => Promise.reject(new Error('denied')),
      persisted: () => Promise.resolve(true),
    } as unknown as StorageManager

    expect(await readStorageStatus(broken)).toMatchObject({ available: false, usedBytes: 0 })
  })

  it('accepts a browser that estimates but cannot answer about persistence', async () => {
    const partial = {
      estimate: () => Promise.resolve({ usage: 5, quota: 10 }),
    } as unknown as StorageManager

    const status = await readStorageStatus(partial)

    expect(status).toMatchObject({ available: true, usedBytes: 5, persistent: false })
  })
})

describe('usedShare / evictionRisk (NFR-4.11)', () => {
  const status = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over })
  function base() {
    return { available: true, usedBytes: 25, quotaBytes: 100, persistent: false }
  }

  it('is the share of the quota in use', () => {
    expect(usedShare(status())).toBe(0.25)
  })

  it('is unknown without a quota — a division by zero is not 100 % full', () => {
    expect(usedShare(status({ quotaBytes: 0 }))).toBeNull()
    expect(usedShare(status({ available: false }))).toBeNull()
  })

  it('warns exactly while the browser has not promised to keep the data', () => {
    expect(evictionRisk(status({ persistent: false }))).toBe(true)
    expect(evictionRisk(status({ persistent: true }))).toBe(false)
  })

  it('does not warn about a browser it could not ask — an unknown is not a risk claim', () => {
    expect(evictionRisk(status({ available: false }))).toBe(false)
  })
})
