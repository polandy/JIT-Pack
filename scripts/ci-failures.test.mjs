// What a red run's digest keeps and drops. `node --test scripts/`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { digest, parse } from './ci-failures.mjs'

/** One line as `gh run view --log-failed` prints it: job, step, timestamped text. */
const logLine = (job, text) => `${job}\tRun e2e\t2026-09-29T23:16:31.9950034Z ${text}`

const FAILURE = [
  '  1) [webkit] › e2e/shopping/shopping.spec.ts:523:3 › E2E-M6-35: a due day is set',
  '    Error: expect(locator).toHaveText(expected) failed',
  '    Expected: "Tomorrow"',
  '    Received: "Today"',
  '    > 556 |     await expect(pill).toHaveText(\'Tomorrow\')',
  '        at /w/client/e2e/shopping/shopping.spec.ts:556:24',
]

test('parse groups lines by job and strips the timestamp and the colour codes', () => {
  const raw = [logLine('e2e (4)', '\x1b[31mred\x1b[0m'), logLine('go', '--- FAIL: TestX')].join('\n')
  const jobs = parse(raw)
  assert.deepEqual([...jobs.keys()], ['e2e (4)', 'go'])
  assert.deepEqual(jobs.get('e2e (4)'), ['red'])
  assert.deepEqual(jobs.get('go'), ['--- FAIL: TestX'])
})

test('parse strips the caret-notation colour codes gh prints for an echoed script', () => {
  const jobs = parse(logLine('e2e (4)', '^[[36;1mscripts/e2e.sh --shard="$SHARD"^[[0m'))
  assert.deepEqual(jobs.get('e2e (4)'), ['scripts/e2e.sh --shard="$SHARD"'])
})

test('digest keeps the assertion, its source line and the verdict', () => {
  const kept = digest([...FAILURE, '', '  1 failed', '  109 passed (10.5m)'])
  for (const line of FAILURE) assert.ok(kept.includes(line), `kept: ${line}`)
  assert.ok(kept.includes('  1 failed'))
})

test('digest drops image pulls, attachment banners, trace hints and the exit notice', () => {
  const noise = [
    '0926a8eb0e60: Pulling fs layer',
    '0926a8eb0e60: Pull complete',
    'Digest: sha256:eff16c30',
    "Unable to find image 'mcr.microsoft.com/playwright@sha256:eff1' locally",
    '##[group]Run if [ -n "$MODULE" ]; then',
    '    attachment #1: screenshot (image/png) ─────────',
    '    test-results/shopping-f6f04-chromium/test-failed-1.png',
    '        npx playwright show-trace test-results/x/trace.zip',
    '    ─────────────────────────',
    '    Error Context: test-results/x/error-context.md',
    '[WebServer] Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.',
    '··············F',
    '##[error]Process completed with exit code 1.',
    '  SHARD: 4/10',
    '  MODULE:',
  ]
  assert.deepEqual(digest(noise), [])
})

test('digest prints a failure Playwright reports twice only once', () => {
  const kept = digest([...FAILURE, '', ...FAILURE])
  assert.equal(kept.filter((l) => l === FAILURE[1]).length, 1)
})

test('digest keeps a short line that repeats, such as a source excerpt\'s bare gutter', () => {
  const kept = digest(['    554 |', 'x'.repeat(30), '    554 |'])
  assert.equal(kept.filter((l) => l === '    554 |').length, 2)
})

test('digest keeps the text of an ##[error] line, not the marker', () => {
  assert.deepEqual(digest(['##[error]  1) [chromium] › e2e/a.spec.ts:1:1 › a case']), [
    '  1) [chromium] › e2e/a.spec.ts:1:1 › a case',
  ])
})
