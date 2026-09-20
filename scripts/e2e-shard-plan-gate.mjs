#!/usr/bin/env node
/**
 * The CI matrix names its spec files, so a spec file that nobody named runs
 * **nowhere** — and a suite that quietly stops running a file reports the same
 * green as one that runs it. This gate is what makes that impossible: every
 * spec the default projects would pick up appears in the plan exactly once,
 * and every path in the plan exists.
 *
 * It is the price of packing the legs by duration instead of by Playwright's
 * `--shard` (which needs no list, and can therefore lose nothing). Paying it
 * here, once, in a node-only check inside `make ci`, is cheaper than the way
 * this failure would otherwise be found.
 *
 * The scope mirrors `client/playwright.config.ts`: the behaviour projects
 * ignore the baselines and the two backend-backed directories, which have jobs
 * of their own.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const E2E_DIR = 'client/e2e'
const WORKFLOW = '.github/workflows/ci.yml'

/** The spec files the sharded legs are responsible for, as the config sees them. */
function specsOnDisk(dir = E2E_DIR) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Their own jobs (`e2e-single`, `e2e-server`), never a leg's.
      if (entry.name === 'single' || entry.name === 'server') continue
      out.push(...specsOnDisk(path))
      continue
    }
    if (!entry.name.endsWith('.spec.ts')) continue
    // The baselines are the `visual` job's (ADR-013).
    if (entry.name === 'visual.spec.ts') continue
    out.push(relative(E2E_DIR, path))
  }
  return out.sort()
}

/**
 * Every leg's argument list, as {file, shard} pairs. A leg is spec files and,
 * for a file too heavy for one leg, a `--shard=i/k` that applies to it.
 */
function legsInPlan() {
  const yaml = readFileSync(WORKFLOW, 'utf8')
  return yaml
    .split('\n')
    .filter((line) => /^\s*args:\s+\S/.test(line))
    .map((line) => {
      const tokens = line.replace(/^\s*args:\s+/, '').trim().split(/\s+/)
      const shard = tokens.find((token) => token.startsWith('--shard='))
      return { files: tokens.filter((token) => !token.startsWith('-')), shard }
    })
}

function main() {
  const onDisk = specsOnDisk()
  const legs = legsInPlan()

  if (legs.length === 0) {
    fail(['the e2e matrix names no spec files — has the `args:` key been renamed?'])
  }

  const problems = []
  // A leg carrying `--shard=i/k` may only carry the one file it splits:
  // the flag applies to everything the leg runs, so a second file would be
  // quartered along with it and its other parts would run nowhere.
  const covered = new Map()
  for (const { files, shard } of legs) {
    if (shard && files.length !== 1) {
      problems.push(`a leg mixes --shard with ${files.length} files: ${files.join(' ')}`)
    }
    for (const file of files) {
      const parts = covered.get(file) ?? []
      parts.push(shard ?? null)
      covered.set(file, parts)
    }
  }

  for (const spec of onDisk) {
    if (!covered.has(spec)) problems.push(`in no leg, so it runs nowhere: ${spec}`)
  }
  for (const [spec, parts] of covered) {
    if (!onDisk.includes(spec)) {
      problems.push(`named by a leg but not on disk: ${spec}`)
      continue
    }
    if (parts.length === 1 && parts[0] === null) continue
    // Split across legs: exactly the k parts of one k, each exactly once.
    const totals = new Set(parts.map((part) => part?.split('/')[1]))
    const indices = parts.map((part) => part?.split('=')[1]?.split('/')[0]).sort()
    const k = parts.length
    const wanted = Array.from({ length: k }, (_, i) => String(i + 1))
    if (parts.some((part) => part === null) || totals.size !== 1 || ![...totals][0]) {
      problems.push(`named by ${k} legs without one --shard=i/${k} each: ${spec}`)
    } else if ([...totals][0] !== String(k) || String(indices) !== String(wanted)) {
      problems.push(`split into ${[...totals][0]} parts but run by ${k} legs: ${spec}`)
    }
  }

  if (problems.length > 0) fail(problems)
  console.log(
    `e2e-shard-plan-gate: ok — ${onDisk.length} spec files, each run by exactly one leg or split whole across several`,
  )
}

function fail(problems) {
  console.error(`e2e-shard-plan-gate: ${problems.length} problem(s) with the e2e matrix.\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(
    '\nRe-pack the legs from a measured run and paste the block into ci.yml:\n' +
      '  PLAYWRIGHT_JSON_OUTPUT_NAME=e2e-durations.json scripts/e2e.sh --reporter=json\n' +
      '  node scripts/e2e-shard-plan.mjs client/e2e-durations.json 10',
  )
  process.exit(1)
}

main()
