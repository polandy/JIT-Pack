/**
 * On-device storage facts for the G-2 detail (FR-19.6, NFR-4.11).
 *
 * Local Mode keeps the only copy of the user's data in browser-managed
 * storage, which the browser may evict under pressure unless it has been
 * asked to persist it. This module reads that state and answers two
 * questions about it; the sheet decides how to say them.
 *
 * Everything the caller needs is passed in, so the decisions are pure and
 * the read has one injectable seam — a test never touches a real browser.
 */

export interface StorageStatus {
  /**
   * Whether the browser answered at all. False means *unknown*, not empty:
   * every field below is then a placeholder and must not be shown as fact.
   */
  available: boolean
  /** Bytes the origin currently uses, as estimated by the browser. */
  usedBytes: number
  /** Bytes the origin may use in total, 0 when the browser gives no figure. */
  quotaBytes: number
  /** The browser promised not to evict this origin automatically. */
  persistent: boolean
}

const UNKNOWN: StorageStatus = {
  available: false,
  usedBytes: 0,
  quotaBytes: 0,
  persistent: false,
}

/**
 * readStorageStatus asks the Storage API, defaulting to this browser's.
 *
 * An API that is missing or refuses to answer yields the unknown status
 * rather than an error: the storage detail is informational and must never
 * be the reason a sheet fails to open.
 */
export async function readStorageStatus(
  storage: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<StorageStatus> {
  if (!storage?.estimate) return UNKNOWN
  try {
    const { usage = 0, quota = 0 } = await storage.estimate()
    // Not every browser that estimates also implements persisted().
    const persistent = (await storage.persisted?.()) ?? false
    return { available: true, usedBytes: usage, quotaBytes: quota, persistent }
  } catch {
    return UNKNOWN
  }
}

/** usedShare is the fraction of the quota in use, or null when unknown. */
export function usedShare(status: StorageStatus): number | null {
  if (!status.available || status.quotaBytes <= 0) return null
  return status.usedBytes / status.quotaBytes
}

/**
 * evictionRisk is true while the browser may drop this origin's data.
 *
 * A browser that could not be asked is deliberately *not* a risk: NFR-4.11
 * wants a warning where one is warranted, and a warning that fires on every
 * unknown is one the user learns to ignore.
 */
export function evictionRisk(status: StorageStatus): boolean {
  return status.available && !status.persistent
}
