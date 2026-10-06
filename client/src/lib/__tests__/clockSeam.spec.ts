/**
 * The clock seam, held at every screen (`lib/clock.ts`, the orchestrator's
 * `now()` and `today()`).
 *
 * A screen that asks the real clock itself answers a different question from
 * the rule it feeds: M1 took FR-5.1's „today" as the UTC day while every rule
 * behind it reads the local one, so between midnight and two in the morning
 * the late packers belonged to yesterday. And a test that sets the
 * orchestrator's clock cannot reach a `new Date()` written into a view.
 *
 * So the rule is asserted where it is broken: at the call sites. A `.vue`
 * file asks the orchestrator what time it is; a timestamp it formats
 * (`new Date(row.at)`) is not a reading of the clock and stays allowed.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = new URL('../../', import.meta.url).pathname

/** Every `.vue` file under `client/src`, so a new screen cannot hide from this. */
function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(full)
    return entry.name.endsWith('.vue') ? [full] : []
  })
}

/** `new Date()` with nothing to convert, and `Date.now` called or handed on. */
const REAL_CLOCK = /new Date\(\s*\)|\bDate\.now\b/

const files = vueFiles(SRC).map((path) => ({
  where: relative(SRC, path),
  lines: readFileSync(path, 'utf8').split('\n'),
}))

describe('the clock seam in the screens', () => {
  it('scans the screens, so a pass is not a scan of nothing', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.where === 'views/dashboard/DashboardPage.vue')).toBe(true)
  })

  it('has no screen reading the real clock past the orchestrator', () => {
    const reads = files.flatMap((f) =>
      f.lines.flatMap((line, i) =>
        // A comment may name the call it warns against.
        REAL_CLOCK.test(line) && !/^\s*(\/?\*|\/\/)/.test(line)
          ? [`${f.where}:${i + 1}  ${line.trim()}`]
          : [],
      ),
    )
    expect(reads).toEqual([])
  })
})
