/**
 * The modules' contributions, folded as `App.vue` folds them (FR-32.2,
 * ADR-066 amendment 3): every table is read by exactly one side — the kernel
 * or the module that owns it — so a new module table without a reader fails
 * here rather than reading as „trip" in the log; and the fold itself, which
 * refuses a reader or a single answer given twice, holds over the real list.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { KERNEL_ACTIVITY_AREAS } from '@/domain/activity'
import { FEATURE_MODULES } from '@/featureModules'
import { kernelPorts, type KernelPortDeps } from '@/kernel/kernelPorts'
import { composeModules, type Composition } from '@/kernel/moduleContribution'
import { useTripStore } from '@/stores/tripStore'
import type { ModuleHost } from '@/sync/featureModule'
import { FEATURE_STORE_TABLES } from '@/sync/routing'
import { TABLE } from '@/api/tables'
import { installHarness } from './harness'

let composition: Composition

beforeEach(() => {
  installHarness()
  composition = composeModules(FEATURE_MODULES, {
    // Contributing builds the modules' actions over the host; nothing here writes.
    module: {} as ModuleHost,
    today: () => '2026-07-08',
    // The kernel's real contribution, so a module answering what the kernel answers throws here.
    kernel: (sources) =>
      kernelPorts(
        {
          trips: useTripStore(),
          tasksOf: () => [],
          myUserId: () => null,
          now: () => Date.parse('2026-07-08T09:00:00'),
          packing: {} as KernelPortDeps['packing'],
          excursions: {} as KernelPortDeps['excursions'],
          comments: {} as KernelPortDeps['comments'],
        },
        sources,
      ),
  })
})

describe('module contributions wiring (FR-32.2, ADR-066)', () => {
  it('gives every module table a reader, and no table two', () => {
    expect(new Set(Object.keys(composition.activityReaders))).toEqual(FEATURE_STORE_TABLES)
  })

  it('leaves the kernel naming exactly the tables no module owns', () => {
    const kernel = new Set(Object.keys(KERNEL_ACTIVITY_AREAS))
    const owned = Object.values(TABLE).filter((t) => !FEATURE_STORE_TABLES.has(t))
    expect(kernel).toEqual(new Set(owned))
  })

  it('answers each single contract once — the planner’s, the shopping list’s', () => {
    expect(composition.ideaLookup).not.toBeNull()
    expect(composition.dayPlanEmpty).not.toBeNull()
    expect(composition.excursionConnections).not.toBeNull()
    expect(composition.excursionJourneyLine).not.toBeNull()
    expect(composition.duePurchases).not.toBeNull()
    expect(Object.keys(composition.viewCounts).sort()).toEqual([
      'excursions',
      'ideas',
      'notes',
      'shopping',
    ])
  })

  it('hands M1 one card per module (FR-29.7, FR-33.7, FR-30.7)', () => {
    expect(composition.tripCards).toHaveLength(FEATURE_MODULES.length)
  })
})
