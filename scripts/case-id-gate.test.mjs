// The spec → title and traceability → title links held by case-id-gate. `node --test scripts/`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { carried, parseEntries, traceIds, uncarriedSpecIds, uncarriedTraceIds } from './case-id-links.mjs'

const spec = (...bullets) => bullets.join('\n')
const titled = (...ids) => new Set(ids)

test('a live entry whose id a test title names is carried', () => {
  const entries = parseEntries(spec('* **E2E-M1-01** `local` — the card.'))
  assert.deepEqual(uncarriedSpecIds(entries, titled('E2E-M1-01')), [])
})

test('a live entry with no title, no file and no carrying case is refused', () => {
  const entries = parseEntries(spec('* **E2E-M3-02** `all` (FR-13.1): series picker.'))
  assert.deepEqual(uncarriedSpecIds(entries, titled()), ['E2E-M3-02'])
})

test('an entry naming a spec file as its carrier is carried, also on a continuation line', () => {
  const entries = parseEntries(
    spec('* **E2E-M4-10** `server` — **implemented**', '  (`e2e/server/multi-user.spec.ts`): a row.', '* **E2E-M4-11** x'),
  )
  assert.deepEqual(uncarriedSpecIds(entries, titled()), ['E2E-M4-11'])
})

test('an entry naming a carrying case is carried; one naming an uncarried case is not', () => {
  const entries = parseEntries(
    spec(
      '* **E2E-M2-09** — covered by E2E-G9-12, which reaches M18.',
      '* **E2E-M2-10** — covered by E2E-M2-11.',
      '* **E2E-M2-11** — covered by E2E-M2-10.',
    ),
  )
  assert.deepEqual(uncarriedSpecIds(entries, titled('E2E-G9-12')), ['E2E-M2-10', 'E2E-M2-11'])
})

test('a struck entry is retired, not uncarried', () => {
  const entries = parseEntries(spec('* **E2E-M4-05** ~~`all`: swipe right.~~ **Retired**.'))
  assert.deepEqual(uncarriedSpecIds(entries, titled()), [])
})

test('a heading naming two ids defines both, each needing its carrier', () => {
  const entries = parseEntries(spec('* **E2E-M17-07/07b** — the case and its sibling.'))
  assert.deepEqual(uncarriedSpecIds(entries, titled('E2E-M17-07')), ['E2E-M17-07b'])
})

test('an id with no entry at all is not carried', () => {
  assert.equal(carried('E2E-M9-99', new Map(), titled()), false)
})

test('traceability ids come from the E2E rows only, expand a slash, and skip struck mentions', () => {
  const trace = [
    '| FR-1.1 | E2E | M9-01 (list), M6-01/04, ~~M1-06~~ is not this row\'s |',
    '| FR-1.3 | DOC/N-A | retired — M8-01 covers the stepper |',
    '| FR-5.3 | E2E+UNIT | G3-01, FLOW-01; `domain/__tests__/x.spec.ts` |',
  ].join('\n')
  assert.deepEqual(traceIds(trace), ['E2E-M9-01', 'E2E-M6-01', 'E2E-M6-04', 'E2E-G3-01', 'E2E-FLOW-01'])
})

test('a traceability id no title or entry backs is refused; a titled or carried one passes', () => {
  const entries = parseEntries(spec('* **E2E-M6-02** — `shopping/shopping.spec.ts`.'))
  const trace = '| FR-3.2 | E2E | M6-01, M6-02, M6-03 |'
  assert.deepEqual(uncarriedTraceIds(trace, entries, titled('E2E-M6-01')), ['E2E-M6-03'])
})

test('a bullet struck before its bold id is retired, and a heading with trailing words still defines its id', () => {
  const entries = parseEntries(
    spec('* ~~**E2E-M5-01** `all`: sections.~~ — retired.', '* **E2E-FLOW-03 Purchase transition** `local`: the journey.'),
  )
  assert.deepEqual(uncarriedSpecIds(entries, titled()), ['E2E-FLOW-03'])
})

test('a table row defines its id; a struck row is retired', () => {
  const entries = parseEntries(spec('| E2E-G11-01 | G-11 Theming | all | text |', '| ~~E2E-M4-35~~ | ~~x~~ | all | Reversed. |'))
  assert.deepEqual(uncarriedSpecIds(entries, titled()), ['E2E-G11-01'])
})

test('a live entry wins over a later struck entry of the same id, in either order', () => {
  const live = '* **E2E-M5-07** `all` (FR-25.15) — **implemented.**'
  const tomb = '* ~~**E2E-M5-07 (v1.0 catalogue, shadowed)** `server`: delegate.~~'
  for (const text of [spec(live, tomb), spec(tomb, live)]) {
    const entries = parseEntries(text)
    assert.equal(entries.get('E2E-M5-07').struck, false)
    assert.deepEqual(uncarriedSpecIds(entries, titled()), ['E2E-M5-07'])
  }
})

test('a retired case does not carry a traceability id, and a titled one still does', () => {
  const entries = parseEntries(spec('* **E2E-M4-05** ~~`all`: swipe right.~~ **Retired**.'))
  const trace = '| FR-5.2 | E2E | M4-05 |'
  assert.deepEqual(uncarriedTraceIds(trace, entries, titled()), ['E2E-M4-05'])
  assert.deepEqual(uncarriedTraceIds(trace, entries, titled('E2E-M4-05')), [])
})

test('a retired case named by a live case is not a carrier', () => {
  const entries = parseEntries(spec('* **E2E-M2-09** — covered by E2E-M4-05.', '* ~~**E2E-M4-05**~~ retired.'))
  assert.deepEqual(uncarriedSpecIds(entries, titled()), ['E2E-M2-09'])
})

test('PWA and NFR-SEC ids are read from traceability rows and from titles', () => {
  const trace = ['| FR-19.7 | E2E | PWA-05, PWA-05b |', '| NFR-4.2a | E2E+UNIT | E2E-NFR-SEC-01…04 |'].join('\n')
  assert.deepEqual(traceIds(trace), ['E2E-PWA-05', 'E2E-PWA-05b', 'E2E-NFR-SEC-01'])
  const entries = parseEntries(spec('* **E2E-NFR-SEC-01** `local` (NFR-4.2a): ids.'))
  assert.deepEqual(uncarriedSpecIds(entries, titled()), ['E2E-NFR-SEC-01'])
})
