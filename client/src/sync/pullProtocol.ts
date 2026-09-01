/**
 * The two rules a paged pull follows, named once (Sync-API §4).
 *
 * They have two callers — the app's `SyncOutbox.drain` and the CLI's
 * `usePull` (invariant 4: the command line runs the client's own rules, so it
 * runs these) — and until 2026-09-01 each carried its own copy. The copies had
 * already drifted: the progress guard below was the drain's alone, so the
 * command line could spin for ever, and the observe step was asserted only on
 * the CLI's copy while the app's ran untested.
 */

import type { PullChange } from '@/api/types'
import { observeRemote, type HLCGenerator } from '@/sync/hlc'

/** What the paging rule needs off a pull response — nothing more. */
export interface PullPage {
  next_cursor: number
  has_more: boolean
}

/**
 * Whether a paged pull asks for another page after `page`, which was asked
 * for from `askedFrom`.
 *
 * `has_more` is a client obligation rather than a hint: a partition is
 * routinely larger than one page, and a client that takes the first and stops
 * holds a fraction of the instance while believing itself synced. Progress is
 * the second condition, not the claim — a server that says there is more and
 * does not move the cursor would otherwise spin the loop for ever, which is a
 * hung tab on the boot path or a command line that never returns.
 */
export function hasFurtherPage(page: PullPage, askedFrom: number): boolean {
  return page.has_more && page.next_cursor > askedFrom
}

/**
 * Advances the device's clock to every clock it just met (Sync-API §3).
 *
 * A pull snapshot is the only place a device sees the HLC of a write it did
 * not make, so this is what keeps a device whose wall clock lags from minting
 * HLCs older than writes it has already seen — and losing its own later edits
 * to them. Tolerant on purpose: the server stores an HLC verbatim and never
 * checks it, so one unusable value must cost its own row and not the page it
 * arrived in (see `observeRemote`).
 */
export function observePulledClocks(hlc: HLCGenerator, changes: readonly PullChange[]): void {
  for (const change of changes) {
    if (change.row && typeof change.row['updated_hlc'] === 'string') {
      observeRemote(hlc, change.row['updated_hlc'])
    }
  }
}
