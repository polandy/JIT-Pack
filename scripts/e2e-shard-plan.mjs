#!/usr/bin/env node
/**
 * Pack the e2e spec files into the CI matrix's legs by **measured duration**.
 *
 * Playwright's own `--shard=i/N` splits the test list by *count*, which is only
 * a proxy for time: on the run this script was written for, two legs of 93 and
 * 94 tests took 4.4 and 7.9 minutes. The pipeline waits for the slowest leg, so
 * that spread is latency nobody gets back.
 *
 * Packing by file alone would be **worse**, and the measurement says so: one
 * spec file (`packing-list.spec.ts`, 960 s of 6393) is heavier than a balanced
 * leg, and a file cannot be halved by naming it. So a file over the target gets
 * `k` legs of its own, each running that file under `--shard=i/k` — which is
 * `--shard` doing the one thing it is good at, splitting *within* a known set,
 * rather than deciding the whole partition by count.
 *
 * Input is a Playwright JSON report (`--reporter=json`) from any run covering
 * the default projects; absolute times do not matter, only their ratio — the
 * report may come from a laptop with eight workers while CI runs two.
 *
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=e2e-durations.json scripts/e2e.sh --reporter=json
 *   node scripts/e2e-shard-plan.mjs client/e2e-durations.json 10
 *
 * Output is the `include:` block for `.github/workflows/ci.yml`, with the
 * measurement in the comment above it, so the next reader can see how stale it
 * is without running anything.
 */
import { readFileSync } from 'node:fs'

/**
 * The legs are responsible for the behaviour projects only: the baselines are
 * the `visual` job's (ADR-013) and the two backend-backed directories have jobs
 * of their own. Mirrors `client/playwright.config.ts`, and the gate beside this
 * script applies the same rule from the other side.
 */
const NOT_A_LEGS_JOB = (file) =>
  file === 'visual.spec.ts' || file.startsWith('single/') || /(^|\/)server\//.test(file)

/** Every spec file in the report, with the milliseconds it cost across all projects. */
export function durationsByFile(report) {
  const totals = new Map()
  const walk = (suite, file) => {
    const own = suite.file ?? file
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          totals.set(own, (totals.get(own) ?? 0) + (result.duration ?? 0))
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, own)
  }
  for (const suite of report.suites ?? []) walk(suite, suite.file)
  for (const file of [...totals.keys()]) if (NOT_A_LEGS_JOB(file)) totals.delete(file)
  return totals
}

/**
 * Pack `totals` into `legs` legs: a file heavier than one leg's share takes
 * `k` legs under `--shard=i/k`, the rest are placed longest-first into the
 * leg that is currently shortest.
 */
export function packLegs(totals, legs) {
  const total = [...totals.values()].reduce((sum, ms) => sum + ms, 0)
  const target = total / legs

  const split = []
  const rest = []
  for (const [file, ms] of totals) {
    if (ms > target) split.push([file, ms, Math.ceil(ms / target)])
    else rest.push([file, ms])
  }

  const out = []
  for (const [file, ms, k] of split.sort((a, b) => b[1] - a[1])) {
    for (let i = 1; i <= k; i++) out.push({ args: `${file} --shard=${i}/${k}`, ms: ms / k })
  }
  if (out.length >= legs) {
    throw new Error(
      `the split files already need ${out.length} of ${legs} legs — raise the leg count`,
    )
  }

  const bins = Array.from({ length: legs - out.length }, () => ({ specs: [], ms: 0 }))
  for (const [file, ms] of rest.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const bin = bins.reduce((min, b) => (b.ms < min.ms ? b : min), bins[0])
    bin.specs.push(file)
    bin.ms += ms
  }
  for (const bin of bins) out.push({ args: bin.specs.join(' '), ms: bin.ms })
  return out.sort((a, b) => b.ms - a.ms)
}

function main() {
  const [reportPath, legArg] = process.argv.slice(2)
  if (!reportPath) {
    console.error('usage: e2e-shard-plan.mjs <playwright-report.json> [legs]')
    process.exit(2)
  }
  const legs = Number(legArg ?? 10)
  const totals = durationsByFile(JSON.parse(readFileSync(reportPath, 'utf8')))
  const packed = packLegs(totals, legs)

  const seconds = (ms) => (ms / 1000).toFixed(0)
  const total = [...totals.values()].reduce((a, b) => a + b, 0)

  console.log(`      # Packed ${new Date().toISOString().slice(0, 10)}: ${seconds(total)} test-seconds over`)
  console.log(`      # ${totals.size} spec files, ${legs} legs of ${seconds(packed.at(-1).ms)}–${seconds(packed[0].ms)} s each.`)
  console.log('      matrix:')
  console.log('        include:')
  packed.forEach((leg, i) => {
    console.log(`          - leg: ${i + 1} # ~${seconds(leg.ms)} s`)
    console.log(`            args: ${leg.args}`)
  })
}

if (import.meta.url === `file://${process.argv[1]}`) main()
