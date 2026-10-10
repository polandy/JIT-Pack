/**
 * The kernel's own side of the module contracts (ADR-066 amendment 3): what
 * the meal plan reads of the trip (§3.33), and the switcher's kernel counts
 * (FR-31.10, FR-7.13) — answered from the reads handed in, and from the
 * folded lists where another contributor's answer counts.
 */
import { describe, expect, it, vi } from 'vitest'

import { ITEM_MODE_BUY_LOCAL } from '@/types/domain'
import type { FoldedSources } from '../moduleContribution'
import { kernelPorts, type KernelPortDeps, type KernelTripReads } from '../kernelPorts'

const TRIP = 't1'

function trips(overrides: Partial<KernelTripReads> = {}): KernelTripReads {
  return {
    tripList: [{ id: TRIP, name: 'Sommer', start_date: '2026-07-01', end_date: '2026-07-14' }],
    getShoppingItems: () => ({ buyBefore: [], buyLocal: [], boughtBefore: [], boughtLocal: [] }),
    getTravelers: () => [],
    getExcursions: () => [],
    getExcursionItems: () => [],
    getExcursionTravelers: () => [],
    getOwnTasks: () => [],
    getRowPrepTasks: () => [],
    getTripComments: () => [],
    getNoteAcks: () => [],
    ...overrides,
  } as KernelTripReads
}

function deps(reads: KernelTripReads): KernelPortDeps {
  return {
    trips: reads,
    tasksOf: () => [],
    myUserId: () => 'u1',
    now: () => Date.parse('2026-07-08T09:00:00'),
    packing: { buyItem: vi.fn(), unbuyItem: vi.fn(), placeOnShopping: vi.fn() },
    excursions: { markBought: vi.fn(), placeLineOnShopping: vi.fn() },
    comments: {
      resolveOwnTask: vi.fn(),
      reopenOwnTask: vi.fn(),
      resolvePrepTask: vi.fn(),
      reopenPrepTask: vi.fn(),
    },
  }
}

const noSources = (shortlist: FoldedSources['shortlist'] = () => []): FoldedSources => ({
  shoppingSources: () => [],
  dayPlanSources: () => [],
  excursionExtraLines: () => [],
  shortlist,
})

describe('kernelPorts — the meal context (§3.33)', () => {
  it('names every trip on the device by its name and dates', () => {
    const { mealContext } = kernelPorts(deps(trips()), noSources())
    expect(mealContext.trips()).toEqual([
      { id: TRIP, name: 'Sommer', start_date: '2026-07-01', end_date: '2026-07-14' },
    ])
  })

  it('offers a picnic only on an excursion that has days', () => {
    const reads = trips({
      getExcursions: () =>
        [
          { id: 'e1', name: 'Gipfel', starts_on: '2026-07-05', ends_on: '2026-07-05' },
          { id: 'e2', name: 'Irgendwann', starts_on: null, ends_on: null },
        ] as never,
    })
    const { mealContext } = kernelPorts(deps(reads), noSources())
    expect(mealContext.excursions(TRIP)).toEqual([
      { id: 'e1', name: 'Gipfel', from: '2026-07-05', to: '2026-07-05' },
    ])
  })

  it('reads the shortlist from the folded contributions, never a store', () => {
    const shortlist = vi.fn(() => [{ id: 'i1', title: 'Seehütte' }])
    const { mealContext } = kernelPorts(deps(trips()), noSources(shortlist))
    expect(mealContext.shortlist(TRIP)).toEqual([{ id: 'i1', title: 'Seehütte' }])
    expect(shortlist).toHaveBeenCalledWith(TRIP)
  })
})

describe('kernelPorts — the contribution', () => {
  it('puts the packing list ahead of the excursions on the shopping list (FR-30.2, FR-31.8)', () => {
    const getShoppingItems = vi.fn(trips().getShoppingItems)
    const getExcursionItems = vi.fn(() => [])
    const { contribution } = kernelPorts(
      deps(trips({ getShoppingItems, getExcursionItems })),
      noSources(),
    )
    expect(contribution.shoppingSources).toHaveLength(2)
    const [packing, excursions] = contribution.shoppingSources!
    packing!.open(TRIP, ITEM_MODE_BUY_LOCAL)
    expect(getShoppingItems).toHaveBeenCalledWith(TRIP)
    expect(getExcursionItems).not.toHaveBeenCalled()
    excursions!.open(TRIP, ITEM_MODE_BUY_LOCAL)
    expect(getExcursionItems).toHaveBeenCalledWith(TRIP)
    expect(contribution.dayPlanSources).toHaveLength(1)
    expect(contribution.ideaResults).toHaveLength(1)
  })

  it('counts nothing new in an empty trip, and no excursion ahead (FR-7.13, FR-31.10)', () => {
    const { contribution } = kernelPorts(deps(trips()), noSources())
    expect(contribution.viewCounts?.notes?.(TRIP)).toBe(0)
    expect(contribution.viewCounts?.excursions?.(TRIP)).toBe(0)
  })

  it('hands the day plan the travellers of the trip (FR-29.15)', () => {
    const travelers = [{ id: 'tr1' }] as never
    const { dayPlanTravelers } = kernelPorts(
      deps(trips({ getTravelers: () => travelers })),
      noSources(),
    )
    expect(dayPlanTravelers(TRIP)).toBe(travelers)
  })
})
