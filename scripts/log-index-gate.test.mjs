// The ADR status vocabulary held by log-index-gate (ARCH-32). `node --test scripts/`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkAdrs } from './log-index-gate.mjs'

const adr = (name, status) => ({ name, text: `# ${name.slice(0, 7)}: A decision\n\n${status}\n**Related:** —\n` })
const row = (name, status) => `| [${name.slice(4, 7)}](${name}) | A decision | ${status} |`
const readmeOf = (...rows) => `# Architecture Decision Records\n\n| # | Decision | Status |\n|---|---|---|\n${rows.join('\n')}\n`

const A = 'ADR-001_First.md'
const B = 'ADR-002_Second.md'

test('an accepted ADR and one superseded by it, both indexed with their status, pass', () => {
  const files = [adr(A, '**Status:** Superseded by ADR-002'), adr(B, '**Status:** Accepted')]
  const readme = readmeOf(row(A, 'Superseded by ADR-002'), row(B, 'Accepted'))
  assert.deepEqual(checkAdrs(files, readme), [])
})

test('a status carrying a date or a note is refused — the history is in git, not in the ADR', () => {
  for (const status of [
    '**Status:** Accepted (2026-08-19)',
    '**Status:** Accepted — amended 2026-10-03',
    '**Status:** Amended by ADR-002',
    '**Status:** Proposed',
  ]) {
    const errors = checkAdrs([adr(A, status), adr(B, '**Status:** Accepted')], readmeOf(row(A, 'Accepted'), row(B, 'Accepted')))
    assert.equal(errors.length, 1, status)
    assert.match(errors[0], /ADR-001_First\.md.*status/i)
  }
})

test('an ADR without a status line is refused', () => {
  const errors = checkAdrs([adr(A, '')], readmeOf(row(A, 'Accepted')))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /no "\*\*Status:\*\*" line/)
})

test('a successor that does not exist, or the ADR itself, is refused', () => {
  for (const target of ['ADR-009', 'ADR-001']) {
    const errors = checkAdrs([adr(A, `**Status:** Superseded by ${target}`)], readmeOf(row(A, `Superseded by ${target}`)))
    assert.equal(errors.length, 1, target)
    assert.match(errors[0], new RegExp(`${target}`))
  }
})

test('two files with one number are refused, since "Superseded by" could not say which', () => {
  const twin = 'ADR-001_Twin.md'
  const files = [adr(A, '**Status:** Accepted'), adr(twin, '**Status:** Accepted')]
  const errors = checkAdrs(files, readmeOf(row(A, 'Accepted'), row(twin, 'Accepted')))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /ADR-001 is taken by two files/)
})

test('an ADR missing from the README index is refused', () => {
  const errors = checkAdrs([adr(A, '**Status:** Accepted'), adr(B, '**Status:** Accepted')], readmeOf(row(A, 'Accepted')))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /ADR-002_Second\.md has no row/)
})

test('an index row whose status differs from its file is refused', () => {
  const files = [adr(A, '**Status:** Superseded by ADR-002'), adr(B, '**Status:** Accepted')]
  const errors = checkAdrs(files, readmeOf(row(A, 'Accepted'), row(B, 'Accepted')))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /ADR-001_First\.md.*"Accepted".*"Superseded by ADR-002"/)
})

test('an amendment or addendum section in an ADR is refused — the decision is rewritten to what holds (ARCH-32c)', () => {
  for (const heading of [
    '## Amendment, 2026-10-08: the order gets its gate',
    '### Amendment 2 (FR-29.13)',
    '## Addendum — the bytes outside the envelope',
    '**Amendment (2026-09-30):** the pill is measured',
    '**Addendum:** the bytes',
  ]) {
    const file = adr(A, '**Status:** Accepted')
    file.text += `\n## Decision\n\nOption A.\n\n${heading}\n\nA later change.\n`
    const errors = checkAdrs([file], readmeOf(row(A, 'Accepted')))
    assert.equal(errors.length, 1, heading)
    assert.match(errors[0], /ADR-001_First\.md:\d+.*(Amendment|Addendum)/, heading)
  }
})

test('prose that speaks of amending is not a section and passes', () => {
  const file = adr(A, '**Status:** Accepted')
  file.text += '\n## Decision\n\nA later change amends the rule by rewriting this text; an addendum is not kept.\n'
  assert.deepEqual(checkAdrs([file], readmeOf(row(A, 'Accepted'))), [])
})
