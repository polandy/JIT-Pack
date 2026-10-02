// The CI `e2e` job's legs (ADR-091). `node --test scripts/`.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAIN_LEGS, PR_CHROMIUM_LEGS, WEBKIT_PR_GREP, e2eMatrix } from './e2e-matrix.mjs'

const legs = (event, module = '') => e2eMatrix(event, module).include

test('a pull request shards Chromium and runs WebKit on its engine-telling cases alone', () => {
  const got = legs('pull_request')
  const chromium = got.filter((l) => l.projects === 'chromium')
  assert.equal(chromium.length, PR_CHROMIUM_LEGS)
  assert.ok(chromium.every((l) => l.of === PR_CHROMIUM_LEGS && l.grep === ''))
  assert.deepEqual(
    got.filter((l) => l.projects.includes('webkit')),
    [{ id: 'webkit-subset', projects: 'webkit', shard: 1, of: 1, grep: WEBKIT_PR_GREP }],
  )
})

test('a push to main runs every case in both engines, each sharded on its own axis', () => {
  for (const project of ['chromium', 'webkit']) {
    const own = legs('push').filter((l) => l.projects === project)
    assert.deepEqual(
      own.map((l) => l.shard),
      Array.from({ length: MAIN_LEGS[project] }, (_, i) => i + 1),
    )
    assert.ok(own.every((l) => l.of === MAIN_LEGS[project] && l.grep === ''))
  }
  assert.equal(legs('push').length, MAIN_LEGS.chromium + MAIN_LEGS.webkit)
})

test('a module-only pull request keeps one leg over both engines (ADR-079)', () => {
  assert.deepEqual(legs('pull_request', 'planner'), [
    { id: 'planner', projects: 'chromium webkit', shard: 1, of: 1, grep: '@planner|@smoke' },
  ])
})

test('a module answer outside a pull request is ignored: main is always the full run', () => {
  assert.deepEqual(legs('push', 'planner'), legs('push'))
})

test('every leg names a project, so the visual baselines never ride along', () => {
  for (const event of ['pull_request', 'push']) {
    for (const leg of legs(event)) {
      assert.ok(leg.projects.split(' ').every((p) => p === 'chromium' || p === 'webkit'), leg.id)
    }
  }
})

test('leg ids are unique, since each names an uploaded report', () => {
  for (const event of ['pull_request', 'push']) {
    const ids = legs(event).map((l) => l.id)
    assert.equal(new Set(ids).size, ids.length)
  }
})
