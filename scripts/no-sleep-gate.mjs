#!/usr/bin/env node
// Refuses a wall-clock wait in a test: `time.Sleep` in a Go `_test.go`
// file, `page.waitForTimeout` in a Playwright spec. Both are written
// rules already (CLAUDE.md §Testing, and the working agreement's third
// e2e rule); neither had a check, and the repository reached zero of
// them only by one review noticing a three-second poll loop.
//
// A sleeping test is not merely slow. It passes for a reason nothing
// states, and it goes on passing after the behaviour under it is gone —
// the failure it reports later is a flake naming no cause.
//
// **What this does not see**, so that nobody reads a green run as more
// than it is: a negative asserted against a short read deadline (a
// socket that "stays quiet" for 200 ms), `vi.waitFor`, and `setTimeout`
// inside a spec. Those are the same mistake in a spelling this gate
// cannot tell from a legitimate use, and they are still to be worked
// through — the standing list is the 2026-08-22 review's finding 22.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// `make ci` runs this from the repository root, the CI client job from
// `client/` — the sibling gates settle that with this line.
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')

/** Each rule names the trees it reads, which files count, and the wait it forbids. */
const RULES = [
  {
    what: 'time.Sleep',
    trees: ['internal', 'cmd'],
    counts: (name) => name.endsWith('_test.go'),
    pattern: /\btime\.Sleep\s*\(/,
  },
  {
    what: 'waitForTimeout',
    trees: ['client/e2e'],
    counts: (name) => name.endsWith('.ts'),
    pattern: /\.waitForTimeout\s*\(/,
  },
]

/** Every file under dir, depth-first; a missing tree contributes nothing. */
function walk(dir) {
  let out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(walk(full))
    else out.push(full)
  }
  return out
}

const offences = []
for (const rule of RULES) {
  for (const tree of rule.trees) {
    for (const file of walk(join(root, tree))) {
      if (!rule.counts(file)) continue
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (rule.pattern.test(line)) {
          offences.push(`${file.slice(root.length + 1)}:${i + 1}: ${rule.what} — ${line.trim()}`)
        }
      })
    }
  }
}

if (offences.length > 0) {
  console.error('A test may not wait on the wall clock:\n')
  for (const o of offences) console.error(`  ${o}`)
  console.error(
    '\nGive the production code a signal to wait on instead — a completion\n' +
      'channel, a settled state, an injected clock. If nothing observable\n' +
      'exists to wait for, that absence is the defect.',
  )
  process.exit(1)
}

console.log(`no-sleep gate: clean (${RULES.map((r) => r.what).join(', ')})`)
