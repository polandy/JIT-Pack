/**
 * The fold of the modules' contributions (ADR-066 amendment 3): lists in
 * contributor order, kernel first; a record key or a single answer given
 * twice refused; the folded lists handed back lazily, and never while a
 * contributor is still contributing.
 */
import { describe, expect, it } from 'vitest'

import type { DayPlanSource } from '@/domain/shared/dayPlanLine'
import type { ShoppingSource } from '@/kernel/shoppingSources'
import type { FeatureStore, ModuleHost } from '@/sync/featureModule'
import {
  composeModules,
  foldContributions,
  type CompositionHost,
  type FeatureModule,
  type FoldedSources,
  type ModuleContribution,
} from '../moduleContribution'

const source = (name: string) => ({ name }) as unknown as ShoppingSource
const dayPlan = (name: string) => ({ name, lines: () => [] }) as unknown as DayPlanSource

function moduleOf(contribute: (host: CompositionHost) => ModuleContribution): FeatureModule {
  return { featureStore: () => ({ sinks: {} }) as FeatureStore, contribute }
}

function compose(modules: FeatureModule[], kernel: ModuleContribution = {}) {
  let sources: FoldedSources | null = null
  const composition = composeModules(modules, {
    module: {} as ModuleHost,
    today: () => '2026-07-08',
    kernel: (folded) => {
      sources = folded
      return {
        contribution: kernel,
        mealContext: { trips: () => [], excursions: () => [], shortlist: folded.shortlist },
        dayPlanTravelers: () => [],
      }
    },
  })
  return { composition, sources: sources! }
}

describe('foldContributions', () => {
  it('appends each list in contributor order', () => {
    const folded = foldContributions([
      { shoppingSources: [source('packing')] },
      {},
      { shoppingSources: [source('meals')] },
    ])
    expect(folded.shoppingSources.map((s) => (s as unknown as { name: string }).name)).toEqual([
      'packing',
      'meals',
    ])
  })

  it('merges the records, and refuses a key given twice', () => {
    const count = () => 0
    expect(
      foldContributions([{ viewCounts: { ideas: count } }, { viewCounts: { shopping: count } }])
        .viewCounts,
    ).toEqual({ ideas: count, shopping: count })
    expect(() =>
      foldContributions([{ viewCounts: { ideas: count } }, { viewCounts: { ideas: count } }]),
    ).toThrow('viewCounts.ideas is given twice')
  })

  it('takes a single answer from one contributor, null from none, and refuses two', () => {
    const empty = () => true
    expect(foldContributions([{}, { dayPlanEmpty: empty }]).dayPlanEmpty).toBe(empty)
    expect(foldContributions([{}]).dayPlanEmpty).toBeNull()
    expect(() => foldContributions([{ dayPlanEmpty: empty }, { dayPlanEmpty: empty }])).toThrow(
      'dayPlanEmpty is answered twice',
    )
  })
})

describe('composeModules', () => {
  it('folds the kernel first, then the modules in the order given', () => {
    const { composition } = compose(
      [
        moduleOf(() => ({ dayPlanSources: [dayPlan('planner')] })),
        moduleOf(() => ({ dayPlanSources: [dayPlan('meals')] })),
      ],
      { dayPlanSources: [dayPlan('kernel')] },
    )
    expect(composition.dayPlanSources.map((s) => (s as unknown as { name: string }).name)).toEqual([
      'kernel',
      'planner',
      'meals',
    ])
  })

  it('hands a module every contributor’s list once the fold is done — its own included', () => {
    let seen: (() => readonly ShoppingSource[]) | null = null
    compose(
      [
        moduleOf((host) => {
          seen = host.shoppingSources
          return {}
        }),
        moduleOf(() => ({ shoppingSources: [source('meals')] })),
      ],
      { shoppingSources: [source('packing')] },
    )
    expect(seen!()).toHaveLength(2)
  })

  it('refuses a folded list read while a module is still contributing', () => {
    expect(() =>
      compose([
        moduleOf((host) => {
          host.dayPlanSources()
          return {}
        }),
      ]),
    ).toThrow('a folded list read before the fold')
  })

  it('answers the meal plan’s shortlist from every contributor’s, none from no planner', () => {
    const withPlanner = compose([
      moduleOf(() => ({ shortlist: () => [{ id: 'i1', title: 'Seehütte' }] })),
    ])
    expect(withPlanner.composition.mealContext.shortlist('t1')).toEqual([
      { id: 'i1', title: 'Seehütte' },
    ])
    expect(compose([]).sources.shortlist('t1')).toEqual([])
  })
})
