// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

import { MODE_KEY } from '@/mode'
import { routes } from '@/router'
import { PATH, tripPath } from '@/router/paths'
import { serverOnly } from '@/router/serverOnly'

/**
 * G-8, M30 (UX-21): Local Mode keeps no activity log, and M4's and M9's ⋮
 * offer none. A typed URL must not reach the screen either — it would explain
 * itself with a server the device does not have.
 */

function record(name: string): RouteRecordRaw {
  const found = routes.find((r) => r.name === name)
  if (!found) throw new Error(`no route ${name}`)
  return found
}

function enter(name: string, params: Record<string, string> = {}) {
  const r = record(name)
  const to = { name, params, query: {}, meta: r.meta ?? {} } as unknown as RouteLocationNormalized
  const guard = r.beforeEnter
  if (typeof guard !== 'function') throw new Error(`${name} has no single beforeEnter`)
  return guard.call(undefined, to, to, () => {})
}

afterEach(() => localStorage.clear())

describe('serverOnly (G-8)', () => {
  it('sends a trip activity URL back to its packing list in Local Mode', () => {
    localStorage.setItem(MODE_KEY, 'local')
    expect(enter('trip-activity', { tripId: 't1' })).toBe(tripPath('t1'))
  })

  it('sends the inventory activity URL back to the inventory in Local Mode', () => {
    localStorage.setItem(MODE_KEY, 'local')
    expect(enter('inventory-activity')).toBe(PATH.items)
  })

  it('lets both through in Server Mode, where the log exists', () => {
    localStorage.setItem(MODE_KEY, 'server')
    expect(enter('trip-activity', { tripId: 't1' })).toBe(true)
    expect(enter('inventory-activity')).toBe(true)
  })

  it('is the guard both activity routes carry', () => {
    expect(record('trip-activity').beforeEnter).toBe(serverOnly)
    expect(record('inventory-activity').beforeEnter).toBe(serverOnly)
  })
})
