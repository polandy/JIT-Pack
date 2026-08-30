/**
 * FR-25.15 — the indicator's seam, pinned across every surface that carries
 * it rather than on one of them.
 *
 * `SaveIndicator` is mounted by four sheets (M5, M8, M10, M11), and until
 * 2026-08-30 all four passed it `syncStatus.state` — G-2's own state, the
 * one thing the requirement says it must never be. A behavioural case on M5
 * proves M5; it says nothing about the other three, and the defect was
 * precisely that the same wrong line had been copied into each.
 *
 * So the rule is asserted where it actually lives: at the call sites. A
 * fifth sheet added later is covered by construction, which a fourth
 * hand-written mount case would not be.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = new URL('../../../', import.meta.url).pathname

/** Every file under `client/src`, so a new call site cannot hide from this. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(vue|ts)$/.test(entry.name) ? [full] : []
  })
}

const files = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

const callSites = files.filter(
  (f) => f.text.includes('<SaveIndicator') && !f.path.includes('__tests__'),
)

describe('SaveIndicator wiring (FR-25.15)', () => {
  it('is mounted by the sheets that edit, and this test can see all of them', () => {
    // A guard on the guard: if the scan silently matched nothing, every
    // assertion below would pass while checking no file at all.
    expect(callSites.length).toBeGreaterThanOrEqual(4)
  })

  it('is never handed the G-2 sync state — that is the merge the FR forbids', () => {
    const offenders = callSites
      .filter((f) => /<SaveIndicator[^>]*syncStatus/s.test(f.text))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('takes the capture signal at every call site', () => {
    const wrong = callSites
      .filter((f) => !/<SaveIndicator[^>]*:pending="orchestrator\.capturePending/s.test(f.text))
      .map((f) => f.path)
    expect(wrong).toEqual([])
  })

  it('keeps `SyncState` out of the component itself, which is what coupled them', () => {
    const indicator = files.find((f) => f.path.endsWith('global/SaveIndicator.vue'))
    expect(indicator).toBeDefined()
    expect(indicator!.text).not.toContain('SyncState')
  })
})
