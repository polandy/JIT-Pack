/**
 * The activity log's readers, as `App.vue` binds them (FR-32.2, ADR-066):
 * every table is read by exactly one side — the kernel or the module that
 * owns it — so a new module table without a reader fails here rather than
 * reading as „trip" in the log.
 */
import { describe, expect, it } from 'vitest'

import { KERNEL_ACTIVITY_AREAS } from '@/domain/activity'
import { mealActivityReaders } from '@/meals'
import { plannerActivityReaders } from '@/planner'
import { shoppingActivityReaders } from '@/shopping'
import { FEATURE_STORE_TABLES } from '@/sync/routing'
import { TABLE } from '@/types/tables'

const moduleReaders = [shoppingActivityReaders, plannerActivityReaders, mealActivityReaders]

describe('activity readers wiring (FR-32.2)', () => {
  it('gives every module table a reader, and no table two', () => {
    const read = moduleReaders.flatMap((r) => Object.keys(r))
    expect(new Set(read).size).toBe(read.length)
    expect(new Set(read)).toEqual(FEATURE_STORE_TABLES)
  })

  it('leaves the kernel naming exactly the tables no module owns', () => {
    const kernel = new Set(Object.keys(KERNEL_ACTIVITY_AREAS))
    const owned = Object.values(TABLE).filter((t) => !FEATURE_STORE_TABLES.has(t))
    expect(kernel).toEqual(new Set(owned))
  })
})
